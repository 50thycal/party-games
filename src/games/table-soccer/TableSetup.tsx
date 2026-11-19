"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { GameViewProps } from "../views";
import type { TableSoccerState } from "./config";
import { canPlaceBumper, clamp, fitPhone, isTable, normalizeAngle, validLayout, type Point } from "./physics";
import { screenPoint, seatColor, TableMap } from "./TableMap";

export type SoccerViewProps = GameViewProps<TableSoccerState>;

const CM_PER_INCH = 2.54;
const setupKeys: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
};

type Unit = "cm" | "in";

function displayLength(cm: number, unit: Unit) {
  return String(Math.round((unit === "in" ? cm / CM_PER_INCH : cm) * 10) / 10);
}

export function TableSetup({ state, isHost, dispatchAction }: SoccerViewProps) {
  const [unit, setUnit] = useState<Unit>("cm");
  const [table, setTable] = useState(state.table);
  const [width, setWidth] = useState(displayLength(table.width, unit));
  const [length, setLength] = useState(displayLength(table.length, unit));
  const [phones, setPhones] = useState(state.phones);
  const [selected, setSelected] = useState(0);
  const drag = useRef<{ id: number; index: number; offset: Point } | null>(null);
  const dimensions = parseTable(width, length, unit);
  const tableValid = isTable(dimensions);
  const layoutValid = validLayout(table, phones);

  function parseTable(w: string, l: string, units: Unit) {
    const factor = units === "in" ? CM_PER_INCH : 1;
    return { width: Number(w) * factor, length: Number(l) * factor };
  }

  function changeDimensions(nextWidth: string, nextLength: string) {
    setWidth(nextWidth);
    setLength(nextLength);
    const next = parseTable(nextWidth, nextLength, unit);
    if (!isTable(next)) return;
    setPhones((current) => current.map((phone) => fitPhone({
      ...phone,
      x: phone.x / table.width * next.width,
      y: phone.y / table.length * next.length,
    }, next)));
    setTable(next);
  }

  function movePhone(index: number, point: Point) {
    setPhones((current) => current.map((phone, i) => i === index ? fitPhone({ ...phone, ...point }, table) : phone));
  }

  function rotatePhone(angle: number) {
    setPhones((current) => current.map((phone, i) => i === selected ? fitPhone({ ...phone, angle: normalizeAngle(angle) }, table) : phone));
  }

  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (drag.current) return;
    const point = screenPoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) return;
    const id = (event.target as Element).closest("[data-player-id]")?.getAttribute("data-player-id");
    const markerIndex = phones.findIndex((phone) => phone.playerId === id);
    const index = markerIndex < 0 ? selected : markerIndex;
    const phone = phones[index];
    const offset = markerIndex < 0 ? { x: 0, y: 0 } : { x: point.x - phone.x, y: point.y - phone.y };
    drag.current = { index, offset, id: event.pointerId };
    setSelected(index);
    if (markerIndex < 0) movePhone(index, point);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const gesture = drag.current;
    if (gesture?.id !== event.pointerId) return;
    const point = screenPoint(event.currentTarget, event.clientX, event.clientY);
    if (point) movePhone(gesture.index, { x: point.x - gesture.offset.x, y: point.y - gesture.offset.y });
  }

  function endDrag(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.id === event.pointerId) drag.current = null;
  }

  function moveWithKeys(event: KeyboardEvent<SVGSVGElement>) {
    const delta = setupKeys[event.key];
    if (!delta) return;
    event.preventDefault();
    movePhone(selected, { x: phones[selected].x + delta.x, y: phones[selected].y + delta.y });
  }

  if (!isHost) return (
    <section className="soccer-card" aria-live="polite">
      <h2>Set your phone flat</h2>
      <p>The host is mapping where everyone is sitting.</p>
    </section>
  );

  return (
    <section className="soccer-card">
      <h2>Set up your table</h2>
      <p>Enter its size, then drag each phone to its spot. Point the arrow toward the top edge of the real phone.</p>
      <div className="soccer-measurements">
        <label>Width<input inputMode="decimal" value={width} onChange={(e) => changeDimensions(e.target.value, length)} /></label>
        <label>Length<input inputMode="decimal" value={length} onChange={(e) => changeDimensions(width, e.target.value)} /></label>
        <label>Units<select value={unit} onChange={(e) => {
          const next = e.target.value as Unit;
          setUnit(next);
          setWidth(displayLength(table.width, next));
          setLength(displayLength(table.length, next));
        }}><option value="cm">cm</option><option value="in">in</option></select></label>
      </div>
      <div className="soccer-player-choices" aria-label="Phone to position">
        {state.players.map((player, index) => (
          <button key={player.id} type="button" aria-pressed={index === selected} onClick={() => setSelected(index)}>
            <span style={{ color: seatColor(index) }}>{index + 1}</span> {player.name}
          </button>
        ))}
      </div>
      <TableMap
        table={table} phones={phones} bumpers={[]} highlightedId={phones[selected]?.playerId}
        label="Table layout. Drag a phone or use the arrow keys to position the selected phone."
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={moveWithKeys}
      />
      <div className="soccer-rotation">
        <label>
          Rotate <output>{phones[selected].angle}°</output>
          <input type="range" min="0" max="359" value={phones[selected].angle} onChange={(e) => rotatePhone(Number(e.target.value))} />
        </label>
        <button className="soccer-secondary" type="button" onClick={() => rotatePhone(phones[selected].angle + 90)}>Turn 90°</button>
      </div>
      {!tableValid && <p className="soccer-error" role="status">Use a width of 65–300 cm and a length of 50–220 cm.</p>}
      {tableValid && !layoutValid && <p className="soccer-error" role="status">Move overlapping phones apart.</p>}
      <button className="soccer-primary" type="button" disabled={!tableValid || !layoutValid} onClick={() => {
        void dispatchAction("SOCCER_CONFIRM_LAYOUT", { match: state.match, turn: state.turn, table, phones });
      }}>Confirm layout</button>
    </section>
  );
}

