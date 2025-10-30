import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LandingHomeComponent } from './pages/home/landing-home.component';
import { LandingAboutComponent } from './pages/about/landing-about.component';

// La landing se separa en páginas públicas (home y about) con carga diferida.
const routes: Routes = [
  { path: '', component: LandingHomeComponent },
  { path: 'about', component: LandingAboutComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes), LandingHomeComponent, LandingAboutComponent],
  exports: [RouterModule],
})
export class LandingRoutingModule {}
