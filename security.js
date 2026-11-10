// Criptografa cada quadro local com uma chave derivada da senha do usuário.
(function () {
  const CHAVE_CONTAS = "meu-kanban-contas-v1";
  const PREFIXO_CONTA = "meu-kanban-conta-v1-";
  const CHAVE_SESSAO = "meu-kanban-sessao-v1";
  const ITERACOES = 310000;
  const codificador = new TextEncoder();
  const decodificador = new TextDecoder();

  function paraBase64(bytes) {
    let binario = "";
    bytes.forEach(byte => { binario += String.fromCharCode(byte); });
    return btoa(binario);
  }

  function deBase64(texto) {
    return Uint8Array.from(atob(texto), caractere => caractere.charCodeAt(0));
  }

  async function derivarChave(senha, sal) {
    const material = await crypto.subtle.importKey(
      "raw",
      codificador.encode(senha),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits({
      name: "PBKDF2",
      hash: "SHA-256",
      salt: sal,
      iterations: ITERACOES,
    }, material, 256);
    const segredo = new Uint8Array(bits);
    try {
      const chave = await crypto.subtle.importKey("raw", segredo, "AES-GCM", false, ["encrypt", "decrypt"]);
      return { chave, chaveDaSessao: paraBase64(segredo) };
    } finally {
      segredo.fill(0);
    }
  }

  async function importarChaveDaSessao(chaveCodificada) {
    const segredo = deBase64(chaveCodificada);
    if (segredo.length !== 32) throw new Error("Chave de sessão inválida.");
    try {
      return await crypto.subtle.importKey("raw", segredo, "AES-GCM", false, ["encrypt", "decrypt"]);
    } finally {
      segredo.fill(0);
    }
  }

  async function criptografarQuadro(quadro, chave) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cifrado = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      chave,
      codificador.encode(JSON.stringify(quadro)),
    );
    return { iv: paraBase64(iv), quadroCifrado: paraBase64(new Uint8Array(cifrado)) };
  }

  async function descriptografarQuadro(conta, chave) {
    const claro = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: deBase64(conta.iv) },
      chave,
      deBase64(conta.quadroCifrado),
    );
    return JSON.parse(decodificador.decode(claro));
  }

  function lerListaContas() {
    const dados = localStorage.getItem(CHAVE_CONTAS);
    if (dados === null) return [];
    const contas = JSON.parse(dados);
    if (!Array.isArray(contas) || contas.some(conta =>
      !conta || typeof conta.id !== "string" || typeof conta.email !== "string")) {
      throw new Error("A lista local de contas está inválida.");
    }
    return contas;
  }

  function gravarListaContas(contas) {
    localStorage.setItem(CHAVE_CONTAS, JSON.stringify(contas));
  }

  function lerConta(id) {
    const dados = localStorage.getItem(PREFIXO_CONTA + id);
    return dados === null ? null : JSON.parse(dados);
  }

  function gravarConta(conta) {
    localStorage.setItem(PREFIXO_CONTA + conta.id, JSON.stringify(conta));
  }

  function validarQuadro(quadro) {
    if (!quadro || !Array.isArray(quadro.colunas) || !Array.isArray(quadro.tarefas) ||
        quadro.colunas.length < 1 || quadro.colunas.length > 50 || quadro.tarefas.length > 500) {
      return false;
    }

    const idsColunas = new Set();
    const colunasValidas = quadro.colunas.every(coluna => {
      if (!coluna || typeof coluna.id !== "string" || idsColunas.has(coluna.id) ||
          typeof coluna.titulo !== "string" || !coluna.titulo.trim() || coluna.titulo.length > 120 ||
          typeof coluna.cor !== "string" || !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(coluna.cor)) {
        return false;
      }
      idsColunas.add(coluna.id);
      return true;
    });
    if (!colunasValidas) return false;

    const idsTarefas = new Set();
    return quadro.tarefas.every(tarefa => {
      if (!tarefa || typeof tarefa.id !== "string" || idsTarefas.has(tarefa.id) ||
          typeof tarefa.titulo !== "string" || !tarefa.titulo.trim() || tarefa.titulo.length > 120 ||
          typeof tarefa.descricao !== "string" || tarefa.descricao.length > 1000 ||
          !["baixa", "media", "alta"].includes(tarefa.prioridade) ||
          !idsColunas.has(tarefa.coluna) ||
          typeof tarefa.entrega !== "string" ||
          (tarefa.entrega !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(tarefa.entrega))) {
        return false;
      }
      idsTarefas.add(tarefa.id);
      return true;
    });
  }

  function gravarSessao(id, chaveDaSessao) {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ id, chaveDaSessao }));
  }

  function lerSessao() {
    const dados = sessionStorage.getItem(CHAVE_SESSAO);
    if (dados === null) return null;
    const sessao = JSON.parse(dados);
    if (!sessao || typeof sessao.id !== "string" || typeof sessao.chaveDaSessao !== "string") {
      throw new Error("A sessão local está inválida.");
    }
    return sessao;
  }

  function limparSessao() {
    sessionStorage.removeItem(CHAVE_SESSAO);
  }

  window.KanbanSecurity = Object.freeze({
    derivarChave,
    importarChaveDaSessao,
    criptografarQuadro,
    descriptografarQuadro,
    lerListaContas,
    gravarListaContas,
    lerConta,
    gravarConta,
    validarQuadro,
    gravarSessao,
    lerSessao,
    limparSessao,
  });
})();
