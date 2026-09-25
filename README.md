# Credenciamento — Festa das Professoras e Professores – SINDSERMTHE

Inscrição pública de professoras e professores filiados(as) e do seu convidado, ficha de filiação online para quem ainda não é filiado(a), vouchers individuais com QR Code, portaria com leitor de QR, conferência de filiação, kits entregues junto com a entrada (com horário limite), local da festa (foto, descrição e mapa) e painel administrativo. Visual anos 80 nas cores do SINDSERM.

Stack: Next.js (App Router) · TypeScript · PostgreSQL + Drizzle · Better Auth · Tailwind + shadcn/ui · Motion · React Hook Form + Zod · ZXing · Vitest · Playwright.

## Regras da festa

- Kit de consumação só para **professoras e professores filiados(as)** (a pergunta "é professor(a)?" é obrigatória; quem responde "sim" é avisado de que isso é conferido na portaria). Filiados(as) que não são professoras ou professores entram, sem kit e sem convidado.
- Cada professor(a) leva **1 convidado**, com direito a kit. **Os kits saem junto com as entradas**: ao confirmar, a tela avisa quantos entregar e o estoque baixa na hora. O do(a) professor(a) sai na entrada dele(a); o do convidado **só depois que o(a) professor(a) chegou** — se o convidado chegar antes, ele entra, o kit dele espera e sai junto com a chegada do(a) professor(a) ("entregue 2 kits"). Depois do **horário limite** ou sem estoque, a pessoa entra sem kit e a tela avisa. Se o kit não saiu (ex.: estoque reposto depois), o Atendimento usa **Entregar agora**. Estornar uma entrada devolve ao estoque os kits que dependiam dela. Convidado que vira filiado(a) continua com um kit só.
- Quem não é filiado(a) pode preencher a **ficha de filiação** no site; na recepção só assina a autorização de desconto (a equipe imprime a ficha).
- A filiação só é confirmada com a **cópia do RG e do contracheque** anexada à ficha: obrigatória no site (foto na hora ou PDF); na ficha feita pelo Atendimento pode ser anexada depois (inclusive na portaria), mas sem os dois o botão "assinatura colhida" fica travado. Os arquivos ficam cifrados no banco, sem metadados de GPS, e só Atendimento e administradores abrem (cada abertura fica na auditoria). Envios que não viraram ficha somem em 24 h.
- **Colaboradores do SINDSERM** — diretoria, funcionários e prestadores de serviço (Painel → Colaboradores SINDSERM; nunca pelo link público): liberados um a um ou colando a lista (`Nome; Setor ou cargo; Convidado`, com a categoria do lote). Cada um tem **voucher próprio** (o "passe da casa", no metal da categoria: diretoria em platina, funcionários em dourado, prestadores em ciano), **1 kit** e pode levar **1 convidado**, com as mesmas regras do convidado de professor(a) (o kit do convidado sai depois que o(a) colaborador(a) chegar). Os kits saem do **estoque dos colaboradores**, separado. Uma pessoa não pode ser, ao mesmo tempo, colaboradora e filiada ou convidada. Tirar da lista cancela o voucher e o convite do convidado.
- **Entrada só a partir do horário da festa**: antes disso, a portaria vê o aviso "a festa ainda não começou" e só registra se confirmar (fica anotado na auditoria).
- **Divulgação** (Placar → Divulgar): prévia do link como aparece no WhatsApp, mensagem pronta com os dados da festa (editável; o administrador pode salvar o texto da equipe), WhatsApp, link e QR Code para cartaz. A prévia do link (imagem com arte, data, local e prazo) é gerada com os dados do painel.
- **Permissões por área** (Painel → Acesso ao sistema): Administrador, Atendimento e Segurança/Recepção são modelos; dá para ajustar cada área (sem acesso / só ver / ver e editar) por pessoa. O servidor confere tudo. Sempre sobra pelo menos uma pessoa que administra usuários.
- **Senha provisória**: quem é criado ou tem a senha redefinida pelo administrador cria a própria senha no primeiro acesso. Para pedir isso a quem já usa o sistema: Acesso ao sistema → Editar → "Pedir nova senha no próximo acesso" (vale no próximo clique da pessoa).
- **WhatsApp de ajuda** (Painel → Configurações): aparece como botão flutuante na inscrição e como link nos vouchers, na ficha, no login e nas telas de erro, já com a mensagem pronta. Sem número, nada aparece.
- Filiação marcada como **não confirmada**? Se a pessoa comprovar na hora (ex.: contracheque com o desconto do SINDSERM), o Atendimento confirma na tela dela, escrevendo como foi comprovado (fica na auditoria).
- Na portaria, confirmou a filiação, o comprovante ou a assinatura da ficha? Abre na hora o aviso **"já pode entrar!"** com o botão de registrar a entrada (+ kit), para ninguém esquecer.
- **CPF** e **matrícula da prefeitura** são únicos (a matrícula é comparada sem pontuação). O CPF do **convidado é opcional** (ex.: crianças); se informado, também é único. Para virar filiado(a), o CPF passa a ser exigido.

