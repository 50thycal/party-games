"use client";

import { ENGINEERING_CARDS, engineeringById, type EngineeringCard } from "./config";

// ============================================================================
// Engineering card artwork.
//
// Every objective is drawn as a small pegboard sketch so players can read the
// geometry at a glance instead of parsing the tolerance wording. Diagrams are
// laid out on a 120x64 grid: pegs at x = 12 + 16i, y = 16 + 16j.
// ============================================================================

const OPPONENT = "#64748b";
const PEG = "#d8c3a0";
const RULE = "#a1887f";

const PEG_COLUMNS = 7;
const PEG_ROWS = 3;

type P = [number, number];

function PegField() {
  const dots = [];
  for (let j = 0; j < PEG_ROWS; j++) {
    for (let i = 0; i < PEG_COLUMNS; i++) {
      dots.push(<circle key={`${i}-${j}`} cx={12 + i * 16} cy={16 + j * 16} r="2" fill={PEG} />);
    }
  }
  return <g>{dots}</g>;
}

/** A route: white casing, colored string, then peg heads at each node. */
function Route({
  points,
  color,
  dashed,
  nodes = true,
  width = 5,
}: {
  points: P[];
  color: string;
  dashed?: boolean;
  nodes?: boolean;
  width?: number;
}) {
  const d = points.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <g>
      <polyline points={d} fill="none" stroke="#fdf6e3" strokeWidth={width + 3.5} strokeLinecap="round" strokeLinejoin="round" />
      <polyline
        points={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashed ? "7 5" : undefined}
      />
      {nodes &&
        points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill={color} stroke="#ffffff" strokeWidth="1.6" />
        ))}
    </g>
  );
}

function StationTile({ x, y, major = false }: { x: number; y: number; major?: boolean }) {
  const w = major ? 26 : 22;
  const h = 17;
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx="4"
        fill={major ? "#24384c" : "#4f6357"}
        stroke="#f5d98a"
        strokeWidth="1.8"
      />
      <text x={x} y={y + 3.2} textAnchor="middle" fontSize="8" fontWeight="700" fill="#f5d98a">
        {major ? "MAJ" : "MIN"}
      </text>
    </g>
  );
}

/** Small arc at a vertex plus a caption placed clear of the route. */
function AngleMark({
  x,
  y,
  label,
  labelDx = 2,
  labelDy = -15,
}: {
  x: number;
  y: number;
  label: string;
  labelDx?: number;
  labelDy?: number;
}) {
  return (
    <g>
      <path d={`M ${x - 13} ${y} A 13 13 0 0 1 ${x + 9} ${y - 9}`} fill="none" stroke={RULE} strokeWidth="1.4" strokeDasharray="3 2" />
      <text x={x + labelDx} y={y + labelDy} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={RULE}>
        {label}
      </text>
    </g>
  );
}

function SpanMark({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  return (
    <g stroke={RULE} fill={RULE}>
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} strokeWidth="1.4" />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} strokeWidth="1.4" />
      <line x1={x1} y1={y} x2={x2} y2={y} strokeWidth="1.4" strokeDasharray="3 2" />
      <text x={(x1 + x2) / 2} y={y + 12} textAnchor="middle" fontSize="8.5" fontWeight="700" stroke="none">
        {label}
      </text>
    </g>
  );
}

