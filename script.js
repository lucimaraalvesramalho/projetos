// ===== Configuração e estado =====
// O quadro criptografado e a preferência de tema ficam somente neste navegador.
const CHAVE_DADOS_ANTIGA = "meu-kanban-dados-v1";
const CHAVE_TEMA = "meu-kanban-tema-v1";
// Paleta reaproveitada em sequência quando novas colunas são criadas.
const CORES_COLUNAS = ["#7b6ce0", "#e7a23b", "#35a77a", "#e36c83", "#4d9ac8"];
// Liga os valores internos de prioridade aos nomes e classes apresentados na interface.
const PRIORIDADES = {
  baixa: { rotulo: "Baixa", cor: "priority-baixa" },
  media: { rotulo: "Média", cor: "priority-media" },
  alta: { rotulo: "Alta", cor: "priority-alta" },
};
const seguranca = window.KanbanSecurity;
let chaveQuadro = null;
let contaAtual = null;
let filaSalvamento = Promise.resolve();

// Gera identificadores únicos para tarefas e colunas.
function novoId() {
  return crypto.randomUUID();
}

// Cria a estrutura padrão do quadro, usada na primeira visita ou se os dados salvos forem inválidos.
function estadoInicial() {
  return {
    colunas: [
      { id: novoId(), titulo: "A Fazer", cor: CORES_COLUNAS[0] },
      { id: novoId(), titulo: "Em Andamento", cor: CORES_COLUNAS[1] },
      { id: novoId(), titulo: "Concluído", cor: CORES_COLUNAS[2] },
    ],
    tarefas: [],
  };
}

// Mantém o quadro em memória até a sessão local ser validada.
const state = {
  ...estadoInicial(),
  filtroTexto: "",
  filtroPrioridade: "",
  tarefaEditandoId: null,
  colunaDaTarefa: null,
  tarefaArrastadaId: null,
  avisoTimer: null,
};

// ===== Elementos da interface =====
// Referências aos elementos estáticos usados por várias rotinas.
const quadro = document.getElementById("quadro");
const modal = document.getElementById("modal-tarefa");
const formulario = document.getElementById("form-tarefa");
const campoTitulo = document.getElementById("campo-titulo");
const campoDescricao = document.getElementById("campo-descricao");
const campoPrioridade = document.getElementById("campo-prioridade");
const campoEntrega = document.getElementById("campo-entrega");
const erroTitulo = document.getElementById("erro-titulo");
const aviso = document.getElementById("aviso");
const botaoTema = document.getElementById("btn-tema");

// Salva o quadro criptografado na conta ativa, sem gravar tarefas em texto puro.
function salvarEstado() {
  if (!contaAtual || !chaveQuadro) return filaSalvamento;
  const quadroAtual = {
      colunas: state.colunas,
      tarefas: state.tarefas,
  };
  filaSalvamento = filaSalvamento.catch(() => {}).then(async () => {
    const conta = seguranca.lerConta(contaAtual.id);
    if (!conta) throw new Error("A conta local não foi encontrada.");
    const cifrado = await seguranca.criptografarQuadro(quadroAtual, chaveQuadro);
    seguranca.gravarConta({ ...conta, ...cifrado });
  }).catch(erro => {
    console.error("Não foi possível salvar o quadro criptografado:", erro);
    mostrarAviso("Não foi possível salvar o quadro. Verifique o espaço disponível no navegador.");
  });
  return filaSalvamento;
}

// Recupera a preferência de tema e usa o tema claro como padrão.
function carregarTema() {
  try {
    return localStorage.getItem(CHAVE_TEMA) === "escuro" ? "escuro" : "claro";
  } catch (erro) {
    console.error("Não foi possível carregar a preferência de tema:", erro);
    return "claro";
  }
}

// Persiste a preferência de tema e informa o usuário se o navegador não permitir o armazenamento.
function salvarTema(tema) {
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch (erro) {
    console.error("Não foi possível salvar a preferência de tema:", erro);
    mostrarAviso("Não foi possível salvar a preferência de tema neste navegador.");
  }
}

// ===== Renderização =====
// Recria as colunas da interface a partir do estado atual.
function renderizar() {
  quadro.replaceChildren(...state.colunas.map(criarColuna));
}

