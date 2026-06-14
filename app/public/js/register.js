/**
 * Banking Simulation — Register Logic
 * Lógica de interação e cadastro da página de registro.
 */

// ============================================================
// Seleção de elementos do DOM
// ============================================================

const formulario = document.getElementById('registerForm');
const campoUsuario = document.getElementById('regUsername');
const campoSenha = document.getElementById('regPassword');
const campoConfirm = document.getElementById('regConfirm');
const botaoSubmit = document.getElementById('btnRegister');
const textoBotao = botaoSubmit.querySelector('.btn__text');
const spinnerBotao = botaoSubmit.querySelector('.btn__spinner');
const feedback = document.getElementById('feedback');

// URL da API backend
const API_URL = `${API_BASE_URL}/auth/register`;

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
  textoBotao.textContent = carregando ? 'Cadastrando...' : 'Cadastrar';
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
  const confirmacao = campoConfirm.value;

  // Validação: usuário não vazio
  if (!usuario) {
    exibirFeedback('Por favor, digite um usuário.', 'error');
    campoUsuario.focus();
    return null;
  }

  // Validação: senha não vazia
  if (!senha) {
    exibirFeedback('Por favor, digite uma senha.', 'error');
    campoSenha.focus();
    return null;
  }

  // Validação: senha mínima 6 caracteres
  if (senha.length < 6) {
    exibirFeedback('A senha deve ter pelo menos 6 caracteres.', 'error');
    campoSenha.focus();
    return null;
  }

  // Validação: confirmação de senha
  if (senha !== confirmacao) {
    exibirFeedback('As senhas não conferem.', 'error');
    campoConfirm.focus();
    return null;
  }

  return { username: usuario, password: senha };
}

// ============================================================
// Chamada à API
// ============================================================

/**
 * Realiza cadastro via fetch POST.
 * @param {object} dados - { username, password }.
 */
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
      // Sucesso (201 / 200)
      exibirFeedback('Conta criada com sucesso! Redirecionando...', 'success');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 800);

    } else if (resposta.status === 409) {
      // Conflito — usuário já existe
      exibirFeedback('Usuário já existe.', 'error');

    } else if (resposta.status === 400) {
      // Validação — dados inválidos
      const erro = await resposta.json();
      exibirFeedback(erro.erro || 'Dados inválidos. Verifique os campos.', 'error');

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
  const dados = validarFormulario();
  if (dados) {
    cadastrar(dados);
  }
});

// Oculta feedback ao digitar
campoUsuario.addEventListener('input', ocultarFeedback);
campoSenha.addEventListener('input', ocultarFeedback);
campoConfirm.addEventListener('input', ocultarFeedback);

// ============================================================
// TODOs para evolução futura
// ============================================================
// TODO: adicionar forçar senha forte (maiúscula, número, símbolo)
// TODO: adicionar confirmar e-mail via link
// TODO: exibir requisitos de senha dinamicamente
// TODO: limitar tentativas de cadastro por IP via backend
// TODO: adicionar animação de shake no erro
