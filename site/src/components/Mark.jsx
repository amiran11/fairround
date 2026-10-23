// The FairRound mark: a ring cut into eight equal slices (everyone's equal
// share of the round) around balanced scales (one fair price). Drawn in the
// current text colour; the gaps are a mask, so it works on any background.
let uid = 0;
export default function Mark({ size = 28, title }) {
  const id = `frm-${++uid}`;
  const cuts = [22.5, 67.5, 112.5, 157.5].map((deg) => {
    const a = (deg * Math.PI) / 180, x = 260 * Math.cos(a), y = 260 * Math.sin(a);
    return [256 - x, 256 - y, 256 + x, 256 + y];
  });
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role={title ? "img" : undefined} aria-hidden={title ? undefined : "true"} aria-label={title}>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="white" />
        {cuts.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth="22" />)}
      </mask>
      <circle cx="256" cy="256" r="214" fill="none" stroke="currentColor" strokeWidth="56" mask={`url(#${id})`} />
      <g fill="currentColor">
        <circle cx="256" cy="146" r="22" />
        <rect x="244" y="150" width="24" height="196" rx="10" />
        <rect x="190" y="338" width="132" height="26" rx="13" />
        <rect x="124" y="166" width="264" height="20" rx="10" />
        <path d="M140 186 L106 272 M140 186 L174 272 M372 186 L338 272 M372 186 L406 272" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
        <path d="M92 270 h96 a48 36 0 0 1 -96 0z" />
        <path d="M324 270 h96 a48 36 0 0 1 -96 0z" />
      </g>
    </svg>
  );
}
