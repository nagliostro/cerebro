// Screen text in the languages of the Cerebro (see README.md). The language follows the browser
// (Accept-Language) unless this browser chose one in Settings.

import { type Locale } from './config';
import { en, type Messages } from './messages/en';
import { ptBR } from './messages/pt-BR';

export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_NAMES,
  isLocale,
  pickLocale,
} from './config';
export type { Locale } from './config';
export type { Messages };

/** Every language, by code. TypeScript refuses a language missing here (or a key missing in one). */
const catalog: Record<Locale, Messages> = { en, 'pt-BR': ptBR };

export const t = (locale: Locale): Messages => catalog[locale];
