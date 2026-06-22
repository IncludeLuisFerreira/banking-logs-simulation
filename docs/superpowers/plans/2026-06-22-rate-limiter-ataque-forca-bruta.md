# Rate Limiter para Ataque de Força Bruta — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar rate limiter na rota de login que bloqueia IP por 60s após 5 tentativas inválidas + script de ataque para testar.

**Architecture:** Middleware Express com `rate-limiter-flexible` (RateLimiterMemory) que consome 1 ponto por tentativa de login. Se login for bem-sucedido, reseta o contador do IP. Script de ataque externo usa http/https nativo do Node.

**Tech Stack:** Node.js 20+, Express 5, rate-limiter-flexible ~2.5.x, Jest 30

---

### Task 1: Instalar dependência

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Adicionar rate-limiter-flexible ao package.json**

```bash
cd /home/includeluisferreira/Documentos/trabalhos_acadêmicos/projetos/redes/lab-observabilidade_2/app && npm install rate-limiter-flexible
```

Run: `npm install rate-limiter-flexible` no diretório `app/`

---

### Task 2: Criar middleware rateLimiter.js

**Files:**
- Create: `app/src/middleware/rateLimiter.js`
- Test: `app/__tests__/rateLimiter.test.js`

- [ ] **Step 1: Escrever o teste do rate limiter**

```javascript
// app/__tests__/rateLimiter.test.js
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
    // Use the real rateLimiter from the module
    await rateLimiter.delete('192.168.1.100'); // ensure clean
    await loginLimiter(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('middleware deve retornar 429 se IP exceder limite', async () => {
    const ip = '192.168.1.200';
    // Consume all points
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
```

- [ ] **Step 2: Rodar teste para verificar que falha**

Run: `cd /home/includeluisferreira/Documentos/trabalhos_acadêmicos/projetos/redes/lab-observabilidade_2/app && npx jest __tests__/rateLimiter.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../src/middleware/rateLimiter'"

- [ ] **Step 3: Criar o middleware**

```javascript
// app/src/middleware/rateLimiter.js
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
```

- [ ] **Step 4: Rodar teste para verificar que passa**

Run: `cd /home/includeluisferreira/Documentos/trabalhos_acadêmicos/projetos/redes/lab-observabilidade_2/app && npx jest __tests__/rateLimiter.test.js --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/middleware/rateLimiter.js app/__tests__/rateLimiter.test.js app/package.json app/package-lock.json
git commit -m "feat: add rate limiter middleware for login brute-force protection"
```

---

### Task 3: Separar inicialização do servidor para testes

**Files:**
- Modify: `app/app.js`

- [ ] **Step 1: Escrever teste integrado da rota de login com rate limiter**

```javascript
// app/__tests__/loginRoute.test.js
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
```

- [ ] **Step 2: Rodar teste para verificar que falha (supertest não instalado + app.listen conflita)**

Run: `cd /home/includeluisferreira/Documentos/trabalhos_acadêmicos/projetos/redes/lab-observabilidade_2/app && npx jest __tests__/loginRoute.test.js --no-coverage`
Expected: FAIL — "Cannot find module 'supertest'"

- [ ] **Step 3: Instalar supertest**

```bash
cd /home/includeluisferreira/Documentos/trabalhos_acadêmicos/projetos/redes/lab-observabilidade_2/app && npm install --save-dev supertest
```

- [ ] **Step 4: Modificar app.js — exportar app e conditional listen**

Substituir o final de `app.js` (linhas 175-178):
```javascript
app.listen(PORT, () => {
  console.log(`Banking Simulation API rodando em http://localhost:${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'desenvolvimento'}`);
});
```

Por:
```javascript
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Banking Simulation API rodando em http://localhost:${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'desenvolvimento'}`);
  });
}

module.exports = app;
```

- [ ] **Step 5: Adicionar imports do rate limiter em app.js**

Adicionar no topo de `app.js` (após linha 3, junto dos outros imports):
```javascript
const { loginLimiter, rateLimiter } = require('./src/middleware/rateLimiter');
```

- [ ] **Step 6: Modificar a rota POST /auth/login para usar o loginLimiter**

Substituir (linhas 25-34):
```javascript
app.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const resultado = authService.login(username, password);
    res.json({ token: resultado.token, username: resultado.usuario.username });
  } catch (erro) {
    const status = erro.status || 500;
    res.status(status).json({ erro: erro.message });
  }
});
```

Por:
```javascript
app.post('/auth/login', loginLimiter, (req, res) => {
  try {
    const { username, password } = req.body;
    const resultado = authService.login(username, password);
    rateLimiter.delete(req.ip);
    res.json({ token: resultado.token, username: resultado.usuario.username });
  } catch (erro) {
    const status = erro.status || 500;
    res.status(status).json({ erro: erro.message });
  }
});
```

- [ ] **Step 7: Rodar teste para verificar que passa**

Run: `cd /home/includeluisferreira/Documentos/trabalhos_acadêmicos/projetos/redes/lab-observabilidade_2/app && npx jest __tests__/loginRoute.test.js --no-coverage`
Expected: PASS

- [ ] **Step 8: Rodar todos os testes para garantir que nada quebrou**

Run: `cd /home/includeluisferreira/Documentos/trabalhos_acadêmicos/projetos/redes/lab-observabilidade_2/app && npm test`
Expected: Todos PASS

- [ ] **Step 9: Commit**

```bash
git add app/app.js app/__tests__/loginRoute.test.js app/package.json app/package-lock.json
git commit -m "feat: apply rate limiter middleware to login route"
```

> **Nota:** Ao rodar `npm start` (que faz `node app.js`), o `require.main === module` é verdadeiro e o servidor escuta normalmente. Nos testes, como `app.js` é importado via `require`, ele apenas exporta o app sem iniciar o listener.

---

### Task 4: Criar script de ataque

**Files:**
- Create: `scripts/attack.js`

- [ ] **Step 1: Criar scripts/attack.js**

```javascript
#!/usr/bin/env node
// scripts/attack.js — Script de simulação de ataque de força bruta
// Uso: node scripts/attack.js <url> [username]

