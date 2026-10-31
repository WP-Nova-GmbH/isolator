// Source artwork and usage rules: docs/brand/ and docs/design-system.md.
// Ink parts use currentColor; the dot uses the brand-dot token so both follow the theme.

interface LogoProps {
  className?: string;
}

function MarkShapes() {
  return (
    <>
      <path
        d="M4 11V4H11M21 4H28V11M28 21V28H21M11 28H4V21"
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
      />
      <rect x={13.25} y={14.5} width={5.5} height={10.5} fill="currentColor" />
      <rect x={13.25} y={7} width={5.5} height={5.5} className="fill-brand-dot" />
    </>
  );
}

function WordmarkShapes() {
  return (
    <>
      <g fill="none" stroke="currentColor" strokeWidth={4.5}>
        <path d="M2.25 20V40" />
        <path d="M22.25 24.4C21.4 22.9 19.6 22.25 17 22.25C13.9 22.25 11.75 23.8 11.75 26.1C11.75 28.6 14 29.4 17 30C20 30.6 22.25 31.4 22.25 33.9C22.25 36.2 20.1 37.75 17 37.75C14.4 37.75 12.6 37.1 11.75 35.6" />
        <circle cx={39.5} cy={30} r={7.75} />
        <path d="M56.75 10V40" />
        <circle cx={74} cy={30} r={7.75} />
        <path d="M81.75 20V40" />
        <path d="M94 12V40M89 22.25H100" />
        <circle cx={114} cy={30} r={7.75} />
        <path d="M131.25 20V40M131.25 30A7.75 7.75 0 0 1 139 22.25H141" />
      </g>
      <rect x={0} y={12} width={4.5} height={4.5} className="fill-brand-dot" />
    </>
  );
}

/** The bracketed "i" on its own: favicons, avatars, tight spaces. */
export function Mark({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Isolator">
      <MarkShapes />
    </svg>
  );
}

/** Mark and wordmark side by side. The default sign-off. */
export function Logo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 193 40" className={className} role="img" aria-label="Isolator">
      <g transform="scale(1.25)">
        <MarkShapes />
      </g>
      <g transform="translate(52 -9)">
        <WordmarkShapes />
      </g>
    </svg>
  );
}
