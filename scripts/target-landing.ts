import type { Page } from '../src/shared/types';

/** A static commercial layout for the existing Uzbek advertising service URL. */
export const TARGET_LANDING_STYLE = '/assets/target-cro-20261113/target.css';
const ASSETS = '/assets/target-cro-20261113';
const TARGET_URL = '/uz/instagram-target-yoqish/';

export function isTargetLanding(page: Pick<Page, 'url'>): boolean {
  return page.url === TARGET_URL;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export interface TargetLandingParts {
  leadFormHtml: string;
  articleHtml: string;
  faqHtml: string;
  sourcesHtml: string;
  relatedHtml: string;
  bylineHtml: string;
}

export function renderTargetSticky(telegramHref: string): string {
  return `<nav class="target-sticky" aria-label="Bog‘lanish">
    <a class="target-button target-button--primary" href="#lead-form" data-testid="sticky-form-cta" data-cta-zone="sticky">Hisob-kitob olish <span aria-hidden="true">↗</span></a>
    ${telegramHref ? `<a class="target-sticky__telegram" href="${escapeHtml(telegramHref)}" target="_blank" rel="nofollow noopener noreferrer" data-testid="sticky-telegram-cta" data-contact="studio" data-cta-zone="sticky">Telegram</a>` : ''}
  </nav>`;
}

export function renderTargetLanding(page: Page, parts: TargetLandingParts): string {
  return `<main id="main" class="target-cro" data-landing-variant="target-cro-20261113">
  <section class="target-hero" aria-labelledby="target-heading">
    <div class="target-hero__copy">
      <p class="target-eyebrow"><span class="target-status-dot" aria-hidden="true"></span> TOSHKENT · INSTAGRAM &amp; FACEBOOK</p>
      <h1 id="target-heading" data-testid="page-h1">${escapeHtml(page.h1)}</h1>
      <p class="target-hero__promise">Reklamadan <span>arizagacha.</span></p>
      <p class="target-hero__intro">Auditoriya, kreativlar va ariza yo‘lini bir tizimga yig‘amiz. Siz biznesga e’tibor qaratasiz — biz reklamani sozlaymiz.</p>
      <div class="target-price">
        <span class="target-price__caption">Ishga tushirish + dastlabki 2 hafta yuritish</span>
        <p><strong>1 990 000</strong> <span>so‘mdan</span></p>
        <span class="target-price__note">Reklama byudjeti alohida.</span>
      </div>
      <div class="target-actions">
        <a href="#lead-form" class="target-button target-button--primary" data-testid="page-cta-primary" data-cta-zone="hero">Bepul hisob-kitob olish <span aria-hidden="true">↗</span></a>
        <a href="#target-package" class="target-text-link" data-cta-zone="hero">Paketga nima kiradi <span aria-hidden="true">↓</span></a>
      </div>
      <p class="target-hero__assurance"><span aria-hidden="true">✓</span> Kabinet sizda qoladi <span aria-hidden="true">·</span> Reklama sarfi sizning nazoratingizda</p>
    </div>
    <figure class="target-hero__visual">
      <img src="${ASSETS}/hero-960.webp" srcset="${ASSETS}/hero-640.webp 640w, ${ASSETS}/hero-960.webp 960w" sizes="(min-width: 1024px) 520px, (min-width: 640px) 600px, calc(100vw - 40px)" width="960" height="640" alt="Reklama kreativi va ariza yo‘lini rejalashtirishning tasviriy namunasi" loading="eager" fetchpriority="high" decoding="async" />
      <div class="target-visual-flow" aria-label="Reklamadan arizagacha bo‘lgan jarayon"><span>01 <b>Reklama</b></span><i aria-hidden="true">→</i><span>02 <b>Ariza</b></span><i aria-hidden="true">→</i><span>03 <b>Menejer</b></span></div>
      <figcaption>Jarayon tasviri · sizning loyihangizga moslashtiriladi</figcaption>
    </figure>
  </section>

  <section class="target-case" data-testid="easy-breezy-case" aria-labelledby="target-case-heading">
    <div class="target-case__intro">
      <p class="target-eyebrow">AMALIY MISOL</p>
      <h2 id="target-case-heading">Easy Breezy<span>Ventilyatsiya xizmatlari</span></h2>
    </div>
    <dl class="target-case__metrics">
      <div><dt>CRM’da qayd etilgan ariza</dt><dd>48</dd></div>
      <div><dt>Reklama sarfi</dt><dd>$81,50</dd></div>
      <div><dt>Bir arizaga o‘rtacha sarf</dt><dd>≈ $1,70</dd></div>
    </dl>
    <p class="target-case__context">7–13 noyabr 2026 · 13-noyabr 00:20 (UTC+5) holatiga. Manbalar: Meta reklama kabineti va CRM. Arizalar Meta lid-formasi orqali olingan; bu sotuvlar yoki sayt konversiyasi emas. Har bir biznesning natijasi farq qiladi.</p>
  </section>

  <section id="target-package" class="target-conversion" aria-labelledby="target-package-heading">
    <div class="target-package">
      <p class="target-eyebrow">BITTA ANIQ BOSHLANISH</p>
      <h2 id="target-package-heading">Nima qilamiz.<br><span>Siz nima olasiz.</span></h2>
      <p class="target-section-intro">Ish hajmi va sinov byudjetini oldindan kelishamiz. Ishga tushirish paketiga quyidagilar kiradi:</p>
      <div class="target-package__items">
        <article><span class="target-step-number">01</span><div><h3>Taklif va kreativlar</h3><p>Biznesingiz, hududingiz va auditoriyangizga mos reklama g‘oyasi, matn va vizuallar.</p></div></article>
        <article><span class="target-step-number">02</span><div><h3>Sozlash va ariza yo‘li</h3><p>Auditoriya, kampaniya, forma yoki qo‘nish sahifasi. Murojaat mas’ul xodimga qanday yetib borishini tekshiramiz.</p></div></article>
        <article><span class="target-step-number">03</span><div><h3>Dastlabki 2 hafta yuritish</h3><p>Kreativlarni sinaymiz, sarf va arizalarni kuzatamiz, keyingi qadamni natijalarga qarab belgilaymiz.</p></div></article>
      </div>
      <p class="target-package__continuation">Keyingi yuritish — <strong>oyiga 1 490 000 so‘mdan</strong>, alohida kelishuv asosida. Reklama byudjeti va qo‘shimcha integratsiyalar alohida hisoblanadi.</p>
    </div>
    <div class="target-form-column">
      ${parts.leadFormHtml}
      <p class="target-form-caption">Hisob-kitob olish sizni xizmatni sotib olishga majbur qilmaydi.</p>
    </div>
  </section>

  <section class="target-process" aria-labelledby="target-process-heading">
    <figure class="target-process__visual">
      <img src="${ASSETS}/process-800.webp" srcset="${ASSETS}/process-480.webp 480w, ${ASSETS}/process-800.webp 800w" sizes="(min-width: 900px) 470px, calc(100vw - 40px)" width="800" height="533" alt="Kreativ, auditoriya va murojaat bosqichlarini rejalashtirishning tasviriy namunasi" loading="lazy" decoding="async" />
      <figcaption>Jarayon tasviri</figcaption>
    </figure>
    <div>
      <p class="target-eyebrow">ISHNI QANDAY BOSHLAYMIZ</p>
      <h2 id="target-process-heading">Avval tushunamiz.<br><span>Keyin ishga tushiramiz.</span></h2>
      <ol class="target-process__steps">
        <li><strong>Biznesingizni muhokama qilamiz</strong><p>Xizmat, hudud, taklif va arizaga javob beradigan xodimni aniqlaymiz.</p></li>
        <li><strong>Reja va hisob-kitobni kelishamiz</strong><p>Nima qilinishi, xizmat narxi va reklama uchun ajratiladigan byudjet tushunarli bo‘ladi.</p></li>
        <li><strong>Tekshiramiz va kuzatamiz</strong><p>Kreativ va ariza yo‘li tasdiqlangach, reklamani ishga tushiramiz. Ariza soni bilan birga sifatini ham kuzatamiz.</p></li>
      </ol>
      <a href="#lead-form" class="target-text-link" data-cta-zone="process">Biznesim uchun hisob-kitob olish <span aria-hidden="true">↗</span></a>
    </div>
  </section>

  <section class="target-faq" aria-label="Buyurtmadan oldin bilish muhim">
    ${parts.faqHtml}
  </section>

  <section class="target-details" aria-labelledby="target-details-heading">
    <div class="target-details__intro">
      <p class="target-eyebrow">BATAFSIL MA’LUMOT</p>
      <h2 id="target-details-heading">Target xizmati haqida<br>bilishingiz kerak bo‘lganlar.</h2>
      <p>Usullar, narx tarkibi, ishni qabul qilish mezonlari va mustaqil boshlash uchun qo‘llanma.</p>
      ${parts.bylineHtml}
    </div>
    <div class="target-article">${parts.articleHtml}${parts.sourcesHtml}${parts.relatedHtml}</div>
  </section>
  <div class="target-final-cta"><div><p class="target-eyebrow">KEYINGI QADAM</p><h2>Biznesingizdan boshlaymiz.</h2><p>Vazifani ayting — ish hajmi va hisob-kitobni muhokama qilamiz.</p></div><a href="#lead-form" class="target-button target-button--primary" data-cta-zone="footer">Bepul hisob-kitob olish <span aria-hidden="true">↗</span></a></div>
</main>`;
}
