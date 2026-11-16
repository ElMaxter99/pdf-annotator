import {
  WHEEL_PAGE_LOCK_MS,
  initialWheelPageState,
  wheelEdgeStep,
  type WheelPageState,
} from './wheel-page.utils';

const base = { atTop: false, atBottom: true, hasPrev: true, hasNext: true };

function run(events: { dy: number; t: number }[], extra: Partial<typeof base> = {}) {
  let state: WheelPageState = initialWheelPageState();
  let last = wheelEdgeStep(state, { deltaY: 0, now: 0, ...base, ...extra });
  for (const e of events) {
    last = wheelEdgeStep(state, { deltaY: e.dy, now: e.t, ...base, ...extra });
    state = last.state;
    if (last.change) break;
  }
  return last;
}

describe('wheelEdgeStep', () => {
  it('ignores a continuous trackpad inertia that reaches the edge', () => {
    const events = Array.from({ length: 40 }, (_, i) => ({ dy: 40, t: 1000 + i * 16 }));
    expect(run(events).change).toBe(0);
  });

  it('changes page after touching the edge, a pause and enough wheel', () => {
    const r = run([
      { dy: 100, t: 1000 },
      { dy: 100, t: 1300 },
      { dy: 100, t: 1450 },
      { dy: 100, t: 1600 },
    ]);
    expect(r.change).toBe(1);
  });

  it('does not change when there is no page beyond the edge and reports the limit', () => {
    const r = run(
      [
        { dy: 100, t: 1000 },
        { dy: 100, t: 1300 },
        { dy: 100, t: 1450 },
        { dy: 100, t: 1600 },
        { dy: 100, t: 1750 },
      ],
      { hasNext: false },
    );
    expect(r.change).toBe(0);
    expect(r.limit).toBeTrue();
  });

  it('goes to the previous page at the top', () => {
    const r = run(
      [
        { dy: -100, t: 1000 },
        { dy: -100, t: 1300 },
        { dy: -100, t: 1450 },
        { dy: -100, t: 1600 },
      ],
      { atTop: true, atBottom: false },
    );
    expect(r.change).toBe(-1);
  });

  it('resets when the sheet is not at the edge', () => {
    const r = wheelEdgeStep(initialWheelPageState(), { deltaY: 100, now: 10, ...base, atBottom: false });
    expect(r.progress).toBe(0);
    expect(r.state.dir).toBe(0);
  });

  it('locks right after a change', () => {
    const changed = run([
      { dy: 100, t: 1000 },
      { dy: 100, t: 1300 },
      { dy: 100, t: 1450 },
      { dy: 100, t: 1600 },
    ]);
    const next = wheelEdgeStep(changed.state, { deltaY: 100, now: 1700, ...base });
    expect(next.change).toBe(0);
    expect(changed.state.lockedUntil).toBe(1600 + WHEEL_PAGE_LOCK_MS);
  });
});
