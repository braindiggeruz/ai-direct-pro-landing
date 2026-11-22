#!/usr/bin/env python3
"""Generate GPTBot_Research_Report.md (Russian). Usage: python3 -I make_report.py LR OUT_DIR"""
import collections
import json
import os
import sys

LR, OUT = sys.argv[1], sys.argv[2]
V = os.path.join(LR, "verify")
S = json.load(open(os.path.join(LR, "out", "summary.json"), encoding="utf-8"))
st = json.load(open(os.path.join(LR, "out", "build_state.json"), encoding="utf-8"))
rows = st["rows"]


def jl(name):
    p = os.path.join(V, name)
    return [json.loads(l) for l in open(p, encoding="utf-8")] if os.path.exists(p) else []


def js(name):
    p = os.path.join(V, name)
    return json.load(open(p)) if os.path.exists(p) else {}


merge = js("merge_stats.json")
extra = js("merge_stats_extra.json")
snowA = js("snow_stats.json")
snowB = js("snow_stats_B.json")
meta_n = len(jl("queue_meta.jsonl"))
snow_sel = len(jl("queue_snow2.jsonl")) - meta_n
roots_checked = set()
hosts_checked = set()
for name in ("results.jsonl", "results_extra.jsonl", "results_snow.jsonl"):
    for r in jl(name):
        roots_checked.add(r.get("root"))
        hosts_checked.add(r.get("host"))
pw_home_n = len(jl("pw_home.jsonl"))
pw_check_n = len(jl("pw_results.jsonl"))
disc_scanned = extra.get("discourse_scanned", 0)
tiers = S["tiers"]
cats = S["cats"]
forums = [r for r in rows if r["category"] == "Technology Forum"]
fsp = collections.Counter(r["self_promotion_allowed"].split(" ")[0].replace("—", "").strip() for r in forums)
fplat = collections.Counter(r["platform"] for r in forums).most_common(10)
vst = S["vstatus"]
by_cat_v = collections.Counter((r["category"], r["verification_status"]) for r in rows)
rej_codes = collections.Counter(S["reject_codes"])
omitted = S.get("rejected_omitted", {})
xr = S["xr"]
langs = collections.Counter(r["language"] for r in rows).most_common(8)
cis = [r for r in rows if r["language"] == "ru" or r["country"] in ("RU", "UZ", "KZ", "KG", "BY", "UA", "TJ", "AZ", "GE", "AM")]
free = S["free"]
dup_merge = merge.get("duplicate_rows_collapsed", 0)
dup_after = S.get("dup_after_redirect", 0) or 0
CODE_RU = {
    "NOT_A_PLATFORM": "продукт/компания/медиа, а не площадка для размещения",
    "OFF_TOPIC": "нет связи с AI/SaaS/технологиями",
    "DEAD": "домен не отвечает (DNS/соединение; перепроверено повторно)",
    "NO_MECHANISM": "живой сайт, но механизм размещения не найден",
    "UNVERIFIABLE_BOT_PROTECTION": "онлайн, но anti-bot (Cloudflare и т.п.) блокирует автоматическую проверку",
    "HTTP_ERROR": "главная отдаёт HTTP 4xx/5xx",
    "LOW_SCORE": "балл < 55",
    "NOT_SUITABLE": "площадка не подходит под профиль GPTBot.uz (ниша, регион, тип объекта)",
    "SPAM": "сигналы спама (казино/фарма/adult)",
    "NETWORK": "сеть однотипных каталогов",
    "PARKED": "припаркован / продаётся",
    "DUPLICATE": "дубль корневого домена / редирект на уже учтённый",
    "NOT_LIVE": "заглушка сервера / не живой сайт",
    "RULES_PROHIBIT": "правила форума запрещают самопродвижение",
    "PRIVATE": "закрытый форум (контент только после входа)",
    "IN_REFERENCE": "домен есть в референсном файле",
}


def top(cat, n=15):
    rs = [r for r in rows if r["category"] == cat and r["tier"] == "TIER 1" and r["verification_status"] == "VERIFIED"]
    rs.sort(key=lambda r: -r["quality_score"])
    out = []
    for r in rs[:n]:
        u = r["submit_url"] or r["homepage_url"]
        fr = r["free_submission"].split(" ")[0]
        out.append(f"| {r['domain']} | {r['quality_score']} | {r['submission_type']} | {fr} | {u} |")
    return "\n".join(out) if out else "| — | | | | |"


