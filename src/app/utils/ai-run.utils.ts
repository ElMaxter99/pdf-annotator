/** Borrador de una pasada de «Trasladar con IA» (P-127): qué PDF se lanzaron y cómo iban cuando se cortó. */
import type { BatchItem } from '../models/batch.model';

export interface AiRunRecord {
  /** PDFs de la pasada, en orden. */
  readonly ids: readonly string[];
  readonly provider: string;
  readonly startedAt: number;
  /** PDFs que ya habían salido de la cola (empezaron). */
  readonly started: readonly string[];
  /** PDFs que fallaron. */
  readonly failed: readonly string[];
}

const MAX_IDS = 500;

function ids(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 80).slice(0, MAX_IDS)
    : [];
}

/** Lo leído del almacenamiento no es de fiar: se reconstruye o se descarta. */
export function sanitizeAiRun(raw: unknown): AiRunRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const list = ids(value['ids']);
  if (!list.length) {
    return null;
  }
  const startedAt = typeof value['startedAt'] === 'number' && Number.isFinite(value['startedAt']) ? value['startedAt'] : 0;
  return {
    ids: list,
    provider: typeof value['provider'] === 'string' ? value['provider'].slice(0, 20) : '',
    startedAt,
    started: ids(value['started']),
    failed: ids(value['failed']),
  };
}

export type AiRunState = 'saved' | 'failed' | 'interrupted' | 'notStarted';

export interface AiRunSummary {
  readonly startedAt: number;
  readonly provider: string;
  /** Todos los PDFs de la pasada que siguen en el lote. */
  readonly all: readonly string[];
  readonly saved: readonly string[];
  readonly failed: readonly string[];
  readonly interrupted: readonly string[];
  readonly notStarted: readonly string[];
  /** Lo que falta: todo lo que no tiene propuesta guardada. */
  readonly pending: readonly string[];
  /** PDFs de la pasada que ya no están en el lote. */
  readonly missing: number;
  /** Con propuesta guardada que la persona editó a mano. */
  readonly edited: number;
  readonly stateOf: Readonly<Record<string, AiRunState>>;
}

/** Reparte los PDFs de una pasada según lo que quedó guardado; `null` si no falta nada. */
export function classifyAiRun(
  record: AiRunRecord | null,
  items: readonly Pick<BatchItem, 'id' | 'aiProposal'>[],
): AiRunSummary | null {
  if (!record) {
    return null;
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const all = record.ids.filter((id) => byId.has(id));
  const stateOf: Record<string, AiRunState> = {};
  const saved: string[] = [];
  const failed: string[] = [];
  const interrupted: string[] = [];
  const notStarted: string[] = [];
  let edited = 0;
  for (const id of all) {
    const proposal = byId.get(id)?.aiProposal;
    if (proposal) {
      saved.push(id);
      stateOf[id] = 'saved';
      if (proposal.edits && Object.keys(proposal.edits).length) {
        edited++;
      }
    } else if (record.failed.includes(id)) {
      failed.push(id);
      stateOf[id] = 'failed';
    } else if (record.started.includes(id)) {
      interrupted.push(id);
      stateOf[id] = 'interrupted';
    } else {
      notStarted.push(id);
      stateOf[id] = 'notStarted';
    }
  }
  const pending = all.filter((id) => stateOf[id] !== 'saved');
  if (!pending.length) {
    return null;
  }
  return {
    startedAt: record.startedAt,
    provider: record.provider,
    all,
    saved,
    failed,
    interrupted,
    notStarted,
    pending,
    missing: record.ids.length - all.length,
    edited,
    stateOf,
  };
}
