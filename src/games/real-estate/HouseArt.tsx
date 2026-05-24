"use client";

import type { HouseCategory } from "./config";

interface HouseArtProps {
  category: HouseCategory;
  seed: string;
  className?: string;
}

// Each house id seeds a deterministic RNG so the same listing always
// renders the same way across clients and across refreshes.
function makeRng(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T,>(rng: Rng, arr: readonly T[]): T =>
  arr[Math.floor(rng() * arr.length)];
const chance = (rng: Rng, p: number) => rng() < p;

// =============================================================================
// PALETTES
// =============================================================================

const SUBURBAN_WALLS = [
  "#fbbf24", // amber
  "#fcd34d", // light amber
  "#84cc16", // lime
  "#22c55e", // green
  "#f472b6", // pink
  "#f87171", // red
  "#a78bfa", // purple
  "#fef3c7", // cream
  "#e0e7ff", // pale blue
  "#fdba74", // peach
] as const;
const SUBURBAN_ROOFS = [
  "#7c2d12",
  "#92400e",
  "#451a03",
  "#1e3a8a",
  "#5b21b6",
  "#831843",
  "#0f172a",
] as const;
const DOOR_COLORS = [
  "#dc2626",
  "#1d4ed8",
  "#15803d",
  "#7c3aed",
  "#a16207",
  "#0e7490",
  "#be185d",
  "#1f2937",
] as const;

const CONDO_WALLS = [
  "#64748b",
  "#475569",
  "#94a3b8",
  "#0f766e",
  "#1e3a8a",
  "#7c2d12",
  "#a3a3a3",
] as const;
const CONDO_ACCENTS = [
  "#38bdf8",
  "#fbbf24",
  "#22c55e",
  "#f472b6",
  "#a78bfa",
] as const;

const MANSION_WALLS = [
  "#fef3c7", // cream
  "#fde68a", // pale gold
  "#fed7aa", // peach
  "#e7e5e4", // limestone
  "#f5f5f4", // ivory
  "#86198f", // bold magenta
  "#365314", // deep green
  "#0c4a6e", // navy stone
  "#7c2d12", // burnt sienna
  "#475569", // slate
  "#a16207", // ochre
] as const;
const MANSION_ROOFS = [
  "#450a0a",
  "#1e1b4b",
  "#3f3f46",
  "#7c2d12",
  "#0f172a",
  "#14532d",
  "#581c87",
] as const;

const WATERFRONT_WALLS = [
  "#fef9c3",
  "#fef3c7",
  "#fecaca",
  "#dbeafe",
  "#fbcfe8",
  "#fff7ed",
  "#dcfce7",
] as const;
const WATERFRONT_ROOFS = [
  "#0c4a6e",
  "#1e40af",
  "#7c2d12",
  "#831843",
  "#0f172a",
] as const;

// =============================================================================
// MAIN
// =============================================================================

export function HouseArt({ category, seed, className }: HouseArtProps) {
  const rng = makeRng(seed);
  // Each house gets a slightly different sky tint — keeps the market looking
  // varied without making any single house look out of place.
  const skyTop = pick(rng, [
    "#1e293b",
    "#0f172a",
    "#312e81",
    "#1e1b4b",
    "#0c4a6e",
  ]);
  const skyBottom = pick(rng, [
    "#fb923c",
    "#f472b6",
    "#a78bfa",
    "#38bdf8",
    "#fbbf24",
  ]);
  const gid = `g${seed.replace(/[^a-z0-9]/gi, "").slice(0, 10)}`;
  return (
    <svg
      viewBox="0 0 200 140"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`sky-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skyTop} />
          <stop offset="100%" stopColor={skyBottom} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect width="200" height="140" fill={`url(#sky-${gid})`} />
      {/* Distant moon/sun for ambience */}
      <circle
        cx={rng() < 0.5 ? 30 : 170}
        cy={20 + Math.floor(rng() * 15)}
        r="6"
        fill="#fef3c7"
        opacity="0.8"
      />
      {category === "condo" && <Condo rng={rng} />}
      {category === "suburban" && <Suburban rng={rng} />}
      {category === "mansion" && <Mansion rng={rng} />}
      {category === "waterfront" && <Waterfront rng={rng} />}
    </svg>
  );
}

// =============================================================================
// SUBURBAN — pitched-roof house with optional tree / fence / chimney
// =============================================================================

function Suburban({ rng }: { rng: Rng }) {
  const wallColor = pick(rng, SUBURBAN_WALLS);
  const roofColor = pick(rng, SUBURBAN_ROOFS);
  const doorColor = pick(rng, DOOR_COLORS);
  const windowCount = pick(rng, [2, 2, 3]);
  const hasChimney = chance(rng, 0.5);
  const hasTree = chance(rng, 0.6);
  const treeOnLeft = chance(rng, 0.5);
  const hasShutters = chance(rng, 0.5);
  const shutterColor = pick(rng, SUBURBAN_ROOFS);
  const fenceColor = pick(rng, ["#fef3c7", "#e5e5e5", "#fde68a"]);
  const hasFence = chance(rng, 0.5);

  return (
    <g>
      {/* Ground */}
      <rect x="0" y="115" width="200" height="25" fill="#365314" />
      <rect x="0" y="115" width="200" height="3" fill="#4d7c0f" />

      {/* Tree (behind house if on side) */}
      {hasTree && (
        <g>
          <rect
            x={treeOnLeft ? 18 : 175}
            y="78"
            width="6"
            height="37"
            fill="#451a03"
          />
          <circle
            cx={treeOnLeft ? 21 : 178}
            cy="74"
            r="14"
            fill={pick(rng, ["#16a34a", "#15803d", "#84cc16", "#65a30d"])}
          />
        </g>
      )}

      {/* House body */}
      <rect
        x="55"
        y="68"
        width="90"
        height="47"
        fill={wallColor}
        stroke="#000"
        strokeWidth="1.5"
      />

      {/* Roof */}
      <polygon
        points="50,68 100,35 150,68"
        fill={roofColor}
        stroke="#000"
        strokeWidth="1.5"
      />

      {/* Chimney */}
      {hasChimney && (
        <g>
          <rect x="125" y="38" width="8" height="18" fill={roofColor} stroke="#000" strokeWidth="1" />
          <rect x="123" y="36" width="12" height="3" fill={roofColor} stroke="#000" strokeWidth="1" />
        </g>
      )}

      {/* Windows */}
      {Array.from({ length: windowCount }).map((_, i) => {
        const totalW = 90;
        const spacing = totalW / (windowCount + 1);
        const cx = 55 + spacing * (i + 1);
        // skip center if door would overlap
        if (Math.abs(cx - 100) < 8 && windowCount === 3 && i === 1) return null;
        return (
          <g key={i}>
            <rect
              x={cx - 7}
              y="78"
              width="14"
              height="14"
              fill="#bae6fd"
              stroke="#000"
              strokeWidth="1"
            />
            <line x1={cx} y1="78" x2={cx} y2="92" stroke="#000" strokeWidth="0.8" />
            <line x1={cx - 7} y1="85" x2={cx + 7} y2="85" stroke="#000" strokeWidth="0.8" />
            {hasShutters && (
              <>
                <rect x={cx - 11} y="78" width="3" height="14" fill={shutterColor} />
                <rect x={cx + 8} y="78" width="3" height="14" fill={shutterColor} />
              </>
            )}
          </g>
        );
      })}

      {/* Door */}
      <rect
        x="93"
        y="95"
        width="14"
        height="20"
        fill={doorColor}
        stroke="#000"
        strokeWidth="1"
      />
      <circle cx="103" cy="105" r="1" fill="#fbbf24" />

      {/* Fence */}
      {hasFence && (
        <g stroke="#000" strokeWidth="0.8">
          {[10, 25, 35, 165, 175, 185].map((x) => (
            <g key={x}>
              <rect x={x} y="108" width="3" height="9" fill={fenceColor} />
              <polygon points={`${x},108 ${x + 1.5},105 ${x + 3},108`} fill={fenceColor} />
            </g>
          ))}
          <line x1="10" y1="111" x2="40" y2="111" />
          <line x1="160" y1="111" x2="190" y2="111" />
        </g>
      )}
    </g>
  );
}

// =============================================================================
// CONDO — tall building, grid of windows
// =============================================================================

function Condo({ rng }: { rng: Rng }) {
  const wallColor = pick(rng, CONDO_WALLS);
  const accent = pick(rng, CONDO_ACCENTS);
  const floors = pick(rng, [3, 4, 4, 5]);
  const cols = pick(rng, [2, 3, 3]);
  const hasAntenna = chance(rng, 0.5);
  const hasSideBuilding = chance(rng, 0.6);
  const sideOnLeft = chance(rng, 0.5);
  const sideWall = pick(rng, CONDO_WALLS);

  const buildingX = 60;
  const buildingW = 80;
  const buildingTop = 110 - floors * 16;
  const buildingH = 110 - buildingTop;

  return (
    <g>
      {/* Ground */}
      <rect x="0" y="115" width="200" height="25" fill="#1f2937" />
      <rect x="0" y="115" width="200" height="2" fill="#374151" />

      {/* Side building */}
      {hasSideBuilding && (
        <g>
          <rect
            x={sideOnLeft ? 15 : 145}
            y="72"
            width="40"
            height="43"
            fill={sideWall}
            stroke="#000"
            strokeWidth="1.5"
          />
          {/* small windows on side building */}
          {[0, 1, 2].map((row) =>
            [0, 1].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={(sideOnLeft ? 15 : 145) + 7 + col * 18}
                y={78 + row * 12}
                width="8"
                height="6"
                fill={chance(rng, 0.7) ? "#fbbf24" : "#1e293b"}
              />
            ))
          )}
        </g>
      )}

      {/* Main building */}
      <rect
        x={buildingX}
        y={buildingTop}
        width={buildingW}
        height={buildingH}
        fill={wallColor}
        stroke="#000"
        strokeWidth="1.5"
      />

      {/* Flat roof with accent stripe */}
      <rect
        x={buildingX - 3}
        y={buildingTop - 4}
        width={buildingW + 6}
        height="4"
        fill="#0f172a"
        stroke="#000"
        strokeWidth="1"
      />
      <rect
        x={buildingX}
        y={buildingTop}
        width={buildingW}
        height="2"
        fill={accent}
      />

      {/* Antenna */}
      {hasAntenna && (
        <g>
          <line
            x1={buildingX + buildingW / 2}
            y1={buildingTop - 4}
            x2={buildingX + buildingW / 2}
            y2={buildingTop - 18}
            stroke="#000"
            strokeWidth="1.5"
          />
          <circle
            cx={buildingX + buildingW / 2}
            cy={buildingTop - 19}
            r="2"
            fill="#dc2626"
          />
        </g>
      )}

      {/* Window grid */}
      {Array.from({ length: floors }).map((_, floor) => {
        const isGround = floor === floors - 1;
        return Array.from({ length: cols }).map((__, col) => {
          const w = (buildingW - 12) / cols - 4;
          const x = buildingX + 6 + col * ((buildingW - 12) / cols) + 2;
          const y = buildingTop + 5 + floor * 16;
          // Ground floor center is the entrance
          if (isGround && col === Math.floor(cols / 2) && cols % 2 === 1) {
            return (
              <rect
                key={`${floor}-${col}`}
                x={x}
                y={y}
                width={w}
                height="11"
                fill="#0f172a"
                stroke="#000"
                strokeWidth="0.8"
              />
            );
          }
          const lit = chance(rng, 0.6);
          return (
            <rect
              key={`${floor}-${col}`}
              x={x}
              y={y}
              width={w}
              height="11"
              fill={lit ? "#fbbf24" : "#1e293b"}
              stroke="#000"
              strokeWidth="0.6"
            />
          );
        });
      })}
    </g>
  );
}

