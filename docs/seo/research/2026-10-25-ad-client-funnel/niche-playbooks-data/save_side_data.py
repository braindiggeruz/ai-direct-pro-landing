# Saves the research_keywords, SERP and GSC results of this lens (copied from the tool responses of 2026-10-25,
# because those tools return inline JSON and do not write files). Only the rows used by the lens are kept;
# counts of the dropped rows are recorded.
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))

research = {
  "tool": "research_keywords", "date": "2026-10-25", "location": 2860, "source": "google_ads", "resultLimit": 500,
  "seeds": {
    "как найти клиентов": {
      "rowCount": 144, "rows_volume_10": 42, "rows_zero_or_null": 102,
      "kept": [["как найти клиентов", 10, None, 0.57], ["как искать клиентов", 10, None, None], ["как найти клиентов в инстаграм", 10, None, None],
               ["ищу клиентов", 10, None, 0], ["как найти новых клиентов", 10, None, 0.86], ["как найти первых клиентов", 10, None, 0],
               ["как найти потенциальных клиентов", 10, None, None], ["как находить клиентов", 10, None, None], ["как находить клиентов в инстаграм", 10, None, None],
               ["как находить новых клиентов", 10, None, None], ["найти клиента", 10, None, None], ["поиск и привлечение клиентов", 10, None, 0],
               ["поиск новых клиентов", 10, None, None], ["как найти клиентов в бьюти сфере", 10, None, None], ["как найти клиентов адвокату", 10, None, None],
               ["как найти клиентов в телеграм", 10, None, None], ["как найти клиентов в интернете", 10, None, None], ["как найти покупателей", 10, None, None],
               ["как найти покупателей на товар", 10, None, None], ["как найти клиента на ремонт квартиры", 10, None, None]],
      "note": "The other 10/mo rows are freelancers, B2B outsourcing, accounting, cargo, ceilings; zero rows include every niche variant (salon, autoservice, lawyer, furniture, real estate)."},
    "маркетинговая стратегия": {
      "rowCount": 110, "rows_volume_10_or_more": 62,
      "kept": [["маркетинговая стратегия", 30, None, 0.35], ["маркетинг стратегия", 10, 1.1, 0.43], ["маркетинговые стратегии", 10, 1.1, 0.43],
               ["стратегии маркетинга", 10, 1.58, 0.16], ["разработка маркетинговой стратегии", 10, None, 0], ["маркетинговая стратегия компании", 10, None, 0],
               ["маркетинговая стратегия на год", 10, None, None], ["разработка маркетинговой стратегии цена", 10, None, None],
               ["готовая маркетинговая стратегия", 10, None, None], ["маркетинговые стратегии в туризме", 10, None, None], ["план маркетинга", 10, None, 0]],
      "note": "Everything else is 10/mo textbook phrasing (Kotler, 4P, Zara, Starbucks) or zero."},
    "продвижение ресторана": {
      "rowCount": 19,
      "kept": [["реклама кафе в инстаграм", 40, None, 0], ["продвижение ресторана", 10, None, 0], ["продвижение кафе", 10, None, None],
               ["продвижение кафе в инстаграм", 10, None, None], ["продвижение ресторана в интернете", 10, None, None],
               ["продвижение ресторанного бизнеса", 10, None, None], ["раскрутка ресторана", 10, None, None]],
      "note": "12 rows zero/null, including продвижение ресторана в инстаграм, ведение инстаграма ресторана, раскрутка кафе."}
  }
}
json.dump(research, open(os.path.join(HERE, 'research1_summary.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

serp = {
  "tool": "get_serp_results", "date": "2026-10-25", "location": 2860, "device": "desktop", "depth": 10,
  "queries": {
    "o'quv markazi reklama": {"features": ["video (rank 1)", "ai_overview (rank 2)"],
      "organic_top": ["goldenpages.uz rubric of learning centres (directory)", "youtube.com: how to open a learning centre",
                      "yandex.uz/maps: one learning centre", "youtube.com: blogger on learning-centre teaching system",
                      "infoedu.uz: subsidy for opening a learning centre (08.02.2026)", "schoolup.uz: CRM/LMS for learning centres",
                      "scribd.com: a learning-centre presentation", "yandex.uz/maps: learning centres in Samarkand"],
      "verdict": "weak: no page answers how a learning centre should advertise; owner intent visible (opening, subsidy, CRM)"},
    "go'zallik saloni reklama": {"features": ["ai_overview (rank 1)", "video (rank 3)"],
      "organic_top": ["instagram.com: a salon profile", "instagram.com reel: outdoor-sign printer", "facebook.com: a salon page",
                      "instagram.com reel: salon interior design", "instagram.com reel: a salon", "es.pinterest.com: board «Реклама салон красоты»",
                      "instagram.com reel: a salon", "instagram.com reel: salon / bridal dresses"],
      "verdict": "weak and mixed: consumer salon profiles plus ad-idea boards; no article"},
    "yatt ochish": {"features": ["ai_overview (rank 1)", "video (rank 3)"],
      "organic_top": ["facebook.com/Soliqpressa video", "soliq.uz: taxation of individual entrepreneurs", "buxgalter.uz: 10 steps (2022)",
                      "kadrovik.uz: YaTT Q&A", "facebook.com/Soliqpressa video", "info.dt.uz", "facebook.com/Soliqpressa video",
                      "yaran.uz: YaTT hiring staff (2022)"],
      "verdict": "mixed: official tax site and accounting portals; dated step lists; no page that goes on to the first customers"},
    "бизнес идеи": {"features": ["ai_overview (rank 2)", "people_also_ask", "images"],
      "organic_top": ["moedelo.org (2021)", "ru.wikipedia.org", "alterainvest.ru", "skillzrun.com", "youtube.com", "hf.ru: business in Uzbekistan for Russians",
                      "businessmens.ru"],
      "verdict": "mixed: Russian-market listicles and Wikipedia; one Uzbekistan page (hf.ru) aimed at relocating Russians"}
  }
}
json.dump(serp, open(os.path.join(HERE, 'serp_top.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

gsc = {
  "tool": "get_search_console_performance", "property": "sc-domain:gptbot.uz", "window": "2026-07-22..2026-10-22 (last_3_months)", "cost": "free",
  "query_filters": {
    "contains 'реклам' (query,page)": "106 rows, 0 clicks; no niche query. Biggest: процент рекламы телеграм ... узбекистан 54 imp pos 8.9; контекстная реклама ташкент 59 imp pos 38",
    "contains 'reklam'": "7 rows, 0 clicks; internet reklama / target reklama / zayavka reklama",
    "contains 'маркетинг'": "60 rows, 0 clicks; лид / маркетинг кит / словарь; аудит digital маркетинга 79 imp pos 10.1",
    "contains 'marketing'": "10 rows, 0 clicks; marketing nima 6 imp pos 18",
    "contains 'клиент'": "2 rows: автоматизация заявок клиентов 9 imp, робот для записи клиентов 3 imp",
    "contains 'продаж'": "36 rows, 0 clicks; автоматизация продаж 17 imp pos 15.6; лиды в продажах",
    "contains 'biznes'": "27 rows, all «o'zbekistonda biznes uchun ai bot»",
    "contains 'для' and not 'бот'": "36 rows; niche-marketing traces only: сколько стоит лиды для салона красоты 7 imp pos 26.4; ии для салона красоты 20 imp; лиды для фотографа 1 imp",
    "contains 'markaz' / 'стомат' / 'клиник'": "0 rows each",
    "contains 'salon'": "1 row: salon bot 1 imp"
  },
  "page_filters": {
    "ru ai-bot-dlya-* (3 months)": [["/ru/ai-bot-dlya-salona-krasoty/", 4, 155, 15.3], ["/ru/ai-bot-dlya-yurista/", 0, 93, 4.5], ["/ru/ai-bot-dlya-kliniki/", 2, 73, 17.1],
                                     ["/ru/ai-bot-dlya-horeca/", 1, 60, 7.1], ["/ru/ai-bot-dlya-magazina/", 0, 50, 24.3], ["/ru/ai-bot-dlya-dostavki-edy/", 1, 44, 6.2],
                                     ["/ru/ai-bot-dlya-uchebnogo-tsentra/", 1, 42, 9.6], ["/ru/ai-bot-dlya-agentstva-nedvizhimosti/", 1, 40, 8.8],
                                     ["/ru/ai-bot-dlya-fitnes-kluba/", 0, 24, 7.5], ["/ru/ai-bot-dlya-avtosalona/", 0, 8, 27.1]],
    "uz *-uchun-ai-bot (3 months)": [["/uz/oquv-markazi-uchun-ai-bot/", 2, 15, 8.5], ["/uz/dokon-uchun-ai-bot/", 0, 22, 7.7], ["/uz/salon-uchun-ai-bot/", 0, 10, 2.1],
                                      ["/uz/kochmas-mulk-agentligi-uchun-ai-bot/", 0, 10, 17.8], ["/uz/klinika-uchun-ai-bot/", 0, 7, 7.0], ["/uz/horeca-uchun-ai-bot/", 0, 7, 9.7],
                                      ["/uz/fitnes-klub-uchun-ai-bot/", 0, 7, 16.9], ["/uz/yurist-uchun-ai-bot/", 0, 5, 5.4], ["/uz/avtosalon-uchun-ai-bot/", 0, 3, 5.3]],
    "pages containing 'marketing' (3 months)": [["/ru/blog/chto-takoe-lid-v-marketinge/", 1, 1602, 25.1], ["/ru/blog/kak-provesti-audit-digital-marketinga/", 0, 110, 12.4],
                                                ["/ru/blog/marketingovye-terminy-slovar/", 0, 80, 21.8], ["/ru/blog/chto-takoe-marketing-kit/", 0, 73, 28.9],
                                                ["/ru/blog/plan-digital-marketinga-na-90-dney/", 1, 43, 8.0], ["/ru/digital-marketing-tashkent/", 0, 42, 44.4],
                                                ["/ru/gpt-v-marketinge-smm/", 0, 30, 7.6], ["/uz/blog/marketing-nima/", 0, 28, 19.9]]
  },
  "row_format": "[url, clicks, impressions, avg position]"
}
json.dump(gsc, open(os.path.join(HERE, 'gsc_pulls.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('saved')
