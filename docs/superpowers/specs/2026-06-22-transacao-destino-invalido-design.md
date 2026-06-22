# Transação com Destino Inválido — Design

## Objetivo

Introduzir na simulação bancária uma probabilidade de contas enviarem transações para contas que não existem, gerando logs de erro coletados pelo Loki e exibidos em um dashboard Grafana específico "transação com destino inválido".

## Arquitetura

### Novos componentes

1. **FileLogger** (`app/src/utils/FileLogger.js`)
   - Singleton que escreve logs estruturados em JSON lines no arquivo `app/logs/error.log`
   - Método `error(tipo, dados)` — formata e persiste a linha
   - Usa `fs.appendFileSync` (operação rápida, sem concorrência problemática)

2. **Conta Sentinela** (`app/src/model/ContaInvalida.js`)
   - Instância única de `Conta` com `id = -1`, `saldoCentavos = 0`
   - Exportada como constante `CONTA_INVALIDA`
   - Usada como destino em transações simuladas que devem falhar

3. **Constante de ID inválido** (`app/src/model/ContaInvalida.js` ou inline)
   - `INVALID_ACCOUNT_ID = -1` — usado para detectar destino inválido nos executors

### Modificações em componentes existentes

#### `app/src/services/GerenciadorTransacoes.js`

- Novo método `_registrarDestinoInvalido(t, threadId)`:
  - Chama FileLogger.error com tipo `destino_invalido`, incluindo `origemId`, `destinoId`, `valorCentavos`, `threadId`, `timestamp`
  - Emite evento SSE `transacao:destino_invalido` via LockLogger

- Em cada método executor (`_executarOtimista`, `_executarLockNaive`, `_executarLockOrdenado`, `_executarLockTimeout`):
  - No início, após obter `c1` e `c2`, adicionar:
    ```js
    if (c2.id === INVALID_ACCOUNT_ID) {
      this._registrarDestinoInvalido(t, threadId);
      return STATES.INTERRUPTED;
    }
    ```

#### `app/src/services/SimulacaoService.js`

- Em `iniciarSimulacaoNxN()`:
  - Ao selecionar `destino`, com 10% de probabilidade (`Math.random() < 0.1`), usar `CONTA_INVALIDA` em vez da conta real

#### `app/src/services/SimulacaoVisualService.js`

- Em `_gerarTransacoesNxN()`:
  - Ao selecionar `destino`, com 10% de probabilidade, usar `CONTA_INVALIDA`

- Em `_gerarTransacoesAleatorio()`:
  - Mesma lógica: 10% de probabilidade de destino inválido

- Em `_gerarTransacoesDeadlock()`:
  - Mesma lógica: 10% de probabilidade de destino inválido (embora isso quebre o ciclo de deadlock proposital — o que é aceitável para o cenário de erro)

#### `app/src/metrics.js`

- (Opcional) Adicionar contador Prometheus `transacoes_destino_invalido_total` para métrica adicional

### Dashboard Grafana

Novo arquivo: `monitoring/grafana/dashboards/transacao-destino-invalido.json`

- Título: "Transação com Destino Inválido"
- Datasource: Loki
- Painéis:
  1. **Total de Erros** (stat) — contagem total de logs `destino_invalido`
  2. **Erros ao longo do tempo** (timeseries) — taxa de erros `destino_invalido` por intervalo
  3. **Últimos erros** (table/logs) — tabela com `origemId`, `destinoId`, `valorCentavos`, `timestamp`
  4. **Distribuição por conta origem** (bar chart) — quais contas mais enviaram para destinos inválidos

### Datasource Loki

Já configurado em `monitoring/grafana/datasources.yml` — não requer alteração.

### Pipeline de logs

```
App (FileLogger) → logs/error.log → Promtail (scrape) → Loki → Grafana Dashboard
```

## Formato do log

Cada linha em `logs/error.log`:

```json
{"tipo":"destino_invalido","origemId":3,"destinoId":-1,"valorCentavos":452,"threadId":"worker-7","timestamp":1719000000000,"mensagem":"Conta 3 tentou enviar R$ 4,52 para conta inexistente (-1)"}
```

O Promtail já coleta arquivos `.log` em `/app/logs/` e envia ao Loki com label `job=banking-simulation`.

## Tratamento de erros

- Se o FileLogger falhar ao escrever (ex: permissão), o erro é capturado com `try/catch` e logado no console — não deve quebrar a simulação
- Transações com destino inválido retornam `STATES.INTERRUPTED` e são descartadas (não re-enfileiradas)
- O LockLogger SSE também emite o evento para feedback em tempo real no frontend

## Considerações

- A probabilidade de 10% é aplicada no momento da geração da transação, não durante o processamento
- Contas sentinela não são adicionadas ao Map de contas do sistema
- O executor não tenta debitar/creditar da conta sentinela — a validação ocorre antes de qualquer operação
- O dashboard Grafana é provisionado automaticamente via arquivo JSON (já existe provisioning configurado)

## Testes

- Testar que `FileLogger.error()` escreve a linha JSON no arquivo
- Testar que o executor retorna `INTERRUPTED` para destino inválido
- Testar que a geração de transações produz ~10% de destinos inválidos (aproximação estatística)
- Testar que o evento SSE `transacao:destino_invalido` é emitido
