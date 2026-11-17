import { useEffect, useState } from 'react';
import { solveCalibration, type Calibration, type Side } from '../../rules';
import type { ClaimResponse, CreateResponse, InfoResponse } from '../../server/protocol';
import { Game } from './Game';
import { HexMap } from './HexMap';
import { api, inviteKey, knownSessions, tokenKey, useMap } from './net';

const go = (hash: string) => { location.hash = hash; };

function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function App() {
  const [page, a, b] = useRoute();
  if (page === 'g' && a) return <Game key={a} id={a} />;
  if (page === 'join' && a && b) return <Join id={a} invite={b} />;
  if (page === 'seat' && a && b) return <SeatLink id={a} token={b} />;
  if (page === 'calibrate') return <Calibrate mapId={a ?? 'midway'} />;
  return <Home />;
}

function Home() {
  const [info, setInfo] = useState<InfoResponse | null>(null);
  const [mapId, setMapId] = useState('midway');
  const [turn, setTurn] = useState(1);
  const [side, setSide] = useState<Side>('ijn');
  const [transports, setTransports] = useState(false);
  const [cupEmpty, setCupEmpty] = useState<'reshuffle' | 'noContact'>('reshuffle');
  const [zIjn, setZIjn] = useState(2);
  const [zAllies, setZAllies] = useState(3);
  const [rules, setRules] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  useEffect(() => { api<InfoResponse>('/api/info').then(setInfo).catch(() => undefined); }, []);

  const create = async () => {
    try {
      const r = await api<CreateResponse>('/api/sessions', {
        mapId, startingTurn: turn, side, optionalRules: rules,
        flags: { enforceTransports: transports, cupEmpty, defaultZones: { ijn: zIjn, allies: zAllies } },
      });
      localStorage.setItem(tokenKey(r.id), r.seatToken);
      localStorage.setItem(inviteKey(r.id), r.inviteToken);
      go(`/g/${r.id}`);
    } catch (e) { setError((e as Error).message); }
  };
  const open = () => {
    const m = link.match(/#\/?(.+)$/);
    if (m) go('/' + m[1]); else setError('Paste a full seat or invite link.');
  };
  const sessions = knownSessions();
  // Optional rules belong to a map: only the selected map's are offered, all off by default.
  const offered = info?.maps.find((m) => m.id === mapId)?.optionalRules ?? [];

  return (
    <div className="page">
      <h1>Task Force <span>Blind Search Tracker</span></h1>
      <p className="muted">Referee for hidden Task Forces in an in-person, two-player game. Fleets, aircraft, combat and everything sighted stay on the paper sheets and the board.</p>
      <section className="card">
        <h2>New game</h2>
        <label>Map
          <select value={mapId} onChange={(e) => { setMapId(e.target.value); setRules([]); }}>
            {(info?.maps ?? [{ id: 'midway', name: 'Midway' }]).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label>Starting turn
          <select value={turn} onChange={(e) => setTurn(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <label>Your side
          <select value={side} onChange={(e) => setSide(e.target.value as Side)}>
            <option value="ijn">IJN</option><option value="allies">Allies</option>
          </select>
        </label>
        {offered.length > 0 && <>
          <h3>Optional scenario rules</h3>
          {offered.map((r) => (
            <label className="check" key={r.id}>
              <input type="checkbox" checked={rules.includes(r.id)}
                onChange={(e) => setRules(e.target.checked ? [...rules, r.id] : rules.filter((x) => x !== r.id))} /> {r.label}
            </label>
          ))}
        </>}
        <details>
          <summary>Options</summary>
          <label className="check"><input type="checkbox" checked={transports} onChange={(e) => setTransports(e.target.checked)} /> Enforce transport movement limits</label>
          <label>When the chit cup is empty
            <select value={cupEmpty} onChange={(e) => setCupEmpty(e.target.value as 'reshuffle')}>
              <option value="reshuffle">Reshuffle all 54 chits</option>
              <option value="noContact">Every further draw is No Contact</option>
            </select>
          </label>
          <label>Search zones per IJN carrier
            <input type="number" min={0} max={9} value={zIjn} onChange={(e) => setZIjn(Number(e.target.value))} />
          </label>
          <label>Search zones per Allied carrier
            <input type="number" min={0} max={9} value={zAllies} onChange={(e) => setZAllies(Number(e.target.value))} />
          </label>
        </details>
        <button className="primary" onClick={create}>Create session</button>
        {error && <p className="error">{error}</p>}
      </section>
      <section className="card">
        <h2>Open a seat link</h2>
        <div className="row">
          <input placeholder="Paste a seat or invite link" value={link} onChange={(e) => setLink(e.target.value)} />
          <button onClick={open}>Open</button>
        </div>
        {sessions.length > 0 && <>
          <h3>Games on this device</h3>
          <div className="row wrap">{sessions.map((s) => <button key={s} onClick={() => go(`/g/${s}`)}>Resume {s}</button>)}</div>
        </>}
      </section>
      <p className="muted small">
        <a href="#/calibrate/midway">Calibrate the map grid</a>
        {info?.lanUrls[0] && <> · Other devices on this Wi-Fi: <b>{info.lanUrls[0]}</b></>}
      </p>
    </div>
  );
}

/** The invite link claims the other seat on first open; reopening it on the same device resumes. */
function Join({ id, invite }: { id: string; invite: string }) {
  const [error, setError] = useState('');
  useEffect(() => {
    if (localStorage.getItem(tokenKey(id))) return go(`/g/${id}`);
    api<ClaimResponse>(`/api/sessions/${id}/claim`, { invite })
      .then((r) => { localStorage.setItem(tokenKey(id), r.seatToken); go(`/g/${id}`); })
      .catch((e) => setError(e.message));
  }, [id, invite]);
  return <div className="page"><h1>Joining…</h1>{error && <><p className="error">{error}</p><a href="#/">Home</a></>}</div>;
}

function SeatLink({ id, token }: { id: string; token: string }) {
  useEffect(() => { localStorage.setItem(tokenKey(id), token); go(`/g/${id}`); }, [id, token]);
  return <div className="page"><h1>Opening seat…</h1></div>;
}

/** Tap three known hex centres; solve x0, y0, dx, dy as fractions of the image. */
function Calibrate({ mapId }: { mapId: string }) {
  const loaded = useMap(mapId);
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const [saved, setSaved] = useState<Calibration | null>(null);
  const [msg, setMsg] = useState('');
  if (!loaded) return <div className="page"><h1>Loading map…</h1></div>;
  const hexes = loaded.def.calibrationHexes;
  const solved = pts.length === 3 ? solveCalibration(hexes, pts) : null;
  const ok = solved && solved.dx > 0 && solved.dy > 0;
  const save = async () => {
    try {
      await api(`/api/maps/${mapId}/calibration`, solved);
      setSaved(solved); setPts([]); setMsg('Saved to the map file.');
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="calibrate">
      <div className="calbar">
        <a href="#/">← Home</a>
        <b>Calibrate {loaded.def.name}</b>
        {!loaded.image && <span className="error">maps/{loaded.def.image} is missing: put the map image there first.</span>}
        {pts.length < 3
          ? <span>Zoom in and tap the centre of hex <b>{hexes[pts.length]}</b> ({pts.length + 1} of 3)</span>
          : ok
            ? <span>Check the overlay against the printed numbers, then save.</span>
            : <span className="error">Those taps do not make a grid. Redo.</span>}
        {pts.length > 0 && <button onClick={() => setPts([])}>Redo</button>}
        {ok && <button className="primary" onClick={save}>Save</button>}
        {msg && <span>{msg}</span>}
      </div>
      <HexMap
        loaded={loaded} numbers points={pts}
        calibration={(ok ? solved : saved) ?? loaded.def.calibration}
        onPoint={(x, y) => { if (pts.length < 3) { setPts([...pts, { x, y }]); setMsg(''); } }}
      />
    </div>
  );
}
