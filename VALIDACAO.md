# Registo de validação — 19 de Outubro de 2026

## Resultado

- Compilação de produção Next.js concluída, incluindo a verificação TypeScript.
- Sete testes do núcleo aprovados com PostgreSQL PGlite local persistente.
- Os mesmos sete testes aprovados com PostgreSQL 17 num container local.
- Três testes de navegador aprovados em desenvolvimento e no build de produção, este último ligado ao PostgreSQL 17.
- Auditoria npm das dependências de produção: nenhuma vulnerabilidade conhecida reportada na execução.

## Percurso verificado no navegador

Criação da primeira conta, login, categoria e três pratos de demonstração; selecção múltipla; rascunho; pré-visualizações reais de Feed e Story; publicação e consulta pública; downloads efectivos de PNG a 1080 × 1350 e 1080 × 1920; alteração do preço no rascunho mantendo o preço público anterior; republicação; conservação da versão e das imagens anteriores; ZIP; descodificação do QR Code para o endereço `/menu` e comparação do QR antes e depois da republicação; logout e rejeição de acessos sem sessão.

Os testes do núcleo cobrem ainda mudança de dia em Luanda, palavra-passe incorrecta, impossibilidade de criar uma segunda primeira conta, preços inválidos, menu vazio, datas inválidas, conflito de revisões, rascunhos futuros, bloqueio de publicação de outras datas, duplicação, nomes longos, caracteres portugueses, preços elevados, múltiplas categorias e páginas, falha de renderização simulada e regeneração da mesma versão.

As cinco páginas principais foram verificadas nas larguras **360, 390, 430, 768, 1024 e 1440 px**, sem scroll horizontal. Capturas de desktop, mobile e dos dois formatos PNG foram inspeccionadas visualmente. A edição e a pré-visualização possuem separadores no mobile.

## Dados e alcance

Todos os testes usaram bases isoladas e conteúdo identificado como demonstração. No momento da validação inicial, a base local normal estava sem conta, categorias, pratos ou publicações.

Posteriormente, a pedido do utilizador, foram importados os 17 pratos e as cinco categorias do menu oficial de 19-10-2026 fornecido em imagem. Os preços, os pesos indicados e a unidade por quilograma do Pregado foram preservados. A importação foi transaccional, precedida de cópia de segurança e verificada numa segunda execução sem criar duplicados. Os menus e as publicações existentes não foram alterados. A transcrição está em `imports/palace-menu-2026-10-19.json` e o importador em `scripts/import-palace-menu.ts`.

O PostgreSQL e os servidores de teste foram executados localmente. Não foi feita publicação online, configuração de DNS/HTTPS ou ligação a uma base de dados de produção do restaurante. Os ficheiros Docker foram preparados; a imagem completa da aplicação não foi construída neste ambiente. As condições de alojamento, volume persistente, backups e variáveis necessárias estão descritas em `README.md` e `.env.example`.

## Expansão CRM — reservas, clientes e website

Implementação validada nos dois projectos existentes, mantendo os menus e a identidade visual. As compilações de produção e a verificação TypeScript passaram nos dois projectos.

- **20 testes de lógica e segurança aprovados**: sete de menus, três de origem dos pedidos e dez de CRM. Incluem normalização de telefones angolanos, transacções, recorrência sem duplicação de clientes, idempotência concorrente, estados, revisões, visitas concluídas, pesquisas, correcção de associações, validação, limites persistentes, assinatura HMAC e retenção.
- Os **dez testes de CRM também passaram com PostgreSQL 17**, num container isolado, além do PGlite utilizado nos testes locais.
- **Cinco testes de integração no navegador aprovados**, com os dois builds de produção ligados entre si: submissão real no website, aparição automática no Studio sem recarregar, confirmação, cliente e histórico, segundo pedido com telefone equivalente, reserva manual e conclusão da visita. Cobrem ainda perda da resposta depois da gravação e repetição sem duplicação, acessos anónimos, protecção dos contactos, filtros, registo manual, VIP e correcção da associação.
- **Três testes existentes de menus aprovados novamente**, incluindo publicação, imagens PNG, QR, versões e acesso administrativo.
- **25 testes de regressão do website aprovados**, preservando navegação, galeria, vídeos, menus e os formulários demonstrativos Privé/Beach. O formulário de reservas só apresenta sucesso após uma resposta de gravação válida; em erro conserva os dados e a chave da tentativa.

O CRM foi verificado nas larguras **360, 390, 430, 768, 1024 e 1440 px**, sem scroll horizontal, e o formulário público foi testado num contexto mobile com toque. As capturas de reservas, perfil de cliente e interface mobile foram inspeccionadas. Resultados visuais em `test-results/crm`; regressão dos menus em `test-results/menus`.

