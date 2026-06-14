const AuthService = require('../app/src/services/AuthService');

const username = 'admin';
const password = 'admin123';

try {
  const usuario = AuthService.registrar(username, password);
  console.log(`✓ Usuário criado: ${usuario.username} (ID: ${usuario.id})`);
} catch (erro) {
  if (erro.message === 'Username já está em uso') {
    console.log('→ Usuário admin já existe.');
  } else {
    console.error('✗ Erro ao criar usuário:', erro.message);
    process.exit(1);
  }
}
