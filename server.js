require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./src/models');
const routes = require('./src/routes');

const app = express();
const origens = (process.env.FRONTEND_URL || '*').split(',').map((s) => s.trim().replace(/\/$/, ''));
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || origens.includes('*') || origens.includes(origin)),
}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.json({ api: 'Móveis E-commerce', status: 'online' }));
app.use(routes);

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
// Tratamento central de erros
app.use((err, req, res, next) => { // eslint-disable-line
  const n = err.name || '';
  if (err.status) return res.status(err.status).json({ erro: err.message });
  if (n === 'SequelizeUniqueConstraintError') return res.status(409).json({ erro: 'Registro duplicado: ' + err.errors.map((e) => e.path).join(', ') });
  if (n === 'SequelizeValidationError') return res.status(400).json({ erro: err.errors.map((e) => e.message).join('; ') });
  if (n === 'SequelizeForeignKeyConstraintError') return res.status(409).json({ erro: 'Operação bloqueada: registro relacionado a outros dados.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    console.log('Banco conectado e tabelas sincronizadas (18).');
    if (process.env.SEED_ON_BOOT === 'true') await require('./src/seed')();
    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
  } catch (e) {
    console.error('Falha ao iniciar:', e);
    process.exit(1);
  }
})();
