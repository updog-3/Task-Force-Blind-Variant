import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  areaHexes, getScenario, isCarrierNumber, numberFree, onBoard, other, scenarioNotes, SIDE_NAME,
  type Phase, type SeatView, type Side, type TaskForce,
} from '../../rules';
import type { MapPin } from './HexMap';
import { inviteKey, useBaseUrl, useMap, useSeat, type Send } from './net';
import { Board, Dusk, Ended, LogTable, Movement, Recon, Setup, typeTag, Waiting, type Ctx } from './panels';

const PHASE: Record<Phase, string> = {
  waiting: 'Waiting', setup: 'Setup', movement: 'Naval Movement', board: 'Board phases',
  recon: 'Reconnaissance', dusk: 'Dusk reset', ended: 'Game over',
};
type Overlay = null | 'notices' | 'board' | 'log' | 'menu';
type PinMode = 'all' | 'latest' | 'off';
const NEXT_PIN: Record<PinMode, PinMode> = { all: 'latest', latest: 'off', off: 'all' };
const PIN_LABEL: Record<PinMode, string> = { all: 'all', latest: 'latest turn', off: 'off' };

export function Game({ id }: { id: string }) {
  const seat = useSeat(id);
  const { view, send } = seat;
  const loaded = useMap(view?.mapId);
  const base = useBaseUrl();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [pinMode, setPinMode] = useState<PinMode>(() => (localStorage.getItem('tfb:pins') as PinMode) ?? 'all');
  const [terrain, setTerrain] = useState(() => localStorage.getItem('tfb:terrain') === 'on');

  // Open the notices overlay whenever a new notice arrives.
  const seen = useRef(0);
  const newest = Math.max(0, ...(view?.notices ?? []).map((n) => n.id));
  useEffect(() => {
    if (newest > seen.current) setOverlay('notices');
    seen.current = Math.max(seen.current, newest);
  }, [newest]);
  useEffect(() => {
    if (overlay === 'notices' && view && view.notices.length === 0) setOverlay(null);
  }, [view, overlay]);

  const rec = useMemo(() => Object.fromEntries((view?.tfs ?? []).map((t) => [t.number, t])) as Record<number, TaskForce>, [view]);

  if (seat.fatal) {
    return <div className="page"><h1>Seat unavailable</h1><p className="error">{seat.fatal}</p><a href="#/">Home</a></div>;
  }
  if (!view || !loaded) return <div className="page"><h1>Connecting…</h1></div>;

  // Sighting pins: the player's own one-time reports, kept on their map until the end of the game.
  const stamp = (p: { day: number; turn: number }) => p.day * 100 + p.turn;
  const newestPin = Math.max(0, ...view.pins.map(stamp));
  const scenario0 = getScenario(view.scenarioId);
  const pins: MapPin[] = pinMode === 'off' ? [] : view.pins
    .filter((p) => pinMode === 'all' || stamp(p) === newestPin)
    .map((p) => {
      const when = `${p.day > 1 ? `D${p.day} ` : ''}T${p.turn}`;
      const old = stamp(p) < newestPin ? ' old' : '';
      const counts = [p.carriers ? `${p.carriers}C` : '', p.fleets ? `${p.fleets}F` : ''].filter(Boolean).join(' ');
      const area = p.kind === 'area' ? scenario0.areaSearches.find((a) => a.id === p.areaId) : undefined;
      if (area) return { hexes: areaHexes(view.mapId, area), label: `${when} ${area.label.replace(/ \(.*/, '')}: ${counts}`, cls: old };
      return p.kind === 'pby'
        ? { hexes: [p.center], label: `${when} PBY`, cls: `pby${old}` }
        : { hexes: loaded.map.zone(p.center), label: `${when}: ${[p.carriers ? `${p.carriers}C` : '', p.fleets ? `${p.fleets}F` : ''].filter(Boolean).join(' ')}`, cls: old };
    });
  const cyclePins = () => { const m = NEXT_PIN[pinMode]; setPinMode(m); localStorage.setItem('tfb:pins', m); };
  const hasTerrain = (loaded.def.land?.length ?? 0) + loaded.def.blockedHexsides.length > 0;
  const toggleTerrain = () => { setTerrain(!terrain); localStorage.setItem('tfb:terrain', terrain ? 'off' : 'on'); };
  const ctx: Ctx = { view, send, loaded, rec, pins, terrain: terrain && hasTerrain };
  const scenario = getScenario(view.scenarioId);
  const notes = scenarioNotes(scenario, view.mapId);
  const info = view.turnInfo;
  const opp = other(view.you);
  const playing = !['waiting', 'setup', 'ended'].includes(view.phase);
  const invite = localStorage.getItem(inviteKey(id));
  const boardCount = view.tfs.filter(onBoard).length;

  return (
    <div className="game" data-side={view.you}>
      <div className="top">
        {view.phase !== 'waiting' && <span className="turn">{view.day > 1 ? `Day ${view.day} · ` : ''}Turn {view.turn}</span>}
        {playing && <span className="muted">{info.clock} · {info.period === 'night' ? '☾ Night' : '☀ Day'}</span>}
        <span className="state">{PHASE[view.phase]}</span>
        {playing && <span className={`badge ${info.initiative}`}>{SIDE_NAME[info.initiative]} initiative</span>}
        <span className={`badge ${view.you}`}>You: {SIDE_NAME[view.you]}</span>
        {playing && (view.confirmed.opponent
          ? <span className="badge ready">Opponent ready</span>
          : view.locked.opponent && view.stage === 'draft' ? <span className="badge ready">Opponent locked</span> : null)}
        {!seat.online && <span className="badge off">Reconnecting…</span>}
        <span className="tools">
          {view.notices.length > 0 && <button className="small on" onClick={() => setOverlay('notices')}>Notices ({view.notices.length})</button>}
          {view.pins.length > 0 && <button className="small" title="Your sighting reports on the map" onClick={cyclePins}>Pins: {PIN_LABEL[pinMode]}</button>}
          {hasTerrain && <button className={`small ${terrain ? 'on' : ''}`} title="Shade all-land hexes and outline the land and reef hexsides that block ships and contact" onClick={toggleTerrain}>Terrain</button>}
          {playing && <button className="small" onClick={() => setOverlay('board')}>On board{boardCount ? ` (${boardCount})` : ''}</button>}
          {view.phase !== 'waiting' && <button className="small" onClick={() => setOverlay('log')}>Log</button>}
          <button className="small" onClick={() => setOverlay('menu')}>Menu</button>
        </span>
      </div>
      {playing && <div className="reminders">
        <span>Move: {info.move} hex{info.move > 1 ? 'es' : ''}</span>
        <span>Transports {info.period === 'night' ? 'may move (1 hex)' : info.transportsMove ? 'may move this turn' : 'may not move this turn'}{view.flags.enforceTransports ? ' (enforced)' : ''}</span>
        {info.raidsBarred && <span>No air raids this turn{info.period === 'night' ? ' (night)' : ''}</span>}
        <span>{info.recon ? 'Reconnaissance this turn' : 'No reconnaissance this turn'}</span>
        {info.splits && <span>Splits allowed</span>}
        {info.dusk && <span>Dusk reset at the end of this turn</span>}
        {notes.filter((n) => n.turns?.includes(view.turn)).map((n, i) => <span key={i} className="scen">{n.text}</span>)}
      </div>}
      {view.endRequest && view.phase !== 'ended' && <div className="banner">
        {view.endRequest === view.you
          ? <><span>You asked to end the game. Waiting for your opponent to confirm.</span><button className="small" onClick={() => send({ type: 'cancelEnd' })}>Withdraw</button></>
          : <><span>The {SIDE_NAME[opp]} player asks to end the game and reveal everything.</span>
            <button className="small primary" onClick={() => send({ type: 'confirmEnd' })}>End game</button>
            <button className="small" onClick={() => send({ type: 'cancelEnd' })}>Decline</button></>}
      </div>}

      {view.phase === 'waiting' && <Waiting ctx={ctx} inviteLink={invite ? `${base}/#/join/${id}/${invite}` : null} />}
      {view.phase === 'setup' && <Setup ctx={ctx} />}
      {view.phase === 'movement' && <Movement key={`${view.day}-${view.turn}`} ctx={ctx} />}
      {view.phase === 'board' && <Board ctx={ctx} />}
      {view.phase === 'recon' && <Recon key={`${view.day}-${view.turn}`} ctx={ctx} />}
      {view.phase === 'dusk' && <Dusk ctx={ctx} />}
      {view.phase === 'ended' && <Ended ctx={ctx} />}

      {overlay === 'notices' && <Modal title="Notices" close={() => setOverlay(null)} closeLabel="Hide">
        <p className="muted small">Notices must be acknowledged before the state can be completed.</p>
        {view.notices.map((n) => (
          <div className="notice" key={n.id}>
            <p>{n.text}</p>
            <button className="primary" onClick={() => send({ type: 'ack', id: n.id })}>{n.button}</button>
          </div>
        ))}
        {view.notices.length > 2 && <button onClick={() => send({ type: 'ack', id: 'all' })}>Acknowledge all</button>}
      </Modal>}
      {overlay === 'board' && <Modal title="Task Force register" close={() => setOverlay(null)}><Register view={view} rec={rec} send={send} /></Modal>}
      {overlay === 'log' && <Modal title="Log" close={() => setOverlay(null)}>
        <p className="muted small">Your own entries and shared notices. The full log from both sides is shown when the game ends.</p>
        <LogTable view={view} />
      </Modal>}
      {overlay === 'menu' && <Modal title="Menu" close={() => setOverlay(null)}>
        <Menu id={id} view={view} send={send} reissue={seat.reissue} base={base} close={() => setOverlay(null)} />
        <h3>{scenario.label}</h3>
        <p className="muted small">Map: {loaded.def.name}. Reminders only: the app enforces none of these.</p>
        <ul className="rules">{notes.map((n, i) => <li key={i}>{n.turns ? `Turn${n.turns.length > 1 ? 's' : ''} ${n.turns.join(', ')}: ` : ''}{n.text}</li>)}</ul>
      </Modal>}
      {seat.toast && <div className="toast" onClick={() => seat.setToast(null)}>{seat.toast}</div>}
    </div>
  );
}

