// FairRound mark: a ring cut into 8 equal slices by even gaps, a dot in the middle.
// Gaps are a mask, so the mark works on any background, including transparent.
let n = 0;
export function mark(size, col) {
  const id = "frm" + (n++);
  let lines = "";
  for (let i = 0; i < 4; i++) {
    const a = (i * 45 + 22.5) * Math.PI / 180, x = 250 * Math.cos(a), y = 250 * Math.sin(a);
    lines += `<line x1="${(256 - x).toFixed(1)}" y1="${(256 - y).toFixed(1)}" x2="${(256 + x).toFixed(1)}" y2="${(256 + y).toFixed(1)}" stroke="black" stroke-width="22"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="white"/>${lines}</mask><circle cx="256" cy="256" r="182" fill="none" stroke="${col}" stroke-width="100" mask="url(#${id})"/><circle cx="256" cy="256" r="50" fill="${col}"/></svg>`;
}
