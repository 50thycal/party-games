"use client";
import { ENGINEERING_CARDS, destinationById, engineeringById, stationById } from "./config";
import type { EngineeringCategory } from "./engineering";

// ============================================================================
// Tiny public card glyphs for the player pads (DGLE playtest follow-up).
//
// Every Engineering category shares one base shape so a glance tells the
// family apart: Line goals are a track between two end dots, Station goals are
// overlapping station rings, Neighborhood goals are a rounded block. Each card
// then adds one detail that names it. Destinations abbreviate their
// neighborhoods; letters are unique across the ten neighborhoods.
// ============================================================================

export const CATEGORY_COLORS: Record<EngineeringCategory, string> = { Line: "#38bdf8", Station: "#fbbf24", Neighborhood: "#86efac" };

/** Unique neighborhood abbreviations. Single letters where no other neighborhood shares the initial. */
export const NEIGHBORHOOD_ABBREVIATIONS: Record<string, string> = {
  market: "Mk", grand: "GC", museum: "Mu", garden: "Gd", stadium: "S",
  university: "U", library: "L", theatre: "T", airport: "A", harbor: "H",
};
export const destinationAbbreviation = (cardId: string): string =>
  (destinationById(cardId)?.stationIds ?? []).map(id => NEIGHBORHOOD_ABBREVIATIONS[id] ?? stationById(id)?.name.slice(0, 2) ?? "?").join("+");

