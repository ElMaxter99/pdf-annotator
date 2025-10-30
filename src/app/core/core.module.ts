import { NgModule, Optional, SkipSelf } from '@angular/core';

/**
 * CoreModule should only be imported once in the root module. It is the place
 * to provide singleton services, guards and interceptors.
 */
@NgModule({})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule: CoreModule | null) {
    if (parentModule) {
      throw new Error('CoreModule is already loaded. Import it in the AppModule only.');
    }
  }
}
