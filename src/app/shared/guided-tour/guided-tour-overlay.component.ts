import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { GuidedTourService } from './guided-tour.service';

@Component({
  selector: 'app-guided-tour-overlay',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './guided-tour-overlay.component.html',
  styleUrls: ['./guided-tour-overlay.component.scss'],
})
export class GuidedTourOverlayComponent {
  private readonly tour = inject(GuidedTourService);

  readonly isActive = this.tour.isActive;
  readonly currentStep = this.tour.currentStep;
  readonly currentIndex = this.tour.currentIndex;
  readonly steps = this.tour.steps;

  readonly highlightStyle = computed(() => {
    const rect = this.tour.activeAnchorRect();
    if (!rect) {
      return null;
    }

    return {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    } satisfies Record<string, string>;
  });

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange() {
    this.tour.refreshAnchorRect();
  }

  close() {
    this.tour.endTour();
  }

  restart() {
    this.tour.restartTour();
  }

  next() {
    this.tour.nextStep();
  }

  previous() {
    this.tour.previousStep();
  }
}
