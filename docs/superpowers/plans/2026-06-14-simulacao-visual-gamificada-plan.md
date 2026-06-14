# Simulação Visual Gamificada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `simulacao-visual.html` com tema gamificado (cores frias azul/ciano), painel de transações com "Em andamento" e "Concluídas", cards com progress bar, partículas de fundo, overlay de resultados.

**Architecture:** Mesma arquitetura SSE → buffer → tick → state manager → renderer. Apenas componentes visuais são refeitos (HTML, CSS, JS de renderização).

**Tech Stack:** Vanilla JS, CSS3 animations, SVG, Canvas (partículas), Express (backend inalterado).

---

### Task 1: Atualizar HTML com novo layout

**Files:**
- Modify: `app/public/html/simulacao-visual.html`

- [ ] **Step 1: Reescrever o HTML**

Substituir todo o conteúdo de `app/public/html/simulacao-visual.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Banking Simulation — Visual</title>
  <link rel="stylesheet" href="../css/login.css">
  <link rel="stylesheet" href="../css/simulacao-visual.css">
</head>
<body>
  <canvas id="particlesCanvas" class="particles-canvas"></canvas>

  <main class="visual-page">
    <header class="visual-header">
      <a href="dashboard.html" class="btn btn--back">← Voltar ao Dashboard</a>
      <h1>Simulação Visual de Locks</h1>
      <div class="visual-user">
        <span id="userDisplay" class="visual-username"></span>
        <button id="btnLogout" class="btn btn--primary">Sair</button>
      </div>
    </header>

    <div class="visual-controls">
      <label class="form-label">Modo:</label>
      <label class="radio-label"><input type="radio" name="simMode" value="nxn" checked> NxN</label>
      <label class="radio-label"><input type="radio" name="simMode" value="random"> Aleatório</label>

      <span class="control-separator"></span>

      <label class="form-label">Nº de contas:</label>
      <input type="number" id="inputNumContas" class="form-input" value="8" min="5" max="15">

      <div id="randomControls" class="random-controls" hidden>
        <label class="form-label">Transações:</label>
        <input type="number" id="inputTransMin" class="form-input input-small" value="15" min="1" placeholder="mín">
        <span class="form-label">~</span>
        <input type="number" id="inputTransMax" class="form-input input-small" value="40" min="1" placeholder="máx">
      </div>

      <button id="btnIniciar" class="btn btn--start">▶ Iniciar</button>
      <button id="btnParar" class="btn btn--stop" disabled>■ Parar</button>
      <button id="btnLimpar" class="btn btn--ghost">Limpar</button>
      <span id="visualStatus" class="status-badge status-idle">Parado</span>
    </div>

    <div class="visual-controls visual-controls--speed">
      <label class="form-label">Velocidade:</label>
      <input type="range" id="speedSlider" class="speed-slider" min="100" max="2000" value="500" step="50">
      <span id="speedLabel" class="speed-label">500ms</span>
      <span class="speed-range">(100ms — 2000ms)</span>
    </div>

    <div class="visual-arena" id="visualArena">
      <div class="transacao-panel" id="transacaoPanel">
        <div class="transacao-panel-header">
          <span>Transações</span>
          <span id="painelContador" class="painel-contador"></span>
          <button id="btnLimparLogTransacoes" class="btn--small">Limpar</button>
        </div>

        <div class="painel-secao">
          <div class="painel-secao-header">
            <span class="painel-secao-titulo">Em Andamento</span>
            <span id="contadorEmAndamento" class="painel-badge">0</span>
          </div>
          <div class="painel-secao-lista" id="painelEmAndamento">
            <p class="painel-placeholder">Nenhuma transação em andamento.</p>
          </div>
        </div>

        <div class="painel-secao">
          <div class="painel-secao-header">
            <span class="painel-secao-titulo">Concluídas</span>
            <span id="contadorConcluidas" class="painel-badge painel-badge--success">0</span>
          </div>
          <div class="painel-secao-lista" id="painelConcluidas">
            <p class="painel-placeholder">Nenhuma transação concluída.</p>
          </div>
        </div>
      </div>

      <svg id="svgLines" class="visual-svg"></svg>

      <div class="visual-center" id="visualCenter">
        <div class="center-ring"></div>
        <div class="center-icon">🏦</div>
        <div class="center-label">Banco Central</div>
        <div class="center-stats">
          <span>Transferências: <strong id="totalTransacoes">0</strong></span>
          <span>Locks ativos: <strong id="locksAtivos">0</strong></span>
        </div>
      </div>

      <div class="visual-accounts" id="visualAccounts"></div>
    </div>

    <div class="visual-legend">
      <span class="legend-item"><span class="legend-dot requesting"></span> Solicitando</span>
      <span class="legend-item"><span class="legend-dot locked"></span> Lock</span>
      <span class="legend-item"><span class="legend-dot blocked"></span> Bloqueado</span>
      <span class="legend-item"><span class="legend-dot idle"></span> Livre</span>
    </div>

    <div class="feedback" id="feedback" role="alert" hidden></div>
  </main>

  <div class="overlay" id="resultsOverlay" hidden>
    <div class="overlay-card">
      <h2 class="overlay-title">Simulação Concluída!</h2>
      <div class="overlay-stats">
        <div class="overlay-stat">
          <span class="overlay-stat-value" id="resultsTotal">0</span>
          <span class="overlay-stat-label">Total</span>
        </div>
        <div class="overlay-stat">
          <span class="overlay-stat-value" id="resultsSucesso">0</span>
          <span class="overlay-stat-label">Sucesso</span>
        </div>
        <div class="overlay-stat">
          <span class="overlay-stat-value" id="resultsContencao">0%</span>
          <span class="overlay-stat-label">Contenção</span>
        </div>
        <div class="overlay-stat">
          <span class="overlay-stat-value" id="resultsDuracao">0s</span>
          <span class="overlay-stat-label">Duração</span>
        </div>
      </div>
      <button id="btnNovaSimulacao" class="btn btn--start">🔄 Nova Simulação</button>
    </div>
  </div>

  <script src="../js/api.js"></script>
  <script src="../js/simulacao-visual.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verificar sintaxe HTML**

Run: `node -e "const fs=require('fs'); const h=fs.readFileSync('app/public/html/simulacao-visual.html','utf8'); console.log('HTML lido:', h.length, 'bytes')"`
Expected: No errors, file length > 1000 bytes.

- [ ] **Step 3: Commit**

```bash
git add app/public/html/simulacao-visual.html
git commit -m "feat(visual): novo HTML com painel de andamento/concluidas e overlay"
```

---

### Task 2: Reescrever CSS com tema gamificado

**Files:**
- Rewrite: `app/public/css/simulacao-visual.css`

- [ ] **Step 1: Escrever o CSS completo**

Substituir todo o conteúdo de `app/public/css/simulacao-visual.css`:

```css
/* ============================================================
   Tema: Gamificado Frio (Azul/Ciano)
   ============================================================ */

