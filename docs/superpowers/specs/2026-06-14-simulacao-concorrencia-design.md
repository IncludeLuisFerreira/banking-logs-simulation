# Simulação de Concorrência Bancária — Design

## Objetivo

Integrar a lógica de concorrência multithread (Mutex, AsyncPriorityQueue,
Conta, Transacao, GerenciadorTransacoes) com o dashboard da aplicação,
fornecendo interface visual para gerenciamento dinâmico de contas,
simulação de estresse NxN e monitoramento em tempo real de locks.

## Arquitetura

```
Browser (Dashboard)                     Servidor Express
 ┌──────────────────┐       SSE         ┌─────────────────────────────┐
 │  Account Panel   │ ←── /simulacao/stream  ──┐                     │
 │  (add/remove)    │                  │        ▼                     │
 │                  │   REST POST/DEL  │  SimulacaoService            │
 │  Sim. Button     │ ──────────────→  │  ├─ Map<id, Conta>          │
 │  (NxN stress)    │                  │  ├─ adicionarConta()         │
 │                  │                  │  ├─ removerConta()           │
 │  Real-time Log   │                  │  └─ iniciarSimulacaoNxN()    │
 │  (SSE viewer)    │                  │                              │
 └──────────────────┘                  │  LockLogger (EventEmitter)   │
                                       │  ├─ escuta eventos da Conta  │
                                       │  └─ emite para SSE clients   │
                                       │                              │
                                       │  GerenciadorTransacoes       │
                                       │  ├─ workers processam fila   │
                                       │  └─ verifica conta.ativa     │
                                       └─────────────────────────────┘
```

## Componentes

### SimulacaoService (novo)

Singleton que gerencia o pool de contas em memória e o ciclo de vida da
simulação.

```
estado:
  contas: Map<number, { conta: Conta, nome: string }>
  simulacaoAtiva: boolean
  gerenciadorAtual: GerenciadorTransacoes | null
  lockLogger: LockLogger

adicionarConta(saldoInicial, nome?)
  - cria Conta com ID auto-incremento
  - assina eventos de lock no LockLogger
  - retorna { id, nome, saldo }

removerConta(id) → boolean
  - marca conta.ativa = false
  - drena waiters do mutex: libera threads presas
  - remove do Map
  - emite SSE: 'conta:removida'

iniciarSimulacaoNxN()
  - itera todas as contas ativas
  - para cada par (origem, destino) com origem ≠ destino:
      valor = Math.random() * (saldoOrigem * 0.1)
      cria Transacao(origem, destino, valor)
  - adiciona todas no GerenciadorTransacoes
  - gerenciador.start()
  - SSE: 'simulacao:iniciada'

pararSimulacao()
  - gerenciador.running = false
  - limpa fila pendente
  - SSE: 'simulacao:parada'
```

### LockLogger (novo)

EventEmitter que centraliza o log de eventos de lock.

| Evento | Disparo | Payload |
|--------|---------|---------|
| `lock:request` | thread tenta acquire/tryAcquire | `{threadId, contaId, origemId, destinoId}` |
| `lock:acquired` | lock concedido | `{threadId, contaId, tempoEsperaMs}` |
| `lock:blocked` | thread entrou na fila de espera | `{threadId, contaId}` |
| `lock:timeout` | tryLock expirou | `{threadId, contaId, timeoutMs}` |
| `lock:released` | lock liberado | `{threadId, contaId, heldForMs}` |

Características:
- Buffer circular (últimos 500 eventos) para clients que conectam depois
- Cada evento é encaminhado para todos os SSE clients ativos
- Formato SSE: `event: <tipo>\ndata: <json>`

### Mutex (modificado)

Estende EventEmitter para emitir eventos de lock.

```js
class Mutex extends EventEmitter {
  async acquire(threadId, origemId, destinoId) {
    this.emit('lock:request', { threadId, contaId, origemId, destinoId });
    return new Promise((resolve) => {
      const release = () => { /* ... */ };
      if (!this._locked) {
        this._locked = true;
        this.emit('lock:acquired', { threadId, contaId, tempoEsperaMs: 0 });
        resolve(release);
      } else {
        this.emit('lock:blocked', { threadId, contaId });
        this._waiters.push(resolve);
      }
    });
  }
}
```

### Conta (modificado)

Adiciona flag `ativa` e método `remover()`.

```js
class Conta {
  constructor(id, saldoInicialCentavos) {
    this.id = id;
    this.saldoCentavos = saldoInicialCentavos;
    this.mutex = new Mutex();
    this.ativa = true;
  }

  remover() {
    this.ativa = false;
    this.mutex._waiters.forEach(resolve => resolve(() => {}));
    this.mutex._waiters = [];
  }
}
```

