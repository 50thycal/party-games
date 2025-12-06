/**
 * Core type definitions for the Party Shell Engine
 */

// Player identity
export type Player = {
  id: string;
  name: string;
  role: "host" | "player";
};

// Room instance
export type Room = {
  roomCode: string;
  gameId: string;
  hostId: string;
  players: Player[];
  createdAt: number;
};

// Base action shape - games extend this
export type BaseAction = {
  type: string;
  playerId: string;
};

// Context provided to game reducers
export type GameContext = {
  now: () => number;
  random: () => number;
  room: Room;
  playerId: string;
};

// Game phase - games define their own phase strings
export type GamePhase = string;

// Props passed to game views
export type ViewProps<S, A extends BaseAction> = {
  state: S;
  dispatch: (action: Omit<A, "playerId">) => void;
  room: Room;
  playerId: string;
  isHost: boolean;
};

// The core game template interface
export interface GameTemplate<S, A extends BaseAction> {
  id: string;
  name: string;
  description?: string;
  minPlayers: number;
  maxPlayers: number;

  // Create initial game state
  initialState(players: Player[]): S;

  // Pure reducer: (state, action, ctx) => newState
  reducer(state: S, action: A, ctx: GameContext): S;

  // Derive current phase from state
  getPhase(state: S): GamePhase;

  // Optional action validation
  isActionAllowed?(state: S, action: A, ctx: GameContext): boolean;

  // React components for rendering
  views: {
    HostView: React.FC<ViewProps<S, A>>;
    PlayerView: React.FC<ViewProps<S, A>>;
  };
}

// Room state stored server-side
export type RoomState = {
  room: Room;
  gameState: unknown;
};

// API response types
export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiError = {
  ok: false;
  errorCode: string;
  message: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Player identity stored in localStorage
export type StoredIdentity = {
  playerId: string;
  name: string;
};
