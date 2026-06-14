# Simulação Visual — Modo Aleatório + Segundo Hub de Workers

## Motivação
- Adicionar modo de simulação aleatório (não apenas NxN)
- Expandir a página de visualização para melhor aproveitamento de tela
- Adicionar um segundo hub visual mostrando as threads/workers trabalhando

## Layout da Página
- Arena expandida para ~90% da largura da viewport
- Contas posicionadas em um círculo grande (raio ~60% da arena)
- Workers posicionados em um círculo interno menor (raio ~30%)
- Dois hubs centrais lado a lado: "Banco Central" (esquerda) e "Thread Pool" (direita)
- Linhas SVG: hub→conta (hub lines) e worker→conta (worker lines)
- Transações NxN seguem entre contas (setas existentes)

## Modo Aleatório
- Usuário define intervalo: mínimo e máximo de transações
- Backend sorteia `random(min, max)` transações
- Cada transação: origem aleatória, destino aleatório (diferente), valor aleatório
- Mesmo fluxo de processamento (GerenciadorTransacoes com 10 workers)

## Worker Tracking (Frontend)
- `workerStates: Map<threadId, { state, contaId }>` atualizado por eventos SSE:
  - `lock:request` → state='requesting', contaId do data
  - `lock:acquired` → state='locked'
  - `lock:blocked/timeout` → state='blocked'/'timeout'
  - `lock:released` → state='idle', contaId=null
  - `transacao:success` → state='idle', contaId=null
- Workers renderizados como cards ao redor do hub "Thread Pool"
- Linhas do worker para a conta que está processando

## Mudanças nos Arquivos

### Backend
- `app/src/services/SimulacaoVisualService.js`:
  - `iniciar()` aceita `mode` ('nxn'|'random') e `transacaoRange` {min, max}
  - Lógica de geração de transações por modo
  - Emite `numWorkers` no evento `simulacao-visual:iniciada`

### Routes
- `app/app.js`: POST `/simulacao/visual` lê `mode` e `transacaoRange` do body

### Frontend
- `app/public/html/simulacao-visual.html`:
  - Radio buttons para modo (NxN / Aleatório)
  - Inputs de min/max transações (visíveis apenas no modo aleatório)
  - Segundo hub "Thread Pool" no HTML
  - Container `.visual-accounts` e `.visual-workers`

- `app/public/css/simulacao-visual.css`:
  - `.visual-page` mais largo
  - Estilos para `.visual-worker-card`
  - Estilos para `.worker-line`
  - Centralização dos dois hubs

- `app/public/js/simulacao-visual.js`:
  - `workerStates: Map` para rastrear workers
  - `processarEvento` atualiza estados dos workers
  - `renderizarWorkerCards()` desenha workers ao redor do hub
  - `renderizarWorkerLines()` desenha linhas worker→conta
  - `atualizarStats` inclui contagem de workers ativos
  - Lógica de seleção de modo no `iniciarSimulacao()`
