const AuthService = require('../src/services/AuthService');

describe('AuthService — Registrar', () => {
  test('deve registrar um novo usuário com sucesso', () => {
    const username = `test_${Date.now()}`;
    const usuario = AuthService.registrar(username, 'senha123');
    expect(usuario).toBeDefined();
    expect(usuario.id).toBeDefined();
    expect(usuario.username).toBe(username);
    expect(usuario.passwordHash).toBeDefined();
    expect(usuario.passwordHash).not.toBe('senha123');
  });

  test('deve rejeitar username vazio', () => {
    expect(() => AuthService.registrar('', 'senha123')).toThrow('Username não pode ser vazio');
  });

  test('deve rejeitar senha menor que 6 caracteres', () => {
    expect(() => AuthService.registrar('test_user', '12345')).toThrow('Senha deve ter no mínimo 6 caracteres');
  });

  test('deve rejeitar username duplicado', () => {
    const username = `dup_${Date.now()}`;
    AuthService.registrar(username, 'senha123');
    expect(() => AuthService.registrar(username, 'outrasenha')).toThrow('Username já está em uso');
  });
});

describe('AuthService — Login', () => {
  const username = `login_test_${Date.now()}`;
  const password = 'minhasenha';

  beforeAll(() => {
    AuthService.registrar(username, password);
  });

  test('deve fazer login com credenciais corretas', () => {
    const resultado = AuthService.login(username, password);
    expect(resultado.token).toBeDefined();
    expect(typeof resultado.token).toBe('string');
    expect(resultado.usuario.username).toBe(username);
  });

  test('deve rejeitar senha incorreta', () => {
    expect(() => AuthService.login(username, 'senhaerrada')).toThrow('Credenciais inválidas');
  });

  test('deve rejeitar username inexistente', () => {
    expect(() => AuthService.login('nao_existe', 'senha123')).toThrow('Credenciais inválidas');
  });

  test('deve rejeitar credenciais vazias', () => {
    expect(() => AuthService.login('', '')).toThrow('Username e senha são obrigatórios');
  });
});

describe('AuthService — Token', () => {
  const username = `token_test_${Date.now()}`;

  beforeAll(() => {
    AuthService.registrar(username, 'senha123');
  });

  test('deve validar um token JWT válido', () => {
    const { token } = AuthService.login(username, 'senha123');
    const decoded = AuthService.validarToken(token);
    expect(decoded.username).toBe(username);
    expect(decoded.id).toBeDefined();
  });

  test('deve rejeitar token inválido', () => {
    expect(() => AuthService.validarToken('token_invalido')).toThrow('Token inválido ou expirado');
  });

  test('deve rejeitar token expirado', () => {
    const jwt = require('jsonwebtoken');
    const tokenExpirado = jwt.sign(
      { id: 1, username: 'test' },
      'dev-secret',
      { expiresIn: '0s' }
    );
    expect(() => AuthService.validarToken(tokenExpirado)).toThrow('Token inválido ou expirado');
  });
});