const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Uso: node scripts/attack.js <url> [username]');
  console.error('Exemplo: node scripts/attack.js http://localhost:3000 admin');
  process.exit(1);
}

const baseUrl = args[0].replace(/\/+$/, '');
const username = args[1] || 'admin';
const totalTentativas = 20;

function gerarSenha() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let senha = '';
  for (let i = 0; i < 8; i++) {
    senha += chars[Math.floor(Math.random() * chars.length)];
  }
  return senha;
}

function fazerRequisicao(tentativa) {
  return new Promise((resolve) => {
    const urlObj = new URL(`${baseUrl}/auth/login`);
    const data = JSON.stringify({ username, password: gerarSenha() });
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          body = JSON.parse(body);
        } catch (_) {}
        resolve({ status: res.statusCode, body, tentativa });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, body: { erro: err.message }, tentativa });
    });

    req.write(data);
    req.end();
  });
}

(async () => {
  console.log(`=== Ataque de Força Bruta ===`);
  console.log(`Alvo: ${baseUrl}`);
  console.log(`Usuário: ${username}`);
  console.log(`Tentativas: ${totalTentativas}`);
  console.log('');

  let total401 = 0;
  let total429 = 0;
  let total200 = 0;
  let bloqueado = false;

  for (let i = 1; i <= totalTentativas; i++) {
    const resultado = await fazerRequisicao(i);

    if (resultado.status === 429) {
      total429++;
      bloqueado = true;
      console.log(`[${i}] BLOQUEADO (429) — ${resultado.body.erro || ''} — retryAfter: ${resultado.body.retryAfterSeconds || '?'}s`);
      break;
    } else if (resultado.status === 401) {
      total401++;
      console.log(`[${i}] INVÁLIDO (401) — ${resultado.body.erro || ''}`);
    } else if (resultado.status === 200) {
      total200++;
      console.log(`[${i}] SUCESSO (200) — token: ${(resultado.body.token || '').substring(0, 20)}...`);
    } else {
      console.log(`[${i}] ERRO (${resultado.status}) — ${JSON.stringify(resultado.body)}`);
    }
  }

  console.log('');
  console.log('=== Resumo ===');
  console.log(`Tentativas: ${total401 + total429 + total200}`);
  console.log(`401 (inválido): ${total401}`);
  console.log(`429 (bloqueado): ${total429}`);
  console.log(`200 (sucesso): ${total200}`);
  if (bloqueado) {
    console.log(`Status: BLOQUEADO — aguarde 60s para nova tentativa`);
  } else {
    console.log(`Status: NÃO BLOQUEADO`);
  }
})();
```

- [ ] **Step 2: Verificar que o script funciona localmente**

Primeiro ligar o servidor:
```bash
cd /home/includeluisferreira/Documentos/trabalhos_acadêmicos/projetos/redes/lab-observabilidade_2/app && node app.js &
sleep 2
```

Rodar ataque:
```bash
node /home/includeluisferreira/Documentos/trabalhos_acadêmicos/projetos/redes/lab-observabilidade_2/scripts/attack.js http://localhost:3000 admin
```

Expected: Primeiras 5 tentativas retornam 401, 6a retorna 429, script para.

```bash
kill %1 2>/dev/null
```

- [ ] **Step 3: Commit**

```bash
git add scripts/attack.js
git commit -m "feat: add brute-force attack simulation script"
```

---

### Task 5: Rodar suite completa de testes

- [ ] **Step 1: Rodar npm test**

```bash
cd /home/includeluisferreira/Documentos/trabalhos_acadêmicos/projetos/redes/lab-observabilidade_2/app && npm test
```

Expected: Todos os testes passando (auth, deadlock detector, rate limiter).

- [ ] **Step 2: Commit final**

```bash
git add -A
git commit -m "chore: final adjustments and test fixes"
```
