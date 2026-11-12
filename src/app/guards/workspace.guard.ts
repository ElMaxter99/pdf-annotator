import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { BatchStoreService } from '../services/batch-store.service';
import { PendingFileService } from '../services/pending-file.service';
import { SessionStoreService } from '../services/session-store.service';
import { BATCH_ITEM_PARAM, BATCH_OPEN_VIEW, batchItemOpening } from '../utils/batch-open.utils';

/**
 * The workspace needs a PDF. When none is pending (reload, «Adelante» in the history or a direct
 * URL) it reopens what the user was working on: the batch PDF named in `?lote=`, the PDF left in
 * this visit or the saved session. With nothing to reopen it goes back to where the PDF came from.
 */
export const workspaceGuard: CanActivateFn = async (route) => {
  // Server/prerender has no user file; let the shell render and decide on the client.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }

  const pending = inject(PendingFileService);
  const router = inject(Router);
  const batch = inject(BatchStoreService);
  const sessions = inject(SessionStoreService);

  if (pending.hasPendingFile()) {
    return true;
  }

  const itemId = route.queryParamMap.get(BATCH_ITEM_PARAM);
  if (itemId) {
    await batch.load();
    const item = batch.find(itemId);
    if (!item) {
      return router.createUrlTree(['/lote']);
    }
    batch.activate(item.id);
    const { file, coords } = batchItemOpening(item);
    pending.setPendingFile(file, coords?.length ? { coords, ...BATCH_OPEN_VIEW } : null);
    return true;
  }

  if (pending.reopenLast()) {
    return true;
  }

  const session = await sessions.load();
  if (session) {
    pending.setPendingFile(new File([session.pdf], session.name, { type: 'application/pdf' }), {
      coords: session.coords,
      pageIndex: session.pageIndex,
      scale: session.scale,
    });
    return true;
  }

  return router.createUrlTree(['/landing']);
};
