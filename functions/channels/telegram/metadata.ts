export interface TelegramAgentCommand {
  command: string;
  description: string;
}

export interface TelegramAgentLocalizedMetadata {
  languageCode?: 'ru' | 'uz';
  commands: readonly TelegramAgentCommand[];
  description: string;
  shortDescription: string;
}

const COMMAND_NAMES = [
  'start',
  'catalog',
  'orders',
  'help',
  'language',
] as const;

export const TELEGRAM_AGENT_COMMAND_NAMES: readonly string[] = COMMAND_NAMES;

const COMMANDS_RU: readonly TelegramAgentCommand[] = [
  { command: 'start', description: 'главное меню' },
  { command: 'catalog', description: 'открыть каталог' },
  { command: 'orders', description: 'мои заказы' },
  { command: 'help', description: 'помощь' },
  { command: 'language', description: 'выбрать язык' },
];

const COMMANDS_UZ: readonly TelegramAgentCommand[] = [
  { command: 'start', description: 'bosh menyu' },
  { command: 'catalog', description: 'katalogni ochish' },
  { command: 'orders', description: 'buyurtmalarim' },
  { command: 'help', description: 'yordam' },
  { command: 'language', description: 'tilni tanlash' },
];

const RU_DESCRIPTION = [
  'GPTBot Agents тестовый магазин: поиск и сравнение синтетических товаров,',
  'тестовые заказы и связь с продавцом.',
  'Реальных брендов, оплаты и доставки здесь нет.',
].join(' ');

const UZ_DESCRIPTION = [
  'GPTBot Agents sinov do‘koni: sintetik mahsulotlarni qidirish va',
  'taqqoslash, sinov buyurtmalari va sotuvchi bilan aloqa.',
  'Haqiqiy brend, to‘lov va yetkazib berish bu yerda yo‘q.',
].join(' ');

export const TELEGRAM_AGENT_METADATA:
readonly TelegramAgentLocalizedMetadata[] = [
  {
    commands: COMMANDS_RU,
    description: RU_DESCRIPTION,
    shortDescription:
      'Безопасный тестовый магазин с синтетическим каталогом.',
  },
  {
    languageCode: 'ru',
    commands: COMMANDS_RU,
    description: RU_DESCRIPTION,
    shortDescription:
      'Безопасный тестовый магазин с синтетическим каталогом.',
  },
  {
    languageCode: 'uz',
    commands: COMMANDS_UZ,
    description: UZ_DESCRIPTION,
    shortDescription:
      'Sintetik katalogli xavfsiz sinov do‘koni.',
  },
];

export function validateTelegramAgentMetadata(
  values: readonly TelegramAgentLocalizedMetadata[],
): void {
  if (
    values.length !== 3
    || values[0]?.languageCode !== undefined
    || values[1]?.languageCode !== 'ru'
    || values[2]?.languageCode !== 'uz'
  ) {
    throw new Error('telegram agent metadata rejected');
  }
  for (const value of values) {
    if (
      value.description.length < 1
      || value.description.length > 512
      || value.shortDescription.length < 1
      || value.shortDescription.length > 120
      || value.commands.length !== COMMAND_NAMES.length
      || new Set(value.commands.map((command) => command.command)).size
        !== value.commands.length
    ) {
      throw new Error('telegram agent metadata rejected');
    }
    for (const [index, command] of value.commands.entries()) {
      if (
        command.command !== COMMAND_NAMES[index]
        || !/^[a-z][a-z0-9_]{0,31}$/.test(command.command)
        || command.description.length < 1
        || command.description.length > 256
      ) {
        throw new Error('telegram agent metadata rejected');
      }
    }
  }
}

validateTelegramAgentMetadata(TELEGRAM_AGENT_METADATA);
