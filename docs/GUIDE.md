# GUIDE.md · Fuente de la vista de Guía

> Inventario de funciones que alimenta la vista de **Guía** (`/guide` y `/guide/:id`, diseño P-19 a P-23). Cada tema de aquí es un tema de la guía.

## Regla de mantenimiento
Si añades, cambias o quitas una función visible, actualiza **en la misma PR**:
1. el tema correspondiente de este archivo (o crea uno nuevo): título, resumen, pasos, atajos, captura y componente;
2. los datos del tema en `src/app/pages/guide/guide.data.ts` y sus textos `guide.topics.<id>.*` (`title`, `summary`, `s1…sN`, `tip`) en los 7 idiomas (`npm run i18n:check`); el test `guide.data.spec.ts` comprueba que no falte ninguno;
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
Id en `guide.data.ts` · grupo · captura (`public/assets/guide/*.webp`, o esquema) · dónde vive en el código.

| Id | Tema | Grupo | Captura | Componente |
| --- | --- | --- | --- | --- |
| `preview` | Así se ve | Primeros pasos | `preview` | `pages/guide` (vista previa y ventajas) |
| `start` | Empezar | Primeros pasos | `main` | `pages/landing` |
| `workspace` | Espacio de trabajo | Primeros pasos | `workspace` | `pages/workspace` |
| `edit` | Editar una anotación (pines 1–3 sobre la captura) | Editor | `editor` | `annotation-editor` |
| `selection` | Selección y alineación | Editor | esquema | `viewer` (`.selection-bar`) |
| `guides` | Guías y precisión | Editor | `guides` | `sidebar` (Avanzado), `viewer` |
| `json` | JSON en vivo | Editor | `json` | `sidebar` (Anotaciones), `json-tree` |
| `templates` | Plantillas | Editor | esquema | `sidebar` (Plantillas) |
| `samples` | Valores de muestra y datos de prueba | Editor | esquema | `sidebar` (Avanzado), `preview-values.utils` |
| `shortcuts` | Atajos y tema claro | Editor | `shortcuts` | `shortcuts-dialog`, `theme-toggle` |
| `batch` | Modo Lotes (4 pasos; editor A/B con PDF A de referencia y JSON de B con marcas frente a A) | Lotes | esquema | `pages/batch` |
| `export` | Exportar | Más | esquema | `PdfExportService` |

Para regenerar las capturas: `design/tools/capture.mjs` o a mano (1600 × 900, tema oscuro) y convertirlas a `.webp`.
