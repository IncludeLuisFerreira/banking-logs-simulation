const authService = require('../services/AuthService');

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  const partes = authHeader.split(' ');
  if (partes.length !== 2 || partes[0] !== 'Bearer') {
    return res.status(401).json({ erro: 'Formato do token inválido. Use: Bearer <token>' });
  }

  const token = partes[1];

  try {
    const decoded = authService.validarToken(token);
    req.usuario = decoded;
    next();
  } catch (erro) {
    return res.status(401).json({ erro: erro.message });
  }
}

module.exports = { autenticar };