export function BumperSetup({ state, playerId, dispatchAction }: SoccerViewProps) {
  const [point, setPoint] = useState<Point | null>(null);
  const bonus = state.phase === "bonus-bumper";
  const winner = state.players.find((player) => player.id === state.lastResult?.shooterId);
  const canPlace = bonus ? winner?.id === playerId : !state.bumpers.some((bumper) => bumper.playerId === playerId);
  const valid = point !== null && canPlaceBumper(point, state.table, state.phones, state.bumpers);

  function choose(event: PointerEvent<SVGSVGElement>) {
    const next = screenPoint(event.currentTarget, event.clientX, event.clientY);
    if (next) setPoint(next);
  }

  function chooseWithKeys(event: KeyboardEvent<SVGSVGElement>) {
    const delta = setupKeys[event.key];
    if (!delta) return;
    event.preventDefault();
    const previous = point ?? { x: state.table.width / 2, y: state.table.length / 2 };
    setPoint({
      x: clamp(previous.x + delta.x, 0, state.table.width),
      y: clamp(previous.y + delta.y, 0, state.table.length),
    });
  }

  return (
    <section className="soccer-card">
      <h2>{bonus ? (canPlace ? "Goal! Add a bumper" : `${winner?.name ?? "The scorer"} scored`) : "Starting bumpers"}</h2>
      <p aria-live="polite">{canPlace
        ? "Tap the table to pick a spot. The ball will bounce off your bumper."
        : bonus ? `${winner?.name ?? "The scorer"} is adding a bumper.` : `You're set. ${state.bumpers.length} of ${state.players.length} bumpers placed.`}</p>
      <TableMap
        table={state.table} phones={state.phones} bumpers={state.bumpers}
        placement={canPlace ? point : null} placementValid={valid} highlightedId={playerId}
        onPointerDown={canPlace ? choose : undefined} onKeyDown={canPlace ? chooseWithKeys : undefined}
        label="Overhead table with phone positions and bumpers"
      />
      {canPlace && point && !valid && <p className="soccer-error" role="status">Leave space around the phones, bumpers and table edges.</p>}
      {canPlace && <button type="button" className="soccer-primary" disabled={!valid} onClick={() => {
        void dispatchAction("SOCCER_PLACE_BUMPER", { match: state.match, turn: state.turn, point, placement: bonus ? "bonus" : "initial" });
      }}>Place bumper</button>}
    </section>
  );
}