## 1. Requisitos

- Node.js 22.12+ e npm 10+
- PostgreSQL 14+ (testado com 17)

## 2. Banco e `.env.local`

```bash
npm install
# bash
DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/sindserm_festa" npm run env:init
# PowerShell
$env:DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/sindserm_festa"; npm run env:init

npm run db:create -- --with-test   # cria sindserm_festa (+ _test e _e2e)
npm run db:migrate                 # aplica ./drizzle
```

Caracteres especiais da senha devem ser codificados na URL (ex.: `@` → `%40`). O `env:init` cria o `.env.local` (ignorado pelo git) e gera `BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY` e `SETUP_TOKEN`. Guarde o `DATA_ENCRYPTION_KEY`: sem ele os links de vouchers já emitidos não podem ser reexibidos. Após alterar `src/server/db/schema.ts`, gere a migration com `npm run db:generate`.

## 3. Executar

```bash
npm run dev                  # desenvolvimento: http://localhost:3000
npm run build && npm start   # produção
```

Porta 3000 ocupada? Use `npm run dev -- -p 3200`. Rodando em `localhost`, o login funciona em qualquer porta; publicado com domínio, vale o `BETTER_AUTH_URL` (e o `TRUSTED_ORIGINS`).

**Primeiro administrador:** pelo navegador em `/setup` (com o `SETUP_TOKEN`) ou pelo terminal:

```bash
npm run admin:create -- --email admin@exemplo.org --name "Nome Sobrenome"   # gera e mostra a senha uma vez
```

Depois de entrar, o assistente `/setup/evento` configura a festa (dados, período de inscrições, kits e horário limite para entregar kits). Em **Painel → Configurações** ficam também o **local da festa** (nome, endereço, descrição, link do Google Maps e foto — aparecem na página inicial, na inscrição e nos vouchers) e o **ícone do site** (aba do navegador, tela do celular e marca ao lado do nome; sem troca, vale o emblema da festa). No nome da festa, o que vem depois de um traço entre espaços (ex.: "Festa das Professoras e Professores – SINDSERMTHE 2026") vira a chamada em destaque no topo do site e na prévia do link. Os logins de Atendimento e Segurança/Recepção são criados em **Painel → Acesso ao sistema**. Cada pessoa troca a própria senha em `/conta`.

**Começar de novo** (ex.: depois de testar), mantendo só os administradores:

```bash
npm run db:reset                     # pergunta antes (digite ZERAR); apaga também a configuração da festa
npm run db:reset -- --manter-festa   # mantém data, horários, local, foto, ícone e estoque (entregas voltam a zero)
```

**Artes:** os originais ficam em `public/` (`logo_festa.png`, `logo_base.png`, `logo_base_branca.png`). Se mudarem, rode `npm run brand` para regenerar as versões otimizadas em `public/brand/`.

