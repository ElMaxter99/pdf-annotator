import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // The batch pages only make sense in the browser (IndexedDB), and `batch/:id` has no static ids.
  { path: 'batch', renderMode: RenderMode.Client },
  { path: 'batch/load', renderMode: RenderMode.Client },
  { path: 'batch/:id/editor', renderMode: RenderMode.Client },
  { path: 'batch/:id', renderMode: RenderMode.Client },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
