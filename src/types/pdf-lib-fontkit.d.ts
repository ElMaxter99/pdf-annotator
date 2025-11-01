export {};

declare module '@pdf-lib/fontkit' {
  export type PdfLibFontkit = {
    create: (...args: unknown[]) => unknown;
    logErrors: (enable?: boolean) => void;
    registerFormat: (...args: unknown[]) => void;
  };

  const fontkit: PdfLibFontkit;
  export default fontkit;
}
