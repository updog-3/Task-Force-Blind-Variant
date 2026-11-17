import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  arrange, describeOp, EXIT, hiddenTfs, isCarrierNumber, moveAllowance, numberFree, onBoard, other,
  SIDE_NAME, sourceCapacity, sourceHex, sourceKey, trueType, ZONE_RANGE,
  type ArrangeOp, type RevealReason, type SearchSource, type SeatView, type TaskForce, type ZoneDraft,
} from '../../rules';
import { HexMap, type MapPin, type Token } from './HexMap';
import type { LoadedMap, Send } from './net';

export interface Ctx {
  view: SeatView;
  send: Send;
  loaded: LoadedMap;
  /** Own Task Forces by number. */
  rec: Record<number, TaskForce>;
  /** Your own sighting pins, already filtered by the pins toggle. */
  pins: MapPin[];
}

const Shell = ({ map, children }: { map: ReactNode; children: ReactNode }) => (
  <div className="body">{map}<aside className="panel">{children}</aside></div>
);

export const typeTag = (rec: Record<number, TaskForce>, t: TaskForce) =>
  trueType(rec, t) === 'carrier' ? <span className="tag cv">Carrier</span> : <span className="tag">Fleet</span>;

const tokensOf = (rec: Record<number, TaskForce>): Token[] =>
  hiddenTfs(rec).map((t) => ({ hex: t.hex!, label: String(t.number), cls: trueType(rec, t) === 'carrier' ? 'cv' : '' }));

export function HexInput({ value, onCommit, placeholder }: { value?: string; onCommit: (hex: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  return (
    <input
      className="hex" inputMode="numeric" maxLength={4} placeholder={placeholder ?? 'hex'} value={text}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '');
        setText(v);
        if (v.length === 4 && v !== value) onCommit(v);
      }}
    />
  );
}

/** The state's confirm button. Unacknowledged notices block it. */
function ConfirmBar({ ctx, label, hint }: { ctx: Ctx; label: string; hint?: string }) {
  const { view, send } = ctx;
  const blocked = view.notices.length > 0;
  return (
    <div className="footer">
      {view.confirmed.you
        ? <>
          <p className="good">✓ {label}. Waiting for your opponent…</p>
          <button onClick={() => send({ type: 'confirm', value: false })}>Undo</button>
        </>
        : <>
          {hint && <p className="muted small">{hint}</p>}
          {blocked && <p className="muted small">Acknowledge your notices first.</p>}
          <button className="primary" disabled={blocked} onClick={() => send({ type: 'confirm', value: true })}>{label}</button>
        </>}
      {view.confirmed.opponent && !view.confirmed.you && <p className="muted small">Your opponent is ready.</p>}
    </div>
  );
}

const REASONS: [RevealReason, string][] = [
  ['contact', 'Contact: adjacent to an enemy marker'],
  ['blocked', 'Blocked: an enemy marker tried to enter its hex'],
  ['raided', 'Raided: exposed by an enemy raid, in or next to the target hex'],
  ['launched', 'Launched raid: this Task Force is launching a raid'],
  ['voluntary', 'Voluntary'],
];

