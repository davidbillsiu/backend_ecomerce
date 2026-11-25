const express = require('express');
const { Op } = require('sequelize');
const {
  sequelize, Pedido, ItemPedido, VariacaoSku, Produto, Marca, Endereco, Cupom, Pagamento, Entrega, AgendamentoMontagem, Usuario,
} = require('../models');
const { autenticar, equipe } = require('../middleware/auth');
const { asyncH, HttpError, round2, num } = require('../utils/helpers');

const r = express.Router();
r.use(autenticar);

// ===== Regras de negócio / desconto =====
const FRETE_BASE = 29.9;          // R$ fixo
const FRETE_POR_KG = 1.8;         // R$ por kg (peso x quantidade)
const FRETE_GRATIS_ACIMA = 5000;  // subtotal >= R$ 5.000 => frete grátis
const VALOR_MONTAGEM = 120;       // R$ por unidade com montagem contratada
const DESCONTO_PIX = 0.05;        // 5% no subtotal pagando com Pix
const PRAZO_ENTREGA_DIAS = 7;     // logística (somado ao prazo de produção da marca)

async function calcular({ itens, endereco_entrega_id, cupom_codigo, metodo }, usuarioId, t) {
  if (!Array.isArray(itens) || !itens.length) throw new HttpError(400, 'O carrinho está vazio.');
  const end = await Endereco.findOne({ where: { id: endereco_entrega_id, usuario_id: usuarioId }, transaction: t });
  if (!end) throw new HttpError(400, 'Endereço de entrega inválido.');

  // agrupa por SKU
  const agrupado = new Map();
  for (const it of itens) {
    const q = Number(it.quantidade);
    if (!Number.isInteger(q) || q <= 0) throw new HttpError(400, 'Quantidade inválida.');
    const a = agrupado.get(it.variacao_sku_id) || { variacao_sku_id: it.variacao_sku_id, quantidade: 0, montagem: false };
    a.quantidade += q;
    a.montagem = a.montagem || !!it.incluir_montagem;
    agrupado.set(it.variacao_sku_id, a);
  }

  const linhas = [];
  let subtotal = 0, montagem = 0, peso = 0, prazo = 0;
  for (const a of agrupado.values()) {
    const v = await VariacaoSku.findByPk(a.variacao_sku_id, {
      transaction: t, ...(t && { lock: t.LOCK.UPDATE }),
      include: [{ model: Produto, as: 'produto', include: [{ model: Marca, as: 'marca' }] }],
    });
    if (!v || !v.produto.ativo) throw new HttpError(404, `Produto/variação ${a.variacao_sku_id} indisponível.`);
    if (v.estoque_atual < a.quantidade) {
      throw new HttpError(409, `Estoque insuficiente para "${v.produto.nome} (${v.cor_acabamento})". Disponível: ${v.estoque_atual}.`);
    }
    if (a.montagem && !v.produto.requer_montagem) throw new HttpError(400, `"${v.produto.nome}" não requer montagem.`);
    const preco = num(v.preco_por);
    subtotal += preco * a.quantidade;
    if (a.montagem) montagem += VALOR_MONTAGEM * a.quantidade;
    peso += num(v.peso_kg) * a.quantidade;
    prazo = Math.max(prazo, v.produto.marca.prazo_producao_dias);
    linhas.push({ v, quantidade: a.quantidade, preco, montagem: a.montagem });
  }
  subtotal = round2(subtotal);
  let frete = round2(FRETE_BASE + FRETE_POR_KG * peso);
  const freteGratisRegra = subtotal >= FRETE_GRATIS_ACIMA;
  let desconto = 0;
  const descontos = [];
  if (freteGratisRegra) { desconto += frete; descontos.push({ origem: 'Frete grátis acima de R$ 5.000', valor: frete }); }

  let cupom = null;
  if (cupom_codigo) {
    cupom = await Cupom.findOne({ where: { codigo: String(cupom_codigo).trim().toUpperCase() }, transaction: t });
    const agora = new Date();
    if (!cupom) throw new HttpError(400, 'Cupom inexistente.');
    if (agora < cupom.validade_inicio || agora > cupom.validade_fim) throw new HttpError(400, 'Cupom fora da validade.');
    if (cupom.limite_usos !== null && cupom.usos_atuais >= cupom.limite_usos) throw new HttpError(400, 'Cupom esgotado.');
    if (subtotal < num(cupom.valor_minimo_pedido)) throw new HttpError(400, `Pedido mínimo para o cupom: R$ ${num(cupom.valor_minimo_pedido).toFixed(2)}.`);
    let vc = 0;
    if (cupom.tipo_desconto === 'percentual') vc = subtotal * num(cupom.valor_desconto) / 100;
    else if (cupom.tipo_desconto === 'valor_fixo') vc = Math.min(num(cupom.valor_desconto), subtotal);
    else if (!freteGratisRegra) vc = frete;
    vc = round2(vc);
    if (vc > 0) { desconto += vc; descontos.push({ origem: `Cupom ${cupom.codigo}`, valor: vc }); }
  }
  if (metodo === 'pix') {
    const vp = round2(subtotal * DESCONTO_PIX);
    desconto += vp; descontos.push({ origem: 'Desconto Pix (5%)', valor: vp });
  }
  desconto = round2(Math.min(desconto, subtotal + frete));
  const total = round2(subtotal + frete + montagem - desconto);
  return { end, linhas, cupom, prazo, resumo: { subtotal_produtos: subtotal, valor_frete: frete, valor_montagem: round2(montagem), valor_desconto: desconto, valor_total: total, descontos } };
}

