import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared/shared.module';
import { LandingRoutingModule } from './landing-routing.module';
import { AboutPageComponent } from './pages/about/about.page';
import { LandingHomePageComponent } from './pages/home/landing-home.page';

/**
 * Módulo de la zona pública. Contiene la home y páginas informativas.
 */
@NgModule({
  declarations: [LandingHomePageComponent, AboutPageComponent],
  imports: [SharedModule, LandingRoutingModule],
})
export class LandingModule {}