/* --- Page Base --- */
.visual-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #050a1a 0%, #0a1628 50%, #0d1f3c 100%);
  color: #e0e8f0;
  display: flex;
  flex-direction: column;
  max-width: 100vw;
  position: relative;
  overflow: hidden;
}

.particles-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

/* --- Header --- */
.visual-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 24px;
  background: rgba(0, 212, 255, 0.04);
  border-bottom: 1px solid rgba(0, 212, 255, 0.1);
  position: relative;
  z-index: 1;
}

.visual-header h1 {
  font-size: 18px;
  margin: 0;
  color: #e0e8f0;
  letter-spacing: 0.5px;
}

.visual-user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.visual-username {
  font-weight: bold;
  color: #4fc3f7;
}

/* --- Back Button --- */
.btn--back {
  background: transparent;
  color: #4fc3f7;
  border: 1px solid rgba(79, 195, 247, 0.3);
  padding: 6px 14px;
  border-radius: 8px;
  text-decoration: none;
  font-size: 13px;
  transition: all 0.2s;
}
.btn--back:hover {
  background: rgba(79, 195, 247, 0.1);
  border-color: #4fc3f7;
  box-shadow: 0 0 12px rgba(79, 195, 247, 0.2);
}

/* --- Controls Bar --- */
.visual-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: rgba(0, 212, 255, 0.02);
  border-bottom: 1px solid rgba(0, 212, 255, 0.06);
  flex-wrap: wrap;
  position: relative;
  z-index: 1;
}

.visual-controls--speed {
  border-bottom: none;
  border-top: 1px solid rgba(0, 212, 255, 0.06);
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
  color: #8899aa;
}
.radio-label input:checked ~ * {
  color: #4fc3f7;
}

.control-separator {
  width: 1px;
  height: 24px;
  background: rgba(0, 212, 255, 0.15);
}

.random-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-small {
  width: 70px !important;
  padding: 6px 8px !important;
  font-size: 13px !important;
}

.form-input {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: 6px;
  color: #e0e8f0;
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.form-input:focus {
  border-color: #00d4ff;
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.15);
}
.form-label {
  font-size: 13px;
  color: #8899aa;
}

