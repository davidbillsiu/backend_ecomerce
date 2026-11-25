const express = require('express');
const crud = require('./crud');
const { Categoria, Ambiente, Marca, Cupom } = require('../models');
const { auth, enderecos } = require('./auth');

const r = express.Router();
r.use(auth);                                   // /login, /usuarios...
r.use('/enderecos', enderecos);
r.use('/produtos', require('./produtos'));
r.use('/categorias', crud(Categoria, { label: 'Categoria', fields: ['categoria_pai_id', 'nome', 'slug', 'ativa'], required: ['nome'], slugFrom: 'nome', order: [['nome', 'ASC']] }));
r.use('/ambientes', crud(Ambiente, { label: 'Ambiente', fields: ['nome', 'descricao', 'imagem_banner_url'], required: ['nome'], order: [['nome', 'ASC']] }));
r.use('/marcas', crud(Marca, { label: 'Marca', fields: ['nome', 'cnpj', 'prazo_producao_dias'], required: ['nome'], order: [['nome', 'ASC']] }));
r.use('/cupons', crud(Cupom, { label: 'Cupom', publicRead: false, fields: ['codigo', 'tipo_desconto', 'valor_desconto', 'valor_minimo_pedido', 'validade_inicio', 'validade_fim', 'limite_usos'], required: ['codigo', 'tipo_desconto', 'validade_inicio', 'validade_fim'] }));
r.use('/estoque', require('./estoque'));
r.use('/pedidos', require('./pedidos'));
r.use('/avaliacoes', require('./avaliacoes'));
r.use('/relatorios', require('./relatorios'));

module.exports = r;
