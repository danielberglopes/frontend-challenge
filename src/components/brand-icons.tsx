import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement>

const base = { width: 24, height: 24, viewBox: "0 0 24 24", "aria-hidden": true } as const

export function FacebookIcon(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <path d="M13.4 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.7v3h2.6V21h3.1z" />
    </svg>
  )
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TwitterIcon(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <path d="M21 6.2c-.7.3-1.4.5-2.1.6.8-.5 1.3-1.2 1.6-2-.7.4-1.5.7-2.3.9a3.6 3.6 0 0 0-6.2 3.3C9 8.8 6.3 7.4 4.5 5.2c-1 1.7-.5 3.8 1.1 4.8-.6 0-1.1-.2-1.6-.4 0 1.8 1.2 3.3 2.9 3.6-.5.1-1.1.2-1.6.1.5 1.5 1.9 2.5 3.4 2.5A7.3 7.3 0 0 1 3 17.3 10.3 10.3 0 0 0 18.8 8.6v-.5c.9-.5 1.6-1.2 2.2-1.9z" />
    </svg>
  )
}

export function LinkedinIcon(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <path d="M6.9 8.8H3.8V20h3.1V8.8zM5.4 4a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM20.2 13.6c0-3-1.6-5-4.3-5-1.4 0-2.4.8-2.8 1.5V8.8H10V20h3.1v-5.8c0-1.5.6-2.6 2-2.6s1.9 1 1.9 2.6V20h3.2v-6.4z" />
    </svg>
  )
}

export function YoutubeIcon(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3L10 15z" />
    </svg>
  )
}

export function GoogleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9L6.4 14z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6z" />
    </svg>
  )
}

export function ThankYouIcon(props: IconProps) {
  return (
    <svg width={68} height={82} viewBox="0 0 68 82" fill="none" aria-hidden="true" {...props}>
      <g stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round">
        <path d="M4 34v44h60V34" />
        <path d="M4 78l24-22M64 78L40 56" />
        <path d="M4 34l30 24 30-24" />
        <path d="M11 40V8a3 3 0 0 1 3-3h40a3 3 0 0 1 3 3v32" />
        <path d="M27 5l7-4 7 4" />
      </g>
      <text x="34" y="26" textAnchor="middle" fontFamily="inherit" fontWeight={800} fontSize={12} fill="currentColor">
        THANK
      </text>
      <text x="34" y="39" textAnchor="middle" fontFamily="inherit" fontWeight={800} fontSize={12} fill="currentColor">
        YOU
      </text>
    </svg>
  )
}
