# Palace Studio — reservas e clientes

Esta fase expande os dois projectos existentes. O website continua em `../palacelounge-site`; o Studio permanece neste projecto. A base de dados dos clientes e reservas é a mesma do Studio, com uma migração aditiva em `lib/crm-schema.ts`. Os menus, pratos, publicações, contas e sessões existentes são preservados.

## Utilização

A navegação principal passa a ter **Início, Menus, Publicações, Reservas e Clientes**. **Menus** contém **Menu do Dia** e **Biblioteca de Pratos**. Os endereços antigos continuam disponíveis.

- **Reservas:** pedidos recebidos, quatro indicadores calculados a partir da base, pesquisa, filtros Hoje/Amanhã/Esta semana/Todas e estados. A lista aberta actualiza a cada 15 segundos enquanto estiver visível.
- **Detalhes:** dados enviados, data/hora de Luanda, pessoas, ocasião, observações, notas internas e histórico de alterações. Pode confirmar, recusar, cancelar e concluir uma reserva confirmada. Pode corrigir o cliente associado, preservando os dados originalmente enviados.
- **Nova reserva:** registo manual de pedidos por telefone ou presenciais. É associado pelo telefone e começa pendente. A equipa pode registar uma visita anterior e dar-lhe o estado correcto.
- **Clientes:** pesquisa, ordenação pela última reserva ou quantidade, filtro VIP, criação e edição manual. Cada perfil distingue o total de reservas das visitas com estado Concluída e apresenta reservas anteriores e futuras.
- **WhatsApp:** abre apenas uma conversa com o contacto da reserva. Nenhuma mensagem é enviada automaticamente.

As transições são Pendente → Confirmada/Recusada/Cancelada e Confirmada → Cancelada/Concluída. Pedidos encerrados mantêm o histórico e permitem corrigir dados ou a associação. Não há disponibilidade automática, mesas, pagamentos ou comunicações comerciais.

## Ligação local configurada

O Studio usa agora `http://127.0.0.1:3002`; o website usa `http://127.0.0.1:3001`. A porta 3000 está ocupada por outra aplicação deste computador. O segredo de integração foi criado nos ficheiros privados `.env.local` dos dois projectos, sem o expor ao navegador ou ao controlo de versões.

O `.env` contém a ligação interna à base Palace no Render, preservada para o alojamento na mesma região. Depois de confirmar o workspace **MAZANGA ELECTRIC**, foi validado o acesso externo à mesma base, em Frankfurt, com TLS e verificação do certificado. `.env.development.local` passou a conter essa ligação externa. O Studio deste computador utiliza agora o PostgreSQL remoto; já não usa a base PGlite para o funcionamento normal. A cópia local anterior foi preservada.

Para executar novamente:

```sh
# Terminal do Studio
npm run dev -- --port 3002
```

