import { Injectable, signal } from '@angular/core';
import { AiDetails, AiLiveEvent, AiResult, parseNdjson } from '../utils/ai-proposal.utils';
import { getDesktopBridge } from './desktop-update.service';

export type AiProvider = 'claude' | 'copilot' | 'fake';
export type AiConnection = 'unknown' | 'checking' | 'offline' | 'noCli' | 'ready';

export interface AiProgress {
  stage: 'reading' | 'asking' | 'resolving';
  attempt?: number;
}

export class AiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly reset: string | null = null,
    readonly details: AiDetails | null = null,
  ) {
    super(message);
  }
}

/** A model as the CLI itself lists it (the same list as its /model command). */
export interface AiModel {
  id: string;
  name: string;
  description: string;
  group: string;
}

export interface AiModelList {
  models: AiModel[];
  /** When the list was read (ms), `null` if never. */
  at: number | null;
  loading: boolean;
  /** `auth`, `missing`, `timeout`, `offline` or `cli_error` when the last read failed. */
  error: string | null;
}

const EMPTY_LIST: AiModelList = { models: [], at: null, loading: false, error: null };

/** Lists come from localStorage or the helper: never trusted, always rebuilt field by field. */
export function normalizeModels(raw: unknown): AiModel[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const out: AiModel[] = [];
  for (const item of raw.slice(0, 80)) {
    const m = (item ?? {}) as Record<string, unknown>;
    const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const id = str(m['id'], 60);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({ id, name: str(m['name'], 60) || id, description: str(m['description'], 120), group: str(m['group'], 30) });
  }
  return out;
}

const DEFAULT_PORT = 4310;

function helperBase(): string {
  const port = getDesktopBridge()?.helperPort;
  return `http://127.0.0.1:${Number.isInteger(port) && (port as number) > 0 ? port : DEFAULT_PORT}`;
}
const KEYS = {
  provider: 'pdf-annotator.ai.provider',
  models: 'pdf-annotator.ai.models',
  consent: 'pdf-annotator.ai.consent',
  retry: 'pdf-annotator.ai.retry',
  modelLists: 'pdf-annotator.ai.modelLists',
} as const;
/** Cheap by default: the task (match labels, move fields) does not need the biggest model. */
/** A second request doubles the cost with Copilot (premium requests), so it is off there by default. */
export const DEFAULT_RETRY: Record<string, boolean> = { claude: true, copilot: false, fake: true };
export const DEFAULT_MODELS: Record<string, string> = { claude: 'sonnet', copilot: '', fake: '' };

function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    /* private mode: the choice just is not remembered */
  }
}

export function isLocalOrigin(host: string | undefined = globalThis.location?.hostname): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Talks to the local helper (`npm run start:ia`) that runs the user's own `claude` or `copilot`. Never a remote service. */
@Injectable({ providedIn: 'root' })
export class AiHelperService {
  readonly connection = signal<AiConnection>('unknown');
  readonly found = signal<Record<string, boolean>>({});
  readonly provider = signal<AiProvider>(this.initialProvider());
  readonly models = signal<Record<string, string>>(this.initialModels());
  readonly retry = signal<Record<string, boolean>>(this.initialRetry());
  readonly consent = signal(read(KEYS.consent) === '1');
  /** Models each CLI offers, per provider. The last list read is remembered so it shows at once next time. */
  readonly modelLists = signal<Record<string, AiModelList>>(this.initialModelLists());
  /** Set when the saved model is no longer offered and the choice went back to a valid one. */
  readonly modelRetired = signal<{ provider: string; model: string } | null>(null);
  private token = '';
  private loadingModels = new Map<string, Promise<void>>();

  private initialModelLists(): Record<string, AiModelList> {
    const lists: Record<string, AiModelList> = {};
    try {
      const stored = JSON.parse(read(KEYS.modelLists) ?? '{}') as Record<string, { at?: unknown; models?: unknown }>;
      for (const key of ['claude', 'copilot']) {
        const models = normalizeModels(stored[key]?.models);
        if (models.length) {
          lists[key] = { ...EMPTY_LIST, models, at: typeof stored[key]?.at === 'number' ? (stored[key].at as number) : null };
        }
      }
    } catch {
      /* corrupt value: no cache */
    }
    return lists;
  }

