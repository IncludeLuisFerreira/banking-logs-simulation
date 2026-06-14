# Simulação Visual Gamificada — Design

## Motivação
Reformular o layout da página `simulacao-visual.html` com tema visual de jogo (gamificado), cores frias (azul/ciano), animações ricas, e painel de transações em tempo real com seções "Em andamento" e "Concluídas".

## Arquitetura
Não há mudança na arquitetura existente (SSE → buffer → tick → state manager → renderer). Apenas os componentes visuais (HTML, CSS, JS de renderização) são refeitos. A lógica de negócio e o fluxo de eventos permanecem idênticos.

```
[SSE Client] → [Event Buffer] → [Tick Timer] → [State Manager] → [Renderer]
                                                      ↕
                                               (mesmo state manager,
                                                novos estilos visuais)
```

## Layout da Página

```
┌─────────────────────────────────────────────────────────────┐
│ Header: ← Voltar  │  Simulação Visual de Locks  │ User │ Sair │
├─────────────────────────────────────────────────────────────┤
│ Controles: [Modo] [Nº contas] [▶ Iniciar] [■ Parar] [Limpar] │
│ Velocidade: ═══●══════ 500ms                                 │
├──────────────────┬──────────────────────────────────────────┤
│                  │                    [A]                    │
│   TRANSACTIONS   │              [B]         [C]             │
│   ─────────────  │                                         │
│                  │           [H]  [🏦 Banco     [D]        │
│   EM ANDAMENTO   │                Central]                  │
│   ┌────────────┐ │              [G]         [E]             │
│   │ A → D $50  │ │                    [F]                   │
│   │ (loading)  │ │                                          │
│   └────────────┘ │                                          │
│                  │         (SVG hub lines + arrows)          │
│   CONCLUÍDAS     │                                          │
│   ┌────────────┐ │                                          │
│   │ B → C $30  │ │                                          │
│   │ D → A $10  │ │                                          │
│   └────────────┘ │                                          │
├──────────────────┴──────────────────────────────────────────┤
│ Legenda: 🔵 Solicitando  🟢 Lock  🔴 Bloqueado  ⚪ Livre    │
└─────────────────────────────────────────────────────────────┘
```

## Paleta de Cores (Tema Frio)

| Elemento | Cor | Uso |
|----------|-----|-----|
| Fundo página | `#050a1a` → `#0a1628` | Gradiente escuro azul profundo |
| Cards/superfícies | `rgba(255,255,255,0.05)` a `0.08` | Glassmorphism com backdrop-blur |
| Primária ativa | `#00d4ff` (ciano) | Progresso, hubs, destaques |
| Requesting | `#4fc3f7` (azul claro) | Status solicitando lock |
| Lock/Success | `#00e676` (verde água) | Lock adquirido, transação OK |
| Blocked/Timeout | `#ef5350` (vermelho suave) | Contenção |
| Texto primário | `#e0e8f0` | Texto normal |
| Texto secundário | `#8899aa` | Labels, métricas |
| Borda padrão | `rgba(255,255,255,0.08)` | Divisores |

## Componentes

### 1. Header
Sem mudanças funcionais. Apenas ajuste de cor e tipografia.

### 2. Controles + Slider de Velocidade
Mesma posição e funcionalidade. Botões com estilo game: bordas arredondadas, hover com glow ciano. Slider com accent-color ciano (`#00d4ff`).

### 3. Painel de Transações (lado esquerdo)
**Mudança principal**: substituir o log linear por duas seções:

- **Em Andamento**: lista de transações sendo processadas no momento. Cada entrada mostra:
  - Rota: `A → D`
  - Valor: `R$ 50,00`
  - Spinner animado (giro ciano)
  - Transações entram aqui quando chega `lock:request` e saem quando chega `transacao:success` ou `lock:timeout`

- **Concluídas**: lista cumulativa de transações finalizadas com sucesso
  - Mesmo formato: `A → D  R$ 50,00`
  - Checkmark verde (`✓`)
  - Scroll infinito com fade-in
  - Botão "Limpar" no header

- **Contador**: badge no header do painel mostrando `Em andamento: 3 | Concluídas: 47`

### 4. Arena Hub-and-Spoke
- **Banco Central**: círculo com glow animado (pulse ciano), estatísticas em HUD
- **Contas em órbita**: posicionamento circular existente, cards redesenhados

### 5. Cards das Contas (redesign)
```
┌──────────────────┐
│     [ A ]        │ ← letra em círculo com glow da cor de estado
│                  │
│  R$ 1.250,00     │ ← saldo com fonte maior e bold
│                  │
│  ████████░░░░░   │ ← barra de saldo (health bar): azul/ciano
│                  │
│  🔵 Solicitando  │ ← status com ícone + texto
└──────────────────┘
```