def top_forums(n=20):
    rs = [r for r in forums if r["self_promotion_allowed"].startswith("yes")]
    rs.sort(key=lambda r: -r["quality_score"])
    return "\n".join(f"| {r['domain']} | {r['quality_score']} | {r['platform']} | {r['self_promotion_allowed'][6:80]} | {r['evidence_url'] or r['homepage_url']} |" for r in rs[:n])


def top_cis(n=25):
    rs = sorted(cis, key=lambda r: -r["quality_score"])[:n]
    return "\n".join(f"| {r['domain']} | {r['quality_score']} | {r['tier']} | {r['category']} | {r['submission_type']} | {r['verification_status']} |" for r in rs)


verified = vst.get("VERIFIED", 0)
partial = vst.get("PARTIAL", 0)
short = max(0, 1000 - verified)
lines = []
A = lines.append
A("# GPTBot.uz — исследование площадок для размещения (SaaS / AI / Tech)")
A("")
A("Дата проверки: **2026-11-22**. Все площадки проверены живыми HTTP-запросами, JS-страницы — в браузере (Chromium/Playwright). "
  "Метрики DA/DR/трафика не использовались (недоступны без платных сервисов → `N/A`).")
A("")
A("## 1. Итог в цифрах")
A("")
A(f"- **Принято в базу: {S['accepted']} уникальных корневых доменов** — из них **{verified} подтверждены полностью (VERIFIED)** и {partial} частично (PARTIAL: площадка жива и тематична, но механизм не подтверждён до конца — нужен ручной шаг).")
A(f"- Цель «1000 подтверждённых»: **не достигнута на {short}** при строгом определении «подтверждено» (рабочая форма / раздел форума с разрешённой самопрезентацией / подтверждённая авторская программа). "
  f"С учётом PARTIAL в базе {S['accepted']} площадок. Добирать до 1000 мусором или неподтверждёнными сайтами не стал — так требует ТЗ.")
A(f"- TIER 1: **{tiers.get('TIER 1', 0)}**, TIER 2: **{tiers.get('TIER 2', 0)}**, TIER 3: **{tiers.get('TIER 3', 0)}**.")
A(f"- **Единый TXT со ссылками (`GPTBot_SaaS_Tech_XRumer_1000.txt`): {S['xrumer_txt']} URL** — все VERIFIED-площадки, одна прямая ссылка на корневой домен (страница отправки / регистрация форума / страница автора). "
  f"Из них {S['xrumer_strict']} — HTML-формы без CAPTCHA и форумы с разделом самопрезентации; {S.get('txt_captcha', 0)} — с CAPTCHA (только вручную). В ручной список — **{S['manual']}** площадок + {S['bot_protected']} сайтов «проверить в браузере».")
A("")
A("| Показатель (из ТЗ) | Значение |")
A("| --- | --- |")
A(f"| Всего кандидатов найдено (строк из всех источников) | {merge.get('rows', 0)} строк от 5 исследовательских потоков + {extra.get('seed_candidates_new_roots', 0)} seed + {disc_scanned} хостов Discourse-скана + {(snowA.get('outbound_candidates', 0) + snowB.get('outbound_candidates', 0))} исходящих ссылок «снежного кома» + {meta_n} из мета-каталогов |")
A(f"| Уникальных корневых доменов проверено полным пайплайном | **{len(roots_checked)}** ({len(hosts_checked)} хостов); дополнительно {disc_scanned} Discourse-хостов прозвонены через JSON API |")
A(f"| Площадок подтверждено (VERIFIED) | **{verified}** |")
A(f"| Частично подтверждено (PARTIAL, в базе) | {partial} |")
A(f"| Форумов (Technology Forum) | {cats.get('Technology Forum', 0)} (VERIFIED: {by_cat_v.get(('Technology Forum', 'VERIFIED'), 0)}) |")
A(f"| SaaS-каталогов | {cats.get('SaaS Directory', 0)} (VERIFIED: {by_cat_v.get(('SaaS Directory', 'VERIFIED'), 0)}) |")
A(f"| AI-каталогов | {cats.get('AI Tools Directory', 0)} (VERIFIED: {by_cat_v.get(('AI Tools Directory', 'VERIFIED'), 0)}) |")
A(f"| Технологических сообществ / стартап-платформ | {cats.get('Startup & Tech Community', 0)} (VERIFIED: {by_cat_v.get(('Startup & Tech Community', 'VERIFIED'), 0)}) |")
A(f"| TIER 1 / TIER 2 / TIER 3 | {tiers.get('TIER 1', 0)} / {tiers.get('TIER 2', 0)} / {tiers.get('TIER 3', 0)} |")
A(f"| Исключено (REJECT) | {S['rejected']} доменов (в `GPTBot_Rejected.csv` перечислено {S['rejected_listed']}; ещё {sum(omitted.values())} шумовых — см. §6) + {S['paid_only']} только-платных вынесены в `GPTBot_Paid_Only.csv` |")
A(f"| Дублей обнаружено | {dup_merge} повторов при слиянии (одинаковый корневой домен из разных источников) + {dup_after} дублей после редиректов |")
A(f"| Потенциально совместимо с XRumer | POTENTIAL (классические движки форумов): {xr.get('POTENTIAL', 0)}; CUSTOM (нестандартная HTML-форма): {xr.get('CUSTOM', 0)}; из TXT без CAPTCHA и с HTML-формой / разделом форума: {S['xrumer_strict']} |")
A(f"| Требуют ручного размещения | {S['manual']} (MANUAL_ONLY: {xr.get('MANUAL_ONLY', 0)}; с CAPTCHA: {S.get('captcha', 0)}) + {S['bot_protected']} «проверить в браузере» |")
A("")
A("## 2. Важно до начала работы")
A("")
A("1. **Референсный файл `GPTBot-NEW_300_BATCH2_1122.txt` в сессию не попал** (папки загрузок пустые, в репозитории и ветках его нет, у коннектора Google Drive не хватает прав). "
  "Поэтому дедуп против него **не применён**. Пайплайн готов: положите файл и выполните команду из §9 — все 5 файлов пересоберутся без его доменов, а в Rejected появится причина `IN_REFERENCE`. "
  "Крупные известные площадки (Product Hunt, BetaList, SaaSHub и т.п.), вероятно, есть и в референсе — после дедупа число «новых» снизится.")
