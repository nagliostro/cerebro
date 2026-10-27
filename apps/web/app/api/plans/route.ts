import { AttachmentError, saveUploads } from '@cerebro/dominus/attachments';
import { dataDir } from '@cerebro/dominus/data-dir';

import { coreRequest } from '@/lib/server/core';

import { pickLocale, t } from '@/lib/i18n';
import { fromCore, hasSession, unauthorized, validNeuronId } from '@/lib/server/require-session';

// A request to the Dominus: it becomes a plan (for a new neuron, or to adjust one), written in the
// owner's language. The core does the rest; this only checks the session and passes it on. With
// files (a form, from the box's clip, a paste or a drop), they are kept first in the data folder
// and the core takes them into the request's research: a request to the core stays small.

export async function POST(request: Request) {
  if (!(await hasSession())) return unauthorized();
  const locale = pickLocale(request.headers.get('accept-language'));
  let text: unknown;
  let target: unknown;
  let attachments: string | undefined;
  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    if (!form) return Response.json({ error: 'invalid form' }, { status: 400 });
    text = form.get('request');
    target = form.get('target');
    const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
    if (files.length)
      try {
        attachments = await saveUploads(
          dataDir(),
          await Promise.all(
            files.map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })),
          ),
        );
      } catch (e) {
        if (e instanceof AttachmentError)
          return Response.json({ error: `attachment: ${e.message}` }, { status: 400 });
        throw e;
      }
    // Only a picture or a file, no words: the files are the request.
    if (attachments && !(typeof text === 'string' && text.trim()))
      text = t(locale).build.attachedOnly;
  } else {
    const b = (await request.json().catch(() => null)) as { request?: unknown; target?: unknown };
    text = b?.request;
    target = b?.target;
  }
  return fromCore(() =>
    coreRequest('POST', '/plans', {
      request: text,
      target: typeof target === 'string' && validNeuronId(target) ? target : undefined,
      locale,
      attachments,
    }),
  );
}
