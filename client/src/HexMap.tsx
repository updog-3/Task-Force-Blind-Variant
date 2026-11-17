import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { hexCenter, type Calibration } from '../../rules';
import type { LoadedMap } from './net';

export interface Token { hex: string; label: string; cls?: string; ghost?: boolean }
/** A sighting report drawn as an outline around its hexes, with a label. */
export interface MapPin { hexes: string[]; label: string; cls?: string }
export interface MapProps {
  loaded: LoadedMap;
  tokens?: Token[];
  /** hex id -> CSS class for a translucent fill. */
  fills?: Record<string, string>;
  /** Paths drawn through hex centres. */
  lines?: string[][];
  pins?: MapPin[];
  onHex?: (hex: string) => void;
  /** Raw taps as fractions of the image, for calibration. */
  onPoint?: (fx: number, fy: number) => void;
  points?: { x: number; y: number }[];
  numbers?: boolean;
  calibration?: Calibration;
  children?: ReactNode;
}

type VB = { x: number; y: number; w: number; h: number };

export function HexMap(p: MapProps) {
  const { def, map, image } = p.loaded;
  const W = image?.w ?? 2800;
  const H = image?.h ?? Math.round(2800 / def.aspect);
  const cal = p.calibration ?? def.calibration;
  const rx = (cal.dx * W * 2) / 3;
  const ry = (cal.dy * H) / 2;
  const svg = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<VB>({ x: 0, y: 0, w: W, h: H });
  const vbRef = useRef(vb);
  vbRef.current = vb;
  useEffect(() => setVb({ x: 0, y: 0, w: W, h: H }), [W, H]);

  const centers = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const h of map.hexes) out[h] = hexCenter(cal, h, W, H);
    return out;
  }, [map, cal, W, H]);
  const outline = (c: { x: number; y: number }) =>
    `M${c.x - rx},${c.y}L${c.x - rx / 2},${c.y - ry}L${c.x + rx / 2},${c.y - ry}L${c.x + rx},${c.y}L${c.x + rx / 2},${c.y + ry}L${c.x - rx / 2},${c.y + ry}Z`;
  const grid = useMemo(() => map.hexes.map((h) => outline(centers[h])).join(''), [centers, rx, ry]);

  /** Screen point -> map pixel, allowing for the letterboxing of preserveAspectRatio. */
  const toMap = (cx: number, cy: number, v = vbRef.current) => {
    const r = svg.current!.getBoundingClientRect();
    const s = Math.max(v.w / r.width, v.h / r.height);
    return {
      x: v.x + (cx - r.left - (r.width - v.w / s) / 2) * s,
      y: v.y + (cy - r.top - (r.height - v.h / s) / 2) * s,
      s,
    };
  };
  const zoomAt = (cx: number, cy: number, factor: number) => {
    const v = vbRef.current;
    const w = Math.min(W * 1.15, Math.max(W / 14, v.w * factor));
    const f = w / v.w;
    const pt = toMap(cx, cy);
    setVb({ x: pt.x - (pt.x - v.x) * f, y: pt.y - (pt.y - v.y) * f, w, h: v.h * f });
  };

  useEffect(() => {
    const el = svg.current!;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 1 / 1.15); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ moved: false, x: 0, y: 0, pinch: 0 });
  const spread = () => {
    const [a, b] = [...ptrs.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const down = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.current!.setPointerCapture(e.pointerId);
    if (ptrs.current.size === 1) drag.current = { moved: false, x: e.clientX, y: e.clientY, pinch: 0 };
    else if (ptrs.current.size === 2) { drag.current.moved = true; drag.current.pinch = spread().d; }
  };
  const move = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      const sp = spread();
      if (drag.current.pinch > 0 && sp.d > 0) zoomAt(sp.mx, sp.my, drag.current.pinch / sp.d);
      drag.current.pinch = sp.d;
      return;
    }
    if (Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 6) drag.current.moved = true;
    if (!drag.current.moved) return;
    const { s } = toMap(0, 0);
    setVb((v) => ({ ...v, x: v.x - (e.clientX - prev.x) * s, y: v.y - (e.clientY - prev.y) * s }));
  };
  const up = (e: React.PointerEvent) => {
    const had = ptrs.current.delete(e.pointerId);
    if (!had || ptrs.current.size > 0 || drag.current.moved) return;
    const pt = toMap(e.clientX, e.clientY);
    p.onPoint?.(pt.x / W, pt.y / H);
    if (!p.onHex) return;
    let best = '', bestD = Infinity;
    for (const h of map.hexes) {
      const c = centers[h];
      const d = ((pt.x - c.x) / rx) ** 2 + ((pt.y - c.y) / ry) ** 2;
      if (d < bestD) { bestD = d; best = h; }
    }
    if (bestD <= 1.1) p.onHex(best);
  };

  // Stack several Task Forces in one hex into a single token.
  const stacks = useMemo(() => {
    // Carrier and Fleet Task Forces in one hex share a token ("4·10"). Only the two sides,
    // shown together at the end of the game, get separate tokens, drawn one above the other.
    const m = new Map<string, Token & { labels: string[]; slot: number }>();
    const perHex: Record<string, number> = {};
    for (const t of p.tokens ?? []) {
      if (!centers[t.hex]) continue;
      const side = t.cls === 'ijn' || t.cls === 'allies' ? t.cls : '';
      const key = `${t.hex}|${t.ghost ? 'g' : ''}|${side}`;
      if (!m.has(key)) {
        const spot = `${t.hex}|${t.ghost ? 'g' : ''}`;
        perHex[spot] = (perHex[spot] ?? -1) + 1;
        m.set(key, { ...t, labels: [], slot: perHex[spot] });
      }
      const stack = m.get(key)!;
      stack.labels.push(t.label);
      if (t.cls === 'cv') stack.cls = 'cv'; // a stack holding a carrier is drawn as a carrier token
    }
    for (const stack of m.values()) stack.labels.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    return [...m.values()];
  }, [p.tokens, centers]);

  // A pin's outline is the set of hex edges that belong to exactly one of its hexes.
  const pins = useMemo(() => {
    const stacked: Record<string, number> = {};
    return (p.pins ?? []).filter((pin) => pin.hexes.some((h) => centers[h])).map((pin) => {
      const edges = new Map<string, string>();
      for (const h of pin.hexes) {
        const c = centers[h];
        if (!c) continue;
        const v = [[-rx, 0], [-rx / 2, -ry], [rx / 2, -ry], [rx, 0], [rx / 2, ry], [-rx / 2, ry]].map(([dx, dy]) => [c.x + dx, c.y + dy]);
        for (let i = 0; i < 6; i++) {
          const a = v[i], b = v[(i + 1) % 6];
          const key = `${Math.round((a[0] + b[0]) / 2)},${Math.round((a[1] + b[1]) / 2)}`;
          if (edges.has(key)) edges.set(key, ''); else edges.set(key, `M${a[0]},${a[1]}L${b[0]},${b[1]}`);
        }
      }
      const at = centers[pin.hexes.find((h) => centers[h])!];
      const n = stacked[pin.hexes[0]] = (stacked[pin.hexes[0]] ?? -1) + 1; // labels of repeat searches stack downwards
      return { d: [...edges.values()].join(''), x: at.x, y: at.y + ry * (0.62 + n * 0.36), label: pin.label, cls: pin.cls ?? '' };
    });
  }, [p.pins, centers, rx, ry]);

  const fs = ry * 0.42;
  return (
    <div className="map">
      <svg
        ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={(e) => ptrs.current.delete(e.pointerId)}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10z" className="arrowhead" />
          </marker>
        </defs>
        {image
          ? <image href={image.url} x={0} y={0} width={W} height={H} />
          : <rect x={0} y={0} width={W} height={H} className="sea" />}
        <path d={grid} className={image && !p.numbers ? 'grid faint' : 'grid'} />
        {Object.entries(p.fills ?? {}).map(([h, cls]) => centers[h] && <path key={h} d={outline(centers[h])} className={`fill ${cls}`} />)}
        {(p.numbers || !image) && map.hexes.map((h) => (
          <text key={h} x={centers[h].x} y={centers[h].y - ry * 0.55} className={image ? 'hexno over' : 'hexno'} fontSize={ry * 0.28}>{h}</text>
        ))}
        {!image && def.bases.map((b) => centers[b.hex] && (
          <text key={b.id} x={centers[b.hex].x} y={centers[b.hex].y + ry * 0.75} className="basename" fontSize={ry * 0.3}>★ {b.name}</text>
        ))}
        {pins.map((pin, i) => (
          <g key={i} className={`pin ${pin.cls}`}>
            <path d={pin.d} strokeWidth={ry * 0.07} />
            <text x={pin.x} y={pin.y} fontSize={ry * 0.3}>{pin.label}</text>
          </g>
        ))}
        {(p.lines ?? []).map((line, i) => (
          <polyline key={i} className="path" markerEnd="url(#arrow)" strokeWidth={ry * 0.12}
            points={line.filter((h) => centers[h]).map((h) => `${centers[h].x},${centers[h].y}`).join(' ')} />
        ))}
        {stacks.map((t) => {
          const c = centers[t.hex];
          const label = t.labels.length > 3 ? `${t.labels.slice(0, 2).join('·')}+${t.labels.length - 2}` : t.labels.join('·');
          const w = Math.max(rx * 0.95, label.length * fs * 0.68 + fs * 0.5), h = ry * 0.7;
          const y = (t.ghost ? c.y + ry * 0.48 : c.y + ry * 0.05) + (t.slot ? (t.slot - 0.5) * h * 1.05 : 0);
          return (
            <g key={`${t.hex}${t.ghost}${t.slot}`} className={`token ${t.cls ?? ''} ${t.ghost ? 'ghost' : ''}`}>
              <rect x={c.x - w / 2} y={y - h / 2} width={w} height={h} rx={h * 0.22} strokeWidth={ry * 0.05} />
              <text x={c.x} y={y} fontSize={fs} dy="0.36em">{label}</text>
            </g>
          );
        })}
        {(p.points ?? []).map((pt, i) => (
          <circle key={i} cx={pt.x * W} cy={pt.y * H} r={ry * 0.15} className="calpoint" />
        ))}
      </svg>
      <div className="zoom">
        <button onClick={() => { const r = svg.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.4); }}>+</button>
        <button onClick={() => { const r = svg.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.4); }}>−</button>
        <button onClick={() => setVb({ x: 0, y: 0, w: W, h: H })}>⤢</button>
      </div>
      {p.children}
    </div>
  );
}