A("2. **Cloudflare/anti-bot.** "
  f"{S['bot_protected']} живых сайтов отдают автоматическим клиентам проверку «Just a moment…» (в т.ч. официальному WebFetch). Обходить защиту не стал: они вынесены в конец `GPTBot_Manual_Submission.txt` "
  "как «проверить в обычном браузере» и **не считаются подтверждёнными**. Среди них известные площадки (Product Hunt, There's An AI For That, SaaSHub, Toolify и др.).")
A(f"3. **CAPTCHA = ручной режим.** В TXT входят все подтверждённые площадки, в том числе {S.get('txt_captcha', 0)} с reCAPTCHA/hCaptcha/Turnstile. CAPTCHA — прямой сигнал площадки против автоматизации: такие размещайте вручную (в CSV видно по `notes` и `xrumer_compatibility = MANUAL_ONLY`).")
A("4. **Форумы.** Автопостинг почти везде запрещён правилами. Даже на форумах с разделом Showcase публикуйте вручную, от живого аккаунта, по правилам раздела.")
A("")
A("## 3. Методология")
A("")
A("**Сбор кандидатов** (реальные URL, у каждого записан источник):")
A("- 5 параллельных исследовательских потоков (AI-каталоги, SaaS-каталоги, стартап/тех-сообщества, международные форумы, RU/СНГ/Центральная Азия/EU): веб-поиск по запросам из ТЗ + разбор крупных списков (GitHub awesome-lists, подборки «300+ AI directories», feedspot, findaforum и т.д.).")
A(f"- Discourse-скан: {disc_scanned} хостов из публичного списка Discourse-сообществ (archiveteam) прозвонены через `/about.json` и `/categories.json` → отобраны {extra.get('discourse_picked', 0)} активных тех-сообществ с разделами Showcase/Show and tell.")
A(f"- «Снежный ком»: бейджи «Featured on / Listed on» на страницах принятых каталогов (2 витка) → {snow_sel} кандидатов; мета-каталоги (списки площадок) → {meta_n}.")
A(f"- {extra.get('seed_candidates_new_roots', 0)} seed-кандидатов из знаний аналитика (RU/СНГ-форумы, Telegram-каталоги, Discourse-сообщества) — прошли ту же проверку; неразрешившиеся ({omitted.get('seed_unresolved', 0)}) не выдаются за находки.")
A("")
A("**Проверка каждого домена** (скрипты в `scripts/`):")
A("1. Главная по HTTPS (фолбэк HTTP): статус, редиректы (в т.ч. на чужой домен), парковка/продажа домена, заглушки, спам-сигналы, язык, движок (XenForo, phpBB, vBulletin, MyBB, SMF, Discourse, IPB, Flarum, NodeBB, Vanilla, Khoros, WordPress, Next.js…).")
A("2. Поиск механизма: ссылки «Submit / Add tool / List your… / Добавить…», внешние формы (Tally, Typeform, Google Forms, Airtable…), типовые пути (`/submit`, `/add-tool`…).")
A("3. Анализ страницы отправки: форма с полем URL, логин-стена/редирект на вход, CAPTCHA, цены/оплата/«free», soft-404. JS-формы — повторно в браузере (Playwright), без заполнения и отправки.")
A("4. Форумы: регистрация (страница открыта/закрыта/платная, CAPTCHA), разделы для самопрезентации, страница правил (запреты/разрешения рекламы), активность (Discourse/Flarum/NodeBB — через JSON API).")
A("5. Активность: дата последнего поста / даты на странице / `sitemap.xml lastmod` (источник указан в колонке `last_activity`; lastmod иногда генерируется автоматически).")
A("6. Ручной просмотр TIER 1 и TIER 2: исключены продукты, сервисы платной рассылки по каталогам, нишевые каталоги не по профилю, сети однотипных каталогов (одинаковые формы/шаблоны заголовков).")
A("")
A("**Оценка 0–100** (рубрика ТЗ): тематика 30 + качество площадки 25 + возможность размещения 25 + активность 10 + доступность 10. "
  "Качество — по проверяемым признакам (HTTPS, объём контента, структура, отсутствие спама, число независимых упоминаний в списках, для форумов — активные пользователи/посты). "
  "TIER 1 ≥ 85, TIER 2 70–84, TIER 3 55–69, < 55 — REJECT.")
