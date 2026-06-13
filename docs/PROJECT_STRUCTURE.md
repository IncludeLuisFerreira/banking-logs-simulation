# 📁 Estrutura de Diretórios — Simulação Bancária Node.js

Este documento descreve o propósito de cada diretório e arquivo do projeto, garantindo clareza para novos desenvolvedores e mantenedores.

---

## 🌳 Visão Geral da Árvore

```
.
├── app/                        ← Aplicação Node.js (código-fonte)
│   ├── package.json             ← Manifesto de dependências e scripts
│   ├── package-lock.json        ← Lock de versões exatas (gerado pelo npm)
│   ├── app.js                   ← Entrypoint da aplicação (inicialização)
│   ├── public/                  ← Assets estáticos (HTML, CSS, imagens)
│   └── src/                     ← Código-fonte organizado por camadas
│       ├── concurrency/           ← Infraestrutura de concorrência
│       ├── config/                ← Configurações e constantes
│       ├── model/                 ← Entidades de domínio (POJOs)
│       ├── services/              ← Lógica de negócio e orquestração
│       └── utils/                 ← Funções utilitárias e helpers
├── docker-compose.yml           ← Orquestração de containers Docker
├── docs/                        ← Documentação técnica e arquitetural
├── monitoring/                  ← Stack de observabilidade (Prometheus, Grafana, Loki)
│   ├── grafana/                   ← Dashboards e data sources
│   ├── loki/                      ← Configuração de agregação de logs
│   ├── prometheus/                ← Regras de scrape de métricas
│   └── promtail/                  ← Configuração de coleta de logs
├── scripts/                     ← Scripts auxiliares (seed, deploy, backup)
├── .env.example                 ← Template de variáveis de ambiente
├── Makefile                     ← Automação de comandos recorrentes
├── README.md                    ← Documentação de entrada do projeto
└── LICENSE                      ← Licença do projeto
```

---

## 📂 `app/` — Aplicação Node.js

Diretório raiz da aplicação. Contém todo o código executável, manifestos npm e assets.

| Arquivo / Pasta | Objetivo |
|-----------------|----------|
| `package.json` | Manifesto npm. Define nome, versão, scripts (`start`, `test`, `stress`), dependências de produção e desenvolvimento. |
| `package-lock.json` | Arquivo gerado automaticamente pelo npm. Trava as versões exatas de todas as dependências e sub-dependências, garantindo reprodutibilidade entre máquinas. **Nunca edite manualmente.** |
| `app.js` | **Entrypoint** da aplicação. Responsável por inicializar o servidor, carregar configurações e orquestrar a simulação bancária. |
| `public/` | Diretório para assets estáticos (HTML, CSS, imagens, fontes). Se a API não servir frontend, pode ser removido futuramente. |
| `src/` | Código-fonte da aplicação, organizado em camadas para separação de responsabilidades. |

---

## 📂 `app/src/concurrency/` — Infraestrutura de Concorrência

**Propósito:** Abstrair mecanismos de sincronização e filas assíncronas, tornando-os reutilizáveis e independentes da lógica de negócio.

**Arquivos esperados:**
- `Mutex.js` — Implementação de mutex assíncrono (substitui `ReentrantLock` do Java).
- `AsyncPriorityQueue.js` — Fila de prioridade assíncrona (substitui `PriorityBlockingQueue` do Java).
- `Semaphore.js` *(futuro)* — Controle de acesso limitado a recursos.

> **Por que separar?** Esses componentes são genéricos. Podem ser reutilizados em outros projetos (ex: simulação de leilão, reserva de ingressos) sem acoplamento ao domínio bancário.

---

## 📂 `app/src/config/` — Configurações

**Propósito:** Centralizar constantes e parâmetros do sistema, evitando valores hardcoded espalhados pelo código.

**Arquivos esperados:**
- `constants.js` — `NUM_CONTAS`, `NUM_TRANSACOES`, `SALDO_INICIAL`, `TIMEOUT_LOCK`, `NUM_WORKERS`.
- `logger.js` — Configuração de logging estruturado (formato JSON para integração com Loki).

> **Vantagem:** Permite alterar o comportamento da simulação via variáveis de ambiente (`.env`) sem tocar no código-fonte.

---

## 📂 `app/src/model/` — Entidades de Domínio

**Propósito:** Representar as entidades puras do sistema, sem lógica de I/O ou concorrência.

**Arquivos esperados:**
- `Conta.js` — Representa uma conta bancária (ID, saldo em centavos, mutex).
- `Transacao.js` — Representa uma transação (origem, destino, valor, timestamp, prioridade).

> **Regra:** Classes aqui não devem conhecer Express, Docker, arquivo de log, etc. São **POJOs/POCOs** (Plain Old JavaScript Objects).

---

## 📂 `app/src/services/` — Lógica de Negócio

**Propósito:** Orquestrar operações, aplicar regras de negócio e coordenar a concorrência.

**Arquivos esperados:**
- `GerenciadorTransacoes.js` — Core do sistema. Gerencia a fila de transações, workers assíncronos, lock ordering e prevenção de deadlock.
- `RelatorioTransacaoConta.js` — Coleta métricas (tempo de espera, processamento, saldo insuficiente) e gera `relatorio.txt`.

