# -*- coding: utf-8 -*-
"""Lens ad-platform-pains (2026-10-25). Builds clusters from measured data.

Sources (all loc 2860, Google Ads data, KD/intent unavailable):
  research1_raw.json   research_keywords, seeds: "реклама в инстаграм", "instagram reklama",
                       "telegram ads", "facebook ads" (resultLimit 500)
  kw_metrics_raw.json  get_keyword_metrics, 307 hand-built candidates
  serp_top.json        get_serp_results x4 (telegram ads, яндекс директ, target yoqish, meta ads)
Run: py -3 compute_clusters.py  (writes computed.json next to this script;
     ../ad-platform-pains.json is assembled from it plus the qualitative fields)

Demand rules
  * One row per Google Ads bucket. Shared buckets (same volume+CPC+competition for
    close variants) are counted once; the variants are listed in `shared`.
  * info = informational share applied to navigational heads:
      0.15 pure navigational (login/tool name, official pages own the SERP)
      0.30 mixed (official page #1 but >=5 of top-10 are guides/articles)
      0.50 confidence haircut on an unverified bucket (see note)
      1.00 everything else
  * Visits/day = D_eff x CTR / 30 x 1.5 x AIO
      CTR pos6 0.61-1.10 %, pos3 3.59 %; AIO discount 0.53-0.655 applied to every
      cluster (AIO seen in 4/4 SERPs fetched here, 30/33 in roadmap-1000).
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "ad-platform-pains.json")

# keyword, volume, cpc, source(m=metrics r=research), info factor, shared-bucket variants
C = {}

C["telegram-ads-diy"] = dict(
    name="Telegram Ads: что это и как запустить из Узбекистана (TON, Fragment, модерация, минимальный CPM)",
    rows=[
        ("telegram ads", 6600, 2.70, "r", 0.30, []),
        ("ads telegram", 1000, 5.19, "r", 0.30, []),
        ("ads telegram org", 880, 4.79, "m", 0.15, []),
        ("телеграм адс", 110, 6.03, "m", 1, []),
        ("telegram ads узбекистан", 40, 2.60, "m", 1, []),
        ("telegram ads platform", 20, 3.14, "m", 1, ["telegram ad platform"]),
        ("telegram ads цена", 10, 2.23, "r", 1, []),
        ("telegram ads стоимость", 10, 1.15, "m", 1, []),
        ("telegram ads минимальный бюджет", 10, None, "m", 1, []),
        ("telegram ads как запустить", 10, 1.63, "m", 1, []),
        ("telegram ads uzbekistan", 10, 2.38, "m", 1, []),
        ("telegram ads ton", 10, 1.71, "m", 1, []),
        ("telegram ads на русском", 10, 2.05, "r", 1, []),
        ("telegram ads что это", 10, None, "r", 1, []),
        ("telegram ads это", 10, None, "r", 1, []),
        ("телеграм ads", 10, 2.14, "r", 1, []),
    ],
    excluded=[("fragment telegram", 1600, 2.18, "mostly usernames/Stars/numbers, not ads"),
              ("toncoin", 480, 4.67, "crypto price intent"), ("ton coin", 260, None, "crypto"),
              ("ton narxi", 210, 0.65, "crypto price"), ("ton sotib olish", 50, 0.69, "crypto purchase")],
)

C["meta-ads-manager-guide"] = dict(
    name="Meta Ads Manager / Business Suite / рекламный кабинет: инструкция на узбекском (и RU)",
    rows=[
        ("ads manager", 9900, 0.24, "m", 0.15, ["adsmanager"]),
        ("meta business suite", 3600, 0.09, "m", 0.15, []),
        ("facebook ads manager", 1300, 0.51, "m", 0.15, ["ads manager facebook", "ads manager fb (r)"]),
        ("facebook ads", 1000, 0.41, "m", 0.30, ["ads fb", "fac ads"]),
        ("business suite", 880, 0.11, "m", 0.15, []),
        ("meta ads manager", 880, 0.24, "m", 0.15, []),
        ("meta ads", 720, 2.19, "m", 0.30, []),
        ("meta business", 390, 0.58, "m", 0.15, []),
        ("business manager", 320, 0.24, "m", 0.15, []),
        ("business facebook com", 320, 1.44, "m", 0.15, []),
        ("адс менеджер", 210, 0.08, "r", 0.15, []),
        ("instagram ads", 90, 1.77, "m", 0.30, []),
        ("business manager facebook", 50, 0.21, "m", 0.30, ["facebook business manager"]),
        ("бизнес менеджер", 40, 0.18, "m", 0.30, []),
        ("instagram ads manager", 40, 1.63, "m", 0.30, []),
        ("meta business suite вход", 40, None, "m", 0.15, []),
        ("адс менеджер фейсбук", 30, 0.67, "r", 1, []),
        ("мета адс", 30, 1.35, "r", 1, []),
        ("ads manager где находится", 20, None, "r", 1, []),
        ("бизнес аккаунт инстаграм", 20, None, "m", 1, []),
        ("рекламный кабинет фейсбук", 10, 1.40, "m", 1, []),
        ("рекламный кабинет инстаграм", 10, None, "m", 1, []),
        ("создание рекламного кабинета фейсбук", 10, None, "r", 1, []),
        ("настройка ads manager", 10, None, "r", 1, []),
        ("фейсбук адс менеджер", 10, 10.89, "r", 1, []),
        ("instagram professional account", 10, 1.93, "m", 1, []),
        ("профессиональный аккаунт инстаграм", 10, None, "m", 1, []),
    ],
    excluded=[("UZ: reklama kabinet / biznes menejer / facebook biznes menejer / reklama kabinet ochish", 0, None, "0 in Google Ads")],
)

C["target-yoqish-diy-uz"] = dict(
    name="Instagramda target yoqish o‘zingiz: qadam-baqadam (UZ, расширение хаба)",
    rows=[
        ("target yoqish", 260, 1.55, "m", 1, []),
        ("instagramda target yoqish", 140, 3.26, "m", 1, []),
        ("instagram target", 50, 4.20, "m", 1, []),
        ("reklama qilish", 20, 1.42, "m", 1, []),
        ("target ads", 20, 2.83, "m", 1, []),
        ("target qilish", 10, None, "m", 1, []),
        ("instagramda target qilish", 10, None, "m", 1, []),
        ("target reklama", 10, 1.56, "m", 1, []),
        ("instagramda reklama berish", 10, None, "m", 1, []),
        ("instagramda reklama qilish", 10, None, "m", 1, ["instagram reklama qilish"]),
        ("reklama berish", 10, 1.09, "m", 1, []),
        ("instagram reklama", 10, 1.16, "m", 1, []),
        ("reklama instagram", 10, None, "m", 1, []),
        ("facebook reklama", 10, 6.80, "m", 1, ["facebook ads reklama (r)"]),
    ],
    excluded=[("target sozlash / target qanday yoqiladi / instagram reklama berish / reklama kabinet ochish", 0, None, "0 in Google Ads"),
              ("targetolog 170, таргетолог 140, таргетолог ташкент 40", 350, 2.47, "hire intent - owned by the hub/RU service page, other lens")],
)

C["target-nima-ctr-uz"] = dict(
    name="«Target nima» / «Таргет нима»: объяснение уже ранжируется на 7-8 месте без кликов (UZ, CTR)",
    rows=[
        ("target nima", 320, 2.80, "m", 1, []),
        ("таргет нима", 50, 1.12, "m", 1, []),
        ("targeting nima", 50, None, "m", 1, []),
    ],
    excluded=[],
)

C["ru-instagram-ads-howto"] = dict(
    name="Как запустить рекламу (таргет) в Instagram из Узбекистана: пошагово (RU)",
    rows=[
        ("таргетинг в инстаграм", 628, None, "m", 0.50, []),  # 12-mo avg; series 10 -> 1300, unverified bucket
        ("таргет в инстаграм", 40, 2.06, "m", 1, []),
        ("таргетированная реклама", 40, 2.43, "m", 1, []),
        ("таргетированной рекламой", 40, 2.43, "r", 1, []),
        ("реклама в инстаграм", 30, 2.41, "m", 1, []),
        ("таргет инстаграм", 20, 4.72, "m", 1, ["таргет инста"]),
        ("как сделать рекламу в инстаграм", 10, 1.19, "m", 1, []),
        ("как настроить рекламу в инстаграм", 10, 1.44, "m", 1, []),
        ("как дать рекламу в инстаграм", 10, 0.41, "m", 1, []),
        ("как запустить рекламу в инстаграм", 10, None, "m", 1, []),
        ("как запустить таргет в инстаграм", 10, 2.81, "m", 1, []),
        ("как настроить таргет в инстаграм", 10, 1.54, "m", 1, []),
        ("настройка таргета в инстаграм", 10, 7.79, "r", 1, []),
        ("настроить таргет", 10, 1.72, "r", 1, []),
        ("запустить таргет в инстаграме", 10, 2.03, "r", 1, []),
        ("настройка рекламы инстаграм", 10, 2.60, "r", 1, []),
        ("таргет инстаграм как запустить", 10, 1.79, "r", 1, []),
        ("запуск таргета через фейсбук", 10, 12.17, "r", 1, []),
        ("продвижение публикации в инстаграм", 10, 3.90, "m", 1, []),
        ("реклама в инстаграм через фейсбук", 10, None, "r", 1, []),
    ],
    excluded=[("таргет", 390, 0.66, "ambiguous head (US retailer, generic word)"),
              ("реклама в инстаграм цена / стоимость ... (many x10)", 0, None, "price intent - price lens")],
)

C["yandex-direct-uz"] = dict(
    name="Яндекс Директ в Узбекистане: как запустить, оплатить, настроить гео (RU)",
    rows=[
        ("яндекс директ", 590, 3.59, "m", 0.30, []),
        ("yandex direct", 390, 5.26, "m", 0.30, []),
        ("yandex reklama", 70, 1.00, "m", 1, []),
        ("яндекс директ узбекистан", 40, 2.58, "m", 1, []),
        ("реклама в яндексе", 10, 4.30, "m", 1, []),
        ("реклама в яндекс директ", 10, None, "m", 1, []),
        ("яндекс директ цена", 10, 6.65, "m", 1, []),
        ("direct яндекс", 10, None, "r", 1, []),
        ("реклама в яндексе цена", 10, None, "r", 1, []),
    ],
    excluded=[("yandex direct uzbekistan / яндекс директ ташкент", 0, None, "0")],
)

C["google-ads-from-uz"] = dict(
    name="Google Ads (и YouTube) из Узбекистана: открыть аккаунт, оплатить, запустить (UZ + RU)",
    rows=[
        ("google ads", 4400, 2.08, "m", 0.15, []),
        ("гугл реклама", 110, 2.82, "m", 1, []),
        ("google реклама", 70, 4.13, "m", 1, []),
        ("google ads вход", 50, 0.49, "m", 0.15, []),
        ("youtube ads", 40, 1.86, "m", 1, []),
        ("google reklama", 30, 3.55, "m", 1, []),
        ("google ads account", 30, 1.03, "m", 0.15, []),
        ("google ads login", 20, 1.18, "m", 0.15, []),
        ("реклама в гугл", 10, 4.83, "m", 1, ["реклама в гугле"]),
        ("реклама в гугл цена", 10, 3.15, "m", 1, []),
        ("google reklama berish", 10, None, "m", 1, []),
        ("youtube reklama", 10, 0.40, "m", 1, []),
        ("youtube реклама", 10, 0.64, "m", 1, []),
        ("реклама на ютубе", 10, None, "m", 1, []),
        ("реклама в поисковике гугл", 10, None, "r", 1, []),
        ("реклама от google", 10, None, "r", 1, []),
        ("товарная реклама гугл", 10, None, "r", 1, []),
    ],
    excluded=[("google ads uzbekistan / google ads o‘zbekistonda / оплата google ads / как оплатить google ads", 0, None, "0 - payment pain has no Google demand")],
)

C["ad-payment-uz"] = dict(
    name="Чем оплатить рекламу Meta / Google / Telegram из Узбекистана (Visa/Mastercard, виртуальные карты, TON)",
    rows=[
        ("как оплатить рекламу в инстаграм", 10, None, "m", 1, []),
        ("оплата рекламы в инстаграм", 10, None, "m", 1, []),
        ("оплата рекламы фейсбук", 10, None, "m", 1, []),
        # card demand: general banking intent, only a small share is about ads -> 0.05
        ("visa karta", 1000, 0.49, "m", 0.05, []),
        ("visa karta ochish", 880, 0.54, "m", 0.05, []),
        ("virtual karta ochish", 390, 0.83, "m", 0.05, []),
        ("uzum visa", 110, 0.58, "m", 0.05, []),
        ("humo visa", 90, 2.32, "m", 0.05, []),
        ("virtual karta", 70, 0.58, "m", 0.05, []),
        ("uzcard visa", 50, 0.58, "m", 0.05, []),
        ("виртуальная карта visa", 40, 0.75, "m", 0.05, []),
        ("virtual visa karta", 20, 0.53, "m", 0.05, []),
        ("visa virtual karta", 20, 0.66, "m", 0.05, []),
        ("humo visa karta", 20, None, "m", 0.05, []),
        ("visa карта узбекистан", 20, 0.65, "m", 0.05, []),
        ("виртуальная карта visa узбекистан", 10, 0.33, "m", 0.05, []),
        ("visa karta qanday ochiladi", 10, None, "m", 0.05, []),
        ("как открыть visa карту в узбекистане", 10, None, "m", 0.05, []),
    ],
    excluded=[("reklama to‘lovi / reklama uchun karta / оплата рекламы uzcard|humo / карта для оплаты рекламы / как оплатить рекламу в фейсбук из узбекистана", 0, None, "0 in Google Ads")],
)

C["meta-troubleshooting"] = dict(
    name="Блокировки, отклонённая реклама, модерация, пиксель и лид-формы Meta: официальные пути (RU + UZ)",
    rows=[
        ("заблокировали рекламу в инстаграм", 10, None, "r", 1, []),
        ("инстаграм заблокировал рекламу", 10, None, "r", 1, []),
        ("инстаграм отклоняет рекламу", 10, None, "r", 1, []),
        ("реклама на рассмотрении инстаграм", 10, None, "r", 1, []),
        ("реклама отключена инстаграм", 10, None, "r", 1, []),
        ("через сколько запускается реклама в инстаграм", 10, None, "r", 1, ["через сколько начинает работать реклама в инстаграм"]),
        ("реклама в инстаграм запрещена", 10, None, "r", 1, []),
        ("рекламный аккаунт отключен", 10, None, "m", 1, []),
        ("инстаграм заблокировал аккаунт", 10, None, "m", 1, ["заблокировали инстаграм", "instagram bloklandi"]),
        ("meta pixel", 20, 0.99, "m", 1, []),
        ("facebook pixel", 10, None, "m", 1, ["facebook piksel"]),
        ("лид форма", 20, None, "m", 1, []),
        ("лид форма фейсбук", 10, None, "m", 1, ["lead ads facebook (r)"]),
        ("instagram lead form", 10, None, "m", 1, []),
    ],
    excluded=[("UZ: reklama kabinet bloklandi / akkaunt bloklandi / reklama rad etildi / piksel o‘rnatish", 0, None, "0"),
              ("RU: заблокировали рекламный кабинет|аккаунт / реклама отклонена / установка пикселя / ограничение рекламы фейсбук", 0, None, "0 or trend 0")],
)

C["telegram-channel-ads-diy"] = dict(
    name="Реклама в чужих Telegram-каналах своими силами: как выбрать канал и не потерять деньги (UZ + RU, расширение)",
    rows=[
        ("telegram reklama", 70, 2.38, "m", 1, []),
        ("реклама в телеграм", 70, 4.65, "m", 1, []),
        ("телеграм реклама", 10, 2.50, "m", 1, []),
        ("telegramda reklama berish", 10, 2.18, "m", 1, []),
        ("реклама в телеграм каналах", 10, 4.19, "m", 1, []),
        ("реклама в телеграм цена", 10, None, "m", 1, []),
        ("реклама на телеграм канале", 10, 4.45, "r", 1, []),
        ("реклама телеграм", 10, 6.26, "r", 1, []),
        ("реклама в ботах телеграм", 10, None, "r", 1, []),
        ("как запустить рекламу в телеграм", 10, None, "m", 1, []),
    ],
    excluded=[("telegram kanalda reklama / telegram kanalga reklama berish / telegram reklama narxi / как дать рекламу в телеграм канале", 0, None, "0")],
)

C["advertising-law-uz"] = dict(
    name="Закон «О рекламе» для онлайн-рекламы бизнеса: нейтральный разбор с lex.uz (UZ + RU)",
    rows=[
        ("reklama to'g'risidagi qonun", 530, None, "m", 0.30, []),  # 12-mo avg; many want the law text (lex.uz)
        ("закон о рекламе узбекистан", 50, None, "m", 0.30, []),
    ],
    excluded=[("reklama qonuni", 0, None, "0")],
)

C["diy-learn-smm-target"] = dict(
    name="Хочу научиться сам: SMM и таргет для владельца бизнеса (UZ), без «курса»",
    rows=[
        ("smm kurslari", 140, 1.09, "m", 1, ["smm kurs"]),
        ("smm o'rganish", 50, 12.03, "m", 1, []),
        ("target kursi", 20, 1.91, "m", 1, []),
        ("target kurs", 10, 4.06, "m", 1, []),
        ("таргетолог курсы", 10, 1.41, "m", 1, []),
        ("курсы таргетолога", 10, 0.42, "m", 1, []),
        ("обучение таргету", 10, 2.29, "m", 1, []),
        ("курсы smm ташкент", 10, 2.07, "m", 1, []),
    ],
    excluded=[("target o‘rganish / targetolog kursi / курсы таргета ташкент", 0, None, "0")],
)


def visits(d):
    k = 1.5 / 30
    return dict(
        pos6=(round(d * 0.0061 * k * 0.53, 2), round(d * 0.0110 * k * 0.655, 2)),
        pos3=(round(d * 0.0359 * k * 0.53, 2), round(d * 0.0359 * k * 0.655, 2)),
    )


out = {}
for cid, c in C.items():
    raw = sum(r[1] for r in c["rows"])
    eff = sum(r[1] * r[4] for r in c["rows"])
    cw = [(r[1] * r[4], r[2]) for r in c["rows"] if r[2] is not None]
    wcpc = round(sum(v * p for v, p in cw) / sum(v for v, _ in cw), 2) if cw else None
    cpcs = [r[2] for r in c["rows"] if r[2] is not None]
    v = visits(eff)
    out[cid] = dict(
        name=c["name"],
        demand_raw=raw,
        demand_effective=round(eff),
        cpc_weighted=wcpc,
        cpc_range=(min(cpcs), max(cpcs)) if cpcs else None,
        visits_day_pos6=v["pos6"],
        visits_day_pos3=v["pos3"],
        rows=[dict(keyword=r[0], volume=r[1], cpc=r[2], source=r[3], info_share=r[4], shared_bucket=r[5]) for r in c["rows"]],
        excluded=[dict(keyword=e[0], volume=e[1], cpc=e[2], why=e[3]) for e in c["excluded"]],
    )

json.dump(out, open(os.path.join(HERE, "computed.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for cid, o in out.items():
    print(f"{cid:28} raw={o['demand_raw']:>6} eff={o['demand_effective']:>5} wcpc={o['cpc_weighted']} "
          f"cpc={o['cpc_range']} pos6={o['visits_day_pos6']} pos3={o['visits_day_pos3']}")
tot = sum(o["demand_effective"] for o in out.values())
print("TOTAL effective", tot, visits(tot))
