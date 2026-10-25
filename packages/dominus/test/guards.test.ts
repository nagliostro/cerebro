import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Two rules checked on the code itself.
// Generalism (D14): outside providers/, nothing names an AI provider or its models and events.
// Clock (D16): only clock.ts reads the computer's clock; everything else uses nowMs().

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
const source = files(SRC).map((f) => ({
  name: path.relative(SRC, f).replaceAll('\\', '/'),
  text: readFileSync(f, 'utf8'),
}));

describe('code rules', () => {
  it('names no AI provider outside providers/', () => {
    const provider =
      /claude|anthropic|openai|gemini|ollama|haiku|sonnet|opus|gpt-|rate_limit|grok|xai/i;
    const offenders = source
      .filter((f) => !f.name.startsWith('providers/'))
      .filter((f) => provider.test(f.text))
      .map((f) => `${f.name}: ${f.text.match(provider)![0]}`);
    expect(offenders).toEqual([]);
  });

  it('reads the computer clock only in clock.ts', () => {
    const clock = /Date\.now\(\)|new Date\(\)/;
    const offenders = source.filter((f) => f.name !== 'clock.ts' && clock.test(f.text));
    expect(offenders.map((f) => f.name)).toEqual([]);
  });
});