### GerenciadorTransacoes (modificado)

Workers verificam `conta.ativa` antes de processar.

```js
async executar(t) {
  const c1 = t.getOrigem();
  const c2 = t.getDestino();

  if (!c1.ativa || !c2.ativa) return STATES.INTERRUPTED;

  // Lock ordering por ID (já implementado)
  // ...
}
```

## Rotas da API

### REST

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/simulacao/contas` | Lista contas ativas |
| POST | `/simulacao/contas` | Adiciona conta (body: `{saldoInicial, nome?}`) |
| DELETE | `/simulacao/contas/:id` | Remove conta |
| POST | `/simulacao/stress` | Inicia simulação NxN |
| POST | `/simulacao/stop` | Para simulação |

### SSE

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/simulacao/stream` | Stream de eventos de lock/transação |

## Dashboard UI

Layout com 3 áreas:

1. **Contas** — input de saldo + botão adicionar; lista de contas com botão
   remover cada
2. **Simulação** — botão "Simulação NxN", status (parado/rodando),
   contadores (transações, locks OK, bloqueios)
3. **Logs** — scroll container com entradas coloridas via SSE, botão limpar

### Eventos SSE renderizados:

| Evento | Cor | Ícone | Exemplo |
|--------|-----|-------|---------|
| `lock:acquired` | verde | 🔓 | `worker-3 adquiriu lock conta #1` |
| `lock:blocked` | amarelo | 🔒 | `worker-7 bloqueada aguardando conta #3` |
| `lock:timeout` | vermelho | ⏰ | `worker-4 timeout conta #3 (500ms)` |
| `transacao:success` | verde | ✅ | `worker-1 #2 → #4: R$ 50,00` |
| `conta:removida` | cinza | ❌ | `Conta #6 removida do pool` |

## Tratamento de Condições de Corrida

1. **Lock ordering:** GerenciadorTransacoes.executar() sempre adquire locks
   na ordem crescente de ID. Isso elimina circular wait — a 4ª condição
   necessária para deadlocks clássicos.

2. **Safe removal:** Ao remover uma conta (removerConta), a flag `ativa` é
   setada para `false` antes da drenagem dos waiters. Workers verificam
   `conta.ativa` em dois momentos: antes de tentar o lock e imediatamente
   após adquirir ambos os locks (double-check). Isso evita o cenário onde
   uma conta é removida entre a verificação e o lock.

3. **Drenagem de waiters:** Quando uma conta é removida, todos os waiters
   do mutex são resolvidos com um unlock vazio. Isso impede que threads
   fiquem eternamente bloqueadas esperando uma conta que não existe mais.

4. **Double-check post-lock:** Após adquirir ambos os locks, o worker
   verifica novamente se ambas as contas ainda estão ativas. Se alguma
   foi removida durante a espera do lock, a transação é abortada com
   INTERRUPTED e os locks são liberados.

5. **EventEmitter thread-safety:** No Node.js single-threaded (event loop),
   EventEmitter é naturalmente thread-safe. A ordem de chegada no event
   loop reflete a ordem real dos eventos — não há race condition no
   logger.

## Estratégia de Deadlock

O NxN stress test força alta contenção propositalmente:
- `N` contas, cada uma dispara `N-1` transferências simultâneas
- Lock ordering previne deadlock clássico (circular wait)
- `tryLock(500ms)` expira → `LOCK_FAILED` → transação re-enfileirada
- O log mostra contenção em tempo real: acquired (verde), blocked
  (amarelo), timeout (vermelho)
- Ao final, o relatório mostra total de lock attempts vs bem-sucedidos,
  evidenciando o gargalo

## Arquivos Alterados

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `app/src/concurrency/Mutex.js` | modificado | extends EventEmitter, emite eventos |
| `app/src/model/Conta.js` | modificado | flag ativa, método remover() |
| `app/src/services/GerenciadorTransacoes.js` | modificado | verificação ativa, parâmetro threadId |
| `app/src/services/SimulacaoService.js` | novo | gerencia pool + ciclo de simulação |
| `app/src/services/LockLogger.js` | novo | EventEmitter + buffer + SSE fan-out |
| `app/app.js` | modificado | novas rotas REST + SSE |
| `app/public/html/dashboard.html` | modificado | painel de simulação completo |
| `app/public/js/dashboard.js` | modificado | SSE client + controles |
| `app/public/css/dashboard.css` | modificado | estilos do painel de simulação |