```sh
# Terminal do website
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Antes da migração foi criada uma cópia de segurança privada em `data/backups/before-crm-*`. Na verificação inicial, a base existente mantinha 17 pratos, uma conta, um menu e uma versão publicada. Os dados usados pelos testes são guardados em bases separadas.

A transferência para o PostgreSQL remoto tem uma cópia de segurança adicional em `data/backups/before-remote-postgres-20261019T150347Z`, incluindo imagens e exportações lógicas privadas. Foram preservados os dados entretanto introduzidos pelo utilizador: uma conta, nove categorias, 17 pratos, um cliente, uma reserva, um menu, uma versão, cinco imagens e três registos de auditoria. A transferência foi transaccional, verificada por conteúdo, e uma segunda tentativa foi correctamente recusada por o destino já conter dados. As sessões locais não foram copiadas: iniciar sessão com as mesmas credenciais da conta existente.

## Protocolo entre os servidores

O navegador envia `POST /api/reservations` para o próprio website. O servidor do website valida os campos e a origem, verifica o campo antispam, e assina um pedido para o Studio em `POST /api/integrations/reservations`.

O segredo **não** aparece em variáveis `NEXT_PUBLIC_*`, JavaScript do navegador, URL ou resposta. A assinatura HMAC-SHA256 abrange o timestamp, a origem técnica do cliente, a chave de idempotência e o corpo JSON exacto. O Studio recusa assinaturas inválidas e timestamps fora de cinco minutos.

Cabeçalhos do pedido assinado:

| Cabeçalho | Conteúdo |
| --- | --- |
| `Content-Type` | `application/json` |
| `Idempotency-Key` | UUID do envio; conservar nas repetições da mesma submissão |
| `X-Palace-Timestamp` | Timestamp Unix em segundos |
| `X-Palace-Client` | `global` ou HMAC do IP fornecido por um proxy confiável |
| `X-Palace-Signature` | HMAC hexadecimal de `timestamp.client.key.corpo` |

Corpo de exemplo, apenas demonstrativo:

```json
{
  "name": "Visitante de demonstração",
  "phone": "+244 923 600 001",
  "email": "visitante@example.invalid",
  "date": "2099-01-01",
  "time": "20:00",
  "guests": 4,
  "occasion": "Celebração",
  "notes": "Pedido de demonstração",
  "privacyAccepted": true
}
```

Resposta pública: apenas `{ "received": true, "reference": "<uuid>" }`. Uma criação devolve 201; a repetição já guardada devolve 200. O estado inicial é sempre Pendente. Uma chave reutilizada com dados diferentes devolve 409. Não há endpoints públicos para consultar clientes, telefones, notas internas ou VIP.

O cliente do website conserva a mesma chave se houver uma falha de rede, incluindo quando o servidor guardou a reserva mas a resposta se perdeu. Um novo pedido ou uma alteração aos dados recebe uma nova chave. Reservas legítimas diferentes não são bloqueadas pela sua data ou telefone.

O Studio normaliza números com `libphonenumber-js`, usando Angola como país por omissão. `923600001`, `+244 923600001`, `00244 923600001` e `244923600001` correspondem ao mesmo telefone. Nomes semelhantes com telefones diferentes permanecem separados. Os novos pedidos não substituem o nome, VIP ou observações que a equipa já guardou no perfil.

O website pode ainda ler `GET /api/published-menu`, que fornece exclusivamente o menu publicado do dia em Luanda. `PALACE_MENU_FEED_URL` foi ligado a este endpoint. A homepage e a carta partilham essa edição com revalidação até 60 segundos; na ausência de publicação, o website conserva a carta de referência claramente identificada, como antes.

## Configuração de produção

O endereço provisório escolhido é **`https://palacelounge.mazanga.digital`**, exclusivamente para o Palace Studio. O domínio do website público é independente. A base é a PostgreSQL existente, já indicada no `.env`; não será criada outra. O estado da preparação e do acesso ao alojamento está em `PUBLICACAO.md`.

No Studio:

```dotenv
DATABASE_URL=<ligacao PostgreSQL acessivel a partir do servidor>
PUBLIC_URL=https://palacelounge.mazanga.digital
DATA_DIR=<pasta-local-opcional-fora-da-Vercel>
PALACE_RESERVATION_SECRET=<segredo privado aleatorio>
CRM_RETENTION_MONTHS=24
```

No website:

```dotenv
NEXT_PUBLIC_SITE_URL=https://<dominio-do-website>
PALACE_STUDIO_URL=https://palacelounge.mazanga.digital
PALACE_MENU_FEED_URL=https://palacelounge.mazanga.digital/api/published-menu
PALACE_RESERVATION_SECRET=<o mesmo segredo privado>
PALACE_TRUST_PROXY=0
```

Gere o segredo com `openssl rand -hex 32` e configure-o nos dois servidores. Não copie ficheiros locais de ambiente para uma imagem de produção; o `.dockerignore` exclui-os. As duas aplicações necessitam de HTTPS e o backend tem de ser alcançável pelo servidor do website. Uma ligação PostgreSQL de rede privada deve ser usada apenas onde essa rede estiver acessível. Configure timeouts do proxy superiores aos 12 segundos do pedido de integração.

