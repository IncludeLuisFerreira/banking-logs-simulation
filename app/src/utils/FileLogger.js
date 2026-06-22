const fs = require('fs');
const path = require('path');

class FileLogger {
  constructor(logPath = null) {
    this.logPath = logPath || path.join(__dirname, '..', '..', 'logs', 'error.log');
  }

  error(tipo, dados) {
    try {
      const entry = JSON.stringify({
        tipo,
        ...dados,
        mensagem: this._formatarMensagem(tipo, dados),
        timestamp: Date.now(),
      }) + '\n';
      fs.appendFileSync(this.logPath, entry, 'utf-8');
    } catch (e) {
      console.error('FileLogger error:', e);
    }
  }

  _formatarMensagem(tipo, dados) {
    switch (tipo) {
      case 'destino_invalido':
        return `Conta ${dados.origemId} tentou enviar R$ ${(dados.valorCentavos / 100).toFixed(2)} para conta inexistente (${dados.destinoId})`;
      default:
        return `${tipo}: ${JSON.stringify(dados)}`;
    }
  }
}

module.exports = FileLogger;
