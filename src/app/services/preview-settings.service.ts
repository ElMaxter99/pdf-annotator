import { Injectable, computed, signal } from '@angular/core';
import { LooseJsonError, parseLooseJson } from '../utils/loose-json';
import {
  DEFAULT_SAMPLE_VALUES,
  normalizeSampleValues,
  type PreviewContext,
  type PreviewMode,
  type SampleKind,
  type SampleValues,
} from '../utils/preview-values.utils';

const SAMPLES_KEY = 'pdf-annotator.sampleValues';
const DATA_KEY = 'pdf-annotator.testData';
const MODE_KEY = 'pdf-annotator.previewMode';
const ORIGIN_KEY = 'pdf-annotator.showOrigin';
export const MAX_TEST_DATA_BYTES = 5 * 1024 * 1024;

export interface TestDataError {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

/**
 * Global preview settings: sample values per annotation type, the optional test-data JSON and the
 * view mode. Saved values live in the browser and are read as untrusted.
 */
@Injectable({ providedIn: 'root' })
export class PreviewSettingsService {
  readonly samples = signal<SampleValues>(this.loadSamples());
  readonly testDataText = signal<string>(this.loadText());
  readonly mode = signal<PreviewMode>(this.loadMode());
  readonly showOrigin = signal<boolean>(this.loadFlag(ORIGIN_KEY));

  private readonly parsed = computed<{ data: unknown | null; error: TestDataError | null }>(() => {
    const text = this.testDataText();
    if (!text.trim()) {
      return { data: null, error: null };
    }
    if (text.length > MAX_TEST_DATA_BYTES) {
      return { data: null, error: { message: 'size' } };
    }
    try {
      const data = parseLooseJson(text);
      if (data === null || typeof data !== 'object') {
        return { data: null, error: { message: 'shape' } };
      }
      return { data, error: null };
    } catch (error) {
      if (error instanceof LooseJsonError) {
        return {
          data: null,
          error: { message: 'syntax', line: error.line, column: error.column },
        };
      }
      return { data: null, error: { message: 'syntax' } };
    }
  });

  readonly testData = computed(() => this.parsed().data);
  readonly testDataError = computed(() => this.parsed().error);
  readonly hasTestData = computed(() => this.parsed().data !== null);

  readonly context = computed<PreviewContext>(() => ({
    mode: this.mode() === 'data' && !this.hasTestData() ? 'sample' : this.mode(),
    samples: this.samples(),
    data: this.testData(),
  }));

  setMode(mode: PreviewMode): void {
    this.mode.set(mode);
    this.save(MODE_KEY, mode);
  }

  setShowOrigin(show: boolean): void {
    this.showOrigin.set(show);
    this.save(ORIGIN_KEY, show ? '1' : '0');
  }

  setSample(kind: SampleKind, value: string): void {
    const next = normalizeSampleValues({ ...this.samples(), [kind]: value });
    this.samples.set(next);
    this.save(SAMPLES_KEY, JSON.stringify(next));
  }

  resetSample(kind: SampleKind): void {
    this.setSample(kind, DEFAULT_SAMPLE_VALUES[kind]);
  }

  setTestDataText(text: string): void {
    const hadData = this.hasTestData();
    this.testDataText.set(text);
    // Valid data that was not there before is what the user wants to see: switch from the samples to it.
    if (!hadData && this.hasTestData() && this.mode() === 'sample') {
      this.setMode('data');
    }
    this.save(DATA_KEY, text.length <= MAX_TEST_DATA_BYTES ? text : '');
    if (!text.trim() && this.mode() === 'data') {
      this.setMode('sample');
    }
  }

  clearTestData(): void {
    this.setTestDataText('');
  }

  private loadSamples(): SampleValues {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SAMPLES_KEY) : null;
      return normalizeSampleValues(raw ? JSON.parse(raw) : null);
    } catch {
      return DEFAULT_SAMPLE_VALUES;
    }
  }

  private loadFlag(key: string): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  private loadMode(): PreviewMode {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MODE_KEY) : null;
      return raw === 'map' || raw === 'data' ? raw : 'sample';
    } catch {
      return 'sample';
    }
  }

  private loadText(): string {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DATA_KEY) : null;
      return typeof raw === 'string' && raw.length <= MAX_TEST_DATA_BYTES ? raw : '';
    } catch {
      return '';
    }
  }

  private save(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      /* storage unavailable or full: the setting just lasts for this session */
    }
  }
}
