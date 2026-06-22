const express = require('express');
const authService = require('./src/services/AuthService');
const { autenticar } = require('./src/middleware/auth');
const { loginLimiter, rateLimiter } = require('./src/middleware/rateLimiter');
const { metricsHandler, loginTentativas } = require('./src/metrics');

const app = express();
const PORT = process.env.PORT || 3000;
const path = require('path')

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Métricas Prometheus ---
app.get('/metrics', metricsHandler);

// --- Rotas de Autenticação ---

app.post('/auth/register', (req, res) => {
  try {
    const { username, password } = req.body;
    const usuario = authService.registrar(username, password);
    res.status(201).json({ id: usuario.id, username: usuario.username });
  } catch (erro) {
    const status = erro.status || 500;
    res.status(status).json({ erro: erro.message });
  }
});

app.post('/auth/login', loginLimiter, (req, res) => {
  try {
    loginTentativas.inc();
    const { username, password } = req.body;
    const resultado = authService.login(username, password);
    res.json({ token: resultado.token, username: resultado.usuario.username });
    rateLimiter.delete(req.ip).catch(() => {});
  } catch (erro) {
    const status = erro.status || 500;
    res.status(status).json({ erro: erro.message });
  }
});

app.get('/auth/me', autenticar, (req, res) => {
  try {
    const usuario = authService.buscarPorId(req.usuario.id);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }
    res.json(usuario.toJSON());
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// --- Rotas da Simulação Dinâmica (protegidas) ---

const Conta = require('./src/model/Conta');
const Transacao = require('./src/model/Transacao');
const GerenciadorTransacoes = require('./src/services/GerenciadorTransacoes');
const simulacaoService = require('./src/services/SimulacaoService');
const SimulacaoVisualService = require('./src/services/SimulacaoVisualService');
const simulacaoVisual = new SimulacaoVisualService(simulacaoService.lockLogger);

app.get('/simulacao/contas', autenticar, (req, res) => {
  try {
    const contas = simulacaoService.listarContas();
    res.json(contas);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/simulacao/contas', autenticar, (req, res) => {
  try {
    const { saldoInicial, nome } = req.body;
    const conta = simulacaoService.adicionarConta(
      parseInt(saldoInicial) || 100000,
      nome || ''
    );
    res.status(201).json(conta);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.delete('/simulacao/contas/:id', autenticar, (req, res) => {
  try {
    const removido = simulacaoService.removerConta(parseInt(req.params.id));
    if (!removido) {
      return res.status(404).json({ erro: 'Conta não encontrada' });
    }
    res.json({ status: 'removida' });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/simulacao/stress', autenticar, async (req, res) => {
  try {
    const resultado = await simulacaoService.iniciarSimulacaoNxN();
    if (resultado.error) {
      return res.status(400).json({ erro: resultado.error });
    }
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/simulacao/stop', autenticar, (req, res) => {
  try {
    const resultado = simulacaoService.pararSimulacao();
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// --- Rotas da Simulação Visual ---

app.post('/simulacao/visual', autenticar, async (req, res) => {
  try {
    const { numContas, mode, transacaoRange, estrategia } = req.body;
    const resultado = await simulacaoVisual.iniciar(
      parseInt(numContas) || 8,
      mode || 'nxn',
      transacaoRange || {},
      estrategia || 'otimista'
    );
    if (resultado.error) {
      return res.status(400).json({ erro: resultado.error });
    }
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/simulacao/visual/stop', autenticar, (req, res) => {
  try {
    const resultado = simulacaoVisual.parar();
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.get('/simulacao/stream', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }
  try {
    const authService = require('./src/services/AuthService');
    authService.validarToken(token);
  } catch (e) {
    return res.status(401).json({ erro: 'Token inválido' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write('event: connected\ndata: {}\n\n');

  simulacaoService.lockLogger.addClient(res, false);

  req.on('close', () => {
    simulacaoService.lockLogger.removeClient(res);
  });
});

// --- Tratamento de Erros Global ---
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Banking Simulation API rodando em http://localhost:${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'desenvolvimento'}`);
  });
}

module.exports = app;
