import { useState } from 'react';
import { SlideCanvas } from '../../../apps/studio/src/embedded/SlideCanvas';
import type { PresentationResult } from '../../../apps/studio/src/embedded/artifact-store';
import type { StudioLocale } from '../../../apps/studio/src/api';
import type { PictureState } from '../../../apps/studio/src/tools/presentation/Preview';

/** Human-authored sample through the real PPTX preview geometry. No AI, job or entitlement. */
export function StudioOfferExample({ locale, palettes }: { locale: StudioLocale; palettes:number }) {
  const ru = locale === 'ru', [palette, setPalette] = useState(1);
  const title = ru ? 'От идеи к выступлению' : 'G‘oyadan nutqqacha';
  const notes = ru ? 'Начните с главной мысли. Приведите понятный пример, затем сформулируйте вывод для аудитории.' : 'Asosiy fikrdan boshlang. Tushunarli misol keltiring, so‘ng auditoriya uchun xulosa qiling.';
  const result: PresentationResult = { shape:'full', aiLabel:false, exportPalette:palette,
    job:{ jobId:'sj_'+'0'.repeat(32),source:'example',shape:{slides:1,images:1,notes:true,palette,parts:1},next:'outline',expiresAt:'2026-12-31T00:00:00Z' },
    task:{ topic:title,locale,audience:'umumiy',slides:1,palette },
    deck:{title,subtitle:ru?'Пример оформления':'Dizayn namunasi',slides:[{index:1,title,layout:'image-right',bullets:ru?['Одна главная мысль','Наглядный пример','Понятный вывод']:['Bitta asosiy fikr','Ko‘rgazmali misol','Tushunarli xulosa'],notes}]}};
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#123448"/><circle cx="320" cy="240" r="140" fill="#19b8ad"/><path d="M270 195h100v90H270z M290 310h60" stroke="#fff" stroke-width="14" fill="none"/></svg>';
  const pictures = new Map<number,PictureState>([[1,{status:'ready',url:'data:image/svg+xml,'+encodeURIComponent(svg),blob:new Blob([svg],{type:'image/svg+xml'})}]]);
  return <div className="gpt-offer-example"><p>{ru ? 'Пример оформления. Содержание создадим по вашей теме.' : 'Dizayn namunasi. Mazmunini mavzuingiz bo‘yicha yaratamiz.'}</p><SlideCanvas result={result} index={1} pictures={pictures} locale={locale}/><div className="gpt-offer-palettes" aria-label={ru?'Палитра примера':'Namuna palitrasi'}>{[1,2,3].slice(0,palettes).map(n=><button type="button" key={n} aria-pressed={palette===n} onClick={()=>setPalette(n)}>{ru?'Палитра':'Palitra'} {n}</button>)}</div><strong>{ru?'Пример заметок для выступления':'Nutq izohlari namunasi'}</strong><p>{notes}</p></div>;
}