// POST /pedidos/simular — totais do checkout (não grava nada)
r.post('/simular', asyncH(async (req, res) => {
  const c = await calcular({ ...req.body, metodo: req.body.pagamento?.metodo }, req.usuario.id);
  res.json(c.resumo);
}));

// POST /pedidos — registra a venda, cria itens e DEDUZ o estoque (transação)
r.post('/', asyncH(async (req, res) => {
  const { pagamento = {} } = req.body;
  const metodo = pagamento.metodo;
  if (!['cartao_credito', 'pix', 'boleto'].includes(metodo)) throw new HttpError(400, 'Método de pagamento inválido.');
  const parcelas = metodo === 'cartao_credito' ? Math.min(Math.max(parseInt(pagamento.parcelas) || 1, 1), 12) : 1;
  const user = await Usuario.findByPk(req.usuario.id);
  if (!user.cpf_cnpj) throw new HttpError(400, 'Cadastre o CPF/CNPJ no perfil para finalizar a compra.');

  const id = await sequelize.transaction(async (t) => {
    const c = await calcular({ ...req.body, metodo }, req.usuario.id, t);
    const aprovado = metodo === 'cartao_credito'; // simulação de gateway: cartão aprova na hora
    const pedido = await Pedido.create({
      numero_pedido: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      usuario_id: req.usuario.id, endereco_entrega_id: c.end.id, cupom_id: c.cupom?.id || null,
      ...c.resumo, status_pedido: aprovado ? 'pago' : 'aguardando_pagamento',
    }, { transaction: t });
    await pedido.update({ numero_pedido: `#MOV-${new Date().getFullYear()}-${String(pedido.id).padStart(4, '0')}` }, { transaction: t });

    for (const l of c.linhas) {
      await ItemPedido.create({
        pedido_id: pedido.id, variacao_sku_id: l.v.id, quantidade: l.quantidade, preco_unitario_pago: l.preco,
        servico_montagem_contratado: l.montagem, valor_montagem_unitario: l.montagem ? VALOR_MONTAGEM : 0,
      }, { transaction: t });
      await l.v.update({ estoque_atual: l.v.estoque_atual - l.quantidade }, { transaction: t }); // dedução
    }
    if (c.cupom) await c.cupom.update({ usos_atuais: c.cupom.usos_atuais + 1 }, { transaction: t });

    await Pagamento.create({
      pedido_id: pedido.id, metodo, parcelas, valor: c.resumo.valor_total,
      status_pagamento: aprovado ? 'aprovado' : 'pendente', gateway_transacao_id: `SIM-${pedido.id}-${Date.now()}`, pago_em: aprovado ? new Date() : null,
    }, { transaction: t });

    const previsao = new Date(); previsao.setDate(previsao.getDate() + PRAZO_ENTREGA_DIAS + c.prazo);
    await Entrega.create({ pedido_id: pedido.id, previsao_entrega: previsao, status_entrega: 'separacao' }, { transaction: t });
    if (c.linhas.some((l) => l.montagem)) await AgendamentoMontagem.create({ pedido_id: pedido.id }, { transaction: t });
    return pedido.id;
  });
  res.status(201).json(await detalhe(id));
}));

const INCLUDE_DET = [
  { model: ItemPedido, as: 'itens', include: [{ model: VariacaoSku, as: 'variacao', include: [{ model: Produto, as: 'produto', attributes: ['id', 'nome', 'slug'] }] }] },
  { model: Pagamento, as: 'pagamentos' }, { model: Entrega, as: 'entrega' }, { model: AgendamentoMontagem, as: 'montagem' },
  { model: Endereco, as: 'endereco' }, { model: Cupom, as: 'cupom', attributes: ['codigo', 'tipo_desconto'] },
];
const detalhe = (id) => Pedido.findByPk(id, { include: INCLUDE_DET });

// GET /pedidos/meus-pedidos
r.get('/meus-pedidos', asyncH(async (req, res) => {
  res.json(await Pedido.findAll({ where: { usuario_id: req.usuario.id }, include: INCLUDE_DET, order: [['criado_em', 'DESC']] }));
}));

