const formulario = document.getElementById('registerForm');
const campoUsuario = document.getElementById('regUsername');
const campoSenha = document.getElementById('regPassword');
const campoConfirm = document.getElementById('regConfirm');
const botaoSubmit = document.getElementById('btnRegister');
const textoBotao = botaoSubmit.querySelector('.btn__text');
const spinnerBotao = botaoSubmit.querySelector('.btn__spinner');
const feedback = document.getElementById('feedback');

const API_URL = 'http://localhost:3000/auth/register';

function exibirFeedback(mensagem, tipo) {
  feedback.textContent = mensagem;
  feedback.className = 'feedback';
  feedback.classList.add(`feedback--${tipo}`);
  feedback.hidden = false;
}

function ocultarFeedback() {
  feedback.hidden = true;
  feedback.textContent = '';
}

function toggleLoading(carregando) {
  botaoSubmit.disabled = carregando;
  textoBotao.textContent = carregando ? 'Cadastrando...' : 'Cadastrar';
  spinnerBotao.hidden = !carregando;
}

function validarFormulario() {
  const usuario = campoUsuario.value.trim();
  const senha = campoSenha.value;
  const confirm = campoConfirm.value;

  if (!usuario) {
    exibirFeedback('Por favor, digite um usuário.', 'error');
    campoUsuario.focus();
    return null;
  }

  if (!senha) {
    exibirFeedback('Por favor, digite uma senha.', 'error');
    campoSenha.focus();
    return null;
  }

  if (senha.length < 6) {
    exibirFeedback('A senha deve ter pelo menos 6 caracteres.', 'error');
    campoSenha.focus();
    return null;
  }

  if (senha !== confirm) {
    exibirFeedback('As senhas não conferem.', 'error');
    campoConfirm.focus();
    return null;
  }

  return { username: usuario, password: senha };
}

async function cadastrar(dados) {
  toggleLoading(true);
  ocultarFeedback();

  try {
    const resposta = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });

    if (resposta.ok) {
      exibirFeedback('Conta criada com sucesso! Redirecionando...', 'success');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 800);
    } else {
      const erro = await resposta.json();
      exibirFeedback(erro.erro || 'Erro ao cadastrar. Tente novamente.', 'error');
    }
  } catch (erro) {
    console.error('Erro na requisição:', erro);
    exibirFeedback('Não foi possível conectar ao servidor.', 'error');
  } finally {
    toggleLoading(false);
  }
}

formulario.addEventListener('submit', function (evento) {
  evento.preventDefault();
  const dados = validarFormulario();
  if (dados) {
    cadastrar(dados);
  }
});

campoUsuario.addEventListener('input', ocultarFeedback);
campoSenha.addEventListener('input', ocultarFeedback);
campoConfirm.addEventListener('input', ocultarFeedback);
