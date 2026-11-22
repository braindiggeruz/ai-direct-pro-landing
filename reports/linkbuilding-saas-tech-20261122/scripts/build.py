#!/usr/bin/env python3
"""Score verified facts and build deliverables.
Usage: python3 -I build.py LR_DIR OUT_DIR [REF_DOMAINS_TXT]
Rubric (max 100): relevance 30, quality 25, placement 25, activity 10, accessibility 10.
"""
import collections
import csv
import json
import os
import re
import sys
from datetime import date
from urllib.parse import urlparse

import tldextract

LR, OUT = sys.argv[1], sys.argv[2]
REF = sys.argv[3] if len(sys.argv) > 3 else None
EXT = tldextract.TLDExtract(cache_dir=os.path.join(LR, ".tldcache"))
TODAY = date(2026, 11, 22)
VDATE = "2026-11-22"
FORUM_ENGINES = {"Discourse", "XenForo", "phpBB", "vBulletin", "MyBB", "SMF", "Invision", "Flarum", "NodeBB", "Vanilla", "Khoros", "Discuz", "Lemmy"}
CLASSIC = {"phpBB", "vBulletin", "MyBB", "SMF", "XenForo", "Invision", "Discuz"}
GAMBLING = re.compile(r"(casino|gacor|togel|judi|slot\s?online|sbobet|sportsbook|poker online|viagra|cialis|payday loan|bandar|maxwin|pragmatic play|rtp live|situs slot|link alternatif)")
ADULT = re.compile(r"(porn|xxx|escort|hentai|bokep)")
STRONG_NAME = re.compile(
    r"(showcase|show[- ]?(?:and|&|n|'n')[- ]?tell|show\s*hn|self[- ]?promo|promot(?:e|ion) your|advertis(?:e|ing) your|your (?:projects?|sites?|websites?|apps?|products?|startups?|tools?|creations|work|software|services?)"
    r"|(?:member|user|community|your|our members'?) projects|share your projects|projects? (?:showcase|gallery|announcements?)|made with|built with|what (?:i|you|we)(?:'ve)? built|community (?:creations|showcase)"
    r"|website reviews?|review my (?:site|website|webdesign|web design|app)|showcase your (?:site|website|app|project)|tell people about your website"
    r"|(?:website|site|app) (?:reviews?|showcase|critique)|review my|creations|announce your|share your (?:projects?|work|apps?|creations|software)"
    r"|plugins? (?:and|&) (?:themes|tools) (?:showcase|announcements)|самореклам|ваш\w* (?:проект|сайт|работ)|проекты пользователей|витрина|анонс\w* (?:проект|сервис)|ihre projekte|vos projets|tus proyectos)", re.I)
STRONG_DESC = re.compile(r"(share your (?:projects?|apps?|products?|work|creations?|startups?|tools?|plugins?|sites?|software)|show (?:off|us) (?:your|what)|showcase your|promote your|self[- ]?promotion (?:is )?(?:allowed|welcome|ok)|post your (?:projects?|apps?|products?|startups?|tools?)|what you(?:'ve)? (?:built|made|created))", re.I)
WEAK_NAME = re.compile(r"(introduc|представ|launch|startups?|resources|tools? (?:and|&) |marketplace|bazaar|members?'? (?:area|lounge)|off[- ]?topic|general (?:chat|discussion|talk)|lounge|курилка|флуд)", re.I)
TECH_CAT = re.compile(r"(1с|1c|\bai\b|software|programm|develop|\bcode|coding|\bweb|tech|computer|\bseo\b|marketing|startup|business|apps?\b|hosting|linux|windows|android|\bios\b|data|cloud|automat|python|javascript|php|design|ecommerce|e-commerce|crypto|blockchain|server|network|security|gadget|hardware|программ|разработ|сайт|компьют|маркетинг|бизнес|seo|софт|интернет)", re.I)
REL = {
    "ai": r"(\bai\b|artificial intelligence|machine learning|\bllm|\bgpt|chatgpt|generative|нейросет|искусственн\w* интеллект|\bии\b|\bki\b)",
    "saas": r"(\bsaas\b|software|web ?apps?|softwar|софт|программн\w* обеспеч)",
    "tools": r"(\btools?\b|director(?:y|ies)|catalog|alternatives|инструмент|каталог|сервис)",
    "startup": r"(startup|start-up|founder|indie ?hacker|maker|launch|стартап)",
    "dev": r"(develop|розроб|програм|сисадмин|геймдев|gamedev|game dev|1с|1c:|programming|coding|\bcode\b|devops|javascript|python|\bphp\b|web ?dev|разработ|программир)",
    "tech": r"(technolog|\btech\b|digital|internet|computer|web ?design|hosting|хостинг|кибер|информационн|it[- ]?park|технопарк|tech ?park|айти|\bit-|спільнот|технолог|компьютер|webmaster|вебмастер)",
    "marketing": r"(marketing|\bseo\b|growth|affiliate|smm|маркетинг|продвижени|арбитраж)",
    "automation": r"(automat|no-?code|low-?code|workflow|integration|rpa|автоматиз)",
    "bot": r"(chatbot|\bbots?\b|telegram|messenger|чат-?бот|телеграм|\bбот)",
    "business": r"(business|b2b|enterprise|productivity|crm|бизнес|предпринимат)",
}
RELRX = {k: re.compile(v, re.I) for k, v in REL.items()}
TECH_GATE = re.compile(r"(security|безопасност|пентест|hardware|electronic|engineering|gadget|server|linux|windows|android|\bios\b|network|security|cloud|data|maker|robot|iot|3d print|programm|software|computer|web)", re.I)
CC = {"ru": "RU", "uz": "UZ", "kz": "KZ", "kg": "KG", "tj": "TJ", "az": "AZ", "ge": "GE", "am": "AM", "by": "BY", "ua": "UA",
      "de": "DE", "fr": "FR", "es": "ES", "it": "IT", "pl": "PL", "nl": "NL", "tr": "TR", "uk": "GB", "pt": "PT", "br": "BR",
      "in": "IN", "cn": "CN", "jp": "JP", "kr": "KR", "id": "ID", "vn": "VN", "cz": "CZ", "sk": "SK", "ro": "RO", "hu": "HU",
      "bg": "BG", "rs": "RS", "hr": "HR", "si": "SI", "lt": "LT", "lv": "LV", "ee": "EE", "fi": "FI", "se": "SE", "no": "NO",
      "dk": "DK", "at": "AT", "ch": "CH", "be": "BE", "ie": "IE", "gr": "GR", "il": "IL", "ca": "CA", "au": "AU", "nz": "NZ",
      "za": "ZA", "ng": "NG", "pk": "PK", "bd": "BD", "ph": "PH", "my": "MY", "sg": "SG", "th": "TH", "mx": "MX", "ar": "AR",
      "cl": "CL", "pe": "PE", "eg": "EG", "sa": "SA", "ae": "AE", "ir": "IR", "md": "MD", "mn": "MN", "su": "RU", "рф": "RU"}
