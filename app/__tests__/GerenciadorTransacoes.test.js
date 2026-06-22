const Conta = require('../src/model/Conta');
const Transacao = require('../src/model/Transacao');
const CONTA_INVALIDA = require('../src/model/ContaInvalida');

jest.mock('../src/utils/FileLogger');

const FileLogger = require('../src/utils/FileLogger');
const GerenciadorTransacoes = require('../src/services/GerenciadorTransacoes');

describe('GerenciadorTransacoes — destino inválido', () => {
  test('deve detectar destino inválido e retornar INTERRUPTED', async () => {
    const origem = new Conta(1, 100000);
    const gerenciador = new GerenciadorTransacoes(null);
    gerenciador.modo = 'otimista';

    const transacao = new Transacao(origem, CONTA_INVALIDA, 5000);
    const resultado = await gerenciador.executar(transacao, 'worker-test');

    expect(resultado).toBe('INTERRUPTED');
    expect(FileLogger).toHaveBeenCalledTimes(1);
    const instance = FileLogger.mock.instances[0];
    expect(instance.error).toHaveBeenCalledWith('destino_invalido', expect.objectContaining({
      origemId: 1,
      destinoId: -1,
    }));
  });
});
