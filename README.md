# Palace Menu Studio

Aplicação operacional do Palace Lounge. Inclui autenticação, biblioteca de pratos, rascunhos, publicação versionada, menu público, QR Code, exportação PNG e CRM básico de reservas e clientes ligado ao website existente.

A utilização, configuração e segurança da integração estão documentadas em [INTEGRACAO-CRM.md](INTEGRACAO-CRM.md).

O endereço provisório do **Palace Studio** é `https://palacelounge.mazanga.digital`. O website público mantém o seu próprio endereço. A base de produção é a PostgreSQL já indicada em `DATABASE_URL`; não é necessário criar outra base. Consulte [PUBLICACAO.md](PUBLICACAO.md) para a configuração e o estado da publicação.

## Executar no computador

Requer Node.js 22.13 ou superior e npm. A primeira instalação precisa de Internet; a utilização local não depende de serviços externos.

```sh
npm ci
cp .env.example .env
npm run dev
```

Abrir **http://127.0.0.1:3000/setup**. Criar o nome, email e palavra-passe da primeira conta. Não existem credenciais predefinidas. A criação inicial local só é aceite num endereço de loopback; o servidor de desenvolvimento escuta apenas nesse endereço. Depois de criada a conta, `/setup` deixa de estar disponível.

Endereços:

| Endereço | Utilização |
| --- | --- |
| `/studio` | Início administrativo protegido |
| `/studio/biblioteca` | Pratos e categorias |
| `/studio/menu` | Editor e pré-visualização |
| `/studio/publicacoes` | PNG, ZIP, regeneração e versões anteriores |
| `/studio/reservas` | Pedidos do website, reservas manuais e estados |
| `/studio/clientes` | Contactos, VIP e histórico de reservas e visitas |
| `/menu` | Menu público sem login |
| `/login` | Autenticação |

O logótipo utilizado é o ficheiro oficial fornecido em `logo/logo.jpg`. As fontes Cormorant Garamond e Manrope estão incluídas em `public/fonts`, com as respectivas licenças. Não há pratos, preços, categorias ou contactos inventados na aplicação inicial.

### Acesso local

Na configuração actual deste computador, a porta 3000 pertence a outra aplicação. O Palace Studio foi iniciado em **http://127.0.0.1:3002**, com `npm run dev -- --port 3002`, e utiliza a base Palace do Render através de TLS. O website local continua na porta 3001. As credenciais administrativas existentes foram preservadas na transferência.

Utilize o endereço exacto impresso pelo servidor: `http://127.0.0.1:3000`. Se outra aplicação estiver a escutar em IPv6 na porta 3000, `localhost:3000` poderá abrir essa outra aplicação. A validação de origem aceita o host efectivamente utilizado pelo browser, mesmo quando o Next.js constrói o URL interno com o endereço de escuta. Pedidos de outros sites continuam bloqueados.

## Configuração e utilização inicial

1. Criar a conta administrativa.
2. Abrir **Biblioteca de Pratos → Categorias** e criar as categorias aprovadas pelo restaurante. As setas definem a ordem. Pode editar ou desactivar categorias.
3. Adicionar os pratos oficiais, com preços em Kz e fotografias opcionais.
4. Abrir **Menu do Dia** e seleccionar vários pratos da biblioteca. Também pode adicionar um prato apenas a esse menu.
5. Organizar categorias e pratos pelas setas; ajustar preços ou descrições para esse dia.
6. Guardar o rascunho. Pré-visualizar Digital, Feed e Story no painel direito; no telemóvel, utilizar o separador **Pré-visualizar**.
7. Clicar em **Publicar menu**. O menu público é actualizado numa transacção. A geração de imagens acontece de seguida, no mesmo pedido.
8. Descarregar os PNG no editor ou em **Publicações**. Várias páginas são descarregadas num ZIP. Pode abrir cada imagem e descarregá-la individualmente.
9. Em **Início → Menu digital → QR Code**, copiar o endereço ou descarregar PNG/SVG. Configurar primeiro o domínio final antes de imprimir.

