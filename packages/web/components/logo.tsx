/** Crescent-moon brand mark for "Moon Trader". Scales with the `size` prop. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="moon-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00e5a0" />
          <stop offset="1" stopColor="#00b0c8" />
        </linearGradient>
        <mask id="moon-brand-crescent">
          <rect width="64" height="64" fill="black" />
          <circle cx="34" cy="32" r="20" fill="white" />
          <circle cx="44" cy="24" r="18" fill="black" />
        </mask>
      </defs>
      <circle cx="34" cy="32" r="20" fill="url(#moon-brand)" mask="url(#moon-brand-crescent)" />
      <circle cx="42" cy="14" r="2.4" fill="#00e5a0" />
      <circle cx="49" cy="23" r="1.6" fill="#00e5a0" opacity="0.7" />
    </svg>
  )
}
