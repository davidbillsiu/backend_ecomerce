const express = require('express');
const bcrypt = require('bcryptjs');
const { sequelize, Usuario, Endereco } = require('../models');
const { gerarToken, autenticar, admin } = require('../middleware/auth');
const { validarCPF, limpar } = require('../utils/cpf');
const { asyncH, HttpError, pick, emailValido, sanitizeUser } = require('../utils/helpers');
const { Op } = require('sequelize');

const r = express.Router();

// ---------- POST /login (público)
r.post('/login', asyncH(async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) throw new HttpError(400, 'Informe e-mail e senha.');
  const u = await Usuario.findOne({ where: { email: String(email).toLowerCase().trim() } });
  if (!u || !u.ativo || !(await bcrypt.compare(senha, u.senha_hash))) throw new HttpError(401, 'E-mail ou senha inválidos.');
  res.json({ token: gerarToken(u), usuario: sanitizeUser(u) });
}));

// ---------- POST /usuarios (público): cadastro de cliente + endereço obrigatório
r.post('/usuarios', asyncH(async (req, res) => {
  const { nome_completo, email, senha, cpf, telefone, endereco } = req.body;
  if (!nome_completo || !email || !senha) throw new HttpError(400, 'Nome, e-mail e senha são obrigatórios.');
  if (!emailValido(email)) throw new HttpError(400, 'E-mail inválido.');
  if (String(senha).length < 6) throw new HttpError(400, 'A senha deve ter ao menos 6 caracteres.');
  if (!validarCPF(cpf)) throw new HttpError(400, 'CPF inválido.');
  const e = endereco || {};
  for (const k of ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado']) {
    if (!e[k]) throw new HttpError(400, `Endereço obrigatório: campo "${k}" ausente.`);
  }
  const mail = String(email).toLowerCase().trim();
  const cpfL = limpar(cpf);
  // verificação prévia de existência
  if (await Usuario.findOne({ where: { email: mail } })) throw new HttpError(409, 'E-mail já cadastrado.');
  if (await Usuario.findOne({ where: { cpf_cnpj: cpfL } })) throw new HttpError(409, 'CPF já cadastrado.');

  const novo = await sequelize.transaction(async (t) => {
    const u = await Usuario.create({
      nome_completo: nome_completo.trim(), email: mail, senha_hash: await bcrypt.hash(senha, 10),
      cpf_cnpj: cpfL, telefone: telefone ? limpar(telefone) : null, tipo_perfil: 'cliente',
    }, { transaction: t });
    await Endereco.create({
      ...pick(e, ['apelido', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade']),
      cep: limpar(e.cep), estado: String(e.estado).toUpperCase().slice(0, 2), usuario_id: u.id, principal: true,
    }, { transaction: t });
    return u;
  });
  res.status(201).json({ usuario: sanitizeUser(novo), token: gerarToken(novo) });
}));

// ---------- GET /usuarios/perfil (privado)
r.get('/usuarios/perfil', autenticar, asyncH(async (req, res) => {
  const u = await Usuario.findByPk(req.usuario.id, { include: [{ model: Endereco, as: 'enderecos' }] });
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  res.json(sanitizeUser(u));
}));

// ---------- GET /usuarios (admin)
r.get('/usuarios', autenticar, admin, asyncH(async (req, res) => {
  const where = req.query.nome ? { nome_completo: { [Op.like]: `%${req.query.nome}%` } } : {};
  const lista = await Usuario.findAll({ where, order: [['id', 'ASC']], attributes: { exclude: ['senha_hash'] } });
  res.json(lista);
}));

r.get('/usuarios/:id', autenticar, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  if (req.usuario.perfil !== 'admin' && req.usuario.id !== id) throw new HttpError(403, 'Acesso restrito.');
  const u = await Usuario.findByPk(id, { include: [{ model: Endereco, as: 'enderecos' }] });
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  res.json(sanitizeUser(u));
}));

