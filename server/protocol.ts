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
  scenarioId: string;
  /** Only for scenarios that offer a choice of map. */
  mapId?: string;
  startingTurn?: number;
  side: Side;
  /** Ids from the scenario's optionalRules. Leave out to take the scenario's defaults. */
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
  maps: { id: string; name: string }[];
  scenarios: {
    id: string;
    label: string;
    startingTurn: number;
    defaultZones: { ijn: number; allies: number };
    variants: { mapId: string; mapName: string; label?: string; bases: string[]; notes: { text: string; turns?: number[] }[] }[];
    optionalRules: { id: string; label: string; default: boolean }[];
  }[];
}
