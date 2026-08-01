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
  'GPTBot Market помогает найти и сравнить товары по подтверждённым данным',
  'подключённых каталогов. Сейчас доступен только синтетический демо-каталог.',
  'GPTBot не принимает оплату и не обещает доставку.',
].join(' ');

const UZ_DESCRIPTION = [
  'GPTBot Market ulangan kataloglardagi tasdiqlangan ma’lumot asosida',
  'mahsulot topish va solishtirishga yordam beradi. Hozir faqat sintetik',
  'demo-katalog mavjud. GPTBot to‘lov qabul qilmaydi va yetkazishni va’da qilmaydi.',
].join(' ');

export const TELEGRAM_AGENT_METADATA:
readonly TelegramAgentLocalizedMetadata[] = [
  {
    commands: COMMANDS_RU,
    description: RU_DESCRIPTION,
    shortDescription:
      'GPTBot Market: поиск товаров в подключённых каталогах.',
  },
  {
    languageCode: 'ru',
    commands: COMMANDS_RU,
    description: RU_DESCRIPTION,
    shortDescription:
      'GPTBot Market: поиск товаров в подключённых каталогах.',
  },
  {
    languageCode: 'uz',
    commands: COMMANDS_UZ,
    description: UZ_DESCRIPTION,
    shortDescription:
      'GPTBot Market: ulangan kataloglardan mahsulot qidirish.',
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
