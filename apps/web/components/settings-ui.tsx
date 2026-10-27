// The common pieces of Settings, as in the Cerebro before: the open section's title,
// label-and-value lines, and the pills.

// The buttons are the Cerebro's one button (button.ts).
export { BTN_PLAIN as PLAIN, BTN_PRIMARY as PRIMARY, BTN_SOFT as SOFT } from './button';


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
    <section aria-label={title} className="border-t border-white/6 py-8 first:border-t-0 first:pt-0 last:pb-0">
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
