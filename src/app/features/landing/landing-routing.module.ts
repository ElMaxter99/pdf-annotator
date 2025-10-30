import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AboutPageComponent } from './pages/about/about.page';
import { LandingHomePageComponent } from './pages/home/landing-home.page';

const routes: Routes = [
  {
    path: '',
    component: LandingHomePageComponent,
  },
  {
    path: 'about',
    component: AboutPageComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LandingRoutingModule {}