function Tick({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M ${x - 4} ${y} l 3 3.5 l 6 -8`}
      fill="none"
      stroke="#15803d"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** The diagram body for one Engineering card id. */
function Diagram({ id, color }: { id: string; color: string }) {
  switch (id) {
    case "gentle":
      return (
        <>
          <Route points={[[12, 50], [38, 42], [64, 32], [96, 28]]} color={color} />
          <AngleMark x={38} y={42} label="≤30°" labelDx={-8} labelDy={-16} />
        </>
      );
    case "bend":
      return (
        <>
          <Route points={[[12, 48], [56, 48], [94, 16]]} color={color} />
          <AngleMark x={56} y={48} label="31–50°" labelDx={-20} labelDy={-14} />
        </>
      );
    case "straight":
      return (
        <>
          <Route points={[[12, 32], [40, 32], [68, 32], [104, 32]]} color={color} />
          <line x1="12" y1="46" x2="104" y2="46" stroke={RULE} strokeWidth="1.4" strokeDasharray="3 2" />
          <text x="58" y="58" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={RULE}>
            3 segments · ≤15°
          </text>
        </>
      );
    case "approach":
      return (
        <>
          <Route points={[[10, 50], [40, 42], [70, 34], [96, 27]]} color={color} nodes />
          <StationTile x={96} y={27} major />
          <AngleMark x={40} y={42} label="≤15°" labelDx={-10} labelDy={-16} />
        </>
      );
    case "through":
      return (
        <>
          <Route points={[[10, 32], [42, 32], [66, 32], [90, 32], [110, 32]]} color={color} />
          <StationTile x={66} y={32} />
          <text x="60" y="56" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={RULE}>
            in and out, ≤30°
          </text>
        </>
      );
    case "long-segment":
      return (
        <>
          <Route points={[[12, 26], [92, 26]]} color={color} />
          <SpanMark x1={12} x2={92} y={44} label="5+ pegs" />
        </>
      );
    case "parallel":
      return (
        <>
          <Route points={[[14, 18], [52, 14], [92, 18]]} color={OPPONENT} nodes={false} width={4} />
          <Route points={[[14, 40], [52, 36], [92, 40]]} color={color} />
          <line x1="52" y1="18" x2="52" y2="34" stroke={RULE} strokeWidth="1.4" strokeDasharray="2 2" />
          <text x="86" y="56" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={RULE}>
            within 15°
          </text>
        </>
      );
    case "terminal":
      return (
        <>
          <Route points={[[10, 42], [40, 36], [70, 30], [96, 24]]} color={color} />
          <StationTile x={96} y={24} />
          <Tick x={86} y={44} />
          <text x="54" y="60" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={RULE}>
            finish on a station
          </text>
        </>
      );
    case "minimal":
      return (
        <>
          <Route points={[[14, 18], [44, 18], [72, 22]]} color={color} width={4} />
          <Tick x={88} y={18} />
          <Route points={[[14, 46], [44, 50], [72, 44]]} color={color} dashed width={4} />
          <Tick x={88} y={46} />
          <text x="60" y="34" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={RULE}>
            every contract delivered
          </text>
        </>
      );
    case "crossing":
      return (
        <>
          <Route points={[[14, 16], [102, 50]]} color={OPPONENT} nodes={false} width={4} />
          <Route points={[[14, 50], [102, 16]]} color={color} nodes={false} />
          <circle cx="58" cy="33" r="10" fill="none" stroke={RULE} strokeWidth="1.6" strokeDasharray="3 2" />
          <text x="58" y="60" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={RULE}>
            one permitted crossing
          </text>
        </>
      );
    default:
      return null;
  }
}

/** Pegboard sketch of what an Engineering card asks you to build. */
export function EngineeringArt({ id, color }: { id: string; color: string }) {
  return (
    <svg viewBox="0 0 120 64" className="h-auto w-full rounded-lg bg-[#f3e6cd]" role="img" aria-hidden>
      <PegField />
      <Diagram id={id} color={color} />
    </svg>
  );
}

// ============================================================================
// Full card face — used everywhere an Engineering card is shown, so players can
// always read the whole card rather than just its name.
// ============================================================================

export type EngineeringCardState = "idle" | "selected" | "committed" | "met" | "missed";

export function EngineeringCardFace({
  card,
  color,
  state = "idle",
  footer,
  onClick,
  disabled,
  compact,
}: {
  card: EngineeringCard | string;
  color: string;
  state?: EngineeringCardState;
  footer?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const resolved = typeof card === "string" ? engineeringById(card) : card;
  if (!resolved) return null;

  const chrome: Record<EngineeringCardState, string> = {
    idle: "border-stone-300",
    selected: "border-amber-500 ring-2 ring-amber-300",
    committed: "border-stone-800",
    met: "border-emerald-600 ring-2 ring-emerald-200",
    missed: "border-stone-300 opacity-60",
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <strong className="text-[13px] leading-tight text-stone-900">{resolved.name}</strong>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
            resolved.kind === "permission" ? "bg-sky-800 text-sky-50" : "bg-amber-600 text-white"
          }`}
        >
          +{resolved.vp}
        </span>
      </div>
      <div className="mt-1.5">
        <EngineeringArt id={resolved.id} color={color} />
      </div>
      {!compact && <p className="mt-1.5 text-[11px] leading-snug text-stone-600">{resolved.description}</p>}
      <p className="mt-1 text-[11px] font-semibold leading-snug text-stone-700">{resolved.requirement}</p>
      {footer}
    </>
  );

  const shell = `w-full rounded-xl border-2 bg-[#fffaf0] p-2.5 text-left shadow-sm ${chrome[state]}`;

  if (!onClick) return <div className={shell}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${shell} transition ${disabled ? "opacity-45" : "hover:-translate-y-0.5 hover:border-stone-400"}`}
    >
      {body}
    </button>
  );
}

export const ALL_ENGINEERING = ENGINEERING_CARDS;
