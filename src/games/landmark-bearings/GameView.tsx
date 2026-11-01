"use client";

import Link from "next/link";
import { useState } from "react";
import type { GameViewProps } from "../views";
import { BEARINGS_STATE_VERSION, eligibleLandmarks, initialState, standings, type BearingsSettings,
  type BearingsState, type RoundResult } from "./config";
import { Compass, guessColor } from "./Compass";
import { compassDirection, isLocation } from "./geography";
import { getLandmark, ORIGINS } from "./places";

const panel = "rounded-2xl border border-slate-700 bg-slate-800/70 p-5";
const field = "w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-base text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30";
const primary = "min-h-12 w-full rounded-xl bg-teal-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400";
const secondary = "min-h-11 rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-teal-400 disabled:opacity-50";

type Send = (type: string, payload?: Record<string, unknown>) => Promise<void>;

function Setup({ settings: saved, playerCount, send }: {
  settings: BearingsSettings; playerCount: number; send: Send;
}) {
  const [settings, setSettings] = useState(saved);
  const [originChoice, setOriginChoice] = useState(() => {
    const index = ORIGINS.findIndex((place) => JSON.stringify(place) === JSON.stringify(saved.origin));
    return index < 0 ? "custom" : String(index);
  });
  const [latitude, setLatitude] = useState(String(saved.origin.latitude));
  const [longitude, setLongitude] = useState(String(saved.origin.longitude));
  const [name, setName] = useState(saved.origin.name);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const origin = originChoice === "custom" ? {
    name, latitude: latitude.trim() ? Number(latitude) : NaN,
    longitude: longitude.trim() ? Number(longitude) : NaN,
  } : ORIGINS[Number(originChoice)];
  const validOrigin = isLocation(origin);
  const draft = { ...settings, origin };
  const places = validOrigin ? eligibleLandmarks(draft) : [];
  const valid = validOrigin && places.length >= settings.rounds &&
    (!settings.firstLandmarkId || places.some((place) => place.id === settings.firstLandmarkId));

  function locate() {
    if (!navigator.geolocation) { setLocationMessage("Location is unavailable. Choose a city or enter coordinates."); return; }
    setLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition((position) => {
      setOriginChoice("custom"); setName("Our current location");
      setSettings((previous) => ({ ...previous, firstLandmarkId: "" }));
      setLatitude(String(position.coords.latitude)); setLongitude(String(position.coords.longitude));
      setLocating(false); setLocationMessage("Location ready. Everyone will guess from this point.");
    }, () => {
      setLocating(false); setLocationMessage("Couldn’t get location. Choose a city or enter coordinates.");
    }, { timeout: 12000, maximumAge: 60000 });
  }

  return <section className={`${panel} space-y-5`}>
    <h2 className="text-lg font-semibold">Set your starting point</h2>
    <div>
      <label htmlFor="bearings-origin" className="mb-2 block text-sm text-slate-300">Where are we?</label>
      <select id="bearings-origin" className={field} value={originChoice} onChange={(event) => {
        setOriginChoice(event.target.value); setSettings({ ...settings, firstLandmarkId: "" });
      }}>
        {ORIGINS.map((place, index) => <option key={place.name} value={index}>{place.name}</option>)}
        <option value="custom">Enter a location…</option>
      </select>
      <button type="button" onClick={locate} disabled={locating} className={`${secondary} mt-2 w-full`}>
        {locating ? "Finding location…" : "Use our current location"}
      </button>
      {locationMessage && <p role="status" className="mt-2 text-sm text-teal-200">{locationMessage}</p>}
    </div>
    {originChoice === "custom" && <div className="space-y-3">
      <label className="block text-sm text-slate-300">Location name
        <input className={`${field} mt-1`} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-slate-300">Latitude
          <input className={`${field} mt-1`} type="number" step="any" min={-89.999999} max={89.999999}
            value={latitude} onChange={(event) => { setLatitude(event.target.value); setSettings({ ...settings, firstLandmarkId: "" }); }} />
        </label>
        <label className="text-sm text-slate-300">Longitude
          <input className={`${field} mt-1`} type="number" step="any" min={-180} max={180}
            value={longitude} onChange={(event) => { setLongitude(event.target.value); setSettings({ ...settings, firstLandmarkId: "" }); }} />
        </label>
      </div>
      <p className="text-xs text-slate-400">Use negative longitude for the Americas. Exact poles are excluded.</p>
      {!validOrigin && <p className="text-sm text-amber-200">Enter a name and valid latitude/longitude.</p>}
    </div>}
    <div className="grid grid-cols-2 gap-3">
      <label className="text-sm text-slate-300">Landmarks
        <select className={`${field} mt-1`} value={settings.pack} onChange={(event) => setSettings({
          ...settings, pack: event.target.value as BearingsSettings["pack"], firstLandmarkId: "",
        })}>
          <option value="us">US favorites</option><option value="world">World tour</option><option value="all">All landmarks</option>
        </select>
      </label>
      <label className="text-sm text-slate-300">Rounds
        <select className={`${field} mt-1`} value={settings.rounds}
          onChange={(event) => setSettings({ ...settings, rounds: Number(event.target.value) })}>
          {Array.from({ length: 10 }, (_, index) => index + 1).map((rounds) => <option key={rounds} value={rounds}>{rounds}</option>)}
        </select>
      </label>
    </div>
    <label className="block text-sm text-slate-300">First landmark
      <select className={`${field} mt-1`} value={settings.firstLandmarkId}
        onChange={(event) => setSettings({ ...settings, firstLandmarkId: event.target.value })}>
        <option value="">Surprise us</option>
        {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
      </select>
    </label>
    <p className="text-sm leading-relaxed text-slate-300">Everyone guesses an angle. Closest wins the round.
      Lowest total degrees off wins the game. Ties share the win.</p>
    <button type="button" className={primary} disabled={!valid || busy || playerCount < 2 || playerCount > 12}
      onClick={async () => { setBusy(true); try { await send("START_GAME", { settings: draft }); } finally { setBusy(false); } }}>
      {busy ? "Starting…" : playerCount < 2 ? "Waiting for at least 2 players" : "Start the expedition"}
    </button>
  </section>;
}

function GuessForm({ state, playerId, send }: { state: BearingsState; playerId: string; send: Send }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const value = input.trim() === "" ? NaN : Number(input);
  const valid = Number.isInteger(value) && value >= 0 && value <= 360;
  const locked = state.guesses[playerId] !== undefined;
  return <section className={panel}>
    <h2 className="text-lg font-semibold">{locked ? "Guess locked in" : "Which way would you point?"}</h2>
    {locked ? <div className="py-6 text-center" role="status">
      <span className="text-3xl text-teal-300" aria-hidden="true">✓</span>
      <p className="mt-3 text-slate-300">{state.players.find((player) => player.id === playerId)?.name}, you’re ready.</p>
      <p className="mt-2 text-sm text-slate-400">{state.guesses[playerId]}° saved. Waiting for the reveal.</p>
      { /* Do not draw a saved needle: a passed phone starts from a neutral compass. */ }
    </div> : <form onSubmit={async (event) => {
      event.preventDefault(); if (!valid || busy) return;
      setBusy(true);
      try { await send("SUBMIT_GUESS", { round: state.round, match: state.match, value }); } finally { setBusy(false); }
    }}>
      <Compass draft={valid ? value : undefined} />
      <label htmlFor="bearings-guess" className="mb-2 block text-sm text-slate-300">Your bearing in degrees</label>
      <div className="flex items-center gap-3">
        <input id="bearings-guess" className={`${field} text-center text-3xl font-semibold tabular-nums`}
          type="number" inputMode="numeric" min={0} max={360} step={1} placeholder="0–359"
          value={input} onChange={(event) => setInput(event.target.value)} required autoComplete="off" />
        <span className="text-2xl text-slate-400">°</span>
      </div>
      <div className="my-3 grid grid-cols-4 gap-2">
        {[["N", 0], ["E", 90], ["S", 180], ["W", 270]].map(([label, degrees]) =>
          <button key={label} type="button" className={secondary} onClick={() => setInput(String(degrees))}>{label} {degrees}°</button>)}
      </div>
      <p className="mb-4 text-xs text-slate-400">Clockwise from north. 360° counts as 0°. Guesses lock when submitted.</p>
      <button className={primary} type="submit" disabled={!valid || busy}>{busy ? "Locking in…" : "Lock in my guess"}</button>
    </form>}
  </section>;
}

function ResultTable({ state, result }: { state: BearingsState; result: RoundResult }) {
  const players = [...state.players].sort((a, b) => result.errors[a.id] - result.errors[b.id]);
  return <table className="w-full text-left text-sm">
    <caption className="sr-only">Round {result.round} guesses and angular errors</caption>
    <thead className="text-xs text-slate-400"><tr>
      <th scope="col" className="pb-3 font-normal">Player</th><th scope="col" className="pb-3 text-right font-normal">Guess</th>
      <th scope="col" className="pb-3 text-right font-normal">Degrees off</th>
    </tr></thead>
    <tbody>{players.map((player) => <tr key={player.id} className="border-t border-slate-700">
      <th scope="row" className="max-w-[8rem] break-words py-3 pr-2 font-medium">
        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: guessColor(state.players.indexOf(player)) }} />
        {player.name}{result.winnerIds.includes(player.id) && <span className="ml-1 text-teal-300" aria-label="round winner">★</span>}
      </th>
      <td className="py-3 text-right tabular-nums text-slate-300">{result.guesses[player.id] === undefined ? "Missed" : `${result.guesses[player.id]}°`}</td>
      <td className="py-3 text-right font-semibold tabular-nums text-teal-200">{result.errors[player.id].toFixed(1)}°</td>
    </tr>)}</tbody>
  </table>;
}

