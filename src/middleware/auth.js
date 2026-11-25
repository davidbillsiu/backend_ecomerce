const jwt = require('jsonwebtoken');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

function gerarToken(usuario) {
  return jwt.sign({ id: usuario.id, perfil: usuario.tipo_perfil }, SECRET(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  });
}

// Rotas privadas: exige "Authorization: Bearer <token>". Inválido/ausente/expirado => 401.
function autenticar(req, res, next) {
  const h = req.headers.authorization || '';
  const [tipo, token] = h.split(' ');
  if (tipo !== 'Bearer' || !token) return res.status(401).json({ erro: 'Token ausente. Faça login.' });
  try {
    const p = jwt.verify(token, SECRET());
    req.usuario = { id: p.id, perfil: p.perfil };
    next();
  } catch (e) {
    return res.status(401).json({ erro: e.name === 'TokenExpiredError' ? 'Token expirado.' : 'Token inválido.' });
  }
}

const exigirPerfil = (...perfis) => (req, res, next) =>
  perfis.includes(req.usuario.perfil) ? next() : res.status(403).json({ erro: 'Acesso restrito.' });

module.exports = { gerarToken, autenticar, exigirPerfil, admin: exigirPerfil('admin'), equipe: exigirPerfil('admin', 'logistica') };