**Estados da borda**:
- `idle`: borda `rgba(255,255,255,0.15)` sem glow
- `requesting`: borda `#4fc3f7` com pulse glow
- `locked`: borda `#00e676` com glow verde
- `blocked`/`timeout`: borda `#ef5350` com glow vermelho

**Barra de saldo**: width = `(saldoAtual / saldoInicial) * 100%`. Cor gradiente azul → ciano.

### 6. SVG Hub Lines (Banco → Conta)
Mesmo conceito, cores atualizadas:
- `idle`: `rgba(255,255,255,0.1)` tracejado
- `requesting`: `#4fc3f7` tracejado animado
- `locked`: `#00e676` sólido
- `blocked`/`timeout`: `#ef5350` sólido
- `success`: `#00e676` com fade

### 7. Setas (Conta → Conta)
- Traço animado (dash-offset) em ciano durante `requesting`
- Verde para success com duração de 2s
- Vermelho para blocked/timeout
- **Valor flutuante**: label `R$ 50,00` que aparece no meio da seta e desaparece após 2s

### 8. Partículas de Fundo
- Sistema simples de partículas (50-80 pontos)
- Movimento lento vertical (flutuação)
- Cor ciano com opacidade 0.15-0.3
- Tamanho 1-3px
- Renderizado em canvas separado ou CSS

### 9. Tela de Resultados (overlay final)
Aparece quando `simulacao-visual:finalizada` chega:
- Background semi-transparente com backdrop-blur
- Card central com:
  - "Simulação Concluída! 🎉"
  - Transações: total, sucesso, taxa de contenção
  - Duração total
  - Botão "Nova Simulação" (fecha overlay e permite reiniciar)
- Números animados (contam de 0 até o valor final)

## Estados da Simulação

| Estado | Trigger | Painel | Botões |
|--------|---------|--------|--------|
| Parado | inicial / stop | vazio | Iniciar habilitado |
| Iniciando | POST /simulacao/visual | "Iniciando..." | Iniciar desabilitado |
| Rodando | SSE `simulacao-visual:iniciada` | Conectado, tick rodando | Parar habilitado |
| Concluída | SSE `simulacao-visual:finalizada` | Timer parado, overlay | Iniciar habilitado |

## Eventos SSE Relevantes

| Evento | Payload | Ação no frontend |
|--------|---------|------------------|
| `lock:request` | `{threadId, origemId, destinoId, source}` | Adiciona ao "Em andamento", muda estado conta para requesting |
| `lock:acquired` | `{threadId, contaId}` | Muda estado conta para locked |
| `lock:blocked` | `{threadId, contaId}` | Muda estado conta para blocked |
| `lock:timeout` | `{threadId, contaId, origemId, destinoId}` | Remove do "Em andamento", muda conta para timeout |
| `lock:released` | `{threadId, contaId}` | Muda conta para idle |
| `transacao:success` | `{threadId, origemId, destinoId, valorCentavos}` | Move de "Em andamento" para "Concluídas", atualiza saldos |
| `simulacao-visual:iniciada` | `{contas, ...}` | Inicializa estado, renderiza contas |
| `simulacao-visual:finalizada` | `{timestamp, source}` | Para timer, exibe overlay de resultados |
| `simulacao-visual:parada` | `{timestamp, source}` | Para timer, limpa estado |

## Rastreamento de Transações em Andamento

O state manager ganha uma nova estrutura:

```js
let transacoesEmAndamento = new Map(); // key: `${origemId}-${destinoId}`, value: { origemId, destinoId, valorCentavos, inicioTimestamp }
```

- `lock:request` com `origemId` e `destinoId` → adiciona ao Map
- `transacao:success` ou `lock:timeout` com `origemId` e `destinoId` → remove do Map
- O painel "Em andamento" renderiza as entries deste Map
- O painel "Concluídas" é o log existente (array cumulativo)

## Arquivos Alterados

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `app/public/html/simulacao-visual.html` | Modificado | Novo layout com painel de transações reformulado |
| `app/public/css/simulacao-visual.css` | Reescrito | Paleta fria, glassmorphism, animações gamificadas |
| `app/public/js/simulacao-visual.js` | Modificado | Renderer atualizado para novos cards, painel em andamento/concluídas, partículas, overlay de resultados |

## Fora de Escopo (YAGNI)

- Trilha sonora / efeitos sonoros
- Score ou achievements
- Conexão com backend de leaderboard
- Modo espectador / replay
- Responsividade mobile (escopo atual: desktop)
