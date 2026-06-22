const { RateLimiterMemory } = require('rate-limiter-flexible');

const rateLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
  blockDuration: 60,
});

async function loginLimiter(req, res, next) {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rateLimiterRes) {
    const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(secs));
    console.warn(`[RATE_LIMITER] IP bloqueado: ${req.ip} por ${secs}s`);
    return res.status(429).json({
      erro: 'Muitas tentativas de login. IP bloqueado temporariamente.',
      retryAfterSeconds: secs,
    });
  }
}

module.exports = { loginLimiter, rateLimiter };
