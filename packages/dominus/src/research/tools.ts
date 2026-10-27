import { BrowserSession, BrowserUnavailable } from '../browser/session.ts';
import { BlockedError } from '../browser/guard.ts';
import type { ToolAction } from '../providers/types.ts';
import { RECORDS, researchEvent } from './events.ts';
import { AttachmentError, readAttachment } from './attachments.ts';
import { readResearch, record, RecordError, SCREEN_KINDS, writeResearch } from './record.ts';

// The research tools, the same for every AI: the Navegador's (open, use and read pages, search)
// and the ones that record what was found. A CLI that speaks MCP gets them through the Cerebro's
// own MCP server; an API model gets them as functions the adapter runs. Nothing here reads or writes the
// owner's files, runs a command or reaches anything but public sites (the guard).

type Spec = { name: string; description: string; parameters: Record<string, unknown> };

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
});
const str = (description: string) => ({ type: 'string', description });

export const RESEARCH_TOOLS: Spec[] = [
  {
    name: 'open',
    description:
      'Open a public web page and see it as text: what can be used (with refs) and its text.',
    parameters: obj({ url: str('https://...') }, ['url']),
  },
  {
    name: 'search',
    description: 'Search the web. Returns titles, links and snippets.',
    parameters: obj({ query: str('What to search for') }, ['query']),
  },
  {
    name: 'snapshot',
    description: 'See the current page again, with fresh refs.',
    parameters: obj({}),
  },
  {
    name: 'click',
    description: 'Click an element by its ref from the last snapshot.',
    parameters: obj({ ref: str('e.g. e12') }, ['ref']),
  },
  {
    name: 'type',
    description: 'Fill a field by its ref; submit presses Enter after.',
    parameters: obj({ ref: str('e.g. e3'), text: str('The value'), submit: { type: 'boolean' } }, [
      'ref',
      'text',
    ]),
  },
  {
    name: 'select',
    description: 'Choose an option of a select by its ref.',
    parameters: obj({ ref: str('e.g. e5'), value: str('The option text') }, ['ref', 'value']),
  },
  {
    name: 'read',
    description: 'Read the main text of the current page in full (manuals, help, forums).',
    parameters: obj({}),
  },
  {
    name: 'network',
    description:
      'The calls the page made to its server since the last check, with what was sent and answered.',
    parameters: obj({}),
  },
  {
    name: 'screenshot',
    description: 'Save a picture of the page. main: true for the one the owner sees in the plan.',
    parameters: obj({ main: { type: 'boolean' } }),
  },
  {
    name: 'attachment',
    description:
      'See a file the owner attached to the request, by its name: an image (a screenshot of the original) or a text.',
    parameters: obj({ name: str('The file name, as listed in the request') }, ['name']),
  },
  {
    name: 'set_feature',
    description:
      'Record what is being copied: the feature, where from, its fields and outputs, and what its server does.',
    parameters: obj(
      {
        feature: str('The feature, in the owner language'),
        target: str('The link or path'),
        server: str('What the server does for it, or "nothing: it runs in the page"'),
        fields: {
          type: 'array',
          items: obj({ name: str('Field'), detail: str('Type, limits, default, mask') }),
        },
        outputs: {
          type: 'array',
          items: obj({ name: str('Output'), detail: str('Format, rounding, unit') }),
        },
      },
      ['feature'],
    ),
  },
  {
    name: 'add_case',
    description:
      'Add one case to the answer key: the inputs used and the outputs the original gave.',
    parameters: obj(
      {
        input: {
          type: 'object',
          description:
            'Field name → value as typed. Live data the original reads (a rate, a price) is an input too.',
        },
        output: {
          type: 'object',
          description: 'Output name → value exactly as shown (a number, a date); never a note',
        },
        source: str('"observed" or the link of the manual example'),
      },
      ['input', 'output', 'source'],
    ),
  },
  {
    name: 'add_rule',
    description: 'Record a rule of the feature or its domain, with its source.',
    parameters: obj({ text: str('The rule'), source: str('Link, or "observed"') }, [
      'text',
      'source',
    ]),
  },
  {
    name: 'add_finding',
    description:
      'Record an improvement users ask for, a defect of the original, or a gap (what could not be proven).',
    parameters: obj(
      {
        kind: { type: 'string', enum: ['improvement', 'defect', 'gap'] },
        text: str('What it is'),
        source: str('Link (improvements and defects)'),
      },
      ['kind', 'text'],
    ),
  },
  {
    name: 'add_library',
    description:
      'Record a free library (an npm package) that does the hard part of the feature, so the neuron carries it instead of code written from zero. The Cerebro checks it: permissive license, used by many (downloads a week), a file that runs in a browser. If refused, the answer says why: try another.',
    parameters: obj(
      { name: str('The npm package, e.g. pdf-lib'), why: str('What it does for the feature') },
      ['name', 'why'],
    ),
  },
  {
    name: 'add_source',
    description:
      'Record where the live data the feature shows comes from (rates, prices, the weather): who gives it to the original, whether that is paid, and the free public site with no key the neuron will read instead. The Cerebro opens the example link to prove it answers; if it does not, try another source.',
    parameters: obj(
      {
        data: str('What it gives, e.g. "exchange rates and their history"'),
        original: str('Where the original gets it, and if that is paid'),
        example: str(
          'An https link of the free source that gives the data, as the neuron will ask',
        ),
        updates: str('How fresh it is, e.g. "once a day"'),
        history: str('How to ask for a period, if it has history (a link pattern)'),
      },
      ['data', 'original', 'example', 'updates'],
    ),
  },
  {
    name: 'set_screen',
    description:
      'Record the screen of the original, top to bottom: every element the owner sees while using the feature (the headline sentence, the main number, each field and choice, buttons, tabs, charts, the source and time of the data). The neuron keeps these elements and their order, stacked, in the look of the Cerebro.',
    parameters: obj(
      {
        items: {
          type: 'array',
          items: obj(
            {
              kind: { type: 'string', enum: [...SCREEN_KINDS] },
              text: str('What it says, as on the screen'),
              detail: str('What it does or shows, its format and options'),
            },
            ['kind', 'text'],
          ),
        },
      },
      ['items'],
    ),
  },
  {
    name: 'ask_owner',
    description:
      'Stop and ask the owner one question (e.g. which feature to copy), with options. Then finish.',
    parameters: obj(
      { question: str('The question'), options: { type: 'array', items: { type: 'string' } } },
      ['question'],
    ),
  },
];

