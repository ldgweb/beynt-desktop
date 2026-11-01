interface IconProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
})

export function IconTerminal({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <polyline points="5 8 9 12 5 16" />
      <line x1="12" y1="16" x2="18" y2="16" />
    </svg>
  )
}

export function IconSettings({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="9" cy="8" r="2.2" />
      <circle cx="15" cy="16" r="2.2" />
    </svg>
  )
}

export function IconSync({ size = 20 }: IconProps) {
  return <svg {...base(size)} aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.5 7a7 7 0 0 1 11.6-2L20 8M4 16l2.9 3A7 7 0 0 0 18.5 17" /></svg>
}

export function IconAppearance({ size = 20 }: IconProps) {
  return <svg {...base(size)} aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
}

export function IconAccount({ size = 20 }: IconProps) {
  return <svg {...base(size)} aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" /></svg>
}

export function IconSearch({ size = 16 }: IconProps) {
  return <svg {...base(size)} aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
}

export function IconCheck({ size = 16 }: IconProps) {
  return <svg {...base(size)} aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
}

export function IconLibrary({ size = 20 }: IconProps) {
  return <svg {...base(size)} aria-hidden="true"><path d="M4 5h4v14H4zM10 5h4v14h-4zM16.5 5.5l3.5 1-3.5 13-3.5-1" /></svg>
}

/** A note: it opens on the web instead of being copied. */
export function IconNote({ size = 20 }: IconProps) {
  return <svg {...base(size)} aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4" /></svg>
}

/** A favorite: filled when the item is one. */
export function IconStar({ size = 16, filled = false }: IconProps & { filled?: boolean }) {
  return <svg {...base(size)} fill={filled ? 'currentColor' : 'none'} aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>
}

export function IconExternal({ size = 16 }: IconProps) {
  return <svg {...base(size)} aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg>
}
