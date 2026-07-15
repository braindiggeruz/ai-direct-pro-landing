import type { ChatStrings } from '../i18n';

export function AiSafetyNotice({ t }: { t: ChatStrings }) {
  return (
    <p className="text-xs text-white/45 leading-relaxed" data-testid="ai-safety-notice">
      {t.safetyWarning}
    </p>
  );
}
