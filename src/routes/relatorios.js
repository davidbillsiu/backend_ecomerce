const express = require('express');
const { sequelize } = require('../models');
const { autenticar, equipe } = require('../middleware/auth');
const { asyncH } = require('../utils/helpers');

const r = express.Router();
r.use(autenticar, equipe);
const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
const VALIDOS = "('pago','em_separacao','em_transito','entregue')";

// GET /relatorios/vendas — faturamento mensal + vendas por categoria (alimenta os 2 gráficos)
r.get('/vendas', asyncH(async (req, res) => {
  const mensal = await q(`SELECT DATE_FORMAT(criado_em,'%Y-%m') AS mes, COUNT(*) AS pedidos, ROUND(SUM(valor_total),2) AS faturamento
    FROM pedidos WHERE status_pedido IN ${VALIDOS} GROUP BY mes ORDER BY mes`);
  const porCategoria = await q(`SELECT c.nome AS categoria, SUM(i.quantidade) AS quantidade, ROUND(SUM(i.quantidade*i.preco_unitario_pago),2) AS faturamento
    FROM itens_pedido i JOIN pedidos p ON p.id=i.pedido_id JOIN variacoes_sku v ON v.id=i.variacao_sku_id
    JOIN produtos pr ON pr.id=v.produto_id JOIN categorias c ON c.id=pr.categoria_id
    WHERE p.status_pedido IN ${VALIDOS} GROUP BY c.id, c.nome ORDER BY faturamento DESC`);
  const [tot] = await q(`SELECT COUNT(*) AS pedidos, COALESCE(ROUND(SUM(valor_total),2),0) AS faturamento FROM pedidos WHERE status_pedido IN ${VALIDOS}`);
  res.json({ faturamento_mensal: mensal.map((m) => ({ ...m, pedidos: Number(m.pedidos), faturamento: Number(m.faturamento) })),
    vendas_por_categoria: porCategoria.map((c) => ({ ...c, quantidade: Number(c.quantidade), faturamento: Number(c.faturamento) })),
    totais: { pedidos: Number(tot.pedidos), faturamento: Number(tot.faturamento) } });
}));

// GET /relatorios/estoque — estoque por categoria + itens críticos
r.get('/estoque', asyncH(async (req, res) => {
  const porCategoria = await q(`SELECT c.nome AS categoria, COUNT(v.id) AS skus, COALESCE(SUM(v.estoque_atual),0) AS unidades,
      COALESCE(ROUND(SUM(v.estoque_atual*v.preco_por),2),0) AS valor_em_estoque
    FROM categorias c JOIN produtos p ON p.categoria_id=c.id JOIN variacoes_sku v ON v.produto_id=p.id GROUP BY c.id, c.nome ORDER BY unidades DESC`);
  const criticos = await q(`SELECT v.id, v.sku_codigo, p.nome AS produto, v.cor_acabamento, v.estoque_atual FROM variacoes_sku v
    JOIN produtos p ON p.id=v.produto_id WHERE v.estoque_atual <= :lim ORDER BY v.estoque_atual ASC LIMIT 20`, { lim: Number(req.query.limite) || 3 });
  res.json({ por_categoria: porCategoria.map((c) => ({ ...c, skus: Number(c.skus), unidades: Number(c.unidades), valor_em_estoque: Number(c.valor_em_estoque) })), criticos });
}));

module.exports = r;
