/**
 * Ejecuta `run` de una en una. Si se pide mientras ya hay una en curso, la petición no se pierde:
 * se repite `run` al terminar (todas las peticiones intermedias se funden en una) y después se
 * avisa con `onCoalesced`. Es lo que necesita pdf.js, que no admite dos renders a la vez en un canvas.
 */
export class CoalescingRunner {
  private running = false;
  private requestedWhileBusy = false;

  constructor(
    private readonly run: () => Promise<void>,
    private readonly onCoalesced: () => void = () => undefined,
  ) {}

  get busy(): boolean {
    return this.running;
  }

  /** Resuelve al terminar la ronda; si ya había una en curso, resuelve de inmediato. */
  async request(): Promise<void> {
    if (this.running) {
      this.requestedWhileBusy = true;
      return;
    }

    this.running = true;
    let coalesced = false;
    try {
      do {
        this.requestedWhileBusy = false;
        await this.run();
        coalesced = coalesced || this.requestedWhileBusy;
      } while (this.requestedWhileBusy);
    } finally {
      this.running = false;
    }

    if (coalesced) {
      this.onCoalesced();
    }
  }
}
