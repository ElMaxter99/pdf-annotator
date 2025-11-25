import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-landing-footer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './landing-footer.component.html',
  styleUrl: './landing-footer.component.scss',
})
export class LandingFooterComponent {
  @Input({ required: true }) appName = '';
  @Input({ required: true }) version = '';
  @Input({ required: true }) currentYear!: number;
  @Input({ required: true }) appAuthor = '';
}
