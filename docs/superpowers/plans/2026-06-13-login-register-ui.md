# Login + Cadastro UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement login register link, registration page, dashboard placeholder, and admin seed script.

**Architecture:** Three new static HTML+JS pages served by Express from `public/`, plus a seed script in `scripts/`. No backend changes needed — auth routes already exist.

**Tech Stack:** Express static files, vanilla JS fetch, bcryptjs (seed), SQLite

---

### Task 1: Add "Cadastre-se" link to login page

**Files:**
- Modify: `app/public/index.html`
- Modify: `app/public/js/login.js`

- [ ] **Step 1: Add register link below the form in index.html**

After the closing `</form>` tag and before the feedback div, add a register link:

Edit `app/public/index.html`. After line 72 (`</form>`) and before line 74 (`<div class="feedback"`), add:

```html
      <p class="login-card__register">
        Ainda não tem conta? <a href="register.html" class="form-link">Cadastre-se</a>
      </p>
```

- [ ] **Step 2: Add style for the register link**

Edit `app/public/css/login.css`. Before the `.feedback` block (around line 247), add:

```css
.login-card__register {
  text-align: center;
  margin-top: 1.25rem;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Update login.js to redirect to dashboard after success**

The redirect in `login.js:122` already points to `/dashboard.html`. No change needed — this already works.

- [ ] **Step 4: Run existing tests to ensure nothing broke**

```bash
cd app && npm test
```
Expected: all auth tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/public/index.html app/public/css/login.css
git commit -m "feat: add Cadastre-se link to login page"
```

---

### Task 2: Create registration page (register.html)

**Files:**
- Create: `app/public/register.html`

- [ ] **Step 1: Create register.html**

Same visual style as `index.html`. Form with username, password, confirm password. Posts to `/auth/register`. Link back to login.

Write `app/public/register.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Banking Simulation — Cadastro</title>
  <link rel="stylesheet" href="css/login.css">
</head>
<body>

  <main class="login-page">
    <section class="login-card" id="registerCard">
      <header class="login-card__header">
        <div class="login-card__icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 1L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 1Z"
                  stroke="#0d47a1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <path d="M12 7V13" stroke="#0d47a1" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="16" r="1" fill="#0d47a1"/>
          </svg>
        </div>
        <h1 class="login-card__title">Criar Conta</h1>
        <p class="login-card__subtitle">Preencha os dados para se cadastrar</p>
      </header>

      <form class="login-form" id="registerForm" novalidate>
        <div class="form-group">
          <label class="form-label" for="regUsername">Usuário</label>
          <input
            class="form-input"
            type="text"
            id="regUsername"
            name="username"
            placeholder="Escolha um usuário"
            autocomplete="username"
            required
          >
        </div>

        <div class="form-group">
          <label class="form-label" for="regPassword">Senha</label>
          <input
            class="form-input"
            type="password"
            id="regPassword"
            name="password"
            placeholder="Mínimo de 6 caracteres"
            autocomplete="new-password"
            required
            minlength="6"
          >
        </div>

        <div class="form-group">
          <label class="form-label" for="regConfirm">Confirmar Senha</label>
          <input
            class="form-input"
            type="password"
            id="regConfirm"
            name="confirm"
            placeholder="Repita a senha"
            autocomplete="new-password"
            required
            minlength="6"
          >
        </div>

        <button type="submit" class="btn btn--primary" id="btnRegister">
          <span class="btn__text">Cadastrar</span>
          <span class="btn__spinner" hidden>
            <svg class="spinner" width="20" height="20" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"
                      stroke-dasharray="20 31.4" stroke-linecap="round"/>
            </svg>
          </span>
        </button>
      </form>

      <p class="login-card__register">
        Já tem conta? <a href="index.html" class="form-link">Fazer login</a>
      </p>

      <div class="feedback" id="feedback" role="alert" aria-live="polite" hidden></div>
    </section>

    <footer class="login-footer">
      <p>© 2026 Banking Simulation — Projeto Acadêmico</p>
    </footer>
  </main>

  <script src="js/register.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add app/public/register.html
git commit -m "feat: create register page"
```

---

### Task 3: Create register.js

