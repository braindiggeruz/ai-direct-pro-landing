# Supabase — GPTBot.uz AI Chat

Основная БД / Auth / история / аналитика для production-бэкенда (Railway).
Cloudflare D1 остаётся fallback.

## Применить миграцию

**Вариант A — Supabase SQL editor:**
1. Открой проект в Supabase → SQL Editor.
2. Вставь содержимое `migrations/0001_gpt_chat.sql` → Run.

**Вариант B — Supabase CLI:**
```
supabase link --project-ref <ref>
supabase db push
```

## Ключи и безопасность

| Ключ | Где использовать |
|---|---|
| `SUPABASE_SECRET_KEY` (service role) | ТОЛЬКО server-side (Railway). Обходит RLS. Никогда во фронт/логи. |
| `SUPABASE_PUBLISHABLE_KEY` (anon) | Frontend/Auth. Публичный. |
| `SUPABASE_URL` | И там, и там. |
| `SUPABASE_JWKS_URL` | Server-side: проверка JWT пользователя. По умолчанию `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. |

- **Никогда не публикуй `SUPABASE_SECRET_KEY`** — ни во фронт-бандл, ни в логи, ни в чат.
- Бэкенд пишет данные через secret-ключ (RLS bypass). RLS-политики защищают прямой клиентский доступ через publishable-ключ: авторизованный пользователь видит только свои строки.
- Таблицы `gpt_leads`, `gpt_usage_daily`, `payment_attempts`, `gpt_events`, `provider_errors` — RLS включён без anon-политик → доступ только у бэкенда.

## Таблицы

profiles · gpt_sessions · gpt_messages · gpt_usage_daily · gpt_leads ·
gpt_subscriptions · payment_attempts · gpt_events · provider_errors · message_feedback

## Production-апгрейд (позже)

- Атомарный инкремент `gpt_usage_daily` через Postgres-функцию (RPC) вместо read-then-write.
- Партиционирование `gpt_messages` / `gpt_events` по дате при росте объёма.
