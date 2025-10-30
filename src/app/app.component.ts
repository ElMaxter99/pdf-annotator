import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Componente raíz encargado de exponer un shell mínimo con un `<router-outlet>`.
 * Toda la funcionalidad de la aplicación se distribuye en módulos de características
 * que se cargan de forma diferida mediante el enrutador principal.
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
