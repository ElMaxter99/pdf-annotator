import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { APP_NAME } from '../../app-version';

@Injectable({ providedIn: 'root' })
export class AppMetadataService {
  private initialized = false;

  constructor(
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  initialize() {
    if (this.initialized) {
      return;
    }
    const appTitle = `${APP_NAME} | Diseña anotaciones precisas para tus PDFs`;
    const description =
      'Carga un PDF, marca regiones clave y exporta coordenadas listas para integrarlas en tus flujos de trabajo.';
    const fallbackOrigin = 'https://pdf-annotator-rho.vercel.app';
    const documentLocation = this.document?.location;
    const baseUrl = (documentLocation?.origin ?? fallbackOrigin).replace(/\/$/, '');
    const imageUrl = `${baseUrl}/og-image.svg`;

    this.title.setTitle(appTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: appTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:site_name', content: APP_NAME });
    this.meta.updateTag({ property: 'og:url', content: baseUrl });
    this.meta.updateTag({ property: 'og:image', content: imageUrl });
    this.meta.updateTag({
      property: 'og:image:alt',
      content: 'Vista previa de anotaciones en PDF con coordenadas resaltadas',
    });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: appTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: imageUrl });
    this.meta.updateTag({
      name: 'twitter:image:alt',
      content: 'Vista previa de anotaciones en PDF con coordenadas resaltadas',
    });

    this.initialized = true;
  }
}
