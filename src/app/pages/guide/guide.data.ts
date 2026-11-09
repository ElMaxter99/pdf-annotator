export type GuideGroup = 'start' | 'editor' | 'batch' | 'more';

export interface GuidePin {
  /** Posición del punto sobre la captura, en % del ancho y del alto. */
  readonly x: number;
  readonly y: number;
}

export interface GuideTopic {
  /** Id estable: forma la ruta `/guide/:id`, las claves `guide.topics.<id>.*` y el tema de `docs/GUIDE.md`. */
  readonly id: string;
  readonly group: GuideGroup;
  /** Captura en `public/assets/guide/`; sin captura se dibuja un esquema. */
  readonly shot?: string;
  readonly steps: 3 | 4;
  /** Teclas literales (no se traducen). */
  readonly shortcuts: readonly string[];
  readonly pins?: readonly GuidePin[];
  readonly icon: 'play' | 'layout' | 'edit' | 'select' | 'ruler' | 'code' | 'copy' | 'flask' | 'key' | 'layers' | 'download';
}

export const GUIDE_TOPICS: readonly GuideTopic[] = [
  { id: 'preview', group: 'start', shot: 'preview', steps: 3, shortcuts: [], icon: 'layout' },
  { id: 'start', group: 'start', shot: 'main', steps: 3, shortcuts: [], icon: 'play' },
  { id: 'workspace', group: 'start', shot: 'workspace', steps: 3, shortcuts: ['B', '← →'], icon: 'layout' },
  {
    id: 'edit',
    group: 'editor',
    shot: 'editor',
    steps: 3,
    shortcuts: ['Enter', 'Esc', 'Ctrl + D', 'Del'],
    pins: [{ x: 50, y: 34 }, { x: 81, y: 62 }, { x: 81, y: 74 }],
    icon: 'edit',
  },
  { id: 'selection', group: 'editor', steps: 3, shortcuts: ['Shift + click', 'Ctrl + A', 'Ctrl + C / V / D', 'Del'], icon: 'select' },
  { id: 'guides', group: 'editor', shot: 'guides', steps: 3, shortcuts: [], icon: 'ruler' },
  { id: 'json', group: 'editor', shot: 'json', steps: 3, shortcuts: [], icon: 'code' },
  { id: 'templates', group: 'editor', steps: 3, shortcuts: [], icon: 'copy' },
  { id: 'samples', group: 'editor', steps: 3, shortcuts: [], icon: 'flask' },
  { id: 'shortcuts', group: 'editor', shot: 'shortcuts', steps: 3, shortcuts: ['?', 'Ctrl + Z', 'Ctrl + Y'], icon: 'key' },
  { id: 'batch', group: 'batch', steps: 4, shortcuts: ['↑ ↓', 'Enter', 'N'], icon: 'layers' },
  { id: 'export', group: 'more', steps: 3, shortcuts: [], icon: 'download' },
];

export const GUIDE_GROUPS: readonly GuideGroup[] = ['start', 'editor', 'batch', 'more'];

/** Trazos SVG (un solo `d` por icono) para las tarjetas sin captura. */
export const GUIDE_ICONS: Record<GuideTopic['icon'], string> = {
  play: 'M8 5v14l11-7z',
  layout: 'M4 4h16v16H4zM9 4v16',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  select: 'M4 4h10v10H4zM10 10h10v10H10z',
  ruler: 'M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  code: 'm8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  key: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M8 14h8',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
};
