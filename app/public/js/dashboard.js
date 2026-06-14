const userDisplay = document.getElementById('userDisplay');
const userWelcome = document.getElementById('userWelcome');
const btnLogout = document.getElementById('btnLogout');
const feedback = document.getElementById('feedback');

const API_URL = 'http://localhost:3000';

function exibirFeedback(mensagem, tipo) {
  feedback.textContent = mensagem;
  feedback.className = 'feedback';
  feedback.classList.add(`feedback--${tipo}`);
  feedback.hidden = false;
}

function redirecionarLogin() {
  localStorage.removeItem('auth_token');
  window.location.href = '/index.html';
}

async function carregarUsuario() {
  const token = localStorage.getItem('auth_token');

  if (!token) {
    redirecionarLogin();
    return;
  }

  try {
    const resposta = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!resposta.ok) {
      redirecionarLogin();
      return;
    }

    const dados = await resposta.json();
    userDisplay.textContent = dados.username;
    userWelcome.textContent = dados.username;

  } catch (erro) {
    console.error('Erro ao carregar usuário:', erro);
    redirecionarLogin();
  }
}

btnLogout.addEventListener('click', function () {
  localStorage.removeItem('auth_token');
  window.location.href = '/index.html';
});

carregarUsuario();
