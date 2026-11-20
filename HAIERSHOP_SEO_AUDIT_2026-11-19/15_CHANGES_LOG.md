# 15 — Журнал изменений на сайте haiershop.uz

**Кто:** Claude, через JSON:API сайта, под отдельной служебной учётной записью для SEO-правок. Учётную запись создал разработчик по ТЗ (файл 13).

**Когда:** 20.11.2026, 08:28–08:37 UTC (13:28–13:37 по Ташкенту).

**Итого:** 26 правок, все с ответом HTTP 200, откатов не было.

| Что исправлено | Правок |
|---|---|
| Товар, скрытый от Google директивой `unavailable_after` | 1 |
| Ответ AI-ассистента в meta description | 1 |
| Canonical страницы сертификатов вёл на 404 (RU и UZ) | 2 |
| Чужая или ошибочная модель в метатегах и названиях | 7 |
| Расхождения характеристик RU↔UZ (пустые или ошибочные значения) | 14 |
| Русское название товара на UZ-странице | 1 |

**Предусловия:**
- бэкап базы сделан (подтвердил владелец);
- в Pathauto «Действие при обновлении» = «Ничего не делать. Оставить старый синоним нетронутым» (скриншот владельца), поэтому сохранение не меняет адреса.

**Как делалась каждая правка (скрипт `changes/execute.py`):**
1. Проверка, что значение поля и дата последнего изменения объекта совпадают с записанными в плане. Так исключается одновременная правка кем-то другим.
2. Изменение **одного поля одной языковой версии**.
3. Повторное чтение и проверки:
   - новое значение сохранено;
   - **адрес (alias) не изменился**;
   - язык не изменился;
   - вторая языковая версия не тронута;
   - итоговые метатеги (robots, description, canonical) соответствуют плану.
4. При любой проблеме скрипт сам возвращает старое значение. Ни разу не понадобилось.

**Как откатить любую правку:**
- **Что вернуть.** Значение из колонки «Было». Длинные значения в таблице сокращены; полные лежат в планах `changes/wave1_plan.json`, `wave2a_plan.json`, `wave2b_plan.json`, `wave2c_plan.json` (поле `old`).
- **Как вернуть.** В админке Drupal открыть товар или страницу на нужном языке и исправить поле. Второй способ — PATCH через JSON:API.
- **Полные копии объектов.** Для правок 1–11 сохранены полные копии на момент перед правкой: `changes/snapshots/`.
- **Копии объектов, которые не менялись.** В той же папке лежат копии, сделанные заранее:
  - страница возврата и 6 категорий — под тексты из файла 14;
  - кассетный кондиционер AB71 — проверялся, но изменения не потребовались.

Время — UTC, 20.11.2026.

