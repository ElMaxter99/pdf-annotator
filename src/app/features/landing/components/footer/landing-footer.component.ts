import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Pie de página reutilizable que muestra información básica de la aplicación.
 */
@Component({
  selector: 'app-landing-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing-footer.component.html',
  styleUrls: ['./landing-footer.component.scss'],
})
export class LandingFooterComponent {
  @Input({ required: true }) appName!: string;
  @Input({ required: true }) appAuthor!: string;
  @Input({ required: true }) version!: string;
  @Input({ required: true }) currentYear!: number;
}