CAT_NAME = {"A": "SaaS Directory", "B": "Technology Forum", "C": "AI Tools Directory", "D": "Startup & Tech Community"}
DIRWORDS = re.compile(r"(director(?:y|ies)|catalog(?:ue)?|\blists?\b|listings?|alternatives|discover|best .{0,30}tools|top .{0,30}(?:tools|apps|startups)|tools? (?:hub|finder|database|collection|list)|\bhub\b|launch(?:es|pad|ing)?\b|startups|new products|marketplace|database|collection|showcase|gallery|library|curated|aggregat|finder|radar|\bhunt|registry|reviews|compar|rankings|explore|browse|\bwiki\b|community|forum|blogging|publish|articles|writers|ecosystem|technopark|accelerator|incubator|каталог|подборк|лучшие|база|рейтинг|список|агрегатор|сообществ|публикац|статьи|стартап|технопарк|verzeichnis|annuaire|directorio|elenco|katalog|répertoire|lista de)", re.I)
STRONG_SUBMIT = re.compile(r"(submit\s*(?:a |an |your |new )?(?:ai |saas )?(?:tool|startup|product|app|saas|ai|software|site|website|listing|project|gpt|agent|bot|service|company|resource|link)|add\s*(?:a |an |your |new )?(?:ai |saas )?(?:tool|startup|product|app|listing|saas|ai|software|gpt|agent|bot|service|company|website|site|resource)|list\s*your|get\s*listed|suggest\s*(?:a |an |new )?(?:tool|product|resource|startup|app|site)|launch\s*your|submit[-_ ]?(?:tool|startup|product|app|saas|ai|software|listing|project|gpt|agent|bot)|add[-_](?:tool|startup|product|app|listing|saas|ai|software)|добавить\s*(?:сервис|нейросеть|инструмент|стартап|бота?|проект|сайт|программу|канал|чат|группу|компанию|продукт|решение|кейс)|написать\s*(?:статью|пост)|стать\s*автором|опубликовать\s*(?:статью|пост|материал)|предложить\s*(?:статью|новость|материал)|разместить\s*(?:статью|пресс-релиз|новость|компанию)|write\s*(?:an\s*)?article|become\s*an?\s*(?:author|contributor)|submit\s*(?:a\s*)?(?:guest\s*)?post|submit\s*news|submit\s*(?:a\s*)?press\s*release|предложить\s*(?:сервис|нейросеть|инструмент|стартап)|tool eintragen|ajouter (?:un |votre )?outil|añadir herramienta|enviar herramienta)", re.I)
LISTING_FIELDS = re.compile(r"(tool|product|startup|\bapp\b|saas|listing|your-?ai|software|нейросет)", re.I)
LOGIN_PATH = re.compile(r"(login|signin|sign-in|sign_in|/auth|register|signup|sign-up|/join|/account|/users/sign)", re.I)


def load_jsonl(p):
    out = []
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        out.append(json.loads(line))
                    except Exception:
                        pass
    return out


def root_of(host):
    e = EXT(host or "")
    return (e.top_domain_under_public_suffix or host or "").lower()


def country_of(host):
    e = EXT(host or "")
    last = (e.suffix or "").split(".")[-1]
    return CC.get(last, "INT")


def days_ago(d):
    try:
        return (TODAY - date.fromisoformat(d[:10])).days
    except Exception:
        return None


def free_status(price, pay, free_sub, free_hits):
    if free_sub:
        return "freemium" if (price and pay) else "yes"
    if price and pay:
        return "freemium" if free_hits >= 2 else "paid"
    if free_hits >= 1 and not price:
        return "yes (likely)"
    return "unknown"


