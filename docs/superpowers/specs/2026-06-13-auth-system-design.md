# Sistema de Autenticação — Banking Simulation

## Objetivo
Adicionar autenticação JWT com registro e login de usuários à plataforma banking-simulation, protegendo os endpoints da simulação.

## Arquitetura

### Camadas (dentro de `app/src/`)

| Arquivo | Função |
|---------|--------|
| `model/Usuario.js` | Entidade Usuário (id, username, passwordHash, criadoEm) |
| `services/AuthService.js` | Lógica: registrar, login, verificarToken |
| `config/database.js` | Conexão SQLite via better-sqlite3, criação da tabela `usuarios` |
| `middleware/auth.js` | Middleware Express que valida JWT do header `Authorization` |

### Entrypoint
- `app/api.js` — servidor Express na porta 3000 com rotas de auth + simulação
- `app.js` — mantido intacto para CLI

## Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/auth/register` | Não | Cria usuário (username, password) |
| POST | `/auth/login` | Não | Retorna JWT |
| GET | `/auth/me` | Sim | Dados do usuário logado |
| POST | `/simulacao/iniciar` | Sim | Inicia simulação |
| GET | `/simulacao/resultado` | Sim | Retorna relatório |

## Segurança
- bcryptjs para hash de senha
- JWT com expiração de 24h
- JWT_SECRET via env var (fallback: 'dev-secret')
- Senha mínima: 6 caracteres
- Username único (UNIQUE no SQLite)

## Dependências
- express ^5.2.1 (já instalado)
- bcryptjs ^2.4.3
- jsonwebtoken ^9.0.0
- better-sqlite3 ^9.4.0

## Não Escopo
- TypeScript, ORM, refresh token, rate limiting, roles — apenas TODOs
- Alteração da lógica de simulação existente
