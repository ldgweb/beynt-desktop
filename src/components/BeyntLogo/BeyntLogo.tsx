// Wordmark "beynt": the letters use currentColor (they follow the context), the b badge keeps the brand colours.
interface Props {
  height?: number
  className?: string
}

export function BeyntLogo({ height = 20, className }: Props) {
  return (
    <svg className={className} height={height} viewBox="0 0 252 112" aria-hidden="true" focusable="false">
      <circle cx="35" cy="58" r="22.5" fill="#e85d04" />
      <path d="M17 20 V76" fill="none" stroke="#e85d04" strokeWidth="9" strokeLinecap="round" />
      <path
        d="M27.5 58 L33.5 64.5 L45 52"
        fill="none"
        stroke="#f5f4f1"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M73 58 H109 A18 18 0 1 0 104.79 69.57" />
        <path d="M127 40 L140.5 76 M154 40 L133.75 94" />
        <path d="M170 40 V76 M170 55 A15 15 0 0 1 200 55 L200 76" />
        <path d="M224 26 V68 A8 8 0 0 0 232 76 M215 40 H235" />
      </g>
    </svg>
  )
}
