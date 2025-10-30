import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslationPipe } from '../../../../shared/pipes/translation.pipe';

/**
 * Página estática con información del proyecto y accesos directos al editor.
 */
@Component({
  selector: 'app-landing-about',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslationPipe],
  templateUrl: './landing-about.component.html',
  styleUrls: ['./landing-about.component.scss'],
})
export class LandingAboutComponent {}
