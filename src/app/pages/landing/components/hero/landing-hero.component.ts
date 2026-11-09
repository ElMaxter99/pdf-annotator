import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';

@Component({
  selector: 'app-landing-hero',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './landing-hero.component.html',
})
export class LandingHeroComponent {}
