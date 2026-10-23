// The FairRound mark: a round cut into eight equal slices, a dot in the
// middle. Drawn in the current text colour; the gaps are a mask, so it
// works on any background.
let uid = 0;
export default function Mark({ size = 28, title }) {
  const id = `frm-${++uid}`;
  const cuts = [22.5, 67.5, 112.5, 157.5].map((deg) => {
    const a = (deg * Math.PI) / 180, x = 250 * Math.cos(a), y = 250 * Math.sin(a);
    return [256 - x, 256 - y, 256 + x, 256 + y];
  });
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role={title ? "img" : undefined} aria-hidden={title ? undefined : "true"} aria-label={title}>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="white" />
        {cuts.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth="22" />)}
      </mask>
      <circle cx="256" cy="256" r="182" fill="none" stroke="currentColor" strokeWidth="100" mask={`url(#${id})`} />
      <circle cx="256" cy="256" r="50" fill="currentColor" />
    </svg>
  );
}