/* --- Game Buttons --- */
.btn--start {
  background: linear-gradient(135deg, #00d4ff, #0091ea);
  color: #fff;
  border: none;
  padding: 7px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.2);
}
.btn--start:hover:not(:disabled) {
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
  transform: translateY(-1px);
}
.btn--start:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.btn--stop {
  background: linear-gradient(135deg, #ef5350, #c62828);
  color: #fff;
  border: none;
  padding: 7px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 0 12px rgba(239, 83, 80, 0.2);
}
.btn--stop:hover:not(:disabled) {
  box-shadow: 0 0 20px rgba(239, 83, 80, 0.4);
  transform: translateY(-1px);
}
.btn--stop:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.btn--ghost {
  background: transparent;
  color: #8899aa;
  border: 1px solid rgba(0, 212, 255, 0.15);
  padding: 7px 18px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn--ghost:hover {
  color: #e0e8f0;
  border-color: rgba(0, 212, 255, 0.3);
}

/* --- Speed Slider --- */
.speed-slider {
  width: 160px;
  accent-color: #00d4ff;
  cursor: pointer;
}
.speed-label {
  font-size: 13px;
  font-weight: bold;
  color: #00d4ff;
  min-width: 50px;
}
.speed-range {
  font-size: 11px;
  color: #556677;
}

/* --- Status Badge --- */
.status-badge {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.status-idle {
  background: rgba(85, 102, 119, 0.2);
  color: #8899aa;
  border: 1px solid rgba(85, 102, 119, 0.3);
}
.status-running {
  background: rgba(0, 212, 255, 0.15);
  color: #00d4ff;
  border: 1px solid rgba(0, 212, 255, 0.3);
  animation: pulse-badge 1.5s ease-in-out infinite;
}
.status-concluida {
  background: rgba(0, 230, 118, 0.15);
  color: #00e676;
  border: 1px solid rgba(0, 230, 118, 0.3);
}

@keyframes pulse-badge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* --- Arena --- */
.visual-arena {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 520px;
  width: 100%;
  z-index: 1;
}

/* --- Transaction Panel --- */
.transacao-panel {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 230px;
  background: rgba(10, 14, 39, 0.85);
  border-right: 1px solid rgba(0, 212, 255, 0.08);
  z-index: 10;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(8px);
}

.transacao-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(0, 212, 255, 0.08);
  font-size: 12px;
  font-weight: bold;
  color: #8899aa;
}

.painel-contador {
  font-size: 11px;
  color: #556677;
  font-weight: normal;
}

.transacao-panel-header .btn--small {
  padding: 2px 8px;
  font-size: 10px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(0, 212, 255, 0.1);
  color: #8899aa;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}
.transacao-panel-header .btn--small:hover {
  background: rgba(255,255,255,0.1);
  color: #e0e8f0;
}

/* --- Panel Sections --- */
.painel-secao {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.painel-secao:first-of-type {
  flex: 0 0 auto;
  max-height: 40%;
  border-bottom: 1px solid rgba(0, 212, 255, 0.06);
}

.painel-secao-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 11px;
  color: #556677;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.painel-secao-titulo {
  font-weight: bold;
}

.painel-badge {
  background: rgba(0, 212, 255, 0.1);
  color: #00d4ff;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
}

.painel-badge--success {
  background: rgba(0, 230, 118, 0.1);
  color: #00e676;
}

.painel-secao-lista {
  flex: 1;
  overflow-y: auto;
  padding: 2px 0;
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.painel-placeholder {
  color: #556677;
  font-style: italic;
  padding: 12px;
  text-align: center;
  font-size: 11px;
  font-family: inherit;
}

/* --- Transaction Entries --- */
.transacao-entry {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 14px;
  border-bottom: 1px solid rgba(0, 212, 255, 0.04);
  color: #e0e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  animation: fadeInEntry 0.3s ease;
}

.transacao-entry--in-progress {
  color: #4fc3f7;
}

.transacao-entry--completed {
  color: #00e676;
}

.transacao-entry .entry-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid rgba(79, 195, 247, 0.3);
  border-top-color: #4fc3f7;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

.transacao-entry .entry-check {
  color: #00e676;
  font-weight: bold;
  flex-shrink: 0;
}

.transacao-entry .entry-origem {
  color: #4fc3f7;
  font-weight: bold;
}

.transacao-entry .entry-seta {
  color: #556677;
}

.transacao-entry .entry-destino {
  color: #00e676;
  font-weight: bold;
}

.transacao-entry .entry-valor {
  color: #00d4ff;
  font-weight: bold;
  margin-left: auto;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeInEntry {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}

/* --- SVG --- */
.visual-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.visual-svg line {
  stroke-width: 2.5;
  stroke-linecap: round;
}

/* --- Bank Hub --- */
.visual-center {
  position: absolute;
  z-index: 2;
  text-align: center;
  background: rgba(0, 212, 255, 0.06);
  border: 2px solid rgba(0, 212, 255, 0.2);
  border-radius: 50%;
  width: 140px;
  height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  backdrop-filter: blur(6px);
  transition: border-color 0.3s, box-shadow 0.3s;
}

.center-ring {
  position: absolute;
  width: 150%;
  height: 150%;
  border: 1px solid rgba(0, 212, 255, 0.1);
  border-radius: 50%;
  animation: ring-rotate 8s linear infinite;
  pointer-events: none;
}

.center-ring::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 50%;
  width: 6px;
  height: 6px;
  background: #00d4ff;
  border-radius: 50%;
  transform: translateX(-50%);
}

@keyframes ring-rotate {
  to { transform: rotate(360deg); }
}

.center-icon {
  font-size: 28px;
  position: relative;
  z-index: 1;
}

.center-label {
  font-size: 11px;
  font-weight: bold;
  color: #8899aa;
  position: relative;
  z-index: 1;
}

.center-stats {
  font-size: 11px;
  color: #556677;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
  z-index: 1;
}

.center-stats strong {
  color: #00d4ff;
}

/* --- Account Cards --- */
.visual-accounts {
  position: absolute;
  top: 0;
  left: 230px;
  right: 0;
  bottom: 0;
  z-index: 3;
  pointer-events: none;
}

.conta-card {
  position: absolute;
  pointer-events: auto;
  width: 100px;
  padding: 12px;
  border-radius: 12px;
  text-align: center;
  background: rgba(16, 26, 56, 0.85);
  border: 2px solid rgba(255,255,255,0.1);
  cursor: default;
  transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s;
  transform: translate(-50%, -50%);
  backdrop-filter: blur(4px);
}

.conta-card:hover {
  transform: translate(-50%, -50%) scale(1.05);
}

.conta-card .conta-letter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 212, 255, 0.1);
  font-size: 16px;
  font-weight: bold;
  color: #00d4ff;
  margin-bottom: 4px;
}

.conta-card .conta-saldo {
  font-size: 14px;
  font-weight: bold;
  color: #e0e8f0;
  margin-top: 2px;
}

.conta-card .conta-bar {
  width: 100%;
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.conta-card .conta-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #0091ea, #00d4ff);
  transition: width 0.5s ease;
}

.conta-card .conta-status {
  font-size: 10px;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
  font-weight: 600;
}

/* --- Card States --- */
.conta-card.status-idle {
  border-color: rgba(255,255,255,0.1);
}
.conta-card.status-idle .conta-letter {
  background: rgba(255,255,255,0.06);
  color: #8899aa;
}
.conta-card.status-idle .conta-status {
  background: rgba(85, 102, 119, 0.2);
  color: #8899aa;
}

.conta-card.status-requesting {
  border-color: #4fc3f7;
  box-shadow: 0 0 16px rgba(79, 195, 247, 0.3);
  animation: pulse-glow 1s ease-in-out infinite;
}
.conta-card.status-requesting .conta-letter {
  background: rgba(79, 195, 247, 0.2);
  color: #4fc3f7;
}
.conta-card.status-requesting .conta-status {
  background: rgba(79, 195, 247, 0.2);
  color: #4fc3f7;
}

.conta-card.status-locked {
  border-color: #00e676;
  box-shadow: 0 0 16px rgba(0, 230, 118, 0.3);
}
.conta-card.status-locked .conta-letter {
  background: rgba(0, 230, 118, 0.2);
  color: #00e676;
}
.conta-card.status-locked .conta-status {
  background: rgba(0, 230, 118, 0.2);
  color: #00e676;
}

.conta-card.status-blocked {
  border-color: #ef5350;
  box-shadow: 0 0 16px rgba(239, 83, 80, 0.3);
}
.conta-card.status-blocked .conta-letter {
  background: rgba(239, 83, 80, 0.2);
  color: #ef5350;
}
.conta-card.status-blocked .conta-status {
  background: rgba(239, 83, 80, 0.2);
  color: #ef5350;
}

.conta-card.status-timeout {
  border-color: #ef5350;
  box-shadow: 0 0 16px rgba(239, 83, 80, 0.3);
  opacity: 0.6;
}
.conta-card.status-timeout .conta-letter {
  background: rgba(239, 83, 80, 0.2);
  color: #ef5350;
}
.conta-card.status-timeout .conta-status {
  background: rgba(239, 83, 80, 0.2);
  color: #ef5350;
}

.conta-card.status-success {
  border-color: #00e676;
  box-shadow: 0 0 20px rgba(0, 230, 118, 0.4);
}
.conta-card.status-success .conta-letter {
  background: rgba(0, 230, 118, 0.2);
  color: #00e676;
}
.conta-card.status-success .conta-status {
  background: rgba(0, 230, 118, 0.2);
  color: #00e676;
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 12px rgba(79, 195, 247, 0.2); }
  50% { box-shadow: 0 0 24px rgba(79, 195, 247, 0.4); }
}

/* --- SVG Lines --- */
.hub-line {
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
}
.hub-line.idle {
  stroke: rgba(85, 102, 119, 0.3);
  stroke-dasharray: 5 4;
}
.hub-line.requesting {
  stroke: #4fc3f7;
  stroke-dasharray: 6 4;
  animation: dash-move 0.6s linear infinite;
}
.hub-line.locked {
  stroke: #00e676;
}
.hub-line.blocked,
.hub-line.timeout {
  stroke: #ef5350;
}
.hub-line.success {
  stroke: #00e676;
  transition: stroke 2s ease-out;
}

.arrow-line {
  stroke-width: 2.5;
  fill: none;
  stroke-linecap: round;
}
.arrow-line.requesting {
  stroke: #4fc3f7;
  stroke-dasharray: 6 4;
  animation: dash-move 0.6s linear infinite;
}
.arrow-line.locked {
  stroke: #4fc3f7;
}
.arrow-line.blocked,
.arrow-line.timeout {
  stroke: #ef5350;
}
.arrow-line.success {
  stroke: #00e676;
  transition: stroke 2s ease-out;
}

@keyframes dash-move {
  to { stroke-dashoffset: -20; }
}

/* --- Legend --- */
.visual-legend {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 10px 24px;
  background: rgba(0, 212, 255, 0.02);
  border-top: 1px solid rgba(0, 212, 255, 0.06);
  font-size: 12px;
  padding-left: 254px;
  position: relative;
  z-index: 1;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8899aa;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-dot.requesting { background: #4fc3f7; }
.legend-dot.locked { background: #00e676; }
.legend-dot.blocked { background: #ef5350; }
.legend-dot.idle { background: rgba(85, 102, 119, 0.4); }

/* --- Results Overlay --- */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 10, 26, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeInOverlay 0.4s ease;
}

.overlay-card {
  background: linear-gradient(135deg, rgba(16, 26, 56, 0.95), rgba(10, 14, 39, 0.95));
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 16px;
  padding: 40px;
  text-align: center;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 0 40px rgba(0, 212, 255, 0.1);
}

.overlay-title {
  font-size: 24px;
  color: #00d4ff;
  margin: 0 0 24px;
}

.overlay-stats {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.overlay-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.overlay-stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #e0e8f0;
}

.overlay-stat-label {
  font-size: 11px;
  color: #556677;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.overlay-card .btn--start {
  font-size: 15px;
  padding: 10px 28px;
}

@keyframes fadeInOverlay {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* --- Feedback --- */
.feedback {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 50;
  animation: slideUp 0.3s ease;
}
.feedback--error {
  background: rgba(239, 83, 80, 0.2);
  border: 1px solid #ef5350;
  color: #ef5350;
}
.feedback--success {
  background: rgba(0, 230, 118, 0.2);
  border: 1px solid #00e676;
  color: #00e676;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/public/css/simulacao-visual.css
git commit -m "feat(visual): CSS gamificado com tema frio azul/ciano"
```

---

### Task 3: Atualizar o state manager e event processor no JS

**Files:**
- Modify: `app/public/js/simulacao-visual.js`

- [ ] **Step 1: Adicionar a estrutura `transacoesEmAndamento` e ajustar `processarEvento`**

No início do bloco "Module 3: State Manager" (linha ~124), adicionar após `let stats`:

```javascript
let transacoesEmAndamento = new Map(); // key: `${origemId}-${destinoId}` -> { origemId, destinoId, inicioTimestamp }
let transacoesConcluidas = [];          // array de { origemId, destinoId, valorCentavos }
let resultadosSimulacao = null;         // { total, sucesso, contencao, duracao, timestamp }
let inicioSimulacaoTimestamp = null;
```

- [ ] **Step 2: Substituir `processarEvento`**

Substituir o método `processarEvento` atual por:

```javascript
function processarEvento(type, data) {
  if (data.source && data.source !== 'visual') return;

  if (type === 'lock:request') {
    const { contaId, origemId, destinoId } = data;
    stats.locksAtivos++;
    if (contaId) setAccountState(contaId, 'requesting');

    if (origemId && destinoId) {
      const key = `${origemId}-${destinoId}`;
      if (!transacoesEmAndamento.has(key)) {
        transacoesEmAndamento.set(key, { origemId, destinoId, inicioTimestamp: Date.now() });
      }
      setArrowState(key, 'requesting');
    }
  }

  else if (type === 'lock:acquired') {
    const { contaId } = data;
    if (contaId) setAccountState(contaId, 'locked');
  }

  else if (type === 'lock:blocked') {
    const { contaId } = data;
    if (contaId) setAccountState(contaId, 'blocked');
  }

  else if (type === 'lock:timeout') {
    const { contaId, origemId, destinoId } = data;
    if (contaId) setAccountState(contaId, 'timeout');
    if (origemId && destinoId) {
      transacoesEmAndamento.delete(`${origemId}-${destinoId}`);
    }
  }

  else if (type === 'lock:released') {
    const { contaId } = data;
    stats.locksAtivos = Math.max(0, stats.locksAtivos - 1);
    if (contaId) setAccountState(contaId, 'idle');
  }

  else if (type === 'transacao:success') {
    const { origemId, destinoId, valorCentavos } = data;
    stats.transacoes++;

    const contaOrigem = contasData.find(c => c.id === origemId);
    const contaDestino = contasData.find(c => c.id === destinoId);
    if (contaOrigem) contaOrigem.saldoCentavos -= valorCentavos;
    if (contaDestino) contaDestino.saldoCentavos += valorCentavos;

    const key = `${origemId}-${destinoId}`;
    transacoesEmAndamento.delete(key);

    transacoesConcluidas.push({ origemId, destinoId, valorCentavos });

    setArrowState(key, 'success');
    setTimeout(() => {
      removeArrow(key);
      renderizar();
    }, 2000);

    if (origemId) setAccountState(origemId, 'idle');
    if (destinoId) setAccountState(destinoId, 'idle');
    const origHub = accountStates.get(origemId);
    const destHub = accountStates.get(destinoId);
    if (origHub) origHub.hubLineState = 'success';
    if (destHub) destHub.hubLineState = 'success';
    setTimeout(() => {
      if (origemId) setAccountState(origemId, 'idle');
      if (destinoId) setAccountState(destinoId, 'idle');
      renderizar();
    }, 2000);
  }

  else if (type === 'simulacao-visual:iniciada') {
    contasData = data.contas || [];
    accountStates.clear();
    activeArrows.clear();
    transacoesEmAndamento.clear();
    transacoesConcluidas = [];
    resultadosSimulacao = null;
    inicioSimulacaoTimestamp = Date.now();
    stats = { transacoes: 0, locksAtivos: 0 };
    for (const c of contasData) {
      accountStates.set(c.id, { hubLineState: 'idle', borderState: 'idle' });
    }
    visualStatus.textContent = 'Rodando';
    visualStatus.className = 'status-badge status-running';
  }

  else if (type === 'simulacao-visual:finalizada' || type === 'simulacao-visual:parada') {
    visualStatus.textContent = type === 'simulacao-visual:finalizada' ? 'Concluída' : 'Parado';
    visualStatus.className = 'status-badge status-idle';
    btnParar.disabled = true;
    btnIniciar.disabled = false;
    pararTimer();

    if (type === 'simulacao-visual:finalizada') {
      const duracao = Math.floor((Date.now() - inicioSimulacaoTimestamp) / 1000);
      const total = transacoesConcluidas.length + transacoesEmAndamento.size;
      const sucesso = transacoesConcluidas.length;
      const contencao = total > 0 ? Math.round(((total - sucesso) / total) * 100) : 0;
      resultadosSimulacao = { total, sucesso, contencao, duracao };
      mostrarResultados(resultadosSimulacao);
      visualStatus.className = 'status-badge status-concluida';
    }
    renderizar();
  }
}
```

- [ ] **Step 3: Atualizar `limpar()` para resetar as novas estruturas**

No método `limpar()` (linha ~439), adicionar após `stats = { transacoes: 0, locksAtivos: 0 }`:

```javascript
transacoesEmAndamento.clear();
transacoesConcluidas = [];
resultadosSimulacao = null;
inicioSimulacaoTimestamp = null;
```

Também esconder overlay se estiver visível:

```javascript
document.getElementById('resultsOverlay').hidden = true;
```

- [ ] **Step 4: Commit**

```bash
git add app/public/js/simulacao-visual.js
git commit -m "feat(visual): state manager com rastreamento de transacoes em andamento"
```

---

### Task 4: Atualizar o renderer com novos estilos e progress bar

**Files:**
- Modify: `app/public/js/simulacao-visual.js`

- [ ] **Step 1: Substituir `renderizarCards` com progress bar e novo design**

Substituir a função `renderizarCards()`:

```javascript
function renderizarCards() {
  for (const conta of contasData) {
    const card = document.getElementById(`conta-${conta.id}`);
    if (!card) continue;
    const state = accountStates.get(conta.id);
    const borderState = state ? state.borderState : 'idle';
    card.className = `conta-card status-${borderState}`;

    const letterEl = card.querySelector('.conta-letter');
    const saldoEl = card.querySelector('.conta-saldo');
    const barFillEl = card.querySelector('.conta-bar-fill');
    const statusEl = card.querySelector('.conta-status');

    const labels = {
      idle: 'Livre', requesting: 'Solicitando', locked: 'Lock',
      blocked: 'Bloqueado', timeout: 'Timeout', success: 'Sucesso'
    };
    const icons = {
      idle: '⚪', requesting: '🔵', locked: '🟢',
      blocked: '🔴', timeout: '🔴', success: '🟢'
    };

    if (letterEl) letterEl.textContent = conta.letter;
    if (saldoEl) saldoEl.textContent = `R$ ${(conta.saldoCentavos / 100).toFixed(2)}`;
    if (statusEl) statusEl.textContent = `${icons[borderState] || '⚪'} ${labels[borderState] || borderState}`;

    const saldoInicial = 100000;
    const pct = Math.max(0, Math.min(100, (conta.saldoCentavos / saldoInicial) * 100));
    if (barFillEl) barFillEl.style.width = pct + '%';
  }
}
```

- [ ] **Step 2: Atualizar cores nas hub lines e arrow lines**

Em `renderizarHubLines()`, as classes CSS já mudam as cores. Trocar as cores nos markers das setas em `renderizarArrows()`:

```javascript
const colors = {
  requesting: '#4fc3f7', locked: '#4fc3f7',
  blocked: '#ef5350', timeout: '#ef5350', success: '#00e676'
};
```

- [ ] **Step 3: Adicionar label flutuante de valor nas setas**

Em `renderizarArrows()`, após criar a linha SVG da seta e antes de `svgLines.appendChild(line)`, adicionar:

```javascript
// Floating value label
const midX = (parseFloat(line.getAttribute('x1')) + parseFloat(line.getAttribute('x2'))) / 2;
const midY = (parseFloat(line.getAttribute('y1')) + parseFloat(line.getAttribute('y2'))) / 2;

const floatLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
floatLabel.setAttribute('x', midX);
floatLabel.setAttribute('y', midY - 10);
floatLabel.setAttribute('text-anchor', 'middle');
floatLabel.setAttribute('class', 'arrow-float-label');
floatLabel.setAttribute('data-key', key);
// We can't show valorCentavos here without storing it, so we check transacoesConcluidas
const concluida = transacoesConcluidas.find(t => t.origemId === origemId && t.destinoId === destinoId);
if (concluida && entry.arrowState === 'success') {
  floatLabel.textContent = `R$ ${(concluida.valorCentavos / 100).toFixed(2)}`;
  floatLabel.classList.add('arrow-float-label--visible');
}
svgLines.appendChild(floatLabel);
```

E adicionar o CSS correspondente em `app/public/css/simulacao-visual.css`:

```css
.arrow-float-label {
  font-size: 10px;
  fill: #00d4ff;
  font-weight: bold;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
.arrow-float-label--visible {
  opacity: 1;
  animation: float-up 2s ease-out forwards;
}

@keyframes float-up {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-20px); }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/public/js/simulacao-visual.js app/public/css/simulacao-visual.css
git commit -m "feat(visual): renderer com progress bar, novas cores e label flutuante"
```

---

### Task 5: Adicionar renderização do painel de transações

**Files:**
- Modify: `app/public/js/simulacao-visual.js`

- [ ] **Step 1: Adicionar função `renderizarPainelTransacoes()`**

Adicionar antes da função `renderizar()`:

```javascript
function renderizarPainelTransacoes() {
  const painelEmAndamento = document.getElementById('painelEmAndamento');
  const painelConcluidas = document.getElementById('painelConcluidas');
  const contadorEmAndamento = document.getElementById('contadorEmAndamento');
  const contadorConcluidas = document.getElementById('contadorConcluidas');
  const painelContador = document.getElementById('painelContador');

  if (!painelEmAndamento || !painelConcluidas) return;

  if (contadorEmAndamento) contadorEmAndamento.textContent = transacoesEmAndamento.size;
  if (contadorConcluidas) contadorConcluidas.textContent = transacoesConcluidas.length;
  if (painelContador) {
    painelContador.textContent = `Em andamento: ${transacoesEmAndamento.size} | Concluídas: ${transacoesConcluidas.length}`;
  }

  // Em Andamento
  if (transacoesEmAndamento.size === 0) {
    painelEmAndamento.innerHTML = '<p class="painel-placeholder">Nenhuma transação em andamento.</p>';
  } else {
    let html = '';
    for (const [key, entry] of transacoesEmAndamento) {
      const [origemId, destinoId] = key.split('-').map(Number);
      const contaOrigem = contasData.find(c => c.id === origemId);
      const contaDestino = contasData.find(c => c.id === destinoId);
      const origemLetter = contaOrigem ? contaOrigem.letter : origemId;
      const destinoLetter = contaDestino ? contaDestino.letter : destinoId;
      html += `
        <div class="transacao-entry transacao-entry--in-progress">
          <span class="entry-spinner"></span>
          <span class="entry-origem">${origemLetter}</span>
          <span class="entry-seta">→</span>
          <span class="entry-destino">${destinoLetter}</span>
          <span class="entry-valor">processando...</span>
        </div>`;
    }
    painelEmAndamento.innerHTML = html;
  }

  // Concluídas
  if (transacoesConcluidas.length === 0) {
    painelConcluidas.innerHTML = '<p class="painel-placeholder">Nenhuma transação concluída.</p>';
  } else {
    const MAX_VISIVEIS = 100;
    const exibir = transacoesConcluidas.slice(-MAX_VISIVEIS);
    let html = '';
    for (const t of exibir) {
      const contaOrigem = contasData.find(c => c.id === t.origemId);
      const contaDestino = contasData.find(c => c.id === t.destinoId);
      const origemLetter = contaOrigem ? contaOrigem.letter : t.origemId;
      const destinoLetter = contaDestino ? contaDestino.letter : t.destinoId;
      const valor = (t.valorCentavos / 100).toFixed(2);
      html += `
        <div class="transacao-entry transacao-entry--completed">
          <span class="entry-check">✓</span>
          <span class="entry-origem">${origemLetter}</span>
          <span class="entry-seta">→</span>
          <span class="entry-destino">${destinoLetter}</span>
          <span class="entry-valor">R$ ${valor}</span>
        </div>`;
    }
    painelConcluidas.innerHTML = html;
    painelConcluidas.scrollTop = painelConcluidas.scrollHeight;
  }
}
```

- [ ] **Step 2: Integrar no loop de renderização**

Adicionar `renderizarPainelTransacoes()` na função `renderizar()`:

```javascript
function renderizar() {
  renderizarHubLines();
  renderizarCards();
  renderizarArrows();
  renderizarPainelTransacoes();
  atualizarStats();
}
```

- [ ] **Step 3: Remover a função `adicionarLogTransacao` obsoleta**

Remover (ou substituir internamente) a função `adicionarLogTransacao` e o event listener `btnLimparLogTransacoes` — agora o painel é gerenciado pelo `renderizarPainelTransacoes()`.

O botão `btnLimparLogTransacoes` deve apenas limpar o array:

```javascript
btnLimparLogTransacoes.addEventListener('click', () => {
  transacoesConcluidas = [];
  renderizar();
});
```

- [ ] **Step 4: Commit**

```bash
git add app/public/js/simulacao-visual.js
git commit -m "feat(visual): painel de transacoes com em andamento e concluidas"
```

---

### Task 6: Adicionar sistema de partículas

**Files:**
- Modify: `app/public/js/simulacao-visual.js`

- [ ] **Step 1: Adicionar o sistema de partículas antes do Module 1**

Adicionar no topo do arquivo (após os DOM refs):

```javascript
// ===== Particle System =====
const particlesCanvas = document.getElementById('particlesCanvas');
const pCtx = particlesCanvas ? particlesCanvas.getContext('2d') : null;
let particles = [];
let particleAnimId = null;

function initParticles() {
  if (!pCtx) return;
  particlesCanvas.width = window.innerWidth;
  particlesCanvas.height = window.innerHeight;
  particles = [];
  const count = 60;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * particlesCanvas.width,
      y: Math.random() * particlesCanvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.1 - Math.random() * 0.2,
      r: 1 + Math.random() * 2,
      o: 0.1 + Math.random() * 0.2
    });
  }
  particleAnimId = requestAnimationFrame(animateParticles);
}

function animateParticles() {
  if (!pCtx) return;
  pCtx.clearRect(0, 0, particlesCanvas.width, particlesCanvas.height);

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y < -5) { p.y = particlesCanvas.height + 5; p.x = Math.random() * particlesCanvas.width; }
    if (p.x < -5) p.x = particlesCanvas.width + 5;
    if (p.x > particlesCanvas.width + 5) p.x = -5;

    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    pCtx.fillStyle = `rgba(0, 212, 255, ${p.o})`;
    pCtx.fill();
  }

  particleAnimId = requestAnimationFrame(animateParticles);
}

function resizeParticles() {
  if (!particlesCanvas) return;
  particlesCanvas.width = window.innerWidth;
  particlesCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeParticles);
```

- [ ] **Step 2: Inicializar partículas no `carregarUsuario` ou no init**

Adicionar no final do arquivo, após os event listeners:

```javascript
initParticles();
```

- [ ] **Step 3: Commit**

```bash
git add app/public/js/simulacao-visual.js
git commit -m "feat(visual): sistema de particulas no background"
```

---

### Task 7: Adicionar overlay de resultados

**Files:**
- Modify: `app/public/js/simulacao-visual.js`

- [ ] **Step 1: Adicionar a função `mostrarResultados`**

```javascript
function mostrarResultados(r) {
  const overlay = document.getElementById('resultsOverlay');
  if (!overlay) return;

  document.getElementById('resultsTotal').textContent = r.total;
  document.getElementById('resultsSucesso').textContent = r.sucesso;
  document.getElementById('resultsContencao').textContent = r.contencao + '%';
  document.getElementById('resultsDuracao').textContent = r.duracao + 's';

  overlay.hidden = false;
  overlay.style.display = 'flex';

  animarNumeros('resultsTotal', 0, r.total, 800);
  animarNumeros('resultsSucesso', 0, r.sucesso, 800);
}

function animarNumeros(elementId, start, end, duration) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);
    el.textContent = elementId === 'resultsContencao' ? current + '%' : current;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

