/**
 * Banking Simulation — Login Logic
 * Lógica de interação e autenticação da página de login.
 */

// Seleção de elementos do DOM
const formulario = document.getElementById('loginForm');
const campoUsuario = document.getElementById('username');
const campoSenha = document.getElementById('password');
const botaoSubmit = document.getElementById('btnSubmit');
const textoBotao = botaoSubmit.querySelector('.btn__text');
const spinnerBotao = botaoSubmit.querySelector('.btn__spinner');
const feedback = document.getElementById('feedback');

// URL da API backend
const API_URL = `${API_BASE_URL}/auth/login`;

// ============================================================
// Funções auxiliares
// ============================================================

/**
 * Exibe mensagem de feedback (erro ou sucesso).
 * @param {string} mensagem - Texto a ser exibido.
 * @param {string} tipo - 'error' | 'success'.
 */
function exibirFeedback(mensagem, tipo) {
  feedback.textContent = mensagem;
  feedback.className = 'feedback'; // reseta classes
  feedback.classList.add(`feedback--${tipo}`);
  feedback.hidden = false;
}

/**
 * Oculta o elemento de feedback.
 */
function ocultarFeedback() {
  feedback.hidden = true;
  feedback.textContent = '';
}

/**
 * Alterna estado de loading do botão.
 * @param {boolean} carregando - true para ativar loading.
 */
function toggleLoading(carregando) {
  botaoSubmit.disabled = carregando;
  textoBotao.textContent = carregando ? 'Entrando...' : 'Entrar';
  spinnerBotao.hidden = !carregando;
}

// ============================================================
// Validação client-side
// ============================================================

/**
 * Valida os campos do formulário antes do envio.
 * @returns {object|null} - Objeto com dados ou null se inválido.
 */
function validarFormulario() {
  const usuario = campoUsuario.value.trim();
  const senha = campoSenha.value;

  // Validação: usuário não vazio
  if (!usuario) {
    exibirFeedback('Por favor, digite seu usuário.', 'error');
    campoUsuario.focus();
    return null;
  }

  // Validação: senha não vazia
  if (!senha) {
    exibirFeedback('Por favor, digite sua senha.', 'error');
    campoSenha.focus();
    return null;
  }

  // Validação: senha mínima 6 caracteres
  if (senha.length < 6) {
    exibirFeedback('A senha deve ter pelo menos 6 caracteres.', 'error');
    campoSenha.focus();
    return null;
  }

  return { username: usuario, password: senha };
}

// ============================================================
// Chamada à API
// ============================================================

/**
 * Realiza autenticação via fetch POST.
 * @param {object} credenciais - { username, password }.
 */
async function autenticar(credenciais) {
  toggleLoading(true);
  ocultarFeedback();

  try {
    const resposta = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credenciais),
    });

    if (resposta.ok) {
      // Sucesso (200)
      const dados = await resposta.json();

      // Salva token no localStorage
      if (dados.token) {
        localStorage.setItem('auth_token', dados.token);
      }

      exibirFeedback('Login realizado com sucesso! Redirecionando...', 'success');

      // Redireciona para dashboard
      setTimeout(() => {
        window.location.href = '/html/dashboard.html';
      }, 800);

    } else if (resposta.status === 401) {
      // Não autorizado
      exibirFeedback('Usuário ou senha inválidos.', 'error');
      // TODO: adicionar animação de shake no erro

    } else if (resposta.status >= 500) {
      // Erro no servidor
      exibirFeedback('Erro no servidor. Tente novamente.', 'error');

    } else {
      // Outros erros
      exibirFeedback('Ocorreu um erro inesperado. Tente novamente.', 'error');
    }

  } catch (erro) {
    // Falha de rede ou CORS
    console.error('Erro na requisição:', erro);
    exibirFeedback('Não foi possível conectar ao servidor. Verifique se o backend está rodando.', 'error');
  } finally {
    toggleLoading(false);
  }
}

// ============================================================
// Event Listeners
// ============================================================

formulario.addEventListener('submit', function (evento) {
  evento.preventDefault();

  const credenciais = validarFormulario();
  if (credenciais) {
    autenticar(credenciais);
  }
});

// Oculta feedback ao digitar
campoUsuario.addEventListener('input', ocultarFeedback);
campoSenha.addEventListener('input', ocultarFeedback);

// ============================================================
// TODOs para evolução futura
// ============================================================
// TODO: implementar refresh token
// TODO: adicionar captcha após 3 tentativas falhas
// TODO: adicionar animação de shake no erro
// TODO: salvar preferência "Lembrar-me" no localStorage
// TODO: adicionar toggle de visibilidade da senha