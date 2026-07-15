// SERP snippet preview for the page editor (Step 8 of the brief).
import { Card } from './ui';

export function SerpPreview({ title, description, url, primaryKeyword }: { title: string; description: string; url: string; primaryKeyword?: string }) {
  const warnings: string[] = [];
  if (!title) warnings.push('Title is empty');
  else {
    if (title.length < 45) warnings.push(`Title is short (${title.length} chars)`);
    if (title.length > 65) warnings.push(`Title may be truncated by Google (${title.length} > 65)`);
    if (primaryKeyword && !title.toLowerCase().includes(primaryKeyword.toLowerCase())) warnings.push('Title does not contain primary keyword');
  }
  if (!description) warnings.push('Description is empty');
  else {
    if (description.length < 120) warnings.push(`Description is short (${description.length} chars)`);
    if (description.length > 160) warnings.push(`Description may be truncated by Google (${description.length} > 160)`);
  }

  return (
    <Card data-testid="serp-preview">
      <div className="text-xs uppercase tracking-wide text-white/50 mb-3">Google SERP preview</div>
      <div className="bg-white text-black p-4 rounded-lg font-sans">
        <div className="text-[#202124] text-sm flex items-center gap-1.5 mb-1">
          <span className="inline-block w-4 h-4 rounded-full bg-[#1a73e8] text-white text-[10px] flex items-center justify-center">B</span>
          <span className="text-[#202124]">gptbot.uz</span>
          <span className="text-[#5f6368]">{'›'} {url.split('/').filter(Boolean).join(' › ')}</span>
        </div>
        <div className="text-[#1a0dab] text-xl leading-tight font-normal hover:underline cursor-pointer">{title || 'Page title…'}</div>
        <div className="text-[#4d5156] text-sm mt-1 leading-snug">{description || 'Meta description will appear here…'}</div>
      </div>
      {warnings.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {warnings.map((w) => (
            <li key={w} className="text-amber-300 flex gap-2"><span>⚠</span><span>{w}</span></li>
          ))}
        </ul>
      )}
    </Card>
  );
}
