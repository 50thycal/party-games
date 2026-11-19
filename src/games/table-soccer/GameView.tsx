"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { BumperSetup, TableSetup, type SoccerViewProps } from "./TableSetup";
import { screenPoint, seatColor, TableMap } from "./TableMap";
import { MAX_PLAYERS, TABLE_SOCCER_VERSION, WINNING_SCORE, type Shot, type TableSoccerState } from "./config";
import {
  BALL_RADIUS, ballAt, clamp, GOAL_HALF_WIDTH, GOAL_Y, GOALIE_HALF_WIDTH, GOALIE_LIMIT, kickDirection,
  LAUNCH_POINT, limitedPull, MAX_PULL, MIN_PULL, toPhone, toWorld, type Point,
} from "./physics";

const GOALIE_SEND_MS = 95;
const SETTLE_RETRY_MS = 650;

type LiveSend = (type: "SOCCER_GOALIE" | "SOCCER_SETTLE", extra?: { x: number }) => Promise<boolean>;

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;
    let lock: WakeLockSentinel | undefined;
    let disposed = false;
    async function keepAwake() {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed || (lock && !lock.released)) await next.release();
        else lock = next;
      } catch { /* Browsers and low battery mode can decline the lock. */ }
    }
    void keepAwake();
    document.addEventListener("visibilitychange", keepAwake);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", keepAwake);
      if (lock && !lock.released) void lock.release();
    };
  }, [active]);
}

function useFlightClock(endsAt: number | undefined, clockOffsetMs: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    let animation = 0;
    function step() {
      const time = Date.now() + clockOffsetMs;
      setNow(time);
      if (time < endsAt!) animation = requestAnimationFrame(step);
    }
    step();
    return () => cancelAnimationFrame(animation);
  }, [endsAt, clockOffsetMs]);
  return now;
}

function useSettleFlight(shot: Shot | null, fallbackDelay: number, clockOffsetMs: number, send: LiveSend) {
  const deadline = shot?.settlesAt;
  useEffect(() => {
    if (!deadline) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function settle() {
      const success = await send("SOCCER_SETTLE");
      if (!stopped && !success) timer = setTimeout(settle, SETTLE_RETRY_MS);
    }
    timer = setTimeout(settle, Math.max(0, deadline + fallbackDelay + 30 - Date.now() - clockOffsetMs));
    return () => { stopped = true; clearTimeout(timer); };
  }, [deadline, fallbackDelay, clockOffsetMs, send]);
}

function useGoalie(shot: Shot | null, defend: boolean, send: LiveSend) {
  const [localX, setLocalX] = useState<number | null>(null);
  const queue = useRef<{ x: number } | null>(null);
  const flushNow = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!defend) return;
    let live = true;
    let sending = false;
    let nextSendAt = 0;
    async function flush() {
      if (sending || Date.now() < nextSendAt || !queue.current) return;
      const update = queue.current;
      queue.current = null;
      sending = true;
      nextSendAt = Date.now() + GOALIE_SEND_MS;
      const success = await send("SOCCER_GOALIE", update);
      sending = false;
      if (live && !success && !queue.current) queue.current = update;
    }
    flushNow.current = flush;
    const timer = setInterval(flush, GOALIE_SEND_MS);
    return () => { live = false; clearInterval(timer); flushNow.current = null; };
  }, [defend, send]);

  const x = localX ?? shot?.goalieX ?? 0;
  function move(next: number) {
    const position = clamp(next, -GOALIE_LIMIT, GOALIE_LIMIT);
    if (Math.abs(x - position) < 0.025) return;
    setLocalX(position);
    queue.current = { x: position };
    flushNow.current?.();
  }
  return { x, move };
}

function Scoreboard({ state, playerId }: { state: TableSoccerState; playerId: string }) {
  return (
    <div className="soccer-scores" aria-label={`Score, first to ${WINNING_SCORE}`}>
      {state.players.map((player, index) => (
        <div key={player.id} className="soccer-score">
          <span className="soccer-score-name">
            <span className="soccer-seat-dot" style={{ background: seatColor(index) }} />
            <span>{player.id === playerId ? "You" : player.name}</span>
          </span>
          <strong aria-label={`${player.name} ${state.scores[index]} goals`}>{state.scores[index]}</strong>
        </div>
      ))}
    </div>
  );
}

