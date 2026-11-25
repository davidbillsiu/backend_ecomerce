// Fábrica de CRUD genérico: GET (lista), GET /:id, POST, PUT (completo), PATCH (parcial), DELETE
const express = require('express');
const { autenticar, admin } = require('../middleware/auth');
const { asyncH, HttpError, pick, slugify } = require('../utils/helpers');

module.exports = function crud(Model, { fields, required = [], publicRead = true, slugFrom, order = [['id', 'ASC']], include = [], label }) {
  const r = express.Router();
  const leitura = publicRead ? [] : [autenticar, admin];

  r.get('/', ...leitura, asyncH(async (req, res) => res.json(await Model.findAll({ order, include }))));

  r.get('/:id', ...leitura, asyncH(async (req, res) => {
    const item = await Model.findByPk(req.params.id, { include });
    if (!item) throw new HttpError(404, `${label} não encontrado(a).`);
    res.json(item);
  }));

  r.post('/', autenticar, admin, asyncH(async (req, res) => {
    const data = pick(req.body, fields);
    if (slugFrom && !data.slug && data[slugFrom]) data.slug = slugify(data[slugFrom]);
    const faltando = required.filter((k) => data[k] === undefined || data[k] === '');
    if (faltando.length) throw new HttpError(400, `Campos obrigatórios: ${faltando.join(', ')}`);
    res.status(201).json(await Model.create(data));
  }));

  const atualizar = (parcial) => asyncH(async (req, res) => {
    const item = await Model.findByPk(req.params.id);
    if (!item) throw new HttpError(404, `${label} não encontrado(a).`);
    const data = pick(req.body, fields);
    if (!parcial) {
      const faltando = required.filter((k) => (data[k] ?? item[k]) === undefined && req.body[k] === undefined);
      const vazios = required.filter((k) => req.body[k] === undefined || req.body[k] === '');
      if (vazios.length || faltando.length) throw new HttpError(400, `PUT exige todos os campos obrigatórios: ${required.join(', ')}`);
    }
    if (slugFrom && data[slugFrom] && !data.slug && !parcial) data.slug = slugify(data[slugFrom]);
    await item.update(data);
    res.json(item);
  });
  r.put('/:id', autenticar, admin, atualizar(false));
  r.patch('/:id', autenticar, admin, atualizar(true));

  r.delete('/:id', autenticar, admin, asyncH(async (req, res) => {
    const item = await Model.findByPk(req.params.id);
    if (!item) throw new HttpError(404, `${label} não encontrado(a).`);
    await item.destroy(); // FK RESTRICT => 409 via error handler
    res.json({ mensagem: `${label} removido(a).` });
  }));

  return r;
};