**Definições** permite configurar o website e o contacto oficiais. **A minha conta** permite alterar o nome e a palavra-passe mediante confirmação da palavra-passe actual. Uma mudança de palavra-passe revoga as outras sessões.

## Persistência e arquitectura

- Next.js App Router, TypeScript e React; CSS responsivo próprio, com identidade exclusivamente branca e dourada.
- Desenvolvimento: PostgreSQL PGlite persistente em `data/postgres`. É uma base de dados PostgreSQL real, executada localmente em WebAssembly; não é armazenamento no browser. Utilizar um único processo para este modo.
- Produção: PostgreSQL externo através de `DATABASE_URL`, com o mesmo esquema SQL. Os dados locais não são transferidos automaticamente para uma base externa; deve efectuar uma exportação/importação antes de mudar de modo se já tiver conteúdo.
- Consultas parametrizadas, relações com chaves estrangeiras e restrições de integridade. Esquema inicial e registo de migração em `lib/db.ts`, aplicados de forma idempotente na primeira ligação.
- Fotografias reprocessadas para WebP, até 3 MB no envio, e PNG persistidos em `media_files` no PostgreSQL. Não dependem do filesystem da Vercel. Fora da Vercel, `DATA_DIR/photos` e `DATA_DIR/exports` recebem também cópias locais para backup.
- Os endpoints de PNG e downloads exigem uma sessão administrativa. As fotografias dos pratos são públicas, para utilização no menu. Downloads ZIP e pré-visualizações são enviados em streaming.
- `menus` contém o rascunho e a referência à versão publicada. `versions.items` guarda um snapshot dos nomes, categorias, descrições, preços e referências de fotografias.
- Transacções e bloqueio de linha garantem publicação consistente. A revisão optimista impede que uma janela substitua silenciosamente alterações guardadas noutra.
- Sem exclusão definitiva de pratos: a desactivação preserva as referências e o histórico.

O menu público consulta apenas a versão publicada da data actual em `Africa/Luanda`. Na ausência dessa versão, apresenta a mensagem de indisponibilidade. O menu anterior não aparece como se fosse o actual. Pode guardar datas futuras como rascunhos, mas só publicar manualmente na data actual; não há agendamento.

## Geração de imagens

`lib/render.ts` utiliza `@napi-rs/canvas` no servidor. As fontes locais e o logótipo oficial são carregados explicitamente; as instâncias estáticas das fontes garantem o peso correcto no motor nativo; o texto é medido antes de compor as páginas. O gerador mantém os tamanhos de letra, divide o conteúdo em páginas e repete a categoria quando esta continua noutra página.

| Formato | Dimensões |
| --- | --- |
| Instagram Feed | 1080 × 1350 px |
| Story / WhatsApp Status | 1080 × 1920 px |

Uma descrição excepcionalmente longa que não caiba sequer numa página devolve uma mensagem para a encurtar; o conteúdo não é cortado. Uma falha de renderização não reverte a publicação do menu. **Regenerar imagens** repete a exportação da mesma versão sem criar uma publicação nova. As imagens e referências são actualizadas na mesma transacção, depois de ambos os formatos estarem gerados. Outras versões conservam as suas imagens e os seus preços.

O QR Code usa sempre `PUBLIC_URL` com o caminho `/menu`, módulos em dourado profundo, fundo branco, margem de quatro módulos e elevada correcção de erros. O PNG tem 1600 px e o SVG é vectorial.

## Produção