// Monta uma coluna, seus cartões filtrados, controles e eventos de arrastar e soltar.
function criarColuna(coluna) {
  const tarefasDaColuna = state.tarefas.filter(tarefa => tarefa.coluna === coluna.id);
  const tarefasVisiveis = tarefasDaColuna.filter(tarefa => {
    const texto = `${tarefa.titulo} ${tarefa.descricao}`.toLocaleLowerCase("pt-BR");
    const combinaTexto = texto.includes(state.filtroTexto);
    const combinaPrioridade = !state.filtroPrioridade || tarefa.prioridade === state.filtroPrioridade;
    return combinaTexto && combinaPrioridade;
  });

  const secao = document.createElement("section");
  secao.className = "column";
  secao.dataset.colunaId = coluna.id;

  const cabecalho = document.createElement("div");
  cabecalho.className = "column-heading";
  const nomeWrap = document.createElement("div");
  nomeWrap.className = "column-title-wrap";
  const ponto = document.createElement("span");
  ponto.className = "column-dot";
  ponto.style.setProperty("--column-color", coluna.cor);
  ponto.setAttribute("aria-hidden", "true");
  const titulo = document.createElement("h2");
  titulo.textContent = coluna.titulo;
  const contador = document.createElement("span");
  contador.className = "column-count";
  contador.textContent = tarefasDaColuna.length;
  contador.setAttribute("aria-label", `${tarefasDaColuna.length} tarefas`);
  nomeWrap.append(ponto, titulo, contador);

  const controles = document.createElement("div");
  controles.className = "column-controls";
  controles.append(
    criarBotaoIcone("Renomear coluna " + coluna.titulo, "✎", () => renomearColuna(coluna.id)),
    criarBotaoIcone("Excluir coluna " + coluna.titulo, "×", () => excluirColuna(coluna.id), "delete-column"),
  );
  cabecalho.append(nomeWrap, controles);

  const lista = document.createElement("div");
  lista.className = "task-list";
  lista.dataset.colunaId = coluna.id;
  tarefasVisiveis.forEach(tarefa => lista.appendChild(criarCard(tarefa)));

  if (tarefasVisiveis.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "empty-state";
    vazio.textContent = state.filtroTexto || state.filtroPrioridade
      ? "Nenhuma tarefa corresponde aos filtros."
      : "Nenhuma tarefa por aqui ainda.";
    lista.appendChild(vazio);
  }

  const adicionar = document.createElement("button");
  adicionar.className = "add-task";
  adicionar.type = "button";
  adicionar.textContent = "+ Adicionar tarefa";
  adicionar.setAttribute("aria-label", `Adicionar tarefa em ${coluna.titulo}`);
  adicionar.addEventListener("click", () => abrirModal(coluna.id));

  secao.addEventListener("dragover", evento => {
    evento.preventDefault();
    evento.dataTransfer.dropEffect = "move";
    secao.classList.add("drop-target");
  });
  secao.addEventListener("dragleave", evento => {
    if (!secao.contains(evento.relatedTarget)) secao.classList.remove("drop-target");
  });
  secao.addEventListener("drop", evento => {
    evento.preventDefault();
    secao.classList.remove("drop-target");
    soltarTarefa(coluna.id, lista, evento.clientY);
  });

  secao.append(cabecalho, lista, adicionar);
  return secao;
}