function Modal({ title, close, closeLabel, children }: { title: string; close: () => void; closeLabel?: string; children: ReactNode }) {
  return (
    <div className="overlay" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="head"><h2>{title}</h2><button className="small" onClick={close}>{closeLabel ?? 'Close'}</button></div>
        {children}
      </div>
    </div>
  );
}

/** The on-board list: keeps the app's register in step with the physical board. */
function Register({ view, rec, send }: { view: SeatView; rec: Record<number, TaskForce>; send: Send }) {
  const board = view.tfs.filter(onBoard);
  const others = view.tfs.filter((t) => t.status === 'hidden' || t.status === 'combined');
  const [m, setM] = useState({ keep: 0, other: 0, mode: 'absorb' as 'absorb' | 'combine' });
  const [s, setS] = useState({ from: 0, to: 0 });
  const splitParent = rec[s.from];
  const splitChoices = splitParent ? [...splitParent.combinedWith, ...[7, 8, 9, 10, 11, 12, 13].filter((n) => numberFree(rec, n))] : [];
  const flags = (t: TaskForce) => (
    <>
      {isCarrierNumber(t.number) && <>
        <label className="check small" style={{ margin: 0 }}>
          <input type="checkbox" checked={t.carrierPresent} onChange={(e) => send({ type: 'editTf', number: t.number, carrierPresent: e.target.checked })} /> Carrier present
        </label>
        <label className="small" style={{ margin: 0 }}>Zones
          <input type="number" min={0} max={12} value={t.zoneCount} style={{ width: '4rem' }}
            onChange={(e) => send({ type: 'editTf', number: t.number, zoneCount: Number(e.target.value) })} />
        </label>
      </>}
      {view.flags.enforceTransports && <label className="check small" style={{ margin: 0 }}>
        <input type="checkbox" checked={t.hasTransports} onChange={(e) => send({ type: 'editTf', number: t.number, hasTransports: e.target.checked })} /> Transports
      </label>}
    </>
  );
  return (
    <>
      <h3>On the board</h3>
      <p className="muted small">Revealed Task Forces stay on the board until the dusk reset, and the app does not track their positions. Record here when one sinks, withdraws, merges or splits.</p>
      {board.length === 0 && <p className="muted">None of your Task Forces are on the board.</p>}
      <ul className="list">
        {board.map((t) => (
          <li key={t.number}>
            <b>TF {t.number}</b>{typeTag(rec, t)}
            <span className="muted small">revealed at {t.lastHex}</span>
            {t.combinedWith.length > 0 && <span className="muted small">with TF {t.combinedWith.join(', ')}</span>}
            <span className="grow" />
            <button className="small danger" onClick={() => { if (confirm(`Mark TF ${t.number} as Gone (sunk, withdrawn or off the map)?`)) send({ type: 'boardMark', number: t.number, to: 'gone' }); }}>Mark gone</button>
            <div className="row wrap" style={{ width: '100%' }}>{flags(t)}</div>
          </li>
        ))}
      </ul>
      {board.length >= 2 && <div className="box">
        <b>Record a merge made on the board</b>
        <div className="row">
          <select className="small" value={m.keep} onChange={(e) => setM({ ...m, keep: Number(e.target.value) })}>
            <option value={0}>Keep…</option>{board.map((t) => <option key={t.number} value={t.number}>TF {t.number}</option>)}
          </select>
          <select className="small" value={m.other} onChange={(e) => setM({ ...m, other: Number(e.target.value) })}>
            <option value={0}>Merge in…</option>{board.filter((t) => t.number !== m.keep).map((t) => <option key={t.number} value={t.number}>TF {t.number}</option>)}
          </select>
          <select className="small" value={m.mode} onChange={(e) => setM({ ...m, mode: e.target.value as 'absorb' })}>
            <option value="absorb">absorb</option><option value="combine">keep both formations</option>
          </select>
          <button className="small" disabled={!m.keep || !m.other} onClick={() => send({ type: 'boardOp', op: { type: 'merge', keep: m.keep, other: m.other, mode: m.mode } })}>Record</button>
        </div>
      </div>}
      {board.length >= 1 && view.turnInfo.splits && <div className="box">
        <b>Record a night split made on the board</b>
        <div className="row">
          <select className="small" value={s.from} onChange={(e) => setS({ from: Number(e.target.value), to: 0 })}>
            <option value={0}>From…</option>{board.map((t) => <option key={t.number} value={t.number}>TF {t.number}</option>)}
          </select>
          <select className="small" value={s.to} onChange={(e) => setS({ ...s, to: Number(e.target.value) })}>
            <option value={0}>New number…</option>{splitChoices.map((n) => <option key={n} value={n}>TF {n}</option>)}
          </select>
          <button className="small" disabled={!s.from || !s.to} onClick={() => send({ type: 'boardOp', op: { type: 'split', from: s.from, to: s.to } })}>Record</button>
        </div>
      </div>}
      <h3>Hidden</h3>
      <ul className="list">
        {others.map((t) => (
          <li key={t.number}>
            <b>TF {t.number}</b>
            <span>{t.status === 'combined' ? `combined under TF ${t.combinedInto}` : `hidden at ${t.hex}`}</span>
            <span className="grow" />{flags(t)}
          </li>
        ))}
        {others.length === 0 && <li className="muted">None.</li>}
      </ul>
      <p className="muted small">Untick <i>Carrier present</i> when a Task Force's carrier is sunk: it then reports as a Fleet and stops being a search source next turn.</p>
    </>
  );
}

