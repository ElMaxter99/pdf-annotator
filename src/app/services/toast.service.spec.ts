import { fakeAsync, tick } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  it('adds toasts with increasing ids and kinds', () => {
    const service = new ToastService();
    const a = service.show('uno', 'info', 0);
    const b = service.error('dos');
    expect(b).toBeGreaterThan(a);
    expect(service.toasts().map((t) => [t.message, t.kind])).toEqual([
      ['uno', 'info'],
      ['dos', 'error'],
    ]);
  });

  it('dismisses a single toast', () => {
    const service = new ToastService();
    const a = service.show('uno', 'info', 0);
    service.show('dos', 'info', 0);
    service.dismiss(a);
    expect(service.toasts().map((t) => t.message)).toEqual(['dos']);
  });

  it('removes toasts automatically after their duration', fakeAsync(() => {
    const service = new ToastService();
    service.show('temporal', 'info', 1000);
    expect(service.toasts().length).toBe(1);
    tick(1000);
    expect(service.toasts().length).toBe(0);
  }));
});