def eval_submit(r, pw):
    """Return best mechanism state for non-forum sites."""
    best = None
    for s in r.get("submit_checked") or []:
        if not s:
            continue
        url = s.get("url")
        fu = s.get("final_url") or url
        st = s.get("status")
        anchor = (s.get("anchor") or "")
        forms = s.get("forms") or []
        form_url_html = any(f.get("url") and not f.get("search") and not f.get("newsletter") for f in forms)
        has_pass = any(f.get("pass") for f in forms)
        ext = list(s.get("ext_form") or []) + list(s.get("iframes_ext") or [])
        login = list(s.get("loginwall") or [])
        captcha = bool(s.get("captcha"))
        js = bool(s.get("js_app"))
        soft404 = bool(s.get("soft404"))
        price = list(s.get("price_hits") or [])
        pay = list(s.get("pay_hits") or [])
        free_sub = list(s.get("free_submit") or [])
        free_hits = s.get("free_hits") or 0
        try:
            redirected_login = bool(LOGIN_PATH.search(urlparse(fu).path + "?" + urlparse(fu).query)) and not LOGIN_PATH.search(urlparse(url).path)
        except Exception:
            redirected_login = False
        p = pw.get((r["root"], url)) or (pw.get((r["root"], fu)) if fu else None)
        form_url_pw = False
        pw_used = False
        moder, backlink, fields = [], [], [f2 for f in forms for f2 in (f.get("fields") or [])][:10]
        if p and not p.get("err") and not p.get("cf_block"):
            pw_used = True
            form_url_pw = bool(p.get("has_url"))
            has_pass = has_pass or bool(p.get("has_pass"))
            ext = ext or list(p.get("ext_form") or [])
            login = login or list(p.get("loginwall") or [])
            captcha = captcha or bool(p.get("captcha"))
            price = price or list(p.get("price_hits") or [])
            pay = pay or list(p.get("pay_hits") or [])
            free_sub = free_sub or list(p.get("free_submit") or [])
            moder = list(p.get("moderation") or [])
            backlink = list(p.get("backlink") or [])
            soft404 = bool(p.get("soft404")) if s.get("anchor") == "pw_home" else (soft404 and bool(p.get("soft404")))
            if p.get("status"):
                st = p.get("status")
            if p.get("final_url") and LOGIN_PATH.search(urlparse(p["final_url"]).path) and not LOGIN_PATH.search(urlparse(url).path):
                redirected_login = True
            if p.get("fields"):
                fields = p.get("fields")[:10]
            js = False
        article = bool(re.search(r"(write for us|contribut|become a (?:writer|author)|guest post|submit (?:a |your )?(?:story|article|post))", anchor + " " + (url or ""), re.I))
        if not st or st >= 400 or soft404:
            state, pts = "BROKEN", 4
        elif form_url_html or form_url_pw:
            state, pts = "FORM_URL", 23
        elif ext and (not all("hsforms" in e for e in ext) or STRONG_SUBMIT.search(anchor + " " + (url or ""))) and not re.search(r"/(contact|demo|sales|book|request)", urlparse(fu or url).path, re.I):
            state, pts = "EXTERNAL_FORM", 21
        elif ext:
            state, pts = "CONTACT_FORM", 12
        elif redirected_login or login or has_pass:
            state, pts = "LOGIN_REQUIRED", 18
        elif article:
            state, pts = "ARTICLE_PAGE", 17
        elif js:
            state, pts = "JS_UNRENDERED", 11
        elif (s.get("n_inputs") or 0) >= 3:
            state, pts = "FORM_NO_URL", 14
        else:
            state, pts = "PAGE_NO_FORM", 9
        info = {"url": url, "final_url": fu, "status": st, "state": state, "pts": pts, "form_in_html": form_url_html,
                "captcha": captcha, "ext": ext[:2], "login": bool(redirected_login or login or has_pass), "price": price[:4],
                "pay": pay[:4], "free": free_status(price, pay, free_sub, free_hits) if state in ("FORM_URL", "EXTERNAL_FORM", "PAGE_NO_FORM", "JS_UNRENDERED", "FORM_NO_URL") else "unknown", "pw": pw_used, "moder": moder[:2],
                "backlink": backlink[:3], "fields": fields, "article": article, "anchor": anchor}
        if best is None or pts > best["pts"]:
            best = info
    return best


def forum_numbers(f):
    st = f.get("stats") or {}
    if st:
        au = st.get("active_users_30_days") or st.get("active_users_7_days") or 0
        p30 = st.get("posts_30_days") or (st.get("posts_7_days") or 0) * 4
        return au, p30, st.get("post_count") or 0, True
    nums = []
    for snip in f.get("stats_snip") or []:
        m = re.search(r"([\d][\d,.\s]*)$", snip)
        if m:
            try:
                nums.append(int(re.sub(r"[^\d]", "", m.group(1))))
            except Exception:
                pass
    return 0, 0, max(nums) if nums else 0, False


