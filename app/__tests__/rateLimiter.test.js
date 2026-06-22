const { RateLimiterMemory } = require('rate-limiter-flexible');

describe('RateLimiter — loginLimiter middleware', () => {
  let rateLimiter;
  let loginLimiter;

  beforeAll(() => {
    jest.resetModules();
    jest.isolateModules(() => {
      const mod = require('../src/middleware/rateLimiter');
      loginLimiter = mod.loginLimiter;
      rateLimiter = mod.rateLimiter;
    });
  });

  function createReqRes(ip) {
    const req = { ip };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
    return { req, res, next };
  }

  test('deve permitir requisição dentro do limite', async () => {
    const rateLimiterTest = new RateLimiterMemory({ points: 5, duration: 60, blockDuration: 60 });
    await expect(rateLimiterTest.consume('192.168.1.1')).resolves.toBeDefined();
  });

  test('deve consumir pontos do rate limiter', async () => {
    const rateLimiterTest = new RateLimiterMemory({ points: 2, duration: 60, blockDuration: 60 });
    await rateLimiterTest.consume('10.0.0.1');
    const res = await rateLimiterTest.get('10.0.0.1');
    expect(res.consumedPoints).toBe(1);
  });

  test('deve bloquear após exceder pontos', async () => {
    const rateLimiterTest = new RateLimiterMemory({ points: 2, duration: 60, blockDuration: 60 });
    await rateLimiterTest.consume('10.0.0.2');
    await rateLimiterTest.consume('10.0.0.2');
    await expect(rateLimiterTest.consume('10.0.0.2')).rejects.toHaveProperty('msBeforeNext');
  });

  test('middleware deve chamar next() se IP não estiver bloqueado', async () => {
    const { req, res, next } = createReqRes('192.168.1.100');
    await rateLimiter.delete('192.168.1.100');
    await loginLimiter(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('middleware deve retornar 429 se IP exceder limite', async () => {
    const ip = '192.168.1.200';
    for (let i = 0; i < 5; i++) {
      await rateLimiter.consume(ip);
    }
    const { req, res, next } = createReqRes(ip);
    await loginLimiter(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ erro: expect.any(String) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('deve resetar contador com delete()', async () => {
    const rateLimiterTest = new RateLimiterMemory({ points: 2, duration: 60, blockDuration: 60 });
    await rateLimiterTest.consume('10.0.0.3');
    await rateLimiterTest.delete('10.0.0.3');
    await expect(rateLimiterTest.consume('10.0.0.3')).resolves.toBeDefined();
  });
});
