# Translator blind check (RU ↔ UZ), kit for the owner

Prepared 2026-10-24 on branch `seo/translator-ru-uz-20261024`. Nothing here was run against the production chat API; no translation has been scored yet.

## Why this exists

The SEO roadmap (2026-10-04, §5 and 3.3) says the chat must not advertise translation until a **native-speaker blind check scores it at least 4/5**. `tests/gpt-chat-prerender-links.test.ts` keeps translation starters off the chat's first screen for that reason. The only translation scores in the repository are the agent's own non-blind check on the old model `glm-4.7-flash` (`docs/paid-chat/eval/zai-check-2026-10-03-free.md`). The current model (`ZAI_MODEL_FREE` = `glm-5.3-flash` in `wrangler.toml`) has none.

The two translator pages (`/ru/russko-uzbekskiy-perevodchik/`, `/uz/rus-ozbek-tarjimon/`) stay `status: "draft"` until this check passes and the owner signs off.

## What is in this folder

| File | What it is |
|---|---|
| `sources.json` | 40 invented source texts: 20 RU→UZ (`RU-01`…`RU-20`) and 20 UZ→RU (`UZ-01`…`UZ-20`). Business messages, formal letters, casual chat, instructions, idioms, names and numbers, a marketing post, support replies, a contract clause and code-switching. UZ→RU sources mix Uzbek Latin (with U+2018, ASCII `'` and U+02BB, as people type) and Uzbek Cyrillic. `RU-19` asks for Cyrillic output. `prompt` is the exact text to paste; `check` says what the rater should look at. |
| `scoring-sheet.csv` | What raters see: one row per item and candidate, with the source text. The collector fills `candidate_code` and `candidate_text` (copy a row per extra candidate or rater); raters fill `rater_id` and the scores. |
| `collector-key.csv` | Kept by the collector only, never shown to raters: which system produced each `candidate_code` (`gptbot`, `google`, `human`), the model name shown under the answer, the date, and whether the answer was cut off. |
| `score.mjs` | Reads a filled sheet (and the key, if there are control candidates) and prints the means per direction and the gate verdict: `node docs/seo/research/2026-10-24-translator-blind-check/score.mjs scoring-sheet.csv collector-key.csv`. |

## Who does what

- **Collector** (owner or anyone except the raters): produces the translations and blinds them.
- **Raters**: at least one native Uzbek speaker who reads Russian well (scores RU→UZ) and one native Russian speaker who reads Uzbek well (scores UZ→RU). Two raters per direction is better. Raters must not know which system produced which text and must not have worked on the pages.

## Step 1. Produce the translations (collector)

The translator page only preselects the chat's existing **«Переводчик» / «Tarjimon»** role (`src/gpt-chat/roles.ts`): same endpoint, same model, same server prompt. So the translation can be produced in either of these places:

1. **Recommended: the existing chat with the role chosen by hand.** Open `/ru/gpt-chat/` (for RU→UZ) or `/uz/gpt-uzbek-tilida/` (for UZ→RU), open the menu, choose the role «Переводчик» / «Tarjimon», start a **new chat for every item**, paste `prompt`, copy the answer verbatim. This is exactly what the translator page sends. 40 answers exceed the 3 lifetime trial replies, so this needs an AI pack (300 answers a month, up to 50 a day, per the public offer); it is the owner's decision to use production for this.
2. **Local preview of the draft page**, to look at the page itself (layout, copy, converter, the role preselected in the sidebar):

   ```powershell
   $env:NODE_OPTIONS='--max-old-space-size=1400'
   $env:PREVIEW_DRAFTS='/ru/russko-uzbekskiy-perevodchik/,/uz/rus-ozbek-tarjimon/'
   npm run build:fast
   npx vite preview --port 4173
   # open http://localhost:4173/ru/russko-uzbekskiy-perevodchik/ and /uz/rus-ozbek-tarjimon/
   Remove-Item Env:PREVIEW_DRAFTS; npm run build:fast   # before anything else is built or released
   ```

   `vite preview` serves files only: the converter works, the chat cannot answer there (no `/api`). `wrangler pages dev` would answer but applies `_redirects`, where every draft URL is a 404 by design. Use option 1 for the actual translations.

For every item record: the answer text exactly as shown, the model name shown under the answer, the date, and whether the answer was cut off. Do not edit, shorten or fix answers.

Optional control (makes the check truly blind and gives a baseline): translate the same 40 prompts with Google Translate or a human translator and add those rows too. Then give every candidate a random code (`c01`…`c80`) and shuffle the rows, so raters see only source + candidate.

## Step 2. Score (raters)

Score every candidate from 1 to 5 on three criteria. Read the source first, then the candidate. Use `check` from `sources.json` as a reminder, not as an answer key.

| Score | Adequacy (meaning) | Fluency (reads like a native text) | Terminology (terms, names, numbers, register) |
|---|---|---|---|
| 5 | All meaning, nothing added or lost | Natural; a native speaker would write it this way | Every term right; names, numbers and dates unchanged; right register (Siz/sen, вы/ты) |
| 4 | Minor nuance lost, meaning intact | Natural with one or two awkward spots | One minor slip that does not mislead |
| 3 | Main meaning there, a detail wrong or missing | Understandable but clearly translated | A wrong term or register a reader would notice |
| 2 | Important part wrong or missing | Hard to read | A term, name or number that misleads |
| 1 | Wrong or unusable | Not a usable text | Several misleading errors |

Also mark `names_numbers_changed` = `yes` if any name, number, date, amount or code differs from the source, and `critical_error` = `yes` if the text would cause harm or a wrong action if sent as is. Add a short comment for any score of 3 or less.

For `RU-19` the answer must be in Uzbek Cyrillic; Latin output scores at most 2 on terminology. For Uzbek Latin output, o‘/g‘ written with an ASCII apostrophe is acceptable for the score but note it in the comment (the page's own converter fixes it).

## Step 3. Gate (proposed rule, owner decides)

Per direction (RU→UZ and UZ→RU separately), over all raters and the GPTBot candidates only:

- mean adequacy ≥ 4.0, mean fluency ≥ 4.0 and mean terminology ≥ 4.0, and
- no item with `names_numbers_changed` = `yes` or `critical_error` = `yes`.

`score.mjs` applies exactly this rule. If one direction passes and the other does not, only the passing direction may be advertised; the pages describe both, so they stay drafts until both pass or the copy is narrowed.

## Step 4. After the check

1. Save the filled sheet next to this file as `results-YYYY-MM-DD.csv` and the `score.mjs` output as `results-YYYY-MM-DD.txt`.
2. Record the verdict, model name and date in `docs/seo/CHANGE_LOG_2026-10.md` and `docs/agents-platform/STATE.json`.
3. If it passes: the owner also decides the free-quota option (A–D in `docs/seo/research/2026-10-24-snippets-translator/translator-market.md` §4.3, commit d54d5b61), a native speaker proofreads both pages, and the publication steps in `content/seo/intent-manifest.json` A8 apply (status → published, protected revision for `/`, approved routes, inbound links, chat-layout check).
4. If it fails: do not publish; keep the converter idea (it needs no model) as a candidate for its own page («лотин кирилл» 6 600/mo, «кирилл лотин» 3 600/mo).

## Privacy

All source texts are invented; the phone number in `UZ-16` uses a non-existent operator code. Do not replace them with real client texts: whatever is pasted goes to the server and to the AI provider.
