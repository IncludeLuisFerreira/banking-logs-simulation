# Sistema de Autenticação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar autenticação JWT (registro, login, middleware) à plataforma banking-simulation com SQLite.

**Architecture:** SQLite via better-sqlite3 (síncrono), bcryptjs para hash, JWT para sessão, Express 5. Nenhuma alteração na lógica de simulação existente.

**Tech Stack:** Node.js (CommonJS), Express 5, better-sqlite3, bcryptjs, jsonwebtoken, Jest

---

## Estrutura de Arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `app/package.json` | Modificar | Adicionar dependências + script `api` |
| `app/src/config/database.js` | Criar | Conexão SQLite, criação da tabela `usuarios` |
| `app/src/model/Usuario.js` | Criar | Classe `Usuario` (id, username, passwordHash, criadoEm) |
| `app/src/services/AuthService.js` | Criar | `registrar()`, `login()`, `gerarToken()`, `validarToken()` |
| `app/src/middleware/auth.js` | Criar | Middleware Express que valida JWT |
| `app/api.js` | Criar | Servidor Express com rotas de auth + simulação |
| `app/__tests__/auth.test.js` | Criar | Testes de registro, login, validação de token |

---

### Task 1: Instalar dependências e configurar package.json

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Adicionar dependências ao package.json**

```json
{
  "dependencies": {
    "express": "^5.2.1",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0",
    "better-sqlite3": "^9.4.0"
  },
  "scripts": {
    "start": "node app.js",
    "test": "jest --coverage",
    "stress": "NUM_CONTAS=10000 NUM_TRANSACOES=50000 node app.js",
    "api": "node api.js"
  }
}
```

- [ ] **Step 2: Instalar pacotes**

Run: `npm install`
Expected: bcryptjs, jsonwebtoken, better-sqlite3 adicionados ao node_modules

- [ ] **Step 3: Commit**

```bash
git add app/package.json app/package-lock.json
git commit -m "chore: add auth dependencies (bcryptjs, jsonwebtoken, better-sqlite3)"
```

---

### Task 2: Criar config/database.js

**Files:**
- Create: `app/src/config/database.js`

- [ ] **Step 1: Escrever database.js**

```javascript
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'banking.db');

let db;

function getDatabase() {
  if (!db) {
    // TODO: adicionar pool de conexões para produção
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    inicializarTabelas();
  }
  return db;
}

function inicializarTabelas() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

module.exports = { getDatabase };
```

- [ ] **Step 2: Criar diretório data/ para o banco**

Run:
```bash
mkdir -p app/data
echo "data/" >> .gitignore
```

- [ ] **Step 3: Commit**

```bash
git add app/src/config/database.js app/.gitignore
git commit -m "feat: add SQLite database config with usuarios table"
```

---

### Task 3: Criar model/Usuario.js

**Files:**
- Create: `app/src/model/Usuario.js`

- [ ] **Step 1: Escrever a classe Usuario**

```javascript
class Usuario {
  constructor(id, username, passwordHash, criadoEm) {
    this.id = id;
    this.username = username;
    this.passwordHash = passwordHash;
    this.criadoEm = criadoEm || new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      criadoEm: this.criadoEm
    };
  }
}

module.exports = Usuario;
```

- [ ] **Step 2: Commit**

```bash
git add app/src/model/Usuario.js
git commit -m "feat: add Usuario model entity"
```

---

### Task 4: Criar services/AuthService.js

**Files:**
- Create: `app/src/services/AuthService.js`

- [ ] **Step 1: Escrever AuthService**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add app/src/services/AuthService.js
git commit -m "feat: add AuthService with register, login, JWT token"
```

---

### Task 5: Criar middleware/auth.js

**Files:**
- Create: `app/src/middleware/auth.js`

- [ ] **Step 1: Escrever middleware de autenticação**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add app/src/middleware/auth.js
git commit -m "feat: add JWT auth middleware"
```

---

### Task 6: Criar api.js (servidor Express)

**Files:**
- Create: `app/api.js`

- [ ] **Step 1: Escrever api.js**

