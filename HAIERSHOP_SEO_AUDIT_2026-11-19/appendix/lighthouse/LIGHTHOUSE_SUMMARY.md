# Lighthouse 12.6.1 — mobile, lab (local via proxy), single run per type, 2026-11-19

> No CrUX/field data (PSI API 429). Use mechanisms, not absolute seconds.

| type | url | perf | FCP | LCP | TBT | CLS | SI | requests | transfer KB | LCP element |
|---|---|---|---|---|---|---|---|---|---|---|
| home | https://haiershop.uz/ru | 0.14 | 2.6 s | 14.7 s | 4,130 ms | 0.487 | 6.6 s | 137 | 2718 | `<img loading="eager" src="/sites/default/files/styles/mobilnoe_razreshenie_520x260/public/` |
| category | https://haiershop.uz/ru/otopitelnoe-oborudovanie | 0.43 | 2.5 s | 6.2 s | 2,210 ms | 0.001 | 5.0 s | 95 | 2019 | `<img loading="lazy" src="/sites/default/files/styles/large/public/products/COZY%20208_0.pn` |
| product | https://haiershop.uz/ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-proline-s-224 | 0.28 | 2.5 s | 15.8 s | 2,270 ms | 0.185 | 7.3 s | 115 | 2339 | `<div data-thumb="/sites/default/files/styles/owlcarousel2_navigation/public/products/1_2_4` |
| blog | https://haiershop.uz/ru/blog/skolko-elektrichestva-potreblyaet-kondicioner-za-1-chas-kalkulyator-kvtch-ponyatnyy-gid | 0.46 | 2.9 s | 4.8 s | 2,020 ms | 0 | 5.2 s | 78 | 1954 | `<h1 style="color:#fff;font-size:32px;line-height:1.3;margin:0 0 15px 0;">` |

Third-party (each page): Google Tag Manager ~782 KB, Jivochat ~366 KB, Facebook ~211 KB, Yandex Metrica ~110 KB; main-thread blocking by 3rd parties 2.2–3.8 s.