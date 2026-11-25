const express = require('express');
const { Avaliacao, Pedido, ItemPedido, VariacaoSku, Produto, Usuario } = require('../models');
const { autenticar, admin } = require('../middleware/auth');
const { asyncH, HttpError, pick } = require('../utils/helpers');

const r = express.Router();
r.use(autenticar);

// POST /avaliacoes — só quem comprou e recebeu o produto; fica pendente de moderação
r.post('/', asyncH(async (req, res) => {
  const { produto_id, pedido_id, nota_geral, nota_facilidade_montagem, comentario, foto_cliente_url } = req.body;
  const nota = Number(nota_geral);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw new HttpError(400, 'nota_geral deve ser de 1 a 5.');
  const pedido = await Pedido.findOne({ where: { id: pedido_id, usuario_id: req.usuario.id } });
  if (!pedido) throw new HttpError(404, 'Pedido não encontrado.');
  if (pedido.status_pedido !== 'entregue') throw new HttpError(409, 'Você só pode avaliar após a entrega.');
  const comprou = await ItemPedido.findOne({ where: { pedido_id }, include: [{ model: VariacaoSku, as: 'variacao', where: { produto_id }, required: true }] });
  if (!comprou) throw new HttpError(400, 'Este produto não faz parte do pedido.');
  if (await Avaliacao.findOne({ where: { produto_id, pedido_id, usuario_id: req.usuario.id } })) throw new HttpError(409, 'Você já avaliou este produto neste pedido.');
  const a = await Avaliacao.create({ produto_id, pedido_id, usuario_id: req.usuario.id, nota_geral: nota, nota_facilidade_montagem, comentario, foto_cliente_url, aprovado: false });
  res.status(201).json(a);
}));

// Moderação (admin)
r.get('/', admin, asyncH(async (req, res) => {
  const where = req.query.pendentes === '1' ? { aprovado: false } : {};
  res.json(await Avaliacao.findAll({ where, include: [{ model: Produto, as: 'produto', attributes: ['nome'] }, { model: Usuario, as: 'usuario', attributes: ['nome_completo'] }], order: [['criado_em', 'DESC']] }));
}));
r.patch('/:id', admin, asyncH(async (req, res) => {
  const a = await Avaliacao.findByPk(req.params.id);
  if (!a) throw new HttpError(404, 'Avaliação não encontrada.');
  await a.update(pick(req.body, ['aprovado']));
  res.json(a);
}));
r.delete('/:id', admin, asyncH(async (req, res) => {
  const a = await Avaliacao.findByPk(req.params.id);
  if (!a) throw new HttpError(404, 'Avaliação não encontrada.');
  await a.destroy();
  res.json({ mensagem: 'Avaliação removida.' });
}));

module.exports = r;