// Monta um cartão de tarefa com prioridade, descrição, entrega e ações disponíveis.
function criarCard(tarefa) {
  const card = document.createElement("article");
  card.className = "card";
  card.draggable = true;
  card.dataset.tarefaId = tarefa.id;
  card.setAttribute("aria-label", `Tarefa: ${tarefa.titulo}`);

  card.addEventListener("dragstart", evento => {
    state.tarefaArrastadaId = tarefa.id;
    evento.dataTransfer.effectAllowed = "move";
    evento.dataTransfer.setData("text/plain", tarefa.id);
    requestAnimationFrame(() => card.classList.add("dragging"));
  });
  card.addEventListener("dragend", () => {
    state.tarefaArrastadaId = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".drop-target").forEach(elemento => elemento.classList.remove("drop-target"));
  });

  const prioridade = PRIORIDADES[tarefa.prioridade];
  const badge = document.createElement("span");
  badge.className = `priority-badge ${prioridade.cor}`;
  badge.textContent = `● ${prioridade.rotulo}`;

  const titulo = document.createElement("h3");
  titulo.textContent = tarefa.titulo;
  card.append(badge, titulo);

  if (tarefa.descricao) {
    const descricao = document.createElement("p");
    descricao.className = "card-description";
    descricao.textContent = tarefa.descricao;
    card.appendChild(descricao);
  }

  if (tarefa.entrega) {
    const entrega = document.createElement("p");
    entrega.className = "due-date";
    entrega.textContent = `◷ Entrega: ${formatarData(tarefa.entrega)}`;
    card.appendChild(entrega);
  }

  const acoes = document.createElement("div");
  acoes.className = "card-actions";
  acoes.append(
    criarBotaoTexto("Editar", () => abrirModal(tarefa.coluna, tarefa.id)),
    criarBotaoTexto("Excluir", () => excluirTarefa(tarefa.id), "delete-task"),
  );
  const indiceColuna = state.colunas.findIndex(coluna => coluna.id === tarefa.coluna);
  if (indiceColuna >= 0 && indiceColuna < state.colunas.length - 1) {
    const proxima = state.colunas[indiceColuna + 1];
    acoes.appendChild(criarBotaoTexto(`Mover para ${proxima.titulo}`, () => moverTarefa(tarefa.id, proxima.id)));
  }
  card.appendChild(acoes);
  return card;
}

// Cria um botão compacto com ícone, nome acessível e ação associada.
function criarBotaoIcone(rotulo, icone, aoClicar, classe = "") {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = `small-icon ${classe}`.trim();
  botao.textContent = icone;
  botao.setAttribute("aria-label", rotulo);
  botao.title = rotulo;
  botao.addEventListener("click", aoClicar);
  return botao;
}

// Cria um botão textual reutilizável para as ações do cartão.
function criarBotaoTexto(texto, aoClicar, classe = "") {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = classe;
  botao.textContent = texto;
  botao.addEventListener("click", aoClicar);
  return botao;
}

// Converte uma data ISO (AAAA-MM-DD) para o formato curto usado no Brasil.
function formatarData(data) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(ano, mes - 1, dia)));
}

// ===== Ações do quadro =====
// Atualiza a coluna de uma tarefa e redesenha o quadro.
function moverTarefa(id, colunaDestino) {
  const tarefa = state.tarefas.find(item => item.id === id);
  if (!tarefa || !state.colunas.some(coluna => coluna.id === colunaDestino)) return;
  tarefa.coluna = colunaDestino;
  salvarEstado();
  renderizar();
}

// Solicita confirmação antes de remover permanentemente uma tarefa.
function excluirTarefa(id) {
  const tarefa = state.tarefas.find(item => item.id === id);
  if (!tarefa || !confirm(`Excluir a tarefa "${tarefa.titulo}"?`)) return;
  state.tarefas = state.tarefas.filter(item => item.id !== id);
  salvarEstado();
  renderizar();
}

// Move a tarefa arrastada para outra coluna e posiciona-a conforme o ponto de soltura.
function soltarTarefa(colunaDestino, lista, posicaoY) {
  const id = state.tarefaArrastadaId;
  if (!id) return;
  const indiceOrigem = state.tarefas.findIndex(tarefa => tarefa.id === id);
  if (indiceOrigem < 0) return;

  const [tarefa] = state.tarefas.splice(indiceOrigem, 1);
  tarefa.coluna = colunaDestino;

  const cards = [...lista.querySelectorAll(".card")].filter(card => card.dataset.tarefaId !== id);
  const cardSeguinte = cards.find(card => {
    const retangulo = card.getBoundingClientRect();
    return posicaoY < retangulo.top + retangulo.height / 2;
  });

  if (cardSeguinte) {
    const indiceDestino = state.tarefas.findIndex(item => item.id === cardSeguinte.dataset.tarefaId);
    state.tarefas.splice(indiceDestino, 0, tarefa);
  } else {
    let indiceFinal = -1;
    state.tarefas.forEach((item, indice) => {
      if (item.coluna === colunaDestino) indiceFinal = indice;
    });
    state.tarefas.splice(indiceFinal + 1, 0, tarefa);
  }
  salvarEstado();
  renderizar();
}

