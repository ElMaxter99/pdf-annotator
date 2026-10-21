import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PendingFileService } from '../services/pending-file.service';

/**
 * The workspace is useless without a PDF. Reloading it (or opening its URL directly) loses the
 * in-memory file, so send the user to the landing page, where a saved session can be resumed.
 */
export const workspaceGuard: CanActivateFn = () => {
  // Server/prerender has no user file; let the shell render and decide on the client.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }

  if (inject(PendingFileService).hasPendingFile()) {
    return true;
  }

  return inject(Router).createUrlTree(['/landing']);
};