def evaluate(r, q, pw, hint_txt):
    h = r.get("home") or {}
    outc = r.get("outcome") or ""
    root = r.get("root")
    rej = None
    if outc == "unreachable":
        return None, ("DEAD", f"connection/DNS error: {(h.get('err') or '')[:90]}")
    if outc == "parked":
        return None, ("PARKED", "parked or for-sale domain page")
    tl0 = (h.get("title") or "").lower()
    if re.search(r"(^index of /|домен не прилинкован|default web site page|^it works|welcome to nginx|apache2 .*default page|account suspended|site not found|website is under construction|coming soon$|this site can.t be reached|hosting is not configured|домен .* не настроен)", tl0) and (h.get("text_len") or 0) < 3000:
        return None, ("NOT_LIVE", "server placeholder / not a live site (title: " + (h.get("title") or "")[:60] + ")")
    if outc == "verify_error":
        return None, ("ERROR", f"verification error: {(r.get('error') or '')[:90]}")
    bp = outc == "bot_protected"
    pwh0 = PWHOME.get(r["host"]) or {}
    if outc in ("http_403", "http_429", "http_503") and pwh0.get("status") and pwh0["status"] < 400 and not pwh0.get("cf_block") and (pwh0.get("text_len") or 0) > 300:
        outc = "ok_browser"
        h = dict(h)
        h.update({"status": pwh0["status"], "final_url": pwh0.get("final_url"), "title": pwh0.get("title"), "desc": pwh0.get("desc"),
                  "text_len": pwh0.get("text_len"), "n_links": len(pwh0.get("anchors") or [])})
        r = dict(r)
        r["home"] = h
        r["outcome"] = "ok_browser"
    sub_ok = any(s and s.get("status") == 200 and not s.get("soft404") for s in (r.get("submit_checked") or []))
    if outc.startswith("http_") and not sub_ok:
        return None, ("HTTP_ERROR", f"homepage {outc.replace('_', ' ').upper()}")
    spam = " ".join(h.get("spam_hits") or [])
    g = set(GAMBLING.findall(spam))
    a = set(ADULT.findall(spam))
    sc = h.get("spam_count") or 0
    if len(g) >= 2 or (g and sc >= 4):
        return None, ("SPAM", f"gambling/pharma spam signals: {', '.join(sorted(g))[:80]}")
    if len(a) >= 2 and sc >= 6:
        return None, ("SPAM", f"adult content signals: {', '.join(sorted(a))[:80]}")
    engine = r.get("platform") or h.get("platform") or "Custom"
    f = r.get("forum") or {}
    if f.get("engine"):
        engine = f["engine"]
    td = ((h.get("title") or "") + " " + (h.get("desc") or "")).lower()
    rel = h.get("rel") or {}
    hint_cat = (r.get("cat_hint") or q.get("cat") or "D")[:1].upper() or "D"
    # ---------------- category
    if engine in FORUM_ENGINES:
        cat = "B"
    elif engine == "Forem":
        cat = "D"
    else:
        cat = hint_cat if hint_cat in "ACD" else ("D" if not re.search(r"(forum|community|board|форум)", td) else "B")
        ai_t = bool(RELRX["ai"].search(td))
        if cat == "A" and ai_t and re.search(r"(ai tools?|ai director|ai apps|gpts?\b|ai agents)", td):
            cat = "C"
        if cat == "C" and not ai_t and re.search(r"(saas|software)", td):
            cat = "A"
    # ---------------- relevance (0-30)
    flags = {k: bool(RELRX[k].search(td)) for k in RELRX}
    core_body = sum(rel.get(k, 0) for k in ("ai", "saas", "startup", "dev", "tech", "marketing", "automation", "bot"))
    jsish_home = (h.get("text_len") or 0) < 800
    pwh = PWHOME.get(r["host"]) or {}
    if jsish_home and pwh.get("title"):
        td = ((pwh.get("title") or "") + " " + (pwh.get("desc") or "") + " " + td).lower()
        flags = {k: bool(RELRX[k].search(td)) for k in RELRX}
        rel = {k: len(RELRX[k].findall(pwh.get("text") or "")) for k in RELRX}
        core_body = sum(rel[k] for k in ("ai", "saas", "startup", "dev", "tech", "marketing", "automation", "bot"))
    if re.search(r"(client challenge|just a moment|attention required)", (h.get("title") or ""), re.I):
        bp = True
    if bp:
        relevance = 18 if cat in "AC" else 16
    elif jsish_home and not pwh.get("title"):
        relevance = 16 if cat in "AC" else 14
    else:
        if core_body < 6 and not any(flags[k] for k in ("ai", "saas", "startup", "dev", "tech", "marketing", "automation", "bot")) and not TECH_GATE.search(td):
            return None, ("OFF_TOPIC", f"no AI/SaaS/tech signals on homepage (title: {(h.get('title') or '')[:60]})")
        base = {"C": 14, "A": 13, "D": 12, "B": 10}[cat]
        s = base
        s += 8 if flags["ai"] else (5 if rel.get("ai", 0) >= 15 else 0)
        s += 3 if (flags["saas"] or flags["tools"]) else 0
        s += 3 if (flags["bot"] or flags["automation"]) else (2 if rel.get("bot", 0) + rel.get("automation", 0) >= 10 else 0)
        s += 2 if (flags["startup"] or flags["dev"] or flags["tech"]) else 0
        s += 2 if (flags["marketing"] or flags["business"]) else 0
        s += min(4, sum(1 for k in ("ai", "saas", "startup", "dev", "tech", "marketing", "automation", "bot") if rel.get(k, 0) >= 5))
        if not any(flags[k] for k in ("ai", "saas", "startup", "dev", "tech", "automation", "bot")) and core_body < 12:
            s = min(s, 12)
        relevance = min(30, s)
    # ---------------- mechanism
    reg_url = ""
    submit_url = ""
    evidence = ""
    notes = []
    reg_required = "unknown"
    free = "unknown"
    ext_links = "unverified"
    selfpromo = "unverified"
    moder = "likely (typical for this platform type)"
    xr = "UNKNOWN"
    captcha = False
    stype = "UNVERIFIED"
    vstatus = "VERIFIED"
    placement = 3
    forum_q = 1
    form_in_html = False
    if bp:
        vstatus = "PARTIAL_BOT_PROTECTED"
        ev = " ".join(q.get("hints") or []).lower()
        placement = 9 if re.search(r"(submit|add (?:your|a) |list your|форм|добав)", ev) else 5
        stype = "UNVERIFIED"
        xr = "UNKNOWN"
        submit_url = q.get("url") or f"https://{r['host']}/"
        evidence = (q.get("sources") or [""])[0]
        notes.append("Cloudflare/anti-bot challenge served to automated clients (incl. WebFetch); site is online, placement mechanism NOT machine-verified — check in a normal browser")
        if q.get("hints"):
            notes.append("harvest evidence: " + "; ".join(q["hints"][:2])[:160])
    elif cat == "B":
        stype = "FORUM"
        show = f.get("showcase_cats") or []
        strong = [c for c in show if STRONG_NAME.search((c.get("name") or "").split(" > ")[-1]) or STRONG_DESC.search(c.get("desc") or "")]
        weak = [c for c in show if c not in strong and WEAK_NAME.search(c.get("name") or "")]
        cats_all = f.get("categories") or []
        tech_cats = sum(1 for n in cats_all if TECH_CAT.search(n or ""))
        tech_ratio = tech_cats / max(1, len(cats_all))
        if not any(flags[k] for k in ("ai", "saas", "startup", "dev", "tech", "marketing", "automation", "bot")) and not TECH_GATE.search(td) and (tech_cats < 3 or tech_ratio < 0.2):
            return None, ("OFF_TOPIC", f"forum is not technology-focused (title: {(h.get('title') or '')[:60]}; tech sections: {tech_cats})")
        regc = r.get("register_check") or {}
        private = engine == "Discourse" and (f.get("latest_status") in (401, 403, 404) or "login" in (f.get("latest_final") or ""))
        if private:
            return None, ("PRIVATE", "Discourse content requires login (not publicly indexable)")
        if regc.get("closed"):
            return None, ("REG_CLOSED", "forum registration closed/disabled")
        prohibit = sorted(set((f.get("rules_prohibit") or []) + (f.get("home_prohibit") or [])))
        allow = sorted(set((f.get("rules_allow") or []) + (f.get("home_allow") or [])))
        reg_ok = regc.get("status") == 200
        reg_url = regc.get("url") if reg_ok else ((r.get("register_links") or [""])[0])
        captcha = bool(regc.get("captcha"))
        au, p30, posts, is_dc = forum_numbers(f)
        if is_dc:
            forum_q = 5 if au >= 200 or p30 >= 1000 else 3 if au >= 30 or p30 >= 100 else 1
        else:
            forum_q = 5 if posts >= 100000 else 3 if posts >= 10000 else 1
        base_url = (r.get("primary") or {}).get("final_url") or h.get("final_url") or f"https://{r['host']}/"
        brand = (root or "").split(".")[0]
        hostp = r.get("final_host") or r["host"]
        vendor = (bool(re.match(r"^(forum|forums|community|discuss|discussions|discourse|talk|devforum|users|ask|answers|devcommunity|developer|developers|support|help)\.", hostp or ""))
                  and (bool(brand and brand[:5] in (h.get("title") or "").lower().replace(" ", "")) or engine == "Discourse"))
        names = [c.get("name") for c in strong][:4]
        built_with = any(re.search(r"(made with|built with|projects made|share your " + re.escape(brand) + r"|with " + re.escape(brand) + r")", (n or ""), re.I) for n in names) if brand else False
        RELEVANT_VENDORS = r"(n8n|make|zapier|bubble|flutterflow|botpress|voiceflow|typebot|flowise|dify|langchain|openai|huggingface|streamlit|gradio|activepieces|pipedream|latenode|retool|glide|softr|adalo|thunkable|appsmith|nocodb|baserow|weweb|cursor|rasa|telegram)"
        if strong and (vendor or built_with):
            placement = 16
            rel_v = bool(re.search(RELEVANT_VENDORS, brand or "", re.I))
            selfpromo = ("conditional — showcase is for projects built with/using " + (brand or "this product") + "; post only if GPTBot actually integrates it"
                         + (" (stack-relevant vendor)" if rel_v else "") + " — section: " + "; ".join(names))
            submit_url = strong[0].get("url") or base_url
            evidence = strong[0].get("url") or base_url
        elif strong:
            placement = 22 + (2 if reg_ok else 0)
            selfpromo = "yes — section: " + "; ".join(names)
            submit_url = strong[0].get("url") or base_url
            evidence = strong[0].get("url") or base_url
        elif allow and not prohibit:
            placement = 19
            selfpromo = "yes — rules: " + "; ".join(allow)[:120]
            submit_url = base_url
            evidence = f.get("rules_url") or base_url
        elif prohibit:
            return None, ("RULES_PROHIBIT", "forum rules prohibit self-promotion/advertising: " + "; ".join(prohibit)[:100])
        elif weak:
            placement = 14
            selfpromo = "possible — section: " + "; ".join(c.get("name") for c in weak[:3]) + " (rules not confirmed)"
            submit_url = weak[0].get("url") or base_url
            evidence = submit_url
            vstatus = "PARTIAL"
        else:
            placement = 10
            selfpromo = "unverified — no showcase/self-promo section detected (profile link / discussion participation only)"
            submit_url = base_url
            evidence = f.get("rules_url") or base_url
            vstatus = "PARTIAL"
            stype = "MANUAL"
        if not reg_ok:
            placement = max(3, placement - 4)
        reg_required = "yes"
        free = "yes (free registration)" if not regc.get("paid") else "paid"
        ext_links = "yes (new-user link limits likely)" if engine == "Discourse" else ("yes — " + "; ".join(allow)[:60] if allow else "unverified (check signature/link rules)")
        moder = "possible for new accounts (check forum rules)"
        xr = "POTENTIAL" if engine in CLASSIC else ("CUSTOM" if engine in FORUM_ENGINES else "UNKNOWN")
        st = f.get("stats") or {}
        if st:
            notes.append(f"{engine}: {st.get('active_users_30_days', st.get('active_users_7_days', '?'))} active users/30d, {st.get('posts_30_days', '?')} posts/30d")
        elif f.get("stats_snip"):
            notes.append(f"{engine}: " + ", ".join(f["stats_snip"][:3]))
        else:
            notes.append(engine)
        if captcha:
            notes.append("CAPTCHA on registration")
        if not reg_ok:
            notes.append(f"registration page not confirmed (status {regc.get('status')})")
        if f.get("rules_url"):
            notes.append("rules: " + f["rules_url"])
    else:
        b = eval_submit(r, pw)
        if b:
            submit_url = b["final_url"] if b["state"] != "BROKEN" else b["url"]
            evidence = b["url"]
            placement = b["pts"]
            captcha = b["captcha"]
            form_in_html = b["form_in_html"]
            free = b["free"]
            if b["state"] == "FORM_URL":
                stype = "SUBMIT_FORM"
                reg_required = "no" if not b["login"] else "yes"
                if b["fields"]:
                    notes.append("form fields: " + ", ".join(x for x in b["fields"] if x)[:110])
            elif b["state"] == "EXTERNAL_FORM":
                stype = "SUBMIT_FORM"
                reg_required = "no"
                notes.append("external form: " + ", ".join(b["ext"]))
            elif b["state"] == "LOGIN_REQUIRED":
                stype = "SUBMIT_FORM"
                reg_required = "yes"
                notes.append("submission behind account/login")
            elif b["state"] == "CONTACT_FORM":
                stype = "MANUAL"
                vstatus = "PARTIAL"
                reg_required = "no"
                notes.append("listing via contact/sales form (" + ", ".join(b["ext"]) + "), not a self-serve submission")
            elif b["state"] == "ARTICLE_PAGE":
                stype = "ARTICLE"
                reg_required = "unknown"
                notes.append("contributor/article submission page")
            elif b["state"] == "JS_UNRENDERED":
                stype = "MANUAL"
                vstatus = "PARTIAL"
                notes.append("submit page is JS-rendered; form not confirmed")
            elif b["state"] == "FORM_NO_URL":
                stype = "MANUAL"
                vstatus = "PARTIAL"
                notes.append("page has a form without URL field (contact/request form?)")
            elif b["state"] == "PAGE_NO_FORM":
                stype = "MANUAL"
                vstatus = "PARTIAL"
                notes.append("submission info page without a form (email/DM/other flow)")
            else:
                stype = "UNVERIFIED"
                vstatus = "UNVERIFIED"
                notes.append(f"submit link broken (HTTP {b['status']})")
            if b["price"]:
                notes.append("prices on page: " + ", ".join(b["price"][:3]))
            if b["moder"]:
                moder = "yes (stated: " + b["moder"][0][:40] + ")"
            if b["backlink"]:
                notes.append("mentions: " + ", ".join(sorted(set(x.lower() for x in b["backlink"])))[:60])
            if b["pw"]:
                notes.append("rendered-browser check")
            if captcha:
                notes.append("CAPTCHA")
            ext_links = "yes (website URL is part of the listing)" if b["state"] in ("FORM_URL", "EXTERNAL_FORM", "LOGIN_REQUIRED") else "unverified"
            if any("nofollow" in x.lower() for x in b["backlink"]):
                ext_links += "; nofollow mentioned"
            elif any(x.lower() in ("dofollow", "do-follow") for x in b["backlink"]):
                ext_links += "; dofollow mentioned"
            selfpromo = "yes (listing your own product is the purpose of the site)" if stype in ("SUBMIT_FORM", "MANUAL") else ("yes (contributor content, editorial rules)" if stype == "ARTICLE" else "unverified")
            if stype == "SUBMIT_FORM":
                if b["state"] == "FORM_URL" and form_in_html and not captcha:
                    xr = "CUSTOM"
                else:
                    xr = "MANUAL_ONLY"
            elif stype in ("ARTICLE", "MANUAL"):
                xr = "MANUAL_ONLY"
        else:
            placement = 3
            stype = "UNVERIFIED"
            vstatus = "UNVERIFIED"
            submit_url = ""
            evidence = h.get("final_url") or ""
            notes.append("no submission mechanism found on homepage or common paths")
            if r.get("register_links"):
                reg_url = r["register_links"][0]
                stype = "COMPANY_PROFILE" if cat == "D" else "MANUAL"
                placement = 10
                vstatus = "PARTIAL"
                notes[-1] = "only account registration found (profile/listing likely after sign-up)"
                xr = "MANUAL_ONLY"
                reg_required = "yes"
        if not reg_url and r.get("register_links") and reg_required != "no":
            reg_url = r["register_links"][0]
        if reg_required == "no":
            reg_url = ""
    # ---------------- quality (0-25)
    fu = h.get("final_url") or ""
    if bp:
        quality = 10
    else:
        quality = 3 if fu.startswith("https") else 1
        tl = h.get("text_len") or 0
        nl = h.get("n_links") or 0
        jsish = h.get("js_app") or (engine in ("Next.js", "SPA", "Nuxt", "SvelteKit", "Framer", "Bubble") and tl < 2000)
        quality += 3 if jsish else (5 if tl > 6000 else 3 if tl > 2500 else 1)
        quality += 4 if nl > 100 else 3 if nl > 50 else 2 if nl > 20 else 0
        quality += 4 if not (h.get("spam_hits")) else (1 if len(h.get("spam_hits")) == 1 else 0)
        quality += 2 if (h.get("title") and h.get("desc")) else (1 if h.get("title") else 0)
        ns = q.get("n_sources", 1) or 1
        quality += forum_q + 2 if cat == "B" else (7 if ns >= 10 else 5 if ns >= 5 else 3 if ns >= 2 else 1)
        if tl < 1500 and nl < 25 and not jsish:
            quality -= 3
        quality = max(0, min(25, quality))
    # ---------------- activity (0-10)
    act = (r.get("activity") or {}).get("last")
    act_src = (r.get("activity") or {}).get("src") or ""
    dd = days_ago(act) if act else None
    activity = 3 if dd is None else 10 if dd <= 30 else 8 if dd <= 90 else 6 if dd <= 180 else 4 if dd <= 365 else 2 if dd <= 730 else 1
    if cat == "B" and dd is not None and dd > 365:
        notes.append("low activity: last post " + act)
    # ---------------- accessibility (0-10)
    fk = free.split(" ")[0]
    access = {"yes": 5, "freemium": 4, "unknown": 3, "paid": 0}.get(fk, 3)
    access += 3 if reg_required == "no" else 1
    access += 2 if not captcha else 1
    access = min(10, access)
    score = relevance + quality + placement + activity + access
    tier = "TIER 1" if score >= 85 else "TIER 2" if score >= 70 else "TIER 3" if score >= 55 else "REJECT"
    lang = (h.get("lang") or "")[:2].lower()
    if (h.get("cyr_ratio") or 0) > 0.3:
        lang = "ru" if lang in ("", "en", "ru") else lang
    if not lang:
        lang = (r.get("lang_hint") or q.get("lang") or "en")[:2]
    host = r.get("final_host") or r["host"]
    homepage = h.get("final_url") or f"https://{r['host']}/"
    if r.get("primary"):
        homepage = f"{urlparse(homepage).scheme}://{urlparse(homepage).hostname}/"
    row = {
        "domain": root if not r.get("redirect_offsite") else (r.get("final_root") or root),
        "homepage_url": homepage,
        "submit_url": submit_url,
        "registration_url": reg_url,
        "category": CAT_NAME[cat],
        "language": lang,
        "country": country_of(host),
        "platform": engine,
        "submission_type": stype,
        "xrumer_compatibility": xr,
        "registration_required": reg_required,
        "free_submission": free,
        "external_links_allowed": ext_links,
        "self_promotion_allowed": selfpromo,
        "moderation_required": moder,
        "last_activity": (act + f" ({act_src})") if act else "N/A",
        "quality_score": score,
        "tier": tier,
        "verification_status": vstatus,
        "verification_date": VDATE,
        "evidence_url": evidence,
        "notes": " | ".join(n for n in notes if n)[:500],
        # internal
        "_cat": cat, "_bp": bp, "_captcha": captcha, "_sub": [relevance, quality, placement, activity, access],
        "_orig_root": root, "_redirect": bool(r.get("redirect_offsite")), "_title": (h.get("title") or "")[:80],
        "_form_in_html": form_in_html, "_n_sources": q.get("n_sources", 1),
    }
    if r.get("redirect_offsite"):
        row["notes"] = (f"redirects from {root} | " + row["notes"])[:500]
    if not bp and cat != "B":
        b_anchor = ""
        b_fields = ""
        for sc in (r.get("submit_checked") or []):
            if sc:
                b_anchor += " " + (sc.get("anchor") or "") + " " + (sc.get("url") or "")
        b_fields = " ".join(str(x) for x in (row["notes"].split("form fields:")[1:2] or [""]))
        dir_ok = bool(DIRWORDS.search(td)) or bool(STRONG_SUBMIT.search(b_anchor)) or bool(LISTING_FIELDS.search(b_fields)) \
            or (stype == "SUBMIT_FORM" and bool(re.search(r"submit|добав|предлож", b_anchor, re.I)))
        if not dir_ok and stype != "ARTICLE":
            return row, ("NOT_A_PLATFORM", "looks like a product/company website, not a listing/publishing platform (title: " + (h.get("title") or "")[:60] + ")")
        if stype == "COMPANY_PROFILE" and not re.search(r"(community|forum|developers|publish|articles|writers|blog|startups?|founders|ecosystem|technopark|hub|directory|catalog|database|network|сообществ|публикац|статьи|стартап|технопарк|каталог|хаб)", td, re.I):
            return row, ("NOT_A_PLATFORM", "sign-up leads to a product account, not a public profile/listing (title: " + (h.get("title") or "")[:60] + ")")
    fl = row["notes"].lower()
    if not bp and re.search(r"(вакансии|vacanc|job board|jobs board|работа за границей|remote jobs|hiring platform)", (h.get("title") or "").lower()):
        return row, ("NOT_SUITABLE", "job board, not a software/product placement platform")
    if not bp and cat != "B" and re.search(r"form fields:[^|]*(podcast|resume|\bcv\b|job title|salary|venue|event date|ticket)", fl):
        return row, ("NOT_SUITABLE", "submission form is for podcasts/jobs/events, not for software products")
    if not bp and cat != "B" and re.search(r"form fields:[^|]*github\.com/(?:owner|user|your|username)", fl):
        return row, ("NOT_SUITABLE", "accepts open-source GitHub projects only")
    if stype == "UNVERIFIED" and not bp:
        return row, ("NO_MECHANISM", "no working placement mechanism found (" + (row["notes"][:100]) + ")")
    if tier == "REJECT":
        if bp:
            return row, ("UNVERIFIABLE_BOT_PROTECTION", "online, but anti-bot challenge blocks automated verification; check manually in a browser")
        return row, ("LOW_SCORE", f"score {score} < 55 [{'/'.join(map(str, row['_sub']))}]: " + row["notes"][:120])
    if free.startswith("paid"):
        return row, ("PAID_ONLY", "submission appears paid-only: " + ", ".join(row["notes"].split(" | ")[:2])[:120])
    return row, None



