// Move-only compatibility proof for the Telegram client extraction.
// No network calls: imports must be side-effect-free and both paths must
// expose the exact same runtime values.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as legacy from '../functions/lib/telegram/client';
import * as channel from '../functions/channels/telegram/api';
import type {
  InlineButton as LegacyInlineButton,
  InlineKeyboard as LegacyInlineKeyboard,
  TelegramFile as LegacyTelegramFile,
  TelegramMessage as LegacyTelegramMessage,
  TgResult as LegacyTgResult,
} from '../functions/lib/telegram/client';
import type {
  InlineButton as ChannelInlineButton,
  InlineKeyboard as ChannelInlineKeyboard,
  TelegramFile as ChannelTelegramFile,
  TelegramMessage as ChannelTelegramMessage,
  TgResult as ChannelTgResult,
} from '../functions/channels/telegram/api';

interface LegacyTypeSurface {
  button: LegacyInlineButton;
  keyboard: LegacyInlineKeyboard;
  file: LegacyTelegramFile;
  message: LegacyTelegramMessage;
  result: LegacyTgResult;
}

interface ChannelTypeSurface {
  button: ChannelInlineButton;
  keyboard: ChannelInlineKeyboard;
  file: ChannelTelegramFile;
  message: ChannelTelegramMessage;
  result: ChannelTgResult;
}

test('legacy and channel Telegram client paths expose the same public surface', () => {
  const runtimeExports = [
    'TG_MAX_MESSAGE',
    'TelegramClient',
    'escapeHtml',
    'splitMessage',
    'telegramRetryDelayMs',
  ];
  assert.deepEqual(Object.keys(legacy).sort(), runtimeExports.sort());
  assert.deepEqual(Object.keys(channel).sort(), runtimeExports.sort());
  for (const name of runtimeExports) {
    assert.equal(legacy[name as keyof typeof legacy], channel[name as keyof typeof channel]);
  }

  const channelTypes: ChannelTypeSurface = {
    button: { text: 'ok', callback_data: 'ok' },
    keyboard: [[{ text: 'ok' }]],
    file: { file_id: 'id', file_unique_id: 'unique' },
    message: { message_id: 1 },
    result: { ok: true },
  };
  const legacyTypes: LegacyTypeSurface = channelTypes;
  assert.equal(legacyTypes.result.ok, true);
});
