export function isPdfFile(file: File): boolean {
  if (!file.type) {
    return file.name.toLowerCase().endsWith('.pdf');
  }

  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
