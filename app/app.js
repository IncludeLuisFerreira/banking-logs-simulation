const Conta = require('./src/model/Conta');
const Transacao = require('./src/model/Transacao');
const GerenciadorTransacoes = require('./src/services/GerenciadorTransacoes');

async function main() {
  const NUM_CONTAS = 10000;
  const NUM_TRANSACOES = 50000;
  const SALDO_INICIAL = 100000; // R$1000,00 em centavos

  const contas = [];
  for (let i = 0; i < NUM_CONTAS; i++) {
    contas.push(new Conta(i, SALDO_INICIAL));
  }

  const gerenciador = new GerenciadorTransacoes();

  // Criando transações aleatórias (origem ≠ destino)
  for (let i = 0; i < NUM_TRANSACOES; i++) {
    let origemIndex = Math.floor(Math.random() * NUM_CONTAS);
    let destinoIndex = Math.floor(Math.random() * NUM_CONTAS);
    while (origemIndex === destinoIndex) {
      destinoIndex = Math.floor(Math.random() * NUM_CONTAS);
    }
    const origem = contas[origemIndex];
    const destino = contas[destinoIndex];
    gerenciador.adicionarTransacao(new Transacao(origem, destino, Math.floor(Math.random() * 100000)));
  }

  // Teste de starvation: transações de valor baixo no meio
  for (let i = 0; i < 6; i++) {
    const origem = contas[Math.floor(Math.random() * NUM_CONTAS)];
    const destino = contas[Math.floor(Math.random() * NUM_CONTAS)];
    gerenciador.adicionarTransacao(new Transacao(origem, destino, 10));
  }

  for (let i = 0; i < NUM_TRANSACOES; i++) {
    let origemIndex = Math.floor(Math.random() * NUM_CONTAS);
    let destinoIndex = Math.floor(Math.random() * NUM_CONTAS);
    while (origemIndex === destinoIndex) {
      destinoIndex = Math.floor(Math.random() * NUM_CONTAS);
    }
    const origem = contas[origemIndex];
    const destino = contas[destinoIndex];
    gerenciador.adicionarTransacao(new Transacao(origem, destino, Math.floor(Math.random() * 100000)));
  }

  const inicio = process.hrtime.bigint();
  gerenciador.start();
  await gerenciador.encerrar();
  const fim = process.hrtime.bigint();

  let somaTotal = 0;
  for (const c of contas) {
    const saldo = c.getSaldoCentavos();
    somaTotal += saldo;
    console.log(`Conta ${c.getId()}: Saldo final: R$${(saldo / 100).toFixed(2)}`);
  }

  console.log(`Soma total dos saldos: R$${(somaTotal / 100).toFixed(2)} (Esperado: R$${(NUM_CONTAS * SALDO_INICIAL / 100).toFixed(2)})`);
  const tempoMs = Number(fim - inicio) / 1e6;
  console.log(`Tempo total: ${tempoMs.toFixed(2)} ms`);

  if (Math.abs(somaTotal - (NUM_CONTAS * SALDO_INICIAL)) < 0.0001) {
    console.log('TESTE DE STRESS EXTREMO APROVADO: Nenhuma perda de saldo detectada.');
  } else {
    console.log('ERRO: Inconsistência detectada! Verificar implementação.');
  }
}

main().catch(console.error);