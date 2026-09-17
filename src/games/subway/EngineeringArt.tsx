"use client";

import { useId } from "react";

type Point = readonly [number, number];
type Line = { color: string; points: readonly Point[]; support?: boolean };
type Area = { x: number; y: number; w: number; h: number; size?: "S" | "M" | "L" };
type End = { at: Point; kind: "start" | "finish" | "either" };
type Transfer = { x: number; y: number; w: number; h: number };
export type GoalDiagram = {
  summary: string;
  scope: "Single Line" | "Connected Network" | "Company-wide" | "Your Lines" | "Opponent Contact";
  lines: readonly Line[];
  areas?: readonly Area[];
  ends?: readonly End[];
  transfers?: readonly Transfer[];
  borders?: readonly ("N" | "E" | "S" | "W")[];
  note?: string;
};

const BLUE = "#2366a5", GOLD = "#ad650d", TEAL = "#227764", RED = "#c3413d", SUPPORT = "#78716c";
const line = (points: readonly Point[], color = BLUE): Line => ({ points, color });
const support = (points: readonly Point[]): Line => ({ points, color: SUPPORT, support: true });
const end = (at: Point, kind: End["kind"]): End => ({ at, kind });
const pair = (x: number, y: number): Transfer => ({ x: x - 9, y: y - 9, w: 18, h: 34 });

/** Schematic goal examples, not playable route recipes. A transfer step is 16 units.
 * Reserved neighborhood header bands keep size labels away from tracks/stations.
 * Colors encode scope, never the current company's ownership or required colors. */
