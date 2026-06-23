const promClient = require('prom-client');

promClient.collectDefaultMetrics();

const transacoesTotal = new promClient.Counter({
  name: 'transacoes_total',
  help: 'Total de transações processadas',
});

const transacoesSucesso = new promClient.Counter({
  name: 'transacoes_sucesso_total',
  help: 'Transações concluídas com sucesso',
});

const transacoesConflito = new promClient.Counter({
  name: 'transacoes_conflito_total',
  help: 'Conflitos OCC / lock falhou',
});

const transacoesSaldoInsuficiente = new promClient.Counter({
  name: 'transacoes_saldo_insuficiente_total',
  help: 'Saldo insuficiente',
});

const transacoesDeadlock = new promClient.Counter({
  name: 'transacoes_deadlock_total',
  help: 'Deadlocks detectados',
});

const transacoesDuracao = new promClient.Histogram({
  name: 'transacoes_duracao_ms',
  help: 'Duração das transações em ms',
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});

const transacoesEsperaFila = new promClient.Histogram({
  name: 'transacoes_espera_fila_ms',
  help: 'Tempo de espera na fila em ms',
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});

const workersAtivos = new promClient.Gauge({
  name: 'workers_ativos',
  help: 'Transações em processamento agora',
});

const transacoesFila = new promClient.Gauge({
  name: 'transacoes_fila',
  help: 'Transações aguardando na fila',
});

const clientesOnline = new promClient.Gauge({
  name: 'clientes_online',
  help: 'Número de contas criadas na simulação',
});

const rateLimiterBloqueios = new promClient.Counter({
  name: 'rate_limiter_bloqueios_total',
  help: 'IPs bloqueados pelo rate limiter',
});

const loginTentativas = new promClient.Counter({
  name: 'login_tentativas_total',
  help: 'Total de tentativas de login',
});

const tentativasForcaBruta = new promClient.Counter({
  name: 'tentativas_forca_bruta_total',
  help: 'Tentativas de login com credenciais inválidas (força bruta)',
});

const transacoesChequeEspecial = new promClient.Counter({
  name: 'transacoes_cheque_especial_total',
  help: 'Soma do cheque especial usado nas transações',
});

const transacoesDestinoInvalido = new promClient.Counter({
  name: 'transacoes_destino_invalido_total',
  help: 'Transações com destino não existente (-1)',
});

async function metricsHandler(req, res) {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
}

module.exports = {
  transacoesTotal,
  transacoesSucesso,
  transacoesConflito,
  transacoesSaldoInsuficiente,
  transacoesDeadlock,
  transacoesDuracao,
  transacoesEsperaFila,
  workersAtivos,
  transacoesFila,
  clientesOnline,
  rateLimiterBloqueios,
  loginTentativas,
  tentativasForcaBruta,
  transacoesChequeEspecial,
  transacoesDestinoInvalido,
  metricsHandler,
  promClient,
};
