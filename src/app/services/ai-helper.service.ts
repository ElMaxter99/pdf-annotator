import { Injectable, signal } from '@angular/core';
import { AiResult, parseNdjson } from '../utils/ai-proposal.utils';

export type AiProvider = 'claude' | 'copilot' | 'fake';
export type AiConnection = 'unknown' | 'checking' | 'offline' | 'noCli' | 'ready';

export interface AiProgress {
  stage: 'reading' | 'asking' | 'resolving';
}

export class AiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly reset: string | null = null,
  ) {
    super(message);
  }
}

const BASE = 'http://127.0.0.1:4310';
const KEYS = {
  provider: 'pdf-annotator.ai.provider',
  models: 'pdf-annotator.ai.models',
  consent: 'pdf-annotator.ai.consent',
} as const;
/** Cheap by default: the task (match labels, move fields) does not need the biggest model. */
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

  /** Asks the helper which programs it finds. */
  async check(): Promise<void> {
    this.connection.set('checking');
    try {
      const response = await fetch(`${BASE}/status`, { cache: 'no-store' });
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
  ): Promise<AiResult> {
    const provider = this.provider();
    const body = JSON.stringify({
      provider,
      model: this.models()[provider] || undefined,
      a: await toBase64(args.a),
      b: await toBase64(args.b),
      template: args.template,
    });
    let response: Response;
    try {
      response = await fetch(`${BASE}/propose`, {
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
            onProgress({ stage: message.stage });
          } else if ('result' in message) {
            return message.result;
          } else {
            throw new AiRequestError(message.error.code, message.error.message, message.error.reset);
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
