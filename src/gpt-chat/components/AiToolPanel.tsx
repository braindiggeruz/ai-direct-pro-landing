import type { Locale } from "../types";
import type { ChatStrings } from "../i18n";
import type { AiToolId, PromptTemplate } from "../templates";
import { track, EV } from "../analytics";
import { PromptTemplateGrid } from "./PromptTemplateGrid";
import { ImagePromptTool } from "./ImagePromptTool";

export type ToolId = Exclude<AiToolId, "chat">;

const TOOL_COPY: Record<Locale, Record<Exclude<ToolId, "images">, { title: string; body: string }>> = {
  uz: {
    smm: {
      title: "AI SMM kabinet",
      body: "Instagram va Telegram uchun post, stories, reklama va kontent reja.",
    },
    business: {
      title: "AI biznes vositalari",
      body: "Mijoz javobi, FAQ, sotuv skripti va AI-bot pilot rejasi.",
    },
    study: {
      title: "AI bilan o‘qish",
      body: "Mavzuni tushunish, konspekt, test, tarjima va matn tekshirish.",
    },
  },
  ru: {
    smm: {
      title: "AI SMM кабинет",
      body: "Посты, сторис, реклама и контент-планы для Instagram и Telegram.",
    },
    business: {
      title: "AI для бизнеса",
      body: "Ответы клиентам, FAQ, продажи и пилотный план AI-бота.",
    },
    study: {
      title: "AI для учёбы",
      body: "Разобраться в теме, сделать конспект, тест, перевод или проверить текст.",
    },
  },
};

/**
 * The menu's tools other than the chat (lazy part chat-tools): the image
 * prompt generator, or a tool's ready templates. Every pick is sent as an
 * ordinary chat message by the console.
 */
export function AiToolPanel({
  t,
  locale,
  tool,
  disabled,
  onTemplatePick,
  onImagePrompt,
}: {
  t: ChatStrings;
  locale: Locale;
  tool: ToolId;
  disabled: boolean;
  onTemplatePick: (template: PromptTemplate, prompt: string) => void;
  onImagePrompt: (prompt: string, presetId: string) => void;
}) {
  if (tool === "images") {
    return (
      <ImagePromptTool
        locale={locale}
        onGenerate={onImagePrompt}
        disabled={disabled}
      />
    );
  }
  const copy = TOOL_COPY[locale][tool];
  return (
    <>
      <h2 className="text-lg font-semibold text-white">
        {copy.title}
      </h2>
      <p className="mb-4 mt-1 text-sm leading-relaxed text-white/50">
        {copy.body}
      </p>
      <PromptTemplateGrid
        key={`${locale}-${tool}`}
        locale={locale}
        tool={tool}
        onPick={onTemplatePick}
        disabled={disabled}
      />
      {tool === "business" && (
        <p className="mt-4 text-[13px] text-white/45">
          <a
            href={locale === "uz" ? "/uz/biznes-uchun-ai-bot/" : "/ru/gpt-dlya-biznesa/"}
            onClick={() =>
              track(EV.businessClicked, { from: "business_tab" })
            }
            className="text-brand-cyan hover:underline underline-offset-4"
          >
            {t.businessLink}
          </a>
        </p>
      )}
    </>
  );
}
