import { AttachmentError, saveUploads } from '@cerebro/dominus/attachments';
import { dataDir } from '@cerebro/dominus/data-dir';

import { coreRequest } from '@/lib/server/core';

import { pickLocale, t } from '@/lib/i18n';
import { fromCore, hasSession, unauthorized, validPlanId } from '@/lib/server/require-session';

// What the owner does with a plan: answer its questions or ask for changes, accept (build),
// reject, stop what is running, or take an adjustment back. An answer may come as a form with
// files (a drawing of the screen wanted): kept first in the data folder, as with a request.

const ACTIONS = new Set(['answer', 'accept', 'reject', 'cancel', 'undo']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  if (!(await hasSession())) return unauthorized();
  const { id, action } = await params;
  if (!validPlanId(id) || !ACTIONS.has(action))
    return Response.json({ error: 'not found' }, { status: 404 });
  if (
    action === 'answer' &&
    request.headers.get('content-type')?.startsWith('multipart/form-data')
  ) {
    const form = await request.formData().catch(() => null);
    if (!form) return Response.json({ error: 'invalid form' }, { status: 400 });
    let text = form.get('text');
    const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
    let attachments: string | undefined;
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
    // Only a picture, no words: the picture is the answer.
    if (attachments && !(typeof text === 'string' && text.trim()))
      text = t(pickLocale(request.headers.get('accept-language'))).build.attachedOnly;
    return fromCore(() => coreRequest('POST', `/plans/${id}/answer`, { text, attachments }));
  }
  const b = (await request.json().catch(() => ({}))) as { text?: unknown; improvements?: unknown };
  // Accepting a copy: the improvements the owner ticked, by their order in the research.
  const improvements = Array.isArray(b.improvements)
    ? b.improvements.filter((i) => Number.isInteger(i)).slice(0, 10)
    : [];
  const body = action === 'answer' ? { text: b.text } : action === 'accept' ? { improvements } : {};
  return fromCore(() => coreRequest('POST', `/plans/${id}/${action}`, body));
}
