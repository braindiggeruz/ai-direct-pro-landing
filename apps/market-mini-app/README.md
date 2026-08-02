# GPTBot Market Mini App

Independent Telegram Mini App frontend for the existing Sotuvchi domain.

## Local synthetic mode

```powershell
$env:VITE_MARKET_DEV_MODE='fixture'
npm run dev
```

The fixture transport is dynamically imported only from an
`import.meta.env.DEV` branch. Production builds fail closed without Telegram
`initData`; the production bundle check rejects fixture markers.

## Local signed BFF mode

Use a non-production test bot token only:

```powershell
$env:MARKET_DEV_BOT_TOKEN='<test bot token>'
$env:MARKET_DEV_TELEGRAM_USER_ID='<test Telegram user id>'
$env:MARKET_DEV_START_PARAM='agent_seller'
$initData = npm run --silent sign:init-data
$env:VITE_MARKET_DEV_MODE='signed'
$env:VITE_MARKET_DEV_INIT_DATA=$initData
$env:VITE_MARKET_API_BASE_URL='http://127.0.0.1:8788/api/market/v1'
npm run dev
```

The signing script reads its token from the process environment, prints only
the signed `initData`, and is not imported by the browser application.

## Production build

```powershell
npm ci
npm test
npm run build
```

Set only the public build value:

- `VITE_MARKET_API_BASE_URL=https://gptbot.uz/api/market/v1`

Server bindings belong to the existing gptbot.uz Pages project and default
off: `MARKET_MINI_APP_ENABLED`, `MARKET_MINI_APP_BUYER_ENABLED`,
`MARKET_MINI_APP_SELLER_READS_ENABLED`,
`MARKET_MINI_APP_SELLER_COMMANDS_ENABLED`, `MARKET_MINI_APP_ORIGINS`,
`MARKET_MINI_APP_SESSION_SECRET`, and `MARKET_MINI_APP_BUILD_ID`.

Do not put a bot token, session secret, webhook secret or personal data in any
`VITE_*` variable.
