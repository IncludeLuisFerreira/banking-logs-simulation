
# Banking Simulation — Laboratório de Observabilidade & Concorrência

> Simulador de internet banking com visualização **gamificada em tempo real** de estratégias de controle de concorrência, equipado com stack completa de observabilidade (Prometheus, Grafana, Loki, Promtail).

O **Banking Simulation** é um laboratório acadêmico e profissional que modela um sistema bancário transacional sob alta concorrência, permitindo observar e comparar visualmente o comportamento de quatro estratégias diferentes de controle de concorrência — **Otimista (OCC)**, **Lock Naive**, **Lock Ordenado** e **Lock com Timeout**. A simulação é exposta via API REST (Express 5), transmitida em tempo real por **Server-Sent Events (SSE)** para uma interface web gamificada com partículas, animações SVG e cartões de conta com estados visuais, e monitorada por uma stack Docker completa de observabilidade.

---

## Tabela de Conteúdos

1. [Sobre o Projeto](#sobre-o-projeto)
2. [Tecnologias Utilizadas](#tecnologias-utilizadas)
3. [Funcionalidades](#funcionalidades)
4. [Estrutura do Diretório](#estrutura-do-diretório)
5. [Pré-requisitos](#pré-requisitos)
6. [Configuração de Variáveis de Ambiente](#configuração-de-variáveis-de-ambiente)
7. [Instalação e Execução](#instalação-e-execução)
8. [Testes](#testes)
9. [Endpoints da API](#endpoints-da-api)
10. [Stack de Observabilidade](#stack-de-observabilidade)
11. [Status do Projeto e Próximos Passos](#status-do-projeto-e-próximos-passos)

---

## Sobre o Projeto

### Problema Resolvido

Sistemas bancários reais precisam lidar com milhares de transações concorrentes garantindo **consistência**, **integridade de saldos** e **ausência de deadlocks**. Este projeto simula esse cenário, permitindo que desenvolvedores e estudantes observem, em uma interface visual gamificada, exatamente o que acontece quando múltiplos workers disputam o acesso às mesmas contas simultaneamente.

### Arquitetura

O sistema segue uma arquitetura em camadas inspirada nos princípios de **Clean Architecture** e **Separation of Concerns (SoC)**:

```
┌─────────────────────────────────────────────────┐
│                    Frontend                      │
│  Vanilla JS SPA (Login → Dashboard → Simulação) │
│  SSE Client + Event Queue + State Manager       │
│  SVG Renderer + Canvas Particles                │
└──────────────────┬──────────────────────────────┘
                   │ HTTP REST + SSE Stream
┌──────────────────┴──────────────────────────────┐
│                 API Layer (Express 5)            │
│  /auth/*  │  /simulacao/*  │  /simulacao/stream  │
├─────────────────────────────────────────────────┤
│              Services Layer                      │
│  AuthService │ GerenciadorTransacoes             │
│  SimulacaoService │ SimulacaoVisualService       │
│  LockLogger (SSE Broadcaster)                   │
├─────────────────────────────────────────────────┤
│              Domain Model                        │
│  Conta (OCC) │ Transacao │ Usuario               │
├─────────────────────────────────────────────────┤
│         Concurrency Primitives                   │
│  AsyncPriorityQueue (Binary Heap) │ Mutex (EE)   │
├─────────────────────────────────────────────────┤
│              Persistence                         │
│  SQLite (better-sqlite3, WAL mode)               │
└─────────────────────────────────────────────────┘
```

### Fluxo Principal de Dados

1. O usuário autentica-se via JWT e acessa o Dashboard ou a Simulação Visual.
2. Na simulação, contas são criadas no backend com `Conta` (que embute um `Mutex` e versionamento para OCC).
3. Transações são geradas (NxN todos-contra-todos ou modo aleatório) e enfileiradas em uma `AsyncPriorityQueue` (heap binário com prioridade por idade).
4. Workers concorrentes (8 no modo visual, 100 no modo stress) consomem a fila e processam transferências aplicando a **estratégia de concorrência selecionada**:
   - **Otimista (OCC):** Tenta debitar a conta de origem usando versionamento (`sacar()`). Se a versão mudou (conflito), reintroduz a transação na fila.
   - **Lock Naive:** Adquire o mutex da origem e depois o do destino, sem ordenação — suscetível a deadlocks.
   - **Lock Ordenado:** Adquire mutexes sempre em ordem crescente de `conta.id`, prevenindo deadlocks.
   - **Lock com Timeout:** Adquire o mutex da origem com `tryAcquire(timeout)`. Se o timeout expirar, a transação é reenfileirada.
5. Cada evento (lock solicitado, adquirido, bloqueado, liberado, timeout, conflito OCC, débito, sucesso) é emitido via **EventEmitter** para o `LockLogger`, que o transmite por SSE para todos os clientes conectados.
6. O frontend recebe os eventos, aplica-os a um state manager e renderiza em tempo real os estados visuais nos cartões SVG, linhas de conexão, painel de transações e contadores.
7. Ao final, o `RelatorioTransacaoConta` gera um `relatorio.txt` com métricas agregadas.

---

## Tecnologias Utilizadas

| Tecnologia | Versão | Papel no Projeto |
|---|---|---|
| **Node.js** | ≥ 18.0.0 | Runtime da aplicação |
| **Express** | ^5.2.1 | Servidor HTTP e roteamento da API REST |
| **better-sqlite3** | ^9.4.0 | Banco de dados SQLite síncrono, rápido e com suporte a WAL (Write-Ahead Logging) |
| **bcryptjs** | ^2.4.3 | Hash de senhas para autenticação de usuários |
| **jsonwebtoken** | ^9.0.0 | Geração e validação de tokens JWT para autenticação stateless |
| **Jest** | ^30.4.2 | Framework de testes unitários com cobertura de código |
| **EventEmitter (nativo)** | Node.js core | Infraestrutura de eventos do Mutex e do LockLogger |
| **Canvas API** | Browser nativo | Sistema de partículas no fundo da simulação visual |
| **SVG** | Browser nativo | Renderização de hub de contas, linhas de conexão e cartões na arena visual |
| **Server-Sent Events** | Padrão Web | Streaming unidirecional de eventos em tempo real para o frontend |
| **Docker & Docker Compose** | Latest | Containerização e orquestração da stack de observabilidade |
| **Prometheus** | Latest | Coleta e armazenamento de métricas da aplicação |
| **Grafana** | Latest | Visualização de métricas e logs via dashboards |
| **Loki** | Latest | Agregação e consulta de logs estruturados |
| **Promtail** | Latest | Agente coletor de logs que lê do sistema de arquivos e envia para Loki |
| **GNU Make** | — | Automação de tarefas comuns (install, test, stress, docker-up, etc.) |

---

## Funcionalidades

### 1. Autenticação e Autorização
- Registro de usuários com validação de senha (≥ 6 caracteres), verificação de unicidade de username e hash bcrypt.
- Login com retorno de JWT (expiração de 24h) armazenado em `localStorage`.
- Middleware `autenticar` que protege todas as rotas da simulação.
- Rota `GET /auth/me` para obtenção dos dados do usuário autenticado.

### 2. Gestão de Contas (Dashboard)
- **Listagem** de todas as contas com ID, saldo em centavos e status (ativa/inativa).
- **Criação** de novas contas com saldo inicial e nome customizáveis.
- **Remoção** de contas (marca como inativa e drena waiters do mutex).

### 3. Simulação de Stress (NxN)
- Geração de transações todos-contra-todos entre N contas (NxN).
- Configurável via variáveis de ambiente: `NUM_CONTAS=10000 NUM_TRANSACOES=50000`.
- 100 workers concorrentes processando a fila de prioridade.
- Geração de relatório final com métricas de processamento.

### 4. Simulação Visual Gamificada
- **Interface de controle:** Seletor de modo (NxN / Aleatório), dropdown de estratégia de concorrência, slider de velocidade (100–2000ms por worker), contador de contas (5–30).
- **4 Estratégias de concorrência:**
  - `otimista` — Optimistic Concurrency Control (OCC) com versionamento.
  - `lock-naive` — Bloqueio sem ordenação (deadlock-prone).
  - `lock-ordenado` — Bloqueio com ordenação por ID (deadlock-free).
  - `lock-timeout` — Bloqueio com timeout e reenfileiramento.
- **Arena visual SVG:**
  - Hub central (Bank Hub) com anel animado rotativo.
  - Cartões de conta dispostos em círculo ao redor do hub.
  - Linhas de conexão entre contas com animação de fluxo (dash-move).
  - Setas direcionais com marcadores (arrowheads) indicando direção da transação.
  - Labels flutuantes com o valor da transação.
- **Estados visuais por conta:**
  - `idle` (padrão) → `reading` (lendo origem) → `locked` (mutex adquirido) → `success` (verde) / `conflito` (vermelho) / `blocked` (amarelo) / `timeout` (laranja).
  - Barras de progresso e bordas animadas por estado.
- **Painel de transações:** Dividido em "Em Andamento" e "Concluídas", com animações de entrada e saída.
- **Sistema de partículas:** Canvas com 60 partículas flutuantes no fundo.
- **Overlay de resultados:** Ao final da simulação, exibe totais de transações, conflitos, bloqueios, timeouts e deadlocks com animação de fade-in e contadores.

### 5. SSE Streaming (Eventos em Tempo Real)
- Endpoint `GET /simulacao/stream` com autenticação via query param `?token=`.
- Formato `text/event-stream` com CORS habilitado.
- Tipos de eventos transmitidos:
  - `conta:adicionada`, `conta:removida`
  - `transacao:lendo_origem`, `transacao:conflito`, `transacao:debitado`, `transacao:success`
  - `lock:request`, `lock:acquired`, `lock:blocked`, `lock:released`, `lock:timeout`
  - `simulacao:iniciada`, `simulacao:finalizada`, `simulacao:parada`

### 6. Log Viewer (Dashboard)
- Visualização em tempo real dos eventos no dashboard com entradas coloridas por tipo.
- Contadores de Locks OK, Bloqueios e Timeouts atualizados via SSE.
- Exportação do log como arquivo `.txt`.

### 7. Relatório de Transações
- Coleta de métricas: total de transações, tentativas de lock, saldo insuficiente, tempo de processamento (nanossegundos), tempo de espera.
- Geração automática do arquivo `relatorio.txt` ao final de cada simulação.

### 8. Stack de Observabilidade (Docker)
- **Prometheus** (porta 9090): Scrape de métricas do app a cada 15s.
- **Grafana** (porta 3001): Dashboards pré-configurados com Prometheus e Loki como data sources.
- **Loki** (porta 3100): Agregação de logs com retenção de 168h.
- **Promtail**: Coleta de logs do diretório `app/logs/` e envio para Loki.

---

## Estrutura do Diretório

```
.
├── .env                            # Variáveis de ambiente (não versionado)
├── .env.example                    # Template de variáveis de ambiente
├── .gitignore                      # Regras de ignorar arquivos no Git
├── LICENSE                         # MIT License
├── Makefile                        # Automação de tarefas (install, start, test, etc.)
├── README.md                       # Esta documentação
├── docker-compose.yml              # Orquestração de containers (app + monitoring stack)
│
├── app/                            # Aplicação Node.js principal
│   ├── .dockerignore               # Arquivos ignorados no build Docker
│   ├── Dockerfile                  # Build da imagem Node.js 20
│   ├── package.json                # Manifesto npm e scripts
│   ├── package-lock.json           # Lock de versões exatas
│   ├── app.js                      # Entrypoint — servidor Express 5, rotas, SSE
│   ├── relatorio.txt               # Relatório gerado após simulação
│   │
│   ├── __tests__/                  # Testes unitários
│   │   └── auth.test.js            # 11 testes do AuthService (registro, login, token)
│   │
│   ├── coverage/                   # Relatório de cobertura (gerado pelo Jest)
│   │   └── lcov-report/            # HTML report: 90.9% statements, 92.1% lines
│   │
│   ├── data/                       # Banco SQLite (runtime)
│   │   └── banking.db              # Arquivo do banco de dados
│   │
│   ├── public/                     # Assets estáticos do frontend
│   │   ├── index.html              # Página de login
│   │   ├── css/
│   │   │   ├── login.css           # Estilos globais + login (302 linhas)
│   │   │   ├── dashboard.css       # Estilos do dashboard (325 linhas)
│   │   │   └── simulacao-visual.css # Estilos da simulação visual (1006 linhas)
│   │   ├── html/
│   │   │   ├── register.html       # Página de cadastro
│   │   │   ├── dashboard.html      # Dashboard com gestão de contas e logs
│   │   │   └── simulacao-visual.html # Arena visual gamificada
│   │   ├── img/                    # Logos e imagens (5 variações da logo Tundra)
│   │   └── js/
│   │       ├── api.js              # Constante API_BASE_URL
│   │       ├── login.js            # Lógica de autenticação (172 linhas)
│   │       ├── register.js         # Lógica de cadastro (177 linhas)
│   │       ├── dashboard.js        # Lógica do dashboard + SSE client (313 linhas)
│   │       └── simulacao-visual.js # Engine visual: SSE, state, renderer (812 linhas)
│   │
│   └── src/                        # Código-fonte da aplicação
│       ├── concurrency/            # Primitivas de concorrência
│       │   ├── AsyncPriorityQueue.js # Fila de prioridade assíncrona (binary heap)
│       │   └── Mutex.js            # Mutex assíncrono com EventEmitter (94 linhas)
│       ├── config/
│       │   └── database.js         # Singleton SQLite, WAL mode, schema DDL
│       ├── middleware/
│       │   └── auth.js             # Middleware JWT Bearer de autenticação
│       ├── model/                  # Entidades de domínio (POJOs)
│       │   ├── Conta.js            # Conta bancária com OCC e Mutex (59 linhas)
│       │   ├── Transacao.js        # Transação com prioridade por idade (46 linhas)
│       │   └── Usuario.js          # Usuário com toJSON sem passwordHash
│       ├── services/               # Lógica de negócio e orquestração
│       │   ├── AuthService.js      # Registro, login, JWT, bcrypt (103 linhas)
│       │   ├── GerenciadorTransacoes.js # Core transacional com 4 estratégias (326 linhas)
│       │   ├── LockLogger.js       # Broadcaster SSE com buffer circular (83 linhas)
│       │   ├── RelatorioTransacaoConta.js # Coleta de métricas e relatório (102 linhas)
│       │   ├── SimulacaoService.js # Gestão de contas e simulação NxN (126 linhas)
│       │   └── SimulacaoVisualService.js # Simulação visual gamificada (171 linhas)
│       └── utils/
│           └── .gitkeep
│
├── docs/                           # Documentação técnica
│   ├── CONTRIBUTING.md             # Guia de contribuição (fork, branch, PR)
│   ├── PROJECT_STRUCTURE.md        # Documentação da estrutura do diretório
│   └── superpowers/
│       ├── plans/                  # 6 planos de implementação detalhados
│       └── specs/                  # 7 especificações de design arquitetural
│
├── monitoring/                     # Stack de observabilidade
│   ├── grafana/
│   │   └── datasources.yml         # Data sources: Prometheus + Loki
│   ├── loki/
│   │   └── loki-config.yml         # Configuração do Loki (port 3100, 168h retention)
│   ├── prometheus/
│   │   └── prometheus.yml          # Scrape config: app:3000 a cada 15s
│   └── promtail/
│       └── promtail-config.yml     # Coleta de app/logs/*.log → Loki
│
└── scripts/
    └── seed.js                     # Script de seed: cria usuário admin/admin123
```

---

## Pré-requisitos

| Dependência | Versão Mínima | Instalação |
|---|---|---|
| **Node.js** | ≥ 18.0.0 | [nodejs.org](https://nodejs.org/) |
| **npm** | ≥ 9.0.0 | Incluso no Node.js |
| **Docker** | ≥ 24.0.0 | [docs.docker.com](https://docs.docker.com/engine/install/) |
| **Docker Compose** | ≥ 2.20.0 | Incluso no Docker Desktop / plugin |
| **GNU Make** | ≥ 4.0 | `apt install make` (Linux) / Xcode CLI (macOS) |
| **Git** | ≥ 2.40 | [git-scm.com](https://git-scm.com/) |

> **Nota:** Docker e Docker Compose são necessários apenas para a stack de observabilidade. A aplicação Node.js pode ser executada diretamente sem containers.

---

## Configuração de Variáveis de Ambiente

Copie `.env.example` para `.env` e configure conforme necessário:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Valor Padrão | Descrição |
|---|---|---|---|
| `JWT_SECRET` | Sim | `dev-secret` | Chave secreta para assinatura de tokens JWT. **Em produção, use uma chave forte (≥ 256 bits).** |
| `PORT` | Não | `3000` | Porta em que o servidor Express escuta. |
| `NODE_ENV` | Não | `development` | Ambiente de execução (`development`, `production`, `test`). |
| `NUM_CONTAS` | Não | — | Número de contas para o teste de stress (`make stress`). |
| `NUM_TRANSACOES` | Não | — | Número de transações para o teste de stress (`make stress`). |
| `SEED_USERNAME` | Não | `admin` | Username do usuário seed criado por `make seed`. |
| `SEED_PASSWORD` | Não | `admin123` | Senha do usuário seed criado por `make seed`. |

---

## Instalação e Execução

### 1. Clone o Repositório

```bash
git clone <url-do-repositorio>
cd lab-observabilidade_2
```

### 2. Configure as Variáveis de Ambiente

```bash
cp .env.example .env
# Edite .env com seus valores (opcional em desenvolvimento)
```

### 3. Instale as Dependências

```bash
make install
# Equivalente a: cd app && npm install
```

### 4. Execute o Seed (Opcional)

Cria um usuário administrador padrão no banco SQLite:

```bash
make seed
# Cria: admin / admin123
```

### 5. Inicie a Aplicação

```bash
make start
# Equivalente a: cd app && npm start
```

A aplicação estará disponível em:
- **Login / Frontend:** [http://localhost:3000](http://localhost:3000)
- **API:** [http://localhost:3000](http://localhost:3000)

### 6. Suba a Stack de Observabilidade (Opcional)

```bash
make docker-up
# Equivalente a: docker-compose up -d
```

Serviços disponíveis:
- **Grafana:** [http://localhost:3001](http://localhost:3001)
- **Prometheus:** [http://localhost:9090](http://localhost:9090)
- **Loki:** [http://localhost:3100](http://localhost:3100)

### 7. Derrube a Stack

```bash
make docker-down
# Equivalente a: docker-compose down -v
```

### Comandos Disponíveis no Makefile

| Comando | Descrição |
|---|---|
| `make help` | Lista todos os comandos disponíveis |
| `make install` | Instala dependências npm no diretório `app/` |
| `make start` | Inicia o servidor da aplicação |
| `make test` | Executa a suíte de testes com cobertura |
| `make seed` | Popula o banco com usuário admin |
| `make stress` | Executa teste de estresse (10.000 contas, 50.000 transações) |
| `make lint` | Placeholder para ESLint |
| `make fmt` | Placeholder para Prettier |
| `make clean` | Remove node_modules, relatórios e package-lock.json |
| `make clean-reports` | Remove apenas arquivos de relatório |
| `make docker-up` | Sobe stack de observabilidade com Docker Compose |
| `make docker-down` | Derruba stack de observabilidade |
| `make docker-logs` | Exibe logs dos containers em tempo real |

---

## Testes

A suíte de testes cobre o módulo de autenticação (`AuthService`) com 11 casos de teste:

- **Registro:** Registro bem-sucedido, username duplicado, senha curta, campos faltantes.
- **Login:** Login bem-sucedido, senha incorreta, usuário inexistente, campos faltantes.
- **Token:** Validação de token válido, token inválido, token expirado.

```bash
make test
# Equivalente a: cd app && npm test
```

**Cobertura atual:** 90.9% statements, 92.3% branches, 77.77% functions, 92.1% lines.

---

## Endpoints da API

### Autenticação

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| `POST` | `/auth/register` | Não | Registra um novo usuário |
| `POST` | `/auth/login` | Não | Login e obtenção de token JWT |
| `GET` | `/auth/me` | Sim (Bearer) | Dados do usuário autenticado |

**Exemplo de requisição (Login):**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

**Resposta:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "username": "admin"
}
```

### Simulação de Contas

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| `GET` | `/simulacao/contas` | Sim (Bearer) | Lista todas as contas |
| `POST` | `/simulacao/contas` | Sim (Bearer) | Cria uma nova conta |
| `DELETE` | `/simulacao/contas/:id` | Sim (Bearer) | Remove uma conta pelo ID |

**Exemplo de criação de conta:**
```bash
curl -X POST http://localhost:3000/simulacao/contas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"saldoInicial": 100000, "nome": "Conta Alpha"}'
```

### Simulação de Stress (NxN)

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| `POST` | `/simulacao/stress` | Sim (Bearer) | Inicia simulação NxN com as contas existentes |
| `POST` | `/simulacao/stop` | Sim (Bearer) | Para a simulação em execução |

### Simulação Visual

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| `POST` | `/simulacao/visual` | Sim (Bearer) | Inicia simulação visual gamificada |
| `POST` | `/simulacao/visual/stop` | Sim (Bearer) | Para a simulação visual |
| `GET` | `/simulacao/stream` | Sim (query) | Conexão SSE para eventos em tempo real |

**Payload para iniciar simulação visual:**
```json
{
  "numContas": 8,
  "mode": "nxn",
  "transacaoRange": {},
  "estrategia": "otimista"
}
```

**Parâmetros aceitos:**
- `numContas` (int, default 8): Número de contas na simulação (5–30).
- `mode` (string, default `"nxn"`): Modo de geração de transações — `"nxn"` (todos-contra-todos) ou `"random"` (aleatório).
- `transacaoRange` (object): `{ min, max }` — faixa de transações para modo aleatório.
- `estrategia` (string, default `"otimista"`): Estratégia de concorrência — `"otimista"`, `"lock-naive"`, `"lock-ordenado"`, `"lock-timeout"`.

**Conexão SSE:**
```javascript
const eventSource = new EventSource(
  `http://localhost:3000/simulacao/stream?token=${jwtToken}`
);

eventSource.addEventListener('transacao:success', (event) => {
  const data = JSON.parse(event.data);
  console.log('Transação concluída:', data);
});
```

---

## Stack de Observabilidade

### Arquitetura de Monitoramento

```
┌──────────┐     metrics scrape      ┌────────────┐
│  App     │ ◄────────────────────── │ Prometheus │
│ :3000    │                         │   :9090    │
│          │                         └─────┬──────┘
│ logs/    │──┐                            │
│ *.log    │  │                      ┌─────┴──────┐
└──────────┘  │     read & push     │  Grafana   │
              └─────────────────────►│   :3001    │
              ┌─────────────────────►│            │
┌──────────┐  │                      └─────┬──────┘
│ Promtail │──┘                            │
│  :9080   │                        ┌─────┴──────┐
└──────────┘                        │   Loki     │
                                    │   :3100    │
                                    └────────────┘
```

### Acessos

| Serviço | URL | Descrição |
|---|---|---|
| Grafana | `http://localhost:3001` | Dashboards e visualização |
| Prometheus | `http://localhost:9090` | Console de consultas PromQL |
| Loki | `http://localhost:3100` | API de consulta de logs |

### Data Sources no Grafana

Os data sources são provisionados automaticamente via `monitoring/grafana/datasources.yml`:
- **Prometheus** (default): `http://prometheus:9090`
- **Loki**: `http://loki:3100`

---

## Status do Projeto e Próximos Passos

### O que está implementado

- [x] Autenticação JWT completa (registro, login, middleware de proteção)
- [x] CRUD de contas bancárias via API REST
- [x] 4 estratégias de controle de concorrência (OCC, Lock Naive, Lock Ordenado, Lock com Timeout)
- [x] Fila de prioridade assíncrona (binary heap) com workers concorrentes
- [x] Mutex assíncrono com EventEmitter e timeout
- [x] Simulação de stress NxN com relatório agregado
- [x] Simulação visual gamificada com arena SVG, partículas e 4 estados de transação
- [x] SSE streaming de eventos em tempo real para múltiplos clientes
- [x] Frontend SPA: Login → Dashboard → Simulação Visual
- [x] Stack de observabilidade Dockerizada (Prometheus + Grafana + Loki + Promtail)
- [x] Testes unitários com 90%+ de cobertura no módulo de auth
- [x] Documentação extensiva (project structure, contributing, 6 planos + 7 specs)

### Pendências e Melhorias Futuras

- [ ] **Métricas Prometheus na aplicação:** Expor endpoint `/metrics` com métricas customizadas (contadores de transações, locks, conflitos, latência) para scraping pelo Prometheus.
- [ ] **Grafana Dashboards:** Criar dashboards JSON pré-configurados para visualização de métricas de concorrência.
- [ ] **Logging estruturado:** Emitir logs em formato JSON para o diretório `app/logs/` para integração completa com Loki/Promtail.
- [ ] **ESLint + Prettier:** Configurar linting e formatação automática de código.
- [ ] **CI/CD Pipeline:** Implementar workflows no GitHub Actions para testes automatizados e build Docker.
- [ ] **Cobertura de testes:** Expandir suíte de testes para `GerenciadorTransacoes`, `Conta`, `Mutex` e `AsyncPriorityQueue`.
- [ ] **Persistência de simulações:** Salvar e carregar simulações anteriores com dados históricos.
- [ ] **Autenticação OAuth2:** Adicionar login social (Google, GitHub) como alternativa ao JWT local.
- [ ] **Exportação de dashboards:** Permitir download de relatórios em formatos PDF/CSV.
- [ ] **Multitenancy:** Isolar simulações por usuário/sessão para uso simultâneo por múltiplos alunos.
- [ ] **Deadlock detection:** Implementar detecção automática de deadlocks na estratégia `lock-naive`.
- [ ] **Semaphore:** Implementar semáforo assíncrono na camada `concurrency/`.

---

## Licença

Este projeto está licenciado sob a **MIT License** — veja o arquivo [LICENSE](LICENSE) para detalhes.

---

> Desenvolvido por **Luís Felipe** e **Nick (Milena)** — 2026.
