import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-landing-footer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <footer class="footer landing__footer">
      <div class="footer__brand">
        <img class="footer__logo" src="/logo.svg" [attr.alt]="'Logotipo de ' + appName" />
        <div class="footer__brand-text">
          <span class="footer__app-name">{{ appName }}</span>
          <span class="footer__version">v{{ version }}</span>
        </div>
      </div>
      <div class="footer__details">
        <span>© {{ currentYear }} {{ appName }}</span>
        <span>Desarrollado por {{ appAuthor }}</span>
      </div>
    </footer>
  `,
})
export class LandingFooterComponent {
  @Input({ required: true }) appName = '';
  @Input({ required: true }) version = '';
  @Input({ required: true }) currentYear!: number;
  @Input({ required: true }) appAuthor = '';
}