  modelList(provider: AiProvider): AiModelList {
    return this.modelLists()[provider] ?? EMPTY_LIST;
  }

  private patchList(provider: string, patch: Partial<AiModelList>): void {
    this.modelLists.update((all) => ({ ...all, [provider]: { ...(all[provider] ?? EMPTY_LIST), ...patch } }));
  }

  /**
   * Asks the helper for the models the provider's CLI offers (like its /model). The last known list stays
   * visible while it reloads or if the read fails. A saved model that is no longer offered goes back to a valid one.
   */
  loadModels(provider: AiProvider, force = false): Promise<void> {
    const running = this.loadingModels.get(provider);
    if (running) {
      return running;
    }
    const recent = this.modelList(provider).at;
    if (!force && recent !== null && Date.now() - recent < 30_000) {
      return Promise.resolve();
    }
    const task = this.readModels(provider).finally(() => this.loadingModels.delete(provider));
    this.loadingModels.set(provider, task);
    return task;
  }

  private async readModels(provider: AiProvider): Promise<void> {
    this.patchList(provider, { loading: true, error: null });
    try {
      if (!this.token) {
        await this.check();
      }
      if (!this.token) {
        throw new AiRequestError('offline', 'offline');
      }
      const response = await fetch(`${helperBase()}/models?provider=${provider}`, {
        headers: { 'x-ai-token': this.token },
        cache: 'no-store',
      });
      const data = (await response.json()) as { models?: unknown; error?: { code?: unknown } };
      if (!response.ok) {
        const code = typeof data.error?.code === 'string' ? data.error.code : 'cli_error';
        throw new AiRequestError(code, code);
      }
      const models = normalizeModels(data.models);
      this.patchList(provider, { models, at: Date.now(), loading: false, error: null });
      write(
        KEYS.modelLists,
        JSON.stringify(
          Object.fromEntries(
            Object.entries(this.modelLists())
              .filter(([key, list]) => key !== 'fake' && list.models.length)
              .map(([key, list]) => [key, { at: list.at, models: list.models }]),
          ),
        ),
      );
      this.checkSavedModel(provider, models);
    } catch (error) {
      const code = error instanceof AiRequestError ? error.code : 'offline';
      this.patchList(provider, { loading: false, error: code });
    }
  }

  /** The saved model must be one the CLI offers now; «Automático» (empty) is always valid for Copilot. */
  private checkSavedModel(provider: AiProvider, models: AiModel[]): void {
    const saved = this.models()[provider] ?? '';
    if (!models.length || !saved || models.some((m) => m.id === saved)) {
      return;
    }
    this.modelRetired.set({ provider, model: saved });
    this.setModel(provider, models.some((m) => m.id === DEFAULT_MODELS[provider]) ? DEFAULT_MODELS[provider] : '');
  }

  private initialProvider(): AiProvider {
    const stored = read(KEYS.provider);
    return stored === 'copilot' || stored === 'fake' ? stored : 'claude';
  }

  private initialModels(): Record<string, string> {
    const models = { ...DEFAULT_MODELS };
    try {
      const stored = JSON.parse(read(KEYS.models) ?? '{}') as Record<string, unknown>;
      for (const key of Object.keys(models)) {
        if (typeof stored[key] === 'string') {
          models[key] = (stored[key] as string).slice(0, 60);
        }
      }
    } catch {
      /* corrupt value: defaults */
    }
    return models;
  }

  private initialRetry(): Record<string, boolean> {
    const retry = { ...DEFAULT_RETRY };
    try {
      const stored = JSON.parse(read(KEYS.retry) ?? '{}') as Record<string, unknown>;
      for (const key of Object.keys(retry)) {
        if (typeof stored[key] === 'boolean') {
          retry[key] = stored[key] as boolean;
        }
      }
    } catch {
      /* corrupt value: defaults */
    }
    return retry;
  }

