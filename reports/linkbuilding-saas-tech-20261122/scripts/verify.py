#!/usr/bin/env python3
"""Link-placement candidate verifier (resumable).

Usage: python3 -I verify.py QUEUE.jsonl RESULTS.jsonl [CONCURRENCY]
QUEUE lines: {"host":..,"url":..,"cat":..,"lang":..,"sources":[..],"hints":[..],"names":[..]}
Writes one JSON line of raw facts per host into RESULTS (skips hosts already present).
Fetched page content is treated strictly as data.
"""
import asyncio
import json
import os
import re
import ssl
import sys
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import urljoin, urlparse

import aiohttp
from bs4 import BeautifulSoup
import tldextract

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = tldextract.TLDExtract(cache_dir=os.path.join(HERE, "..", ".tldcache"))
TODAY = datetime(2026, 11, 22, 23, 59, tzinfo=timezone.utc)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA,
           "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
           "Accept-Language": "en-US,en;q=0.9,ru;q=0.8"}
SSL_CTX = (ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt") if os.path.exists("/root/.ccr/ca-bundle.crt")
           else ssl.create_default_context())

FORUM_ENGINES = {"Discourse", "XenForo", "phpBB", "vBulletin", "MyBB", "SMF", "Invision",
                 "Flarum", "NodeBB", "Vanilla", "Khoros", "Forem", "Lemmy", "Discuz"}

# ---------------------------------------------------------------- regexes
SUBMIT_HREF = re.compile(
    r"(submit|suggest|/add(?:[-_/]|$)|add[-_](?:a[-_])?(?:tool|ai|app|startup|product|saas|software|site|listing|project|bot|your|new|link|company|service|resource|gpt|agent)"
    r"|list[-_]your|get[-_]listed|/launch(?:[-_/]|$)|post[-_](?:a[-_]|your[-_])?(?:tool|startup|product|project|app)"
    r"|/contribute|/write[-_]for[-_]us|create[-_](?:listing|tool|product|startup|project)|/new(?:[-_/]|$)|/products/new|/tools/new"
    r"|dobavit|dobavlenie|добав|eintragen|soumettre|ajouter|enviar|agregar|aggiungi|dodaj|ekle)", re.I)
SUBMIT_TEXT = re.compile(
    r"(submit|suggest|add\s+(?:a\s+|your\s+|new\s+)?(?:tool|ai|app|startup|product|saas|software|site|website|listing|project|bot|company|service|gpt|agent|resource|link|business)"
    r"|list\s+your|get\s+listed|get\s+featured|launch\s+(?:your|a)\s+(?:product|startup|tool|app|project)"
    r"|post\s+(?:a\s+|your\s+)(?:tool|startup|product|project|app)|add\s+listing|claim\s+(?:your\s+)?(?:listing|profile|company)"
    r"|write\s+for\s+us|become\s+a\s+(?:contributor|writer|author)|publish\s+(?:your|a)\s+(?:post|article|story|tool|product)"
    r"|добавить|разместить|предложить|опубликовать|прислать|eintragen|hinzufügen|einreichen|soumettre|ajouter|proposer"
    r"|enviar|añadir|agregar|inviare|aggiungi|segnala|dodaj|zgłoś|ekle|gönder|indienen|toevoegen|submeter|adicionar|sugerir)", re.I)
NEG_TEXT = re.compile(r"(subscribe|newsletter|add to cart|address|addthis|add-on|addon|adding|cookie|bookmark|to home ?screen|calendar|wishlist|watchlist|favorites)", re.I)
REGISTER_RE = re.compile(r"(register|signup|sign-up|sign_up|/join(?:/|$|\?)|mode=register|action=register|action=signup|registration|create[-_]account|registrieren|inscription)", re.I)
REGISTER_TEXT = re.compile(r"^\s*(register|sign ?up|join(?: now| us| free| the community| the forum)?|create (?:an |your |new )?account|регистрация|зарегистрироваться|registrieren|s'inscrire|inscription|registrarse|registrati|zarejestruj(?: się)?|kayıt ol)\s*[!.]?\s*$", re.I)
LOGIN_RE = re.compile(r"(login|log-in|signin|sign-in|/auth(?:/|$)|mode=login|action=login)", re.I)
LOGIN_TEXT = re.compile(r"^\s*(log ?in|sign ?in|вход|войти|anmelden|connexion|iniciar sesión|accedi)\s*$", re.I)
RULES_RE = re.compile(r"(rules|guidelines|code-of-conduct|community-standards|posting-policy|forum-policy|pravila|/faq(?:/|$|\.|\?)|help/terms|mode=terms|action=rules)", re.I)
RULES_TEXT = re.compile(r"^\s*(?:forum |community |site |board |posting )?(rules|guidelines|faq|terms(?: and rules| & rules| of service| of use)?|code of conduct|правила(?: форума| сайта)?|regeln|règles|reglas|regole|regulamin)\s*$", re.I)
PRICING_RE = re.compile(r"(pricing|advertis|sponsor|featured-listing|/promote|/plans|/upgrade)", re.I)
PRICING_TEXT = re.compile(r"^\s*(pricing|advertise|sponsor(?:ship)?|plans|get featured|promote|тарифы|реклама)\s*$", re.I)

