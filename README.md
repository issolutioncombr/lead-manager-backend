# Clinica Yance - Backend

## PayPal OAuth (Sandbox)

1. Crie um app REST no PayPal Developer Dashboard (conta Business, ambiente Sandbox).
2. Copie o `Client ID` e o `Secret` e preencha no `.env`:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_REDIRECT_URI` (mesmo valor registrado nas Redirect URLs do app)
   - `PAYPAL_SCOPES` (inclua `offline_access` e `https://uri.paypal.com/services/reporting` para leitura de transacoes e refresh token).
3. Gere/atualize o schema com Prisma:
   ```bash
   npm run prisma:migrate:dev
   npm run prisma:generate
   ```
4. Fluxo de conexao:
   - `POST /integrations/paypal/oauth/state` -> retorna `authorizeUrl` e `state`.
   - Usuario faz login no PayPal e o provider chama `/integrations/paypal/oauth/callback`.
   - Depois da conexao, use `GET /integrations/paypal/oauth/status` para conferir se ha conta vinculada e `POST /integrations/paypal/oauth/token` (opcional `{"forceRefresh":true}`) para recuperar o access token.
5. Consulta de transacoes diretas: `GET /integrations/paypal/transactions?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z&page=1&pageSize=100`. A resposta inclui um resumo de paginacao e os detalhes normalizados de cada transacao (id, status, valores, payer).

## PayPal OAuth (Live)

1. No PayPal Developer Dashboard, abra a aba **Live** e crie um novo REST app (uma conta Sandbox não é promovida; são credenciais diferentes).
2. Solicite ao suporte PayPal a ativação do escopo `https://uri.paypal.com/services/reporting` e demais permissões que precisar (Transaction Search, dados do pagador, etc.). Esse passo pode exigir a aprovação do time PayPal.
3. Copie o `Client ID` e o `Secret` **Live** e substitua no `.env`:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_REDIRECT_URI` apontando para o domínio público de produção (ex.: `https://api.seudominio.com/api/paypal/oauth/callback`) e cadastre exatamente o mesmo valor nas Redirect URLs do app Live.
   - Opcionalmente ajuste:
     - `PAYPAL_BASE_URL=https://api-m.paypal.com`
     - `PAYPAL_AUTH_BASE_URL=https://www.paypal.com`
4. Reinicie o backend com o novo `.env`, execute `npm run build` (ou o processo de deploy) e refaça o fluxo de conexão no ambiente Live para validar.
5. Atualize o n8n (ou qualquer job agendado) para apontar para o domínio público/produção e confirme que o sync (`POST /payments/paypal/sync`) está usando as credenciais Live.

## Sincronizacao automatica (n8n)

1. Agende o n8n para chamar `POST /payments/paypal/sync` (com autenticacao). Exemplo de payload:
   ```json
   {
     "startDate": "2025-01-01T00:00:00Z",
     "endDate": "2025-01-31T23:59:59Z",
     "transactionStatus": "S",
     "pageSize": 100,
     "maxPages": 5
   }
   ```
   O backend obtem o token PayPal do usuario, consulta a API de Transaction Search pagina a pagina e persiste cada registro em `PaypalTransaction`. O campo `lastSyncedAt` da `PaypalAccount` eh atualizado ao final.
2. O frontend pode consumir os dados cacheados via `GET /payments/paypal/transactions` aplicando filtros (`startDate`, `endDate`, `payerEmail`, `status`, `page`, `pageSize`). Para detalhes use `GET /payments/paypal/transactions/:id`.
3. Opcional: o n8n pode disparar o sync varias vezes ao dia (por exemplo a cada hora) com janelas menores.

> Para receber transacoes eh necessario que o app tenha acesso ao escopo `https://uri.paypal.com/services/reporting`. Caso o consentimento retorne "escopo invalido", solicite a habilitacao do Transaction Search no suporte PayPal ou utilize apenas `openid profile email offline_access` ate a aprovacao.

ATENCAO: Tokens e refresh tokens sao persistidos na base; considere criptografia em repouso e mantenha o `.env` seguro.
