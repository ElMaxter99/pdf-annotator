/** Steps of one PDF in the batch queue for «Ver detalles» (the same story as the single-PDF modal, built from the stored log). */
import type { AiBatchRow } from '../services/ai-batch.service';

export interface BatchTimelineItem {
  state: 'done' | 'cur' | 'err' | 'wait';
  title: string;
  sub: string;
  at: number | null;
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

const FINISHED = ['ready', 'free', 'partial', 'failed', 'cancelled'];

export function isFinished(row: Pick<AiBatchRow, 'phase'>): boolean {
  return FINISHED.includes(row.phase);
}

export function buildBatchTimeline(row: AiBatchRow, t: Translate, provider: string): BatchTimelineItem[] {
  const items: BatchTimelineItem[] = [];
  const finished = isFinished(row);
  const end = row.endedAt !== null && row.t0 !== null ? row.endedAt - row.t0 : null;
  const cascade = row.cascade;
  if (cascade) {
    items.push({
      state: 'done',
      title: t('ai.details.step.prepare'),
      sub: t('batch.ai.details.prepare', { pagesA: cascade.pagesA, pagesB: cascade.pagesB, textsA: cascade.textsA, textsB: cascade.textsB }),
      at: 0,
    });
    items.push({
      state: row.phase === 'adjusting' ? 'cur' : 'done',
      title: t('batch.ai.details.adjust'),
      sub: cascade.solved
        ? t('batch.ai.details.adjustSolved', { fields: cascade.fields })
        : t('batch.ai.details.adjustNot', { why: t(`batch.ai.details.why.${cascade.why ?? 'lowConfidence'}`) }),
      at: cascade.at,
    });
    if (cascade.solved) {
      items.push({
        state: 'done',
        title: t('batch.ai.details.save'),
        sub: t('batch.ai.details.saveSub', { placed: row.placed, total: row.total }),
        at: end,
      });
      return items;
    }
  } else if (row.phase === 'adjusting') {
    items.push({ state: 'cur', title: t('batch.ai.details.adjust'), sub: '', at: null });
    return items;
  }
  const firstAsk = row.stageLog.find((e) => e.stage === 'asking');
  if (!cascade) {
    items.push({
      state: 'done',
      title: t('ai.details.step.prepare'),
      sub: row.sent ? t('ai.details.step.prepareSub', { textsA: row.sent.textsA, textsB: row.sent.textsB, pagesA: row.sent.pagesA, pagesB: row.sent.pagesB }) : '',
      at: firstAsk ? firstAsk.at : null,
    });
  }
  const measured = row.usage !== null;
  for (const ask of row.stageLog.filter((e) => e.stage === 'asking')) {
    const steps = row.stepLog.filter((e) => e.attempt === ask.attempt);
    items.push({
      state: 'done',
      title: t('ai.details.step.send', { provider }),
      sub: t(steps.length || measured ? 'ai.details.step.sendSub' : 'ai.details.step.sendNoSteps', { n: ask.attempt, provider }),
      at: ask.at,
    });
    for (const entry of steps) {
      const step = entry.step;
      items.push(
        step.kind === 'answer'
          ? { state: 'done', title: t('ai.details.step.answer', { provider }), sub: t('ai.details.step.answerSub', { chars: step.chars }), at: entry.at }
          : step.tool === 'Read' && step.file
            ? { state: 'done', title: t('ai.details.step.read', { provider, file: step.file }), sub: '', at: entry.at }
            : { state: 'done', title: t('ai.details.step.tool', { provider, tool: step.tool || '—' }), sub: '', at: entry.at },
      );
    }
  }
  const resolving = row.stageLog.find((e) => e.stage === 'resolving');
  if (resolving) {
    items.push({ state: 'done', title: t('ai.details.step.resolve'), sub: t('ai.details.step.resolveSub'), at: resolving.at });
  }
  if (row.phase === 'failed' || row.phase === 'cancelled') {
    items.push({
      state: 'err',
      title: t(row.phase === 'cancelled' ? 'batch.ai.details.cancelled' : 'ai.details.step.error'),
      sub: row.error?.message ?? '',
      at: end,
    });
  } else if (finished) {
    items.push({
      state: 'done',
      title: t('ai.details.step.result'),
      sub: t('ai.details.step.resultSub', { placed: row.placed, total: row.total }),
      at: end,
    });
  } else {
    const last = items[items.length - 1];
    if (last) {
      last.state = 'cur';
      last.at = null;
    }
    if (!resolving) {
      items.push({ state: 'wait', title: t('ai.details.step.resolve'), sub: t('ai.details.step.resolveSub'), at: null });
    }
    items.push({ state: 'wait', title: t('batch.ai.details.save'), sub: t('batch.ai.details.saveWait'), at: null });
  }
  return items;
}

/** «Paso 5 de 7 · title» for the row of the queue. */
export function currentStep(items: readonly BatchTimelineItem[]): { n: number; total: number; title: string } | null {
  const index = items.findIndex((item) => item.state === 'cur');
  return index < 0 ? null : { n: index + 1, total: items.length, title: items[index].title };
}