export const ENGINEERING_DIAGRAMS: Record<string, GoalDiagram> = {
  "north-south": {
    summary: "Complete one line from north to south.", scope: "Single Line", borders: ["N", "S"],
    lines: [line([[80,30],[80,78],[144,78],[144,142]])],
    ends: [end([80,30],"start"),end([144,142],"finish")],
  },
  "four-sides": {
    summary: "Have a starter or completed final station on every border.", scope: "Company-wide", borders: ["N","E","S","W"],
    lines: [line([[80,30],[80,62],[20,62]]),line([[220,110],[160,110],[160,142]],GOLD)],
    ends: [end([80,30],"start"),end([20,62],"finish"),end([220,110],"start"),end([160,142],"finish")],
  },
  "turning-corner": {
    summary: "Complete one line between adjacent borders.", scope: "Single Line", borders: ["W","N"],
    lines: [line([[20,110],[128,110],[128,30]])],
    ends: [end([20,110],"start"),end([128,30],"finish")],
  },
  "return-service": {
    summary: "Complete one line back to its starting border.", scope: "Single Line", borders: ["W"],
    lines: [line([[20,62],[160,62],[160,126],[20,126]])],
    ends: [end([20,62],"start"),end([20,126],"finish")],
  },
  "across-town": {
    summary: "Connect qualifying line ends on the east and west borders.", scope: "Connected Network", borders: ["E","W"],
    lines: [line([[20,78],[112,78]]),line([[112,94],[176,94],[176,62],[220,62]],GOLD)],
    transfers: [pair(112,78)], ends: [end([20,78],"either"),end([220,62],"either")],
  },
  "perimeter-service": {
    summary: "Touch three borders with distinct stations on one line.", scope: "Single Line", borders: ["W","N","E"],
    lines: [line([[60,126],[20,86],[76,30],[148,30],[220,102],[188,134]])],
  },
  "opposite-corners": {
    summary: "Connect qualifying line ends in diagonally opposite corners.", scope: "Connected Network", borders: ["N","E","S","W"],
    lines: [line([[20,30],[80,90],[112,90]]),line([[128,90],[168,90],[220,142]],GOLD)],
    transfers: [{x:103,y:81,w:34,h:18}], ends: [end([20,30],"either"),end([220,142],"either")],
  },
  "transfer-station": {
    summary: "Join two of your lines in one neighborhood transfer station.", scope: "Your Lines",
    areas: [{x:52,y:34,w:136,h:108}],
    lines: [line([[24,78],[112,78]]),line([[112,94],[216,94]],GOLD)], transfers: [pair(112,78)],
  },
  "three-line-hub": {
    summary: "Bring all three of your lines into one transfer station.", scope: "Your Lines",
    lines: [line([[24,78],[104,78]]),line([[104,94],[104,142]],GOLD),line([[120,94],[216,94]],TEAL)],
    transfers: [{x:95,y:69,w:34,h:34}],
  },
  "shared-stations": {
    summary: "Join opponents at two separate transfer stations.", scope: "Opponent Contact",
    lines: [line([[48,66],[192,66]]),line([[48,82],[48,126],[192,126],[192,82]],RED)],
    transfers: [pair(48,66),pair(192,66)], note: "Blue: you · Red: opponent",
  },
  "back-to-back": {
    summary: "Two consecutive stations on one line form separate transfers with your other lines.", scope: "Single Line",
    lines: [line([[32,78],[80,78],[160,78],[208,78]]),support([[80,94],[80,142]]),support([[160,94],[208,142]])],
    transfers: [pair(80,78),pair(160,78)],
  },
  "station-chain": {
    summary: "Connect three separate transfer stations between your lines.", scope: "Connected Network",
    lines: [line([[32,62],[80,62],[128,62],[176,62],[208,62]]),line([[32,78],[32,126],[128,126],[208,126],[208,78]],GOLD),line([[128,78],[160,78]],TEAL)],
    transfers: [pair(32,62),pair(128,62),pair(208,62)],
  },
  "neighborhood-interchange": {
    summary: "One transfer between your lines spans two touching neighborhoods.", scope: "Your Lines",
    areas: [{x:20,y:34,w:100,h:110},{x:120,y:34,w:100,h:110}],
    lines: [line([[40,94],[112,94]]),line([[128,94],[200,94]],GOLD)], transfers: [{x:103,y:85,w:34,h:18}],
  },
  "terminal-interchanges": {
    summary: "Complete one line with separate transfers to your other lines at both ends.", scope: "Single Line",
    lines: [line([[48,78],[96,78],[144,78],[192,78]]),support([[48,94],[48,142]]),support([[192,94],[192,142]])],
    transfers: [pair(48,78),pair(192,78)], ends: [end([48,78],"start"),end([192,78],"finish")],
  },
  "small-pair": {
    summary: "Serve two small neighborhoods with one line.", scope: "Single Line",
    areas: [{x:32,y:50,w:64,h:68,size:"S"},{x:144,y:50,w:64,h:68,size:"S"}],
    lines: [line([[64,94],[176,94]])],
  },
  "mixed-service": {
    summary: "Serve one small, one medium and one large neighborhood.", scope: "Connected Network",
    areas: [{x:14,y:60,w:52,h:64,size:"S"},{x:76,y:44,w:64,h:80,size:"M"},{x:150,y:28,w:76,h:112,size:"L"}],
    lines: [line([[40,102],[108,102]]),line([[108,118],[188,118]],GOLD)], transfers: [pair(108,102)],
  },
  "large-trio": {
    summary: "Serve three different large neighborhoods.", scope: "Connected Network",
    areas: [{x:12,y:34,w:64,h:104,size:"L"},{x:88,y:34,w:64,h:104,size:"L"},{x:164,y:34,w:64,h:104,size:"L"}],
    lines: [line([[44,94],[120,94]]),line([[120,110],[196,110]],GOLD)], transfers: [pair(120,94)],
  },
  "large-presence": {
    summary: "Place three stations in one large neighborhood.", scope: "Company-wide",
    areas: [{x:30,y:28,w:180,h:116,size:"L"}],
    lines: [line([[10,78],[64,78]]),line([[120,162],[120,110]],GOLD),line([[176,78],[230,78]],TEAL)],
  },
  "citywide-coverage": {
    summary: "Serve eight different neighborhoods in one connected network.", scope: "Connected Network",
    areas: [20,72,124,176].flatMap(x=>[{x,y:30,w:44,h:40},{x,y:102,w:44,h:48}]),
    lines: [line([[42,62],[94,62],[146,62],[198,62]]),line([[198,78],[198,134],[146,134],[94,134],[42,134]],GOLD)],
    transfers: [pair(198,62)], note: "8 neighborhoods",
  },
  "small-focus": {
    summary: "Place two stations of one line in one small neighborhood.", scope: "Single Line",
    areas: [{x:50,y:34,w:140,h:64,size:"S"}],
    lines: [line([[80,78],[80,126],[160,126],[160,78]])],
  },
  "neighborhood-stopover": {
    summary: "Place two consecutive stations in the same neighborhood.", scope: "Single Line",
    areas: [{x:44,y:34,w:152,h:104}],
    lines: [line([[80,94],[160,94]])],
  },
};

