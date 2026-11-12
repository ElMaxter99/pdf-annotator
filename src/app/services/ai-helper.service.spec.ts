import { isLocalOrigin } from './ai-helper.service';

describe('isLocalOrigin', () => {
  it('accepts loopback hosts only', () => {
    expect(isLocalOrigin('localhost')).toBeTrue();
    expect(isLocalOrigin('127.0.0.1')).toBeTrue();
    expect(isLocalOrigin('pdf-annotator-rho.vercel.app')).toBeFalse();
    expect(isLocalOrigin('')).toBeFalse();
  });
});