CAPTCHA_RE = re.compile(r"(g-recaptcha|recaptcha/api|grecaptcha|hcaptcha|h-captcha|cf-turnstile|challenges\.cloudflare\.com/turnstile|captcha)", re.I)
EXTFORM_RE = re.compile(r"(tally\.so|typeform\.com|forms\.gle|docs\.google\.com/forms|airtable\.com/(?:shr|app|embed)|jotform\.com|form\.jotform|fillout\.com|paperform\.co|formstack|cognitoforms|wufoo\.com|hsforms|share\.hsforms|formspree|getform\.io|forms\.office\.com|zfrmz|youform|noteforms)", re.I)
PRICE_RE = re.compile(r"(\$\s?\d{1,4}(?:[.,]\d{1,2})?(?!\d)|(?<![\d.])\d{1,4}(?:[.,]\d{1,2})?\s?(?:usd|\$)(?![a-z])|€\s?\d{1,4}|(?<![\d.])\d{1,4}\s?€|£\s?\d{1,4}|(?<![\d.])\d{2,6}\s?(?:₽|руб))", re.I)
PAY_RE = re.compile(r"(payment|checkout|stripe|paypal|lemon\s?squeezy|gumroad|paddle\.com|one[- ]time (?:fee|payment)|pay now|buy now|paid listing|paid submission|submission fee|listing fee|оплат|платное размещение)", re.I)
FREE_RE = re.compile(r"(\bfree\b|бесплатн|gratis|kostenlos|gratuit|gratuito|darmow|ücretsiz)", re.I)
FREE_SUBMIT_RE = re.compile(r"(free (?:submission|listing|plan|option|tier|forever)|submit (?:for|it for) free|list(?:ed)? (?:for )?free|free to (?:submit|list|join|post)|basic (?:listing|plan).{0,40}free|\$0\b|бесплатн\w* (?:размещ|добавл|публикац))", re.I)
LOGINWALL_RE = re.compile(r"(log\s?in to (?:submit|continue|add|post|create|list)|sign\s?in to (?:submit|continue|add|post|create|list)|you (?:must|need to) (?:be logged|log in|sign in|register|create an account)|please (?:log|sign) in|create an account to|login required|sign up to (?:submit|add|post|list)|войдите|авторизуйтесь|необходимо (?:войти|авторизоваться|зарегистрироваться)|only registered)", re.I)
CF_RE = re.compile(r"(cf-chl|cf_chl_opt|just a moment\.\.\.|attention required! \| cloudflare|challenge-platform|captcha-delivery\.com|px-captcha|vercel security checkpoint|ddos-guard|checking your browser|sgcaptcha|/cdn-cgi/challenge)", re.I)
PARKED_RE = re.compile(r"(domain (?:name )?(?:is|may be) for sale|this domain is for sale|buy this domain|domain for sale|make an offer on this domain|sedoparking|parkingcrew|bodis\.com|dan\.com/buy|afternic|hugedomains|undeveloped\.com|domainmarket\.com|this domain has been registered|domain parking|parklogic|domain has expired|this domain is parked|is parked free|renew (?:this|your) domain now|related searches|domain is not configured)", re.I)
SPAM_RE = re.compile(r"(casino|gacor|togel|\bjudi\b|slot\s?online|sbobet|sportsbook|poker online|viagra|cialis|\bporn|\bxxx\b|escort service|hentai|payday loan|bandar|maxwin|pragmatic play|rtp live|situs slot|bokep|link alternatif)", re.I)
SOFT404_RE = re.compile(r"(404|page not found|not found|страница не найдена|seite nicht gefunden|page introuvable|página no encontrada|doesn't exist|does not exist|no longer available)", re.I)
SHOWCASE_RE = re.compile(
    r"(showcase|show[- ]?(?:and|&|n|'n')[- ]?tell|show\s*hn|self[- ]?promo|promot|advertis|announce|your (?:projects?|sites?|websites?|apps?|products?|work|creations|startups?|tools?|business(?:es)?)"
    r"|projects?|made with|built with|introduc|launch|startups?|products? (?:and|&) services|website (?:review|critique|showcase)|site (?:review|showcase)|review my|app showcase"
    r"|share (?:your|what)|portfolio|gallery|demo|tools? (?:and|&) resources|resources|plugins? (?:and|&) (?:tools|extensions)|community (?:projects|creations|content)|creations|what (?:i|you)(?:'ve)? built"
    r"|ваш\w* проект|проекты|реклам|самореклам|представ|анонс|покажи|витрина|презентац|мои работы|стартап|сервисы)", re.I)
PROHIBIT_RE = re.compile(
    r"(no (?:self[- ]?promotion|advertising|advertisements|commercial (?:posts|links|content)|soliciting|spam(?:ming)? or advertising)|self[- ]?promotion (?:is )?(?:not allowed|prohibited|forbidden|banned|not permitted)"
    r"|advertising (?:is )?(?:not allowed|prohibited|forbidden|not permitted)|do not (?:advertise|promote your|post (?:links|ads|advertisements))|commercial (?:posts|links|messages) (?:are )?(?:not allowed|prohibited)"
    r"|no links|links are not (?:allowed|permitted)|запрещ\w* (?:реклам|самореклам|ссылк)|реклама\w* (?:запрещ|не допуска)|самореклама\w* (?:запрещ|не допуска))", re.I)
ALLOW_RE = re.compile(
    r"(self[- ]?promotion (?:is )?(?:allowed|permitted|welcome)|promote your (?:site|business|product|project|app|work)s?|showcase your|share your (?:project|work|product|app|startup|tool)s?"
    r"|signature links? (?:are )?(?:allowed|permitted)|links? in (?:your )?signatures?|you may (?:post|include) (?:a )?links?|post your (?:project|app|product|startup|tool)s? (?:here|in)"
    r"|реклам\w* разрешен|можно (?:размещать|рекламировать|публиковать ссылк)|разрешен\w* (?:самореклам|реклам))", re.I)
