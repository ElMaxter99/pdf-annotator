import { NgModule, Optional, SkipSelf } from '@angular/core';

/**
 * CoreModule centralises singleton services and guards. It must only be loaded once.
 */
@NgModule({})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule: CoreModule | null) {
    if (parentModule) {
      throw new Error('CoreModule has already been loaded. Import CoreModule in the AppModule only.');
    }
  }
}
