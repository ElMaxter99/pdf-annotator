import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageField } from '../../../../shared/models/annotation.model';
import { TranslationPipe } from '../../../../shared/pipes/translation.pipe';

@Component({
  selector: 'app-annotation-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslationPipe],
  templateUrl: './annotation-form.component.html',
  styleUrls: ['./annotation-form.component.scss'],
})
export class AnnotationFormComponent implements AfterViewInit {
  @Input() mode: 'preview' | 'edit' = 'preview';
  @Input() field!: PageField;
  @Input() scale = 1;
  @Input() canvasHeight = 0;
  @Input() hexValue = '';
  @Input() rgbValue = '';

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() duplicate = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
  @Output() colorHexChange = new EventEmitter<string>();
  @Output() colorRgbChange = new EventEmitter<string>();
  @Output() colorPickerChange = new EventEmitter<string>();
  @Output() keydown = new EventEmitter<KeyboardEvent>();

  @ViewChild('formRoot', { static: false }) formRoot?: ElementRef<HTMLDivElement>;

  get positionLeft() {
    return this.field.x * this.scale;
  }

  get positionTop() {
    return this.canvasHeight - this.field.y * this.scale;
  }

  get isNumberType() {
    return this.field.type === 'number';
  }

  ngAfterViewInit() {
    queueMicrotask(() => {
      const formElement = this.formRoot?.nativeElement;
      if (!formElement) {
        return;
      }
      const firstInput = formElement.querySelector<HTMLElement>('input, select, textarea, button');
      firstInput?.focus();
    });
  }

  onKeydown(event: KeyboardEvent) {
    this.keydown.emit(event);
  }
}
