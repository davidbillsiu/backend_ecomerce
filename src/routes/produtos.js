const express = require('express');
const { Op } = require('sequelize');
const { sequelize, Produto, Categoria, Marca, Ambiente, VariacaoSku, ImagemProduto, ProdutoAmbiente, ItemPedido, Avaliacao, Usuario } = require('../models');
const { autenticar, admin } = require('../middleware/auth');
const { asyncH, HttpError, pick, slugify, num } = require('../utils/helpers');

const r = express.Router();
const CAMPOS = ['categoria_id', 'marca_id', 'nome', 'slug', 'descricao_detalhada', 'material_principal', 'requer_montagem', 'manual_montagem_pdf_url', 'garantia_meses', 'ativo'];
const CAMPOS_VAR = ['sku_codigo', 'cor_acabamento', 'revestimento_tecido', 'preco_de', 'preco_por', 'altura_cm', 'largura_cm', 'profundidade_cm', 'peso_kg', 'quantidade_volumes', 'estoque_atual'];
const INCLUDE = [
  { model: Categoria, as: 'categoria', attributes: ['id', 'nome', 'slug'] },
  { model: Marca, as: 'marca', attributes: ['id', 'nome', 'prazo_producao_dias'] },
  { model: Ambiente, as: 'ambientes', attributes: ['id', 'nome'], through: { attributes: [] } },
  { model: VariacaoSku, as: 'variacoes' },
  { model: ImagemProduto, as: 'imagens' },
];

// campos derivados úteis para os cards do frontend
function formatar(p) {
  const j = p.toJSON();
  const v = j.variacoes || [];
  const precos = v.map((x) => num(x.preco_por));
  j.preco_min = precos.length ? Math.min(...precos) : null;
  j.preco_de_ref = v.find((x) => num(x.preco_por) === j.preco_min)?.preco_de || null;
  j.estoque_total = v.reduce((a, x) => a + x.estoque_atual, 0);
  (j.imagens || []).sort((a, b) => a.ordem_exibicao - b.ordem_exibicao);
  j.imagem_principal = j.imagens?.[0]?.url_imagem || null;
  return j;
}

async function idsCategoria(ref) {
  const todas = await Categoria.findAll({ attributes: ['id', 'slug', 'categoria_pai_id'] });
  const raiz = todas.find((c) => String(c.id) === String(ref) || c.slug === ref);
  if (!raiz) return [];
  const ids = [raiz.id];
  for (let i = 0; i < ids.length; i++) todas.filter((c) => c.categoria_pai_id === ids[i]).forEach((c) => ids.push(c.id));
  return ids;
}

// Listagem / busca (público). Filtros: nome|q, categoria (id ou slug), ambiente, marca, sku, min, max
async function listar(req, res) {
  const { nome, q, categoria, ambiente, marca, sku, min, max, todos } = req.query;
  const where = {};
  const termo = nome || q;
  if (termo) where.nome = { [Op.like]: `%${termo}%` };
  if (todos !== '1') where.ativo = true;
  if (categoria) where.categoria_id = { [Op.in]: await idsCategoria(categoria) };
  if (marca) where.marca_id = marca;
  const inc = INCLUDE.map((i) => ({ ...i }));
  if (ambiente) inc.find((i) => i.as === 'ambientes').where = { id: ambiente };
  if (sku) inc.find((i) => i.as === 'variacoes').where = { sku_codigo: { [Op.like]: `%${sku}%` } };
  const lista = (await Produto.findAll({ where, include: inc, order: [['nome', 'ASC']] })).map(formatar);
  const filtrada = lista.filter((p) => (min ? p.preco_min >= num(min) : true) && (max ? p.preco_min <= num(max) : true));
  res.json(filtrada);
}
r.get('/', asyncH(listar));
r.get('/buscar', asyncH(listar));

r.get('/:id', asyncH(async (req, res) => {
  const where = /^\d+$/.test(req.params.id) ? { id: req.params.id } : { slug: req.params.id };
  const p = await Produto.findOne({ where, include: INCLUDE });
  if (!p || (!p.ativo && !req.query.todos)) throw new HttpError(404, 'Produto não encontrado.');
  res.json(formatar(p));
}));

// Avaliações aprovadas de um produto (público)
r.get('/:id/avaliacoes', asyncH(async (req, res) => {
  const lista = await Avaliacao.findAll({
    where: { produto_id: req.params.id, aprovado: true },
    include: [{ model: Usuario, as: 'usuario', attributes: ['nome_completo'] }], order: [['criado_em', 'DESC']],
  });
  const media = lista.length ? lista.reduce((a, x) => a + x.nota_geral, 0) / lista.length : null;
  res.json({ media, total: lista.length, avaliacoes: lista });
}));

