import { guideSeen, markGuideSeen } from './first-run.utils';

describe('first-run guides', () => {
  beforeEach(() => localStorage.clear());

  it('starts unseen and remembers each guide on its own', () => {
    expect(guideSeen('steps')).toBeFalse();
    markGuideSeen('steps');
    expect(guideSeen('steps')).toBeTrue();
    expect(guideSeen('hint')).toBeFalse();
  });

  it('does not throw when storage is blocked', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    expect(guideSeen('hint')).toBeFalse();
    expect(() => markGuideSeen('hint')).not.toThrow();
  });
});