function Reveal({ ctx, number }: { ctx: Ctx; number: number }) {
  const [reason, setReason] = useState<RevealReason>('contact');
  return (
    <div className="row">
      <select className="small grow" value={reason} onChange={(e) => setReason(e.target.value as RevealReason)}>
        {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button className="small danger" onClick={() => {
        if (confirm(`Reveal TF ${number} to your opponent?`)) ctx.send({ type: 'reveal', number, reason });
      }}>Reveal TF {number}</button>
    </div>
  );
}

/** Your hidden Task Forces, each with a manual reveal. */
function HiddenList({ ctx, onPick }: { ctx: Ctx; onPick?: (hex: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const hidden = hiddenTfs(ctx.rec);
  return (
    <>
      <h3>Your hidden Task Forces</h3>
      {hidden.length === 0 && <p className="muted">None.</p>}
      <ul className="list">
        {hidden.map((t) => (
          <li key={t.number}>
            <b>TF {t.number}</b>{typeTag(ctx.rec, t)}<span onClick={() => onPick?.(t.hex!)}>at {t.hex}</span>
            {t.combinedWith.length > 0 && <span className="muted small">with TF {t.combinedWith.join(', ')}</span>}
            <span className="grow" />
            <button className="small" onClick={() => setOpen(open === t.number ? null : t.number)}>Reveal…</button>
            {open === t.number && <div style={{ width: '100%' }}><Reveal ctx={ctx} number={t.number} /></div>}
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- Waiting

export function Waiting({ ctx, inviteLink }: { ctx: Ctx; inviteLink: string | null }) {
  return (
    <Shell map={<HexMap loaded={ctx.loaded} pins={ctx.pins} />}>
      <h2>Waiting for the other player</h2>
      {inviteLink ? <>
        <p>Send this invite link to the {SIDE_NAME[other(ctx.view.you)]} player. It claims their seat the first time it is opened.</p>
        <code className="link">{inviteLink}</code>
        <button onClick={() => navigator.clipboard?.writeText(inviteLink)}>Copy link</button>
      </> : <p>The invite link was created on another device.</p>}
      <p className="muted">Meanwhile, set up your paper fleet and aircraft sheets.</p>
    </Shell>
  );
}

// ---------------------------------------------------------------- Setup

export function Setup({ ctx }: { ctx: Ctx }) {
  const { view, send, rec, loaded } = ctx;
  const [num, setNum] = useState<number | null>(1);
  const done = view.confirmed.you;
  const tf = num ? rec[num] : undefined;
  const bases = view.bases.filter((b) => b.side === view.you);
  return (
    <Shell map={
      <HexMap
        loaded={loaded} pins={ctx.pins} tokens={tokensOf(rec)} fills={tf?.hex ? { [tf.hex]: 'sel' } : {}}
        onHex={(hex) => { if (num && !done) send({ type: 'placeTf', number: num, hex }); }}
      />
    }>
      <h2>Setup</h2>
      <p className="muted small">Pick a Task Force number, then tap its hex. Follow the scenario book for start lines and zones: the app only checks that the hex exists. TF 1–6 are Carrier Task Forces, TF 7–13 are Fleet Task Forces.</p>
      <div className="numgrid">
        {Array.from({ length: 13 }, (_, i) => i + 1).map((n) => (
          <button key={n} disabled={done} className={`${num === n ? 'on' : ''} ${isCarrierNumber(n) ? 'cvnum' : ''}`} onClick={() => setNum(n)}>
            {n}<small>{rec[n]?.hex ?? '—'}</small>
          </button>
        ))}
      </div>
      {num && <div className="box">
        <b>TF {num}</b> {isCarrierNumber(num) ? <span className="tag cv">Carrier</span> : <span className="tag">Fleet</span>}
        {!tf && <p className="muted">Not placed. Tap a hex on the map.</p>}
        {tf && <>
          <p>At hex {tf.hex}. Tap another hex to move it.</p>
          {isCarrierNumber(num) && <label>Search zones
            <input type="number" min={0} max={12} disabled={done} value={tf.zoneCount}
              onChange={(e) => send({ type: 'editTf', number: num, zoneCount: Number(e.target.value) })} />
          </label>}
          {view.flags.enforceTransports && <label className="check">
            <input type="checkbox" disabled={done} checked={tf.hasTransports}
              onChange={(e) => send({ type: 'editTf', number: num, hasTransports: e.target.checked })} /> Has transports
          </label>}
          <button className="small danger" disabled={done} onClick={() => send({ type: 'removeTf', number: num })}>Remove TF {num}</button>
        </>}
      </div>}
      {bases.length > 0 && <>
        <h3>Your land bases</h3>
        {bases.map((b) => (
          <label key={b.id}>{b.name} ({b.hex}) search zones
            <input type="number" min={0} max={12} value={b.zoneCount ?? 0}
              onChange={(e) => send({ type: 'editBase', baseId: b.id, zoneCount: Number(e.target.value) })} />
          </label>
        ))}
        <p className="muted small">Midway does no regular reconnaissance (scenario 6.5.2), so its count starts at 0.</p>
      </>}
      <ConfirmBar ctx={ctx} label="Setup complete" />
    </Shell>
  );
}

// ---------------------------------------------------------------- Naval Movement

export function Movement({ ctx }: { ctx: Ctx }) {
  const { view, send, rec, loaded } = ctx;
  const { map } = loaded;
  const info = view.turnInfo;
  const order = view.moveOrder;
  const draft = view.stage === 'draft';
  const editable = draft && !view.locked.you;
  const [selHex, setSelHex] = useState<string | null>(null);
  const [selTf, setSelTf] = useState<number | null>(null);
  const [splitTo, setSplitTo] = useState(0);
  const [merge, setMerge] = useState<{ other: number; keep: number; mode: 'absorb' | 'combine' }>({ other: 0, keep: 0, mode: 'absorb' });

  const arranged = useMemo(() => {
    if (!draft) return rec;
    try { return arrange(rec, view.you, order.ops, info, view.flags); } catch { return rec; }
  }, [rec, order, draft]);
  const hidden = hiddenTfs(arranged);
  const tf = selTf !== null && arranged[selTf]?.status === 'hidden' ? arranged[selTf] : undefined;
  const pathOf = (n: number) => (draft ? order.moves[n] ?? [] : []);
  const endOf = (t: TaskForce) => pathOf(t.number).filter((s) => s !== EXIT).at(-1) ?? t.hex!;
  const allow = tf ? moveAllowance(arranged, tf, info, view.flags) : 0;
  const path = tf ? pathOf(tf.number) : [];
  const canStep = !!tf && editable && !path.includes(EXIT) && path.length < allow;
  const steps = canStep ? map.neighbors(endOf(tf!)) : [];

  const setPath = (n: number, p: string[]) => {
    const moves = { ...order.moves };
    if (p.length) moves[n] = p; else delete moves[n];
    return send({ type: 'setMoveOrder', ops: order.ops, moves });
  };
  const setOps = (ops: ArrangeOp[]) => {
    let after = rec;
    try { after = arrange(rec, view.you, ops, info, view.flags); } catch { /* the server will explain */ }
    // Drop paths of Task Forces that no longer exist after the change.
    const moves = Object.fromEntries(Object.entries(order.moves).filter(([n]) => after[Number(n)]?.status === 'hidden'));
    return send({ type: 'setMoveOrder', ops, moves });
  };
  const select = (n: number | null) => {
    setSelTf(n);
    setSplitTo(0);
    setMerge({ other: 0, keep: n ?? 0, mode: 'absorb' });
    if (n !== null && arranged[n]?.hex) setSelHex(arranged[n].hex!);
  };
  const onHex = (hex: string) => {
    if (canStep && steps.includes(hex)) { setPath(tf!.number, [...path, hex]); return; }
    setSelHex(hex);
    const here = hidden.filter((t) => t.hex === hex);
    select(here.length === 1 ? here[0].number : null);
    setSelHex(hex);
  };

  const fills: Record<string, string> = {};
  for (const s of steps) fills[s] = 'step';
  if (selHex) fills[selHex] = 'sel';
  const tokens = tokensOf(arranged);
  const lines: string[][] = [];
  for (const t of hidden) {
    const p = pathOf(t.number);
    if (!p.length) continue;
    lines.push([t.hex!, ...p.filter((s) => s !== EXIT)]);
    tokens.push({ hex: endOf(t), label: p.includes(EXIT) ? `${t.number}⇥` : String(t.number), ghost: true });
  }

  const here = selHex ? hidden.filter((t) => t.hex === selHex) : [];
  const freeNumbers = tf ? [...tf.combinedWith, ...[7, 8, 9, 10, 11, 12, 13].filter((n) => numberFree(arranged, n))] : [];
  const mates = tf ? hidden.filter((t) => t.hex === tf.hex && t.number !== tf.number) : [];

  return (
    <Shell map={<HexMap loaded={loaded} pins={ctx.pins} tokens={tokens} fills={fills} lines={lines} onHex={onHex} />}>
      <h2>Naval Movement</h2>
      {draft && <>
        <p className="muted small">
          First move your on-board markers on the physical board ({SIDE_NAME[info.initiative]} player first). Then draft hidden moves here: up to {info.move} hex{info.move > 1 ? 'es' : ''} this turn. Do not move into a hex holding an enemy marker.
        </p>
        <h3>Your hidden Task Forces</h3>
        <ul className="list">
          {hidden.map((t) => (
            <li key={t.number} className={selTf === t.number ? 'selrow' : ''} onClick={() => select(t.number)}>
              <b>TF {t.number}</b>{typeTag(arranged, t)}
              <span>{[t.hex, ...pathOf(t.number).map((s) => (s === EXIT ? 'off map' : s))].join(' → ')}</span>
              {t.combinedWith.length > 0 && <span className="muted small">with TF {t.combinedWith.join(', ')}</span>}
            </li>
          ))}
          {hidden.length === 0 && <li className="muted">None: everything is on the board or gone.</li>}
        </ul>
        {selHex && !tf && <p className="muted small">Hex {selHex}: {here.length ? `pick ${here.map((t) => `TF ${t.number}`).join(' or ')} above` : 'none of your hidden Task Forces here'}.</p>}
        {tf && <div className="box">
          <b>TF {tf.number}</b> at {tf.hex} · may move {allow} hex{allow === 1 ? '' : 'es'}
          {editable && <>
            <p className="muted small">{canStep ? 'Tap a green hex to add a step.' : path.length ? 'Move complete.' : allow === 0 ? 'Cannot move this turn.' : ''}</p>
            <div className="row">
              <button className="small" disabled={!path.length} onClick={() => setPath(tf.number, [])}>Clear path</button>
              <button className="small" disabled={!canStep || !map.isEdge(endOf(tf))} onClick={() => setPath(tf.number, [...path, EXIT])}>Leave the map</button>
            </div>
            <div className="row">
              <select className="small" value={splitTo} disabled={!info.splits} onChange={(e) => setSplitTo(Number(e.target.value))}>
                <option value={0}>{info.splits ? 'Split off as…' : 'Splits: night turns only'}</option>
                {freeNumbers.map((n) => <option key={n} value={n}>TF {n}{tf.combinedWith.includes(n) ? ' (split back)' : ''}</option>)}
              </select>
              <button className="small" disabled={!splitTo} onClick={() => { setOps([...order.ops, { type: 'split', from: tf.number, to: splitTo }]); setSplitTo(0); }}>Split</button>
            </div>
            {mates.length > 0 && <div className="row">
              <select className="small" value={merge.other} onChange={(e) => setMerge({ ...merge, other: Number(e.target.value) })}>
                <option value={0}>Merge with…</option>
                {mates.map((m) => <option key={m.number} value={m.number}>TF {m.number}</option>)}
              </select>
              {merge.other > 0 && <>
                <select className="small" value={merge.keep} onChange={(e) => setMerge({ ...merge, keep: Number(e.target.value) })}>
                  <option value={tf.number}>keep TF {tf.number}</option>
                  <option value={merge.other}>keep TF {merge.other}</option>
                </select>
                <select className="small" value={merge.mode} onChange={(e) => setMerge({ ...merge, mode: e.target.value as 'absorb' })}>
                  <option value="absorb">absorb the other</option>
                  <option value="combine">keep both formations</option>
                </select>
                <button className="small" onClick={() => {
                  const keep = merge.keep === merge.other ? merge.other : tf.number;
                  const gone = keep === tf.number ? merge.other : tf.number;
                  setOps([...order.ops, { type: 'merge', keep, other: gone, mode: merge.mode }]).then((ok) => ok && select(keep));
                }}>Merge</button>
              </>}
            </div>}
          </>}
          {rec[tf.number]?.status === 'hidden' && <Reveal ctx={ctx} number={tf.number} />}
        </div>}
        {order.ops.length > 0 && <div className="box">
          <b>{view.locked.you ? 'Update your paper fleet sheet' : 'Splits and merges this turn'}</b>
          <ul className="list">{order.ops.map((op, i) => <li key={i}>☐ {describeOp(op)}</li>)}</ul>
          {editable && <button className="small" onClick={() => setOps(order.ops.slice(0, -1))}>Undo last change</button>}
        </div>}
        <div className="footer">
          {view.locked.you
            ? <><p className="good">✓ Moves locked. Waiting for your opponent…</p><button onClick={() => send({ type: 'lock', value: false })}>Unlock</button></>
            : <button className="primary" onClick={() => send({ type: 'lock', value: true })}>Lock moves</button>}
          {view.locked.opponent && !view.locked.you && <p className="muted small">Your opponent has locked.</p>}
        </div>
      </>}
      {!draft && <>
        <p>Movement is resolved. Place any contact markers on the board and acknowledge the notices.</p>
        <div className="box">
          <b>Check the board</b>
          <p className="small">Compare your hidden Task Forces with the enemy markers on the board. If one of yours is adjacent to an enemy marker, or an enemy marker tried to enter its hex, reveal it now.</p>
        </div>
        <HiddenList ctx={ctx} onPick={setSelHex} />
        <ConfirmBar ctx={ctx} label="Movement complete" />
      </>}
    </Shell>
  );
}

// ---------------------------------------------------------------- Board phases

export function Board({ ctx }: { ctx: Ctx }) {
  const { view, send, rec, loaded } = ctx;
  const [hex, setHex] = useState('');
  const check = view.raidCheck;
  const here = hiddenTfs(rec).filter((t) => t.hex === hex);
  const fills: Record<string, string> = {};
  if (check) {
    fills[check.hex] = 'raid';
    for (const g of check.groups) fills[g.hex] = g.hex === check.hex ? 'raid' : 'found';
  }
  if (loaded.map.has(hex)) fills[hex] ??= 'sel';
  const found = check ? check.groups.flatMap((g) => g.numbers) : [];
  return (
    <Shell map={<HexMap loaded={loaded} pins={ctx.pins} tokens={tokensOf(rec)} fills={fills} onHex={setHex} />}>
      <h2>Board phases</h2>
      <p>Play Naval Combat and Aircraft Operations on the physical board. The app is standing by.</p>
      {view.searches.map((r) => (
        <div className="box" key={r.id}>
          <b>{r.label}</b>
          <p className="small">One chit is drawn for each enemy hidden Task Force within {r.radius} hexes of {r.center}. A hit reports "Fleet sighted" with its hex. Once per turn; you may skip it. Your opponent is told the search was run.</p>
          <button onClick={() => { if (confirm(`Run the ${r.label} now?`)) send({ type: 'optionalSearch', ruleId: r.id }); }}>
            {r.id === 'midwayPby' ? 'Run PBY search' : 'Run search'}
          </button>
        </div>
      ))}
      <h3>Raid check</h3>
      <p className="muted small">When your opponent raids a hex, tap it (or type it) and run a raid check. The lookup is private: nothing is sent to your opponent unless you reveal.</p>
      <div className="row wrap">
        <HexInput value={hex} onCommit={setHex} placeholder="hex" />
        <button disabled={!loaded.map.has(hex)} onClick={() => send({ type: 'raidCheck', hex })}>Raid check{loaded.map.has(hex) ? ` ${hex}` : ''}</button>
        {loaded.map.has(hex) && <span className="muted small">{here.length ? `Yours here: ${here.map((t) => `TF ${t.number}`).join(', ')}` : 'None of yours here'}</span>}
      </div>
      {check && <div className="box">
        <b>Raid on {check.hex}</b>
        {found.length === 0 && <p>Nothing in or next to this hex. The raid misses.</p>}
        {found.length > 0 && <>
          <p className="small">{check.adjacent ? 'The hex is empty. Hidden Task Forces in adjacent hexes:' : 'Hidden Task Forces in the hex:'}</p>
          <ul className="list">
            {check.groups.map((g) => <li key={g.hex}><b>{g.hex}</b><span>{g.numbers.map((n) => `TF ${n}`).join(', ')}</span></li>)}
          </ul>
          <button className="danger" onClick={() => {
            if (confirm(`Reveal ${found.map((n) => `TF ${n}`).join(', ')} to your opponent as Raided?`)) send({ type: 'raidReveal' });
          }}>Reveal all</button>
        </>}
      </div>}
      <details className="box" open>
        <summary><b>Raid rules (blind game, scenario book 12.4.2)</b></summary>
        <ol className="rules">
          <li>Roll for raid order as in the rulebook.</li>
          <li>The attacker places aircraft on <i>any</i> hex in range, sighted or not.</li>
          <li>Launching reveals the launching Task Force: reveal it here with the reason "Launched raid" and place it on the board, where range is checked.</li>
          <li>The defender reveals every hidden Task Force in the target hex, and the raid resolves against that hex.</li>
          <li>If the target hex is empty, the defender reveals every hidden Task Force in the six adjacent hexes. The attacker picks one of those hexes to attack.</li>
          <li>If nothing is in or next to the hex, the raid misses. The aircraft are spent and go to Landing.</li>
        </ol>
      </details>
      <div className="box">
        <b>Check contacts</b>
        <p className="small">If a hidden Task Force of yours is adjacent to an enemy marker or blocks one, reveal it. Use <i>On board</i> (top bar) to record markers that sink, merge, split or leave.</p>
      </div>
      <HiddenList ctx={ctx} onPick={setHex} />
      <ConfirmBar ctx={ctx} label={view.turnInfo.recon ? 'Go to Reconnaissance' : 'End turn'}
        hint={view.turnInfo.recon ? undefined : view.turnInfo.dusk ? 'No reconnaissance this turn. The dusk reset follows.' : 'No reconnaissance this turn.'} />
    </Shell>
  );
}

// ---------------------------------------------------------------- Reconnaissance

export function Recon({ ctx }: { ctx: Ctx }) {
  const { view, send, rec, loaded } = ctx;
  const { map } = loaded;
  const zones = view.searchOrder;
  const editable = view.stage === 'draft' && !view.locked.you;
  const [sel, setSel] = useState<string | null>(null);
  const [boardHex, setBoardHex] = useState<Record<string, string>>({});

  const mini = { tfs: { [view.you]: rec }, bases: view.bases, sources: { [view.you]: view.sources } } as never;
  const sources = useMemo(() => {
    const all: SearchSource[] = [
      ...view.sources.map((number) => ({ kind: 'tf' as const, number })),
      ...view.bases.filter((b) => b.side === view.you).map((b) => ({ kind: 'base' as const, id: b.id })),
    ];
    return all.map((src) => ({
      src, key: sourceKey(src),
      label: src.kind === 'tf' ? `TF ${src.number}` : view.bases.find((b) => b.id === src.id)!.name,
      cap: sourceCapacity(mini, view.you, src),
      hex: sourceHex(mini, view.you, src),
    })).filter((s) => s.cap > 0);
  }, [view]);
  const used = (key: string) => zones.filter((z) => sourceKey(z.source) === key).length;
  const cur = sources.find((s) => s.key === sel);
  const from = cur ? cur.hex ?? boardHex[cur.key] : undefined;
  const drafts = (): ZoneDraft[] => zones.map(({ source, sourceHex: sh, center }) => ({ source, sourceHex: sh, center }));
  const setZones = (z: ZoneDraft[]) => send({ type: 'setSearchOrder', zones: z });

  const fills: Record<string, string> = {};
  if (editable && cur && from && map.has(from)) {
    for (const h of map.within(from, ZONE_RANGE)) fills[h] = 'range';
  }
  if (view.stage === 'draft') for (const z of zones) for (const h of map.zone(z.center)) fills[h] = 'zone';
  if (editable && from && map.has(from)) fills[from] ??= 'src';
  const onHex = (hex: string) => {
    if (!editable || !cur) return;
    if (used(cur.key) >= cur.cap) return;
    setZones([...drafts(), { source: cur.src, sourceHex: from, center: hex }]);
  };

  return (
    <Shell map={<HexMap loaded={loaded} pins={ctx.pins} tokens={tokensOf(rec)} fills={fills} onHex={onHex} />}>
      <h2>Reconnaissance</h2>
      {view.stage === 'draft' && <>
        <p className="muted small">Pick a source, then tap a zone centre within {ZONE_RANGE} hexes of it. A zone is the centre plus its six neighbours. Placing fewer zones, or none, is allowed. Each zone draws one chit and reports only how many Carrier and Fleet Task Forces it holds.</p>
        <h3>Sources</h3>
        <ul className="list">
          {sources.map((s) => (
            <li key={s.key} className={sel === s.key ? 'selrow' : ''} onClick={() => setSel(s.key)}>
              <b>{s.label}</b>
              <span>{used(s.key)} of {s.cap} zones</span>
              {s.hex
                ? <span className="muted small">at {s.hex}</span>
                : <span className="row" onClick={(e) => e.stopPropagation()}>
                  <span className="muted small">on board at</span>
                  <HexInput value={boardHex[s.key]} onCommit={(h) => { setBoardHex({ ...boardHex, [s.key]: h }); setSel(s.key); }} />
                </span>}
            </li>
          ))}
          {sources.length === 0 && <li className="muted">No search sources this turn.</li>}
        </ul>
        {cur && !from && <p className="error small">Enter the current board hex of {cur.label}: your opponent can already see it.</p>}
        <h3>Zones</h3>
        <ul className="list">
          {zones.map((z, i) => (
            <li key={z.id}>
              <b>{z.center}</b>
              <span className="muted small">from {z.source.kind === 'tf' ? `TF ${z.source.number}` : z.source.id}</span>
              <span className="grow" />
              {editable && <button className="small" onClick={() => setZones(drafts().filter((_, j) => j !== i))}>✕</button>}
            </li>
          ))}
          {zones.length === 0 && <li className="muted">No zones placed.</li>}
        </ul>
        <div className="footer">
          {view.locked.you
            ? <><p className="good">✓ Zones locked. Waiting for your opponent…</p><button onClick={() => send({ type: 'lock', value: false })}>Unlock</button></>
            : <button className="primary" onClick={() => send({ type: 'lock', value: true })}>Lock zones</button>}
          {view.locked.opponent && !view.locked.you && <p className="muted small">Your opponent has locked.</p>}
        </div>
      </>}
      {view.stage === 'resolved' && <>
        <p>Searches are resolved. Sightings are one-time reports: nothing goes on the board, and every Task Force stays hidden. Your reports are pinned on your map.</p>
        <HiddenList ctx={ctx} />
        <ConfirmBar ctx={ctx} label="End turn" hint={view.turnInfo.dusk ? 'The dusk reset follows.' : undefined} />
      </>}
    </Shell>
  );
}

// ---------------------------------------------------------------- Dusk reset

export function Dusk({ ctx }: { ctx: Ctx }) {
  const { view, send, rec, loaded } = ctx;
  const mine = view.tfs.filter(onBoard);
  const [sel, setSel] = useState<number | null>(mine[0]?.number ?? null);
  const done = view.confirmed.you;
  const entry = (n: number) => view.dusk[n] ?? {};
  const set = (n: number, patch: object) => send({ type: 'setDusk', number: n, entry: { ...entry(n), ...patch } });
  const tokens: Token[] = [
    ...tokensOf(rec),
    ...mine.filter((t) => entry(t.number).hex && !entry(t.number).gone).map((t) => ({ hex: entry(t.number).hex!, label: String(t.number), ghost: true })),
  ];
  return (
    <Shell map={
      <HexMap loaded={loaded} pins={ctx.pins} tokens={tokens} fills={sel && entry(sel).hex ? { [entry(sel).hex!]: 'sel' } : {}}
        onHex={(hex) => { if (sel && !done) set(sel, { hex }); }} />
    }>
      <h2>Dusk reset</h2>
      <p className="muted small">Every Task Force marker on the board goes back into the app. For each of yours, enter its current hex from the board (type it, or select the row and tap the map), then take the marker off the board when both players are done.</p>
      {mine.length === 0 && <p>You have no markers on the board. Waiting for your opponent…</p>}
      {mine.map((t) => (
        <div key={t.number} className="box" style={sel === t.number ? { borderColor: 'var(--accent)' } : {}} onClick={() => setSel(t.number)}>
          <div className="row">
            <b>TF {t.number}</b><span className="muted small">revealed at {t.lastHex}</span>
          </div>
          <div className="row">
            <span>Hex now</span>
            {done ? <b>{entry(t.number).hex}</b> : <HexInput value={entry(t.number).hex} onCommit={(hex) => set(t.number, { hex })} />}
            <label className="check" style={{ margin: 0 }}>
              <input type="checkbox" disabled={done} checked={!!entry(t.number).gone} onChange={(e) => set(t.number, { gone: e.target.checked })} /> Gone
            </label>
            {isCarrierNumber(t.number) && <label className="check" style={{ margin: 0 }}>
              <input type="checkbox" disabled={done} checked={entry(t.number).carrierPresent ?? t.carrierPresent}
                onChange={(e) => set(t.number, { carrierPresent: e.target.checked })} /> Carrier present
            </label>}
          </div>
        </div>
      ))}
      {mine.length > 0 && <ConfirmBar ctx={ctx} label="Dusk complete" />}
    </Shell>
  );
}

// ---------------------------------------------------------------- End of game

export function LogTable({ view }: { view: SeatView }) {
  return (
    <table className="log">
      <tbody>
        {[...view.log].reverse().map((e) => (
          <tr key={e.seq}>
            <td>{e.day > 1 ? `D${e.day} ` : ''}T{e.turn}</td>
            <td>{e.side ? <span className={`badge ${e.side}`}>{SIDE_NAME[e.side]}</span> : null}</td>
            <td>{e.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Ended({ ctx }: { ctx: Ctx }) {
  const { view, loaded } = ctx;
  const final = view.final!;
  const tokens: Token[] = [];
  for (const side of ['ijn', 'allies'] as const) {
    for (const t of final.tfs[side]) {
      const hex = t.hex ?? (onBoard(t) ? t.lastHex : undefined);
      if (hex) tokens.push({ hex, label: String(t.number), cls: side });
    }
  }
  return (
    <Shell map={<HexMap loaded={loaded} pins={ctx.pins} tokens={tokens} numbers={false} />}>
      <h2>Game over</h2>
      <p className="muted small">Everything is revealed. Check setup, moves and victory conditions against the scenario book. Revealed Task Forces are shown at the hex where they were revealed.</p>
      {(['ijn', 'allies'] as const).map((side) => {
        const rec = Object.fromEntries(final.tfs[side].map((t) => [t.number, t]));
        return (
          <div key={side}>
            <h3><span className={`badge ${side}`}>{SIDE_NAME[side]}</span> Task Forces</h3>
            <table><tbody>
              {final.tfs[side].map((t) => (
                <tr key={t.number}>
                  <td><b>TF {t.number}</b></td>
                  <td>{t.status === 'combined' ? `combined under TF ${t.combinedInto}` : t.status}{t.status === 'revealed' && t.revealReason ? ` (${t.revealReason})` : ''}</td>
                  <td>{t.hex ?? (t.lastHex ? `last ${t.lastHex}` : '—')}</td>
                  <td>{t.status === 'gone' ? '' : trueType(rec, t)}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        );
      })}
      <h3>Full log</h3>
      <LogTable view={view} />
    </Shell>
  );
}