export function LandmarkBearingsGameView({ state: raw, room, playerId, isHost, dispatchAction }: GameViewProps<BearingsState>) {
  const state = raw ?? initialState();
  const [busy, setBusy] = useState(false);
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [error, setError] = useState("");
  const send: Send = async (type, payload) => {
    setError("");
    try { await dispatchAction(type, payload); }
    catch { setError("Couldn’t send that action. Please try again."); }
  };
  if (state.version !== BEARINGS_STATE_VERSION) return <section className={panel}>
    <h1 className="text-xl">This game has been updated</h1>
    <p className="mt-3">Create a fresh room to play this version.</p><Link href="/create" className="mt-3 block text-teal-300 underline">Create a room</Link>
  </section>;

  const landmark = getLandmark(state.deck[state.round - 1]);
  const result = state.history[state.history.length - 1];
  const playing = state.phase !== "lobby";
  const hasSeat = state.players.some((player) => player.id === playerId);
  const missing = state.players.filter((player) => state.guesses[player.id] === undefined);
  const ranking = standings(state);
  const leaders = ranking.filter((player) => Math.abs(player.totalError - (ranking[0]?.totalError ?? 0)) < 1e-9);
  const winnerNames = result?.winnerIds.map((id) => state.players.find((player) => player.id === id)?.name).join(" & ");
  const hotseat = room.mode === "hotseat";

  async function control(type: string) {
    setBusy(true);
    try { await send(type, { round: state.round, match: state.match }); } finally { setBusy(false); setConfirmMissing(false); }
  }

  return <div className="space-y-4 pb-6 text-slate-100">
    <header className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Geography · Gut instinct</p>
        <h1 className="mt-1 text-2xl font-bold">Landmark Bearings</h1></div>
      {playing && <span className="shrink-0 rounded-full border border-slate-700 px-3 py-2 text-xs text-slate-300">{state.round} / {state.settings.rounds}</span>}
    </header>
    <p className="rounded-xl border border-teal-900 bg-teal-950/50 p-3 text-center text-xs leading-relaxed text-teal-100">
      N 0° · E 90° · S 180° · W 270°<br />Bearings turn clockwise from true north.
    </p>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}

    {!playing && <>
      {isHost ? <Setup settings={state.settings} playerCount={room.players.length} send={send} /> :
        <section className={panel}><h2 className="font-semibold">Ready for an expedition?</h2>
          <p className="mt-3 text-sm text-slate-300">The host is choosing the starting point. Guess the direction to each landmark;
            the lowest total degrees off wins.</p></section>}
      <p className="text-center text-xs text-slate-400">24 landmarks · 2–12 players · No maps needed</p>
    </>}

    {playing && landmark && <section className={`${panel} border-teal-800`}>
      <p className="text-xs uppercase tracking-wide text-slate-400">From</p>
      <p className="mt-1 font-medium">{state.settings.origin.name}</p>
      <div className="my-3 h-px bg-slate-700" />
      <p className="text-xs uppercase tracking-wide text-teal-300">Point toward</p>
      <h2 className="mt-1 text-2xl font-bold">{landmark.name}</h2>
      <p className="mt-1 text-sm text-slate-400">{landmark.area}</p>
    </section>}

    {state.phase === "guessing" && <>
      {hasSeat ? <GuessForm key={`${state.match}-${state.round}-${playerId}`} state={state} playerId={playerId} send={send} /> :
        <p className={panel}>This expedition has started. You can join the next game.</p>}
      <section className={`${panel} space-y-4`}>
        <h2 className="font-semibold">{Object.keys(state.guesses).length} / {state.players.length} guesses locked</h2>
        <div className="flex flex-wrap gap-2">{state.players.map((player) => <span key={player.id}
          className={`max-w-full break-words rounded-full px-3 py-1 text-xs ${state.guesses[player.id] !== undefined ? "bg-teal-900/60 text-teal-200" : "bg-slate-700 text-slate-300"}`}>
          {player.name} {state.guesses[player.id] !== undefined ? "✓" : "…"}
        </span>)}</div>
        {hotseat && <p className="text-sm text-slate-300">Pass the phone and use <strong>Next Player</strong> above. Return to the host seat to reveal.</p>}
        {isHost ? <>
          {missing.length > 0 && <p className="text-xs text-slate-400">Waiting for {missing.map((player) => player.name).join(", ")}.
            Revealing early gives each missing player 180° off.</p>}
          {confirmMissing && <p role="alert" className="text-sm text-amber-200">Reveal without {missing.length} {missing.length === 1 ? "guess" : "guesses"}? Each missing player gets 180° off.</p>}
          <button className={primary} disabled={busy || Object.keys(state.guesses).length === 0} onClick={() => {
            if (missing.length && !confirmMissing) { setConfirmMissing(true); return; }
            void control("REVEAL_RESULTS");
          }}>{busy ? "Revealing…" : confirmMissing && missing.length ? "Confirm early reveal" : "Reveal the bearing"}</button>
          {confirmMissing && <button className={`${secondary} w-full`} onClick={() => setConfirmMissing(false)}>Keep waiting</button>}
        </> : <p className="text-sm text-slate-400">The host reveals when everyone is ready.</p>}
      </section>
    </>}

    {(state.phase === "round_results" || state.phase === "finished") && result && <>
      <section className={`${panel} space-y-4`}>
        <div className="text-center"><p className="text-sm text-slate-400">The initial bearing is</p>
          <p className="mt-1 text-5xl font-bold tabular-nums text-teal-300">{result.answer.toFixed(1)}°</p>
          <p className="mt-2 text-sm text-slate-300">{compassDirection(result.answer)} · clockwise from true north</p></div>
        <Compass answer={result.answer} guesses={state.players.flatMap((player, index) => result.guesses[player.id] === undefined ? [] :
          [{ name: player.name, value: result.guesses[player.id], color: guessColor(index) }])} />
        <p className="text-center font-semibold text-teal-200">{winnerNames} {result.winnerIds.length > 1 ? "tie for the round!" : "wins the round!"}</p>
        <ResultTable state={state} result={result} />
        <p className="text-xs leading-relaxed text-slate-400">The teal ray is the answer. We score the smaller angle around the compass.
          These are initial great-circle bearings on a globe; a straight line on a flat map can differ.</p>
        <a className="block text-xs text-teal-300 underline" href={landmark?.source} target="_blank" rel="noreferrer">Landmark coordinate reference ↗</a>
      </section>
      <section className={`${panel} space-y-4`}>
        <h2 className="text-lg font-semibold">{state.phase === "finished" ? "Final standings" : "Expedition leaderboard"}</h2>
        {state.phase === "finished" && <p className="text-lg font-bold text-teal-300">
          {leaders.map((player) => player.name).join(" & ")} {leaders.length > 1 ? "share the expedition win!" : "wins the expedition!"}</p>}
        <p className="text-xs text-slate-400">Total degrees off · lower is better</p>
        <ol className="space-y-3">{ranking.map((player) => <li key={player.id} className="flex items-center justify-between gap-3">
          <span className="min-w-0 break-words"><span className="mr-2 text-slate-500">{ranking.findIndex((other) => Math.abs(other.totalError - player.totalError) < 1e-9) + 1}.</span>{player.name}</span>
          <span className="shrink-0 text-right"><strong className="tabular-nums text-teal-200">{player.totalError.toFixed(1)}°</strong>
            <span className="block text-xs text-slate-400">{player.wins} round {player.wins === 1 ? "win" : "wins"}</span></span>
        </li>)}</ol>
        {isHost ? <button className={primary} disabled={busy} onClick={() => void control(state.phase === "finished" ? "PLAY_AGAIN" : "NEXT_ROUND")}>
          {busy ? "Starting…" : state.phase === "finished" ? "Plan another expedition" : "Next landmark →"}
        </button> : <p className="text-sm text-slate-400">{hotseat ? "Switch to the host seat above to continue." : "Waiting for the host to continue."}</p>}
      </section>
      <details className={panel}><summary className="cursor-pointer text-sm font-semibold">Round history ({state.history.length})</summary>
        <div className="mt-4 space-y-6">{state.history.map((past) => <section key={past.round}>
          <h3 className="mb-3 text-sm font-semibold text-teal-200">{past.round}. {getLandmark(past.landmarkId)?.name} · {past.answer.toFixed(1)}°</h3>
          <ResultTable state={state} result={past} />
        </section>)}</div>
      </details>
    </>}
    {playing && <footer className="flex items-center justify-between px-1 text-xs text-slate-400">
      <span>Room {room.roomCode}</span><Link href="/" className="text-slate-300 underline">Leave room</Link>
    </footer>}
  </div>;
}
