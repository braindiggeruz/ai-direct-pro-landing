# Builds ../calculators-utility.json from cu_model.json + qualitative annotations (fit/build/effort/honesty/ramp).
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'calculators-utility.json')
m = json.load(open(os.path.join(HERE, 'cu_model.json'), encoding='utf-8'))
byid = {c['id']: c for c in m['clusters']}

A = {
 'valyuta_kursi_kun': dict(rank=1,
   fit='(a) детерминированная страница на официальном JSON ЦБ (cbu.uz/uz/arkhiv-kursov-valyut/json/ — проверено 25.10, отдаёт Rate/Diff/Date). Модель не нужна. Честно закрывает «курс ЦБ на сегодня»; НЕ закрывает «где купить/продать дешевле» (курсов банков в открытом официальном источнике нет). Бренду не родственно: конверсия в чат ≈ 0.',
   build='/uz/valyuta-kursi/ (все валюты на сегодня) + /uz/valyuta-kursi/dollar|rubl|yevro|tenge|yuan/ + RU /ru/kurs-valyut/, /ru/kurs-dollara/ …; Worker cron раз в день тянет JSON ЦБ → KV → пререндер HTML с датой, изменением и графиком 30 дней (архив ЦБ по дате); schema ExchangeRateSpecification. ~12 страниц UZ/RU.',
   effort='M', honesty_risk='medium',
   honesty_note='Финансовые данные (YMYL-смежно): дата/время и ссылка на cbu.uz на каждой странице, плашка «bankda ayirboshlash kursi farq qiladi», без прогнозов и советов «покупать/ждать». Условия повторного использования данных cbu.uz не проверены — проверить до запуска.',
   realistic='Топ-3 занят банками (ipotekabank, kapitalbank, xb.uz) под currency box — поз. 3 нереальна. Реалистично поз. 10–20 по головам за 3–6 мес. ≈ 115–235 визитов/день (CTR 0,15–0,30 % — общее допущение, не кривая сайта). Ровно такой же продукт dollarkurs.uz стоит на o15.',
   ramp_weeks='Модель (если поз. ~6 достигнута, K1 0,04): 10/день на 3-й нед., 50/день на 7-й. Реально: первые 10/день за 4–8 нед. на хвостах (курс тенге/юаня/воны/лиры, «курс доллара цб»); головы — 6–12 мес. и без гарантии.'),
 'valyuta_konvertor': dict(rank=2,
   fit='(a) тот же движок ЦБ: конвертер пары ↔ UZS с таблицей типовых сумм (1/10/100/1000) и графиком. Честно закрывает «100 usd to uzs», «тенге сум», «юань сум».',
   build='/uz/valyuta-konvertor/ + пары /uz/valyuta-konvertor/usd-uzs|rub-uzs|eur-uzs|kzt-uzs|cny-uzs|krw-uzs|try-uzs/ и RU-зеркала /ru/konverter-valyut/usd-uzs/ … (~16 страниц). Не плодить страницы «на каждую сумму» (doorway).',
   effort='S', honesty_risk='low',
   honesty_note='Чистая арифметика по официальному курсу с датой; та же оговорка о курсах банков. Зависит от кластера 1 (движок, проверка условий cbu.uz).',
   realistic='Выдача: currency box + xe.com, wise.com, vbr.uz, sravni.ru (курс ЦБ РФ!) — у конкурентов нет узбекского интерфейса и курса ЦБ РУз в паре с тенге/юанем. Поз. 6 на парах достижимее, чем на головах кластера 1.',
   ramp_weeks='6 нед. до 10/день, 16 нед. до 50/день (K1 0,04, при поз. ~6); реалистично 6–10 нед. до первых 10/день.'),
 'kalkulyator': dict(rank=3,
   fit='(a) обычный + инженерный калькулятор со скобками, историей и клавиатурой; узбекский интерфейс. Латинские узбекские написания kalkulyator / kalkulator / kalkulyatr ≈ 121 000/мес по Ads — узбекскоязычный спрос без узбекских страниц.',
   build='/uz/kalkulyator/ (oddiy + ilmiy, foiz rejimi) и /ru/kalkulyator/; PWA-офлайн; ссылки на кластеры 12 (foiz/QQS) и 8 (kredit) как режимы одного хаба.',
   effort='S', honesty_risk='low',
   honesty_note='Чистые вычисления. «калькулятор скачать» (намерение приложения) и «калькулятор дробей» (уже в education-practice) не учитывались.',
   realistic='Выдача «калькулятор»: x-calculator.ru, calculator888, ipipip, desmos, calcus, calc.ru + три карточки Google Play; AIO и виджета нет; узбекских страниц нет. SERP по латинским написаниям не снят.',
   ramp_weeks='9 нед. до 10/день, 23 нед. до 50/день (K1 0,04 — сильные русские инструменты).'),
 'pdf_vositalar': dict(rank=4,
   fit='(a) инструменты в браузере (pdf-lib / pdf.js / canvas): JPG/PNG→PDF, объединение, PDF→JPG, сжатие (перекодирование картинок, с потерями), фото 3×4 на лист для печати. Файлы не покидают устройство — честное отличие от iLovePDF/Smallpdf. Аудитория (школьники, документы) совпадает с сайтом.',
   build='/uz/pdf/rasmni-pdf-qilish/, /uz/pdf/birlashtirish/, /uz/pdf/siqish/, /uz/pdf/pdf-dan-jpg/, /uz/rasm/3x4/ + RU /ru/pdf/foto-v-pdf/, /ru/pdf/obedinit/, /ru/pdf/szhat/. Библиотеки грузить лениво.',
   effort='M', honesty_risk='low',
   honesty_note='Не обещать PDF→Word и Word→PDF (110 000 и 49 500 в месяц): без сервера макет не сохраняется. Эти запросы — только в верхней оценке; максимум честный режим «извлечь текст».',
   realistic='SERP не снят (лимит 4). Приор: глобальные бренды держат EN/RU-запросы; узбекские формулировки (rasmni pdf qilish 5 400, pdf siqish 8 100, pdf birlashtirish 6 600) — главный шанс.',
   ramp_weeks='12 нед. до 10/день, 31 нед. до 50/день (K1 0,04); узбекские формулировки, вероятно, быстрее.'),
 'kalendar_2027': dict(rank=5,
   fit='(c)+(a) статичный календарь 2027 с праздниками и официальными выходными Узбекистана, номерами недель, печатью A4, производственным календарём (рабочие дни/часы по месяцам при 40/36/24-часовой неделе) и отсчётом «до Нового года».',
   build='/uz/kalendar-2027/, /ru/kalendar-2027/, /ru/proizvodstvennyy-kalendar-2027-uzbekistan/, /uz/dam-olish-kunlari-2027/, /ru/skolko-dney-do-novogo-goda/. Запуск до 15.11 — к пику дек–янв.',
   effort='S', honesty_risk='low',
   honesty_note='Переносы выходных — только по опубликованному постановлению (lex.uz). До его выхода ставить фиксированные даты, а подвижные помечать «kutilmoqda». Ramazon/Qurbon hayit — только как официальные выходные. Namoz/saharlik taqvimi (taqvim 2026 = 27 100, пик в Рамадан) не строим.',
   realistic='Слабейшая выдача линзы: o1 хорватская страница kalender-365.de, одно и то же Play-приложение на 9 местах (разные hl), Pinterest, timeanddate. Узбекских веб-страниц нет. Поз. 3 реалистична.',
   ramp_weeks='Модель: 13 нед. до 10/день (K1 0,06). Сезонность (дек ×1,49, мар ×1,44) и слабая выдача: при запуске до середины ноября первые 10/день вероятны в декабре (6–8 нед.).'),
 'qr_kod': dict(rank=6,
   fit='(a) генератор QR в браузере: ссылка, текст, Wi-Fi, телефон, SMS, vCard, Telegram; PNG/SVG; опционально сканер камерой (jsQR).',
   build='/uz/qr-kod-yaratish/, /ru/qr-kod-generator/, (опц.) /uz/qr-kod-skaner/.',
   effort='S', honesty_risk='low',
   honesty_note='Не обещать «динамические» QR и статистику сканирований (нужен сервер-редиректор).',
   realistic='o1 stqr.ru, AIO r2, дальше EN/RU-генераторы и Google Play; единственный .uz — webiston.uz на o11 (EN). Узбекских страниц нет.',
   ramp_weeks='13 нед. до 5/день, 19 нед. до 10/день (K1 0,06).'),
 'taymer': dict(rank=7,
   fit='(a) таймер, секундомер, Pomodoro 25/5 для учёбы; звук, полноэкранный режим.',
   build='/uz/taymer/, /uz/sekundomer/, /uz/pomodoro/, /ru/taymer-onlayn/, /ru/sekundomer/.',
   effort='S', honesty_risk='low', honesty_note='Чистый инструмент.',
   realistic='SERP не снят. По «timer», «таймер», «секундомер» Google показывает свой виджет (zero-click), поэтому скидка ×0,533 и на поз. 6.',
   ramp_weeks='19 нед. до 5/день; 10/день при поз. ~6 не достигается (потолок ~11).'),
 'kredit': dict(rank=8,
   fit='(a) нейтральная математика: аннуитет и дифференцированный график, досрочное погашение, депозит со сложным процентом; суммы в UZS.',
   build='/uz/kredit-kalkulyator/, /uz/ipoteka-kalkulyator/, /uz/omonat-kalkulyator/, /ru/kreditnyy-kalkulyator/, /ru/ipotechnyy-kalkulyator/ (режимы хаба /uz/kalkulyator/).',
   effort='S', honesty_risk='medium',
   honesty_note='Финансовый YMYL: только формула и график платежей, без ставок и предложений банков, без советов. Плашка «bank shartlari farq qiladi».',
   realistic='SERP не снят. Приор: калькуляторы банков, bank.uz, depozit.uz (уже o3 по «dollar kursi»), vbr.uz — сильная выдача.',
   ramp_weeks='20 нед. до 5/день, 30 нед. до 10/день (K1 0,04).'),
 'imt_bmi': dict(rank=9,
   fit='(a) BMI = кг/м² и категории ВОЗ для взрослых, без советов по похудению.',
   build='/uz/imt-kalkulyator/ (tana massasi indeksi), /ru/kalkulyator-imt/.',
   effort='S', honesty_risk='medium',
   honesty_note='Медицинский YMYL: только формула, категории ВОЗ со ссылкой, «18+», «shifokorga murojaat qiling». Калории — только с весом 0,5. Калькуляторы беременности и овуляции (3 600 + 1 000 + 720) исключены.',
   realistic='SERP не снят; на health-запросах AIO вероятен (×0,533). Всплески мар–май (×2,1) — причина не проверена.',
   ramp_weeks='19 нед. до 5/день (K1 0,06).'),
 'summa_propisyu': dict(rank=10,
   fit='(a) число прописью: RU (сум/тийин со склонениями), узбекская латиница и кириллица (so‘m/tiyin), EN. Нужно для счетов, актов и заявлений и связано с действующими гайдами (ariza, rasmiy xat, dalolatnoma).',
   build='/ru/summa-propisyu/ (с узбекским режимом), /uz/summani-soz-bilan-yozish/.',
   effort='S', honesty_risk='low', honesty_note='Чистое преобразование.',
   realistic='SERP не снят. Приор: сильные русские инструменты, но ни один не пишет сумму по-узбекски и в сумах.',
   ramp_weeks='21 нед. до 5/день (K1 0,06).'),
 'tez_yozish': dict(rank=11,
   fit='(a)+(c) тренажёр слепой печати на оригинальных узбекских текстах с правильными oʻ/gʻ (U+02BB) и тест скорости (WPM). Отдельная страница «как набрать oʻ, gʻ, ʼ на Windows, Android, iOS». Самый «родной» бренду кластер линзы.',
   build='/uz/tez-yozish/ (trenajyor), /uz/tez-yozish/test/, /uz/ozbek-klaviaturasi/, /ru/klaviaturnyy-trenazher/.',
   effort='M', honesty_risk='low',
   honesty_note='Тексты — свои или из общественного достояния.',
   realistic='SERP не снят. Приор: monkeytype, 10fastfingers, typing.com (EN), klava.org (RU). Узбекский «tez yozish» не проверен. «узбекская клавиатура» растёт (90 → 2 400/мес), но взята по полу 90 (правило скачка) — реальный потенциал выше.',
   ramp_weeks='21 нед. до 5/день (K1 0,06).'),
 'foiz_qqs': dict(rank=12,
   fit='(a) режимы процентов (X % от Y; сколько % X от Y; изменение; скидка), НДС 12 % (начислить/выделить), пошаговое объяснение для школьников.',
   build='/uz/foiz-hisoblash/, /uz/qqs-kalkulyator/, /ru/kalkulyator-procentov/, /ru/kalkulyator-nds/ — режимы хаба /uz/kalkulyator/.',
   effort='S', honesty_risk='low',
   honesty_note='Ставку QQS указать с датой и ссылкой на Налоговый кодекс; сверить актуальность на 2027 перед публикацией.',
   realistic='SERP не снят. RU-калькуляторы сильны; узбекские «foiz chiqarish» (1 600) и «foiz chiqarish formulasi» (880, рост) — вероятно, YouTube и блоги.',
   ramp_weeks='24 нед. до 5/день (K1 0,06).'),
}

