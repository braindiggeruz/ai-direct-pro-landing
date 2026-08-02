# GPTBot Market Mini App Telegram platform matrix

Protocol facts in this document come from the official
[Telegram Mini Apps documentation](https://core.telegram.org/bots/webapps).
Configuration described here is future owner-gated work; nothing was changed
in BotFather or production during planning.

## Launch strategy

| Capability | Use and product value | Risk | Fallback | Test matrix |
| --- | --- | --- | --- | --- |
| Bot menu button | stable “Open Market” entry after closed canary | changing all-user navigation too early | keep commands/current buttons; enable only after owner gate | RU/UZ label, new/returning buyer, verified seller, iOS/Android/Desktop/Web |
| Inline `web_app` button | contextual launch from product/search/order messages | stale context or unsupported client | button next to existing bot action; bot flow remains | each launch source, expired context, back to chat |
| Main Mini App/profile | one-tap discovery only at later primary stage | public exposure before cohort readiness | do not configure before MA-10; bot `/start` stays | profile preview, locale media, no-start parameter |
| Direct `startapp` link | campaign/store/product/order navigation hint | forged/truncated parameter, shared chat context | validate bounded opaque hint server-side; default home | unknown/foreign/expired code; compact/full; chat types |
| Keyboard button | excluded from primary plan | Telegram states `initData` is empty for keyboard-button launch; unsuitable for authenticated marketplace | use inline/menu/main launch | prove unsupported screen if accidentally launched |
| Attachment menu | not planned | availability/configuration constraints and unnecessary chat context | bot/menu launch | n/a until separate ADR |

Telegram documents seven launch modes. The first program uses menu, inline and
direct/main links only. Keyboard-button Mini Apps are excluded because the
official `WebAppInitData` section says their init data is empty; authentication
must not silently downgrade.

## Client capabilities

| Capability | Planned use | Value | Risk/constraint | Fallback and acceptance |
| --- | --- | --- | --- | --- |
| official `telegram-web-app.js` | load before app script; thin typed wrapper | smallest protocol surface and immediate platform features | external script availability/version; must be CSP-allowed | unsupported adapter renders bot link; unit mock + real-client smoke |
| `ready()` | call after essential shell/auth state can render | hides placeholder at a truthful point | premature blank/flash | skeleton until bootstrap; measure launch |
| `expand()` | request expanded buyer/seller workspace | more usable product grids/forms | user/client behavior varies | layouts work compact and expanded |
| ThemeParams/CSS vars | map Telegram light/dark semantics into Warm Market Signals | visual continuity without becoming generic Telegram UI | arbitrary custom themes can break contrast | clamp/fallback tokens; contrast test every theme set |
| theme change event | update tokens live | correct day/night switch | remount/state loss | CSS variable update only; preserve route/forms |
| viewport/stable height | size scrolling content and bottom actions | avoids keyboard/gesture jumps | `viewportHeight` refresh is not smooth; official docs recommend stable height for pinned UI | CSS stable viewport, browser fallback; keyboard/open-close tests |
| safe/content safe area | pad shell, nav and fullscreen content | avoids Telegram/system controls | older clients may lack values | CSS zero/default + 16 px; iOS notch/Android nav/Desktop tests |
| BackButton | reflect Router history below root | native navigation | double back, stale handler, closing app unexpectedly | unsubscribe on route; root hides button; hardware/browser back parity |
| MainButton/BottomButton | only checkout final review and high-confidence single seller confirmation if usability testing wins | reachable native dominant action | state can drift from form; duplicates sticky CTA | one action owner; disabled/loading/cleanup tests; use in-app button otherwise |
| SecondaryButton | not in initial shell | little evidence of value | clutter and platform-version differences | in-app secondary control |
| closing confirmation | enable only while unsaved contact/comment/seller reply exists | protects effort | annoying if always enabled | disabled after save/submit/cancel; kill/reload tests |
| HapticFeedback | success/error on confirmed mutation only | functional acknowledgement | decorative/overuse/accessibility | visual/text feedback always sufficient; reduced-motion/device tests |
| `openTelegramLink` | return to bot/support/handoff thread | seamless recovery | wrong/untrusted link | only server/configured `t.me` targets; normal anchor fallback |
| `sendData` | not used for domain commands | none for this architecture; official docs limit it to keyboard launch and close the app | bypasses BFF/domain/idempotency | BFF only; bot receives notifications through outbox |
| `answerWebAppQuery` | not required for first marketplace stages | may later share a prepared result | channel side effect and launch-mode coupling | separate future ADR/test |
| write access/contact APIs | do not request at launch | avoids unnecessary permission | consent fatigue and privacy | collect checkout contact through existing bounded workflow; evaluate explicit action later |
| Cloud/Device/SecureStorage | no authority or checkout storage | none required | stale/synced client truth and version availability | memory/local ephemeral preferences only; server restores business state |
| fullscreen/orientation/sensors/location | excluded | no marketplace value now | permission, battery, layout and privacy cost | normal portrait-responsive app |

## Theme mapping

Warm Market Signals stays recognizable while respecting Telegram:

- base canvas uses Telegram `bg_color` only if it passes contrast with selected
  ink; otherwise use market ivory/dark neutral fallback;
- cards derive from `secondary_bg_color`/section colors with market paper
  fallback;
- primary action prefers market teal, but may use Telegram button colors when
  contrast and brand rules pass;
- coral is an attention semantic, never remapped to Telegram link blue;
- every status has icon/text, never color alone;
- header/background/bottom bar colors are set only after contrast calculation.

## Navigation behavior

- Root destinations use the app bottom navigation.
- Pushed routes show Telegram BackButton and preserve bottom navigation where
  the hierarchy remains primary.
- Modal/full-screen flows use an explicit cancel/back action and warn only for
  unsaved effort.
- A direct link establishes a requested destination only after bootstrap
  validates access. Failure lands on a safe home/error state, never another
  store's data.
- Returning from bot re-fetches changed order/handoff state; the client does
  not assume background state is current.

## Required platform/device evidence

Before any stage exits canary, record real-device evidence for:

- iOS current and one previous supported Telegram version;
- Android current on low-end and reference devices;
- Telegram Desktop and Telegram Web;
- 320, 360, 390 and 430 CSS-pixel widths;
- compact/expanded, keyboard open, safe-area change, minimize/reactivate,
  close/reopen, slow/offline network;
- RU and Uzbek Latin, light/dark/custom theme, 200% text/large system font,
  VoiceOver/TalkBack, reduced motion;
- BackButton handler cleanup and final-action duplicate prevention.

Any platform where authentication, back navigation, safe area, dominant action
or bot recovery fails blocks expansion of that cohort.
