import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationPipe } from '../../../../shared/pipes/translation.pipe';

/**
 * Presenta la cabecera de la landing con copy traducible y preparado para futuros CTA.
 */
@Component({
  selector: 'app-landing-hero',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './landing-hero.component.html',
  styleUrls: ['./landing-hero.component.scss'],
})
export class LandingHeroComponent {}
