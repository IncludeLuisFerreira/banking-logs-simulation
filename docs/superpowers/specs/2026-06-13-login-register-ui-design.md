# Login + Cadastro UI — Banking Simulation

## Objetivo
Completar a interface de autenticação da aplicação: tela de login funcional com link para cadastro, tela de cadastro com validação, dashboard placeholder pós-login, e seed de usuário admin para testes.

## Problemas Atuais
- Login (`index.html`) não tem link/botão para cadastro
- `login.js` não implementa chamada para `/auth/register`
- Nenhum usuário seed existe no banco SQLite

## Escopo

### 1. Tela de Login (index.html) — ajustes
- Adicionar link "Cadastre-se" abaixo do formulário
- Estilo consistente com o link "Esqueci minha senha"

### 2. Tela de Cadastro (register.html) — nova página
- Reaproveita `login.css` para manter identidade visual
- Formulário com campos: Usuário, Senha, Confirmar Senha
- Validação client-side: campos obrigatórios, senha >= 6 caracteres, senhas conferem
- Requisição POST `/auth/register`
- Em caso de sucesso: redireciona para `index.html` com mensagem de sucesso
- Em caso de erro: exibe feedback no formulário
- Link "Já tenho conta" para voltar ao login

### 3. register.js — novo script
- Mesmo padrão de `login.js`: seleção de DOM, validação, fetch, feedback
- Endpoint: `POST http://localhost:3000/auth/register`

### 4. Dashboard placeholder (dashboard.html)
- Header com nome do usuário e botão "Sair"
- Conteúdo placeholder: "Bem-vindo, {username}"
- Botão Sair: limpa localStorage (`auth_token`) e redireciona ao login

### 5. dashboard.js — novo script
- Lê token do localStorage
- Faz GET `/auth/me` para obter dados do usuário logado
- Exibe username no header
- Se token inválido/expirado, redireciona ao login

### 6. Seed Script (scripts/seed.js)
- Cria usuário admin com senha admin123 via `AuthService.registrar`
- Executável via `node scripts/seed.js`

### 7. Ajuste no backend (app.js)
- Já serve arquivos estáticos de `public/` — nenhuma alteração necessária
- Rotas de auth já estão implementadas e funcionais

## Não Escopo
- Refresh token, rate limiting, roles/permissoes — apenas TODOs existentes
- Tela de recuperação de senha
- Páginas de simulação — será coberto em etapa futura

## Dependências
- bcryptjs, jsonwebtoken, better-sqlite3, express — já instalados
- Nenhuma nova dependência necessária