A("")
A("**Статусы:** `VERIFIED` — механизм подтверждён (форма с URL-полем / внешняя форма / вход в кабинет перед отправкой / раздел форума с разрешённой самопрезентацией / официальная авторская программа). "
  "`PARTIAL` — площадка жива и релевантна, но механизм подтверждён не полностью (JS-форма не отрисовалась, форма без URL-поля, только регистрация/профиль, «условный» showcase).")
A("")
A("## 4. Форумы: что реально разрешено")
A("")
A(f"- `yes` — найден раздел для самопрезентации (Showcase, Website Reviews, «Showcase your website», «Announce your software»…): **{fsp.get('yes', 0)}**")
A(f"- `conditional` — showcase вендорского сообщества (только проекты, сделанные на их продукте; уместно, если GPTBot реально его использует): **{fsp.get('conditional', 0)}**")
A(f"- `possible` — есть «Introductions»/общие разделы, правила самопродвижения не подтверждены: **{fsp.get('possible', 0)}**")
A(f"- `unverified` — тематичный активный форум, но подходящего раздела нет (только профиль/подпись/участие в обсуждениях): **{fsp.get('unverified', 0)}**")
A("- Движки форумов в базе: " + ", ".join(f"{k} {v}" for k, v in fplat))
A("")
A("| Форум | Балл | Движок | Раздел | Доказательство |")
A("| --- | --- | --- | --- | --- |")
A(top_forums())
A("")
A("## 5. Правила формирования файлов")
A("")
A("- `GPTBot_SaaS_Tech_XRumer_1000.txt` — только URL, одна ссылка на строку, без комментариев: **все площадки со статусом `VERIFIED`**, по одной на корневой домен. "
  "Для каталогов — страница отправки (если она уводит на логин — исходная ссылка «Submit»), для форумов — страница регистрации (или раздел Showcase), для авторских программ — страница автора. "
  f"Итого **{S['xrumer_txt']}** строк. PARTIAL-площадки ({vst.get('PARTIAL', 0)}) в TXT не входят: механизм у них подтверждён не полностью, они есть в CSV и Manual. "
  f"**Совместимость с XRumer не подтверждена**: `POTENTIAL` — лишь поддерживаемый тип движка, `CUSTOM` — нестандартная форма; без CAPTCHA и с HTML-формой — {S['xrumer_strict']} из {S['xrumer_txt']}.")
A("- `GPTBot_SaaS_Tech_Research.csv` — полная база принятых площадок (22 колонки из ТЗ, UTF-8 с BOM для Excel).")
A("- `GPTBot_Manual_Submission.txt` — всё, что требует ручной работы, по tier и категориям, с подсказками (аккаунт, CAPTCHA, бесплатность, частичная проверка) + список «проверить в браузере».")
A("- `GPTBot_Rejected.csv` — домен, код и конкретная причина исключения.")
A("- `GPTBot_Paid_Only.csv` — площадки, где размещение похоже на только платное (вынесены отдельно, как требует ТЗ).")
A("")
A("## 6. Причины исключения")
A("")
A("| Код | Количество | Значение |")
A("| --- | --- | --- |")
for code, n in rej_codes.most_common():
    A(f"| {code} | {n} | {CODE_RU.get(code, '')} |")