Em produção, o website exige HTTPS para a ligação ao Studio. `ALLOW_HTTP_LOCAL=1` só é utilizado nos testes locais do build de produção. Não o activar numa instalação pública.

`PALACE_TRUST_PROXY=1` só deve ser usado atrás de um proxy que substitua os cabeçalhos de IP; nesse caso, o IP é convertido num HMAC antes de ser transmitido. Sem essa opção, a aplicação não confia num `X-Forwarded-For` fornecido arbitrariamente pelo visitante e aplica uma limitação global conservadora. O Studio limita novos pedidos durante dez minutos: seis por telefone, vinte por origem autenticada pelo website (120 no modo global), e 300 no total. As repetições idempotentes já guardadas não criam novos pedidos.

A ligação local está operacional e foi testada. Não foi efectuada publicação online ou alteração da configuração de um serviço de alojamento externo nesta tarefa.

## Segurança, privacidade e manutenção

As rotas `/api/crm/*` verificam a sessão administrativa no servidor. As escritas verificam também a origem. Os dados são validados, as consultas são parametrizadas e as alterações usam revisões para detectar edição concorrente. O audit log regista actor, entidade, campos alterados e estados, sem copiar telefones, emails, nomes de clientes ou conteúdos das observações.

A reserva e a criação/associação ao cliente são transaccionais. O telefone normalizado tem uma restrição única e as reservas têm uma chave de pedido única. A nova migração não elimina nem transforma tabelas dos menus.

O formulário recolhe autorização para tratar o pedido e guarda a data e o teor do aviso de privacidade na reserva. Os campos de autorização de marketing ficam falsos e sem data/origem/teor por omissão. A autorização de tratamento de uma reserva não é convertida em consentimento comercial. Privé e Beach continuam demonstrativos, sem envio ou gravação.

A política operacional prevê rever registos após 24 meses sem actividade. Existe uma ferramenta manual de manutenção:

```sh
# Apresenta apenas contagens; não elimina dados.
npm run privacy:cleanup

# Apenas depois de rever as contagens e efectuar backup:
npm run privacy:cleanup -- --apply
```

A ferramenta considera as datas de criação/actualização e as reservas. Preserva clientes com actividade recente ou reservas futuras, elimina de forma transaccional os registos antigos seleccionados, e regista apenas as contagens no audit log. Em PGlite, pare o servidor antes de executar este CLI; em produção, execute com as mesmas variáveis do serviço. O prazo pode ser configurado por `CRM_RETENTION_MONTHS` (1–120). Não foi activada qualquer tarefa automática de eliminação.

O destino de alojamento escolhido é a Vercel. Usar a ligação externa TLS do Render, conforme `PUBLICACAO.md`. Fotografias e exportações estão na tabela `media_files`, sem depender de uma pasta gravável na função. As cinco imagens existentes foram importadas e verificadas por conteúdo. A cópia local continua preservada para recuperação.

Mantenha cópias de segurança cifradas/protegidas do PostgreSQL, incluindo `media_files`, e teste a recuperação. Defina também a validade das cópias de segurança e aplique novamente eliminações autorizadas ao recuperar uma cópia antiga. Os pedidos individuais de correcção/eliminação devem ser tratados pela equipa, verificando a identidade antes de alterar dados.

## Testar

```sh
npm test
npm run build
# No projecto do website: npm run build
npm run test:crm
E2E_PRODUCTION=1 ALLOW_EMBEDDED_DB=1 DATABASE_URL= npm run test:e2e
```

`test:crm` levanta os dois builds de produção nas portas 3200/3201, com uma base isolada em `data/crm-e2e`. As capturas e traces ficam em `test-results/crm`. A regressão de menus usa `test-results/menus`. Não apontar os testes para a base real.