// =============================================================================
// MANSION — wide multi-wing estate with columns
// =============================================================================

function Mansion({ rng }: { rng: Rng }) {
  const wallColor = pick(rng, MANSION_WALLS);
  const roofColor = pick(rng, MANSION_ROOFS);
  const doorColor = pick(rng, DOOR_COLORS);
  // Gilded trim looks stately against both light and dark walls.
  const trimColor = pick(rng, ["#fbbf24", "#fde68a", "#a16207", "#d97706"]);
  const columnCount = pick(rng, [2, 4, 4]);
  const hasTurret = chance(rng, 0.5);
  const turretOnLeft = chance(rng, 0.5);
  const hasHedge = chance(rng, 0.7);

  return (
    <g>
      {/* Ground */}
      <rect x="0" y="115" width="200" height="25" fill="#365314" />
      <rect x="0" y="115" width="200" height="3" fill="#4d7c0f" />

      {/* Hedge in front */}
      {hasHedge && (
        <>
          {[15, 35, 165, 185].map((cx) => (
            <ellipse
              key={cx}
              cx={cx}
              cy="115"
              rx="12"
              ry="6"
              fill="#15803d"
              stroke="#000"
              strokeWidth="0.8"
            />
          ))}
        </>
      )}

      {/* Turret */}
      {hasTurret && (
        <g>
          <rect
            x={turretOnLeft ? 20 : 160}
            y="55"
            width="20"
            height="60"
            fill={wallColor}
            stroke="#000"
            strokeWidth="1.5"
          />
          <polygon
            points={
              turretOnLeft
                ? "18,55 30,38 42,55"
                : "158,55 170,38 182,55"
            }
            fill={roofColor}
            stroke="#000"
            strokeWidth="1.5"
          />
          <rect
            x={turretOnLeft ? 24 : 164}
            y="65"
            width="12"
            height="8"
            fill="#bae6fd"
            stroke="#000"
            strokeWidth="0.8"
          />
          <rect
            x={turretOnLeft ? 24 : 164}
            y="80"
            width="12"
            height="8"
            fill="#bae6fd"
            stroke="#000"
            strokeWidth="0.8"
          />
        </g>
      )}

      {/* Main body — two floors */}
      <rect
        x="45"
        y="60"
        width="110"
        height="55"
        fill={wallColor}
        stroke="#000"
        strokeWidth="1.5"
      />

      {/* Roof — wide pitched */}
      <polygon
        points="40,60 100,32 160,60"
        fill={roofColor}
        stroke="#000"
        strokeWidth="1.5"
      />
      {/* Roof trim */}
      <line x1="40" y1="60" x2="160" y2="60" stroke={trimColor} strokeWidth="1.5" />

      {/* Pediment dot */}
      <circle cx="100" cy="50" r="3" fill={trimColor} />

      {/* Columns */}
      {Array.from({ length: columnCount }).map((_, i) => {
        const colSpan = 50;
        const start = 100 - colSpan / 2;
        const step = colSpan / (columnCount - 1 || 1);
        const x = columnCount === 1 ? 100 - 2 : start + i * step - 2;
        return (
          <g key={i}>
            <rect x={x} y="90" width="4" height="25" fill="#f5f5f4" stroke="#000" strokeWidth="0.6" />
            <rect x={x - 1} y="88" width="6" height="3" fill="#f5f5f4" stroke="#000" strokeWidth="0.6" />
            <rect x={x - 1} y="114" width="6" height="2" fill="#f5f5f4" stroke="#000" strokeWidth="0.6" />
          </g>
        );
      })}

      {/* Upper-floor windows */}
      {[60, 80, 120, 140].map((x) => (
        <g key={x}>
          <rect x={x} y="66" width="10" height="14" fill="#bae6fd" stroke="#000" strokeWidth="0.8" />
          <line x1={x + 5} y1="66" x2={x + 5} y2="80" stroke="#000" strokeWidth="0.6" />
          <line x1={x} y1="73" x2={x + 10} y2="73" stroke="#000" strokeWidth="0.6" />
          <polygon
            points={`${x - 1},66 ${x + 5},62 ${x + 11},66`}
            fill={trimColor}
          />
        </g>
      ))}

      {/* Big front door */}
      <rect x="93" y="88" width="14" height="27" fill={doorColor} stroke="#000" strokeWidth="1.2" />
      <polygon points="91,89 100,82 109,89" fill={trimColor} stroke="#000" strokeWidth="0.8" />
      <circle cx="104" cy="102" r="1" fill="#fbbf24" />

      {/* Stair steps */}
      <rect x="85" y="115" width="30" height="3" fill="#d4d4d8" stroke="#000" strokeWidth="0.5" />
    </g>
  );
}