**Files:**
- Create: `app/public/js/register.js`

- [ ] **Step 1: Create register.js**

Same pattern as login.js. Validates fields, calls POST `/auth/register`, redirects to login on success.

Write `app/public/js/register.js`:

```javascript
const formulario = document.getElementById('registerForm');
const campoUsuario = document.getElementById('regUsername');
const campoSenha = document.getElementById('regPassword');
const campoConfirm = document.getElementById('regConfirm');
const botaoSubmit = document.getElementById('btnRegister');
const textoBotao = botaoSubmit.querySelector('.btn__text');
const spinnerBotao = botaoSubmit.querySelector('.btn__spinner');
const feedback = document.getElementById('feedback');

const API_URL = 'http://localhost:3000/auth/register';

function exibirFeedback(mensagem, tipo) {
  feedback.textContent = mensagem;
  feedback.className = 'feedback';
  feedback.classList.add(`feedback--${tipo}`);
  feedback.hidden = false;
}

function ocultarFeedback() {
  feedback.hidden = true;
  feedback.textContent = '';
}

function toggleLoading(carregando) {
  botaoSubmit.disabled = carregando;
  textoBotao.textContent = carregando ? 'Cadastrando...' : 'Cadastrar';
  spinnerBotao.hidden = !carregando;
}

function validarFormulario() {
  const usuario = campoUsuario.value.trim();
  const senha = campoSenha.value;
  const confirm = campoConfirm.value;

  if (!usuario) {
    exibirFeedback('Por favor, digite um usuário.', 'error');
    campoUsuario.focus();
    return null;
  }

  if (!senha) {
    exibirFeedback('Por favor, digite uma senha.', 'error');
    campoSenha.focus();
    return null;
  }

  if (senha.length < 6) {
    exibirFeedback('A senha deve ter pelo menos 6 caracteres.', 'error');
    campoSenha.focus();
    return null;
  }

  if (senha !== confirm) {
    exibirFeedback('As senhas não conferem.', 'error');
    campoConfirm.focus();
    return null;
  }

  return { username: usuario, password: senha };
}

async function cadastrar(dados) {
  toggleLoading(true);
  ocultarFeedback();

  try {
    const resposta = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });

    if (resposta.ok) {
      exibirFeedback('Conta criada com sucesso! Redirecionando...', 'success');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 800);
    } else {
      const erro = await resposta.json();
      exibirFeedback(erro.erro || 'Erro ao cadastrar. Tente novamente.', 'error');
    }
  } catch (erro) {
    console.error('Erro na requisição:', erro);
    exibirFeedback('Não foi possível conectar ao servidor.', 'error');
  } finally {
    toggleLoading(false);
  }
}

formulario.addEventListener('submit', function (evento) {
  evento.preventDefault();
  const dados = validarFormulario();
  if (dados) {
    cadastrar(dados);
  }
});

campoUsuario.addEventListener('input', ocultarFeedback);
campoSenha.addEventListener('input', ocultarFeedback);
campoConfirm.addEventListener('input', ocultarFeedback);
```

- [ ] **Step 2: Commit**

```bash
git add app/public/js/register.js
git commit -m "feat: add register.js with form validation and API call"
```

---

### Task 4: Create dashboard.html placeholder

**Files:**
- Create: `app/public/dashboard.html`
- Create: `app/public/js/dashboard.js`
- Modify: `app/public/css/login.css` (or create a new CSS file)

- [ ] **Step 1: Create dashboard.html**

Minimal page showing username from token. Logout button clears token.

Write `app/public/dashboard.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Banking Simulation — Dashboard</title>
  <link rel="stylesheet" href="css/login.css">
</head>
<body>

  <main class="dashboard-page">
    <header class="dashboard-header">
      <h1 class="dashboard-title">Banking Simulation</h1>
      <div class="dashboard-user">
        <span id="userDisplay" class="dashboard-username"></span>
        <button id="btnLogout" class="btn btn--primary dashboard-logout">Sair</button>
      </div>
    </header>

    <section class="dashboard-content">
      <div class="dashboard-card">
        <h2>Bem-vindo, <span id="userWelcome"></span>!</h2>
        <p class="dashboard-placeholder">A simulação bancária estará disponível em breve.</p>
      </div>
    </section>

    <div class="feedback" id="feedback" role="alert" aria-live="polite" hidden></div>
  </main>

  <script src="js/dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create dashboard.js**

Reads token from localStorage, fetches `/auth/me`, displays username. Logout clears token and redirects to login. If token invalid, redirects immediately.

Write `app/public/js/dashboard.js`:

```javascript
const userDisplay = document.getElementById('userDisplay');
const userWelcome = document.getElementById('userWelcome');
const btnLogout = document.getElementById('btnLogout');
const feedback = document.getElementById('feedback');