> **Analogia:** Se `model/` são os "atores", `services/` é o "diretor da peça".

---

## 📂 `app/src/utils/` — Utilitários

**Propósito:** Funções genéricas e cross-cutting que não pertencem a nenhuma camada específica.

**Arquivos esperados:**
- `formatters.js` — `formatCurrency(valorCentavos)`, `formatDuration(ms)`, `formatDate()`.
- `helpers.js` — Funções matemáticas, validadores, geradores de ID.

> **Regra:** Se uma função é usada por mais de um arquivo em camadas diferentes, ela mora aqui.

---

## 📂 `app/public/` — Assets Estáticos

**Propósito:** Servir arquivos estáticos via Express (se houver interface web simples).

**Conteúdo esperado:**
- `index.html` — Dashboard simples de status (opcional).
- `styles.css`, imagens, favicon.

> **Nota:** Se o projeto for **API-only**, este diretório pode ser removido. O `.gitkeep` mantém a pasta no Git até que você decida.

---

## 📂 `docs/` — Documentação

**Propósito:** Armazenar documentação técnica, decisões arquiteturais e guias.

**Arquivos esperados:**
- `architecture.md` — Decisões arquiteturais (por que Mutex customizado, por que não Worker Threads, etc.).
- `api.md` — Documentação de endpoints (se a API crescer).
- `setup.md` — Guia de instalação para novos desenvolvedores.

---

## 📂 `monitoring/` — Stack de Observabilidade

**Propósito:** Isolar toda a infraestrutura de monitoramento (métricas, logs, dashboards) da aplicação.

| Subdiretório | Objetivo |
|--------------|----------|
| `grafana/` | Dashboards pré-configurados (JSON), data sources e provisionamento. |
| `prometheus/` | Arquivo `prometheus.yml` com regras de scrape (onde e como coletar métricas). |
| `loki/` | Configuração do Loki (sistema de agregação de logs). |
| `promtail/` | Configuração do agente Promtail (coleta de logs do arquivo e envio para Loki). |

> **Integração:** A aplicação emite logs JSON para `app/logs/`. O Promtail lê esses arquivos e envia para o Loki. O Grafana consulta Loki e Prometheus para visualização unificada.

---

## 📂 `scripts/` — Scripts Auxiliares

**Propósito:** Automatizar tarefas operacionais que não cabem no `Makefile` ou `package.json`.

**Arquivos esperados:**
- `seed.js` — Popula o banco com dados iniciais para testes.
- `backup.sh` — Backup do SQLite e relatórios.
- `deploy.sh` — Script de deploy para ambiente de staging/produção.

---

## 📄 Arquivos na Raiz

| Arquivo | Objetivo |
|---------|----------|
| `.env.example` | **Template** de variáveis de ambiente. Contém chaves fictícias e valores de exemplo. O desenvolvedor copia para `.env` e preenche com valores reais. **Nunca commit `.env` (contém segredos).** |
| `Makefile` | Automação de comandos recorrentes. Exemplos: `make install`, `make start`, `make test`, `make stress`, `make clean`. |
| `docker-compose.yml` | Orquestra todos os containers da stack: aplicação Node.js + Prometheus + Grafana + Loki + Promtail + Node Exporter. |
| `README.md` | Documentação de entrada. Explica o que é o projeto, como instalar, como rodar e como contribuir. |
| `LICENSE` | Licença de software (MIT, Apache 2.0, etc.). Define os termos de uso e distribuição. |

---

## 🔒 Arquivos `.gitkeep`

Os arquivos `.gitkeep` (vazios) existem apenas para **forçar o Git a rastrear diretórios vazios**. Eles devem ser removidos assim que você adicionar um arquivo real na pasta.

**Exemplo:**
```bash
# Quando adicionar Mutex.js em app/src/concurrency/
git rm app/src/concurrency/.gitkeep
```

---

## 🚀 Fluxo de Trabalho Recomendado

```bash
# 1. Clone o projeto
git clone <repo>
cd projeto

# 2. Configure variáveis de ambiente
cp .env.example .env
# Edite .env com seus valores

# 3. Instale dependências
make install
# ou: cd app && npm install

# 4. Rode a simulação
make start
# ou: cd app && npm start

# 5. Rode testes
make test
# ou: cd app && npm test

# 6. Suba a stack de monitoramento (opcional)
docker-compose up -d
```

---

## 📝 Convenções de Nomenclatura

| Diretório / Arquivo | Convenção | Exemplo |
|---------------------|-----------|---------|
| Diretórios | `lowercase` com hífen se necessário | `src/`, `concurrency/`, `relatorio-transacoes/` |
| Arquivos JavaScript | `PascalCase` para classes, `camelCase` para scripts | `Conta.js`, `gerenciadorTransacoes.js` |
| Arquivos de config | `lowercase` separado por ponto | `docker-compose.yml`, `.env.example` |
| Testes | `.test.js` ou `.spec.js` suffixo | `Conta.test.js` |

---

> **Nota:** Esta estrutura segue os princípios de **Separação de Responsabilidades (SoC)** e **Clean Architecture**, adaptados para projetos Node.js acadêmicos e profissionais.
