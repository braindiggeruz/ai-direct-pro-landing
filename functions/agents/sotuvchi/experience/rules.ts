import type {
  DeterministicRule,
  Locale,
  RuntimeResponseDraft,
  RuntimeStepResult,
} from '../../../platform/contracts';
import {
  BUYER_COPY,
  homeResponse,
  recoveryChoices,
} from './copy';

function answer(response: RuntimeResponseDraft): RuntimeStepResult {
  return { kind: 'answer', response, facts: [] };
}

function simple(
  locale: Locale,
  text: string,
  choices = recoveryChoices(locale),
): RuntimeStepResult {
  return answer({
    messages: [{ text, choices }],
    claims: [],
  });
}

const NAVIGATION_ACTIONS = new Set([
  'buyer-home',
  'buyer-find',
  'buyer-help',
  'buyer-more',
  'buyer-language',
  'buyer-locale-ru',
  'buyer-locale-uz',
  'buyer-seller',
  'buyer-seller-mode',
  'buyer-seller-how',
  'seller-interest',
]);

export const sotuvchiBuyerNavigationRule: DeterministicRule = {
  id: 'buyer-navigation',
  priority: 35,
  match(input) {
    return input.message.kind === 'action'
      && NAVIGATION_ACTIONS.has(input.message.actionId);
  },
  async execute(context, input) {
    if (input.message.kind !== 'action') {
      return answer(homeResponse(context.org.locale));
    }
    const locale = context.org.locale;
    const copy = BUYER_COPY[locale];
    switch (input.message.actionId) {
      case 'buyer-home':
        return answer(homeResponse(locale));
      case 'buyer-find':
        return simple(locale, copy.findPrompt);
      case 'buyer-help':
        return simple(locale, `${copy.help}\n\n${copy.humanHint}`);
      case 'buyer-more':
        return simple(locale, copy.more, [
          { id: 'buyer-language', label: copy.language },
          { id: 'buyer-help', label: copy.helpButton },
          { id: 'buyer-home', label: copy.homeButton },
        ]);
      case 'buyer-language':
        return answer({
          messages: [{
            text: copy.languagePrompt,
            choices: [
              { id: 'buyer-locale-ru', label: copy.russian },
              { id: 'buyer-locale-uz', label: copy.uzbek },
              { id: 'buyer-home', label: copy.homeButton },
            ],
          }],
          claims: [],
        });
      case 'buyer-locale-ru':
      case 'buyer-locale-uz': {
        const selected: Locale = input.message.actionId.endsWith('-uz')
          ? 'uz'
          : 'ru';
        const selectedCopy = BUYER_COPY[selected];
        const home = homeResponse(selected).messages[0];
        return answer({
          messages: [{
            ...home,
            text: `${selectedCopy.languageChanged}\n\n${home.text}`,
          }],
          claims: [],
        });
      }
      case 'buyer-seller':
        return simple(locale, copy.sellerPrompt, [
          { id: 'buyer-home', label: copy.homeButton },
          { id: 'buyer-help', label: copy.helpButton },
        ]);
      case 'buyer-seller-mode':
      case 'seller-interest':
        return simple(locale, copy.sellerInterest, [
          { id: 'buyer-seller-how', label: copy.sellerHow },
          { id: 'buyer-home', label: copy.backToShopping },
        ]);
      case 'buyer-seller-how':
        return simple(locale, copy.sellerHowText, [
          { id: 'buyer-home', label: copy.backToShopping },
        ]);
      default:
        return answer(homeResponse(locale));
    }
  },
};
