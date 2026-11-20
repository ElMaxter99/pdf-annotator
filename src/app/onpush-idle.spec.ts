import { Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LanguageSelectorComponent } from './components/language-selector/language-selector.component';
import { AiModelSelectComponent } from './components/ai-model-select/ai-model-select.component';
import { UpdateCardComponent } from './components/update-card/update-card.component';
import { UpdatePanelComponent } from './components/update-panel/update-panel.component';
import { UpdateInstallComponent } from './components/update-install/update-install.component';
import { UpdateChannelComponent } from './components/update-channel/update-channel.component';
import { VersionChipComponent } from './components/version-chip/version-chip.component';
import { FirstStepsComponent } from './pages/workspace/components/first-steps/first-steps.component';
import { ShortcutsDialogComponent } from './pages/workspace/components/shortcuts-dialog/shortcuts-dialog.component';
import { TemplatesExportDialogComponent } from './pages/workspace/components/templates-export-dialog/templates-export-dialog.component';
import { ExportSamplesDialogComponent } from './pages/workspace/components/export-samples-dialog/export-samples-dialog.component';
import { AiDetailsComponent } from './pages/workspace/components/migration/ai-details.component';
import { PageMapBatchDialogComponent } from './pages/batch/page-map-batch/page-map-batch-dialog.component';
import { AiBatchDetailsComponent } from './pages/batch/ai-batch/ai-batch-details.component';
import { AiBatchChipComponent } from './pages/batch/ai-batch/ai-batch-chip.component';
import { AiBatchButtonComponent } from './pages/batch/ai-batch/ai-batch-button.component';
import { AiBatchPanelComponent } from './pages/batch/ai-batch/ai-batch-panel.component';
import { LandingPageComponent } from './pages/landing/landing.page';

interface Case {
  name: string;
  type: Type<unknown>;
  inputs?: Record<string, unknown>;
}

const stubVm = {
  pdfDoc: signal(null),
  batchCtx: signal(null),
  annotationCount: signal(0),
  ai: signal(null),
  aiHelper: { models: signal({}) },
  setAiDetailsOpen: () => undefined,
  triggerImportCoords: () => undefined,
};

const CASES: Case[] = [
  { name: 'language-selector', type: LanguageSelectorComponent, inputs: { languages: ['es-ES', 'en', 'ca', 'fr', 'it', 'pt', 'de'], selectedLanguage: 'es-ES' } },
  { name: 'ai-model-select', type: AiModelSelectComponent, inputs: { provider: 'claude' } },
  { name: 'update-card', type: UpdateCardComponent },
  { name: 'update-panel', type: UpdatePanelComponent },
  { name: 'update-install', type: UpdateInstallComponent },
  { name: 'update-channel', type: UpdateChannelComponent },
  { name: 'version-chip', type: VersionChipComponent },
  { name: 'first-steps', type: FirstStepsComponent, inputs: { vm: stubVm } },
  { name: 'shortcuts-dialog', type: ShortcutsDialogComponent },
  { name: 'templates-export-dialog', type: TemplatesExportDialogComponent, inputs: { templates: [] } },
  { name: 'export-samples-dialog', type: ExportSamplesDialogComponent, inputs: { count: 3 } },
  { name: 'ai-details', type: AiDetailsComponent, inputs: { vm: stubVm } },
  { name: 'page-map-batch-dialog', type: PageMapBatchDialogComponent },
  { name: 'ai-batch-details', type: AiBatchDetailsComponent },
  { name: 'ai-batch-chip', type: AiBatchChipComponent, inputs: { item: { id: 'x', name: 'x' } } },
  { name: 'ai-batch-button', type: AiBatchButtonComponent },
  { name: 'ai-batch-panel', type: AiBatchPanelComponent },
  { name: 'landing', type: LandingPageComponent },
];

/**
 * T4 (1.16): estos componentes van en OnPush. En reposo (sin cambios de estado) su plantilla no debe volver a
 * ejecutarse; en Eager se ejecutaba en cada ciclo de detección (2 veces por `detectChanges`, con la comprobación
 * de cambios incluida). Si falla alguno, hay estado mutable sin pasar a signals o se ha vuelto a Eager.
 */
describe('OnPush en reposo', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  for (const c of CASES) {
    it(`${c.name} no reejecuta la plantilla en reposo`, () => {
      const def = (c.type as any).ɵcmp;
      const original = def.template;
      let runs = 0;
      def.tView = null;
      def.template = function (this: unknown, rf: number, ctx: unknown) {
        if (rf & 2) runs++;
        return original.call(this, rf, ctx);
      };
      try {
        const fixture = TestBed.createComponent(c.type);
        for (const [key, value] of Object.entries(c.inputs ?? {})) {
          fixture.componentRef.setInput(key, value);
        }
        fixture.detectChanges();
        const afterFirst = runs;
        for (let i = 0; i < 20; i++) {
          fixture.detectChanges();
        }
        expect(def.onPush).toBeTrue();
        expect(runs - afterFirst).toBe(0);
        fixture.destroy();
      } finally {
        def.template = original;
        def.tView = null;
      }
    });
  }
});
