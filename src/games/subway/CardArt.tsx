"use client";

import {
  ENGINEERING_CARDS,
  destinationById,
  engineeringById,
  stationById,
  type DestinationCard,
  type EngineeringCard,
} from "./config";

// ============================================================================
// Engineering card artwork.
//
// Every objective is drawn as a small pegboard sketch so players can read the
// geometry at a glance instead of parsing the tolerance wording. Diagrams are
// laid out on a 120x64 grid: pegs at x = 12 + 16i, y = 16 + 16j.
// ============================================================================

const PEG = "#d8c3a0";
const RULE = "#a1887f";

/** Row-major mapping of the 24-panel vintage transit illustration atlas. */
export const ENGINEERING_ART_IDS = [
  "gentle", "bend", "straight", "approach", "through", "network",
  "parallel", "terminal", "minimal", "crossing", "crosstown-service", "local-service",
  "interchange", "solvent", "dest-market", "dest-grand", "dest-museum", "dest-garden",
  "dest-stadium", "dest-university", "dest-library", "dest-theatre", "dest-airport", "dest-harbor",
] as const;

function EngineeringIllustration({id}:{id:string}) {
  const illustratedId = ({perimeter:"crosstown-service", "three-fronts":"network", "four-corners":"parallel"} as Record<string,string>)[id] ?? id;
  const index = ENGINEERING_ART_IDS.findIndex(value => value === illustratedId);
  if (index < 0) return null;
  return <div aria-hidden="true" data-engineering-art={id} className="mt-2 w-full rounded-lg" style={{
    aspectRatio:"1", backgroundImage:"url(/subway/engineering-cards.png)",
    backgroundSize:"600% 400%", backgroundPosition:`${(index % 6)*20}% ${Math.floor(index/6)*100/3}%`,
  }} />;
}

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

/** The diagram body for one Engineering card id. */
function Diagram({ id, color }: { id: string; color: string }) {
  const shapes: Record<string, {paths:P[][]; label:string}> = {
    gentle: {paths:[[[12,30],[36,20],[36,10]],[[12,38],[58,32],[108,32]],[[12,46],[80,46],[80,54]]], label:"3 different end borders"},
    bend: {paths:[[[12,28],[32,28],[32,10]],[[108,28],[80,28],[80,10]],[[12,38],[56,38],[56,54]]], label:"E/W starts → N/S ends"},
    straight: {paths:[[[12,24],[34,24],[34,42],[12,42]],[[46,10],[46,30],[66,30],[66,10]],[[108,24],[86,24],[86,42],[108,42]]], label:"Each line returns to its side"},
    through: {paths:[[[28,10],[28,54]],[[58,10],[58,54]],[[90,10],[90,54]]], label:"All 3 lines: north + south"},
    network: {paths:[[[12,42],[42,32]],[[42,32],[76,32]],[[76,32],[108,20]]], label:"3 completed lines · connected"},
    perimeter: {paths:[[[12,32],[36,10],[80,10],[108,32]]], label:"1 completed line · 3 borders"},
    "three-fronts": {paths:[[[12,32],[28,44],[28,54]],[[60,10],[60,54]],[[108,32],[92,44],[92,54]]], label:"3 start sides → 1 end side"},
    "four-corners": {paths:[[[12,10],[44,24]],[[44,24],[76,40]],[[76,40],[108,54]]], label:"Opposite corners · 3 linked lines"},
    "crosstown-service": {paths:[[[18,42],[52,32],[100,22]]], label:"First 3 ↔ last 3 columns"},
  };
  const shape = shapes[id];
  if (shape) return <><rect x="12" y="10" width="96" height="44" fill="none" stroke={RULE}/>
    {shape.paths.map((points,i)=><Route key={i} points={points} color={[color,"#b45309","#0369a1"][i]} width={3}/>)}
    <text x="60" y="63" textAnchor="middle" fontSize="6" fontWeight="700" fill={RULE}>{shape.label}</text></>;
  const labels:Record<string,string>={approach:"1 finished line · 2 LARGE",terminal:"Ends inside neighborhoods",minimal:"3 complete + Survey Pin",crossing:"FIRST to finish all 3", "local-service":"1 line · all 3 SMALL",interchange:"Same LARGE · 2 / 3 lines",solvent:"3 complete + $5M"};
  return <><Route points={[[12,32],[60,32],[108,32]]} color={color}/>
    {id === "approach" && <><StationTile x={12} y={32} major/><StationTile x={108} y={32} major/></>}
    {id === "interchange" && <StationTile x={60} y={32} major/>}
    <text x="60" y="60" textAnchor="middle" fontSize="7" fontWeight="700" fill={RULE}>{labels[id]}</text></>;

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
      <EngineeringIllustration id={resolved.id}/>
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

// ============================================================================
// Destination missions — two or three named stations in one company network.
// ============================================================================

export type DestinationCardState = "idle" | "selected" | "committed" | "met" | "missed";

export function DestinationCardFace({
  card,
  color,
  state = "idle",
  footer,
  onClick,
  disabled,
  compact,
}: {
  card: DestinationCard | string;
  color: string;
  state?: DestinationCardState;
  footer?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const resolved = typeof card === "string" ? destinationById(card) : card;
  if (!resolved) return null;
  const stations = resolved.stationIds.map(id => stationById(id)!);

  const chrome: Record<DestinationCardState, string> = {
    idle: "border-purple-300",
    selected: "border-amber-500 ring-2 ring-amber-300",
    committed: "border-purple-800",
    met: "border-emerald-600 ring-2 ring-emerald-200",
    missed: "border-purple-200 opacity-60",
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <strong className="text-[13px] leading-tight text-stone-900">{resolved.name}</strong>
        <span className="shrink-0 rounded bg-purple-700 px-1.5 py-0.5 text-[10px] font-black text-white">
          +{resolved.vp}
        </span>
      </div>
      <p className="text-[10px] font-black uppercase tracking-wider text-purple-700">Destination</p>
      <div className="flex gap-1">{stations.map(station => <EngineeringIllustration key={station.id} id={`dest-${station.id}`}/>)}</div>
      <div className="mt-1.5">
        <svg viewBox="0 0 120 40" aria-hidden="true" className="w-full rounded bg-purple-50"><path d="M15 20H105" stroke={color} strokeWidth="4"/>{stations.map((station,i)=><StationTile key={station.id} x={15+i*90/(stations.length-1)} y={20} major={station.kind === "major"}/>)}</svg>
      </div>
      {!compact && <p className="mt-1.5 text-[11px] leading-snug text-stone-600">{resolved.description}</p>}
      <p className="mt-1 text-[11px] font-semibold leading-snug text-stone-700">{resolved.requirement}</p>
      {footer}
    </>
  );

  const shell = `w-full rounded-xl border-2 bg-[#fdf7ff] p-2.5 text-left shadow-sm ${chrome[state]}`;

  if (!onClick) return <div className={shell}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${shell} transition ${disabled ? "opacity-45" : "hover:-translate-y-0.5 hover:border-purple-400"}`}
    >
      {body}
    </button>
  );
}