// Solicita e valida o nome de uma nova coluna antes de adicioná-la ao quadro.
function adicionarColuna() {
  const titulo = prompt("Qual será o nome da nova coluna?");
  if (titulo === null) return;
  const nome = titulo.trim();
  if (!nome) {
    mostrarAviso("O nome da coluna não pode ficar vazio.");
    return;
  }
  if (nome.length > 120) {
    mostrarAviso("O nome da coluna deve ter no máximo 120 caracteres.");
    return;
  }
  state.colunas.push({
    id: novoId(),
    titulo: nome,
    cor: CORES_COLUNAS[state.colunas.length % CORES_COLUNAS.length],
  });
  salvarEstado();
  renderizar();
}

// Solicita um novo nome para a coluna e impede que ela fique sem título.
function renomearColuna(id) {
  const coluna = state.colunas.find(item => item.id === id);
  if (!coluna) return;
  const titulo = prompt("Novo nome da coluna:", coluna.titulo);
  if (titulo === null) return;
  const nome = titulo.trim();
  if (!nome) {
    mostrarAviso("O nome da coluna não pode ficar vazio.");
    return;
  }
  if (nome.length > 120) {
    mostrarAviso("O nome da coluna deve ter no máximo 120 caracteres.");
    return;
  }
  coluna.titulo = nome;
  salvarEstado();
  renderizar();
}

// Remove uma coluna após confirmação e transfere suas tarefas para outra coluna existente.
function excluirColuna(id) {
  if (state.colunas.length <= 1) {
    mostrarAviso("O quadro precisa ter pelo menos uma coluna.");
    return;
  }
  const coluna = state.colunas.find(item => item.id === id);
  if (!coluna) return;
  const destino = state.colunas.find(item => item.id !== id);
  const quantidade = state.tarefas.filter(tarefa => tarefa.coluna === id).length;
  const mensagem = quantidade
    ? `Excluir "${coluna.titulo}"? ${quantidade} tarefa(s) serão movidas para "${destino.titulo}".`
    : `Excluir a coluna "${coluna.titulo}"?`;
  if (!confirm(mensagem)) return;

  state.tarefas.forEach(tarefa => {
    if (tarefa.coluna === id) tarefa.coluna = destino.id;
  });
  state.colunas = state.colunas.filter(item => item.id !== id);
  salvarEstado();
  renderizar();
}

// Apaga todas as tarefas após pedir confirmação; as colunas são preservadas.
function limparQuadro() {
  if (!confirm("Tem certeza de que deseja excluir todas as tarefas do quadro? Esta ação não pode ser desfeita.")) return;
  state.tarefas = [];
  salvarEstado();
  renderizar();
}

// ===== Modal de tarefas =====
// Prepara o formulário para criar ou editar e abre o diálogo com o foco no título.
function abrirModal(colunaId, tarefaId = null) {
  state.colunaDaTarefa = colunaId;
  state.tarefaEditandoId = tarefaId;
  const tarefa = tarefaId ? state.tarefas.find(item => item.id === tarefaId) : null;
  document.getElementById("modal-titulo").textContent = tarefa ? "Editar tarefa" : "Nova tarefa";
  campoTitulo.value = tarefa?.titulo ?? "";
  campoDescricao.value = tarefa?.descricao ?? "";
  campoPrioridade.value = tarefa?.prioridade ?? "media";
  campoEntrega.value = tarefa?.entrega ?? "";
  erroTitulo.hidden = true;
  if (!modal.open) modal.showModal();
  campoTitulo.focus();
}

// Fecha o diálogo apenas quando estiver aberto.
function fecharModal() {
  if (modal.open) modal.close();
}

// Valida o título e cria uma tarefa nova ou aplica as alterações à tarefa selecionada.
function salvarTarefa(evento) {
  evento.preventDefault();
  const titulo = campoTitulo.value.trim();
  if (!titulo) {
    erroTitulo.hidden = false;
    campoTitulo.focus();
    return;
  }

  const dados = {
    titulo,
    descricao: campoDescricao.value.trim(),
    prioridade: Object.hasOwn(PRIORIDADES, campoPrioridade.value) ? campoPrioridade.value : "media",
    entrega: campoEntrega.value,
  };
  const tarefa = state.tarefaEditandoId
    ? state.tarefas.find(item => item.id === state.tarefaEditandoId)
    : null;

  if (tarefa) {
    Object.assign(tarefa, dados);
  } else {
    state.tarefas.push({
      id: novoId(),
      coluna: state.colunaDaTarefa,
      ...dados,
    });
  }
  salvarEstado();
  fecharModal();
  renderizar();
}

