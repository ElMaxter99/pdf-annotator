import { NgModule } from '@angular/core';
import { LandingRoutingModule } from './landing-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { LandingHomeComponent } from './pages/home/landing-home.component';
import { LandingAboutComponent } from './pages/about/landing-about.component';

@NgModule({
  imports: [SharedModule, LandingRoutingModule, LandingHomeComponent, LandingAboutComponent],
})
export class LandingModule {}
