import { Injectable, computed, signal } from '@angular/core';

export type GuidedTourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface GuidedTourStep {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly anchorId?: string;
  readonly placement?: GuidedTourPlacement;
}

@Injectable({ providedIn: 'root' })
export class GuidedTourService {
  private readonly stepsSignal = signal<readonly GuidedTourStep[]>([]);
  private readonly activeSignal = signal(false);
  private readonly currentIndexSignal = signal(0);
  private readonly anchorRectSignal = signal<DOMRect | null>(null);
  private readonly anchors = new Map<string, HTMLElement>();

  readonly isActive = computed(() => this.activeSignal());
  readonly steps = computed(() => this.stepsSignal());
  readonly currentStep = computed<GuidedTourStep | null>(() => {
    const steps = this.stepsSignal();
    const index = this.currentIndexSignal();
    return steps[index] ?? null;
  });
  readonly currentIndex = computed(() => this.currentIndexSignal());
  readonly activeAnchorRect = computed(() => this.anchorRectSignal());

  setSteps(steps: readonly GuidedTourStep[]) {
    this.stepsSignal.set([...steps]);
    if (!steps.length) {
      this.endTour();
      return;
    }

    if (this.isActive()) {
      this.restartTour();
    }
  }

  startTour() {
    if (!this.stepsSignal().length) {
      return;
    }
    this.activeSignal.set(true);
    this.currentIndexSignal.set(0);
    this.updateAnchorRect();
  }

  restartTour() {
    this.currentIndexSignal.set(0);
    this.activeSignal.set(true);
    this.updateAnchorRect();
  }

  endTour() {
    this.activeSignal.set(false);
    this.currentIndexSignal.set(0);
    this.anchorRectSignal.set(null);
  }

  nextStep() {
    const steps = this.stepsSignal();
    const nextIndex = this.currentIndexSignal() + 1;
    if (nextIndex >= steps.length) {
      this.endTour();
      return;
    }

    this.currentIndexSignal.set(nextIndex);
    this.updateAnchorRect();
  }

  previousStep() {
    const prevIndex = this.currentIndexSignal() - 1;
    if (prevIndex < 0) {
      return;
    }

    this.currentIndexSignal.set(prevIndex);
    this.updateAnchorRect();
  }

  registerAnchor(id: string, element: HTMLElement) {
    this.anchors.set(id, element);
    this.refreshIfCurrent(id);
  }

  unregisterAnchor(id: string, element: HTMLElement) {
    const stored = this.anchors.get(id);
    if (stored === element) {
      this.anchors.delete(id);
    }
    this.refreshIfCurrent(id);
  }

  refreshAnchorRect() {
    this.updateAnchorRect();
  }

  private refreshIfCurrent(anchorId: string) {
    if (this.currentStep()?.anchorId === anchorId) {
      this.updateAnchorRect();
    }
  }

  private updateAnchorRect() {
    if (!this.isActive()) {
      this.anchorRectSignal.set(null);
      return;
    }

    const anchorId = this.currentStep()?.anchorId;
    if (!anchorId) {
      this.anchorRectSignal.set(null);
      return;
    }

    const element = this.anchors.get(anchorId);
    if (!element) {
      this.anchorRectSignal.set(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    this.anchorRectSignal.set(new DOMRect(rect.x, rect.y, rect.width, rect.height));
  }
}
