// The web chat's own words to the visitor in its JSON answers, RU and UZ
// (functions/api/gpt/chat.ts). Pure. No plan or product names and no prices:
// the limit card and the pack window carry those (plan WP-06, WP-17). The
// UTC day of the limits starts at 05:00 in Tashkent. "o‘" and "g‘" use U+2018
// like the rest of the repository.
import type { Locale } from "../../../src/shared/types";
import type { LimitReason } from "./turn-store";

export interface LimitFacts {
  /** The tier's limits: the free tier's day and hour, or the pack's day (hourly null). */
  limits: { daily: number; hourly: number | null };
  /** Answers left today (free tier) or in the pack. */
  remaining: number;
  /** Seconds until a turn fits again; null when time does not lift the limit. */
  retryAfterSec: number | null;
}

/** Why the turn was refused and when the visitor can write again. */
export function limitMessage(
  reason: LimitReason,
  locale: Locale,
  facts: LimitFacts,
): string {
  const uz = locale === "uz";
  const minutes = Math.max(1, Math.ceil((facts.retryAfterSec ?? 0) / 60));
  const { daily, hourly } = facts.limits;
  switch (reason) {
    case "hourly":
      return uz
        ? `Bir soatda ${hourly} ta bepul xabar yozish mumkin. ${minutes} daqiqadan keyin yana yozasiz.`
        : `Лимит бесплатных сообщений в час — ${hourly}. Снова написать можно через ${minutes} мин.`;
    case "daily":
      return uz
        ? `Bugungi ${daily} ta bepul xabar tugadi. Ertaga soat 05:00 dan (Toshkent vaqti bilan) yana yozishingiz mumkin.`
        : `Бесплатные сообщения на сегодня закончились (в день — ${daily}). Снова писать можно завтра с 05:00 по Ташкенту.`;
    case "pack_daily":
      return uz
        ? `Paketning kunlik limiti (${daily} ta javob) tugadi. Ertaga soat 05:00 dan (Toshkent vaqti bilan) davom ettirasiz; paketda ${facts.remaining} ta javob qoldi.`
        : `Дневной лимит пакета исчерпан (ответов в день: ${daily}). Продолжить можно завтра с 05:00 по Ташкенту; ответов в пакете осталось: ${facts.remaining}.`;
    case "monthly":
      return uz
        ? "Paketdagi javoblar tugadi. Bepul limit ishlashda davom etadi."
        : "Ответы пакета закончились. Бесплатный лимит продолжает действовать.";
    case "busy":
      return uz
        ? "Oldingi javob hali tayyorlanmoqda. Bir necha soniyadan keyin qayta yuboring."
        : "Предыдущий ответ ещё готовится. Повторите через несколько секунд.";
    case "ip":
      return uz
        ? `Tarmog‘ingizdan so‘rovlar juda ko‘p. ${minutes} daqiqadan keyin qayta urinib ko‘ring.`
        : `Из вашей сети слишком много запросов. Попробуйте снова через ${minutes} мин.`;
  }
}

/** A turn without an answer, by the public provider code. */
export function providerMessage(code: string | undefined, locale: Locale): string {
  const uz = locale === "uz";
  if (code === "no_key")
    return uz
      ? "AI-chat vaqtincha sozlanmagan. Keyinroq urinib ko‘ring."
      : "AI-чат временно не настроен. Попробуйте позже.";
  if (code === "rate_limit")
    return uz
      ? "Hozir so‘rovlar ko‘p. Bir daqiqadan keyin qayta urinib ko‘ring."
      : "Сейчас много запросов. Попробуйте ещё раз через минуту.";
  if (code === "model_unavailable")
    return uz
      ? "AI-chat modellari yangilanmoqda. Birozdan keyin qayta urinib ko‘ring."
      : "Модели AI-чата обновляются. Попробуйте ещё раз немного позже.";
  if (code === "timeout")
    return uz
      ? "Javob tayyorlash juda uzoq davom etdi. Qayta urinib ko‘ring."
      : "Ответ занял слишком много времени. Попробуйте ещё раз.";
  return uz
    ? "Javob olinmadi. Savolni boshqacha yozing yoki qayta yuboring."
    : "Не удалось получить ответ. Попробуйте переформулировать или повторить.";
}