O destino escolhido é a **Vercel**, com a base PostgreSQL Palace existente no Render. O repositório indicado pelo utilizador é [olavotavarestiny-gif/palace-studio](https://github.com/olavotavarestiny-gif/palace-studio). Os passos e o estado actual estão em [PUBLICACAO.md](PUBLICACAO.md).

É necessário configurar:

1. Na Vercel: framework Next.js, Node.js 24, região Frankfurt (`fra1`), instalação `npm ci` e build `npm run build`. `vercel.json` e `.nvmrc` já indicam esta configuração.
2. `DATABASE_URL` com a ligação **externa** do Render e `sslmode=verify-full`. A ligação interna só funciona dentro do Render. Nunca desactivar a verificação de certificados.
3. `PUBLIC_URL=https://palacelounge.mazanga.digital`, `PALACE_RESERVATION_SECRET` igual ao do website e `CRM_RETENTION_MONTHS=24`. O ficheiro privado local `.env.vercel.local` contém os valores a importar no painel da Vercel; não está no Git.
4. Adicionar o domínio ao projecto Vercel e seguir os registos DNS indicados nesse painel. A publicação e a configuração DNS serão feitas pelo utilizador.
5. A conta existente já foi transferida e pode utilizar as mesmas credenciais. Não criar uma segunda primeira conta nem definir `SETUP_TOKEN` nesta instalação.
6. Cópias de segurança regulares do PostgreSQL, incluindo a tabela `media_files`, e teste de recuperação. Ficheiros `.env`, backups e dados locais são excluídos do Git e dos bundles de produção.

Como alternativa à Vercel, um servidor Node.js ou o `Dockerfile` continuam suportados. Nesse caso:

```sh
npm ci
npm run build
npm start
```

`next start` escuta em todas as interfaces para permitir um reverse proxy; a porta pode ser definida com `PORT`. O reverse proxy deve preservar o host/origem e limitar pedidos a 4 MB, ter um timeout adequado para menus grandes e terminar HTTPS. Não colocar a área `/studio` em cache.

As dependências nativas de imagem são instaladas pelo npm para a plataforma de destino. Fazer `npm ci` no Linux de produção, sem copiar `node_modules` do macOS. `compose.yaml` usa a `DATABASE_URL` existente e mantém cópias locais das imagens num volume. Não cria outra base de dados. Na Vercel não é necessário criar um disco nem contratar outro serviço de armazenamento: as imagens estão no PostgreSQL existente.

`ALLOW_EMBEDDED_DB=1` e `ALLOW_HTTP_LOCAL=1` são escapes explícitos apenas para testes locais do build de produção; não os definir numa instalação pública.

## Segurança

Palavras-passe com scrypt e salt aleatório; tokens de sessão aleatórios de 256 bits, guardados apenas como hash na base de dados; cookies HttpOnly, SameSite=Lax, Secure em produção, com 12 horas de validade; revogação no logout. Limitação de tentativas por email, validação de origem para operações de escrita, validação no servidor, cabeçalhos de segurança e consultas SQL parametrizadas. Endpoints administrativos repetem a verificação de sessão. Não há inscrição pública depois da primeira conta. Nunca colocar `.env`, a base de dados ou ficheiros privados na pasta `public`.

Não estão incluídos envio de emails, recuperação de palavra-passe por email, publicação automática em redes sociais, pagamentos, marketing ou CRM avançado. O CRM básico de reservas e clientes está incluído.

## Verificação

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Para instalar o navegador de testes, se necessário: `npx playwright install chromium`. O Next.js permite apenas um servidor de desenvolvimento por checkout. Para testar com os servidores locais em execução, utilize os builds de produção nas portas isoladas, conforme `INTEGRACAO-CRM.md`.

Os testes do núcleo usam uma base temporária do sistema. Os testes de navegador criam uma pasta isolada por execução em `data/e2e/<execução>` e usam a porta 3100. Os pratos e a conta de teste estão identificados como demonstração e não entram na base local normal em `data/postgres`. As capturas de ecrã e eventuais traces são guardados em `test-results`; estes podem conter os dados de teste e não devem ser publicados como conteúdo oficial.

O cenário E2E cobre criação de categoria e três pratos, rascunho, pré-visualização dos dois formatos, publicação, menu público, PNG nas dimensões exactas, download real, alteração de preço isolada, republicação, QR descodificado e estável, histórico e ZIP. Verifica ainda as larguras 360, 390, 430, 768, 1024 e 1440 px e a protecção dos endpoints.

Referência visual consultada: [The Ritz Restaurant](https://www.theritzlondon.com/dine-with-us/the-ritz-restaurant/). A aplicação utiliza apenas os princípios de composição clássica e a identidade própria do Palace.