clusters = []
for cid, a in sorted(A.items(), key=lambda x: x[1]['rank']):
    c = byid[cid]
    kw_str = '; '.join(
        f"{e['keyword']} {e['volume']:,}".replace(',', ' ') +
        (f" (= {', '.join(e['same_bucket_as'])})" if e['same_bucket_as'] else '') +
        (f" ×{e['weight']}" if e['weight'] != 1 else '') + (' [пол скачка]' if e['jump_floor'] else '')
        for e in c['keywords'][:14])
    clusters.append({
        'rank': a['rank'], 'id': cid, 'name': c['name'], 'keywords': kw_str, 'keywords_full': c['keywords'],
        'high_only': c['high_only'], 'excluded': c['excluded'], 'not_measured_or_shared_bucket': c['missing_or_shared'],
        'demand_month': c['demand_month_low'], 'demand_month_high': c['demand_month_high'],
        'seasonality': c['seasonality'], 'seasonality_index': c['seasonality_index'],
        'serp': c['serp_source'], 'serp_weakness': c['serp_weakness'], 'realistic_position_note': a['realistic'],
        'aio_or_answer_box_discount_pos3': c['aio_discount_top3'], 'answer_box_discount_pos6': c['answer_box_discount_pos6'],
        'fit': a['fit'], 'build': a['build'], 'effort': a['effort'], 'honesty_risk': a['honesty_risk'], 'honesty_note': a['honesty_note'],
        'visits_day_pos6': c['visits_day_pos6'], 'visits_day_pos6_high_demand': c['visits_day_pos6_high_demand'],
        'visits_day_pos3': c['visits_day_pos3'], 'visits_day_pos3_high_demand': c['visits_day_pos3_high_demand'],
        'visits_day_pos3_no_discount': c['visits_day_pos3_no_aio'], 'ramp': c['ramp'], 'ramp_weeks': a['ramp_weeks'],
        'note': c['note'],
    })

