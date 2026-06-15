# Spec: Modo Caos & Detecção de Deadlock

**Data:** 2026-06-14
**Status:** Approved
**Autor:** Luis Ferreira

---

## 1. Visão Geral

Adicionar um modo educacional ao Banking Simulation onde o usuário pode forçar um cenário de deadlock multi-transação. O sistema monitora transações em tempo real via um **Wait-For Graph**, detecta matematicamente o ciclo de bloqueio via DFS, interrompe a simulação imediatamente e exibe um modal customizado com os IDs das transações e contas envolvidas.

---

## 2. Requisitos Funcionais

| ID | Descrição |
|---|---|
| **RF1** | A UI (`simulacao-visual.html`) deve oferecer uma nova opção `"Modo Caos (Forçar Deadlock)"` no seletor de modo, estilizada em vermelho com ícone de alerta. |
| **RF2** | Ao ativar este modo, o backend gera N transações formando um ciclo direcionado fechado: `T[k]: Conta[k] → Conta[(k+1) % N]`, todas com estratégia `lock-naive` forçada. |
| **RF3** | Um `DeadlockDetector` em `app/src/concurrency/` mantém um **Wait-For Graph** (`holds: contaId → transacaoId`, `waitingFor: transacaoId → contaId`) e executa DFS de detecção de ciclo a cada nova intenção de espera. |
| **RF4** | Ao detectar o ciclo, o backend emite o evento SSE `simulacao:deadlock_detectado` com o payload do ciclo, transações e contas envolvidas. |
| **RF5** | O frontend escuta o evento, congela as animações e exibe um **modal customizado** (estilo B — expanded overlay) com a descrição do ciclo linha por linha, contas envolvidas como badges, e dois botões: "Ver Arena" e "Voltar ao Controle". |
| **RF6** | Após a detecção, o backend drena a fila de transações (sem reenfileirar a transação causadora), limpa o estado do detector, e encerra todos os workers. |

---

## 3. Data Model & Algorithm

### 3.1. Wait-For Graph

```
holds:       Map<contaId, transacaoId>
waitingFor:  Map<transacaoId, contaId>
```

- `holds` é populado após `mutex.acquire()` bem-sucedido.
- `waitingFor` é populado antes da tentativa de `mutex.acquire()` do segundo lock.
- Ambos são limpos no `finally` de cada execução e no `clear()` da simulação.

### 3.2. DFS Cycle Detection

```
checkDeadlock(startTransacaoId):
    visited = Set()
    current = startTransacaoId
    path = []

    while current ∉ visited:
        visited.add(current)
        wantedConta = waitingFor.get(current)
        if !wantedConta → return null
        holderTransacao = holds.get(wantedConta)
        if !holderTransacao → return null
        path.push({ transacaoId: current, contaId: wantedConta })
        current = holderTransacao

    cycleStart = path.findIndex(p => p.transacaoId === current)
    return path.slice(cycleStart)
```

**Complexidade:** O(N) por chamada, onde N = número de transações em espera ativa.

---

## 4. Arquitetura

### 4.1. Novo Arquivo: `app/src/concurrency/DeadlockDetector.js`

```js
class DeadlockDetector {
  constructor()
  acquireHold(transacaoId, contaId)      // registra posse
  releaseHold(contaId)                   // libera posse
  registerWait(transacaoId, contaId)     // registra intenção de espera
  releaseWait(transacaoId)               // limpa intenção
  checkDeadlock(transacaoId)             // → Array | null
  clear()                                // reseta todos os mapas
}
```

### 4.2. Integração com `GerenciadorTransacoes.js`

**Constructor:** aceita `deadlockDetector` opcional.

**Fluxo modificado em `_executarLockNaive()`:**

```
1. acquireHold(t.id, c1.id)            ← após 1º mutex bem-sucedido
2. registerWait(t.id, c2.id)           ← antes da tentativa do 2º mutex
3. checkDeadlock(t.id)                 ← se ciclo encontrado:
   a. emitir 'simulacao:deadlock_detectado'
   b. this.running = false
   c. retornar STATES.DEADLOCK
4. c2.mutex.acquire(...)               ← prossegue se sem deadlock
5. acquireHold(t.id, c2.id)
   releaseWait(t.id)
6. finally: releaseHold(c1.id), releaseHold(c2.id)
```

**Novo estado:** `STATES.DEADLOCK = 'DEADLOCK'` — não reenfileira a transação.

### 4.3. Modificações em `SimulacaoVisualService.js`

- `iniciar()` aceita `mode='force-deadlock'`.
- Valida `numContas >= 3` para este modo.
- Força `estrategia = 'lock-naive'`.
- Cria instância de `DeadlockDetector` e injeta no `GerenciadorTransacoes`.
- Novo método `_gerarTransacoesDeadlock(numContas)` — gera N transações em ciclo.

