"use client";

import type { KeyboardEventHandler, PointerEventHandler } from "react";
import {
  BUMPER_RADIUS, GOAL_HALF_WIDTH, GOAL_Y, PHONE,
  type Bumper, type Phone, type Point, type Table,
} from "./physics";

const playerColors = ["#c9fa70", "#72d9ff", "#ffb07d", "#e4b6ff"];

export function seatColor(index: number) {
  return playerColors[index] ?? "#d6e5d9";
}

export function screenPoint(svg: SVGSVGElement, x: number, y: number): Point | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const world = point.matrixTransform(matrix.inverse());
  return { x: world.x, y: world.y };
}

type Props = {
  table: Table;
  phones: Phone[];
  bumpers: Bumper[];
  ball?: Point | null;
  indicator?: { from: Point; to: Point } | null;
  placement?: Point | null;
  placementValid?: boolean;
  highlightedId?: string;
  mini?: boolean;
  onPointerDown?: PointerEventHandler<SVGSVGElement>;
  onPointerMove?: PointerEventHandler<SVGSVGElement>;
  onPointerUp?: PointerEventHandler<SVGSVGElement>;
  onPointerCancel?: PointerEventHandler<SVGSVGElement>;
  onKeyDown?: KeyboardEventHandler<SVGSVGElement>;
  label: string;
};

export function TableMap({
  table, phones, bumpers, ball, indicator, placement, placementValid, highlightedId, mini,
  onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown, label,
}: Props) {
  const { width, length } = table;
  const padding = mini ? 2 : 4;
  const fontSize = Math.max(5.5, Math.max(width, length) / 33);
  return (
    <svg
      aria-label={label}
      className={mini ? "soccer-mini-map" : "soccer-table-map"}
      role={onPointerDown ? "group" : "img"}
      tabIndex={onKeyDown ? 0 : undefined}
      viewBox={`${-padding} ${-padding} ${width + padding * 2} ${length + padding * 2}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <rect x="0" y="0" width={width} height={length} rx="2" fill="#134536" stroke="#75aa8c" strokeWidth={mini ? 1.6 : 1} />
      <path d={`M 0 ${length / 2} H ${width}`} stroke="#80ab91" strokeOpacity=".34" strokeWidth=".65" />
      <circle cx={width / 2} cy={length / 2} r={Math.min(width, length) * 0.12} fill="none" stroke="#80ab91" strokeOpacity=".34" strokeWidth=".65" />
      {phones.map((phone, index) => (
        <g key={phone.playerId} transform={`translate(${phone.x} ${phone.y}) rotate(${phone.angle})`} data-player-id={phone.playerId}>
          <rect
            x={-PHONE.halfWidth} y={-PHONE.halfLength} width={PHONE.halfWidth * 2} height={PHONE.halfLength * 2}
            rx="2.2" fill="#092519" stroke={seatColor(index)}
            strokeWidth={phone.playerId === highlightedId ? 1.95 : 1.1}
          />
          <path d={`M ${-GOAL_HALF_WIDTH} ${GOAL_Y} H ${GOAL_HALF_WIDTH}`} stroke={seatColor(index)} strokeWidth={mini ? 2 : 1.25} />
          <path d="M -3 -4 L 0 -8 L 3 -4" fill="none" stroke={seatColor(index)} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          {!mini && <text textAnchor="middle" y="2" dy=".25em" fill="#fff" fontSize={fontSize} transform={`rotate(${-phone.angle}, 0, 2)`}>{index + 1}</text>}
        </g>
      ))}
      {bumpers.map((bumper, index) => (
        <circle
          key={index} cx={bumper.x} cy={bumper.y} r={BUMPER_RADIUS}
          fill="#092519" stroke={seatColor(phones.findIndex((p) => p.playerId === bumper.playerId))}
          strokeWidth={mini ? 1.4 : 1.15}
        />
      ))}
      {placement && <circle cx={placement.x} cy={placement.y} r={BUMPER_RADIUS} fill={placementValid ? "#bdf87a" : "#ff8b8b"} fillOpacity=".32" stroke={placementValid ? "#d6ffa3" : "#ff8b8b"} strokeWidth="1.2" strokeDasharray="1.8 1" />}
      {indicator && <line x1={indicator.from.x} y1={indicator.from.y} x2={indicator.to.x} y2={indicator.to.y} stroke="#eafcc0" strokeWidth=".7" strokeDasharray="2 2" />}
      {ball && <circle data-testid="map-ball" cx={ball.x} cy={ball.y} r={mini ? Math.max(2.2, Math.max(width, length) / 55) : 1.45} fill="#fffde3" stroke="#0a2116" strokeWidth=".65" />}
    </svg>
  );
}
