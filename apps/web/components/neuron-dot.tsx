// A neuron: a point of light, each in its own color. The Dominus is the silver-white one.
export function NeuronDot({
  color,
  label,
  expanded,
  controls,
  onClick,
}: {
  color: string;
  label: string;
  expanded?: boolean;
  controls?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
      className="group relative grid size-16 cursor-pointer place-items-center rounded-full outline-none"
      style={{ '--dot': color } as React.CSSProperties}
    >
      {/* A halo that breathes slowly */}
      <span
        aria-hidden
        className="absolute inset-0 animate-[breathe_4s_ease-in-out_infinite] rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklch, var(--dot) 45%, transparent), transparent 70%)',
        }}
      />
      <span
        aria-hidden
        className="relative size-3 rounded-full transition-transform duration-700 group-hover:scale-125 group-focus-visible:scale-125"
        style={{ background: 'var(--dot)', boxShadow: '0 0 12px var(--dot)' }}
      />
      {/* Only the text, no frame; shows on hover and keyboard focus */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full mb-1 translate-y-1 whitespace-nowrap text-(--cb-highlight) opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}
