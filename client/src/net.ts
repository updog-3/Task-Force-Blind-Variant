import { useCallback, useEffect, useRef, useState } from 'react';
import { GameMap, type Action, type MapDef, type SeatView, type Side } from '../../rules';
import type { ServerMsg } from '../../server/protocol';

export const tokenKey = (id: string) => `tfb:${id}`;
export const inviteKey = (id: string) => `tfb:${id}:invite`;

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Sessions this browser holds a seat for. */
export function knownSessions(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (/^tfb:[^:]+$/.test(k)) out.push(k.slice(4));
  }
  return out;
}

type Pending = { resolve: (m: Extract<ServerMsg, { t: 'ok' }>) => void; reject: (e: Error) => void };

/** One seat's live connection: the latest view, and a way to send actions. */
export function useSeat(id: string) {
  const [view, setView] = useState<SeatView | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const conn = useRef<{ ws?: WebSocket; next: number; pending: Map<number, Pending> }>({ next: 1, pending: new Map() });

  useEffect(() => {
    let closed = false, dead = false;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      const token = localStorage.getItem(tokenKey(id));
      if (!token) {
        setFatal('This device holds no seat for this game. Open your seat link or invite link.');
        return;
      }
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      conn.current.ws = ws;
      ws.onopen = () => {
        setOnline(true);
        ws.send(JSON.stringify({ t: 'hello', session: id, token }));
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data) as ServerMsg;
        if (m.t === 'view') setView(m.view);
        else if (m.t === 'ok') { conn.current.pending.get(m.id)?.resolve(m); conn.current.pending.delete(m.id); }
        else {
          if (m.fatal) { dead = true; setFatal(m.message); }
          if (m.id !== undefined) { conn.current.pending.get(m.id)?.reject(new Error(m.message)); conn.current.pending.delete(m.id); }
          else if (!m.fatal) setToast(m.message);
        }
      };
      ws.onclose = () => {
        setOnline(false);
        for (const p of conn.current.pending.values()) p.reject(new Error('Connection lost. Try again.'));
        conn.current.pending.clear();
        if (!closed && !dead) timer = setTimeout(connect, 1000);
      };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); conn.current.ws?.close(); };
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const request = useCallback((msg: object) => new Promise<Extract<ServerMsg, { t: 'ok' }>>((resolve, reject) => {
    const c = conn.current;
    if (!c.ws || c.ws.readyState !== WebSocket.OPEN) return reject(new Error('Not connected. Reconnecting…'));
    const reqId = c.next++;
    c.pending.set(reqId, { resolve, reject });
    c.ws.send(JSON.stringify({ ...msg, id: reqId }));
  }), []);

  /** Send an action. Rule errors appear as a toast; resolves to whether it was accepted. */
  const send = useCallback(async (action: Action): Promise<boolean> => {
    try { await request({ t: 'action', action }); setToast(null); return true; }
    catch (e) { setToast((e as Error).message); return false; }
  }, [request]);

  const reissue = useCallback(async (seat: Side, mine: boolean): Promise<string | null> => {
    try {
      const r = await request({ t: 'reissue', seat });
      if (mine && r.reissued) localStorage.setItem(tokenKey(id), r.reissued.token);
      return r.reissued?.token ?? null;
    } catch (e) { setToast((e as Error).message); return null; }
  }, [request, id]);

  return { view, fatal, toast, online, send, reissue, setToast };
}

export type Send = (action: Action) => Promise<boolean>;

export interface LoadedMap {
  def: MapDef;
  map: GameMap;
  /** null when the (git-ignored) map art is not present: a plain grid is drawn instead. */
  image: { url: string; w: number; h: number } | null;
}

/** Load map data and art from the server's maps/ folder. */
export function useMap(mapId: string | undefined): LoadedMap | null {
  const [loaded, setLoaded] = useState<LoadedMap | null>(null);
  useEffect(() => {
    if (!mapId) return;
    let live = true;
    setLoaded(null);
    api<MapDef>(`/maps/${mapId}.json`).then((def) => {
      const map = new GameMap(def);
      const url = `/maps/${def.image}`;
      const img = new Image();
      img.onload = () => live && setLoaded({ def, map, image: { url, w: img.naturalWidth, h: img.naturalHeight } });
      img.onerror = () => live && setLoaded({ def, map, image: null });
      img.src = url;
    }).catch(() => undefined);
    return () => { live = false; };
  }, [mapId]);
  return loaded;
}

/** Links must work from the other player's device, so prefer the LAN address over localhost. */
export function useBaseUrl(): string {
  const [base, setBase] = useState(location.origin);
  useEffect(() => {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return;
    api<{ lanUrls: string[] }>('/api/info').then((i) => {
      if (i.lanUrls[0]) setBase(location.port === '5173' ? i.lanUrls[0].replace(/:\d+$/, ':5173') : i.lanUrls[0]);
    }).catch(() => undefined);
  }, []);
  return base;
}