export function EngineeringArt({ id }: { id: string; color?: string }) {
  const uid = useId();
  const diagram = ENGINEERING_DIAGRAMS[id];
  if (!diagram) return null;
  const borders = {N:[20,30,220,30],E:[220,30,220,142],S:[20,142,220,142],W:[20,30,20,142]};
  return <svg viewBox="0 0 240 172" className="h-auto w-full rounded-lg bg-[#f3e6cd]" role="img" aria-labelledby={`${uid}-title ${uid}-desc`} data-engineering-art={id}>
    <title id={`${uid}-title`}>{diagram.summary}</title>
    <desc id={`${uid}-desc`}>{diagram.scope}. Example colors and shapes are illustrative, not required.{diagram.note ? ` ${diagram.note}.` : ""} Adjacent stations inside an outline form a transfer station.</desc>
    {diagram.borders && <g fill="none" stroke="#d1bfa0" strokeWidth="1.5">
      <rect x="20" y="30" width="200" height="112" rx="0"/>
      {diagram.borders.map(side=>{const [x1,y1,x2,y2]=borders[side];return <line key={side} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#736149" strokeWidth="3"/>;})}
    </g>}
    {diagram.borders && <g fill="#665744" fontSize="10" fontWeight="700" textAnchor="middle"><text x="120" y="18">N</text><text x="232" y="90">E</text><text x="120" y="160">S</text><text x="8" y="90">W</text></g>}
    {diagram.areas?.map((area,i)=><g key={i} data-neighborhood={area.size??"any"}>
      <rect x={area.x} y={area.y} width={area.w} height={area.h} rx="5" fill={i%2 ? "#e4e8d5" : "#e8d7b6"} stroke="#a59173" strokeWidth="1.2"/>
      {area.size && <text x={area.x+10} y={area.y+16} fontSize="12" fontWeight="800" fill="#5d513e">{area.size}</text>}
    </g>)}
    {diagram.transfers?.map((t,i)=><rect key={i} x={t.x} y={t.y} width={t.w} height={t.h} rx="9" fill="#fffaf0" stroke="#6b6254" strokeWidth="1.5" data-transfer-outline="true"/>)}
    {diagram.lines.map((route,i)=><g key={i} data-route-color={route.color} data-support-line={route.support||undefined}>
      <polyline points={route.points.map(p=>p.join(",")).join(" ")} fill="none" stroke={route.color} strokeWidth={route.support?3:4} strokeLinecap="round" strokeLinejoin="round"/>
      {route.points.map(([x,y],j)=><circle key={j} cx={x} cy={y} r="4.5" fill={route.color} stroke="#fffaf0" strokeWidth="1.5"/>)}
    </g>)}
    {diagram.ends?.map(({at:[x,y],kind},i)=><g key={i} data-end-marker={kind} stroke="#342e26" strokeWidth="1.5">
      {kind==="start" ? <><path d={`M ${x} ${y-5} v -13`} fill="none"/><path d={`M ${x} ${y-18} l 10 4 -10 4 z`} fill="#fffaf0"/></> : kind==="finish" ? <rect x={x-7} y={y-7} width="14" height="14" rx="1" fill="none"/> : <circle cx={x} cy={y} r="8" fill="none"/>}
    </g>)}
    {diagram.note && <text x="120" y="166" textAnchor="middle" fontSize="10" fontWeight="700" fill="#514638">{diagram.note}</text>}
  </svg>;
}