// ===== Tema e mensagens =====
// Atualiza o atributo de tema e os rótulos e ícones acessíveis do botão.
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  const escuro = tema === "escuro";
  botaoTema.setAttribute("aria-label", escuro ? "Ativar tema claro" : "Ativar tema escuro");
  botaoTema.title = escuro ? "Ativar tema claro" : "Ativar tema escuro";
  botaoTema.firstElementChild.textContent = escuro ? "☀" : "☾";
}

// Alterna entre os temas claro e escuro e salva a escolha.
function alternarTema() {
  const tema = document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro";
  aplicarTema(tema);
  salvarTema(tema);
}

async function inicializarConta() {
  try {
    const sessao = seguranca.lerSessao();
    const conta = sessao && seguranca.lerConta(sessao.id);
    if (!sessao || !conta) {
      throw new Error("Não há uma conta conectada nesta aba.");
    }

    const chave = await seguranca.importarChaveDaSessao(sessao.chaveDaSessao);
    const dados = await seguranca.descriptografarQuadro(conta, chave);
    if (!seguranca.validarQuadro(dados)) throw new Error("O quadro salvo está inválido.");

    contaAtual = conta;
    chaveQuadro = chave;
    state.colunas = dados.colunas;
    state.tarefas = dados.tarefas;
    document.getElementById("email-usuario").textContent = conta.email;
    document.body.hidden = false;
    renderizar();
  } catch (erro) {
    console.warn("A sessão local não pôde ser validada.");
    seguranca.limparSessao();
    window.location.replace("./login.html");
  }
}

// Exibe um aviso temporário, substituindo qualquer temporizador anterior.
function mostrarAviso(mensagem) {
  aviso.textContent = mensagem;
  aviso.hidden = false;
  clearTimeout(state.avisoTimer);
  state.avisoTimer = setTimeout(() => { aviso.hidden = true; }, 5000);
}

// ===== Eventos =====
// Atualiza os filtros conforme o usuário digita ou altera a prioridade.
document.getElementById("busca").addEventListener("input", evento => {
  state.filtroTexto = evento.target.value.trim().toLocaleLowerCase("pt-BR");
  renderizar();
});

document.getElementById("filtro-prioridade").addEventListener("change", evento => {
  state.filtroPrioridade = evento.target.value;
  renderizar();
});

// Conecta os botões globais às ações do quadro, do tema e do diálogo.
document.getElementById("btn-adicionar-coluna").addEventListener("click", adicionarColuna);
document.getElementById("btn-limpar").addEventListener("click", limparQuadro);
document.getElementById("btn-tema").addEventListener("click", alternarTema);
document.getElementById("btn-sair").addEventListener("click", async evento => {
  const botao = evento.currentTarget;
  botao.disabled = true;
  try {
    await filaSalvamento;
    seguranca.limparSessao();
    chaveQuadro = null;
    contaAtual = null;
    window.location.assign("./login.html");
  } catch (erro) {
    console.error("Não foi possível encerrar a sessão local:", erro);
    mostrarAviso("Não foi possível sair agora. Tente novamente.");
    botao.disabled = false;
  }
});
document.getElementById("btn-fechar-modal").addEventListener("click", fecharModal);
document.getElementById("btn-cancelar").addEventListener("click", fecharModal);
formulario.addEventListener("submit", salvarTarefa);
// Esconde o erro do título assim que o usuário volta a editar esse campo.
campoTitulo.addEventListener("input", () => { erroTitulo.hidden = true; });
// Permite fechar o diálogo clicando fora do formulário ou usando Escape.
modal.addEventListener("click", evento => {
  if (evento.target === modal) fecharModal();
});
modal.addEventListener("cancel", evento => {
  evento.preventDefault();
  fecharModal();
});

// ===== Inicialização =====
// Aplica o tema salvo e abre o quadro somente após validar a conta local.
aplicarTema(carregarTema());
inicializarConta();