// ---------- PUT / PATCH /usuarios/:id (próprio usuário ou admin)
const atualizarUsuario = (parcial) => asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const ehAdmin = req.usuario.perfil === 'admin';
  if (!ehAdmin && req.usuario.id !== id) throw new HttpError(403, 'Você só pode alterar o seu próprio perfil.');
  const u = await Usuario.findByPk(id);
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  const b = req.body;
  if (!parcial) {
    const falta = ['nome_completo', 'email', 'cpf'].filter((k) => !b[k]).concat(b.telefone === undefined ? ['telefone'] : []);
    if (falta.length) throw new HttpError(400, `PUT exige todos os campos: ${falta.join(', ')}`);
  }
  const data = {};
  if (b.nome_completo !== undefined) data.nome_completo = String(b.nome_completo).trim();
  if (b.telefone !== undefined) data.telefone = limpar(b.telefone);
  if (b.email !== undefined) {
    if (!emailValido(b.email)) throw new HttpError(400, 'E-mail inválido.');
    const mail = b.email.toLowerCase().trim();
    const outro = await Usuario.findOne({ where: { email: mail, id: { [Op.ne]: id } } });
    if (outro) throw new HttpError(409, 'E-mail já cadastrado.');
    data.email = mail;
  }
  if (b.cpf !== undefined) {
    if (!validarCPF(b.cpf)) throw new HttpError(400, 'CPF inválido.');
    const c = limpar(b.cpf);
    const outro = await Usuario.findOne({ where: { cpf_cnpj: c, id: { [Op.ne]: id } } });
    if (outro) throw new HttpError(409, 'CPF já cadastrado.');
    data.cpf_cnpj = c;
  }
  if (b.senha) {
    if (String(b.senha).length < 6) throw new HttpError(400, 'A senha deve ter ao menos 6 caracteres.');
    data.senha_hash = await bcrypt.hash(b.senha, 10);
  }
  if (ehAdmin) {
    if (b.tipo_perfil !== undefined) data.tipo_perfil = b.tipo_perfil;
    if (b.ativo !== undefined) data.ativo = !!b.ativo;
  }
  await u.update(data);
  res.json(sanitizeUser(u));
});
r.put('/usuarios/:id', autenticar, atualizarUsuario(false));
r.patch('/usuarios/:id', autenticar, atualizarUsuario(true));

// ---------- DELETE /usuarios/:id (admin) => desativa a conta (preserva histórico de pedidos)
r.delete('/usuarios/:id', autenticar, admin, asyncH(async (req, res) => {
  const u = await Usuario.findByPk(req.params.id);
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  await u.update({ ativo: false });
  res.json({ mensagem: 'Usuário desativado.' });
}));

// ---------- Endereços do usuário logado
const enderecos = express.Router();
const CAMPOS_END = ['apelido', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'principal'];
enderecos.use(autenticar);
enderecos.get('/', asyncH(async (req, res) => res.json(await Endereco.findAll({ where: { usuario_id: req.usuario.id } }))));
enderecos.post('/', asyncH(async (req, res) => {
  const d = pick(req.body, CAMPOS_END);
  for (const k of ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado']) if (!d[k]) throw new HttpError(400, `Campo "${k}" obrigatório.`);
  d.cep = limpar(d.cep); d.estado = String(d.estado).toUpperCase().slice(0, 2);
  const e = await sequelize.transaction(async (t) => {
    if (d.principal) await Endereco.update({ principal: false }, { where: { usuario_id: req.usuario.id }, transaction: t });
    return Endereco.create({ ...d, usuario_id: req.usuario.id }, { transaction: t });
  });
  res.status(201).json(e);
}));
const upEnd = asyncH(async (req, res) => {
  const e = await Endereco.findOne({ where: { id: req.params.id, usuario_id: req.usuario.id } });
  if (!e) throw new HttpError(404, 'Endereço não encontrado.');
  const d = pick(req.body, CAMPOS_END);
  if (d.cep) d.cep = limpar(d.cep);
  if (d.estado) d.estado = String(d.estado).toUpperCase().slice(0, 2);
  if (d.principal) await Endereco.update({ principal: false }, { where: { usuario_id: req.usuario.id } });
  await e.update(d);
  res.json(e);
});
enderecos.put('/:id', upEnd);
enderecos.patch('/:id', upEnd);
enderecos.delete('/:id', asyncH(async (req, res) => {
  const e = await Endereco.findOne({ where: { id: req.params.id, usuario_id: req.usuario.id } });
  if (!e) throw new HttpError(404, 'Endereço não encontrado.');
  await e.destroy();
  res.json({ mensagem: 'Endereço removido.' });
}));

module.exports = { auth: r, enderecos };