---

## 5. Evento SSE

**Evento:** `simulacao:deadlock_detectado`

```json
{
  "ciclo": [
    { "transacaoId": 1, "contaId": 2, "descricao": "T1 esperando Conta B" },
    { "transacaoId": 2, "contaId": 3, "descricao": "T2 esperando Conta C" },
    { "transacaoId": 3, "contaId": 1, "descricao": "T3 esperando Conta A" }
  ],
  "contasEnvolvidas": [1, 2, 3],
  "transacoesEnvolvidas": [1, 2, 3],
  "transacoesHolding": [
    { "transacaoId": 1, "contaId": 1 },
    { "transacaoId": 2, "contaId": 2 },
    { "transacaoId": 3, "contaId": 3 }
  ],
  "simId": 1,
  "timestamp": 1700000000000
}
```

---

## 6. Frontend Changes

### 6.1. `simulacao-visual.html`

- Novo radio/option no seletor de modo: `Modo Caos (Forçar Deadlock)` com valor `force-deadlock`.
- Ao selecionar Modo Caos: ocultar/desabilitar dropdown `selectEstrategia` (forçado a lock-naive).
- Range mínimo de `numContas` ajustado para 3 quando Modo Caos ativo.

### 6.2. `simulacao-visual.js`

- **Payload de inicialização:** incluir `mode: 'force-deadlock'` no POST.
- **SSE Listener:** `eventSource.addEventListener('simulacao:deadlock_detectado', handler)`.
- **Handler:**
  1. Congelar animações (`running = false`, `clearTickTimer()`).
  2. Construir HTML do overlay com ciclo linha por linha usando dados do payload.
  3. Injetar `#deadlockOverlay` no DOM com animação `fadeInOverlay`.
  4. Botão "Ver Arena": fecha overlay, arena mostra estado congelado.
  5. Botão "Voltar ao Controle": fecha overlay, reseta UI para estado inicial.

### 6.3. `simulacao-visual.css`

- `#deadlockOverlay` — fundo semi-transparente, centralizado, z-index acima da arena.
- `.deadlock-modal` — card com borda vermelha, glow, animação de entrada (`slideUp` + `fadeIn`).
- `.deadlock-cycle-row` — linha individual do ciclo com borda à esquerda azul.
- `.deadlock-badge` — badge de transação (azul) e conta (amarelo).
- Botões: `.deadlock-btn-primary` (verde), `.deadlock-btn-secondary` (cinza escuro).

---

## 7. Edge Cases

| Cenário | Tratamento |
|---|---|
| Holder já liberou lock antes da detecção | `checkDeadlock()` retorna `null` — sem falso positivo |
| Parada manual durante force-deadlock | `parar()` → `detector.clear()` + `running=false` + `drainWaiters()` |
| Múltiplos workers detectam simultaneamente | Primeiro worker seta `running=false`; demais saem do loop |
| `numContas < 3` no Modo Caos | `iniciar()` retorna `{ error: '...' }` |
| Troca de modo com simulação ativa | Erro "Simulação visual já em andamento" (existente) |
| Transação com deadlock reenfileirada | Não ocorre — `STATES.DEADLOCK` não é reenfileirado |

---

## 8. Testes

| Arquivo | Tipo | Cenários |
|---|---|---|
| `__tests__/DeadlockDetector.test.js` | Unitário (novo) | 2-ciclo, 3-ciclo, sem ciclo, register-release-clear, concorrência |
| `__tests__/gerenciador.test.js` | Unitário (extender) | `_executarLockNaive` com detector, detecção dispara evento |
| Manual | Integração | Modo Caos 3 contas → overlay aparece com ciclo correto, botões funcionam |

---

## 9. Arquivos Afetados

| Arquivo | Tipo |
|---|---|
| `app/src/concurrency/DeadlockDetector.js` | **NEW** |
| `app/src/services/GerenciadorTransacoes.js` | MODIFY |
| `app/src/services/SimulacaoVisualService.js` | MODIFY |
| `app/public/html/simulacao-visual.html` | MODIFY |
| `app/public/js/simulacao-visual.js` | MODIFY |
| `app/public/css/simulacao-visual.css` | MODIFY |
| `app/__tests__/DeadlockDetector.test.js` | **NEW** |

**Arquivos NÃO alterados:** `LockLogger.js`, `Mutex.js`, `Transacao.js`, `Conta.js`, `AsyncPriorityQueue.js`.

---

## 10. Decisões de Design

| Decisão | Escolha |
|---|---|
| Localização do DeadlockDetector | `app/src/concurrency/` |
| API de integração | Hook explícito (não event-driven) |
| Estilo do modal | Expanded overlay (estilo B) |
| Escopo do cenário | N-transaction cycle (≥ 3) |
| Framework de modal | Custom vanilla HTML/CSS (sem SweetAlert2) |