/** A research's tools, bound to its folder. The browser opens only when a page is needed. */
export class ResearchTools {
  private session: BrowserSession | null = null;
  private dir: string;
  private locale: string;
  private maxPages: number;

  constructor(opts: { dir: string; locale: string; maxPages: number }) {
    this.dir = opts.dir;
    this.locale = opts.locale;
    this.maxPages = opts.maxPages;
  }

  private async browser() {
    this.session ??= await BrowserSession.open({
      dir: this.dir,
      locale: this.locale,
      maxPages: this.maxPages,
    });
    return this.session;
  }

  /** The sites seen go into the research (from the proxy, never from the AI). */
  private async keepSites() {
    if (!this.session) return;
    const r = await readResearch(this.dir);
    r.sites = this.session.visits();
    await writeResearch(this.dir, r);
  }

  async close() {
    await this.keepSites().catch(() => undefined);
    await this.session?.close();
    this.session = null;
  }

  /** Runs one call; the answer is always text (errors too), so the AI can go on. */
  async run(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    output: string;
    action: ToolAction;
    target?: string;
    image?: Buffer;
    /** The image's type; a PNG when not said (the screenshots). */
    mime?: string;
  }> {
    const s = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '');
    const ev = researchEvent(name, args);
    try {
      const kind = RECORDS[name];
      if (kind) return { output: await record(this.dir, kind, args), ...ev };
      // What the owner attached is in the research folder: no browser needed.
      if (name === 'attachment') {
        const a = await readAttachment(this.dir, s('name'));
        if (a.kind === 'text')
          return {
            output: `<third-party-content>\n${a.text.slice(0, 40_000)}\n</third-party-content>`,
            ...ev,
          };
        return { output: `the attached image ${s('name')}`, ...ev, image: a.data, mime: a.mime };
      }
      if (ev.action === 'other') return { output: `unknown tool ${name}`, ...ev };
      const b = await this.browser();
      let output: string;
      let image: Buffer | undefined;
      switch (name) {
        case 'open':
          output = await b.open(s('url'));
          break;
        case 'search':
          output = await b.search(s('query'));
          break;
        case 'click':
          output = await b.click(s('ref'));
          break;
        case 'type':
          output = await b.type(s('ref'), s('text'), args.submit === true);
          break;
        case 'select':
          output = await b.select(s('ref'), s('value'));
          break;
        case 'read':
          output = await b.read();
          break;
        case 'network':
          output = b.network();
          break;
        case 'screenshot': {
          const shot = await b.screenshot();
          if (args.main === true) {
            const r = await readResearch(this.dir);
            r.screenshot = shot.file;
            await writeResearch(this.dir, r);
          }
          output = `saved ${shot.file}`;
          image = shot.png;
          break;
        }
        default:
          output = await b.snapshot();
      }
      await this.keepSites();
      return { output, ...ev, image };
    } catch (e) {
      if (e instanceof BrowserUnavailable)
        return {
          output: 'error: no browser available on this computer; record what you can and finish',
          action: 'other',
        };
      const message =
        e instanceof RecordError || e instanceof BlockedError || e instanceof AttachmentError
          ? e.message
          : (e as Error).message.split('\n')[0];
      return { output: `error: ${message}`, action: 'other' };
    }
  }
}

/** The tools as an API model sees them (the common function-calling format). */
export const RESEARCH_TOOL_SPECS = RESEARCH_TOOLS.map((t) => ({ type: 'function', function: t }));
