'use client';

import { ArrowUp, FileText, Paperclip, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

const HISTORY = 'cerebro.asked';
const KEEP = 30;

/** What the box takes, as in Claude Code: pictures and plain text files, up to six. */
export const ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.tsv,.json,.html,.xml';
const MAX_FILES = 6;
const IMAGE = /^image\/(png|jpeg|webp|gif)$/;
const TEXT = /\.(txt|md|csv|tsv|json|html|xml)$/i;
/** A big picture is made smaller before it goes: the same for the Dominus, fewer tokens. */
const MAX_SIDE = 1600;

/** What the owner asked before, newest last; kept only in this browser, and only if it can. */
function history(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY) ?? '[]');
  } catch {
    return [];
  }
}
function remember(text: string) {
  try {
    const list = history().filter((t) => t !== text);
    localStorage.setItem(HISTORY, JSON.stringify([...list, text].slice(-KEEP)));
  } catch {
    // Not kept in this browser; the box works the same.
  }
}

/** A picture larger than MAX_SIDE, redrawn smaller (WebP); anything else as it is. */
async function smaller(file: File): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = MAX_SIDE / Math.max(bitmap.width, bitmap.height);
    if (scale >= 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * Math.min(1, scale));
    canvas.height = Math.round(bitmap.height * Math.min(1, scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.9));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.\w+$/, '') || 'imagem'}.webp`, {
      type: 'image/webp',
    });
  } catch {
    return file;
  }
}

type Attached = { file: File; url: string | null };

/**
 * The files of the box, as in Claude Code: from the clip, pasted (Ctrl+V) or dropped on it, up to
 * six, each with its preview.
 */
function useAttachments(tooMany: string) {
  const [files, setFiles] = useState<Attached[]>([]);
  const [note, setNote] = useState('');
  const [over, setOver] = useState(false);

  // The previews live as long as their file is in the box.
  const shown = useRef(files);
  useEffect(() => {
    shown.current = files;
  }, [files]);
  useEffect(() => () => shown.current.forEach((f) => f.url && URL.revokeObjectURL(f.url)), []);

  async function add(list: FileList | File[]) {
    const wanted = [...list];
    const ok = wanted.filter((f) => IMAGE.test(f.type) || TEXT.test(f.name));
    const room = MAX_FILES - files.length;
    setNote(ok.length < wanted.length || ok.length > room ? tooMany : '');
    const ready = await Promise.all(ok.slice(0, Math.max(0, room)).map(smaller));
    setFiles((now) => [
      ...now,
      ...ready.map((file) => ({
        file,
        url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })),
    ]);
  }

  function remove(i: number) {
    setFiles((now) => {
      const gone = now[i];
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return now.filter((_, j) => j !== i);
    });
    setNote('');
  }

  function clear() {
    files.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    setFiles([]);
    setNote('');
  }

  /** On the box around the field: a file dragged over it lights it, dropped it joins. */
  const drop = {
    onDragOver: (e: React.DragEvent) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      setOver(false);
      void add(e.dataTransfer.files);
    },
  };

  /** On the field: a picture copied (a print, a drawing) joins the box. Text pastes as text. */
  function onPaste(e: React.ClipboardEvent) {
    const pasted = [...e.clipboardData.files];
    if (!pasted.length) return;
    if (!e.clipboardData.types.includes('text/plain')) e.preventDefault();
    void add(pasted);
  }

  return { files, note, over, add, remove, clear, drop, onPaste };
}

/** The clip button and its hidden file picker. */
function AttachButton({ box, label }: { box: ReturnType<typeof useAttachments>; label: string }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => picker.current?.click()}
        aria-label={label}
        title={label}
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-md hover:text-(--cb-highlight)"
      >
        <Paperclip aria-hidden className="size-4" strokeWidth={1.75} />
      </button>
      <input
        ref={picker}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          if (e.target.files) void box.add(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** The files in the box: a preview of each picture, the name of each text, an x to take it out. */
function AttachedList({
  box,
  removeLabel,
}: {
  box: ReturnType<typeof useAttachments>;
  removeLabel: (name: string) => string;
}) {
  if (!box.files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2 px-2 pt-0.5 pb-2.5">
      {box.files.map((f, i) => (
        <li key={`${f.file.name}-${i}`} className="relative">
          {f.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:)
            <img
              src={f.url}
              alt={f.file.name}
              className="size-14 rounded-md object-cover shadow-[inset_0_0_0_1px_var(--cb-outline)]"
            />
          ) : (
            <span className="flex h-14 max-w-44 items-center gap-1.5 rounded-md bg-white/6 px-2.5 text-(--cb-highlight)">
              <FileText aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{f.file.name}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => box.remove(i)}
            aria-label={removeLabel(f.file.name)}
            className="absolute -top-2.5 -right-2.5 grid size-7 cursor-pointer place-items-center"
          >
            <span className="grid size-5 place-items-center rounded-full bg-white text-black">
              <X aria-hidden className="size-3" strokeWidth={2.25} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The one box to talk to the Dominus, the same everywhere in the Cerebro: at the foot of the
 * screen, in a neuron's adjustments and in a plan (to answer it or change it); only what it is
 * about changes, by its labels and what it sends to. The name is inside the field;
 * the send button shows only when there is something to send; while the Dominus works it becomes
 * the stop button (Esc does the same). Enter sends, Shift+Enter breaks the line, and ↑ ↓ (from
 * the first or last line) bring back what was asked before, as in a terminal. As in Claude Code,
 * it takes pictures and text files: from the clip, pasted (Ctrl+V) or dropped on it.
 */
export function DominusBox({
  label,
  sendLabel,
  stopLabel,
  attachLabel,
  removeLabel,
  tooMany,
  busy,
  onSend,
  onStop,
  className = '',
  docked = false,
  autoFocus = false,
}: {
  label: string;
  sendLabel: string;
  stopLabel: string;
  attachLabel: string;
  removeLabel: (name: string) => string;
  /** Said when a file is not one the box takes, or there are too many. */
  tooMany: string;
  busy: boolean;
  onSend: (text: string, files: File[]) => Promise<boolean>;
  onStop: () => void;
  className?: string;
  /** Inside a panel (a neuron's adjustments, a plan), not fixed at the foot of the screen. */
  docked?: boolean;
  /** Takes the keyboard when it appears (a plan's "Change" opens it to write). */
  autoFocus?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const box = useAttachments(tooMany);
  const { files, note, over } = box;
  // Where ↑ ↓ are in the history: null while writing something new.
  const at = useRef<number | null>(null);

  async function submit() {
    if (busy) return onStop();
    const value = text.trim();
    if ((!value && !files.length) || sending) return;
    setSending(true);
    if (
      await onSend(
        value,
        files.map((f) => f.file),
      )
    ) {
      if (value) remember(value);
      at.current = null;
      setText('');
      box.clear();
    }
    setSending(false);
  }

  const show = busy || text.trim().length > 0 || files.length > 0;
  return (
    <form
      data-avoid
      className={`${docked ? 'relative w-full' : 'fixed bottom-6 left-1/2 z-40 w-[min(100%-32px,40rem)] -translate-x-1/2'} ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      {...box.drop}
    >
      <div
        className={`cb-light rounded-[10px] bg-[oklch(0.13_0.006_265/0.75)] py-2.5 pr-2.5 pl-1.5 backdrop-blur-md transition-shadow has-[textarea:focus-visible]:shadow-[inset_0_0_0_1px_oklch(1_0_0/45%)] ${over ? 'shadow-[inset_0_0_0_1px_oklch(1_0_0/45%)]' : ''}`}
        data-busy={busy ? '' : undefined}
      >
        <span aria-hidden className="cb-light-run" />
        <AttachedList box={box} removeLabel={removeLabel} />
        <div className="flex min-h-9 items-end gap-1">
          <AttachButton box={box} label={attachLabel} />
          <div className="relative flex-1">
            <textarea
              id={id}
              rows={1}
              autoFocus={autoFocus}
              value={text}
              placeholder=" "
              maxLength={4000}
              onChange={(e) => {
                at.current = null;
                setText(e.target.value);
              }}
              onPaste={box.onPaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                } else if (e.key === 'Escape' && busy) onStop();
                else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  const box = e.currentTarget;
                  const first = !box.value.slice(0, box.selectionStart).includes('\n');
                  const last = !box.value.slice(box.selectionEnd).includes('\n');
                  const list = history();
                  if (e.key === 'ArrowUp' && first && list.length) {
                    e.preventDefault();
                    at.current = Math.max(0, (at.current ?? list.length) - 1);
                    setText(list[at.current]!);
                  } else if (e.key === 'ArrowDown' && last && at.current !== null) {
                    e.preventDefault();
                    at.current = at.current + 1 < list.length ? at.current + 1 : null;
                    setText(at.current === null ? '' : list[at.current]!);
                  }
                }
              }}
              className="peer block [field-sizing:content] max-h-[8lh] min-h-[1lh] w-full resize-none bg-transparent pt-3.5 pb-0.5 text-(--cb-highlight) outline-none"
            />
            <label
              htmlFor={id}
              className="pointer-events-none absolute top-[9px] left-0 transition-all duration-200 peer-focus:-top-1 peer-focus:text-[10px] peer-[:not(:placeholder-shown)]:-top-1 peer-[:not(:placeholder-shown)]:text-[10px]"
            >
              {label}
            </label>
          </div>
          {show && (
            <button
              type="submit"
              aria-label={busy ? stopLabel : sendLabel}
              className="grid size-11 shrink-0 animate-[cb-pop_0.2s_ease-out] cursor-pointer place-items-center"
            >
              <span className="grid size-9 place-items-center rounded-md bg-white text-black">
                {busy ? (
                  <span aria-hidden className="size-2.5 rounded-[2px] bg-black" />
                ) : (
                  <ArrowUp aria-hidden className="size-4" strokeWidth={2} />
                )}
              </span>
            </button>
          )}
        </div>
      </div>
      {note && (
        <p role="status" className="mt-1.5 text-center">
          {note}
        </p>
      )}
    </form>
  );
}
