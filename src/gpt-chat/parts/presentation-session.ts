import type { PresentationSession } from '../../../apps/studio/src/tools/presentation/session';
import type { ChatMessage } from '../types';
import { parsePresentationEdit, presentationTopic } from '../../../apps/studio/src/tools/presentation/editing';

type Entry = { session: PresentationSession; selected: number; reveal: () => void; purchase: () => void };
export interface ArtifactSummary { title: string; ready: boolean; working: boolean; revision: number; slides: number; units: number|null }
const entries = new Map<string, Entry>();
const summaries = new Map<string, ArtifactSummary>();
const listeners = new Set<() => void>();
export const sessionKey = (owner: string, artifact: string) => JSON.stringify([owner, artifact]);
export function subscribeArtifacts(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function artifactSummary(key: string) { return summaries.get(key) ?? null; }
export function registerSession(key: string, entry: Entry) {
  entries.set(key, entry);
  const s = entry.session;
  const summary = { title: s.result?.deck.title ?? s.topic, ready: !!s.result, working: s.working, revision: s.result?.revision ?? 0, slides: s.result?.deck.slides.length ?? s.slides, units:s.unitsLeft };
  if (JSON.stringify(summary) !== JSON.stringify(summaries.get(key))) {
    summaries.set(key, summary);
    listeners.forEach(notify => notify());
  }
}
export function unregisterSession(key: string) { entries.delete(key); summaries.delete(key); listeners.forEach(notify => notify()); }
export function purchasePresentation(key: string) { entries.get(key)?.purchase(); }
export function presentationTurn(owner:string, artifact:string, text:string, locale:'ru'|'uz'): ChatMessage[] {
  return [{role:'user',content:text,kind:'artifact-action',artifactId:artifact}, {role:'assistant',content:runPresentationCommand(owner,artifact,text,locale),kind:'artifact-action',artifactId:artifact}];
}

export function runPresentationCommand(owner: string, artifact: string, text: string, locale: 'ru' | 'uz'): string {
  const entry = entries.get(sessionKey(owner, artifact));
  const ru = locale === 'ru';
  if (!entry) return ru ? 'Презентация ещё открывается. Повторите команду после загрузки.' : 'Taqdimot hali ochilmoqda. Yuklangach buyruqni qayta yuboring.';
  const s = entry.session;
  if (s.working) return ru ? 'Создание ещё идёт. Дождитесь результата; повторный запуск не выполнен.' : 'Yaratish davom etmoqda. Natijani kuting; qayta ishga tushirilmadi.';
  if (!s.result) {
    const topic = presentationTopic(text);
    if (topic.length < 3) return ru ? 'Напишите тему длиной от 3 до 200 символов.' : '3–200 belgidan iborat mavzuni yozing.';
    s.setTopic(topic); entry.reveal();
    return ru ? 'Тема сохранена. Проверьте параметры и нажмите «Создать» — генерация ещё не запущена.' : 'Mavzu saqlandi. Parametrlarni tekshirib «Yaratish»ni bosing — yaratish hali boshlanmadi.';
  }
  const edit = parsePresentationEdit(text, entry.selected);
  if (!edit) return ru
    ? 'Здесь можно изменить готовую презентацию: «сократи слайд 3», «переименуй слайд 3 в …», «палитра 2». Текст и заметки редактируются через «Править». Для обычного вопроса нажмите «Обычный чат».'
    : 'Bu yerda tayyor taqdimotni o‘zgartirish mumkin: «3 slaydni qisqartir», «palitra 2». Matn va izohlar «Tahrirlash» orqali o‘zgartiriladi. Oddiy savol uchun «Oddiy chat»ni bosing.';
  if (edit.kind === 'shorten' && s.result.deck.slides[edit.index - 1]?.bullets.length === 2) return ru ? 'В слайде уже два пункта. Измените их через «Править»; версия не менялась.' : 'Slaydda allaqachon ikki band bor. «Tahrirlash» orqali o‘zgartiring; versiya o‘zgarmadi.';
  if (!s.edit(edit)) return ru ? 'Правка не применена. Проверьте номер слайда; палитры 2 и 3 доступны полной версии.' : 'Tahrir qo‘llanmadi. Slayd raqamini tekshiring; 2 va 3-palitra to‘liq versiyada mavjud.';
  return ru ? 'Правка применена к презентации. Следующее скачивание PPTX включит изменения. Нового AI-вызова и списания нет.' : 'Tahrir taqdimotga qo‘llandi. Keyingi PPTX yuklamasi o‘zgarishlarni o‘z ichiga oladi. Yangi AI so‘rovi va birlik yechimi yo‘q.';
}
