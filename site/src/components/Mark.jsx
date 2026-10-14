// The nine-eyed sun (ცხრათვალა მზე), drawn in the current text colour.
export default function Mark({ size = 28, title }) {
  const wings = [0, 40, 80, 120, 160, 200, 240, 280, 320];
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role={title ? "img" : undefined} aria-hidden={title ? undefined : "true"} aria-label={title}>
      <circle cx="256" cy="256" r="232" fill="none" stroke="currentColor" strokeWidth="22" />
      <g fill="currentColor">
        {wings.map((r) => (
          <path key={r} transform={`rotate(${r} 256 256)`} d="M 256 256 C 222 224, 204 168, 224 104 C 236 86, 250 86, 256 96 C 266 140, 268 200, 256 256 Z" />
        ))}
      </g>
      <circle cx="256" cy="256" r="24" fill="var(--paper)" stroke="currentColor" strokeWidth="10" />
    </svg>
  );
}