below = []
for cid in ['pochta_indeksi', 'muchal', 'vaqt', 'bhm_mrot', 'birliklar', 'sana_yosh', 'parol', 'oylik_soliq']:
    c = byid[cid]
    below.append({'id': cid, 'name': c['name'], 'demand_month': c['demand_month_low'], 'demand_month_high': c['demand_month_high'],
                  'visits_day_pos6': c['visits_day_pos6'], 'visits_day_pos3': c['visits_day_pos3'],
                  'top_keywords': [(e['keyword'], e['volume']) for e in c['keywords'][:6]]})

doc = {
 'lens': 'calculators-utility',
 'date': '2026-10-25',
 'market': 'Google Uzbekistan (location 2860), Google Ads volumes (12-month mean Oct 2025 – Sep 2026)',
 'model': {
  'visits_formula': 'demand × CTR × discount / 30 × 1.5',
  'ctr_pos6': [0.00613, 0.01105], 'ctr_pos3': 0.03593,
  'discount': {'aio_r1_or_answer_box': 0.533, 'aio_lower_or_serp_not_taken': 0.655,
               'pos6_answer_box': 'currency box / timer / unit widget answer the query in the SERP, so ×0.533 is also applied at pos 6 for those clusters'},
  'dedup': 'same volume + same 12-month series (vol ≥ 100) = one Ads bucket, also across clusters; weights 0.5 for ambiguous heads/misspellings, 0.3 for news-driven «dam olish kunlari»; jump-shaped keys (Jul–Sep 2026 ≥ 5× Oct–Nov 2025, vol ≥ 500; year-labelled phrases exempt) taken at the Oct–Nov 2025 floor',
  'demand_month': 'conservative (weights + floors); demand_month_high = all distinct phrases incl. heads and excluded-from-low intents (pdf to word etc.)',
  'ramp': 'share of pos-6 forecast in month n = min(1, K1·n^1.6); K1 0.04 strong SERP, 0.06 tools/static on weak or mixed SERP (same as education-practice / text-tools lenses); assumes pos ~6 is reached at all',
  'year_phrases': '«2026» phrases are the demand forecast for «2027» pages; «2026» and «2027» are never summed'
 },
 'credits': {'cap': 600, 'own_estimate': 228,
             'calls': 'get_keyword_metrics ×2 (667 + 330 keywords, ~104 each), get_serp_results 1 call × 4 queries (~20); research_keywords not used (useless for 2860 per prior notes)',
             'whoami': [18834, 18502, 18398], 'note': 'the first window (−332) includes parallel lenses; the second (−104) was this lens only'},
 'reused_not_rebought': ['kalkulyator 40 500 (ad-client-funnel/prices-tools kw1)', 'сумма прописью 12 100, калькулятор процентов 1 300, процент от числа 720, foiz hisoblash 720, foiz kalkulyator 260, olchov birliklari 590 (education-practice ep_kw1)', 'oylik hisoblash, стаж/зарплата/налог калькуляторы (docs-career dc_kw1)'],
 'totals_top12': m['totals_top'],
 'totals_top12_without_currency': m['totals_top_without_currency'],
 'currency_realistic_note': 'pos 10–20 within 3–6 months: cluster 1 ≈ 115–235, both currency clusters ≈ 145–290 visits/day (generic CTR 0.15–0.30 % × currency-box 0.533, not the site curve); pos 3 on heads is not realistic (banks + currency box)',
 'clusters': clusters,
 'below_cut': below,
 'not_built_by_rule': ['homiladorlik / ovulyatsiya / ПДР калькуляторы (медицинский YMYL)', 'taqvim 2026 / hijriy taqvim / namoz vaqtlari (религиозный график)',
                       'прогноз курса, «где выгоднее купить доллар» (финсовет, нет официальных данных банков)', 'PDF→Word / Word→PDF как полноценная конверсия (нечестно без сервера)',
                       'burjlar 14 800 (гороскопы)', 'Unicode/apostrophe fixer как отдельная страница: apostrof 40, ozbek apostrof 0 — спроса нет, хватает действующего конвертера'],
}
json.dump(doc, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('written', OUT, len(clusters), 'clusters')
for c in clusters:
    print(c['rank'], c['id'], c['demand_month'], c['visits_day_pos6'], c['visits_day_pos3'])
