export const esTranslations = {
  header: {
    title: 'Anotador de PDF',
    actions: { prev: 'Anterior', next: 'Siguiente' },
    pageIndicator: 'Página {{index}} / {{count}}',
    zoomIndicator: 'Zoom {{ value }}×',
    languageLabel: 'Seleccionar idioma',
  },
  actions: {
    clear: 'Limpiar',
    copy: 'Copiar JSON',
    download: 'Descargar JSON',
    downloadFilename: 'anotaciones.json',
  },
  lang: {
    es: 'Español',
    en: 'Inglés',
    ca: 'Catalán',
  },
  sidebar: {
    title: 'Anotaciones (JSON)',
  },
  annotation: {
    placeholder: 'Texto...',
  },
  viewer: {
    empty:
      'Sube un PDF y haz clic donde quieras añadir anotaciones. Edítalas en la vista previa antes de confirmar ✅.',
  },
} as const;