A("")
A(f"Не перечислены в Rejected CSV (шум): {omitted.get('seed_unresolved', 0)} seed-доменов, которые не разрешились, и "
  f"{sum(v for k, v in omitted.items() if k.startswith('snowball_'))} исходящих ссылок «снежного кома», оказавшихся продуктами/мёртвыми/не по теме.")
A("")
A("## 7. Лучшие подтверждённые площадки (TIER 1, VERIFIED)")
for cat in ("AI Tools Directory", "SaaS Directory", "Startup & Tech Community"):
    A("")
    A(f"### {cat}")
    A("")
    A("| Домен | Балл | Тип | Бесплатно | URL отправки |")
    A("| --- | --- | --- | --- | --- |")
    A(top(cat))
A("")
A("## 8. Русскоязычный сегмент, СНГ и Центральная Азия")
A("")
A(f"В базе **{len(cis)}** площадок (ru-язык или домены RU/UZ/KZ/KG/BY/UA/…). Сегмент заметно меньше англоязычного: каталогов с открытой формой в Рунете мало, "
  "многие RU-форумы закрыты anti-bot или не имеют раздела для самопрезентации; часть ключевых площадок (vc.ru, Tproger) подтверждена вручную по официальным правилам.")
A("")
A("| Домен | Балл | Tier | Категория | Тип | Статус |")
A("| --- | --- | --- | --- | --- | --- |")
A(top_cis())
A("")
A("Языки в базе: " + ", ".join(f"{k} {v}" for k, v in langs) + ". Колонка `country` берётся из ccTLD; `INT` — международный gTLD (страна не определялась).")
A("")
A("## 9. Как продолжить / пересобрать")
A("")
A("**Дедуп по референсному файлу** (когда он появится) — одной командой прямо по готовым файлам:")
A("")
A("```bash")
A("python3 apply_reference.py GPTBot-NEW_300_BATCH2_1122.txt")
A("```")
A("")
A("Скрипт удалит домены референса из CSV, XRumer-TXT и Manual-TXT, допишет их в Rejected с причиной `IN_REFERENCE` и выведет, сколько новых площадок осталось. "
  "Кандидаты с источниками — `data/candidates_*.jsonl.gz`, ручные решения ревью — `data/manual_overrides.json`, скрипты пайплайна — `scripts/` (полная пересборка требует сырых фактов проверки, они остались во временной папке сессии из-за объёма).")
A("")
A("## 10. Карточка GPTBot.uz для форм (из `public/llms.txt`, сверено 2026-11-22)")
A("")
A("- **Name:** GPTBot.uz")
A("- **Tagline (EN):** Independent AI chat in Uzbek & Russian + AI chatbots for Telegram, Instagram and WhatsApp")
A("- **Short (EN, ≤160):** Independent AI chat in Uzbek and Russian (3 free replies, no sign-up) and a Tashkent studio building AI bots for Telegram, Instagram Direct and WhatsApp.")
A("- **Кратко (RU):** Независимый AI-чат на узбекском и русском (3 бесплатных ответа без регистрации) и ташкентская студия: AI-боты для Telegram, Instagram Direct и WhatsApp, SMM, таргет, сайты, SEO.")
A("- **Категории:** AI Chatbot, AI Assistant, Business Chatbots, Telegram Bots, Marketing Automation, Productivity.")
A("- **Pricing:** Freemium (3 бесплатных ответа; платные пакеты AI-чата в UZS). Не указывайте, что оплата сейчас открыта: доступность оплаты определяется в самом чате.")
A("- **Обязательно:** GPTBot.uz — не ChatGPT и не продукт OpenAI. Не используйте «ChatGPT» в названии/категории листинга; бренд пишется «GPTBot.uz».")
A("- **Контакт:** ceo@gptbot.uz, Telegram @XGame_changerx. Страна: Uzbekistan, Ташкент. Языки: ru, uz.")
A("")
A("## 11. Ограничения")
A("")
A("- Проверка — снимок на 2026-11-22; каталоги быстро меняют условия (бесплатно → платно), формы и правила.")
A("- «Бесплатно» определялось по тексту страницы отправки (`yes` / `freemium` / `unknown`); у многих каталогов бесплатная очередь медленная, а приоритет платный.")
A("- dofollow/nofollow не проверялся (это видно только после публикации); в `notes` отмечено, если страница сама упоминает dofollow/nofollow.")
A("- TIER 3 вручную не просматривался целиком; там больше шума, чем в TIER 1–2.")
A("- `moderation_required: likely` — типичное поведение каталогов, а не подтверждённый факт; подтверждённые случаи помечены `yes (stated …)`.")
open(os.path.join(OUT, "GPTBot_Research_Report.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("report lines:", len(lines))
