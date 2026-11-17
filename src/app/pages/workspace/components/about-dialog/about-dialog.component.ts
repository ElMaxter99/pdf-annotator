import { FocusTrapDirective } from '../../../../directives/focus-trap.directive';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-about-dialog',
  standalone: true,
  templateUrl: './about-dialog.component.html',
  imports: [FocusTrapDirective, TranslationPipe],
})
export class AboutDialogComponent implements AfterViewInit {
  @Input({ required: true }) appName = '';
  @Input({ required: true }) author = '';
  @Input({ required: true }) version = '';
  @Input({ required: true }) year = 0;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('closeButton', { static: true }) closeButton!: ElementRef<HTMLButtonElement>;

  ngAfterViewInit() {
    this.closeButton.nativeElement.focus();
  }
}
