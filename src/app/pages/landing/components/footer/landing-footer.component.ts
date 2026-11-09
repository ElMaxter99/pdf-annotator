import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationPipe } from '../../../../i18n/translation.pipe';

@Component({
  selector: 'app-landing-footer',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslationPipe],
  templateUrl: './landing-footer.component.html',
})
export class LandingFooterComponent {
  @Input({ required: true }) appName = '';
  @Input({ required: true }) version = '';
  @Input({ required: true }) currentYear!: number;
  @Input({ required: true }) appAuthor = '';
}
