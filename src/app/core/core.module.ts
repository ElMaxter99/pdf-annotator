import { NgModule, Optional, SkipSelf } from '@angular/core';

/**
 * Módulo que agrupa servicios globales. Se importa únicamente desde `AppModule`
 * para evitar instancias duplicadas de singletons.
 */
@NgModule({
  providers: [],
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule: CoreModule | null) {
    if (parentModule) {
      throw new Error('CoreModule solo debe importarse en AppModule.');
    }
  }
}
