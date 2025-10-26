// Permite importar workers como URLs
declare module '*.worker?url' {
  const workerUrl: string;
  export default workerUrl;
}

declare module '*.pdf.worker?url' {
  const workerUrl: string;
  export default workerUrl;
}
