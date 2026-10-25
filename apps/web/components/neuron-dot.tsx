export const DOMINUS_COLOR = 'oklch(0.92 0.015 250)';

// A neuron: a point of light, each in its own color. The Dominus is the silver-white one.
// Without onClick it is only a picture (nothing on the screen looks touchable for nothing).
export function NeuronDot({
  color,
  label,
  expanded,
  controls,
  onClick,
  busy = false,
}: {
  color: string;
  label: string;
  expanded?: boolean;
  controls?: string;
  onClick?: () => void;
  /** Thinking or building: it grows and the halo breathes faster. */
  busy?: boolean;
}) {
  const Tag = onClick ? 'button' : 'span';
  const role = onClick
    ? { type: 'button' as const, 'aria-expanded': expanded, 'aria-controls': controls, onClick }
    : { role: 'img' };
  return (
    <Tag
      {...role}
      aria-label={label}
      className={`group relative grid size-16 place-items-center rounded-full transition-transform duration-500 outline-none ${onClick ? 'cursor-pointer' : ''} ${busy ? 'scale-125' : ''}`}
      style={{ '--dot': color } as React.CSSProperties}
    >
      {/* A halo that breathes slowly */}
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full ${busy ? 'animate-[breathe_1.4s_ease-in-out_infinite]' : 'animate-[breathe_4s_ease-in-out_infinite]'}`}
        style={{
          transition: 'background 0.8s',
          background:
            'radial-gradient(circle, color-mix(in oklch, var(--dot) 45%, transparent), transparent 70%)',
        }}
      />
      <span
        aria-hidden
        className="relative size-3 rounded-full transition-[transform,background-color,box-shadow] duration-700 group-hover:scale-125 group-focus-visible:scale-125"
        style={{ background: 'var(--dot)', boxShadow: '0 0 12px var(--dot)' }}
      />
      {/* Only the text, no frame; shows on hover and keyboard focus */}
      {onClick && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full mb-1 translate-y-1 whitespace-nowrap text-(--cb-highlight) opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
        >
          {label}
        </span>
      )}
    </Tag>
  );
}