function Menu({ id, view, send, reissue, base, close }: {
  id: string; view: SeatView; send: Send; reissue: (seat: Side, mine: boolean) => Promise<string | null>; base: string; close: () => void;
}) {
  const [link, setLink] = useState('');
  const opp = other(view.you);
  return (
    <>
      <p>Game <b>{id}</b> · you are the <b>{SIDE_NAME[view.you]}</b> player · started on turn {view.startingTurn}</p>
      <p className="muted small">
        Options: transports {view.flags.enforceTransports ? 'enforced' : 'not enforced'} · empty cup: {view.flags.cupEmpty === 'reshuffle' ? 'reshuffle' : 'No Contact'} · default zones IJN {view.flags.defaultZones.ijn}, Allies {view.flags.defaultZones.allies}
      </p>
      <h3>Seats</h3>
      <p className="muted small">Re-issuing a seat makes its old link stop working. Both players are told.</p>
      <div className="row wrap">
        <button onClick={async () => {
          if (!confirm(`Re-issue the ${SIDE_NAME[opp]} seat? Their current device will be disconnected.`)) return;
          const t = await reissue(opp, false);
          if (t) setLink(`${base}/#/seat/${id}/${t}`);
        }}>Re-issue the {SIDE_NAME[opp]} seat</button>
        <button onClick={async () => {
          if (!confirm('Re-issue your own seat? Other devices using it will be disconnected.')) return;
          const t = await reissue(view.you, true);
          if (t) setLink(`${base}/#/seat/${id}/${t}`);
        }}>Re-issue my seat</button>
      </div>
      {link && <><p>New seat link:</p><code className="link">{link}</code></>}
      {view.phase !== 'ended' && view.phase !== 'waiting' && <>
        <h3>End of game</h3>
        <p className="muted small">The app does not know when a scenario ends. Ending needs both players, then everything is revealed.</p>
        <button className="danger" disabled={!!view.endRequest} onClick={() => { send({ type: 'requestEnd' }); close(); }}>Ask to end the game</button>
      </>}
      <p className="small" style={{ marginTop: '1rem' }}><a href="#/">Home</a> · <a href={`#/calibrate/${view.mapId}`}>Calibrate map grid</a></p>
    </>
  );
}