document.getElementById('btnNovaSimulacao').addEventListener('click', () => {
  document.getElementById('resultsOverlay').hidden = true;
  document.getElementById('resultsOverlay').style.display = '';
});
```

- [ ] **Step 2: Garantir que overlay é resetado no `limpar`**

Em `limpar()`, adicionar:

```javascript
document.getElementById('resultsOverlay').hidden = true;
document.getElementById('resultsOverlay').style.display = '';
```

- [ ] **Step 3: Commit**

```bash
git add app/public/js/simulacao-visual.js
git commit -m "feat(visual): overlay de resultados com numeros animados"
```

---

### Task 8: Ajustes finos e consistência

**Files:**
- Verify: `app/public/js/simulacao-visual.js`
- Verify: `app/public/css/simulacao-visual.css`

- [ ] **Step 1: Verificar que `iniciarSimulacao` usa classes de botão corretas**

Garantir que `iniciarSimulacao` e `pararSimulacao` usam os IDs atualizados do HTML (btn--start, btn--stop) — eles permanecem `btnIniciar` e `btnParar` como IDs, só a classe CSS mudou.

- [ ] **Step 2: Verificar que o `renderizarContas` está correto com o novo card HTML**

A função `renderizarContas` deve gerar o HTML do card com a barra de progresso:

```javascript
card.innerHTML = `
  <div class="conta-letter">${conta.letter}</div>
  <div class="conta-saldo">R$ ${(conta.saldoCentavos / 100).toFixed(2)}</div>
  <div class="conta-bar"><div class="conta-bar-fill" style="width:100%"></div></div>
  <div class="conta-status">⚪ Livre</div>
`;
```

- [ ] **Step 3: Verificar a posição das contas (offset do painel de 230px)**

Em `renderizarContas`, ajustar o cálculo do centro:

```javascript
const rect = visualArena.getBoundingClientRect();
const arenaWidth = rect.width - 230;
const centerX = arenaWidth / 2 + 230;
const centerY = rect.height / 2;
const radius = Math.min(arenaWidth / 2, centerY) - 90;
```

- [ ] **Step 4: Verificar que `visualAccounts` está mapeado para `left: 230px`**

No CSS já tem `.visual-accounts { left: 230px; }`.

- [ ] **Step 5: Commit final**

```bash
git add app/public/js/simulacao-visual.js app/public/css/simulacao-visual.css
git commit -m "fix(visual): ajustes finos de layout e consistencia"
```

---

## Self-Review Checklist

- [x] Task 1: HTML com novo painel, overlay, classes de botão atualizadas
- [x] Task 2: CSS completo com tema frio, glassmorphism, animações game
- [x] Task 3: State manager com `transacoesEmAndamento`, `transacoesConcluidas`, `resultadosSimulacao`
- [x] Task 4: Renderer com progress bar e novas cores nas setas/hub lines
- [x] Task 5: Painel de transações com seções "Em andamento" e "Concluídas"
- [x] Task 6: Sistema de partículas de fundo
- [x] Task 7: Overlay de resultados com animação de números
- [x] Task 8: Ajustes finos e verificação de consistência