function ShotResult({ state, playerId }: { state: TableSoccerState; playerId: string }) {
  const result = state.lastResult;
  if (!result) return null;
  const name = state.players.find((p) => p.id === result.shooterId)?.name;
  const defender = state.players.find((p) => p.id === result.defenderId)?.name;
  const message = result.kind === "miss" ? (result.shooterId === playerId ? "You missed" : `${name} missed`)
    : result.kind === "save" ? (result.defenderId === playerId ? "You saved it!" : `${defender} made the save!`)
    : result.shooterId === playerId ? "You scored!" : `${name} scored!`;
  return <p className="soccer-result" role="status">{message}</p>;
}

function PlayField({ state, room, playerId, dispatchAction, clockOffsetMs = 0 }: SoccerViewProps) {
  const seat = state.players.findIndex((player) => player.id === playerId);
  const phone = state.phones[seat];
  const seatInk = seatColor(seat);
  const shooter = state.players[state.shooterIndex];
  const yourTurn = state.phase === "aim" && shooter.id === playerId;
  const shot = state.shot;
  const defending = shot?.crossing?.playerId === playerId;
  const now = useFlightClock(shot?.settlesAt, clockOffsetMs);
  const canMoveGoalie = !!shot && defending && now < shot.startsAt + shot.duration;
  const target = state.players.find((player) => player.id === shot?.crossing?.playerId);
  const { match, turn } = state;
  const roomCode = room.roomCode;
  const send = useCallback<LiveSend>(async (type, extra) => {
    try {
      const res = await fetch("/api/game-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, playerId, type, payload: { match, turn, ...extra } }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [roomCode, playerId, match, turn]);
  useSettleFlight(shot, shooter.id === playerId ? 0 : 360 + Math.max(0, seat) * 70, clockOffsetMs, send);
  const goalie = useGoalie(shot, defending && !!shot && now < shot.settlesAt, send);
  const gesture = useRef<{ id: number; anchor: Point; kind: "aim" | "save" } | null>(null);
  const [pull, setPull] = useState<Point | null>(null);
  const [keyboardAngle, setKeyboardAngle] = useState(0);
  const [kickPending, setKickPending] = useState(false);

  if (!phone) return null;
  const worldBall = shot ? ballAt(shot.frames, now - shot.startsAt) : state.phase === "aim" ? toWorld(LAUNCH_POINT, state.phones[state.shooterIndex]) : null;
  const localBall = shot && worldBall ? toPhone(worldBall, phone)
    : yourTurn ? { x: LAUNCH_POINT.x + (pull?.x ?? 0), y: LAUNCH_POINT.y + (pull?.y ?? 0) } : null;
  const pullLength = pull ? Math.hypot(pull.x, pull.y) : 0;
  const aimDirection = pullLength >= MIN_PULL && pull ? kickDirection(pull) : null;
  const aimAt = aimDirection ? { x: LAUNCH_POINT.x + aimDirection.x * 12, y: LAUNCH_POINT.y + aimDirection.y * 12 } : null;
  const mapIndicator = aimDirection ? {
    from: toWorld(LAUNCH_POINT, phone),
    to: toWorld({ x: LAUNCH_POINT.x + aimDirection.x * 49, y: LAUNCH_POINT.y + aimDirection.y * 49 }, phone),
  } : null;
  const goalieX = defending ? goalie.x : 0;

  function kick(vector: Point) {
    if (!yourTurn || kickPending || Math.hypot(vector.x, vector.y) < MIN_PULL) return;
    setKickPending(true);
    void dispatchAction("SOCCER_KICK", { match, turn, pull: limitedPull(vector) }).finally(() => setKickPending(false));
  }

  function startGesture(event: PointerEvent<SVGSVGElement>) {
    if (gesture.current || event.button !== 0) return;
    const point = screenPoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) return;
    if (!canMoveGoalie && (!yourTurn || kickPending || Math.hypot(point.x - LAUNCH_POINT.x, point.y - LAUNCH_POINT.y) > 2.7)) return;
    gesture.current = { id: event.pointerId, anchor: point, kind: canMoveGoalie ? "save" : "aim" };
    if (canMoveGoalie) goalie.move(point.x);
    else setPull({ x: 0, y: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveGesture(event: PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const point = screenPoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) return;
    if (current.kind === "save") {
      if (canMoveGoalie) goalie.move(point.x);
    } else if (yourTurn) {
      setPull(limitedPull({ x: point.x - current.anchor.x, y: point.y - current.anchor.y }));
    }
  }

  function endGesture(event: PointerEvent<SVGSVGElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    setPull(null);
    if (cancelled) return;
    const point = screenPoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) return;
    if (current.kind === "aim") kick({ x: point.x - current.anchor.x, y: point.y - current.anchor.y });
    else if (canMoveGoalie) goalie.move(point.x);
  }

  function onKeys(event: KeyboardEvent<SVGSVGElement>) {
    const side = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (canMoveGoalie && side) {
      event.preventDefault();
      goalie.move(goalieX + side * 0.75);
    } else if (yourTurn && (side || event.key === "Enter" || event.key === "Escape")) {
      event.preventDefault();
      if (event.key === "Escape") { setPull(null); setKeyboardAngle(0); return; }
      const angle = keyboardAngle + side * Math.PI / 36;
      const next = { x: -Math.sin(angle) * MAX_PULL, y: Math.cos(angle) * MAX_PULL };
      if (side) { setKeyboardAngle(angle); setPull(next); }
      else { setPull(null); kick(next); }
    }
  }

  const heading = yourTurn ? "Your kick" : defending ? "Incoming shot" : shot ? `${shooter.name} kicked` : `${shooter.name} to kick`;
  const hint = yourTurn ? "Pull the ball back and release." : defending ? "Slide your goalie to block the ball." : shot && target ? `Shot on ${target.name}’s goal.` : "Watch the ball on the table map.";

  return (
    <section className="soccer-play">
      <div className="soccer-play-bar">
        <div className="soccer-live-status">
          <h2>{heading}</h2>
          <p>{hint}</p>
          <ShotResult state={state} playerId={playerId} />
        </div>
        <TableMap table={state.table} phones={state.phones} bumpers={state.bumpers} ball={worldBall} indicator={mapIndicator}
          highlightedId={playerId} mini label="Mini-map of the shared table and ball" />
      </div>
      <svg className="soccer-pitch" viewBox="-8 -11 16 22" role="group" aria-label="Your goal and ball controls" tabIndex={0}
        onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={(event) => endGesture(event)}
        onPointerCancel={(event) => endGesture(event, true)} onLostPointerCapture={(event) => endGesture(event, true)} onKeyDown={onKeys}>
        <rect x="-8" y="-11" width="16" height="22" fill="#195643" />
        {[-11, -5.5, 0, 5.5].map((y, index) => index % 2 === 0 && <rect key={y} x="-8" y={y} width="16" height="5.5" fill="#29664f" />)}
        <path d="M -7.5 -11 V 10.5 H 7.5 V -11 M -7.5 7.5 H 7.5 M -5.8 7.5 V 3 H 5.8 V 7.5 M -3.3 3 A 4.2 4.2 0 0 1 3.3 3" fill="none" stroke="#d5eddc" strokeWidth=".075" strokeOpacity=".58" />
        <rect x={-GOAL_HALF_WIDTH} y={GOAL_Y} width={GOAL_HALF_WIDTH * 2} height="2.6" rx=".25" fill="#0a3025" stroke={seatInk} strokeWidth=".12" />
        {[-6, -4, -2, 0, 2, 4, 6].map((x) => <path key={x} d={`M ${x} 7.5 V 10`} stroke={seatInk} strokeWidth=".045" strokeOpacity=".48" />)}
        <path d="M -6.8 8.4 H 6.8 M -6.8 9.2 H 6.8" stroke={seatInk} strokeWidth=".045" strokeOpacity=".48" />
        <line x1={-GOAL_HALF_WIDTH} x2={GOAL_HALF_WIDTH} y1={GOAL_Y} y2={GOAL_Y} stroke={seatInk} strokeWidth={defending ? 0.2 : 0.12} />
        <rect data-testid="goalie" x={goalieX - GOALIE_HALF_WIDTH} y={GOAL_Y - 0.21} width={GOALIE_HALF_WIDTH * 2} height=".43" rx=".21" fill={seatInk} />
        {aimAt && <>
          <line x1={LAUNCH_POINT.x} y1={LAUNCH_POINT.y} x2={localBall?.x} y2={localBall?.y} stroke={seatInk} strokeOpacity=".65" strokeWidth=".12" />
          <line x1={LAUNCH_POINT.x} y1={LAUNCH_POINT.y} x2={aimAt.x} y2={aimAt.y} stroke={seatInk} strokeWidth=".16" strokeDasharray=".44 .25" />
          <path d="M -.72 -.38 L 0 0 L -.72 .38 Z" fill={seatInk}
            transform={`translate(${aimAt.x} ${aimAt.y}) rotate(${Math.atan2(aimAt.y - LAUNCH_POINT.y, aimAt.x - LAUNCH_POINT.x) * 180 / Math.PI})`} />
        </>}
        {localBall && <g data-testid="pitch-ball" transform={`translate(${localBall.x} ${localBall.y})`}>
          <circle cy=".14" r={BALL_RADIUS + 0.13} fill="#0b382c" fillOpacity=".76" />
          <circle r={BALL_RADIUS} fill="#fffde7" stroke="#17352a" strokeWidth=".09" />
          <path d="M 0 -.4 L .38 -.13 L .23 .35 H -.23 L -.38 -.13 Z M 0 -.4 V -1.04 M .38 -.13 L 1 -.35 M .23 .35 L .63 .86 M -.23 .35 L -.63 .86 M -.38 -.13 L -1 -.35" stroke="#12382b" strokeWidth=".07" fill="#17382d" />
        </g>}
      </svg>
      {yourTurn && pullLength >= MIN_PULL && <meter className="soccer-power" min={0} max={MAX_PULL} value={pullLength} aria-label="Shot power" />}
    </section>
  );
}

export function TableSoccerGameView(props: SoccerViewProps) {
  const { state, room, playerId, isHost, dispatchAction } = props;
  const phase = state?.phase ?? "lobby";
  useWakeLock(phase !== "lobby" && phase !== "finished");
  const hasSeat = state?.players.some((player) => player.id === playerId);

  if (state && state.version !== TABLE_SOCCER_VERSION) return (
    <div className="soccer-shell"><section className="soccer-card">
      <h2>Start a fresh room</h2><p>This match was created by an earlier game version.</p><Link href="/create">Create a room</Link>
    </section></div>
  );

  if (!state || phase === "lobby") return (
    <div className="soccer-shell">
      <section className="soccer-card">
        <h2>Table Soccer</h2>
        <p>Share the room code, then lay one phone per player flat on the table.</p>
        {isHost ? <button className="soccer-primary" type="button" disabled={room.players.length < 2 || room.players.length > MAX_PLAYERS}
          onClick={() => void dispatchAction("SOCCER_OPEN_SETUP", { match: state?.match ?? 1, turn: state?.turn ?? 0 })}>Set up table</button>
          : <p>The host will start setup.</p>}
      </section>
    </div>
  );

  if (!hasSeat) return <p>This match started before you joined. <Link href="/">Back to Party Games</Link></p>;
  const winner = state.players[state.scores.findIndex((score) => score === WINNING_SCORE)];
  const setup = phase === "setup";
  const bumpers = phase === "initial-bumpers" || phase === "bonus-bumper";
  return (
    <div className="soccer-shell">
      <header className="soccer-top">
        <h1>Table Soccer</h1><span title="Room code">{room.roomCode}</span>
      </header>
      {!setup && <Scoreboard state={state} playerId={playerId} />}
      {setup && <TableSetup key={state.match} {...props} />}
      {bumpers && <BumperSetup key={`${state.match}-${state.turn}-${phase}`} {...props} />}
      {(phase === "aim" || phase === "flight") && <PlayField key={`${state.match}-${state.turn}`} {...props} />}
      {phase === "finished" && <section className="soccer-card">
        <h2>{winner?.id === playerId ? "You win!" : `${winner?.name ?? "Match"} wins!`}</h2>
        <p>{WINNING_SCORE} goals to win.</p>
        {isHost && <button className="soccer-primary" type="button" onClick={() => void dispatchAction("SOCCER_PLAY_AGAIN", {
          match: state.match, turn: state.turn,
        })}>Play again</button>}
        <Link className="soccer-exit" href="/">Leave room</Link>
      </section>}
    </div>
  );
}
