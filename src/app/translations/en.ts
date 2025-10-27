export const enTranslations = {
  header: {
    title: 'PDF Annotator',
    actions: { prev: 'Prev', next: 'Next' },
    pageIndicator: 'Page {{index}} / {{count}}',
    zoomIndicator: 'Zoom {{ value }}×',
    languageLabel: 'Select language',
  },
  actions: {
    clear: 'Clear',
    copy: 'Copy JSON',
    download: 'Download JSON',
    downloadFilename: 'annotations.json',
  },
  lang: {
    es: 'Spanish',
    en: 'English',
    ca: 'Catalan',
  },
  sidebar: {
    title: 'Annotations (JSON)',
  },
  annotation: {
    placeholder: 'Text...',
  },
  viewer: {
    empty:
      'Upload a PDF and click anywhere to add annotations. Edit them in the preview before confirming ✅.',
  },
} as const;
