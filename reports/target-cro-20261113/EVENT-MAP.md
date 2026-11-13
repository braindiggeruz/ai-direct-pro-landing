# Target landing measurement

Scope: `https://gptbot.uz/uz/instagram-target-yoqish/`, existing Meta Pixel `1445931954174897`. The owner separately requested correct page events without editing the campaign or its learning settings.

| Event | Meaning | Conversion? |
| --- | --- | --- |
| PageView | Page opened | No |
| ViewContent | Advertising-service content viewed | No |
| LeadFormView | Enquiry form entered the viewport | No, custom diagnostic |
| LeadFormStart | First interaction with the form | No, custom diagnostic |
| LeadCTAClick | Visitor chose a form CTA | No, custom diagnostic |
| TelegramContactClick | Visitor chose the Telegram link | No, custom diagnostic; not a sent message |
| Lead | Server acknowledged a new enquiry | Yes, existing optimization event |

Use pixel-specific `trackSingle` for standard events and `trackSingleCustom` for diagnostics. This is the command split used by [Meta's maintained tag template](https://github.com/meta/GoogleTagManager-WebTemplate-For-FacebookPixel/blob/main/template.tpl). No new GTM/container is installed.

Page initialization and form milestones are guarded against duplicates. Same-document anchor/history navigation does not create another PageView: the existing page-scoped Pixel boot disables the SDK push-state hook before initialization. This was identified using the real public SDK, beyond mocked-event tests. Errors, validation failures, duplicate contacts and repeat success receipts must not count as new leads. Diagnostic parameters use fixed page/service/variant labels and CTA zones; no typed contact, name or task text. Existing Global Privacy Control / Do Not Track checks and automatic-configuration disablement remain.

QA intercepts all outbound lead and analytics writes. Browser assertions validate event calls, parameters, duplicate handling and consent/privacy gates. These are technical checks, not evidence that Meta Events Manager has processed a new real customer's event; its reporting can lag.

No campaign/ad/ad-set updates, optimization changes, budget writes, attribution-window changes, custom conversion creation, or fake test conversions. Future CAPI/server matching would require separate consent/data design and event-ID reconciliation; this release keeps the existing browser-pixel contract.
