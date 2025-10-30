import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared/shared.module';
import { LandingRoutingModule } from './landing-routing.module';
import { HomeComponent } from './pages/home/home.component';

/**
 * Aggregates the public landing experience. The module stays very lean and
 * exposes only the initial page.
 */
@NgModule({
  declarations: [HomeComponent],
  imports: [SharedModule, LandingRoutingModule],
})
export class LandingModule {}
