import { shouldLoadVercelInsights } from './vercel-insights.utils';

describe('shouldLoadVercelInsights', () => {
  it('carga en un despliegue de Vercel', () => {
    expect(shouldLoadVercelInsights('pdf-annotator-rho.vercel.app', false)).toBeTrue();
    expect(shouldLoadVercelInsights('PDF-Annotator-git-develop.vercel.app.', false)).toBeTrue();
  });

  it('no carga en local, Docker ni en la app de escritorio', () => {
    expect(shouldLoadVercelInsights('localhost', false)).toBeFalse();
    expect(shouldLoadVercelInsights('127.0.0.1', false)).toBeFalse();
    expect(shouldLoadVercelInsights('intranet.example.com', false)).toBeFalse();
    expect(shouldLoadVercelInsights('pdf-annotator-rho.vercel.app', true)).toBeFalse();
  });

  it('no se deja engañar por hosts parecidos', () => {
    expect(shouldLoadVercelInsights('vercel.app', false)).toBeFalse();
    expect(shouldLoadVercelInsights('.vercel.app', false)).toBeFalse();
    expect(shouldLoadVercelInsights('evil-vercel.app.example.com', false)).toBeFalse();
  });
});
