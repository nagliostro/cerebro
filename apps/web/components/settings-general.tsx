'use client';

import { useRef, useState } from 'react';

import { LOCALES, LOCALE_NAMES, t, type Locale } from '@/lib/i18n';
import { notify, notifyFailure } from '@/lib/toast';

import { useInstall } from './install';
import { post, PRIMARY } from './settings-ui';
import { btnOption } from './button';

/** The Cerebro as an app on this device: installed, a tap to install, or where the browser has it. */
export function InstallApp({ locale }: { locale: Locale }) {
  const m = t(locale).settings.general;
  const { state, install } = useInstall();
  if (state === 'unknown') return <p className="min-h-[1lh]" />;
  return (
    <>
      <p role="status">{m.app[state]}</p>
      {state === 'offer' && (
        <button type="button" onClick={() => void install()} className={`${PRIMARY} mt-3`}>
          {m.install}
        </button>
      )}
    </>
  );
}

type Depth = 'shallow' | 'medium' | 'deep';
const DEPTHS: Depth[] = ['shallow', 'medium', 'deep'];

/** How deep a research goes: one choice, saved at once. */
export function DepthChoice({ initial, locale }: { initial: Depth; locale: Locale }) {
  const all = t(locale);
  const m = all.settings;
  const [depth, setDepth] = useState(initial);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  async function choose(d: Depth) {
    const before = depth;
    setDepth(d);
    try {
      await post('/api/settings', { depth: d });
      notify.success({
        id: 'depth',
        title: all.toast.depthSaved,
        description: m.general.depths[d],
      });
    } catch (e) {
      setDepth(before);
      notifyFailure(all.toast.depthFailed, e, all.toast);
    }
  }

  return (
    <>
      <div role="radiogroup" aria-label={m.general.depth} className="flex flex-wrap gap-2">
        {DEPTHS.map((d, i) => (
          <button
            key={d}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={depth === d}
            tabIndex={depth === d ? 0 : -1}
            onClick={() => void choose(d)}
            onKeyDown={(e) => {
              const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
              if (!step) return;
              e.preventDefault();
              const n = (i + step + DEPTHS.length) % DEPTHS.length;
              void choose(DEPTHS[n]!);
              refs.current[n]?.focus();
            }}
            className={btnOption(depth === d)}
          >
            {m.general.depths[d]}
          </button>
        ))}
      </div>
    </>
  );
}

type Language = 'auto' | Locale;
const LANGUAGES: Language[] = ['auto', ...LOCALES];

/** The screens' language on this device; the page comes back in it. */
export function LanguageChoice({ initial, locale }: { initial: Language; locale: Locale }) {
  const all = t(locale);
  const m = all.settings;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  async function choose(l: Language) {
    if (l === initial) return;
    try {
      await post('/api/locale', { locale: l });
      window.location.reload();
    } catch (e) {
      notifyFailure(all.toast.languageFailed, e, all.toast);
    }
  }

  return (
    <>
      <div role="radiogroup" aria-label={m.general.language} className="flex flex-wrap gap-2">
        {LANGUAGES.map((l, i) => (
          <button
            key={l}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={initial === l}
            tabIndex={initial === l ? 0 : -1}
            onClick={() => void choose(l)}
            onKeyDown={(e) => {
              const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
              if (!step) return;
              e.preventDefault();
              refs.current[(i + step + LANGUAGES.length) % LANGUAGES.length]?.focus();
            }}
            className={btnOption(initial === l)}
          >
            {l === 'auto' ? m.general.languages.auto : LOCALE_NAMES[l]}
          </button>
        ))}
      </div>
    </>
  );
}