| # | Время | Страница | Что и почему | Было → Стало | HTTP | Проблемы |
|---|---|---|---|---|---|---|
| 1 | 08:28:50 | `/ru/promyshlennye-kondicionery/kanalnyy-kondicioner-haier-ab71s1lg1fa1u71s1lr1fa-r32` | HS-03: товар был скрыт от Google директивой `unavailable_after:2025-03-01`; директива убрана, действуют общие настройки товара | `robots`: «index, follow, unavailable_after:2025-03-01» → «(удалено)» | 200 | — |
| 2 | 08:29:09 | `/ru/teplovye-nasosy/otopitelnoe-oborudovanie/teplovoy-nasos-haier-hpm08-nd2` | HS-27: в meta description попал ответ AI-ассистента (1 016 знаков); заменён на нормальное описание (166 знаков, факты из анонса и UZ-версии) | `description`: «Я проанализировал данные по тепловому насосу Haier HPM08-Nd2 (и серии HPM-Nd2). Это высокоэффективный, совреме…» → «Купите инверторный тепловой насос Haier HPM08-Nd2 (R290, A+++) для отопления, охлаждения и ГВС в Ташкенте. Выс…» | 200 | — |
| 3 | 08:29:26 | `/uz/sifat-sertifikatlari-va-ozbekistondagi-haier-rasmiy-kafolati` | HS-08: canonical указывал на несуществующую страницу (404); убран, страница теперь каноническая сама для себя | `canonical_url`: «https://haiershop.uz/ru/sertifikaty-i-garantiya» → «(удалено)»; `original_source`: «https://haiershop.uz/ru/sertifikaty-i-garantiya» → «(удалено)»; `robots`: «index, follow, max-snippet:1, max-video-preview:1, max-image-preview:large» → «index, follow, max-image-preview:large» | 200 | — |
| 4 | 08:29:42 | `/ru/sertifikaty-kachestva-i-oficialnaya-garantiya-haier-v-uzbekistane` | HS-08: то же для RU-версии | `canonical_url`: «https://haiershop.uz/ru/sertifikaty-i-garantiya» → «(удалено)»; `original_source`: «https://haiershop.uz/ru/sertifikaty-i-garantiya» → «(удалено)»; `robots`: «index, follow, max-snippet:1, max-video-preview:1, max-image-preview:large» → «index, follow, max-image-preview:large» | 200 | — |
| 5 | 08:32:45 | `/ru/vodonagrevateli/boylery-kosvennogo-nagreva/boyler-kosvennogo-nagreva-haier-wt150v-sca3eeu` | HS-06: опечатка в модели SCAE → SCA3E (артикул WT150V-SCA3E(EU)) | `abstract`: «Профессиональный бойлер Haier WT150V-SCAE(EU) на 150 литров со змеевиком 1.5 м². Энергоэффективность ERP C, ТЭ…» → «Профессиональный бойлер Haier WT150V-SCA3E(EU) на 150 литров со змеевиком 1.5 м². Энергоэффективность ERP C, Т…»; `description`: «Купите бойлер Haier WT150V-SCAE(EU) для тепловых насосов в Ташкенте. Объем 150л, змеевик 1.5 м², ТЭН 2.5 кВт. …» → «Купите бойлер Haier WT150V-SCA3E(EU) для тепловых насосов в Ташкенте. Объем 150л, змеевик 1.5 м², ТЭН 2.5 кВт.…»; `keywords`: «Haier WT150V-SCAE(EU), бойлер косвенного нагрева 150 литров, купить бойлер для теплового насоса Ташкент, водон…» → «Haier WT150V-SCA3E(EU), бойлер косвенного нагрева 150 литров, купить бойлер для теплового насоса Ташкент, водо…»; `title`: «Бойлер косвенного нагрева Haier WT150V-SCAE(EU) 150л \| Haiershop.uz» → «Бойлер косвенного нагрева Haier WT150V-SCA3E(EU) 150л \| Haiershop.uz» | 200 | — |
| 6 | 08:32:51 | `/uz/suv-isitgichlar/bilvosita-isitish-boylerlari/bilvosita-isitishli-boyler-haier-wt150v-sca3eeu` | HS-06: то же для UZ-версии | `abstract`: «Professional Haier WT150V-SCAE(EU) 150 litrli boyler. 1.5 m² issiqlik almashinuvchisi, ERP C klassi, 2500 Vt T…» → «Professional Haier WT150V-SCA3E(EU) 150 litrli boyler. 1.5 m² issiqlik almashinuvchisi, ERP C klassi, 2500 Vt …»; `description`: «Toshkentda issiqlik nasoslari uchun Haier WT150V-SCAE(EU) boylerini sotib oling. 150l hajm, 1.5 m² zmeevik, 2.…» → «Toshkentda issiqlik nasoslari uchun Haier WT150V-SCA3E(EU) boylerini sotib oling. 150l hajm, 1.5 m² zmeevik, 2…»; `keywords`: «Haier WT150V-SCAE(EU), bilvosita isitish boyleri 150 litr, issiqlik nasosi uchun boyler Toshkent, zmeevikli su…» → «Haier WT150V-SCA3E(EU), bilvosita isitish boyleri 150 litr, issiqlik nasosi uchun boyler Toshkent, zmeevikli s…»; `title`: «Haier WT150V-SCAE(EU) bilvosita isitish boyleri 150l \| Haiershop.uz» → «Haier WT150V-SCA3E(EU) bilvosita isitish boyleri 150l \| Haiershop.uz» | 200 | — |
| 7 | 08:32:58 | `/ru/posudomoechnye-mashiny/posudomoechnaya-mashina-haier-hdwe15-58cs2ru` | HS-06: чужая модель WE2RU → CS2RU (артикул HDWE15-58CS2RU) | `description`: «Мощная посудомоечная машина Haier HDWE15-58WE2RU 60 см на 15 комплектов. Умная сушка с автооткрытием дверцы, р…» → «Мощная посудомоечная машина Haier HDWE15-58CS2RU 60 см на 15 комплектов. Умная сушка с автооткрытием дверцы, р…»; `keywords`: «посудомоечная машина купить ташкент, посудомойка купить ташкент, посудомоечная машина Haier HDWE15-58WE2RU, ку…» → «посудомоечная машина купить ташкент, посудомойка купить ташкент, посудомоечная машина Haier HDWE15-58CS2RU, ку…»; `title`: «Посудомоечная машина Haier HDWE15-58WE2RU 60см купить в Ташкенте \| Haiershop» → «Посудомоечная машина Haier HDWE15-58CS2RU 60см купить в Ташкенте \| Haiershop» | 200 | — |
| 8 | 08:33:04 | `/uz/idish-yuvish-mashinalar/kir-yuvish-mashinasi-haier-hdwe15-58cs2ru` | HS-06: то же для UZ-версии | `description`: «Kuchli Haier HDWE15-58WE2RU 60 sm 15 komplektli idish yuvish mashinasi. Aqlli quritish (eshik avtomatik ochila…» → «Kuchli Haier HDWE15-58CS2RU 60 sm 15 komplektli idish yuvish mashinasi. Aqlli quritish (eshik avtomatik ochila…»; `keywords`: «kir yuvish mashinasi sotib olish toshkentda, Haier HDWE15-58WE2RU idish yuvish mashinasi, 60 sm idish yuvish m…» → «kir yuvish mashinasi sotib olish toshkentda, Haier HDWE15-58CS2RU idish yuvish mashinasi, 60 sm idish yuvish m…»; `title`: «Haier HDWE15-58WE2RU 60sm idish yuvish mashinasi Toshkentda sotib olish \| Haiershop» → «Haier HDWE15-58CS2RU 60sm idish yuvish mashinasi Toshkentda sotib olish \| Haiershop» | 200 | — |
| 9 | 08:33:10 | `/uz/idish-yuvish-mashinalar/kir-yuvish-mashinasi-haier-hdwe15-58cs2ru` | HS-06: посудомоечная машина в UZ-названии была «стиральной» | `title`: «Kir yuvish mashinasi Haier HDWE15-58CS2RU» → «Idish yuvish mashinasi Haier HDWE15-58CS2RU» | 200 | — |
| 10 | 08:33:16 | `/ru/promyshlennye-kondicionery-vrf-sistemy/kanalnye-vnutrennie-bloki-vrf/kanalnyy-srednenapornyy` | HS-06: в title стояла чужая модель AD122MJERAB 3.6 кВт; товар — AD092MJERAB 2.8 кВт | `title`: «VRF блок Haier AD122MJERAB 3.6 кВт канальный с гарантией 3 года» → «VRF блок Haier AD092MJERAB 2.8 кВт канальный с гарантией 3 года» | 200 | — |
| 11 | 08:33:23 | `/ru/promyshlennye-kondicionery-vrf-sistemy/kanalnye-vnutrennie-bloki-vrf/kanalnyy-srednenapornyy-4` | HS-06: title от модели AD282MJERAB; товар — AD182MJERAB 5.6 кВт (формат как у соседних товаров) | `title`: «VRF блок Haier AD282MJERAB для гостиниц с картой доступа и подмесом» → «VRF блок канальный Haier AD182MJERAB 5.6 кВт средненапорный \| Haiershop» | 200 | — |
| 12 | 08:35:09 | `/uz/isitish-uskunalari/elektr-qozonlari/elektr-qozon-haier-cozy-208` | HS-06: в размерах UZ потеряна цифра; значение из RU | `field_gabaritnye_razmery_v_x_sh_`: «375 x 24 x 686» → «375 x 243 x 686» | 200 | — |
| 13 | 08:35:16 | `/uz/kir-yuvish-mashinalari/kir-yuvish-mashinasi-haier-hw90-b14979s` | HS-06: макс. скорость отжима в UZ пустая; значение из RU | `field_maksimalnaya_skorost_otzhi`: «null» → «1400» | 200 | — |
| 14 | 08:35:22 | `/ru/stiralnye-mashiny/stiralnaya-mashina-haier-hw90-b14979s` | HS-06: загрузка (кг) в RU пустая; значение из UZ | `field_zagruzka_kg_stirka_`: «null» → «9» | 200 | — |
| 15 | 08:35:28 | `/uz/issiqlik-nasosi/fankoyllar/kanalli-fankoyl-haier-fce-102bcb2b` | HS-06: в UZ 8874 вместо 8.874 кВт; значение из RU | `field_obogrev_60degc_vhod_vody_k`: «8874» → «8.874» | 200 | — |
| 16 | 08:35:34 | `/uz/issiqlik-nasosi/fankoyllar/kanalli-fankoyl-haier-fce-102bcb2b` | HS-06: в UZ 5580 вместо 5.58 кВт; значение из RU | `field_ohlazhdenie_kvt`: «5580» → «5.58» | 200 | — |
| 17 | 08:35:40 | `/uz/isitish-uskunalari/devorga-ornatiladigan-gazli-qozon-haier-greenline-130-ti` | HS-06: КПД в UZ пустой; значение из RU | `field_temperaturnyy_kpd_`: «null» → «105» | 200 | — |
| 18 | 08:35:46 | `/uz/konditsionerlar/konditsioner-inverter-as18idhhra-w1u18idhfra-isitish-elementi-bilan` | HS-06: в поле «модель» UZ стояла производительность; значение из RU | `field_nazvanie_modeli`: «17100/21535» → «AS18IDHHRA-W/1U18IDHFRA» | 200 | — |
| 19 | 08:35:52 | `/uz/konditsionerlar/konditsioner-inverter-as18idhhra-w1u18idhfra-isitish-elementi-bilan` | HS-06: площадь (м²) в UZ пустая; значение из RU | `field_ploschad_m2`: «null» → «50» | 200 | — |
| 20 | 08:35:59 | `/uz/konditsionerlar/konditsioner-inverter-as18idhhra-w1u18idhfra-isitish-elementi-bilan` | HS-06: производительность (BTU) в UZ пустая; значение из RU | `field_proizvoditelnost_btu`: «null» → «17100/21535» | 200 | — |
| 21 | 08:36:05 | `/uz/konditsionerlar/konditsioner-inverter-haier-heat-gold-as12idhhra-g11u12idhfra-g1` | HS-06: электропитание в UZ пустое; значение из RU | `field_elektropitanie_f_v_gc_`: «null» → «1 / 220 / 50» | 200 | — |
| 22 | 08:36:11 | `/uz/konditsionerlar/konditsioner-inverter-haier-coral-plus-as35phc1hra1u35phc1fra` | HS-06: электропитание в UZ пустое; значение из RU | `field_elektropitanie_f_v_gc_`: «null» → «1/220/50» | 200 | — |
| 23 | 08:36:17 | `/ru/promyshlennye-kondicionery/napolno-potolochnyy-kondicioner-haier-ac71s1lg1fa-r321u71s1lr1fa-r32` | HS-06: электропитание в RU пустое; значение из UZ | `field_elektropitanie_f_v_gc_`: «null» → «1/220/50» | 200 | — |
| 24 | 08:36:23 | `/uz/suv-isitgichlar/suv-isitgich-haier-es80v-a5` | HS-06: номинальное давление в UZ пустое; значение из RU | `field_nominalnoe_davlenie_mpa_`: «null» → «0.8» | 200 | — |
| 25 | 08:36:29 | `/uz/suv-isitgichlar/suv-isitgich-haier-es10v-sqm2` | HS-06: давление в UZ 8 МПа вместо 0.8; значение из RU | `field_nominalnoe_davlenie_mpa_`: «8» → «0.8» | 200 | — |
| 26 | 08:37:07 | `/uz/isitish-uskunalari/gazovyy-kotel-haier-greenline-126-ti` | HS-20: на UZ-странице было русское название товара; переведено на узбекский | `title`: «Газовый котел Haier GreenLine 1.26 Ti» → «Gazli qozon Haier GreenLine 1.26 Ti» | 200 | — |

**Что ещё не сделано и почему:**
- **Новые тексты** ждут вашего утверждения: страница возврата, «muzlatgich», описания категорий, раздел о двухконтурных котлах. Черновики — `14_TEXT_DRAFTS_FOR_APPROVAL.md`.
- **Шаблоны и настройки** — работа разработчика по `13_DEVELOPER_TZ.md`: фиктивный рейтинг, JSON-LD возврата и доставки, редиректы, карта сайта и другое.
- **Спорные характеристики.** Их нельзя исправить без даташита Haier:
  - AC160S1LK1FA — охлаждение и обогрев: в UZ 15 500/16 000 Вт, в RU 14 000/15 000;
  - Coral Plus AS35 — расход воздуха: 600 или 650 м³/ч;
  - AS12 Heat Gold и Cabinet Inverter — уровень шума: в UZ одинаковое «20/22/23» у двух разных моделей;
  - VRF, высоконапорный блок — обогрев: в UZ 8 кВт, в RU 9 кВт;
  - AC160 в UZ — в поле «рабочий ток» стоит «380/50», то есть напряжение, а не ток.

**Когда изменения станут видны.**
- **Посетители** могут увидеть изменения с задержкой до 24 часов из-за кэша nginx.
- **Google** учтёт их после повторного обхода страниц, обычно через несколько дней.
- **Финальная анонимная проверка HTML** («глазами Google») — после того как учётные данные API будут удалены из окружения Claude. Пока они там сохранены, сайт отвечает Claude кодом 403 на обычных страницах, потому что Drupal не принимает этот способ входа на HTML-маршрутах. На посетителей и Google это не влияет.