// GET /pedidos (equipe) — todos os pedidos
r.get('/', equipe, asyncH(async (req, res) => {
  const where = req.query.status ? { status_pedido: req.query.status } : {};
  res.json(await Pedido.findAll({ where, include: [...INCLUDE_DET, { model: Usuario, as: 'usuario', attributes: ['id', 'nome_completo', 'email'] }], order: [['criado_em', 'DESC']] }));
}));

r.get('/:id', asyncH(async (req, res) => {
  const p = await detalhe(req.params.id);
  if (!p) throw new HttpError(404, 'Pedido não encontrado.');
  if (p.usuario_id !== req.usuario.id && req.usuario.perfil === 'cliente') throw new HttpError(403, 'Acesso restrito.');
  res.json(p);
}));

async function restaurarEstoque(pedido, t) {
  for (const it of await ItemPedido.findAll({ where: { pedido_id: pedido.id }, transaction: t })) {
    await VariacaoSku.increment({ estoque_atual: it.quantidade }, { where: { id: it.variacao_sku_id }, transaction: t });
  }
  await Pagamento.update({ status_pagamento: 'estornado' }, { where: { pedido_id: pedido.id, status_pagamento: 'aprovado' }, transaction: t });
  await Pagamento.update({ status_pagamento: 'recusado' }, { where: { pedido_id: pedido.id, status_pagamento: 'pendente' }, transaction: t });
}

// PATCH /pedidos/:id/cancelar — cliente (dono) ou equipe; devolve o estoque
r.patch('/:id/cancelar', asyncH(async (req, res) => {
  const p = await Pedido.findByPk(req.params.id);
  if (!p) throw new HttpError(404, 'Pedido não encontrado.');
  if (p.usuario_id !== req.usuario.id && req.usuario.perfil === 'cliente') throw new HttpError(403, 'Acesso restrito.');
  if (!['aguardando_pagamento', 'pago', 'em_separacao'].includes(p.status_pedido)) throw new HttpError(409, `Pedido "${p.status_pedido}" não pode mais ser cancelado.`);
  await sequelize.transaction(async (t) => { await restaurarEstoque(p, t); await p.update({ status_pedido: 'cancelado' }, { transaction: t }); });
  res.json(await detalhe(p.id));
}));

// PATCH /pedidos/:id/status (equipe) — sincroniza pagamento e entrega
const MAPA_ENTREGA = { em_separacao: 'separacao', em_transito: 'em_rota', entregue: 'entregue' };
r.patch('/:id/status', equipe, asyncH(async (req, res) => {
  const { status_pedido } = req.body;
  const validos = Pedido.rawAttributes.status_pedido.values;
  if (!validos.includes(status_pedido)) throw new HttpError(400, `status_pedido deve ser: ${validos.join(', ')}`);
  const p = await Pedido.findByPk(req.params.id);
  if (!p) throw new HttpError(404, 'Pedido não encontrado.');
  if (p.status_pedido === 'cancelado') throw new HttpError(409, 'Pedido já cancelado.');
  await sequelize.transaction(async (t) => {
    if (status_pedido === 'cancelado') await restaurarEstoque(p, t);
    if (status_pedido === 'pago') await Pagamento.update({ status_pagamento: 'aprovado', pago_em: new Date() }, { where: { pedido_id: p.id, status_pagamento: 'pendente' }, transaction: t });
    if (MAPA_ENTREGA[status_pedido]) {
      await Entrega.update({ status_entrega: MAPA_ENTREGA[status_pedido], ...(status_pedido === 'entregue' && { data_entrega_realizada: new Date() }) }, { where: { pedido_id: p.id }, transaction: t });
    }
    if (status_pedido === 'entregue') await AgendamentoMontagem.update({ status_montagem: 'agendado' }, { where: { pedido_id: p.id, status_montagem: 'aguardando_entrega' }, transaction: t });
    await p.update({ status_pedido }, { transaction: t });
  });
  res.json(await detalhe(p.id));
}));

// PATCH /pedidos/:id/entrega e /montagem (equipe)
const camposEntrega = ['transportadora_nome', 'codigo_rastreio', 'url_rastreio', 'previsao_entrega', 'status_entrega'];
r.patch('/:id/entrega', equipe, asyncH(async (req, res) => {
  const e = await Entrega.findOne({ where: { pedido_id: req.params.id } });
  if (!e) throw new HttpError(404, 'Entrega não encontrada.');
  const d = {}; camposEntrega.forEach((k) => req.body[k] !== undefined && (d[k] = req.body[k]));
  await e.update(d);
  res.json(e);
}));
const camposMont = ['nome_montador', 'telefone_montador', 'data_agendada', 'turno', 'status_montagem'];
r.patch('/:id/montagem', equipe, asyncH(async (req, res) => {
  const m = await AgendamentoMontagem.findOne({ where: { pedido_id: req.params.id } });
  if (!m) throw new HttpError(404, 'Este pedido não tem montagem contratada.');
  const d = {}; camposMont.forEach((k) => req.body[k] !== undefined && (d[k] = req.body[k]));
  await m.update(d);
  res.json(m);
}));

module.exports = r;
