# Languages

English (`messages/en.ts`) is the reference: its shape is the type of every language.

**Add a language** (say `es`):

1. Copy `messages/en.ts` to `messages/es.ts`, rename the export (`es`) and type it
   `export const es: Messages = {…}` (see `messages/pt-BR.ts`), then translate the values.
2. In `config.ts`: add `'es'` to `LOCALES` and its name, in itself, to `LOCALE_NAMES`.
3. In `index.ts`: import it and add it to `catalog`.

TypeScript says what is missing or misspelled; `pnpm i18n:check` also checks that every language
has the same keys and the same placeholders. The language selector in Settings, the cookie, the
proxy and the Dominus's instruction to the AI all read `config.ts`, so nothing else changes.

**Remove a language**: delete its file and its lines in `config.ts` and `index.ts`.

What stays untranslated on purpose: names of technologies and products, proper names (Cerebro,
Dominus), and the name of each language in itself.
