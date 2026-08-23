import type { Dict } from '../i18n';

const ICONS = [
  <path key="messages" d="M5 6.5h14v8H9l-4 3v-11Z" />,
  <path key="languages" d="M4 5h9M8.5 3v2c0 4-2 7-5 9M6 10c1.5 2 3.5 3.5 6 4M15 8l4 10M13.5 14h7" />,
  <path key="handoff" d="M5 12h12M13 8l4 4-4 4M7 6H4v12h3" />,
  <path key="always" d="M12 7v5l3 2M12 3a9 9 0 1 0 9 9" />,
];

export default function CapabilityRail({ t }: { t: Dict }) {
  const items = [...t.trust.badges.slice(0, 3), '24/7'];

  return (
    <aside className="capability-rail" aria-label={t.trust.h}>
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 sm:grid-cols-4 sm:px-6 lg:px-8">
        {items.map((item, index) => (
          <div key={item} className="capability-rail__item">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {ICONS[index]}
            </svg>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
