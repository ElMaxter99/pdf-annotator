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
  private token = '';

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
