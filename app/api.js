const express = require('express');
const authService = require('./src/services/AuthService');
const { autenticar } = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- Rota Raiz ---

app.get('/', (req, res) => {
  res.json({
    nome: 'Banking Simulation API',
    versao: '0.0.1',
    endpoints: {
      auth: {
        registrar: { metodo: 'POST', url: '/auth/register', auth: false, body: { username: 'string', password: 'string' } },
        login: { metodo: 'POST', url: '/auth/login', auth: false, body: { username: 'string', password: 'string' } },
        me: { metodo: 'GET', url: '/auth/me', auth: true }
      },
      simulacao: {
        iniciar: { metodo: 'POST', url: '/simulacao/iniciar', auth: true, body: { numContas: 'number (opcional)', numTransacoes: 'number (opcional)', saldoInicial: 'number (opcional)' } },
        resultado: { metodo: 'GET', url: '/simulacao/resultado', auth: true }
      }
    }
  });
});

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

app.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const resultado = authService.login(username, password);
    res.json({ token: resultado.token, username: resultado.usuario.username });
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

// --- Rotas da Simulação (protegidas) ---

// TODO: adicionar refresh token
// TODO: implementar rate limiting no login
// TODO: adicionar roles (admin, operator)

const Conta = require('./src/model/Conta');
const Transacao = require('./src/model/Transacao');
const GerenciadorTransacoes = require('./src/services/GerenciadorTransacoes');

app.post('/simulacao/iniciar', autenticar, async (req, res) => {
  try {
    const numContas = parseInt(req.body.numContas) || 1000;
    const numTransacoes = parseInt(req.body.numTransacoes) || 5000;
    const saldoInicial = parseInt(req.body.saldoInicial) || 100000;

    const contas = [];
    for (let i = 0; i < numContas; i++) {
      contas.push(new Conta(i, saldoInicial));
    }

    const gerenciador = new GerenciadorTransacoes();

    for (let i = 0; i < numTransacoes; i++) {
      let origemIndex = Math.floor(Math.random() * numContas);
      let destinoIndex = Math.floor(Math.random() * numContas);
      while (origemIndex === destinoIndex) {
        destinoIndex = Math.floor(Math.random() * numContas);
      }
      const origem = contas[origemIndex];
      const destino = contas[destinoIndex];
      const valor = Math.floor(Math.random() * 100000);
      gerenciador.adicionarTransacao(new Transacao(origem, destino, valor));
    }

    const inicio = process.hrtime.bigint();
    gerenciador.start();
    await gerenciador.encerrar();
    const fim = process.hrtime.bigint();

    let somaTotal = 0;
    for (const c of contas) {
      somaTotal += c.getSaldoCentavos();
    }

    const tempoMs = Number(fim - inicio) / 1e6;
    const consistente = Math.abs(somaTotal - (numContas * saldoInicial)) < 0.0001;

    res.json({
      status: consistente ? 'ok' : 'inconsistencia',
      numContas,
      numTransacoes,
      saldoTotal: somaTotal,
      saldoEsperado: numContas * saldoInicial,
      tempoMs: tempoMs.toFixed(2),
      consistente
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.get('/simulacao/resultado', autenticar, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const relatorioPath = path.resolve(__dirname, 'relatorio.txt');

    if (!fs.existsSync(relatorioPath)) {
      return res.status(404).json({ erro: 'Nenhum relatório encontrado. Execute uma simulação primeiro.' });
    }

    const relatorio = fs.readFileSync(relatorioPath, 'utf-8');
    res.type('text/plain').send(relatorio);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// --- Tratamento de Erros Global ---
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Banking Simulation API rodando em http://localhost:${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'desenvolvimento'}`);
});