As auditorias npm das dependências de produção dos dois projectos não reportaram vulnerabilidades. A verificação dos assets públicos compilados confirmou que o segredo real da integração não está incluído no JavaScript entregue ao navegador.

Antes da migração aditiva foi feita uma cópia de segurança da base local. Foram preservados **17 pratos, uma conta, um menu e uma versão publicada**. Os cenários de demonstração foram executados em bases isoladas; não foram criados clientes ou reservas de teste na base normal. A ligação local entre os servidores foi também verificada com um pedido inválido, sem gravar dados pessoais.

O Studio está configurado em `http://127.0.0.1:3000` e o website em `http://127.0.0.1:3001`. Não foi feita publicação online. A configuração HTTPS/PostgreSQL para alojamento, o protocolo de integração e a manutenção estão documentados em `INTEGRACAO-CRM.md`.

## Ligação à base Palace do Render

Depois da confirmação do workspace MAZANGA ELECTRIC, foi identificada a base Palace existente em Frankfurt, PostgreSQL 18. A ligação externa passou com TLS e verificação do certificado. O destino foi confirmado vazio antes de qualquer escrita.

Foi criada a cópia offline `data/backups/before-remote-postgres-20261019T150347Z`, incluindo PostgreSQL local e imagens. O utilitário de transferência passou em pré-visualização, aplicou o conteúdo numa transacção e comparou o conteúdo de todas as tabelas por hash antes do commit. Contagens confirmadas também através da consulta de leitura do Render: uma conta, 17 pratos, um cliente, uma reserva, um menu, uma versão e cinco referências de imagens. Também foram preservadas nove categorias, três entradas de auditoria e as definições. Uma segunda execução recusou correctamente o destino não vazio, sem sobrescrever dados.

O `.env` conserva a ligação interna para produção. `.env.development.local` utiliza a ligação externa à mesma base, em vez do anterior fallback local. A base local original foi preservada e as sessões não foram copiadas. A equipa pode iniciar sessão com as credenciais existentes.

O Studio local passou para `http://127.0.0.1:3002`, pois a porta 3000 está ocupada por outra aplicação. O website local mantém a porta 3001 e a integração aponta para a porta 3002. O domínio público está configurado, mas ainda não foi criado um serviço web ou publicado o DNS/HTTPS.

## Preparação para Vercel e repositório Palace Studio

O utilizador escolheu a Vercel e o repositório `olavotavarestiny-gif/palace-studio`. A aplicação foi adaptada para funções sem filesystem persistente: fotografias e PNG são guardados em `media_files` no PostgreSQL, com a migração aditiva 3. A geração guarda as imagens e as referências da versão na mesma transacção. ZIP, PNG e pré-visualizações usam streaming; o envio de fotografias fica limitado a 3 MB.

As cinco imagens originais foram importadas para a base Palace existente, num total de 976 630 bytes, com comparação dos conteúdos e preservação dos ficheiros locais. Não foi criado outro serviço de armazenamento.

A compilação de produção e TypeScript passaram. Os 21 testes de lógica passaram, incluindo o cenário que gera PNG e guarda fotografias com uma pasta local impossível de escrever, verificando a leitura pelo PostgreSQL, a imutabilidade dos ficheiros e a rejeição de caminhos inválidos. Os cinco testes de integração website/Studio também passaram novamente. Os quatro testes de navegador de menus passaram com `VERCEL=1`, incluindo envio e leitura pública de uma fotografia noutra sessão, rejeição de imagens acima de 3 MB, publicação, PNG, ZIP, QR, versões, mobile e autenticação. Total desta verificação: **30 testes aprovados**.

Os 11 manifests de tracing da compilação foram verificados: nenhum inclui `.env`, a base local, os backups ou as imagens privadas. O maior manifest contém 475 ficheiros, após excluir os dados locais e corrigir a resolução da pasta PGlite para evitar uma inclusão demasiado ampla.

`vercel.json` define Next.js, `npm ci`, `npm run build` e a região Frankfurt (`fra1`); Node.js 24 está definido no package e em `.nvmrc`. Os valores privados para a Vercel foram preparados em `.env.vercel.local`, fora do Git e do bundle. O ficheiro utiliza a ligação externa TLS à base já preenchida; a ligação interna do `.env` permanece preservada para um eventual alojamento dentro do Render.

O deploy Vercel e os registos DNS serão configurados pelo utilizador. Não foi declarado que o domínio já está online.