**Câmera:** navegadores só liberam a câmera em HTTPS (ou `localhost`). Para usar o leitor no celular, publique com HTTPS — em rede local, `npx next dev --experimental-https`. Se o sistema for acessado por outro endereço, ajuste `BETTER_AUTH_URL` (ou liste endereços extras em `TRUSTED_ORIGINS`, separados por vírgula). Atrás de proxy reverso, informe em `TRUST_PROXY_HOPS` quantos proxies ficam na frente (padrão 1); o valor é usado só no limite de tentativas por IP.

## 4. Publicar no Railway

O `railway.json` já configura tudo: build `npm run build`, antes de cada deploy `npm run db:deploy` (migrations + primeiro administrador), início `npm start` (o servidor repete esse preparo ao ligar) e verificação em `/api/health` (banco e tabelas; se falhar, a versão anterior continua no ar).

1. No projeto do Railway: **New → Database → PostgreSQL** e **New → GitHub Repo** (este repositório). O Railway já tenta um deploy na hora; sem as variáveis ele para com "DATABASE_URL não configurada" — é esperado, siga os passos.
2. No serviço do app, em **Settings → Networking**, clique em **Generate Domain** (HTTPS pronto; a câmera da portaria só funciona em HTTPS).
3. Em **Variables → Raw Editor**, cole:
   ```
   DATABASE_URL="${{Postgres.DATABASE_URL}}"
   ADMIN_EMAIL="seu-email@sindserm.org.br"
   ADMIN_NAME="Seu Nome"
   ADMIN_PASSWORD="uma-senha-com-10-ou-mais-caracteres"
   ```
   e os segredos gerados por `npm run env:secrets` (`BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `SETUP_TOKEN`). O `BETTER_AUTH_URL` pode ficar de fora: vale o domínio gerado pelo Railway. Com domínio próprio, defina `BETTER_AUTH_URL="https://seu.dominio"`.
4. Aplique as mudanças (**Deploy**). No log aparece "Primeiro administrador criado" (senha com menos de 10 caracteres: o log avisa e o administrador não é criado — corrija a variável e faça novo deploy). Entre, **troque a senha em /conta** e apague `ADMIN_PASSWORD` das variáveis. O assistente `/setup/evento` abre em seguida.

**Guarde o `DATA_ENCRYPTION_KEY`** num lugar seguro: sem ele, os links dos vouchers e os documentos (RG/contracheque) não abrem mais. Faltando alguma variável essencial, o servidor não liga e o log diz qual é.

## 5. Rotas

- Público: `/` · `/inscricao` (`?ficha=1` abre a ficha de filiação) · `/vouchers/[link]` · `/v/[token]` (voucher individual e `/imagem`) · `/local/foto`
- Equipe: `/entrar` · `/conta` · `/portaria` (leitor em `/portaria/scanner`) · `/painel` (placar, inscrições — abre na fila de conferência quando há o que conferir —, fichas de filiação — abre na fila de assinatura —, participantes, kits, colaboradores do SINDSERM, acesso ao sistema, auditoria, configurações) · `/painel/inscricoes/[id]/vouchers` (imprime os vouchers do(a) professor(a) e do convidado numa folha) · `/painel/colaboradores/vouchers` (vouchers dos colaboradores e dos convidados deles, para imprimir)
- Divulgação: `/opengraph-image` (prévia do link) · `/divulgacao/qr` (QR Code do link de inscrição) · `/icone?s=32` (ícone do site; `/favicon.ico` aponta para ele)
- Arquivos: `POST /api/documentos` (envio de RG/contracheque) · `POST /api/icone` (ícone do site) · `GET /api/documentos/[id]` (só equipe; `?miniatura=1`) · `GET /api/health` (verificação do Railway)

## 6. Testes

```bash
npm run lint
npm run typecheck
npm test             # Vitest: regras críticas contra o banco <nome>_test (recriado a cada execução)
npm run test:e2e     # Playwright: build + fluxos completos no banco <nome>_e2e, porta 3210
```

Antes do primeiro `test:e2e`: `npx playwright install chromium`. O E2E simula a câmera com um vídeo do QR Code do voucher e exercita o leitor ZXing de verdade. `npm run check` executa lint, typecheck, testes e build em sequência.
