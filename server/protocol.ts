import type { Action, SeatView, Side } from '../rules';

/** Client -> server, over the WebSocket. The first message must be hello. */
export type ClientMsg =
  | { t: 'hello'; session: string; token: string }
  | { t: 'action'; id: number; action: Action }
  | { t: 'reissue'; id: number; seat: Side };

/** Server -> client. A view is pushed after every accepted action. */
export type ServerMsg =
  | { t: 'view'; view: SeatView }
  | { t: 'ok'; id: number; reissued?: { seat: Side; token: string } }
  | { t: 'error'; id?: number; message: string; fatal?: boolean };

export interface CreateRequest {
  mapId: string;
  startingTurn: number;
  side: Side;
  /** Ids from the chosen map's optionalRules. All off by default. */
  optionalRules?: string[];
  flags?: {
    enforceTransports?: boolean;
    cupEmpty?: 'reshuffle' | 'noContact';
    defaultZones?: { ijn?: number; allies?: number };
  };
}
export interface CreateResponse { id: string; side: Side; seatToken: string; inviteToken: string }
export interface ClaimResponse { side: Side; seatToken: string }
export interface InfoResponse {
  lanUrls: string[];
  maps: { id: string; name: string; optionalRules: { id: string; label: string }[] }[];
}
