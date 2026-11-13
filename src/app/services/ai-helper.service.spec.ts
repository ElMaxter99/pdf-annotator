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