// =============================================================================
// WATERFRONT — beachside house with dock + water
// =============================================================================

function Waterfront({ rng }: { rng: Rng }) {
  const wallColor = pick(rng, WATERFRONT_WALLS);
  const roofColor = pick(rng, WATERFRONT_ROOFS);
  const doorColor = pick(rng, DOOR_COLORS);
  const waterColor = pick(rng, ["#0ea5e9", "#0284c7", "#0369a1", "#06b6d4"]);
  const hasBoat = chance(rng, 0.7);
  const sailColor = pick(rng, ["#fef3c7", "#fecaca", "#dbeafe", "#fff"]);
  const hasPalm = chance(rng, 0.6);
  const palmOnLeft = chance(rng, 0.5);
  const houseOnLeft = chance(rng, 0.5);
  const hasUmbrella = chance(rng, 0.4);

  const houseX = houseOnLeft ? 25 : 100;
  // Dock extends from the house toward the water; water is always at the
  // bottom (shore is the lower portion of the frame).
  return (
    <g>
      {/* Sand */}
      <rect x="0" y="98" width="200" height="22" fill="#fde68a" />
      {/* Water */}
      <rect x="0" y="115" width="200" height="25" fill={waterColor} />
      <path
        d="M 0 120 Q 25 117 50 120 T 100 120 T 150 120 T 200 120"
        stroke="#fff"
        strokeWidth="0.8"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M 0 128 Q 25 125 50 128 T 100 128 T 150 128 T 200 128"
        stroke="#fff"
        strokeWidth="0.8"
        fill="none"
        opacity="0.4"
      />

      {/* Palm tree */}
      {hasPalm && (
        <g>
          <path
            d={`M ${palmOnLeft ? 178 : 22} 98 Q ${palmOnLeft ? 180 : 20} 80 ${palmOnLeft ? 182 : 18} 65`}
            stroke="#451a03"
            strokeWidth="3"
            fill="none"
          />
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (i * 360) / 5;
            const cx = palmOnLeft ? 182 : 18;
            const cy = 65;
            const dx = Math.cos((angle * Math.PI) / 180) * 14;
            const dy = Math.sin((angle * Math.PI) / 180) * 8 - 4;
            return (
              <ellipse
                key={i}
                cx={cx + dx}
                cy={cy + dy}
                rx="9"
                ry="4"
                fill="#16a34a"
                transform={`rotate(${angle} ${cx + dx} ${cy + dy})`}
              />
            );
          })}
          <circle cx={palmOnLeft ? 182 : 18} cy="65" r="3" fill="#92400e" />
        </g>
      )}

      {/* House (on stilts above the sand) */}
      <g>
        {/* Stilts */}
        <rect x={houseX + 6} y="95" width="3" height="8" fill="#451a03" />
        <rect x={houseX + 65} y="95" width="3" height="8" fill="#451a03" />
        {/* Body */}
        <rect
          x={houseX}
          y="65"
          width="75"
          height="33"
          fill={wallColor}
          stroke="#000"
          strokeWidth="1.5"
        />
        {/* Pitched roof */}
        <polygon
          points={`${houseX - 4},65 ${houseX + 37.5},42 ${houseX + 79},65`}
          fill={roofColor}
          stroke="#000"
          strokeWidth="1.5"
        />
        {/* Big picture window */}
        <rect
          x={houseX + 6}
          y="72"
          width="28"
          height="18"
          fill="#bae6fd"
          stroke="#000"
          strokeWidth="0.8"
        />
        <line
          x1={houseX + 20}
          y1="72"
          x2={houseX + 20}
          y2="90"
          stroke="#000"
          strokeWidth="0.6"
        />
        {/* Door */}
        <rect
          x={houseX + 50}
          y="78"
          width="12"
          height="20"
          fill={doorColor}
          stroke="#000"
          strokeWidth="1"
        />
        <circle cx={houseX + 60} cy="88" r="0.8" fill="#fbbf24" />
        {/* Small porch railing */}
        <rect
          x={houseX + 40}
          y="95"
          width="32"
          height="2"
          fill="#451a03"
        />
      </g>

      {/* Dock */}
      <g>
        <rect
          x={houseOnLeft ? 95 : 30}
          y="113"
          width="70"
          height="3"
          fill="#92400e"
          stroke="#000"
          strokeWidth="0.6"
        />
        {[10, 30, 50, 65].map((dx) => (
          <rect
            key={dx}
            x={(houseOnLeft ? 95 : 30) + dx}
            y="116"
            width="2"
            height="10"
            fill="#451a03"
          />
        ))}
      </g>

      {/* Boat with sail */}
      {hasBoat && (
        <g>
          <polygon
            points="130,128 160,128 155,133 135,133"
            fill="#7c2d12"
            stroke="#000"
            strokeWidth="0.8"
          />
          <rect x="143" y="113" width="1.5" height="15" fill="#1f2937" />
          <polygon
            points="144.5,113 144.5,127 156,127"
            fill={sailColor}
            stroke="#000"
            strokeWidth="0.6"
          />
        </g>
      )}

      {/* Beach umbrella */}
      {hasUmbrella && (
        <g>
          <line x1="50" y1="98" x2="50" y2="112" stroke="#1f2937" strokeWidth="1" />
          <path
            d="M 38 100 Q 50 90 62 100 Z"
            fill={pick(rng, ["#ef4444", "#f59e0b", "#3b82f6", "#ec4899"])}
            stroke="#000"
            strokeWidth="0.8"
          />
        </g>
      )}
    </g>
  );
}
