import type { StandardFontName } from './standard-font-families';

export type FontVariantDescriptor =
  | { kind: 'standard'; name: StandardFontName }
  | { kind: 'custom'; fontId: string };
