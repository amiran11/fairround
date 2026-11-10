// The home page's orbit illustration, reusable: a centre icon, people around
// it, two floating safety cues and a small card that says plainly what the
// page is for. Decorative except for the card, which carries real text.
import { UserRound } from "lucide-react";

const SEATS = [0, 40, 140, 180, 220, 320];

export default function PageArt({ Icon, chips, card }) {
  const [a, b] = chips;
  return (
    <div className="hero-art page-art">
      <div className="hero-orbit" aria-hidden="true">
        <div className="hero-glow" />
        {SEATS.map((deg, i) => (
          <span key={deg} className={`seat seat-${i % 3}`} style={{ transform: `rotate(${deg}deg) translate(var(--orbit)) rotate(${-deg}deg)` }}>
            <UserRound size={18} />
          </span>
        ))}
        <span className="hero-mark page-art-mark"><Icon size={84} strokeWidth={1.6} /></span>
        <span className="hero-chip hero-chip-a"><a.Icon size={14} /> {a.text}</span>
        <span className="hero-chip hero-chip-b"><b.Icon size={14} /> {b.text}</span>
      </div>
      <div className="round-ticket">
        <span className="ticket-tag">{card.tag}</span>
        <strong className="ticket-name">{card.title}</strong>
        {card.lines.map((l, i) => <p key={i} className="small muted">{l}</p>)}
      </div>
    </div>
  );
}
