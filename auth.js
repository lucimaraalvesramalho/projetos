const CHAVE_TEMA = "meu-kanban-tema-v1";
const CHAVE_DADOS_ANTIGA = "meu-kanban-dados-v1";
const seguranca = window.KanbanSecurity;
const formularioAuth = document.getElementById("form-auth");
const mensagemAuth = document.getElementById("auth-mensagem");
const botaoEnvio = formularioAuth.querySelector('button[type="submit"]');
const textoBotaoOriginal = botaoEnvio.textContent;

function mostrarErro(mensagem) {
  mensagemAuth.classList.remove("success");
  mensagemAuth.textContent = mensagem;
  mensagemAuth.hidden = false;
}

function validarEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function quadroLegado() {
  const salvo = localStorage.getItem(CHAVE_DADOS_ANTIGA);
  if (salvo === null) return null;
  const quadro = JSON.parse(salvo);
  if (!seguranca.validarQuadro(quadro)) {
    throw new Error("O quadro antigo possui dados inválidos.");
  }
  return quadro;
}

document.querySelectorAll("[data-toggle-password]").forEach(botao => {
  botao.addEventListener("click", () => {
    const campo = document.getElementById(botao.dataset.togglePassword);
    const mostrar = campo.type === "password";
    campo.type = mostrar ? "text" : "password";
    botao.textContent = mostrar ? "Ocultar" : "Mostrar";
    botao.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
    botao.setAttribute("aria-pressed", String(mostrar));
  });
});

function carregarTema() {
  try {
    document.documentElement.dataset.tema =
      localStorage.getItem(CHAVE_TEMA) === "escuro" ? "escuro" : "claro";
  } catch (erro) {
    console.error("Não foi possível carregar a preferência de tema:", erro);
    document.documentElement.dataset.tema = "claro";
  }
}

document.getElementById("btn-tema-auth").addEventListener("click", () => {
  const tema = document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro";
  document.documentElement.dataset.tema = tema;
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch (erro) {
    console.error("Não foi possível salvar a preferência de tema:", erro);
    mostrarErro("Não foi possível salvar a preferência de tema neste navegador.");
  }
});

async function criarConta(email, senha) {
  const contas = seguranca.lerListaContas();
  if (contas.some(conta => conta.email === email)) {
    throw new Error("Não foi possível criar uma conta com esse e-mail.");
  }

  const sal = crypto.getRandomValues(new Uint8Array(16));
  const { chave, chaveDaSessao } = await seguranca.derivarChave(senha, sal);
  const quadroAntigo = quadroLegado();
  const quadro = quadroAntigo ?? {
    colunas: [
      { id: crypto.randomUUID(), titulo: "A Fazer", cor: "#7b6ce0" },
      { id: crypto.randomUUID(), titulo: "Em Andamento", cor: "#e7a23b" },
      { id: crypto.randomUUID(), titulo: "Concluído", cor: "#35a77a" },
    ],
    tarefas: [],
  };
  const cifrado = await seguranca.criptografarQuadro(quadro, chave);
  const conta = {
    id: crypto.randomUUID(),
    email,
    sal: btoa(String.fromCharCode(...sal)),
    ...cifrado,
  };

  try {
    seguranca.gravarConta(conta);
    seguranca.gravarListaContas([...contas, { id: conta.id, email }]);
    seguranca.gravarSessao(conta.id, chaveDaSessao);
  } catch (erro) {
    try {
      seguranca.gravarListaContas(contas);
      localStorage.removeItem(`meu-kanban-conta-v1-${conta.id}`);
      sessionStorage.removeItem("meu-kanban-sessao-v1");
    } catch (erroLimpeza) {
      console.error("Não foi possível reverter todos os dados da conta:", erroLimpeza);
    }
    throw erro;
  }

  if (quadroAntigo) localStorage.removeItem(CHAVE_DADOS_ANTIGA);
}

async function entrar(email, senha) {
  const contas = seguranca.lerListaContas();
  const resumo = contas.find(conta => conta.email === email);
  const conta = resumo ? seguranca.lerConta(resumo.id) : null;
  if (!conta || conta.email !== email || typeof conta.sal !== "string") {
    throw new Error("E-mail ou senha inválidos.");
  }

  try {
    const sal = Uint8Array.from(atob(conta.sal), caractere => caractere.charCodeAt(0));
    const { chave, chaveDaSessao } = await seguranca.derivarChave(senha, sal);
    const quadro = await seguranca.descriptografarQuadro(conta, chave);
    if (!seguranca.validarQuadro(quadro)) throw new Error("Quadro inválido.");
    seguranca.gravarSessao(conta.id, chaveDaSessao);
  } catch {
    throw new Error("E-mail ou senha inválidos.");
  }
}

formularioAuth.addEventListener("submit", async evento => {
  evento.preventDefault();
  mensagemAuth.hidden = true;
  mensagemAuth.textContent = "";

  const dados = new FormData(formularioAuth);
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  const senha = String(dados.get("senha") ?? "");
  const tipo = formularioAuth.dataset.tipo;

  if (!validarEmail(email)) {
    mostrarErro("Informe um e-mail válido.");
    return;
  }
  if (tipo === "register" && senha.length < 8) {
    mostrarErro("A senha deve ter pelo menos 8 caracteres.");
    return;
  }
  if (tipo === "register" && senha.length > 1024) {
    mostrarErro("A senha deve ter no máximo 1.024 caracteres.");
    return;
  }
  if (tipo === "register" && senha !== dados.get("confirmarSenha")) {
    mostrarErro("As senhas não coincidem.");
    return;
  }

  botaoEnvio.disabled = true;
  botaoEnvio.textContent = "Aguarde...";
  try {
    if (tipo === "register") {
      await criarConta(email, senha);
    } else {
      await entrar(email, senha);
    }
    window.location.assign("./index.html");
  } catch (erro) {
    console.error("Não foi possível concluir a autenticação local:", erro);
    const mensagem = erro instanceof DOMException && erro.name === "QuotaExceededError"
      ? "O navegador está sem espaço para salvar a conta."
      : erro.message || "Não foi possível concluir a solicitação neste navegador.";
    mostrarErro(mensagem);
  } finally {
    botaoEnvio.disabled = false;
    botaoEnvio.textContent = textoBotaoOriginal;
    formularioAuth.elements.senha.value = "";
    if (formularioAuth.elements.confirmarSenha) formularioAuth.elements.confirmarSenha.value = "";
  }
});

carregarTema();
