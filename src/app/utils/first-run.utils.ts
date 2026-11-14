/** One-time guides («Tres pasos para empezar», «Primer campo colocado»): remembered on this computer only. */
export type FirstRunGuide = 'steps' | 'hint';

const KEYS: Record<FirstRunGuide, string> = {
  steps: 'pdf-annotator.guide.steps',
  hint: 'pdf-annotator.guide.hint',
};

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** True once the guide was closed or completed (without storage it is never «seen», but it also never nags twice per page). */
export function guideSeen(guide: FirstRunGuide): boolean {
  try {
    return store()?.getItem(KEYS[guide]) === '1';
  } catch {
    return false;
  }
}

export function markGuideSeen(guide: FirstRunGuide): void {
  try {
    store()?.setItem(KEYS[guide], '1');
  } catch {
    /* private mode or blocked storage: the guide may show again next time */
  }
}