const S = { fill: "none", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const dot = (x: number, y: number, r = 1.6) => <circle cx={x} cy={y} r={r} fill="currentColor" />;
const ring = (x: number, y: number, r = 3.2) => <circle cx={x} cy={y} r={r} {...S} stroke="currentColor" />;
const block = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx={1.5} {...S} stroke="currentColor" />;
const label = (x: number, y: number, text: string, size = 6) => <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight={900} fontFamily="ui-sans-serif, system-ui" fill="currentColor">{text}</text>;

/** 16×16 detail per card, drawn on top of the category base. */
const DETAILS: Record<string, React.ReactNode> = {
  // Line goals: a track between two end dots.
  "north-south": <>{<path d="M8 2.5v11" {...S} stroke="currentColor" />}{dot(8, 2.5)}{dot(8, 13.5)}</>,
  "four-sides": <>{block(3, 3, 10, 10)}{dot(8, 3)}{dot(13, 8)}{dot(8, 13)}{dot(3, 8)}</>,
  "turning-corner": <>{<path d="M3 13V6h9" {...S} stroke="currentColor" />}{dot(3, 13)}{dot(12, 6)}</>,
  "return-service": <>{<path d="M3 4h7a3 3 0 0 1 0 6H3" {...S} stroke="currentColor" />}{dot(3, 4)}{dot(3, 10)}</>,
  "across-town": <>{<path d="M2.5 8h11" {...S} stroke="currentColor" />}{dot(2.5, 8)}{dot(13.5, 8)}</>,
  "perimeter-service": <>{<path d="M3 13V3h10v10" {...S} stroke="currentColor" />}{dot(3, 13)}{dot(8, 3)}{dot(13, 13)}</>,
  "opposite-corners": <>{<path d="M3 13L13 3" {...S} stroke="currentColor" />}{dot(3, 13)}{dot(13, 3)}</>,
  // Station goals: overlapping station rings.
  "transfer-station": <>{ring(6, 8)}{ring(10, 8)}</>,
  "three-line-hub": <>{ring(5.5, 9.5)}{ring(10.5, 9.5)}{ring(8, 5.5)}</>,
  "shared-stations": <>{ring(4.5, 8, 2.6)}{<circle cx={7.5} cy={8} r={2.6} fill="currentColor" opacity={.6} />}{ring(11.5, 8, 2.6)}{<circle cx={14} cy={8} r={1.4} fill="currentColor" opacity={.6} />}</>,
  "back-to-back": <>{ring(4, 6, 2.6)}{ring(4, 10.5, 2.6)}{ring(12, 6, 2.6)}{ring(12, 10.5, 2.6)}{<path d="M6.5 8.2h3" {...S} stroke="currentColor" />}</>,
  "station-chain": <>{ring(3.5, 8, 2.4)}{ring(8, 8, 2.4)}{ring(12.5, 8, 2.4)}{<path d="M5.9 8h-.2M10.4 8h-.2" {...S} stroke="currentColor" />}</>,
  "neighborhood-interchange": <>{<path d="M8 2v12" {...S} stroke="currentColor" strokeDasharray="1.5 1.5" />}{ring(5.5, 8)}{ring(10.5, 8)}</>,
  "terminal-interchanges": <>{<path d="M4 8h8" {...S} stroke="currentColor" />}{ring(4, 8, 2.6)}{ring(12, 8, 2.6)}</>,
  // Neighborhood goals: a rounded block plus its size or count.
  "small-pair": <>{block(1.5, 4, 5.5, 8)}{block(9, 4, 5.5, 8)}{label(4.25, 10.3, "S", 5)}{label(11.75, 10.3, "S", 5)}</>,
  "mixed-service": <>{block(1, 6, 4, 6)}{block(6, 4.5, 4, 7.5)}{block(11, 3, 4, 9)}{label(3, 10.6, "S", 3.6)}{label(8, 10.6, "M", 3.6)}{label(13, 10.6, "L", 3.6)}</>,
  "large-trio": <>{block(1, 3, 4, 10)}{block(6, 3, 4, 10)}{block(11, 3, 4, 10)}{label(3, 10.5, "L", 4)}{label(8, 10.5, "L", 4)}{label(13, 10.5, "L", 4)}</>,
  "large-presence": <>{block(2.5, 2.5, 11, 11)}{dot(5.5, 6, 1.3)}{dot(8, 10, 1.3)}{dot(10.5, 6, 1.3)}</>,
  "citywide-coverage": <>{block(2, 2, 12, 12)}{label(8, 11, "8", 7.5)}</>,
  "small-focus": <>{block(3, 3, 10, 10)}{label(8, 7, "S", 4.5)}{dot(6.2, 10.5, 1.2)}{dot(9.8, 10.5, 1.2)}</>,
  "neighborhood-stopover": <>{block(2, 3, 12, 10)}{<path d="M5.5 8h5" {...S} stroke="currentColor" />}{dot(5.5, 8, 1.4)}{dot(10.5, 8, 1.4)}</>,
};

export function EngineeringGlyph({ id, met = false, size = 16, title }: { id: string; met?: boolean; size?: number; title?: string }) {
  const card = engineeringById(id);
  if (!card) return null;
  return <svg viewBox="0 0 16 16" width={size} height={size} role="img" aria-label={title ?? `${card.category} goal: ${card.name}${met ? ", currently met" : ""}`}
    data-engineering-glyph={id} data-glyph-category={card.category} data-glyph-met={met || undefined}
    className="inline-block shrink-0 rounded-sm" style={{ color: met ? "#10b981" : CATEGORY_COLORS[card.category], background: met ? "#064e3b" : "#0f172a" }}>
    {DETAILS[id] ?? label(8, 11, card.name[0] ?? "?", 8)}
  </svg>;
}

/** Purple neighborhood chip such as "S+A"; green once the network connects them. */
export function DestinationChip({ id, met = false }: { id: string; met?: boolean }) {
  const card = destinationById(id);
  if (!card) return null;
  return <span data-destination-chip={id} data-chip-met={met || undefined} title={`${card.name}${met ? " · connected" : ""}`} aria-label={`Destination ${card.name}${met ? ", connected" : ""}`}
    className={`inline-flex h-4 items-center rounded px-1 text-[9px] font-black leading-none ${met ? "bg-emerald-600 text-white" : "bg-purple-700 text-purple-50"}`}>
    {destinationAbbreviation(id)}
  </span>;
}

/** Every Engineering card has a drawn detail, so nothing falls back to a letter. */
export const GLYPH_COVERAGE = ENGINEERING_CARDS.every(c => c.id in DETAILS);
