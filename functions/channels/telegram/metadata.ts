export interface TelegramAgentCommand {
  command: string;
  description: string;
}

export interface TelegramAgentLocalizedMetadata {
  languageCode?: 'ru' | 'uz';
  name: string;
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
  { command: 'start', description: 'открыть Bormi' },
  { command: 'catalog', description: 'смотреть товары' },
  { command: 'orders', description: 'мои заказы' },
  { command: 'help', description: 'как пользоваться' },
  { command: 'language', description: 'сменить язык' },
];

const COMMANDS_UZ: readonly TelegramAgentCommand[] = [
  { command: 'start', description: 'Bormi’ni ochish' },
  { command: 'catalog', description: 'mahsulotlarni ko‘rish' },
  { command: 'orders', description: 'buyurtmalarim' },
  { command: 'help', description: 'qanday foydalanish' },
  { command: 'language', description: 'tilni almashtirish' },
];

const RU_DESCRIPTION = [
  'Bormi? — Bor.',
  '',
  'Найдите нужный товар, сравните варианты и сохраните выбор — всё прямо в Telegram.',
  '',
  'Сейчас внутри демонстрационный каталог. Товары и цены используются для знакомства с сервисом; покупка и доставка пока не подключены.',
  '',
  'Нажмите «Открыть Bormi» — посмотрим, что есть.',
].join('\n');

const UZ_DESCRIPTION = [
  'Bormi? — Bor.',
  '',
  'Kerakli mahsulotni toping, variantlarni solishtiring va tanlovingizni saqlang — barchasi Telegram ichida.',
  '',
  'Hozir namoyish katalogi ochiladi. Mahsulot va narxlar xizmat bilan tanishish uchun; xarid va yetkazib berish hozircha ulanmagan.',
  '',
  '«Bormi’ni ochish»ni bosing — nimalar borligini ko‘ramiz.',
].join('\n');

export const TELEGRAM_AGENT_METADATA:
readonly TelegramAgentLocalizedMetadata[] = [
  {
    name: 'Bormi',
    commands: COMMANDS_RU,
    description: RU_DESCRIPTION,
    shortDescription:
      'Bormi? — Bor. Найдите, сравните и выберите товар прямо в Telegram.',
  },
  {
    languageCode: 'ru',
    name: 'Bormi',
    commands: COMMANDS_RU,
    description: RU_DESCRIPTION,
    shortDescription:
      'Bormi? — Bor. Найдите, сравните и выберите товар прямо в Telegram.',
  },
  {
    languageCode: 'uz',
    name: 'Bormi',
    commands: COMMANDS_UZ,
    description: UZ_DESCRIPTION,
    shortDescription:
      'Bormi? — Bor. Mahsulotni Telegram ichida toping, solishtiring va tanlang.',
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
      value.name.length < 1
      || value.name.length > 64
      || value.description.length < 1
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
