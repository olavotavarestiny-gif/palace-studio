# Publicar o Palace Studio na Vercel

O alojamento escolhido pelo utilizador é a **Vercel**, com o repositório **https://github.com/olavotavarestiny-gif/palace-studio**. A base continua a ser a **Palace** existente no Render, workspace **MAZANGA ELECTRIC**, região **Frankfurt**. Não é necessário criar uma segunda base ou um serviço web no Render.

## Configuração pronta

- Framework: **Next.js**.
- Pasta raiz: **./**.
- Node.js: **24.x**.
- Instalação: **npm ci**.
- Build: **npm run build**.
- Pasta de saída: manter a predefinição do framework.
- Região das funções: **fra1**, junto da base; definida em `vercel.json`.
- Domínio provisório, exclusivo do Studio: **https://palacelounge.mazanga.digital**.

## Variáveis de ambiente

Importar no projecto Vercel os quatro valores do ficheiro **privado local** `.env.vercel.local`. O ficheiro fica fora do Git e dos bundles; não enviar o seu conteúdo para o chat, repositório ou logs.

| Variável | Valor |
| --- | --- |
| DATABASE_URL | Ligação externa da base Palace no Render, com `sslmode=verify-full` |
| PUBLIC_URL | https://palacelounge.mazanga.digital |
| PALACE_RESERVATION_SECRET | O segredo privado já partilhado com o website |
| CRM_RETENTION_MONTHS | 24 |

Na Vercel, não usar a ligação interna curta do `.env`: essa ligação só resolve dentro do Render. A ligação externa aponta para a mesma base e as mesmas credenciais, com verificação TLS. Não definir `ALLOW_HTTP_LOCAL`, `ALLOW_EMBEDDED_DB` ou `SETUP_TOKEN` nesta instalação. A conta administrativa existente já foi transferida; iniciar sessão com as mesmas credenciais.

## Dados e imagens preservados

A base estava vazia antes da transferência. Uma cópia offline da base local e das imagens está em `data/backups/before-remote-postgres-20261019T150347Z`, com acesso privado. A transferência foi transaccional e o conteúdo de cada tabela foi comparado por hash antes do commit. Uma repetição foi correctamente recusada por o destino já conter dados.

Foram preservados uma conta, nove categorias, 17 pratos, um cliente, uma reserva, um menu, uma versão, cinco referências de imagens, três registos de auditoria e as definições. As sessões locais não foram copiadas. A base local original permanece intacta.

As cinco imagens existentes, num total de 976 630 bytes, foram guardadas na tabela `media_files` e verificadas por conteúdo. Novas fotografias e PNG ficam também no PostgreSQL, na mesma transacção das referências da publicação. Assim, não é necessário um disco persistente na Vercel. As cópias locais continuam disponíveis fora da Vercel para backup. Fotografias podem ser enviadas até 3 MB; ZIP, PNG e pré-visualizações utilizam streaming nas respostas.

O plano actual da base é gratuito e o Render indica validade até **18 de Novembro de 2026**. Não foi alterado o plano nem criado qualquer recurso pago. Antes dessa data, definir a continuidade da base e conservar backups externos; um backup PostgreSQL deve incluir `media_files`.

## Publicar e ligar o domínio

1. Importar `olavotavarestiny-gif/palace-studio` na Vercel, usando a branch `main`.
2. Configurar as variáveis acima antes do primeiro deploy.
3. Publicar com as predefinições Next.js e Node.js 24.
4. No projecto Vercel, adicionar `palacelounge.mazanga.digital` em **Settings → Domains**.
5. No fornecedor DNS de `mazanga.digital`, criar exactamente o registo indicado pela Vercel. O destino depende do projecto; não foi inventado um CNAME nem alterado outro domínio.
6. Depois de o domínio resolver e o HTTPS estar válido, abrir `/login`, iniciar sessão e verificar menus, reservas e clientes. O endereço público do QR será `https://palacelounge.mazanga.digital/menu`.

A publicação do projecto e o DNS serão feitos pelo utilizador. A preparação do código não significa que o domínio já esteja online. Não activar cache pública para `/studio` ou `/api/crm/*`.

## Website público

O website público é um projecto separado, em `../palacelounge-site`; este domínio não substitui a homepage. Depois do Studio estar online, configurar no servidor do website:

```dotenv
PALACE_STUDIO_URL=https://palacelounge.mazanga.digital
PALACE_MENU_FEED_URL=https://palacelounge.mazanga.digital/api/published-menu
PALACE_RESERVATION_SECRET=<o mesmo segredo privado do Studio>
```

`NEXT_PUBLIC_SITE_URL` mantém o endereço do website público. Publicar também a versão do website que contém a integração de reservas; o respectivo código fica no seu próprio repositório. Verificar um pedido real autorizado até à recepção Pendente no Studio e à confirmação pela equipa.

## Desenvolvimento

O Studio deste computador utiliza a mesma base remota, através da ligação externa em `.env.development.local`. Está em **http://127.0.0.1:3002**, porque a porta 3000 pertence a outra aplicação. O website local continua em **http://127.0.0.1:3001** e aponta para a porta 3002.

O `.env` original conserva a ligação interna, útil se no futuro o Studio for alojado no Render, na mesma conta e região. Na Vercel, importar sempre os valores externos do ficheiro privado preparado.

## Mudar de domínio depois do contrato

Adicionar o novo domínio ao mesmo projecto Vercel, configurar DNS/HTTPS, actualizar `PUBLIC_URL` e as duas variáveis de integração no website, e voltar a publicar. A base, os clientes, as reservas, os menus e as imagens permanecem no mesmo PostgreSQL. A equipa inicia sessão no novo domínio.

Regenerar o QR. Se já existirem QR impressos com o endereço provisório, manter o domínio antigo activo com redireccionamento permanente de `/menu` para o novo endereço.

## Referências

- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/functions/limitations
- https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
- https://render.com/docs/postgresql-creating-connecting
