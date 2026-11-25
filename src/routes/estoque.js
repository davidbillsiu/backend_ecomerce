// Estoque = coluna estoque_atual de variacoes_sku (cada SKU é um item físico de estoque)
const express = require('express');
const { VariacaoSku, Produto } = require('../models');
const { autenticar, equipe } = require('../middleware/auth');
const { asyncH, HttpError } = require('../utils/helpers');

const r = express.Router();
r.use(autenticar, equipe);

r.get('/', asyncH(async (req, res) => {
  const lista = await VariacaoSku.findAll({ include: [{ model: Produto, as: 'produto', attributes: ['id', 'nome', 'ativo'] }], order: [['estoque_atual', 'ASC']] });
  res.json(lista);
}));

// POST /estoque  { variacao_sku_id, tipo: "entrada"|"saida", quantidade }
r.post('/', asyncH(async (req, res) => {
  const { variacao_sku_id, tipo, quantidade } = req.body;
  const q = Number(quantidade);
  if (!['entrada', 'saida'].includes(tipo)) throw new HttpError(400, 'tipo deve ser "entrada" ou "saida".');
  if (!Number.isInteger(q) || q <= 0) throw new HttpError(400, 'quantidade deve ser inteiro positivo.');
  const v = await VariacaoSku.findByPk(variacao_sku_id);
  if (!v) throw new HttpError(404, 'Variação (SKU) não encontrada.');
  if (tipo === 'saida' && v.estoque_atual < q) throw new HttpError(409, `Estoque insuficiente (atual: ${v.estoque_atual}).`);
  await v.update({ estoque_atual: tipo === 'entrada' ? v.estoque_atual + q : v.estoque_atual - q });
  res.status(201).json(v);
}));

// PUT /estoque/:id  { estoque_atual } (ajuste/inventário) — :id = id da variação SKU
r.put('/:id', asyncH(async (req, res) => {
  const v = await VariacaoSku.findByPk(req.params.id);
  if (!v) throw new HttpError(404, 'Variação (SKU) não encontrada.');
  const n = Number(req.body.estoque_atual);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'estoque_atual deve ser inteiro >= 0.');
  await v.update({ estoque_atual: n });
  res.json(v);
}));

module.exports = r;