CAT_CODE = {v: k for k, v in CAT_NAME.items()}


def apply_override(row, r, ov):
    h = (r.get("home") or {}) if r else {}
    if row is None:
        host = (r or {}).get("host") or ""
        row = {"domain": (r or {}).get("root") or host, "homepage_url": h.get("final_url") or f"https://{host}/", "submit_url": "",
               "registration_url": "", "category": "", "language": "ru", "country": country_of(host), "platform": (r or {}).get("platform") or "Custom",
               "submission_type": "", "xrumer_compatibility": "", "registration_required": "", "free_submission": "", "external_links_allowed": "",
               "self_promotion_allowed": "", "moderation_required": "", "last_activity": "N/A", "quality_score": 0, "tier": "",
               "verification_status": "", "verification_date": VDATE, "evidence_url": "", "notes": "",
               "_cat": "D", "_bp": False, "_captcha": False, "_sub": [20, 15, 0, 3, 6], "_orig_root": (r or {}).get("root"), "_redirect": False,
               "_title": (h.get("title") or "")[:80], "_form_in_html": False, "_n_sources": 1}
    for k in ("category", "submission_type", "verification_status", "submit_url", "evidence_url", "registration_required", "free_submission",
              "external_links_allowed", "self_promotion_allowed", "moderation_required", "xrumer_compatibility"):
        if k in ov:
            row[k] = ov[k]
    row["_cat"] = CAT_CODE.get(row["category"], row.get("_cat", "D"))
    sub = list(row.get("_sub") or [20, 15, 0, 3, 6])
    sub[2] = ov.get("placement", sub[2])
    if sub[0] < 18:
        sub[0] = 18
    row["_sub"] = sub
    row["quality_score"] = sum(sub)
    sc = row["quality_score"]
    row["tier"] = "TIER 1" if sc >= 85 else "TIER 2" if sc >= 70 else "TIER 3" if sc >= 55 else "REJECT"
    row["notes"] = ("MANUAL CHECK: " + ov.get("notes", "")).strip()[:500]
    return row


