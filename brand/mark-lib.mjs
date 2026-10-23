// FairRound mark: a ring cut into 8 equal slices (everyone's equal share of
// the round) around balanced scales (one fair price). Gaps are a mask, so the
// mark works on any background, including transparent.
let n = 0;
export function mark(size, col) {
  const id = "frm" + (n++);
  let cuts = "";
  for (let i = 0; i < 4; i++) {
    const a = (i * 45 + 22.5) * Math.PI / 180, x = 260 * Math.cos(a), y = 260 * Math.sin(a);
    cuts += `<line x1="${(256 - x).toFixed(1)}" y1="${(256 - y).toFixed(1)}" x2="${(256 + x).toFixed(1)}" y2="${(256 + y).toFixed(1)}" stroke="black" stroke-width="22"/>`;
  }
  const scales =
    `<circle cx="256" cy="146" r="22"/>` +
    `<rect x="244" y="150" width="24" height="196" rx="10"/>` +
    `<rect x="190" y="338" width="132" height="26" rx="13"/>` +
    `<rect x="124" y="166" width="264" height="20" rx="10"/>` +
    `<path d="M140 186 L106 272 M140 186 L174 272 M372 186 L338 272 M372 186 L406 272" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="M92 270 h96 a48 36 0 0 1 -96 0z"/><path d="M324 270 h96 a48 36 0 0 1 -96 0z"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="white"/>${cuts}</mask><circle cx="256" cy="256" r="214" fill="none" stroke="${col}" stroke-width="56" mask="url(#${id})"/><g fill="${col}">${scales}</g></svg>`;
}
