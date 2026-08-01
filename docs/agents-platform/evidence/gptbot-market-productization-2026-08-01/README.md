# GPTBot Market productization visual evidence

Captured from the local production build on 2026-08-01 using the repository
browser runner. Every image was opened and visually inspected after capture.

## Website baseline

| File | State |
| --- | --- |
| `website-ru-1440.png` | RU desktop hero and synthetic product session, 1440×1000 |
| `website-ru-390.png` | RU compact mobile hero, 390×844 |
| `website-uz-1440.png` | Uzbek Latin desktop parity, 1440×1000 |
| `website-ru-200pct.png` | 360px layout viewport used as the browser-zoom reflow equivalent; no horizontal overflow |

The website demo says “synthetic / not a real store” adjacent to every product
card. Prices, stock and store names in the screenshot are demo-only and are not
production or pilot facts.

## Generated product visual

Source output (outside Git, retained by Codex):

`C:\Users\Borinio\.codex\generated_images\019fbdbd-c579-7233-a8e4-e20c49ece48f\exec-02c679b4-c89a-46aa-8b3a-6003b06019af.png`

Repository export:

`public/assets/market/market-synthetic-fallback.webp`

Prompt summary: premium editorial two-object retail composition, warm ivory,
deep teal structure, one coral signal, generic table lamp and insulated bottle,
no people, text, logo, brand, UI, cart, robot, brain, coins, OpenAI symbol or
Telegram imitation. The generated composition is used only as labelled
synthetic demo/fallback media.

## Current limitations

- These captures are local build evidence, not production screenshots.
- The compact evidence proves responsive reflow, not a human screen-reader pass.
- Real Telegram buyer/seller screenshots still require the final owner canary;
  synthetic Telegram layouts are packaged separately.
