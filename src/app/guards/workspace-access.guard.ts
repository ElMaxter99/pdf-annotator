import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PendingFileService } from '../services/pending-file.service';

export const workspaceAccessGuard: CanActivateFn = () => {
  const pendingFileService = inject(PendingFileService);
  const router = inject(Router);

  if (pendingFileService.hasActiveDocument() || pendingFileService.hasPendingFile()) {
    return true;
  }

  return router.createUrlTree(['/landing']);
};
