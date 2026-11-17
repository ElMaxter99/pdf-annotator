import { CoalescingRunner } from './coalescing-runner';

describe('CoalescingRunner', () => {
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  }

  it('ejecuta una vez si nadie más lo pide y no avisa de fusión', async () => {
    let runs = 0;
    let coalesced = 0;
    const runner = new CoalescingRunner(
      async () => {
        runs += 1;
      },
      () => (coalesced += 1),
    );
    await runner.request();
    expect(runs).toBe(1);
    expect(coalesced).toBe(0);
    expect(runner.busy).toBeFalse();
  });

  it('funde varias peticiones durante una ejecución en una sola repetición', async () => {
    const gates = [deferred(), deferred()];
    let runs = 0;
    let coalesced = 0;
    const runner = new CoalescingRunner(
      () => gates[runs++].promise,
      () => (coalesced += 1),
    );

    const first = runner.request();
    expect(runner.busy).toBeTrue();
    await runner.request();
    await runner.request();
    await runner.request();
    expect(runs).toBe(1);

    gates[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(2);
    gates[1].resolve();
    await first;

    expect(runs).toBe(2);
    expect(coalesced).toBe(1);
    expect(runner.busy).toBeFalse();
  });

  it('libera el bloqueo si run falla', async () => {
    const runner = new CoalescingRunner(async () => {
      throw new Error('boom');
    });
    await expectAsync(runner.request()).toBeRejectedWithError('boom');
    expect(runner.busy).toBeFalse();
  });
});