// ---------- Gestão do catálogo (admin)
async function validarRefs(d) {
  if (d.categoria_id !== undefined && !(await Categoria.findByPk(d.categoria_id))) throw new HttpError(400, 'Categoria inexistente.');
  if (d.marca_id !== undefined && !(await Marca.findByPk(d.marca_id))) throw new HttpError(400, 'Marca inexistente.');
}
async function gravarFilhos(p, body, t) {
  if (Array.isArray(body.ambientes_ids)) {
    const amb = await Ambiente.findAll({ where: { id: body.ambientes_ids } });
    await p.setAmbientes(amb, { transaction: t });
  }
  if (Array.isArray(body.variacoes)) {
    for (const v of body.variacoes) {
      const d = pick(v, CAMPOS_VAR);
      if (v.id) {
        const ex = await VariacaoSku.findOne({ where: { id: v.id, produto_id: p.id }, transaction: t });
        if (!ex) throw new HttpError(404, `Variação ${v.id} não pertence a este produto.`);
        await ex.update(d, { transaction: t });
      } else {
        const dup = await VariacaoSku.findOne({ where: { sku_codigo: d.sku_codigo || '' }, transaction: t });
        if (dup) throw new HttpError(409, `SKU "${d.sku_codigo}" já existe.`);
        await VariacaoSku.create({ ...d, produto_id: p.id }, { transaction: t });
      }
    }
  }
  if (Array.isArray(body.imagens)) {
    await ImagemProduto.destroy({ where: { produto_id: p.id }, transaction: t });
    await ImagemProduto.bulkCreate(body.imagens.map((i, n) => ({ ...pick(i, ['url_imagem', 'alt_text', 'variacao_sku_id']), ordem_exibicao: i.ordem_exibicao ?? n, produto_id: p.id })), { transaction: t });
  }
}
const completo = async (id) => formatar(await Produto.findByPk(id, { include: INCLUDE }));

r.post('/', autenticar, admin, asyncH(async (req, res) => {
  const d = pick(req.body, CAMPOS);
  const falta = ['categoria_id', 'marca_id', 'nome', 'material_principal'].filter((k) => !d[k]);
  if (falta.length) throw new HttpError(400, `Campos obrigatórios: ${falta.join(', ')}`);
  if (!Array.isArray(req.body.variacoes) || !req.body.variacoes.length) throw new HttpError(400, 'Informe ao menos uma variação (SKU).');
  await validarRefs(d);
  d.slug = d.slug ? slugify(d.slug) : slugify(d.nome);
  if (await Produto.findOne({ where: { slug: d.slug } })) throw new HttpError(409, 'Já existe produto com este slug/nome.');
  const id = await sequelize.transaction(async (t) => {
    const p = await Produto.create(d, { transaction: t });
    await gravarFilhos(p, req.body, t);
    return p.id;
  });
  res.status(201).json(await completo(id));
}));

const atualizar = (parcial) => asyncH(async (req, res) => {
  const p = await Produto.findByPk(req.params.id);
  if (!p) throw new HttpError(404, 'Produto não encontrado.'); // existência prévia
  const d = pick(req.body, CAMPOS);
  if (!parcial) {
    const falta = ['categoria_id', 'marca_id', 'nome', 'material_principal'].filter((k) => !req.body[k]);
    if (falta.length) throw new HttpError(400, `PUT exige todos os campos: ${falta.join(', ')}`);
    if (!d.slug) d.slug = slugify(d.nome);
  }
  if (d.slug) {
    d.slug = slugify(d.slug);
    if (await Produto.findOne({ where: { slug: d.slug, id: { [Op.ne]: p.id } } })) throw new HttpError(409, 'Slug já em uso.');
  }
  await validarRefs(d);
  await sequelize.transaction(async (t) => { await p.update(d, { transaction: t }); await gravarFilhos(p, req.body, t); });
  res.json(await completo(p.id));
});
r.put('/:id', autenticar, admin, atualizar(false));
r.patch('/:id', autenticar, admin, atualizar(true));

r.delete('/:id', autenticar, admin, asyncH(async (req, res) => {
  const p = await Produto.findByPk(req.params.id, { include: [{ model: VariacaoSku, as: 'variacoes' }] });
  if (!p) throw new HttpError(404, 'Produto não encontrado.');
  const skus = p.variacoes.map((v) => v.id);
  const vendido = skus.length && (await ItemPedido.count({ where: { variacao_sku_id: skus } }));
  if (vendido) { // preserva o histórico de pedidos: apenas inativa
    await p.update({ ativo: false });
    return res.json({ mensagem: 'Produto possui vendas e foi inativado (não aparece mais na loja).' });
  }
  await sequelize.transaction(async (t) => {
    await ProdutoAmbiente.destroy({ where: { produto_id: p.id }, transaction: t });
    await p.destroy({ transaction: t });
  });
  res.json({ mensagem: 'Produto removido.' });
}));

module.exports = r;