```javascript
const express = require('express');
const authService = require('./src/services/AuthService');
const { autenticar } = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- Rotas de Autenticação ---

app.post('/auth/register', (req, res) => {
  try {
    const { username, password } = req.body;
    const usuario = authService.registrar(username, password);
    res.status(201).json({ id: usuario.id, username: usuario.username });
  } catch (erro) {
    const status = erro.status || 500;
    res.status(status).json({ erro: erro.message });
  }
});

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

app.get('/auth/me', autenticar, (req, res) => {
  try {
    const usuario = authService.buscarPorId(req.usuario.id);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }
    res.json(usuario.toJSON());
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// --- Rotas da Simulação (protegidas) ---

// TODO: adicionar refresh token
// TODO: implementar rate limiting no login
// TODO: adicionar roles (admin, operator)

const Conta = require('./src/model/Conta');
const Transacao = require('./src/model/Transacao');
const GerenciadorTransacoes = require('./src/services/GerenciadorTransacoes');

app.post('/simulacao/iniciar', autenticar, async (req, res) => {
  try {
    const numContas = parseInt(req.body.numContas) || 1000;
    const numTransacoes = parseInt(req.body.numTransacoes) || 5000;
    const saldoInicial = parseInt(req.body.saldoInicial) || 100000;

    const contas = [];
    for (let i = 0; i < numContas; i++) {
      contas.push(new Conta(i, saldoInicial));
    }

    const gerenciador = new GerenciadorTransacoes();

    for (let i = 0; i < numTransacoes; i++) {
      let origemIndex = Math.floor(Math.random() * numContas);
      let destinoIndex = Math.floor(Math.random() * numContas);
      while (origemIndex === destinoIndex) {
        destinoIndex = Math.floor(Math.random() * numContas);
      }
      const origem = contas[origemIndex];
      const destino = contas[destinoIndex];
      const valor = Math.floor(Math.random() * 100000);
      gerenciador.adicionarTransacao(new Transacao(origem, destino, valor));
    }

    const inicio = process.hrtime.bigint();
    gerenciador.start();
    await gerenciador.encerrar();
    const fim = process.hrtime.bigint();

    let somaTotal = 0;
    for (const c of contas) {
      somaTotal += c.getSaldoCentavos();
    }

    const tempoMs = Number(fim - inicio) / 1e6;
    const consistente = Math.abs(somaTotal - (numContas * saldoInicial)) < 0.0001;

    res.json({
      status: consistente ? 'ok' : 'inconsistencia',
      numContas,
      numTransacoes,
      saldoTotal: somaTotal,
      saldoEsperado: numContas * saldoInicial,
      tempoMs: tempoMs.toFixed(2),
      consistente
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.get('/simulacao/resultado', autenticar, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const relatorioPath = path.resolve(__dirname, 'relatorio.txt');

    if (!fs.existsSync(relatorioPath)) {
      return res.status(404).json({ erro: 'Nenhum relatório encontrado. Execute uma simulação primeiro.' });
    }

    const relatorio = fs.readFileSync(relatorioPath, 'utf-8');
    res.type('text/plain').send(relatorio);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// --- Tratamento de Erros Global ---
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Banking Simulation API rodando em http://localhost:${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'desenvolvimento'}`);
});
```

- [ ] **Step 2: Commit**

```bash
git add app/api.js
git commit -m "feat: add Express API with auth and simulation endpoints"
```

---

### Task 7: Escrever testes (auth.test.js)

**Files:**
- Create: `app/__tests__/auth.test.js`

- [ ] **Step 1: Escrever o teste de registro**

```javascript
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
```

- [ ] **Step 2: Executar testes de registro**

Run: `npx jest __tests__/auth.test.js -t "AuthService — Registrar" --no-coverage`
Expected: 4 tests passing

- [ ] **Step 3: Escrever o teste de login**

```javascript
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
```

- [ ] **Step 4: Executar testes de login**

Run: `npx jest __tests__/auth.test.js -t "AuthService — Login" --no-coverage`
Expected: 4 tests passing

- [ ] **Step 5: Escrever teste de validação de token**

```javascript
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
```

- [ ] **Step 6: Executar todos os testes**

Run: `npm test`
Expected: 11 tests passing (4 register + 4 login + 3 token)

- [ ] **Step 7: Commit**

```bash
git add app/__tests__/auth.test.js
git commit -m "test: add auth tests for register, login, and token validation"
```

---

## Testes Manuais (curl)

```bash
# Registrar
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"senha123"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"senha123"}'

# Me (com token)
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer <TOKEN>"

# Simulação protegida
curl -X POST http://localhost:3000/simulacao/iniciar \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"numContas":100,"numTransacoes":500}'

# Relatório
curl http://localhost:3000/simulacao/resultado \
  -H "Authorization: Bearer <TOKEN>"
```

## Como Rodar

```bash
# Instalar dependências
cd app && npm install

# Rodar API
npm run api

# Rodar testes
npm test
```
