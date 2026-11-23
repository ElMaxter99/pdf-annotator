import { AiHelperService, isLocalOrigin, normalizeModels } from './ai-helper.service';

describe('isLocalOrigin', () => {
  it('accepts loopback hosts only', () => {
    expect(isLocalOrigin('localhost')).toBeTrue();
    expect(isLocalOrigin('127.0.0.1')).toBeTrue();
    expect(isLocalOrigin('pdf-annotator-rho.vercel.app')).toBeFalse();
    expect(isLocalOrigin('')).toBeFalse();
  });
});

describe('model lists', () => {
  beforeEach(() => localStorage.clear());

  it('normalizeModels rebuilds untrusted lists', () => {
    const list = normalizeModels([
      { id: 'a', name: 'A', description: 'd', group: 'g' },
      { id: 'a', name: 'dup' },
      { id: '', name: 'sin id' },
      { id: 'b' },
      null,
      { id: 5 },
    ]);
    expect(list.map((m) => m.id)).toEqual(['a', 'b']);
    expect(list[1].name).toBe('b');
    expect(normalizeModels('x')).toEqual([]);
  });

  function serviceWith(response: () => Promise<Response>, models: Record<string, string> = {}): AiHelperService {
    localStorage.setItem('pdf-annotator.ai.models', JSON.stringify(models));
    const service = new AiHelperService();
    spyOn(service, 'check').and.resolveTo();
    (service as unknown as { token: string }).token = 't';
    spyOn(globalThis, 'fetch').and.callFake(response);
    return service;
  }
  const ok = (models: unknown) => () => Promise.resolve(new Response(JSON.stringify({ models }), { status: 200 }));

  it('loads and remembers the list', async () => {
    const service = serviceWith(ok([{ id: 'sonnet', name: 'Sonnet 5.5' }]));
    await service.loadModels('claude');
    expect(service.modelList('claude').models.map((m) => m.id)).toEqual(['sonnet']);
    expect(localStorage.getItem('pdf-annotator.ai.modelLists')).toContain('Sonnet 5.5');
    expect(new AiHelperService().modelList('claude').models.length).toBe(1);
  });

  it('a saved model that is gone goes back to the default and says so', async () => {
    const service = serviceWith(ok([{ id: 'sonnet', name: 'Sonnet' }]), { claude: 'claude-fable-5-1' });
    await service.loadModels('claude');
    expect(service.models()['claude']).toBe('sonnet');
    expect(service.modelRetired()).toEqual({ provider: 'claude', model: 'claude-fable-5-1' });
  });

  it('Copilot «Automático» (empty) is always valid', async () => {
    const service = serviceWith(ok([{ id: 'gpt-6.1-sol', name: 'x' }]), { copilot: '' });
    await service.loadModels('copilot');
    expect(service.modelRetired()).toBeNull();
  });

  it('an error keeps the last list and reports the code', async () => {
    const service = serviceWith(ok([{ id: 'sonnet', name: 'Sonnet' }]));
    await service.loadModels('claude');
    (globalThis.fetch as jasmine.Spy).and.resolveTo(new Response(JSON.stringify({ error: { code: 'auth' } }), { status: 502 }));
    await service.loadModels('claude', true);
    expect(service.modelList('claude').error).toBe('auth');
    expect(service.modelList('claude').models.length).toBe(1);
    expect(service.modelRetired()).toBeNull();
  });

  it('an empty list does not touch the saved model', async () => {
    const service = serviceWith(ok([]), { claude: 'opus' });
    await service.loadModels('claude');
    expect(service.models()['claude']).toBe('opus');
  });
});

describe('request limit (Opciones)', () => {
  beforeEach(() => localStorage.clear());

  it('starts with 10 for Copilot and no limit for Claude Code', () => {
    const service = new AiHelperService();
    expect(service.limitFor('copilot')).toBe(10);
    expect(service.limitFor('claude')).toBeNull();
  });

  it('remembers a limit and reads stored values as untrusted', () => {
    const service = new AiHelperService();
    service.setLimit('copilot', 50);
    service.setLimit('claude', 25);
    expect(new AiHelperService().limitFor('copilot')).toBe(50);
    expect(new AiHelperService().limitFor('claude')).toBe(25);
    service.setLimit('copilot', null);
    expect(new AiHelperService().limitFor('copilot')).toBeNull();
    localStorage.setItem('pdf-annotator.ai.limits', JSON.stringify({ copilot: 99999, claude: 'x' }));
    const fresh = new AiHelperService();
    expect(fresh.limitFor('copilot')).toBe(10);
    expect(fresh.limitFor('claude')).toBeNull();
  });

  it('restores provider, model and limits of fábrica', () => {
    const service = new AiHelperService();
    service.setProvider('copilot');
    service.setLimit('copilot', 100);
    service.resetDefaults();
    expect(service.provider()).toBe('claude');
    expect(service.limitFor('copilot')).toBe(10);
  });
});
