import {
  DEFAULT_OPACITY,
  ensureFieldStyle,
  prepareFieldForStorage,
} from '../../utils/field-style.utils';
import {
  JsonShapeError,
  buildJsonTreePath,
  serializeFieldForJson,
} from '../../utils/json-text.utils';
import { PageAnnotations, PageField } from '../../models/annotation.model';
import { AnnotationTemplate } from '../../annotation-templates.service';
import {
  cloneGuideSettings,
  differsFromDefaultGuideSettings,
} from '../../models/guide-settings.model';
import { CustomFontEntry, DEFAULT_FONT_ID } from '../../fonts/font-catalog.service';
import { ImportReport } from '../../services/annotation-import.service';
import { resolveFieldPreview } from '../../utils/preview-values.utils';
import { cloneAnnotationPages } from '../../utils/annotation-pages.utils';
import { downloadBlob, toArrayBuffer } from '../../utils/download.utils';
import { LooseJsonError } from '../../utils/loose-json';
import {
  JsonCopyFormat,
  formatJsonBlock,
  formatJsonForCopy,
  isStrictJsonFormat,
  jsonCopyPreset,
} from '../../utils/json-copy-format.utils';
import { buildJsonExportPayload } from '../../utils/json-export.utils';
import { JsonViewMode, AUTO_APPLY_JSON_DELAY_MS, MAX_JSON_IMPORT_BYTES } from './workspace.types';
import type { WorkspacePageComponent } from './workspace.page';

/**
 * JSON, plantillas y exportación: foco del JSON al seleccionar, aplicar e importar JSON, plantillas guardadas y descarga del PDF anotado.
 * Métodos de `WorkspacePageComponent` (se copian a su prototipo con `WORKSPACE_PARTS`, al final de workspace.page.ts;
 * `this` es la página).
 */