PWHOME = {}


def main():
    os.makedirs(OUT, exist_ok=True)
    for p in load_jsonl(os.path.join(LR, "verify", "pw_home.jsonl")):
        if p.get("host") and not p.get("err"):
            PWHOME[p["host"]] = p
    results = {}
    for r in load_jsonl(os.path.join(LR, "verify", "results.jsonl")):
        results[r["host"]] = r
    for r in load_jsonl(os.path.join(LR, "verify", "results_extra.jsonl")):
        results[r["host"]] = r
    for r in load_jsonl(os.path.join(LR, "verify", "results_snow.jsonl")):
        results.setdefault(r["host"], r)
    for r in load_jsonl(os.path.join(LR, "verify", "results_recheck.jsonl")):
        if r.get("outcome") != "unreachable" and r["host"] in results:
            r["rechecked"] = True
            results[r["host"]] = r
    queue = {q["host"]: q for q in load_jsonl(os.path.join(LR, "verify", "queue.jsonl"))}
    for q in load_jsonl(os.path.join(LR, "verify", "queue_extra.jsonl")):
        queue[q["host"]] = q
    for q in load_jsonl(os.path.join(LR, "verify", "queue_snow2.jsonl")):
        queue.setdefault(q["host"], q)
    pw = {}
    for p in load_jsonl(os.path.join(LR, "verify", "pw_results.jsonl")):
        pw[(p["key"], p["url"])] = p
    for c in load_jsonl(os.path.join(LR, "verify", "pw_home_cands.jsonl")):
        r = results.get(c.get("host"))
        if not r:
            continue
        have = set(x.get("url") for x in (r.get("submit_checked") or []) if x)
        extra = [{"url": u, "final_url": u, "status": None, "forms": [], "anchor": "pw_home"} for u in c["urls"] if u not in have]
        r["submit_checked"] = (r.get("submit_checked") or []) + extra
    ref = set()
    if REF and os.path.exists(REF):
        for line in open(REF, encoding="utf-8"):
            line = line.strip()
            if line:
                u = line if "://" in line else "https://" + line
                ref.add(root_of(urlparse(u).hostname or ""))
    accepted, rejected, paid = {}, [], []
    dup = 0
    ovp = os.path.join(LR, "verify", "manual_overrides.json")
    OVR = json.load(open(ovp, encoding="utf-8")) if os.path.exists(ovp) else {}
    for host, r in results.items():
        q = queue.get(host, {})
        row, rj = evaluate(r, q, pw, None)
        ov = OVR.get(r.get("root"))
        if ov and ov.get("action") == "accept":
            row = apply_override(row, r, ov)
            rj = None if row["tier"] != "REJECT" else ("LOW_SCORE", "override scored below 55")
        elif ov and ov.get("action") == "reject":
            rejected.append({"domain": r.get("root"), "reason_code": ov.get("code", "MANUAL_REJECT"), "reason": "manual check: " + ov.get("reason", ""),
                             "checked_url": f"https://{host}/", "score": ""})
            continue
        if row and row["domain"] in ref:
            rejected.append({"domain": row["domain"], "reason_code": "IN_REFERENCE", "reason": "domain present in reference file", "checked_url": row["homepage_url"]})
            continue
        if rj:
            code, why = rj
            if code == "PAID_ONLY":
                paid.append(row)
                continue
            rejected.append({"domain": (row or {}).get("domain") or r.get("root"), "reason_code": code, "reason": why,
                             "checked_url": (row or {}).get("homepage_url") or f"https://{host}/",
                             "score": (row or {}).get("quality_score", ""), "_row": row})
            continue
        key = row["domain"]
        if key in accepted:
            dup += 1
            other = accepted[key]
            loser, winner = (row, other) if row["quality_score"] <= other["quality_score"] else (other, row)
            accepted[key] = winner
            rejected.append({"domain": loser["_orig_root"], "reason_code": "DUPLICATE", "reason": f"same root/redirect target as {key}", "checked_url": loser["homepage_url"]})
        else:
            accepted[key] = row
    # templated directory networks: >=3 accepted sites with the same normalized title
    def norm_title(r):
        t0 = (r.get("_title") or "").lower()
        brand = (r["domain"].split(".")[0] or "").lower()
        segs = [x.strip() for x in re.split(r"\s[-|—–:·]\s|\s\|\s", t0) if x.strip()]
        segs = [x for x in segs if brand not in x.replace(" ", "").replace("-", "")] or segs
        t = " ".join(segs)
        t = re.sub(r"(20\d\d|january|february|march|april|may|june|july|august|september|october|november|december|\d[\d,.+]*)", " ", t)
        t = re.sub(r"[^a-zа-яё ]+", " ", t)
        t = re.sub(r"^(?:(?:com|net|org|io|ai|app|tools|co|dev|site|xyz|info|pro|best|run|cc|me)\s)+", "", re.sub(r"\s+", " ", t).strip())
        return t[:70]
    groups = collections.defaultdict(list)
    for k, rr in accepted.items():
        nt = norm_title(rr)
        if len(nt) >= 30:
            groups[nt].append(k)
    for nt, ks in groups.items():
        if len(ks) >= 3:
            for k in ks:
                rr = accepted.pop(k)
                rejected.append({"domain": k, "reason_code": "NETWORK", "reason": f"templated directory network ({len(ks)} sites share the title pattern '{nt[:50]}': " + ", ".join(sorted(ks))[:150] + ")",
                                 "checked_url": rr["homepage_url"], "score": rr["quality_score"]})
    rows = sorted(accepted.values(), key=lambda x: (-x["quality_score"], x["domain"]))
    json.dump({"rows": rows, "rejected": [{k: v for k, v in x.items() if k != "_row"} for x in rejected], "paid": paid, "dup": dup},
              open(os.path.join(LR, "out", "build_state.json"), "w"), ensure_ascii=False, default=str)
    print("accepted", len(rows), "rejected", len(rejected), "paid", len(paid), "dup", dup)
    print("tiers", collections.Counter(r["tier"] for r in rows))
    print("cats", collections.Counter(r["category"] for r in rows))
    print("types", collections.Counter(r["submission_type"] for r in rows))
    print("xr", collections.Counter(r["xrumer_compatibility"] for r in rows))
    print("vstatus", collections.Counter(r["verification_status"] for r in rows))
    print("reject codes", collections.Counter(x["reason_code"] for x in rejected))


if __name__ == "__main__":
    main()
