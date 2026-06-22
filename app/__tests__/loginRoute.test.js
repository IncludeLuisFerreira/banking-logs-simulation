const request = require('supertest');

describe('POST /auth/login — rate limiting', () => {
  let app;

  beforeAll(() => {
    jest.resetModules();
    jest.isolateModules(() => {
      app = require('../app');
    });
  });

  function postLogin(body) {
    return request(app).post('/auth/login').send(body);
  }

  test('deve retornar 401 para credenciais inválidas', async () => {
    const res = await postLogin({ username: 'inexistente', password: 'errada' });
    expect(res.status).toBe(401);
  });

  test('deve retornar 200 para credenciais válidas', async () => {
    const res = await postLogin({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });
});
