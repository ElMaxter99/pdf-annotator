import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild, signal } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';

export type ExportSamplesChoice = 'map' | 'sample';

/** Asks what to stamp when some annotations would paint a sample value. */
@Component({
  selector: 'app-export-samples-dialog',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    <div class="dialog-backdrop" (click)="cancelled.emit()" (keydown.escape)="cancelled.emit()">
      <div class="dialog dialog--ask" role="dialog" aria-modal="true" aria-labelledby="export-samples-title"
        data-testid="export-samples-dialog" (click)="$event.stopPropagation()">
        <header class="dialog__header">
          <h2 id="export-samples-title" class="dialog__title">{{ 'exportSamples.title' | t: { count: count } }}</h2>
        </header>
        <div class="dialog__body">
          <p class="dialog__lead">{{ 'exportSamples.lead' | t }}</p>
          <label class="ask-option" [class.ask-option--on]="choice() === 'map'">
            <input #first type="radio" name="export-choice" value="map" [checked]="choice() === 'map'" (change)="choice.set('map')" />
            <span>
              <b>{{ 'exportSamples.optMap' | t }}</b> <small>· {{ 'exportSamples.recommended' | t }}</small><br />
              <small>{{ 'exportSamples.optMapHint' | t }}</small>
            </span>
          </label>
          <label class="ask-option" [class.ask-option--on]="choice() === 'sample'">
            <input type="radio" name="export-choice" value="sample" [checked]="choice() === 'sample'" (change)="choice.set('sample')" />
            <span>
              <b>{{ 'exportSamples.optSample' | t }}</b><br />
              <small>{{ 'exportSamples.optSampleHint' | t }}</small>
            </span>
          </label>
          <label class="ask-remember">
            <input type="checkbox" [checked]="remember()" (change)="remember.set($any($event.target).checked)" />
            {{ 'exportSamples.remember' | t }}
          </label>
          <div class="ask-actions">
            <button type="button" class="btn btn--ghost" (click)="cancelled.emit()">{{ 'exportSamples.cancel' | t }}</button>
            <button type="button" class="btn btn--primary" (click)="confirmed.emit({ choice: choice(), remember: remember() })"
              data-testid="export-samples-continue">{{ 'exportSamples.continue' | t }}</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ExportSamplesDialogComponent implements AfterViewInit {
  @Input({ required: true }) count = 0;
  @Output() cancelled = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<{ choice: ExportSamplesChoice; remember: boolean }>();
  @ViewChild('first', { static: true }) first!: ElementRef<HTMLInputElement>;

  readonly choice = signal<ExportSamplesChoice>('map');
  readonly remember = signal(false);

  ngAfterViewInit(): void {
    this.first.nativeElement.focus();
  }
}
