/** Wheel past the edge of the sheet changes page: pure rules (thresholds against stray jumps). */
export const WHEEL_PAGE_PAUSE_MS = 150;
export const WHEEL_PAGE_WINDOW_MS = 800;
export const WHEEL_PAGE_LOCK_MS = 600;
export const WHEEL_PAGE_DISTANCE = 300;

export interface WheelPageState {
  /** Direction of the edge being pushed (1 = down/next, -1 = up/previous) or 0 when not at an edge. */
  dir: 1 | -1 | 0;
  /** True once the wheel paused after touching the edge (inertia of the trip there is ignored). */
  armed: boolean;
  accum: number;
  lastEvent: number;
  lockedUntil: number;
}

export interface WheelPageStep {
  state: WheelPageState;
  /** 0..1 of the way to changing page. */
  progress: number;
  /** 1 / -1 when the page must change now. */
  change: 1 | -1 | 0;
  /** True while pushing an edge with no page beyond it (first or last page). */
  limit: boolean;
}

export const initialWheelPageState = (): WheelPageState => ({
  dir: 0,
  armed: false,
  accum: 0,
  lastEvent: 0,
  lockedUntil: 0,
});

export function wheelEdgeStep(
  state: WheelPageState,
  input: {
    deltaY: number;
    now: number;
    atTop: boolean;
    atBottom: boolean;
    hasPrev: boolean;
    hasNext: boolean;
  },
): WheelPageStep {
  const { deltaY, now } = input;
  const idle = (next: Partial<WheelPageState> = {}): WheelPageStep => ({
    state: { ...initialWheelPageState(), lockedUntil: state.lockedUntil, lastEvent: now, ...next },
    progress: 0,
    change: 0,
    limit: false,
  });
  if (!deltaY || !Number.isFinite(deltaY)) {
    return { state, progress: 0, change: 0, limit: false };
  }
  if (now < state.lockedUntil) {
    // Inertia after a change keeps extending the lock until it dies out.
    return idle({ lockedUntil: Math.max(state.lockedUntil, now + WHEEL_PAGE_PAUSE_MS) });
  }
  const dir: 1 | -1 = deltaY > 0 ? 1 : -1;
  const atEdge = dir > 0 ? input.atBottom : input.atTop;
  if (!atEdge) {
    return idle();
  }
  const hasTarget = dir > 0 ? input.hasNext : input.hasPrev;
  let { armed, accum } = state;
  if (state.dir !== dir) {
    // First event on this edge: touching it does not count.
    return {
      state: { ...state, dir, armed: false, accum: 0, lastEvent: now },
      progress: 0,
      change: 0,
      limit: false,
    };
  }
  const gap = now - state.lastEvent;
  if (!armed) {
    if (gap >= WHEEL_PAGE_PAUSE_MS) {
      armed = true;
      accum = 0;
    } else {
      return {
        state: { ...state, lastEvent: now },
        progress: 0,
        change: 0,
        limit: false,
      };
    }
  } else if (gap > WHEEL_PAGE_WINDOW_MS) {
    accum = 0;
  }
  accum += Math.abs(deltaY);
  const progress = Math.min(1, accum / WHEEL_PAGE_DISTANCE);
  if (progress >= 1 && hasTarget) {
    return {
      state: { ...initialWheelPageState(), lastEvent: now, lockedUntil: now + WHEEL_PAGE_LOCK_MS },
      progress: 1,
      change: dir,
      limit: false,
    };
  }
  return {
    state: { dir, armed, accum, lastEvent: now, lockedUntil: state.lockedUntil },
    progress: hasTarget ? progress : 0,
    change: 0,
    limit: !hasTarget,
  };
}
