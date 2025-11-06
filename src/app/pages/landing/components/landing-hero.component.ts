import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';

@Component({
  selector: 'app-landing-hero',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  template: `
    <div class="landing__hero">
      <span class="landing__badge">{{ 'app.landing.badge' | t }}</span>
      <h1 class="landing__title">{{ 'app.landing.title' | t }}</h1>
      <p class="landing__description">{{ 'app.landing.description' | t }}</p>
    </div>
  `,
})
export class LandingHeroComponent {}
