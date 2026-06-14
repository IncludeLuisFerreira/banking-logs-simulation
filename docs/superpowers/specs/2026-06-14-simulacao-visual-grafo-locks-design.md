# Visualizador Gráfico de Concorrência (Grafo de Locks) — Design

## Objetivo

Criar um ecrã interativo (`simulacao-visual.html`) que represente visualmente o processamento concorrente das transações bancárias, ilustrando o ciclo de vida dos locks das contas e os impasses, com animação abrandada para perceção humana.

---

## Arquitetura do Frontend

Reescrita completa do frontend visual com 4 módulos internos:

```
SSE Client → Event Queue (buffer) → Tick Timer → State Manager → Renderer
                                        ↕
                                 Speed Slider (UI)
```

### 1. SSE Client

- Conecta a `/simulacao/stream?token=<jwt>` via `EventSource`.
- Cada evento recebido é imediatamente empurrado (push) para a **Event Queue**.
- Não processa nada diretamente — apenas encaminha.

### 2. Event Queue (Buffer)

- Array FIFO (`eventBuffer[]`).
- Os eventos SSE são acumulados aqui sem processamento imediato.
- Um `setInterval` (tick) remove o evento mais antigo (`shift()`) e entrega ao **State Manager**.
- Se o buffer estiver vazio no tick, nada acontece.

### 3. Tick Timer + Speed Slider

- `setInterval` cujo intervalo é controlado por um slider HTML5 (`<input type="range">`) com valores entre **100ms** e **2000ms**.
- O slider mostra o valor atual em ms.
- Quando o slider muda, o temporizador é reiniciado com o novo intervalo (via `clearInterval` e novo `setInterval`).

### 4. State Manager

Dicionário central com 3 estruturas:

| Estrutura | Chave | Valor |
|-----------|-------|-------|
| `accountStates` | `contaId` | `{ hubLineState, borderState, saldo }` |
| `activeArrows` | `transacaoId` | `{ origemId, destinoId, arrowState, timerId }` |
| `stats` | — | `{ totalLocks, totalConflitos, totalSucessos }` |

> **Nota:** Usa-se `transacaoId` nas setas para suportar transferências concorrentes idênticas entre a mesma origem e destino sem sobreposição de estados.

### 5. Renderer

Desenha 3 camadas SVG no visual:

- **Arena:**
  - **Hub lines** — SVG `<line>` do centro (Banco) para cada conta. O estado visual muda (cor e estilo) conforme o `hubLineState`.
  - **Setas (Conta → Conta)** — SVG `<path>` ou `<line>` com marcador de seta entre a conta de origem e destino. O estado visual muda conforme o `arrowState`.
  - **Cards das contas** — Elementos `<g>` (SVG) ou `<div>` absolutas posicionadas em órbita via trigonometria. Borda e texto (incluindo o saldo) mudam conforme o `borderState`.

Todas as camadas partilham o mesmo espaço gráfico absoluto.

---

## Mapeamento de Estados Visuais

### Hub Lines (Banco → Conta)

| Evento | Estado visual |
|--------|---------------|
| *(inicial / `lock:released`)* | Cinza (`#555`) tracejado |
| `lock:request` | Amarelo (`#f0a030`) tracejado animado |
| `lock:acquired` | Amarelo (`#f0a030`) sólido |
| `lock:blocked` / `lock:timeout` | Vermelho (`#dc3545`) sólido |
| `transacao:success` | Verde (`#28a745`) sólido momentâneo (volta a cinza no release) |

### Setas (Conta → Conta)

| Evento | Estado visual |
|--------|---------------|
| `lock:request` | Amarelo (`#f0a030`) tracejado animado |
| `lock:acquired` | Amarelo (`#f0a030`) sólido |
| `lock:blocked` / `lock:timeout` | Vermelho (`#dc3545`) sólido |
| `transacao:success` | Verde (`#28a745`) sólido por 2s, depois faz fade out e é removida do DOM |

### Cards das Contas (borda)

| Evento | Estado visual |
|--------|---------------|
| *(inicial / `lock:released`)* | Cinza (`#555`) |
| `lock:request` | Amarelo (`#f0a030`) com efeito pulse |
| `lock:acquired` | Amarelo (`#f0a030`) sólido |
| Após `transacao:success` ou `lock:released` | Volta a Cinza (`#555`) |

---

## Layout Visual (Hub-and-Spoke)

```
                 ┌─────┐
               B │     │ C
           ┌─────┘     └─────┐
           │     [Banco]     │
      A    │     Central     │   D
           └─────┐     ┌─────┘
               E │     │ F
                 └─────┘
```

- **Banco Central:** Posicionado no centro absoluto (círculo ou container de 140×140px com estatísticas globais).
- **Contas:** Dispostas em órbita (trigonometria: `angle = (i / N) * 2π - π/2`).
- **Raio da órbita:** `min(largura, altura) / 2 - 90px`.
- **Hub lines:** Linhas retas do centro geométrico para as coordenadas exatas de cada conta.
- **Setas:** Linhas curvas ou retas ligando as contas periféricas entre si.

---

## Navegação

### Dashboard (`dashboard.html`)

Adicionar no painel de simulação:

```html
[▶ Simulação NxN]  [■ Parar]  [📊 Ver Simulação Visual]
```

- O botão **"Ver Simulação Visual"** é um link para `../html/simulacao-visual.html`.
- O JWT é preservado no `localStorage`, mantendo a autenticação ativa.

### Página Visual (`simulacao-visual.html`)

**Header de navegação:**

```html
[← Voltar ao Dashboard]  |  [Nome do Utilizador]  [Sair]
```

**Controlos:**

Barra de controlos no topo do ecrã visual:

```html
Nº de contas: [X]  [▶ Iniciar]  [■ Parar]  [Limpar]
Velocidade: ═══●═══════ 500ms  (100ms - 2000ms)
```

---

## Ficheiros Alterados / Criados

| Ficheiro | Tipo | Mudança |
|----------|------|---------|
| `app/public/js/simulacao-visual.js` | Reescrito | Nova arquitetura baseada em fluxo: SSE → Queue → Tick → Render. |
| `app/public/html/simulacao-visual.html` | Modificado | Adição do slider de velocidade e botões de controlo local e navegação. |
| `app/public/css/simulacao-visual.css` | Modificado | Estilos para as hub lines (animações de stroke), slider, e layout responsivo. |
| `app/public/html/dashboard.html` | Modificado | Inserção do botão "Ver Simulação Visual" no painel principal. |
| `app/public/css/dashboard.css` | Modificado | Estilização do novo botão de transição para o ecrã visual. |