REL_KW = {
    "ai": r"(\bai\b|artificial intelligence|machine learning|\bml\b|\bllm|gpt|chatgpt|generative|нейросет|искусственн\w* интеллект|\bии\b|\bki\b|\bia\b)",
    "saas": r"(\bsaas\b|software|web app|\bapps?\b|softwar|софт|программн\w* обеспеч|приложени)",
    "startup": r"(startup|start-up|founder|indie ?hacker|maker|launch|стартап|основател)",
    "dev": r"(developer|programming|coding|\bcode\b|devops|javascript|python|php|web ?dev|разработ|программир)",
    "tech": r"(technolog|\btech\b|digital|internet|computer|gadget|технолог|цифров|компьютер)",
    "marketing": r"(marketing|\bseo\b|advertis|growth|affiliate|smm|маркетинг|продвижени|реклам)",
    "automation": r"(automat|no-?code|low-?code|workflow|integration|zapier|n8n|rpa|автоматиз)",
    "bot": r"(chatbot|\bbots?\b|telegram|messenger|whatsapp|чат-?бот|телеграм|\bбот)",
    "business": r"(business|b2b|enterprise|productivity|crm|small business|бизнес|предпринимат)",
    "tools": r"(\btools?\b|directory|catalog|alternatives|инструмент|каталог|сервис)",
}
REL_RE = {k: re.compile(v, re.I) for k, v in REL_KW.items()}

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
RU_MONTHS = {"янв": 1, "фев": 2, "мар": 3, "апр": 4, "мая": 5, "май": 5, "июн": 6, "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12}
DATE_PATTERNS = [
    (re.compile(r'(?:datetime|content|data-date|dateTime)="(20\d\d-\d\d-\d\d)'), "iso"),
    (re.compile(r'"(?:datePublished|dateModified|dateCreated|uploadDate|last_posted_at|bumped_at|created_at|updated_at|lastPostedAt|publishedAt|createdAt|updatedAt|date_added|added_at|lastposttimeISO|timestampISO|pubDate)"\s*:\s*"(20\d\d-\d\d-\d\d)'), "iso"),
    (re.compile(r'<lastmod>\s*(20\d\d-\d\d-\d\d)'), "iso"),
    (re.compile(r'data-time(?:stamp)?="(1[6-9]\d{8})"'), "unix"),
]
TEXT_DATE_PATTERNS = [
    (re.compile(r"\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d\d)\b", re.I), "dmy_en"),
    (re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b", re.I), "mdy_en"),
    (re.compile(r"\b(\d{1,2})\s+(янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\.?\s+(20\d\d)", re.I), "dmy_ru"),
    (re.compile(r"\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b"), "ymd"),
    (re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(20\d\d)\b"), "dmy_dot"),
    (re.compile(r"\b(\d{1,2})-(\d{1,2})-(20\d\d)\b"), "mdy_dash"),
]
REL_DATE_RE = re.compile(r"\b(?:(today|yesterday|сегодня|вчера|heute|gestern|aujourd'hui|hier|hoy|ayer)|(?:(\d+|an?|one)\s+(minute|min|hour|hr|day|week|month|year)s?\s+ago)|(?:(\d+)\s+(минут|час|дн|день|недел|месяц|год|лет)\w*\s+назад))", re.I)


def root_of(host):
    e = EXT(host)
    return (e.top_domain_under_public_suffix or host).lower()


def clamp_date(d):
    if d is None:
        return None
    if d > TODAY or d.year < 2012:
        return None
    return d


def mkdate(y, m, d):
    try:
        return clamp_date(datetime(int(y), int(m), int(d), tzinfo=timezone.utc))
    except Exception:
        return None


def extract_dates(html, text):
    found = []
    for rx, kind in DATE_PATTERNS:
        for m in rx.finditer(html):
            v = m.group(1)
            if kind == "iso":
                found.append(mkdate(v[0:4], v[5:7], v[8:10]))
            else:
                try:
                    found.append(clamp_date(datetime.fromtimestamp(int(v), tz=timezone.utc)))
                except Exception:
                    pass
    for rx, kind in TEXT_DATE_PATTERNS:
        for m in rx.finditer(text):
            g = m.groups()
            if kind == "dmy_en":
                found.append(mkdate(g[2], MONTHS[g[1][:3].lower()], g[0]))
            elif kind == "mdy_en":
                found.append(mkdate(g[2], MONTHS[g[0][:3].lower()], g[1]))
            elif kind == "dmy_ru":
                found.append(mkdate(g[2], RU_MONTHS.get(g[1][:3].lower(), 0), g[0]))
            elif kind == "ymd":
                found.append(mkdate(g[0], g[1], g[2]))
            elif kind == "dmy_dot":
                found.append(mkdate(g[2], g[1], g[0]))
            elif kind == "mdy_dash":
                found.append(mkdate(g[2], g[0], g[1]))
    rel = None
    for m in REL_DATE_RE.finditer(text[:200000]):
        word, n, unit, n_ru, unit_ru = m.groups()
        if word:
            w = word.lower()
            delta = 0 if w in ("today", "сегодня", "heute", "aujourd'hui", "hoy") else 1
        elif unit:
            k = 1 if n.lower() in ("a", "an", "one") else int(n)
            mult = {"minute": 0, "min": 0, "hour": 0, "hr": 0, "day": 1, "week": 7, "month": 30, "year": 365}[unit.lower()]
            delta = k * mult
        else:
            k = int(n_ru)
            u = unit_ru.lower()
            mult = 0 if u.startswith(("минут", "час")) else 1 if u.startswith(("дн", "день")) else 7 if u.startswith("недел") else 30 if u.startswith("месяц") else 365
            delta = k * mult
        d = TODAY - timedelta(days=delta)
        if rel is None or d > rel:
            rel = d
    found = [d for d in found if d]
    best = max(found) if found else None
    if rel and (best is None or rel > best):
        return rel, "relative"
    return best, ("absolute" if best else None)


def decode(body, resp_charset):
    for enc in [resp_charset, "utf-8"]:
        if not enc:
            continue
        try:
            return body.decode(enc)
        except Exception:
            continue
    m = re.search(rb'charset=["\']?([a-zA-Z0-9_-]+)', body[:4000])
    if m:
        try:
            return body.decode(m.group(1).decode(), errors="replace")
        except Exception:
            pass
    return body.decode("utf-8", errors="replace")


async def fetch(session, url, max_bytes=1_500_000, timeout=22):
    t0 = time.time()
    try:
        async with session.get(url, headers=HEADERS, allow_redirects=True, max_redirects=8,
                               timeout=aiohttp.ClientTimeout(total=timeout, connect=12, sock_read=15)) as r:
            chunks = []
            total = 0
            async for chunk in r.content.iter_chunked(65536):
                chunks.append(chunk)
                total += len(chunk)
                if total >= max_bytes:
                    break
            body = b"".join(chunks)[:max_bytes]
            ctype = r.headers.get("Content-Type", "")
            text = decode(body, r.charset) if ("html" in ctype or "xml" in ctype or "json" in ctype or "text" in ctype or not ctype) else ""
            return {"url": url, "status": r.status, "final_url": str(r.url), "ctype": ctype[:60],
                    "text": text, "err": None, "ms": int((time.time() - t0) * 1000),
                    "hist": [str(h.url) for h in r.history][:6]}
    except Exception as e:  # noqa: BLE001
        msg = f"{type(e).__name__}: {str(e)[:160]}"
        return {"url": url, "status": None, "final_url": None, "ctype": "", "text": "", "err": msg,
                "ms": int((time.time() - t0) * 1000), "hist": []}


def detect_platform(html, soup):
    low = html[:600000].lower()
    gen = ""
    if soup is not None:
        g = soup.find("meta", attrs={"name": re.compile("^generator$", re.I)})
        if g and g.get("content"):
            gen = g["content"].lower()
    if "discourse" in gen or "data-discourse-setup" in low or 'name="discourse_' in low or "discourse-cdn" in low or "/assets/discourse" in low:
        return "Discourse"
    if "xenforo" in low or 'id="xf"' in low or "/js/xf/" in low or 'data-app="public"' in low and "data-template" in low:
        return "XenForo"
    if "phpbb" in low or "viewforum.php" in low:
        return "phpBB"
    if "vbulletin" in low or "vbmenu" in low or ("showthread.php" in low and "forumdisplay.php" in low and "mybb" not in low):
        return "vBulletin"
    if "mybb" in low or "member.php?action=register" in low or "forumdisplay.php?fid=" in low:
        return "MyBB"
    if "simple machines" in low or "smf_scripturl" in low or "index.php?board=" in low or "smfinfo" in low:
        return "SMF"
    if "invision community" in low or "ipsapp" in low or "ips.setstring" in low or "/applications/core/interface" in low or "ipb_" in low:
        return "Invision"
    if "flarum" in low:
        return "Flarum"
    if "nodebb" in low:
        return "NodeBB"
    if "vanilla" in gen or "vanillaforums" in low or "vanilla forums" in low or 'id="vanilla' in low:
        return "Vanilla"
    if "khoros" in low or ("lia-" in low and "lithium" in low):
        return "Khoros"
    if "forem" in gen or ("crayons" in low and "forem" in low):
        return "Forem"
    if "discuz" in low:
        return "Discuz"
    if "lemmy" in gen:
        return "Lemmy"
    if "wp-content" in low or "wordpress" in gen:
        return "WordPress"
    if "__next_data__" in low or "/_next/static" in low:
        return "Next.js"
    if "webflow" in gen or ("webflow" in low and "w-nav" in low):
        return "Webflow"
    if "framer" in gen or "framerusercontent.com" in low:
        return "Framer"
    if "bubble" in gen or "bubble_session" in low or "bubble.io" in low and "bubble_" in low:
        return "Bubble"
    if "ghost" in gen:
        return "Ghost"
    if "wix.com" in gen or "static.wixstatic.com" in low:
        return "Wix"
    if "squarespace" in low:
        return "Squarespace"
    if "__nuxt" in low or "/_nuxt/" in low:
        return "Nuxt"
    if "astro" in gen:
        return "Astro"
    if "drupal" in gen or "drupal-settings-json" in low:
        return "Drupal"
    if "joomla" in gen:
        return "Joomla"
    if "hugo" in gen:
        return "Hugo"
    if "gatsby" in gen or "___gatsby" in low:
        return "Gatsby"
    if "svelte" in low and "sveltekit" in low:
        return "SvelteKit"
    if 'id="root"' in low or 'id="app"' in low:
        return "SPA"
    return "Custom"


def visible_text(soup):
    if soup is None:
        return ""
    for t in soup(["script", "style", "noscript", "svg", "template"]):
        t.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True))


def parse_page(page, base_host):
    html = page.get("text") or ""
    out = {"status": page.get("status"), "final_url": page.get("final_url"), "err": page.get("err"),
           "ms": page.get("ms"), "hist": page.get("hist")}
    if not html:
        return out, None, [], ""
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        soup = None
    title = ""
    desc = ""
    lang = ""
    if soup is not None:
        if soup.title and soup.title.string:
            title = soup.title.string.strip()[:200]
        md = soup.find("meta", attrs={"name": re.compile("^description$", re.I)}) or soup.find("meta", attrs={"property": "og:description"})
        if md and md.get("content"):
            desc = md["content"].strip()[:300]
        if soup.html and soup.html.get("lang"):
            lang = soup.html.get("lang")[:10]
    platform = detect_platform(html, soup)
    links = []
    iframes = []
    if soup is not None:
        base = page.get("final_url") or page.get("url")
        for a in soup.find_all("a", href=True)[:4000]:
            href = a["href"].strip()
            if href.startswith(("javascript:", "mailto:", "tel:", "#")):
                continue
            try:
                absu = urljoin(base, href)
            except Exception:
                continue
            txt = re.sub(r"\s+", " ", a.get_text(" ", strip=True))[:120]
            if not txt:
                txt = (a.get("title") or a.get("aria-label") or "")[:120]
            links.append((absu, txt))
        for f in soup.find_all(["iframe", "script"], src=True):
            iframes.append(f["src"])
    forms = []
    if soup is not None:
        for f in soup.find_all("form")[:30]:
            fields = []
            for i in f.find_all(["input", "textarea", "select"]):
                t = (i.get("type") or i.name or "").lower()
                if t in ("hidden", "submit", "button", "checkbox", "radio", "image", "reset"):
                    continue
                n = " ".join(filter(None, [i.get("name"), i.get("id"), i.get("placeholder"), i.get("aria-label")])).lower()
                fields.append((t, n[:80]))
            has_url = any(t == "url" or re.search(r"(url|website|web site|\blink|site|домен|сайт|ссылк)", n) for t, n in fields)
            has_pass = any(t == "password" for t, n in fields)
            is_search = len(fields) <= 2 and any(t == "search" or re.search(r"(search|\bq\b|query|\bs\b|keyword|поиск)", n) for t, n in fields)
            is_news = len(fields) <= 2 and any(re.search(r"(email|mail)", n) or t == "email" for t, n in fields) and not has_url
            forms.append({"n": len(fields), "url": has_url, "pass": has_pass, "search": is_search, "newsletter": is_news,
                          "action": (f.get("action") or "")[:120], "fields": [x[1] or x[0] for x in fields][:12]})
    text = visible_text(soup) if soup is not None else ""
    low_text = text.lower()
    cyr = len(re.findall(r"[а-яё]", low_text[:20000]))
    lat = len(re.findall(r"[a-z]", low_text[:20000]))
    out.update({
        "title": title, "desc": desc, "lang": lang, "platform": platform, "text_len": len(text),
        "n_links": len(links), "forms": forms,
        "n_inputs": len(re.findall(r"<input\b", html, re.I)) + len(re.findall(r"<textarea\b", html, re.I)),
        "captcha": bool(CAPTCHA_RE.search(html)),
        "ext_form": sorted(set(m.group(1).lower() for m in EXTFORM_RE.finditer(html)))[:5],
        "cf_block": bool(CF_RE.search(html[:30000])) and (page.get("status") in (403, 429, 503) or len(text) < 1500),
        "parked": bool(PARKED_RE.search(html[:60000])) and len(text) < 6000,
        "spam_hits": sorted(set(m.group(1).lower() for m in SPAM_RE.finditer(text)))[:10],
        "spam_count": len(SPAM_RE.findall(text)),
        "js_app": len(text) < 600 and ("__next" in html.lower() or 'id="root"' in html.lower() or 'id="app"' in html.lower() or "<noscript" in html.lower()),
        "cyr_ratio": round(cyr / (cyr + lat + 1), 2),
        "price_hits": [m.group(1) for m in PRICE_RE.finditer(text)][:8],
        "pay_hits": sorted(set(m.group(1).lower() for m in PAY_RE.finditer(text)))[:6],
        "free_hits": len(FREE_RE.findall(text)),
        "free_submit": [m.group(1) for m in FREE_SUBMIT_RE.finditer(text)][:4],
        "loginwall": [m.group(1) for m in LOGINWALL_RE.finditer(text)][:3],
        "soft404": bool(SOFT404_RE.search(title)) or (len(text) < 2500 and bool(re.search(r"\b404\b|page not found|страница не найдена", low_text))),
        "rel": {k: len(rx.findall((title + " " + desc + " " + text[:30000]))) for k, rx in REL_RE.items()},
    })
    d, dkind = extract_dates(html, text)
    out["last_date"] = d.date().isoformat() if d else None
    out["last_date_kind"] = dkind
    out["iframes_ext"] = [s for s in iframes if EXTFORM_RE.search(s)][:3]
    return out, soup, links, text


def score_submit_link(u, txt, host_root):
    try:
        p = urlparse(u)
    except Exception:
        return 0
    if p.scheme not in ("http", "https"):
        return 0
    s = 0
    path = (p.path + ("?" + p.query if p.query else "")).lower()
    same = root_of(p.hostname or "") == host_root if p.hostname else False
    ext_form = bool(EXTFORM_RE.search(u))
    if not same and not ext_form:
        return 0
    if NEG_TEXT.search(txt or "") and not SUBMIT_TEXT.search(txt or ""):
        return 0
    if SUBMIT_TEXT.search(txt or ""):
        s += 6
    if SUBMIT_HREF.search(path):
        s += 5
    if ext_form and s > 0:
        s += 2
    if re.search(r"(tool|ai|startup|product|saas|software|app|listing|project|bot|gpt|agent|сервис|нейросет|бот)", (txt or "") + path, re.I):
        s += 1
    if re.search(r"(job|event|ticket|bug|feedback|support|review|comment|press|news|story|deal|coupon|resume|cv)", (txt or "") + path, re.I):
        s -= 3
    if re.search(r"(sitemap|privacy|terms|cookie|tag/|category/|blog/)", path):
        s -= 4
    return s


def pick_links(links, host_root, regex, limit=3, same_only=True, text_regex=None):
    out = []
    seen = set()
    for u, t in links:
        try:
            p = urlparse(u)
        except Exception:
            continue
        if not p.hostname:
            continue
        if same_only and root_of(p.hostname) != host_root:
            continue
        hay = (p.path + "?" + p.query).lower()
        if regex.search(hay) or (text_regex is not None and text_regex.search(t or "")):
            key = u.split("#")[0]
            if key in seen:
                continue
            seen.add(key)
            out.append((key, t))
            if len(out) >= limit:
                break
    return out


FORUM_SECTION_HREF = re.compile(r"(/forums?/|viewforum\.php|forumdisplay\.php|[?&]board=|/c/|/category/|/categories/|/bd-p/|/ct-p/|/t/[a-z0-9-]+$|/tags/|/f/|forum-\d+|/board/)", re.I)


def forum_sections(links, host_root):
    names = []
    for u, t in links:
        if not t or len(t) < 3 or len(t) > 90:
            continue
        try:
            p = urlparse(u)
        except Exception:
            continue
        if not p.hostname or root_of(p.hostname) != host_root:
            continue
        if FORUM_SECTION_HREF.search(p.path + "?" + p.query):
            names.append(t)
    uniq = []
    for n in names:
        if n not in uniq:
            uniq.append(n)
    return uniq[:250]


async def discourse_probe(session, base):
    info = {}
    a = await fetch(session, base + "/about.json", max_bytes=400_000)
    if a["status"] == 200 and a["text"].strip().startswith("{"):
        try:
            j = json.loads(a["text"])
            st = (j.get("about") or {}).get("stats") or {}
            info["stats"] = {k: st.get(k) for k in ["topic_count", "post_count", "user_count", "topics_7_days", "topics_30_days",
                                                    "posts_7_days", "posts_30_days", "users_7_days", "active_users_7_days", "active_users_30_days"] if k in st}
            info["title"] = (j.get("about") or {}).get("title")
        except Exception as e:  # noqa: BLE001
            info["about_err"] = str(e)[:80]
    else:
        info["about_status"] = a["status"]
    c = await fetch(session, base + "/categories.json?include_subcategories=true", max_bytes=1_500_000)
    cats = []
    if c["status"] == 200 and c["text"].strip().startswith("{"):
        try:
            j = json.loads(c["text"])
            for cat in (j.get("category_list") or {}).get("categories", []):
                cats.append((cat.get("name") or "", (cat.get("description_text") or "")[:160], cat.get("topic_count"), cat.get("slug"), cat.get("id")))
                for sc in cat.get("subcategory_list") or []:
                    cats.append((cat.get("name", "") + " > " + (sc.get("name") or ""), (sc.get("description_text") or "")[:160], sc.get("topic_count"), sc.get("slug"), sc.get("id")))
        except Exception as e:  # noqa: BLE001
            info["cat_err"] = str(e)[:80]
    else:
        info["cat_status"] = c["status"]
    info["categories"] = [x[0] for x in cats][:120]
    info["showcase_cats"] = [{"name": x[0], "desc": x[1], "topics": x[2], "url": f"{base}/c/{x[3]}/{x[4]}"}
                             for x in cats if SHOWCASE_RE.search(x[0] + " " + (x[1] or ""))][:12]
    l = await fetch(session, base + "/latest.json", max_bytes=1_000_000)
    if l["status"] == 200 and l["text"].strip().startswith("{"):
        try:
            j = json.loads(l["text"])
            ds = [t.get("last_posted_at") or t.get("bumped_at") for t in (j.get("topic_list") or {}).get("topics", [])]
            ds = [x for x in ds if x]
            info["latest"] = max(ds)[:10] if ds else None
        except Exception as e:  # noqa: BLE001
            info["latest_err"] = str(e)[:80]
    else:
        info["latest_status"] = l["status"]
        info["latest_final"] = l["final_url"]
    return info


async def flarum_probe(session, base):
    info = {}
    d = await fetch(session, base + "/api/discussions?sort=-lastPostedAt&page%5Blimit%5D=5", max_bytes=600_000)
    if d["status"] == 200 and d["text"].strip().startswith("{"):
        try:
            j = json.loads(d["text"])
            ds = [x.get("attributes", {}).get("lastPostedAt") for x in j.get("data", [])]
            ds = [x for x in ds if x]
            info["latest"] = max(ds)[:10] if ds else None
        except Exception:
            pass
    t = await fetch(session, base + "/api/tags", max_bytes=600_000)
    if t["status"] == 200 and t["text"].strip().startswith("{"):
        try:
            j = json.loads(t["text"])
            names = [x.get("attributes", {}).get("name", "") for x in j.get("data", [])]
            info["categories"] = names[:100]
            info["showcase_cats"] = [{"name": n} for n in names if SHOWCASE_RE.search(n)][:10]
        except Exception:
            pass
    return info


async def nodebb_probe(session, base):
    info = {}
    c = await fetch(session, base + "/api/categories", max_bytes=1_000_000)
    if c["status"] == 200 and c["text"].strip().startswith("{"):
        try:
            j = json.loads(c["text"])
            names = []
            for cat in j.get("categories", []):
                names.append(cat.get("name", ""))
                for ch in cat.get("children", []) or []:
                    names.append(cat.get("name", "") + " > " + ch.get("name", ""))
            info["categories"] = names[:100]
            info["showcase_cats"] = [{"name": n} for n in names if SHOWCASE_RE.search(n)][:10]
        except Exception:
            pass
    r = await fetch(session, base + "/api/recent", max_bytes=1_000_000)
    if r["status"] == 200 and r["text"].strip().startswith("{"):
        try:
            j = json.loads(r["text"])
            ds = [t.get("lastposttimeISO") or t.get("timestampISO") for t in j.get("topics", [])]
            ds = [x for x in ds if x]
            info["latest"] = max(ds)[:10] if ds else None
        except Exception:
            pass
    return info


PROBE_PATHS = ["/submit", "/submit-tool", "/add-tool", "/submit-startup", "/add", "/suggest"]


def page_summary(parsed, url):
    if not parsed:
        return None
    keep = ["status", "final_url", "err", "title", "platform", "text_len", "forms", "n_inputs", "captcha", "ext_form",
            "cf_block", "js_app", "price_hits", "pay_hits", "free_hits", "free_submit", "loginwall", "soft404", "last_date", "iframes_ext"]
    d = {k: parsed.get(k) for k in keep}
    d["url"] = url
    return d


async def verify_host(session, rec):
    host = rec["host"].lower().strip().strip("/")
    hroot = root_of(host)
    res = {"host": host, "root": hroot, "input_url": rec.get("url"), "cat_hint": rec.get("cat"), "lang_hint": rec.get("lang"),
           "sources": rec.get("sources", [])[:5], "hints": rec.get("hints", [])[:5], "names": rec.get("names", [])[:3],
           "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    home = await fetch(session, f"https://{host}/")
    if home["err"] or home["status"] is None:
        home2 = await fetch(session, f"http://{host}/")
        if not home2["err"]:
            home = home2
    hp, hsoup, hlinks, htext = parse_page(home, host)
    res["home"] = {k: hp.get(k) for k in ["status", "final_url", "err", "title", "desc", "lang", "platform", "text_len", "n_links",
                                          "captcha", "cf_block", "parked", "spam_hits", "spam_count", "js_app", "cyr_ratio", "rel",
                                          "last_date", "last_date_kind", "hist", "ms", "soft404"]}
    # primary page: a forum/community living under a sub-path given by the candidate url
    prim_base = None
    iu0 = rec.get("url") or ""
    ip0 = urlparse("")
    try:
        ip0 = urlparse(iu0)
        sub = ip0.hostname and root_of(ip0.hostname) == hroot and ip0.path not in ("", "/") and \
            re.search(r"^/(forums?|community|board|boards|discuss(?:ion)?s?|talk|bbs|phpbb\d?|foro|forum\w*)(/|$|\.php)", ip0.path, re.I)
    except Exception:
        sub = None
    home_bad = bool(home["err"]) or not home["status"] or home["status"] >= 400
    if sub or (home_bad and iu0 and ip0.path not in ("", "/")):
        prim = await fetch(session, iu0)
        if prim["status"] and prim["status"] < 400:
            pp0, ps0, pl0, pt0 = parse_page(prim, host)
            if home_bad or (pp0.get("platform") in FORUM_ENGINES and hp.get("platform") not in FORUM_ENGINES):
                res["primary"] = {"url": iu0, "status": prim["status"], "final_url": prim["final_url"],
                                  "platform": pp0.get("platform"), "title": pp0.get("title"), "last_date": pp0.get("last_date")}
                fu = urlparse(prim["final_url"])
                m0 = re.match(r"^(/[^/]+)", fu.path)
                prim_base = f"{fu.scheme}://{fu.hostname}" + (m0.group(1) if m0 and not m0.group(1).endswith(".php") else "")
                home, hp, hlinks, htext = prim, pp0, pl0, pt0
                for k in ["status", "platform", "title", "last_date", "last_date_kind", "text_len", "spam_hits", "spam_count", "rel", "cyr_ratio", "parked", "cf_block"]:
                    res["home"][k] = hp.get(k)
    final_host = urlparse(home["final_url"]).hostname if home.get("final_url") else None
    res["final_host"] = final_host
    res["final_root"] = root_of(final_host) if final_host else None
    res["redirect_offsite"] = bool(final_host and root_of(final_host) != hroot)
    if home["err"] or not home["status"]:
        res["outcome"] = "unreachable"
        return res
    if hp.get("parked") or (final_host and re.match(r"^ww\d+\.", final_host)):
        res["outcome"] = "parked"
        return res
    if hp.get("cf_block"):
        res["outcome"] = "bot_protected"
    elif home["status"] >= 400:
        res["outcome"] = f"http_{home['status']}"
        # still try the specific input url below
    work_root = res["final_root"] or hroot
    base = prim_base or (f"{urlparse(home['final_url']).scheme}://{final_host}" if final_host else f"https://{host}")
    platform = hp.get("platform")
    res["platform"] = platform
    # ------------------------------------------------ candidate submit urls
    cands = []
    iu = rec.get("url") or ""
    try:
        ip = urlparse(iu)
        if ip.hostname and ip.path not in ("", "/") and root_of(ip.hostname) == hroot and not (platform in FORUM_ENGINES and res.get("primary")):
            cands.append((iu, "input_url", 7))
    except Exception:
        pass
    scored = []
    for u, t in ([] if platform in FORUM_ENGINES else hlinks):
        s = score_submit_link(u, t, work_root)
        if s >= 6:
            scored.append((u.split("#")[0], t, s))
    scored.sort(key=lambda x: -x[2])
    seen = set(c[0] for c in cands)
    for u, t, s in scored:
        if u not in seen:
            cands.append((u, t, s))
            seen.add(u)
    res["submit_candidates"] = [{"url": u, "text": t, "score": s} for u, t, s in cands[:6]]
    res["register_links"] = [u for u, t in pick_links(hlinks, work_root, REGISTER_RE, 3, text_regex=REGISTER_TEXT)]
    res["login_links"] = [u for u, t in pick_links(hlinks, work_root, LOGIN_RE, 2, text_regex=LOGIN_TEXT)]
    res["rules_links"] = [u for u, t in pick_links(hlinks, work_root, RULES_RE, 3, text_regex=RULES_TEXT)]
    res["pricing_links"] = [u for u, t in pick_links(hlinks, work_root, PRICING_RE, 2, text_regex=PRICING_TEXT)]
    is_forum = platform in FORUM_ENGINES
    # ------------------------------------------------ check submit pages
    checked = []
    for u, t, s in cands[:2]:
        pg = await fetch(session, u)
        pp, _, plinks, ptext = parse_page(pg, host)
        summ = page_summary(pp, u)
        summ["anchor"] = t
        # follow-up: a submit page that itself links to the real form (e.g. pricing -> form)
        if summ and not any(f.get("url") for f in (pp.get("forms") or [])) and not pp.get("ext_form"):
            inner = [(x, y, score_submit_link(x, y, work_root)) for x, y in plinks]
            inner = [z for z in inner if z[2] >= 8 and z[0].split("#")[0] not in seen]
            inner.sort(key=lambda z: -z[2])
            if inner:
                summ["inner_link"] = inner[0][0]
        checked.append(summ)
    if not cands and not is_forum and home["status"] and home["status"] < 400:
        for path in PROBE_PATHS:
            pg = await fetch(session, base + path, max_bytes=800_000, timeout=15)
            if pg["status"] == 200 and pg["final_url"] and urlparse(pg["final_url"]).path.rstrip("/") == path:
                pp, _, _, _ = parse_page(pg, host)
                if not pp.get("soft404"):
                    summ = page_summary(pp, base + path)
                    summ["anchor"] = "probe"
                    checked.append(summ)
                    break
    # one level deeper if the checked page pointed to an inner form page
    for summ in list(checked):
        if summ and summ.get("inner_link") and len(checked) < 3:
            pg = await fetch(session, summ["inner_link"])
            pp, _, _, _ = parse_page(pg, host)
            s2 = page_summary(pp, summ["inner_link"])
            s2["anchor"] = "inner"
            checked.append(s2)
    res["submit_checked"] = checked
    # ------------------------------------------------ forum specifics
    forum = {}
    if is_forum or platform in ("Forem",):
        forum["engine"] = platform
        if platform == "Discourse":
            forum.update(await discourse_probe(session, base))
        elif platform == "Flarum":
            forum.update(await flarum_probe(session, base))
        elif platform == "NodeBB":
            forum.update(await nodebb_probe(session, base))
        secs = forum_sections(hlinks, work_root)
        if not forum.get("categories"):
            forum["categories"] = secs[:150]
        if not forum.get("showcase_cats"):
            forum["showcase_cats"] = [{"name": n} for n in secs if SHOWCASE_RE.search(n)][:12]
        stats = re.findall(r"((?:total )?(?:members|threads|messages|posts|topics|users|участник\w*|сообщени\w*|тем\w*|пользовател\w*)\s*[:\-]?\s*[\d][\d,.\s]{0,12})", htext[-6000:], re.I)
        forum["stats_snip"] = [s.strip()[:40] for s in stats][:6]
    # rules page (forums and communities)
    if is_forum and res["rules_links"]:
        rp = await fetch(session, res["rules_links"][0], max_bytes=900_000)
        rpp, _, _, rtext = parse_page(rp, host)
        forum["rules_url"] = res["rules_links"][0]
        forum["rules_status"] = rp["status"]
        forum["rules_prohibit"] = sorted(set(m.group(1).lower() for m in PROHIBIT_RE.finditer(rtext)))[:6]
        forum["rules_allow"] = sorted(set(m.group(1).lower() for m in ALLOW_RE.finditer(rtext)))[:6]
    if is_forum:
        forum["home_prohibit"] = sorted(set(m.group(1).lower() for m in PROHIBIT_RE.finditer(htext)))[:4]
        forum["home_allow"] = sorted(set(m.group(1).lower() for m in ALLOW_RE.finditer(htext)))[:4]
    if forum:
        res["forum"] = forum
    # ------------------------------------------------ register page check (forums or when submit needs account)
    if is_forum:
        reg_url = None
        if res["register_links"]:
            reg_url = res["register_links"][0]
        elif platform == "Discourse":
            reg_url = base + "/signup"
        elif platform == "phpBB":
            reg_url = base + "/ucp.php?mode=register"
        elif platform == "XenForo":
            reg_url = base + "/register/"
        elif platform == "MyBB":
            reg_url = base + "/member.php?action=register"
        elif platform == "SMF":
            reg_url = base + "/index.php?action=register"
        elif platform == "vBulletin":
            reg_url = base + "/register.php"
        if reg_url:
            rg = await fetch(session, reg_url, max_bytes=600_000)
            rgp, _, _, rgtext = parse_page(rg, host)
            res["register_check"] = {"url": reg_url, "status": rg["status"], "final_url": rg["final_url"],
                                     "captcha": rgp.get("captcha"), "forms": (rgp.get("forms") or [])[:3],
                                     "closed": bool(re.search(r"(registration(?:s)? (?:is |are )?(?:currently )?(?:closed|disabled)|not accepting new (?:registrations|members)|регистрация (?:закрыта|отключена|временно))", rgtext, re.I)),
                                     "paid": bool(re.search(r"(paid membership|membership fee|subscribe to join|платн\w* регистрац)", rgtext, re.I))}
    # ------------------------------------------------ activity
    act = None
    act_src = None
    if forum.get("latest"):
        act, act_src = forum["latest"], "forum_api"
    if not act and hp.get("last_date"):
        act, act_src = hp["last_date"], "home_" + (hp.get("last_date_kind") or "")
    if not is_forum and home["status"] and home["status"] < 400:
        sm = await fetch(session, base + "/sitemap.xml", max_bytes=2_000_000, timeout=18)
        smd = None
        if sm["status"] == 200 and "<" in sm["text"][:200]:
            ds = [mkdate(m[0:4], m[5:7], m[8:10]) for m in re.findall(r"<lastmod>\s*(20\d\d-\d\d-\d\d)", sm["text"])]
            ds = [d for d in ds if d]
            if ds:
                smd = max(ds).date().isoformat()
        res["sitemap_last"] = smd
        if smd and (not act or smd > act):
            act, act_src = smd, "sitemap"
    res["activity"] = {"last": act, "src": act_src}
    if "outcome" not in res:
        res["outcome"] = "ok"
    return res


async def main():
    qpath, rpath = sys.argv[1], sys.argv[2]
    conc = int(sys.argv[3]) if len(sys.argv) > 3 else 24
    done = set()
    if os.path.exists(rpath):
        with open(rpath, encoding="utf-8") as f:
            for line in f:
                try:
                    done.add(json.loads(line)["host"])
                except Exception:
                    pass
    queue = []
    with open(qpath, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if r["host"].lower() not in done:
                queue.append(r)
    print(f"to verify: {len(queue)} (already done {len(done)})", flush=True)
    sem = asyncio.Semaphore(conc)
    conn = aiohttp.TCPConnector(limit=conc * 2, limit_per_host=3, ssl=SSL_CTX, ttl_dns_cache=300, enable_cleanup_closed=True)
    out = open(rpath, "a", encoding="utf-8")
    n = 0
    t0 = time.time()
    async with aiohttp.ClientSession(connector=conn, trust_env=True, cookie_jar=aiohttp.DummyCookieJar()) as session:
        async def one(rec):
            nonlocal n
            async with sem:
                try:
                    r = await asyncio.wait_for(verify_host(session, rec), timeout=150)
                except Exception as e:  # noqa: BLE001
                    r = {"host": rec["host"].lower(), "root": root_of(rec["host"]), "input_url": rec.get("url"),
                         "cat_hint": rec.get("cat"), "lang_hint": rec.get("lang"), "sources": rec.get("sources", [])[:5],
                         "hints": rec.get("hints", [])[:5], "outcome": "verify_error", "error": f"{type(e).__name__}: {str(e)[:120]}",
                         "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
                out.write(json.dumps(r, ensure_ascii=False) + "\n")
                out.flush()
                n += 1
                if n % 50 == 0:
                    print(f"{n}/{len(queue)} in {int(time.time() - t0)}s", flush=True)
        await asyncio.gather(*(one(r) for r in queue))
    out.close()
    print(f"done {n} in {int(time.time() - t0)}s", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
