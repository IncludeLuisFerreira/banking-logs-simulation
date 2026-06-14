# Simulação Otimista (MVCC) com Visualização de Contenção

## Problema

A simulação visual atual usa `Mutex` por conta (`Conta.js`), com locks que duram por toda a transação,
incluindo `await` e delays artificiais. Isso:
1. Bloqueia a conta inteira — irrealista vs bancos reais que usam row-level locking + MVCC
2. Segura o lock durante toda a transação — irrealista (em bancos reais, a operação de débito/crédito é atômica em microssegundos)
3. Impede leituras durante escritas — em bancos reais com MVCC, leitores não bloqueiam escritores
4. Cria a falsa impressão de que "lock de conta" é necessário para transações bancárias

## Solução

Remover o Mutex e adotar **controle de concorrência otimista (OCC) com versões**, similar ao MVCC
de bancos como PostgreSQL:

1. Cada `Conta` tem um campo `version` (número incremental)
2. `sacar(valor, versaoEsperada)` verifica se a versão atual corresponde à lida — se não, retorna `conflict`
3. `depositar(valor)` é sempre permitido (não há verificação de saldo)
4. Quando um worker detecta conflito, a transação é **retentada** (reinserida na fila)
5. Como `sacar` e `depositar` são síncronos (sem `await`), são **atomicamente executados** em Node.js

## Arquivos Alterados

### Conta.js
- Remover dependência de `Mutex`
- Adicionar campo `version = 0`
- `sacar(valorCentavos, versaoEsperada)` → retorna `{success, reason}` onde reason ∈ `{conflict, insufficient_funds, inactive}`
- `depositar(valorCentavos)` → retorna `boolean` (só falha se conta inativa)
- Remover métodos `tryLock()`, `remover()` simplificado (sem `drainWaiters`)

### GerenciadorTransacoes.js
- `executar()` não adquire locks
- Lê a `version` de `c1`, tenta `c1.sacar(valor, version)`
- Se conflito → retorna `STATES.CONFLICT` (novo estado) → transação é reinserida na fila
- Se sucesso → `c2.depositar(valor)`
- Se `depositar` falhar (conta inativa) → rollback: `c1.depositar(valor)` para restaurar saldo
- Emite eventos SSE para cada passo

### SimulacaoVisualService.js
- Remover `source` filter
- Emitir eventos de transação (lendo_origem, conflito, debitado) em vez de lock events
- Manter estrutura geral, apenas adaptar eventos

### LockLogger.js
- Sem mudanças necessárias (já é genérico)

### simulacao-visual.js (frontend)
- Remover processamento de: `lock:request`, `lock:acquired`, `lock:blocked`, `lock:timeout`, `lock:released`
- Adicionar processamento: `transacao:conflito`
- Contador de contenção no painel
- Estados visuais: `reading`, `debiting`, `committed`, `conflict`, `idle`

### simulacao-visual.html
- Legenda: remover `Lock`, `Bloqueado`, `Timeout`; adicionar `Conflito`, `Lendo`
- Contador de contenção ao lado de "Locks ativos" (renomear para "Transações ativas")

## Eventos SSE

| Evento | Descrição | payload |
|--------|-----------|---------|
| `transacao:lendo_origem` | Worker leu versão da origem | `{origemId, destinoId, threadId, version}` |
| `transacao:conflito` | Worker detectou mudança de versão | `{origemId, destinoId, threadId, versionEsperada, versionAtual}` |
| `transacao:debitado` | Débito atômico bem-sucedido | `{origemId, destinoId, valorCentavos, newVersion}` |
| `transacao:commit` | Transação completa (já existe) | `{origemId, destinoId, valorCentavos}` |
| `simulacao-visual:iniciada` | Simulação iniciou | `{contas, ...}` |
| `simulacao-visual:finalizada` | Simulação concluiu | `{timestamp}` |
| `simulacao-visual:parada` | Simulação interrompida | `{timestamp}` |

## Visualização da Contenção

- Conta com versão alterada (conflito): brilho vermelho + badge "⚡"
- Seta de transação conflitante: vermelha tracejada, label "Conflito - retentando..."
- Contador: "Contenções: N" no painel de transações
- Contas exibem versão atual (ex: "v3") abaixo do saldo

## Fluxo de Transação (com conflito)

```
Worker A lê Conta-X version=0
Worker B lê Conta-X version=0

Worker A: sacar(Conta-X, R$50, versão=0) → OK (version → 1)
Worker A: depositar(Conta-Y, R$50) → OK
Worker A: → SUCCESS

Worker B: sacar(Conta-X, R$30, versão=0) → CONFLICT (version atual=1)
Worker B: → retorna STATES.CONFLICT → transação reinserida na fila
Worker B (retry): sacar(Conta-X, R$30, versão=1) → OK
Worker B: depositar(Conta-Z, R$30) → OK
Worker B: → SUCCESS
```