const API_URL = 'http://localhost:3000';

function exibirFeedback(mensagem, tipo) {
  feedback.textContent = mensagem;
  feedback.className = 'feedback';
  feedback.classList.add(`feedback--${tipo}`);
  feedback.hidden = false;
}

function redirecionarLogin() {
  localStorage.removeItem('auth_token');
  window.location.href = '/index.html';
}

async function carregarUsuario() {
  const token = localStorage.getItem('auth_token');

  if (!token) {
    redirecionarLogin();
    return;
  }

  try {
    const resposta = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!resposta.ok) {
      redirecionarLogin();
      return;
    }

    const dados = await resposta.json();
    userDisplay.textContent = dados.username;
    userWelcome.textContent = dados.username;

  } catch (erro) {
    console.error('Erro ao carregar usuário:', erro);
    redirecionarLogin();
  }
}

btnLogout.addEventListener('click', function () {
  localStorage.removeItem('auth_token');
  window.location.href = '/index.html';
});

carregarUsuario();
```

- [ ] **Step 3: Add dashboard styles to login.css**

Append to `app/public/css/login.css`:

```css
.dashboard-page {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  margin-bottom: 2rem;
  border-bottom: 1px solid var(--color-border);
}

.dashboard-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-primary);
}

.dashboard-user {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.dashboard-username {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  font-weight: 500;
}

.dashboard-logout {
  width: auto;
  padding: 0.5rem 1.25rem;
  font-size: 0.875rem;
}

.dashboard-content {
  display: flex;
  justify-content: center;
  padding-top: 2rem;
}

.dashboard-card {
  background: var(--color-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  padding: 2.5rem 2rem;
  width: 100%;
  max-width: 480px;
  text-align: center;
}

.dashboard-card h2 {
  font-size: 1.25rem;
  color: var(--color-text);
  margin-bottom: 0.75rem;
}

.dashboard-placeholder {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
```

- [ ] **Step 4: Commit**

```bash
git add app/public/dashboard.html app/public/js/dashboard.js app/public/css/login.css
git commit -m "feat: add dashboard placeholder with auth check"
```

---

### Task 5: Create seed script (admin user)

**Files:**
- Create: `scripts/seed.js`

- [ ] **Step 1: Create seed.js**

Import AuthService and register admin/admin123. Must be run from the `app/` directory or adjust require paths accordingly.

Write `scripts/seed.js`:

```javascript
const AuthService = require('../app/src/services/AuthService');

const username = 'admin';
const password = 'admin123';

try {
  const usuario = AuthService.registrar(username, password);
  console.log(`✓ Usuário criado: ${usuario.username} (ID: ${usuario.id})`);
} catch (erro) {
  if (erro.message === 'Username já está em uso') {
    console.log('→ Usuário admin já existe.');
  } else {
    console.error('✗ Erro ao criar usuário:', erro.message);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/seed.js
git commit -m "feat: add seed script for admin user"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd app && npm test
```
Expected: all tests pass.

- [ ] **Step 2: Start the server and test manually**

```bash
cd app && node app.js
```
Open browser at http://localhost:3000 and verify: login page shows "Cadastre-se" link, clicking it goes to register page, register form validates and submits, redirects to login, login with new credentials works, dashboard shows username, logout returns to login.

- [ ] **Step 3: Run seed and verify admin login**

In another terminal:
```bash
node scripts/seed.js
```
Expected: "✓ Usuário criado: admin (ID: 1)" or "→ Usuário admin já existe."

- [ ] **Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: final adjustments after manual verification"
```
