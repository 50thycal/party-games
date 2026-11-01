import { normalizeDegrees } from "./geography";

const COLORS = ["#a78bfa", "#fb923c", "#60a5fa", "#f472b6", "#facc15", "#e879f9"];
export function guessColor(index: number): string { return COLORS[index % COLORS.length]; }

export function Compass({ answer, guesses = [], draft }: {
  answer?: number;
  guesses?: { name: string; value: number; color: string }[];
  draft?: number;
}) {
  function ray(value: number, color: string, length: number, key: string, width = 2) {
    const angle = normalizeDegrees(value) * Math.PI / 180;
    return <line key={key} x1="130" y1="130" x2={130 + Math.sin(angle) * length}
      y2={130 - Math.cos(angle) * length} stroke={color} strokeWidth={width} strokeLinecap="round" />;
  }
  return (
    <svg viewBox="0 0 260 260" role="img" aria-label={answer === undefined
      ? "Compass: north 0 degrees, east 90, south 180, west 270"
      : `Answer compass: ${answer.toFixed(1)} degrees; ${guesses.map((g) => `${g.name} ${g.value} degrees`).join(", ")}`}
      className="mx-auto w-full max-w-[260px]">
      <circle cx="130" cy="130" r="96" fill="#0b1724" stroke="#334155" />
      <circle cx="130" cy="130" r="64" fill="none" stroke="#1e293b" strokeDasharray="2 6" />
      {Array.from({ length: 24 }, (_, index) => {
        const a = index * Math.PI / 12;
        return <line key={index} x1={130 + Math.sin(a) * 88} y1={130 - Math.cos(a) * 88}
          x2={130 + Math.sin(a) * 96} y2={130 - Math.cos(a) * 96} stroke="#475569" />;
      })}
      <path d="M130 43v174M43 130h174" stroke="#1e293b" />
      <g fill="#cbd5e1" fontSize="12" fontFamily="system-ui" textAnchor="middle">
        <text x="130" y="19" fill="#5eead4">N · 0°</text>
        <text x="130" y="253">S · 180°</text>
        <text x="237" y="126">E</text><text x="237" y="142">90°</text>
        <text x="23" y="126">W</text><text x="23" y="142">270°</text>
      </g>
      {guesses.map((guess, index) => ray(guess.value, guess.color, 74, `guess-${index}`))}
      {draft !== undefined && ray(draft, "#5eead4", 82, "draft", 3)}
      {answer !== undefined && ray(answer, "#5eead4", 91, "answer", 4)}
      <circle cx="130" cy="130" r="5" fill="#e2e8f0" />
    </svg>
  );
}
