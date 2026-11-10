# meuKanban

Aplicação estática de Kanban, publicada diretamente pelo GitHub Pages. Não é
necessário instalar dependências, configurar variáveis de ambiente ou executar
um servidor.

## Publicar no GitHub Pages

1. Envie os arquivos deste repositório para o GitHub.
2. No repositório, abra **Settings → Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Escolha a branch desejada e a pasta **/(root)** e salve.
5. Acesse o endereço exibido na página de configurações do Pages.

O arquivo `index.html` está na raiz e usa caminhos relativos, portanto funciona
tanto em um domínio personalizado quanto em um endereço de projeto do GitHub
Pages.

## Armazenamento e privacidade

O cadastro e o login funcionam somente neste navegador. O quadro é criptografado
com AES-GCM usando uma chave derivada da senha (PBKDF2/SHA-256); a senha não é
salva. A chave da sessão fica no `sessionStorage` da aba para permitir recargas e
é removida ao sair. Quadros e contas não são enviados a um servidor ou
sincronizados entre dispositivos.

Como o GitHub Pages não executa código de servidor, este login não é uma
fronteira de segurança confiável: não há limite de tentativas, recuperação de
senha nem proteção contra alguém que controle o navegador ou altere o site. Se
esquecer a senha, o quadro criptografado não poderá ser recuperado. Evite usar
este modo para informações confidenciais.
