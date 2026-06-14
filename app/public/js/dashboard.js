const userDisplay = document.getElementById('userDisplay');
const userWelcome = document.getElementById('userWelcome');
const btnLogout = document.getElementById('btnLogout');
const feedback = document.getElementById('feedback');

const API_URL = API_BASE_URL;

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

  ocultarFeedback();

  try {
    const resposta = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!resposta.ok) {
      exibirFeedback('Sessão expirada. Faça login novamente.', 'error');
      setTimeout(redirecionarLogin, 1500);
      return;
    }

    const dados = await resposta.json();
    const nome = dados.username || 'usuário';
    userDisplay.textContent = nome;
    userWelcome.textContent = nome;

  } catch (erro) {
    console.error('Erro ao carregar usuário:', erro);
    exibirFeedback('Erro de conexão. Redirecionando...', 'error');
    setTimeout(redirecionarLogin, 1500);
  }
}

btnLogout.addEventListener('click', redirecionarLogin);

carregarUsuario();
