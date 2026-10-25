// The common pieces of Settings, as in the Cerebro before: the open section's title with one line
// of what it shows, label-and-value lines, and the pills.

export const PILL =
  'inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-5 transition-colors';
export const PRIMARY = `${PILL} bg-white text-[oklch(0.15_0.006_265)]`;
export const SOFT = `${PILL} bg-white/8 hover:text-white`;
export const PLAIN = `${PILL} px-3 hover:text-white`;

export function Header({ title, text }: { title: string; text: string }) {
  return (
    <>
      <h1 className="text-(--cb-highlight)">{title}</h1>
      <p className="mt-1.5">{text}</p>
    </>
  );
}

export function Line({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt>{label}</dt>
      <dd className="text-right text-(--cb-highlight) tabular-nums">{value}</dd>
    </div>
  );
}

export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="mt-10">
      <h2 className="mb-2 text-(--cb-highlight)">{title}</h2>
      {children}
    </section>
  );
}

/** A floating-label field, the same as everywhere in the Cerebro. */
export function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete = 'off',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="relative w-full rounded-[10px] bg-white/4 shadow-[inset_0_0_0_1px_var(--cb-outline)]">
      <input
        id={id}
        type={type}
        value={value}
        placeholder=" "
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="peer block h-14 w-full rounded-[10px] bg-transparent px-3.5 pt-5 text-(--cb-highlight) outline-none focus:shadow-[inset_0_0_0_1px_white]"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute top-[19px] left-3.5 transition-all duration-200 peer-focus:top-[7px] peer-focus:text-[10px] peer-[:not(:placeholder-shown)]:top-[7px] peer-[:not(:placeholder-shown)]:text-[10px]"
      >
        {label}
      </label>
    </div>
  );
}

export async function post<T>(path: string, body: object = {}): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? String(res.status));
  return data as T;
}