  setRetry(provider: AiProvider, value: boolean): void {
    this.retry.update((all) => ({ ...all, [provider]: value }));
    write(KEYS.retry, JSON.stringify(this.retry()));
  }

  setProvider(provider: AiProvider): void {
    this.provider.set(provider);
    write(KEYS.provider, provider);
    this.refreshConnection();
  }

  setModel(provider: AiProvider, model: string): void {
    this.models.update((all) => ({ ...all, [provider]: model.trim().slice(0, 60) }));
    write(KEYS.models, JSON.stringify(this.models()));
  }

  acceptConsent(remember: boolean): void {
    this.consent.set(true);
    if (remember) {
      write(KEYS.consent, '1');
    }
  }

  private refreshConnection(): void {
    if (this.connection() === 'ready' || this.connection() === 'noCli') {
      this.connection.set(this.found()[this.provider()] ? 'ready' : 'noCli');
    }
  }

  /**
   * Silent probe on load: only when the app itself is served from this machine. From a public site,
   * calling 127.0.0.1 makes Chrome ask for «local network access», so there it waits for an explicit click.
   */
  checkIfLocal(): void {
    if (this.connection() !== 'unknown') {
      return;
    }
    if (getDesktopBridge() !== null) {
      void this.checkWhenHelperStarts();
    } else if (isLocalOrigin()) {
      void this.check();
    }
  }

  /** In the desktop app the helper starts together with the window: retry for a few seconds before giving up. */
  private async checkWhenHelperStarts(): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt++) {
      await this.check();
      if (this.connection() !== 'offline') {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  /** Asks the helper which programs it finds. */
  async check(): Promise<void> {
    this.connection.set('checking');
    try {
      const response = await fetch(`${helperBase()}/status`, { cache: 'no-store' });
      const data = (await response.json()) as {
        token?: string;
        providers?: Record<string, { found?: boolean }>;
      };
      this.token = typeof data.token === 'string' ? data.token : '';
      const found: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(data.providers ?? {})) {
        found[key] = value?.found === true;
      }
      this.found.set(found);
      this.connection.set(found[this.provider()] ? 'ready' : 'noCli');
    } catch {
      this.token = '';
      this.found.set({});
      this.connection.set('offline');
    }
  }

  async propose(
    args: { a: Blob; b: Blob; template: unknown },
    onProgress: (p: AiProgress) => void,
    signal: AbortSignal,
    onEvent: (event: AiLiveEvent) => void = () => undefined,
  ): Promise<AiResult> {
    const provider = this.provider();
    const body = JSON.stringify({
      provider,
      model: this.models()[provider] || undefined,
      retry: this.retry()[provider] !== false,
      a: await toBase64(args.a),
      b: await toBase64(args.b),
      template: args.template,
    });
    let response: Response;
    try {
      response = await fetch(`${helperBase()}/propose`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ai-token': this.token },
        body,
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new AiRequestError('aborted', 'Cancelado.');
      }
      this.connection.set('offline');
      throw new AiRequestError('offline', String((error as Error)?.message ?? error));
    }
    if (response.status === 409) {
      throw new AiRequestError('busy', 'El ayudante ya está atendiendo otra petición.');
    }
    if (!response.ok || !response.body) {
      throw new AiRequestError('cli_error', `El ayudante respondió ${response.status}.`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseNdjson(buffer);
        buffer = parsed.rest;
        for (const message of parsed.messages) {
          if ('stage' in message) {
            onProgress({ stage: message.stage, attempt: message.n });
          } else if ('event' in message) {
            onEvent(message.event);
          } else if ('result' in message) {
            return message.result;
          } else {
            throw new AiRequestError(message.error.code, message.error.message, message.error.reset, message.error.details ?? null);
          }
        }
      }
    } catch (error) {
      if (error instanceof AiRequestError) {
        throw error;
      }
      if (signal.aborted) {
        throw new AiRequestError('aborted', 'Cancelado.');
      }
      this.connection.set('offline');
      throw new AiRequestError('offline', String((error as Error)?.message ?? error));
    }
    throw new AiRequestError('bad_response', 'La respuesta del ayudante terminó sin resultado.');
  }
}
