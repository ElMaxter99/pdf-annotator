import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';

@Component({
  selector: 'app-landing-footer',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './landing-footer.component.html',
})
export class LandingFooterComponent {
  @Input({ required: true }) appName = '';
  @Input({ required: true }) version = '';
  @Input({ required: true }) currentYear!: number;
  @Input({ required: true }) appAuthor = '';
}
