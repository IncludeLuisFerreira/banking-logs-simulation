const fs = require('fs');

jest.mock('fs');

const FileLogger = require('../src/utils/FileLogger');

describe('FileLogger', () => {
  beforeEach(() => {
    fs.appendFileSync.mockClear();
  });

  test('deve escrever uma linha JSON no arquivo de log', () => {
    const logger = new FileLogger('/tmp/test-error.log');
    logger.error('destino_invalido', {
      origemId: 3,
      destinoId: -1,
      valorCentavos: 452,
      threadId: 'worker-7',
    });

    expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
    const written = fs.appendFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.tipo).toBe('destino_invalido');
    expect(parsed.origemId).toBe(3);
    expect(parsed.destinoId).toBe(-1);
    expect(parsed.valorCentavos).toBe(452);
    expect(parsed.threadId).toBe('worker-7');
    expect(parsed.mensagem).toContain('conta inexistente');
    expect(parsed.timestamp).toBeDefined();
  });

  test('deve usar o caminho padrão logs/error.log quando não especificado', () => {
    const logger = new FileLogger();
    logger.error('test', {});
    expect(fs.appendFileSync.mock.calls[0][0]).toMatch(/logs\/error\.log$/);
  });

  test('não deve lançar exceção se appendFileSync falhar', () => {
    fs.appendFileSync.mockImplementationOnce(() => { throw new Error('escrita negada'); });
    const logger = new FileLogger('/tmp/test-error.log');
    expect(() => logger.error('destino_invalido', { origemId: 1, destinoId: -1 })).not.toThrow();
  });
});
