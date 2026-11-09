# GUIDE.md · Fuente de la vista de Guía

> **Borrador (propuesta P-19 a P-23 del lienzo, pendiente de aprobación).** Aún no hay vista de Guía en la app. Este archivo ya es la lista viva de funciones: cuando se implemente la vista, cada tema de aquí se convierte en una página de la guía.

## Regla de mantenimiento
Si añades, cambias o quitas una función visible, actualiza **en la misma PR**:
1. el tema correspondiente de este archivo (o crea uno nuevo): título, resumen, pasos, atajos, captura y componente;
2. las claves `guide.<id>.*` en los 7 idiomas (`npm run i18n:check`);
3. la captura (`screenshots/…`) si cambia lo que se ve.

Los textos que ve el usuario viven en los JSON de traducción; este archivo es el inventario y el contexto para personas y para la IA.

## Formato de un tema
```
## <id-en-kebab-case>
- título · grupo (Primeros pasos | Editor | Lotes | Más) · resumen (1 frase)
- captura: ruta en screenshots/ (o «esquema» si es un dibujo)
- pasos: lista corta, imperativo
- atajos: teclas relacionadas
- componente: dónde vive en el código · desde: versión
```

## Temas

## empezar
- Empezar · Primeros pasos · Abre un PDF, pon tu primera anotación y exporta.
- captura: `screenshots/main.png`
- pasos: suelta o elige un PDF (o «Probar con un documento de ejemplo»); haz clic sobre la página; descarga el JSON o el PDF.
- componente: `pages/landing` · desde: 1.0.0

## espacio-de-trabajo
- Espacio de trabajo · Primeros pasos · Cabecera, panel lateral con 4 pestañas (Documento, Anotaciones, Plantillas, Avanzado) y visor.
- captura: `screenshots/workspace.png`
- atajos: `B` minimiza el panel; ←/→ cambian de pestaña.
- componente: `pages/workspace` · desde: 1.0.0

## editar-anotacion
- Editar una anotación · Editor · Texto o mapeo, tipo, valor fijo, decimales, tamaño, opacidad, fuente, fondo y color.
- captura: `screenshots/example_use.png`
- pasos: clic sobre el PDF; escribe el texto o `mapField`; ajusta fuente, tamaño y color; confirma.
- atajos: Intro, Esc, Ctrl+D (duplicar), Supr.
- componente: `annotation-editor` · desde: 1.0.0

## seleccion-multiple
- Selección y alineación · Editor · Shift+clic o recuadro; alinear, distribuir, duplicar y borrar a la vez.
- captura: esquema (hay captura de V-13 en el lienzo)
- atajos: Shift/Ctrl+clic, Ctrl+A, flechas, Ctrl+C/V/D, Supr.
- componente: `viewer` (`.selection-bar`) · desde: 1.4.0

## guias-y-precision
- Guías y precisión · Editor · Rejilla, reglas en puntos PDF, imán y líneas de alineación.
- captura: `screenshots/guides.png`
- pasos: Avanzado → Activar guías y snapping.
- componente: `sidebar` (Avanzado), `viewer` · desde: 1.2.0

## json-en-vivo
- JSON en vivo · Editor · Texto o árbol, sincronizado con el visor; importar, copiar y descargar.
- captura: `screenshots/json-tree.png`
- componente: `sidebar` (Anotaciones), `json-tree` · desde: 1.0.0

## plantillas
- Plantillas · Editor · Guarda conjuntos de anotaciones y recárgalos en otros PDF (en `localStorage`).
- componente: `sidebar` (Plantillas) · desde: 1.1.0

## valores-de-muestra-y-datos-de-prueba
- Valores de muestra y datos de prueba · Editor · Previsualiza con `XXXXX`, con el mapeo o con un JSON de prueba.
- captura: esquema (mesas P-11 a P-15)
- componente: `sidebar` (Avanzado), `preview-values.utils` · desde: PR #154

## atajos-y-tema
- Atajos y tema claro · Editor · Pulsa `?` para ver todos los atajos; el tema se cambia en la cabecera.
- captura: `screenshots/shortcuts.png`, `screenshots/light.png`
- componente: `shortcuts-dialog`, `theme-toggle` · desde: 1.1.0

## lotes
- Modo Lotes · Lotes · De 2 a 50 PDF con plantillas JSON: cargar, emparejar por `pdfName`, comparar original y nuevo, descargar.
- captura: esquema (mesas R-04 a R-07 y P-03 a P-09)
- componente: `/batch/*` · desde: PR #154

## exportar
- Exportar · Más · JSON (`coords.json`) o PDF anotado con fuentes estándar o propias.
- componente: `PdfExportService` · desde: 1.0.0

## privacidad
- Privacidad · Más · El PDF no sale del navegador; no hay servidor ni cuentas.
- componente: — · desde: 1.0.0
