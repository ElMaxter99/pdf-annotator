import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { PendingFileService } from '../services/pending-file.service';
import { workspaceGuard } from './workspace.guard';

describe('workspaceGuard', () => {
  let pending: PendingFileService;
  let router: Router;

  const run = () =>
    TestBed.runInInjectionContext(() => workspaceGuard({} as never, {} as never));

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    pending = TestBed.inject(PendingFileService);
    router = TestBed.inject(Router);
  });

  it('redirects to the landing page when there is no PDF to open', () => {
    const result = run() as UrlTree;
    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result)).toBe('/landing');
  });

  it('lets the workspace open while a PDF is pending, without consuming it', () => {
    pending.setPendingFile(new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' }));
    expect(run()).toBeTrue();
    expect(pending.hasPendingFile()).toBeTrue();
  });
});
