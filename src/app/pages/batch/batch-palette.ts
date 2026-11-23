import type { PaletteCommand } from '../../utils/command-palette.utils';
import type { PaletteTranslate } from '../workspace/components/command-palette/command-palette.component';
import type { BatchPageComponent } from './batch.page';

/** Ids of the rows shown before typing when nothing was used yet (P-144). */
export const BATCH_DEFAULT_IDS = ['download-ready', 'review-next', 'update-templates', 'view-list'];

/**
 * Ctrl+K actions of the batch panel (P-144 to P-146). Every action calls the method of its button,
 * so the bulk ones keep their confirmation dialog and their «Deshacer».
 */
export function buildBatchCommands(
  page: BatchPageComponent,
  t: PaletteTranslate,
): PaletteCommand[] {
  const list: PaletteCommand[] = [];
  const add = (command: PaletteCommand) => list.push(command);
  const counts = page.counts();
  const selected = page.selectionCount();
  const noSelection = selected ? undefined : t('palette.why.noSelection');
  const group = (key: string) => t(`palette.group.${key}`);

  add({
    id: 'download-ready',
    icon: '⬇',
    label: t('palette.batch.downloadReady'),
    keywords: 'download zip ready listos descargar',
    hint: counts.ready
      ? `${group('batch')} · ${t('palette.batch.readyCount', { count: counts.ready })}`
      : group('batch'),
    disabledReason: counts.ready ? undefined : t('palette.why.noReady'),
    run: () => page.downloadReady(),
  });
  add({
    id: 'review-next',
    icon: '›',
    label: t('palette.batch.reviewNext'),
    keywords: 'review next revisar siguiente pendiente',
    hint:
      counts.review + counts.noTemplate
        ? `${group('batch')} · ${t('palette.batch.reviewCount', { count: counts.review + counts.noTemplate })}`
        : group('batch'),
    disabledReason: page.nextPending() ? undefined : t('palette.why.nothingToReview'),
    run: () => void page.reviewNext(),
  });
  add({
    id: 'update-templates',
    icon: '↻',
    label: t('palette.batch.updateTemplates'),
    keywords: 'update templates actualizar plantillas',
    hint: group('batch'),
    run: () => page.openTemplateUpdate(),
  });
  add({
    id: 'testdata',
    icon: '◐',
    label: t(
      page.previewSettings.hasTestData()
        ? 'palette.batch.testDataReplace'
        : 'palette.batch.testData',
    ),
    keywords: 'test data datos prueba muestra',
    hint: group('batch'),
    run: () => page.pickTestData(),
  });
  if (page.previewSettings.hasTestData()) {
    add({
      id: 'testdata-clear',
      icon: '✕',
      label: t('palette.batch.testDataRemove'),
      keywords: 'test data datos prueba quitar remove',
      hint: group('batch'),
      run: () => page.previewSettings.clearTestData(),
    });
  }

  const view = page.view();
  add({
    id: 'view-grid',
    icon: '▦',
    label: t('palette.batch.viewGrid'),
    keywords: 'view grid cuadricula vista',
    hint: view === 'grid' ? t('palette.hint.current') : group('view'),
    run: () => page.setView('grid'),
  });
  add({
    id: 'view-list',
    icon: '☰',
    label: t('palette.batch.viewList'),
    keywords: 'view list lista vista',
    hint: view === 'list' ? t('palette.hint.current') : group('view'),
    run: () => page.setView('list'),
  });

  const filters = [
    {
      id: 'filter-all',
      label: 'palette.batch.showAll',
      n: counts.all,
      active: page.filter() === 'all' && page.kind() === 'any' && !page.query().trim(),
      run: () => page.showStep('all'),
    },
    {
      id: 'filter-review',
      label: 'palette.batch.showReview',
      n: counts.review,
      active: page.filter() === 'review',
      run: () => {
        page.clearFilters();
        page.filter.set('review');
      },
    },
    {
      id: 'filter-ready',
      label: 'palette.batch.showReady',
      n: counts.ready,
      active: page.filter() === 'ready' && page.kind() === 'any' && !page.query().trim(),
      run: () => page.showStep('ready'),
    },
  ];
  for (const f of filters) {
    add({
      id: f.id,
      icon: '◐',
      label: t(f.label),
      keywords: 'filter show mostrar filtro',
      hint: f.active
        ? t('palette.hint.active')
        : `${group('filter')} · ${t('palette.batch.pdfCount', { count: f.n })}`,
      disabledReason: f.active ? t('palette.why.alreadyActive') : undefined,
      run: f.run,
    });
  }
  const steps = [
    { id: 'step-withA', label: 'palette.batch.showWithA', step: 'withA' as const },
    { id: 'step-withB', label: 'palette.batch.showWithB', step: 'withB' as const },
    ...(page.aiHelper.available
      ? [{ id: 'step-ai', label: 'palette.batch.showAi', step: 'ai' as const }]
      : []),
  ];
  for (const s of steps) {
    add({
      id: s.id,
      icon: '◐',
      label: t(s.label),
      keywords: 'filter show mostrar filtro plantilla version',
      hint: group('filter'),
      run: () => page.showStep(s.step),
    });
  }
  add({
    id: 'clear-filters',
    icon: '✕',
    label: t('palette.batch.clearFilters'),
    keywords: 'filter clear quitar filtros',
    hint: group('filter'),
    disabledReason: page.filtering() ? undefined : t('palette.why.noFilters'),
    run: () => page.clearFilters(),
  });

  add({
    id: 'select-visible',
    icon: '☑',
    label: t('palette.batch.selectVisible'),
    keywords: 'select all seleccionar todos visibles',
    shortcut: `${t('palette.ctrl')}+A`,
    hint: group('selection'),
    disabledReason: page.visibleIds().length
      ? page.allSelected()
        ? t('palette.why.alreadySelected')
        : undefined
      : t('palette.why.noVisible'),
    run: () => page.selectAllVisible(),
  });
  add({
    id: 'clear-selection',
    icon: '☐',
    label: t('palette.batch.clearSelection'),
    keywords: 'select clear quitar seleccion deseleccionar',
    hint: group('selection'),
    shortcut: 'Esc',
    disabledReason: noSelection,
    run: () => page.clearSelection(),
  });

  const selHint = (confirms: boolean) =>
    `${group('selection')} · ${t('palette.batch.pdfCount', { count: selected })}${confirms ? ` · ${t('palette.hint.confirms')}` : ''}`;
  const readyInSel = page
    .selectedItems()
    .filter((item) => item.status === 'ready' && !!item.bJson).length;
  add({
    id: 'sel-download',
    icon: '⬇',
    label: t('palette.batch.downloadSelected'),
    keywords: 'download selected descargar seleccionados',
    hint: selected ? selHint(false) : group('selection'),
    disabledReason: noSelection ?? (readyInSel ? undefined : t('palette.why.noReadyInSelection')),
    run: () => page.downloadSelected(),
  });
  add({
    id: 'sel-tables',
    icon: '▤',
    label: t('palette.batch.suggestTables'),
    keywords: 'page tables suggest tablas paginas sugerir',
    hint: selected ? selHint(false) : group('selection'),
    disabledReason:
      noSelection ??
      (page.bulkBusy()
        ? t('palette.why.busy')
        : page.tablesCount()
          ? undefined
          : t('palette.why.noVersionBInSelection')),
    run: () => page.openPageMaps(),
  });
  if (page.aiHelper.available) {
    add({
      id: 'sel-ai',
      icon: '✦',
      label: t('palette.batch.translateAi'),
      keywords: 'ai ia trasladar traslado',
      hint: selected ? selHint(false) : group('selection'),
      disabledReason: noSelection,
      run: () => page.openAiForSelection(),
    });
  }
  add({
    id: 'sel-ready',
    icon: '✔',
    label: t('palette.batch.markReady'),
    keywords: 'ready mark listos marcar',
    hint: selected ? selHint(true) : group('selection'),
    disabledReason:
      noSelection ?? (page.plan().ready > 0 ? undefined : t('palette.why.nothingToMark')),
    run: () => page.askBulk('ready'),
  });
  add({
    id: 'sel-remove',
    icon: '🗑',
    label: t('palette.batch.removeSelected'),
    keywords: 'remove delete quitar eliminar borrar',
    hint: selected ? selHint(true) : group('selection'),
    disabledReason: noSelection,
    run: () => page.askBulk('remove'),
  });

  page.allRows().forEach((row, index, rows) => {
    const item = row.item;
    add({
      id: `go-${item.id}`,
      icon: '›',
      label: t('palette.cmd.goTo', { name: item.name }),
      keywords: `${item.name} ${item.bName ?? ''} pdf`,
      hint: t('palette.hint.position', { index: index + 1, total: rows.length }),
      run: () => void page.open(item),
    });
  });

  add({
    id: 'shortcuts',
    icon: '⌨',
    label: t('shortcuts.open'),
    keywords: 'shortcuts keyboard help atajos',
    run: () => page.shortcutsOpen.set(true),
  });
  return list;
}
