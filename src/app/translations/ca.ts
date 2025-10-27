export const caTranslations = {
  header: {
    title: 'Anotador de PDF',
    actions: { prev: 'Anterior', next: 'Següent' },
    pageIndicator: 'Pàgina {{index}} / {{count}}',
    zoomIndicator: 'Zoom {{ value }}×',
    languageLabel: "Selecciona l'idioma",
  },
  actions: {
    clear: 'Netejar',
    copy: 'Copiar JSON',
    download: 'Descarregar JSON',
    downloadFilename: 'anotacions.json',
  },
  lang: {
    es: 'Castellà',
    en: 'Anglès',
    ca: 'Català',
  },
  sidebar: {
    title: 'Anotacions (JSON)',
  },
  annotation: {
    placeholder: 'Text...',
  },
  viewer: {
    empty:
      'Puja un PDF i fes clic a qualsevol lloc per afegir anotacions. Edita-les a la previsualització abans de confirmar ✅.',
  },
} as const;
