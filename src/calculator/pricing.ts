export const GOALS = [
  {
    id: 'leads',
    label: 'Заявки и квалификация',
    description: 'Меню, вопросы, контакт и передача менеджеру',
    min: 990_000,
    max: 1_490_000,
    daysMin: 3,
    daysMax: 5,
  },
  {
    id: 'catalog',
    label: 'Каталог и заказы',
    description: 'Товары, корзина, статусы и уведомления',
    min: 1_990_000,
    max: 3_490_000,
    daysMin: 7,
    daysMax: 12,
  },
  {
    id: 'booking',
    label: 'Запись клиентов',
    description: 'Услуга, специалист, слот, подтверждение и напоминание',
    min: 2_490_000,
    max: 4_490_000,
    daysMin: 7,
    daysMax: 14,
  },
  {
    id: 'ai',
    label: 'AI-консультант',
    description: 'Свободные вопросы, база знаний и передача человеку',
    min: 2_990_000,
    max: 5_990_000,
    daysMin: 10,
    daysMax: 20,
  },
] as const;

export const FEATURES = [
  {
    id: 'bilingual',
    label: 'Русский + узбекский',
    description: 'Два полноценных маршрута и тестирование смешанной речи',
    min: 390_000,
    max: 790_000,
    daysMin: 1,
    daysMax: 3,
  },
  {
    id: 'crm',
    label: 'Интеграция с CRM',
    description: 'Создание сделки, источник, ответственный и статусы',
    min: 790_000,
    max: 1_490_000,
    daysMin: 2,
    daysMax: 5,
  },
  {
    id: 'payments',
    label: 'Оплата Payme или Click',
    description: 'Платёжный сценарий, статусы и backend-проверка',
    min: 990_000,
    max: 1_790_000,
    daysMin: 3,
    daysMax: 7,
  },
  {
    id: 'admin',
    label: 'Админ-панель',
    description: 'Редактирование контента, заявок или каталога',
    min: 990_000,
    max: 1_990_000,
    daysMin: 4,
    daysMax: 8,
  },
  {
    id: 'analytics',
    label: 'Расширенная аналитика',
    description: 'Источники, этапы воронки и завершённые действия',
    min: 390_000,
    max: 790_000,
    daysMin: 1,
    daysMax: 3,
  },
  {
    id: 'notifications',
    label: 'Напоминания и рассылки',
    description: 'Сервисные уведомления и согласованные сегменты',
    min: 490_000,
    max: 990_000,
    daysMin: 2,
    daysMax: 4,
  },
] as const;

export const VOLUMES = [
  {
    id: 'starter',
    label: 'До 500 диалогов в месяц',
    description: 'Небольшой бизнес или проверка MVP',
    monthlyMin: 100_000,
    monthlyMax: 350_000,
  },
  {
    id: 'growth',
    label: '500–2 000 диалогов',
    description: 'Регулярная реклама и несколько менеджеров',
    monthlyMin: 300_000,
    monthlyMax: 900_000,
  },
  {
    id: 'scale',
    label: 'Более 2 000 диалогов',
    description: 'Нужны нагрузочные требования и отдельная оценка',
    monthlyMin: 700_000,
    monthlyMax: 1_800_000,
  },
] as const;

export const CONTENT_READINESS = [
  {
    id: 'ready',
    label: 'Материалы готовы',
    description: 'Есть услуги, цены, FAQ и правила ответов',
    min: 0,
    max: 0,
    daysMin: 0,
    daysMax: 0,
  },
  {
    id: 'partial',
    label: 'Нужна редактура',
    description: 'Информация есть, но её нужно структурировать',
    min: 290_000,
    max: 690_000,
    daysMin: 1,
    daysMax: 3,
  },
  {
    id: 'research',
    label: 'Нужно собрать с нуля',
    description: 'Нужны интервью, карта сценария и база ответов',
    min: 690_000,
    max: 1_490_000,
    daysMin: 3,
    daysMax: 7,
  },
] as const;

export type GoalId = (typeof GOALS)[number]['id'];
export type FeatureId = (typeof FEATURES)[number]['id'];
export type VolumeId = (typeof VOLUMES)[number]['id'];
export type ReadinessId = (typeof CONTENT_READINESS)[number]['id'];

export interface CalculatorSelection {
  goalId: GoalId;
  featureIds: FeatureId[];
  volumeId: VolumeId;
  readinessId: ReadinessId;
}

export interface CalculatorResult {
  implementationMin: number;
  implementationMax: number;
  monthlyMin: number;
  monthlyMax: number;
  daysMin: number;
  daysMax: number;
  goalLabel: string;
  featureLabels: string[];
  readinessLabel: string;
  volumeLabel: string;
}

export const DEFAULT_SELECTION: CalculatorSelection = {
  goalId: 'leads',
  featureIds: [],
  volumeId: 'starter',
  readinessId: 'ready',
};

export function calculateEstimate(selection: CalculatorSelection): CalculatorResult {
  const goal = GOALS.find((item) => item.id === selection.goalId) ?? GOALS[0];
  const volume = VOLUMES.find((item) => item.id === selection.volumeId) ?? VOLUMES[0];
  const readiness = CONTENT_READINESS.find((item) => item.id === selection.readinessId) ?? CONTENT_READINESS[0];
  const selectedFeatures = FEATURES.filter((item) => selection.featureIds.includes(item.id));

  return {
    implementationMin: goal.min + readiness.min + selectedFeatures.reduce((sum, item) => sum + item.min, 0),
    implementationMax: goal.max + readiness.max + selectedFeatures.reduce((sum, item) => sum + item.max, 0),
    monthlyMin: volume.monthlyMin,
    monthlyMax: volume.monthlyMax,
    daysMin: goal.daysMin + readiness.daysMin + selectedFeatures.reduce((sum, item) => sum + item.daysMin, 0),
    daysMax: goal.daysMax + readiness.daysMax + selectedFeatures.reduce((sum, item) => sum + item.daysMax, 0),
    goalLabel: goal.label,
    featureLabels: selectedFeatures.map((item) => item.label),
    readinessLabel: readiness.label,
    volumeLabel: volume.label,
  };
}

export function formatSum(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value).replace(/\u00a0/g, ' ');
}

export function buildEstimateSummary(result: CalculatorResult): string {
  const features = result.featureLabels.length ? result.featureLabels.join(', ') : 'без дополнительных модулей';
  return [
    'Предварительный расчёт Telegram-бота:',
    `Задача: ${result.goalLabel}.`,
    `Функции: ${features}.`,
    `Материалы: ${result.readinessLabel}.`,
    `Нагрузка: ${result.volumeLabel}.`,
    `Разработка: ${formatSum(result.implementationMin)}–${formatSum(result.implementationMax)} сум.`,
    `Срок: ${result.daysMin}–${result.daysMax} рабочих дней.`,
    `Инфраструктура: ${formatSum(result.monthlyMin)}–${formatSum(result.monthlyMax)} сум/мес.`,
    'Расчёт ориентировочный и уточняется после короткого брифа.',
  ].join('\n');
}
