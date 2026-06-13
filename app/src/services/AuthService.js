const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../config/database');
const Usuario = require('../model/Usuario');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = '24h';
const SALT_ROUNDS = 10;

class AuthService {

  // TODO: adicionar rate limiting no login
  // TODO: log de tentativas de login falhas

  registrar(username, password) {
    if (!username || username.trim().length === 0) {
      const err = new Error('Username não pode ser vazio');
      err.status = 400;
      throw err;
    }

    if (!password || password.length < 6) {
      const err = new Error('Senha deve ter no mínimo 6 caracteres');
      err.status = 400;
      throw err;
    }

    const db = getDatabase();

    const usernameExistente = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(username);
    if (usernameExistente) {
      const err = new Error('Username já está em uso');
      err.status = 409;
      throw err;
    }

    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    const result = db.prepare(
      'INSERT INTO usuarios (username, password_hash) VALUES (?, ?)'
    ).run(username, passwordHash);

    return new Usuario(result.lastInsertRowid, username, passwordHash);
  }

  login(username, password) {
    if (!username || !password) {
      const err = new Error('Username e senha são obrigatórios');
      err.status = 400;
      throw err;
    }

    const db = getDatabase();
    const row = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username);

    if (!row) {
      const err = new Error('Credenciais inválidas');
      err.status = 401;
      throw err;
    }

    const senhaValida = bcrypt.compareSync(password, row.password_hash);
    if (!senhaValida) {
      const err = new Error('Credenciais inválidas');
      err.status = 401;
      throw err;
    }

    const usuario = new Usuario(row.id, row.username, row.password_hash, row.created_at);
    const token = this.gerarToken(usuario);

    return { token, usuario };
  }

  gerarToken(usuario) {
    return jwt.sign(
      { id: usuario.id, username: usuario.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  validarToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return decoded;
    } catch (erro) {
      const err = new Error('Token inválido ou expirado');
      err.status = 401;
      throw err;
    }
  }

  buscarPorId(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!row) return null;
    return new Usuario(row.id, row.username, row.password_hash, row.created_at);
  }
}

module.exports = new AuthService();
