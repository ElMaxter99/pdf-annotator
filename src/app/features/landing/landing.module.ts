import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { LandingRoutingModule } from './landing-routing.module';
import { LandingHomePageComponent } from './pages/home/home.page';

/**
 * Feature module responsible for the public marketing entry point of the application.
 */
@NgModule({
  declarations: [LandingHomePageComponent],
  imports: [CommonModule, SharedModule, LandingRoutingModule],
})
export class LandingModule {}
