# Content correction evidence — 2026-11-07

Baseline: `421ac0dfb5f07c6ddf568cb77362f204faac8cc2`.

This patch corrects the two converter guides, the Uzbek manual slide guide, and contextual document links. It does not change the transliteration algorithm, tool controls, page headings, search metadata or keyword ownership. No commit, deployment or protected-page baseline update was performed by this content task.

## Alphabet source and scope

Live primary-source review on 2026-11-07:

- [LexUZ, Law 931-XII, current Article 1 and alphabet table](https://www.lex.uz/docs/-112286): 26 letters and three combinations; the table includes Sh, Ch and Ng. The guides and FAQs now use that count. The example `tong — тонг` is included in both tables. Tutuq is shown as a separate final row, so each display table has 30 rows.
- [LexUZ, Law O‘RQ-1184](https://lex.uz/en/acts/8548754) is explicitly marked as not yet in force. The current-law edition selector shows 22 April 2027 for the future version. The future alphabet was not applied early. Recheck the operative edition before that date.
- `src/shared/uz-translit.ts` exports U+2018 for the letter mark and U+2019 for tutuq. Copy now describes this as the converter's normalization policy, without treating those code points as a universal legal requirement.

## Product and editorial review

`src/gpt-chat/parts/PresentationWorkspace.tsx` already provides PPTX download in the separate presentation workspace. Intent decision `A5-ru-prezentatsiya-tool-vs-gpt-chat` explicitly distinguishes ordinary text answers from that workspace.

The slide guide's intro, body, table, caption and PPTX FAQ now explain that distinction. Old absolute file-generation prohibitions and stale free-file quotas were removed from the changed passages. No new quota or price was added. The manual workflow remains the guide's purpose, with exactly one body link anchored `Taqdimot AI`.

The new `Suvni tejash` example is labelled as an editorial sample. It has three short action bullets and a separate speaker-notes paragraph, without invented numerical results.

Contextual links were added from the résumé internship section and the application guide's related-documents paragraph to `tavsifnoma-namuna`. The latter guide links to `kirill-lotin` after its signing checklist, explicitly explaining that it changes script while the language stays Uzbek. No native-speaker sign-off is claimed.

## Verification

- `tests/seo-content-corrections-20261107.test.ts`: 8 passed, 0 failed. It covers alphabet/FAQ consistency, direct source links, the actual Ng round trip and apostrophe constants, C63/C64 descriptions, presentation-mode copy, the editorial sample and contextual link placement.
- `content-contract-proof.json`: all six content files match the baseline for every top-level field other than actual content (`intro`, `body`, `bodyBlocks`, `faq`) and modification dates. This includes title, H1, description, Open Graph, canonical, hreflang, robots, keywords, author, published date, converter widgets and chat settings. All existing H2/H3 blocks are unchanged.
- Manifest changes are limited to `informational.owns` in C63 and C64. All other intent decisions and keyword restrictions are unchanged.
- `src/shared/uz-translit.ts` and `scripts/translator-page.ts` match the baseline after line-ending normalization. No algorithm or converter control changes were made.
- Scoped `git diff --check`: passed. Final integration tests, rendered-page review and build are owned by the parent task and are not claimed here.

Only substantively edited content has a new modification date, 2026-11-07. Converter pages use their existing `updatedAt` field; blog articles update both `dateModified` and `updatedAt`.
