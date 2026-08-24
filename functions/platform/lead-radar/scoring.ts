import type {
  LeadRadarEvidence,
  LeadRadarPriority,
  LeadRadarScoreComponent,
  LeadRadarSignal,
} from '../../../src/shared/lead-radar';

export interface ScoreInput {
  evidence: LeadRadarEvidence[];
  signals: LeadRadarSignal[];
  website: string | null;
  phone: string | null;
  genericEmail: string | null;
  telegramUrl: string | null;
  category: string;
}

function ids(input: ScoreInput, paths: string[]): string[] {
  return input.evidence
    .filter((item) => paths.some((path) => item.fieldPath.startsWith(path)))
    .map((item) => item.id);
}

export function scoreLead(input: ScoreInput): {
  score: number;
  confidence: number;
  priority: LeadRadarPriority;
  components: LeadRadarScoreComponent[];
} {
  const hasIntent = input.signals.some((signal) => (
    signal.type === 'hiring' || signal.type === 'tender' || signal.type === 'new_branch'
  ));
  const digitalFacts = input.signals.filter((signal) => (
    signal.type === 'messenger' || signal.type === 'online_booking' || signal.type === 'contact_form'
  ));
  const contactEvidence = ids(input, ['company_contacts', 'web.telegram']);
  const categoryEvidence = ids(input, ['company.category']);
  const geoEvidence = ids(input, ['locations']);
  const signalEvidence = input.signals.flatMap((signal) => signal.evidenceIds);

  const components: LeadRadarScoreComponent[] = [
    {
      key: 'niche_fit',
      label: 'Соответствие нише',
      score: input.category ? 25 : 12,
      max: 25,
      reason: input.category ? `Категория подтверждена: ${input.category}` : 'Категория определена неполно',
      evidenceIds: categoryEvidence,
    },
    {
      key: 'geo_fit',
      label: 'География',
      score: geoEvidence.length > 0 ? 10 : 6,
      max: 10,
      reason: geoEvidence.length > 0 ? 'Адрес или координаты подтверждены источником' : 'Город известен только из поискового контекста',
      evidenceIds: geoEvidence,
    },
    {
      key: 'digital_need',
      label: 'Цифровая потребность',
      score: Math.min(20, (input.website ? 7 : 2) + digitalFacts.length * 5),
      max: 20,
      reason: digitalFacts.length > 0
        ? `Обнаружены цифровые точки контакта: ${digitalFacts.map((item) => item.label).join(', ')}`
        : 'Явные точки автоматизации пока не подтверждены',
      evidenceIds: digitalFacts.flatMap((item) => item.evidenceIds),
    },
    {
      key: 'intent',
      label: 'Активный сигнал спроса',
      score: hasIntent ? 25 : 5,
      max: 25,
      reason: hasIntent
        ? 'Есть свежий сигнал найма, тендера или расширения'
        : 'Прямой сигнал покупки не найден; это перспективная компания, а не горячий inbound-лид',
      evidenceIds: signalEvidence,
    },
    {
      key: 'contactability',
      label: 'Доступность контакта',
      score: input.telegramUrl ? 20 : (input.phone ? 12 : 0) + (input.genericEmail ? 8 : 0),
      max: 20,
      reason: input.telegramUrl
        ? 'Найден публичный корпоративный Telegram'
        : (input.phone || input.genericEmail ? 'Найден корпоративный канал связи' : 'Проверенный контакт пока не найден'),
      evidenceIds: contactEvidence,
    },
  ];

  const score = Math.min(100, components.reduce((sum, component) => sum + component.score, 0));
  const factEvidence = input.evidence.filter((item) => item.classification !== 'model_inference');
  const averageEvidenceConfidence = factEvidence.length > 0
    ? factEvidence.reduce((sum, item) => sum + item.confidence, 0) / factEvidence.length
    : 0.35;
  const coverage = Math.min(1, new Set(factEvidence.map((item) => item.fieldPath)).size / 7);
  const confidence = Math.round(Math.min(0.98, averageEvidenceConfidence * 0.72 + coverage * 0.28) * 100) / 100;
  const priority: LeadRadarPriority = score >= 75 && confidence >= 0.8 && hasIntent
    ? 'P1'
    : (score >= 65 && confidence >= 0.65 ? 'P2' : 'P3');

  return { score, confidence, priority, components };
}