/** Copia al portapapeles; sin la API moderna (contexto no seguro, permiso denegado) prueba con `execCommand`. */
async function writeTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cae al método antiguo */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export class WorkspaceJson {
  focusJsonOnSelection(this: WorkspacePageComponent, pageIndex: number, fieldIndex: number) {
    if (pageIndex < 0 || fieldIndex < 0) {
      return;
    }

    this.runAfterRender(() => {
      if (this.jsonViewMode() === 'tree') {
        this.focusJsonTreeNode(pageIndex, fieldIndex);
      } else {
        this.focusJsonTextRange(pageIndex, fieldIndex);
      }
    });
  }

  focusJsonTreeNode(this: WorkspacePageComponent, pageIndex: number, fieldIndex: number) {
    if (this.jsonTreePreview().status !== 'ready') {
      return;
    }

    const component = this.jsonTreeComponent;
    if (!component) {
      return;
    }

    const pages = this.coords();
    if (pageIndex < 0 || pageIndex >= pages.length) {
      return;
    }

    const fields = pages[pageIndex]?.fields ?? [];
    if (fieldIndex < 0 || fieldIndex >= fields.length) {
      return;
    }

    component.focusPath(buildJsonTreePath(pageIndex, fieldIndex), { smooth: true });
  }

  focusJsonTextRange(this: WorkspacePageComponent, pageIndex: number, fieldIndex: number) {
    const editor = this.jsonEditorRef;
    if (!editor) {
      return;
    }

    const pages = this.coords();
    if (pageIndex < 0 || pageIndex >= pages.length) {
      return;
    }

    const fields = pages[pageIndex]?.fields ?? [];
    if (fieldIndex < 0 || fieldIndex >= fields.length) {
      return;
    }

    const range = this.locateJsonFieldRange(pageIndex, fieldIndex, editor.getValue());
    if (!range) {
      return;
    }

    editor.revealRange(range.start, range.end);
  }

  locateJsonFieldRange(
    this: WorkspacePageComponent,
    pageIndex: number,
    fieldIndex: number,
    text: string,
  ): { start: number; end: number } | null {
    if (!text) {
      return null;
    }

    const pages = this.coords();
    if (pageIndex < 0 || pageIndex >= pages.length) {
      return null;
    }

    const targetPage = pages[pageIndex];
    if (!targetPage.fields.length || fieldIndex < 0 || fieldIndex >= targetPage.fields.length) {
      return null;
    }

    let searchFrom = 0;

    for (let i = 0; i < pages.length; i += 1) {
      const pageBlock = this.buildPageJsonBlock(pages[i]);
      const pagePos = text.indexOf(pageBlock, searchFrom);
      if (pagePos === -1) {
        return null;
      }

      if (i === pageIndex) {
        let fieldSearchFrom = pagePos;
        for (let j = 0; j < targetPage.fields.length; j += 1) {
          const fieldBlock = this.buildFieldJsonBlock(targetPage.fields[j]);
          const fieldPos = text.indexOf(fieldBlock, fieldSearchFrom);
          if (fieldPos === -1) {
            return null;
          }

          if (j === fieldIndex) {
            return { start: fieldPos, end: fieldPos + fieldBlock.length };
          }

          fieldSearchFrom = fieldPos + fieldBlock.length;
        }

        return null;
      }

      searchFrom = pagePos + pageBlock.length;
    }

    return null;
  }

  buildPageJsonBlock(this: WorkspacePageComponent, page: PageAnnotations): string {
    return formatJsonBlock(
      buildJsonExportPayload([page], (field) => this.serializeFieldForJson(field)).pages[0],
      this.jsonCopyFormat(),
      2,
    );
  }

  buildFieldJsonBlock(this: WorkspacePageComponent, field: PageField): string {
    return formatJsonBlock(this.serializeFieldForJson(field), this.jsonCopyFormat(), 4);
  }

  clearAll(this: WorkspacePageComponent, options?: { skipHistory?: boolean }) {
    this.replaceCoords([], options);
  }

  copyJSON(this: WorkspacePageComponent) {
    const text = this.coordsTextModel();
    const format = this.jsonCopyFormat();
    const preset = jsonCopyPreset(format);
    // Siempre se reescribe con el formato elegido: si el texto del editor lleva claves sin comillas
    // (JSON «flexible»), «Copiar JSON» tiene que entregar JSON válido igualmente.
    const output = formatJsonForCopy(text, format) ?? text;
    const label = this.translationService.translate(`sidebar.copyFormat.name.${preset}`);
    void writeTextToClipboard(output).then((ok) => {
      if (ok) {
        this.toast.show(
          this.translationService.translate('toast.jsonCopied', { format: label }),
          'success',
          2000,
        );
      } else {
        this.toast.error(this.translationService.translate('toast.jsonCopyFailed'));
      }
    });
  }

  /** El texto del editor se puede leer: sin error de sintaxis (vacío cuenta como legible). */
  jsonKeysCanChange(this: WorkspacePageComponent): boolean {
    return this.jsonTreePreview().status !== 'error';
  }

  /**
   * Reescribe el texto del editor con el formato elegido (P-163 a P-165). Parte del texto actual y no de las
   * anotaciones para no perder una edición que aún no se haya aplicado; no toca anotaciones ni historial.
   */
  onJsonFormatChanged(this: WorkspacePageComponent, format: JsonCopyFormat) {
    if (!this.jsonKeysCanChange()) {
      return;
    }
    const text = this.coordsTextModel();
    const next = formatJsonForCopy(text, format);
    if (next !== null && next !== text) {
      this.coordsTextModel.set(next);
      this.refreshJsonPreview();
    }
  }

  setJsonCopyFormat(this: WorkspacePageComponent, patch: Partial<JsonCopyFormat>) {
    this.copyFormats.set(patch);
  }

  jsonCopyIsStrict(this: WorkspacePageComponent): boolean {
    return isStrictJsonFormat(this.jsonCopyFormat());
  }

  toggleIncludeAdvancedJsonFields(this: WorkspacePageComponent, checked: boolean) {
    if (this.includeAdvancedJsonFields() === checked) {
      return;
    }

    this.includeAdvancedJsonFields.set(checked);
    this.syncCoordsTextModel();
  }

  onCoordsTextChange(this: WorkspacePageComponent, value: string) {
    this.coordsTextModel.set(value);
    this.refreshJsonPreview();
    this.scheduleCoordsAutoApply();
  }

  onCoordsTextPaste(this: WorkspacePageComponent) {
    this.scheduleCoordsAutoApply(0);
  }

  setJsonViewMode(this: WorkspacePageComponent, mode: JsonViewMode) {
    if (this.jsonViewMode() === mode) {
      return;
    }

    if (mode === 'tree') {
      this.refreshJsonPreview();
    }

    this.jsonViewMode.set(mode);

    const editState = this.editing();
    if (editState) {
      this.focusJsonOnSelection(editState.pageIndex, editState.fieldIndex);
    }
  }

  applyCoordsText(this: WorkspacePageComponent) {
    this.tryApplyCoordsText({ silent: false, clearWhenEmpty: true });
  }

  scheduleCoordsAutoApply(this: WorkspacePageComponent, delayMs = AUTO_APPLY_JSON_DELAY_MS) {
    if (this.autoApplyCoordsTimer) {
      clearTimeout(this.autoApplyCoordsTimer);
    }

    this.autoApplyCoordsTimer = setTimeout(() => {
      this.autoApplyCoordsTimer = null;
      this.tryApplyCoordsText({ silent: true, clearWhenEmpty: false });
    }, delayMs);
  }

  tryApplyCoordsText(
    this: WorkspacePageComponent,
    options: { silent: boolean; clearWhenEmpty: boolean },
  ): boolean {
    const text = this.coordsTextModel().trim();

    if (!text) {
      if (options.clearWhenEmpty) {
        this.clearAll();
      }
      return false;
    }

    try {
      const { pages, report } = this.annotationImport.importFromText(text, (field) =>
        this.prepareFieldForStorage(field),
      );

      this.replaceCoords(pages, { preserveTextModel: true });
      if (!options.silent) {
        void this.reportImportIssues(report, pages);
      }
      return true;
    } catch (error) {
      if (!options.silent) {
        console.error('No se pudo importar el JSON de anotaciones.', error);
        this.reportJsonImportError(error);
      }
      return false;
    }
  }

  triggerImportCoords(this: WorkspacePageComponent) {
    const input = this.coordsFileInputRef?.nativeElement ?? this.ensureCoordsFileInput();
    if (!input) {
      console.warn('No se pudo abrir el selector de archivos para importar anotaciones.');
      return;
    }

    input.value = '';
    input.click();
  }

  async onCoordsFileSelected(this: WorkspacePageComponent, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (file.size > MAX_JSON_IMPORT_BYTES) {
        throw new Error('El archivo JSON supera el tamaño máximo permitido');
      }
      const text = await file.text();
      const { pages, report } = this.annotationImport.importFromText(text, (field) =>
        this.prepareFieldForStorage(field),
      );

      this.replaceCoords(pages, { preserveTextModel: false });
      void this.reportImportIssues(report, pages);
    } catch (error) {
      console.error('No se pudo importar el JSON de anotaciones.', error);
      this.reportJsonImportError(error);
    } finally {
      input.value = '';
    }
  }

  downloadJSON(this: WorkspacePageComponent) {
    const format = this.jsonCopyFormat();
    const text = this.coordsTextModel();
    downloadBlob(
      new Blob([formatJsonForCopy(text, format) ?? text], { type: 'application/json' }),
      'coords.json',
    );
    if (!isStrictJsonFormat(format)) {
      this.toast.show(
        this.translationService.translate('toast.jsonDownloadedNotStrict'),
        'success',
      );
    }
  }

  saveCurrentAsTemplate(this: WorkspacePageComponent) {
    const name = this.templateNameModel().trim();
    if (!name || !this.coords().length) {
      return;
    }

    const savedTemplate = this.templatesService.saveTemplate(name, {
      pages: this.coords(),
      guideSettings: this.guideSettings(),
      guidesEnabled: this.guidesFeatureEnabled(),
    });
    if (!savedTemplate) {
      console.warn('El navegador no soporta almacenamiento local para plantillas.');
      return;
    }

    this.templates.set(this.templatesService.getTemplates());
    this.templateNameModel.set('');
    this.selectedTemplateId.set(savedTemplate.id);
  }

  loadSelectedTemplate(this: WorkspacePageComponent) {
    if (!this.selectedTemplateId()) {
      return;
    }

    const template = this.templates().find((item) => item.id === this.selectedTemplateId());
    if (!template) {
      return;
    }

    this.applyTemplate(template);
  }

  deleteSelectedTemplate(this: WorkspacePageComponent) {
    if (!this.selectedTemplateId() || this.selectedTemplateId() === this.defaultTemplateId) {
      return;
    }

    const templateId = this.selectedTemplateId()!;
    this.templatesService.deleteTemplate(templateId);
    const nextTemplates = this.templatesService.getTemplates();
    this.templates.set(nextTemplates);
    if (!nextTemplates.some((template) => template.id === templateId)) {
      this.selectedTemplateId.set(nextTemplates[0]?.id ?? this.templatesService.defaultTemplateId);
    }
  }

  applyTemplate(this: WorkspacePageComponent, template: AnnotationTemplate) {
    const clonedPages = cloneAnnotationPages(template.pages);
    const nextGuideSettings = cloneGuideSettings(template.guideSettings);

    this.coords.set(clonedPages);
    this.guideSettings.set(nextGuideSettings);
    this.snapPointsXText.set(nextGuideSettings.snapPointsX.join(', '));
    this.snapPointsYText.set(nextGuideSettings.snapPointsY.join(', '));
    this.guidesFeatureEnabled.set(template.guidesEnabled);
    if (template.guidesEnabled || differsFromDefaultGuideSettings(nextGuideSettings)) {
      this.advancedOptionsOpen.set(true);
    }
    this.syncCoordsTextModel();
    this.preview.set(null);
    this.editing.set(null);
    this.refreshOverlay();
    this.redrawAllForPage();
  }

  ensureCoordsFileInput(this: WorkspacePageComponent): HTMLInputElement | null {
    if (this.coordsFileInputFallback) {
      return this.coordsFileInputFallback;
    }

    if (!this.document?.body) {
      return null;
    }

    const input = this.document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.style.display = 'none';
    input.addEventListener('change', this.coordsFileInputChangeHandler);
    this.document.body.appendChild(input);
    this.coordsFileInputFallback = input;
    return input;
  }

  /** Sample-sourced fields are stamped as the mapField unless the person chose the samples. */
  exportText(this: WorkspacePageComponent, field: PageField, useSamples: boolean): string {
    const ctx = this.previewSettings.context();
    const preview = resolveFieldPreview(field, ctx);
    if (useSamples || preview.source !== 'sample') {
      return preview.text;
    }
    return resolveFieldPreview(field, { ...ctx, mode: 'map' }).text;
  }

  async downloadAnnotatedPDF(this: WorkspacePageComponent) {
    if (!this.pdfDoc()) return;
    const sampleFields = this.countSampleFields();
    if (sampleFields > 0) {
      if (this.rememberedExportChoice) {
        await this.runExport(this.rememberedExportChoice === 'sample');
      } else {
        this.exportSamplesPrompt.set(sampleFields);
      }
      return;
    }
    await this.runExport(false);
  }

  async confirmExportSamples(
    this: WorkspacePageComponent,
    result: { choice: 'map' | 'sample'; remember: boolean },
  ) {
    this.exportSamplesPrompt.set(null);
    if (result.remember) {
      this.rememberedExportChoice = result.choice;
    }
    await this.runExport(result.choice === 'sample');
  }

  cancelExportSamples(this: WorkspacePageComponent) {
    this.exportSamplesPrompt.set(null);
  }

  async runExport(this: WorkspacePageComponent, useSamples: boolean) {
    if (!this.pdfDoc()) return;
    try {
      const customFonts = new Map<string, CustomFontEntry>();
      this.customFonts().forEach((fontEntry) => customFonts.set(fontEntry.id, fontEntry));

      const { bytes, sourceBytes } = await this.pdfExportService.exportAnnotatedPdf({
        pdfByteCandidates: await this.getPdfByteCandidates(),
        pages: this.coords(),
        customFonts,
        defaultFontId: DEFAULT_FONT_ID,
        defaultOpacity: DEFAULT_OPACITY,
        styleField: (field) => this.ensureFieldStyle(field),
        renderText: (field) => this.exportText(field, useSamples),
        resolveFont: (fontId) => this.fontCatalog.getFontOptionById(fontId),
      });

      this.rememberPdfBytes(sourceBytes, 3);
      downloadBlob(new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' }), 'annotated.pdf');
    } catch (error) {
      console.error('No se pudo generar el PDF anotado.', error);
      this.toast.error(this.translationService.translate('toast.exportPdfFailed'));
    }
  }

  async getPdfByteCandidates(this: WorkspacePageComponent): Promise<Uint8Array[]> {
    const pdfDoc = this.pdfDoc();
    if (pdfDoc) {
      if (typeof pdfDoc.saveDocument === 'function') {
        try {
          const sanitized = await pdfDoc.saveDocument();
          this.rememberPdfBytes(sanitized, 2);
        } catch (error) {
          console.warn('No se pudo obtener una versión saneada del PDF para exportar.', error);
        }
      }

      try {
        const rawData = await pdfDoc.getData();
        this.rememberPdfBytes(rawData, 1);
      } catch (error) {
        console.warn('No se pudo obtener los bytes originales del PDF para exportar.', error);
      }
    }

    if (this.pdfByteSources.size === 0) {
      return [];
    }

    return Array.from(this.pdfByteSources.values())
      .sort((a, b) => b.weight - a.weight)
      .map((entry) => entry.bytes.slice());
  }

  rememberPdfBytes(
    this: WorkspacePageComponent,
    data?: Uint8Array | ArrayBuffer | null,
    weight = 0,
  ) {
    if (!data) return;
    const typed = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!typed.length) return;
    const head = Array.from(typed.slice(0, 16)).join(',');
    const key = `${typed.length}:${head}`;
    const existing = this.pdfByteSources.get(key);
    if (!existing || weight >= existing.weight) {
      this.pdfByteSources.set(key, { bytes: typed.slice(), weight });
    }
  }

  /**
   * After an explicit import/apply, warns about what was skipped or looks wrong. The import itself
   * is never altered: these are hints so the user can fix the JSON.
   */
  async reportImportIssues(
    this: WorkspacePageComponent,
    report: ImportReport,
    pages: PageAnnotations[],
  ) {
    let outOfPage = 0;
    let missingPages = 0;
    const doc = this.pdfDoc();
    if (doc) {
      for (const page of pages) {
        if (page.num > doc.numPages) {
          missingPages += 1;
          continue;
        }
        const { width, height } = (await doc.getPage(page.num)).getViewport({ scale: 1 });
        outOfPage += page.fields.filter(
          (field) => field.x < 0 || field.y < 0 || field.x > width || field.y > height,
        ).length;
      }
    }

    const t = (key: string, count: number) =>
      this.translationService.translate(`toast.importIssues.${key}`, { count });
    const parts: string[] = [];
    if (report.skippedFields) parts.push(t('skippedFields', report.skippedFields));
    if (report.skippedPages) parts.push(t('skippedPages', report.skippedPages));
    if (missingPages) parts.push(t('missingPages', missingPages));
    if (outOfPage) parts.push(t('outOfPage', outOfPage));
    if (report.fontSizeOutOfRange) parts.push(t('fontSize', report.fontSizeOutOfRange));
    if (report.opacityOutOfRange) parts.push(t('opacity', report.opacityOutOfRange));
    if (report.invalidDateFormat) parts.push(t('dateFormat', report.invalidDateFormat));
    if (!parts.length) {
      return;
    }

    const title = this.translationService.translate('toast.importIssues.title');
    this.toast.warning(`${title} ${parts.join('; ')}.`);
  }

  /** Shows why a JSON import failed, with the line/column when the syntax is at fault. */
  reportJsonImportError(this: WorkspacePageComponent, error: unknown) {
    if (error instanceof LooseJsonError) {
      this.toast.error(
        this.translationService.translate('toast.importJsonFailedAt', {
          line: error.line,
          column: error.column,
        }),
      );
      return;
    }

    const key =
      error instanceof JsonShapeError ? 'toast.importJsonNoPages' : 'toast.importJsonFailed';
    this.toast.error(this.translationService.translate(key));
  }
}
