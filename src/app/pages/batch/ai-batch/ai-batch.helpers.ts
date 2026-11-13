import type { AiBatchStart } from '../../../services/ai-batch.service';

/** Toast key for a start that did not begin (the dialog already explains the connection states). */
export function toastKey(result: AiBatchStart): string | null {
  return result === 'busy' ? 'batch.ai.toast.busy' : result === 'nothing' ? 'batch.ai.toast.nothing' : null;
}
