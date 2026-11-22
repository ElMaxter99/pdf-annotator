# «Almacenamiento»: qué guarda la app de escritorio y dónde (candidata 1.17)

**Estado: plan, pendiente de que Maxter elija las opciones.** Origen: Maxter, 2026-11-22: «que la app instalada diga en qué ruta está todo (configuración, proyectos…) para que el usuario tenga una transparencia del 100 % de qué carpetas usa y cuánto ocupa en su disco».

## Qué guarda hoy la app de escritorio (inventario verificado en el código)

| # | Qué | Dónde (Windows · macOS · Linux) | Quién lo crea | ¿Se puede vaciar sin perder trabajo? |
| --- | --- | --- | --- | --- |
| 1 | **Programa instalado** | `%LOCALAPPDATA%\Programs\PDF Annotator` · `/Applications/PDF Annotator.app` · AppImage/`/opt/PDF Annotator` | el instalador | No (se desinstala) |
| 2 | **Ajustes de la app**: canal de actualizaciones (`update-channel.json`), carpeta de proyectos (`projects-root.json`), enlace de sincronización (`projects-sync.json`) y su secreto cifrado por el sistema (`projects-sync-secret.bin`), marcadores de versión (`last-run-version`, `just-updated.json`) y el registro de actualizaciones (`update.log`) | `%APPDATA%\PDF Annotator` · `~/Library/Application Support/PDF Annotator` · `~/.config/PDF Annotator` (`app.getPath('userData')`) | `desktop/main.mjs`, `projects-ipc.mjs` | Solo el registro (`update.log`) |
| 3 | **Datos del editor** (dentro de la misma carpeta): lote y última sesión (IndexedDB, con los PDF), plantillas, fuentes propias y preferencias (localStorage) | subcarpetas `IndexedDB` y `Local Storage` de la anterior | la parte web de la app | No sin aviso: borra lotes y plantillas |
| 4 | **Caché del navegador interno** (Chromium): `Cache`, `Code Cache`, `GPUCache` | subcarpetas de la anterior | Electron | Sí: se regenera |
| 5 | **Proyectos** (si se usan) | `Documentos/PDF Annotator` por defecto, o la carpeta que elija la persona; más la carpeta sincronizada si la hay | `projects-ipc.mjs` | No: es trabajo del usuario |
| 6 | **Descargas de actualizaciones** | `%LOCALAPPDATA%\pdf-annotator-desktop-updater\pending` · `~/Library/Caches/pdf-annotator-desktop-updater` · `~/.cache/pdf-annotator-desktop-updater` | electron-updater | Sí (desde la 1.17 se borra sola tras actualizar) |
| 7 | **Temporales de la IA**: una carpeta por petición con las imágenes de las páginas y los textos | carpeta temporal del sistema, `pdfann-ia-*` | `tools/ai-helper/pipeline.mjs` | Sí: se borran al acabar cada petición; solo quedarían restos si se cierra la app a mitad |

## Propuesta (recomendada)
Un apartado **«Almacenamiento»** en el menú ⋯ de la app de escritorio (junto a «Versión y actualizaciones»). Abre un panel con una fila por cada elemento de la tabla:

```
Almacenamiento                                         Total en tu disco: 412 MB
──────────────────────────────────────────────────────────────────────────────
Programa instalado        C:\Users\…\Programs\PDF Annotator        310 MB  [Abrir carpeta]
Ajustes de la app         C:\Users\…\AppData\Roaming\PDF Annotator  1 MB   [Abrir] [Copiar ruta]
Lotes, sesión y plantillas  (dentro de la anterior)                 64 MB   [Abrir]
Caché del navegador interno                                         28 MB   [Vaciar]
Proyectos                 C:\Users\…\Documentos\PDF Annotator       9 MB    [Abrir]
Descargas de actualizaciones                                        0 MB    [Vaciar]
Temporales de la IA       (se borran solos)                         0 MB    [Vaciar]
```

- **Ruta completa y tamaño** de cada carpeta, con «Abrir carpeta» (explorador del sistema) y «Copiar ruta».
- **«Vaciar» solo en lo que se regenera** (caché, descargas de actualizaciones y temporales de la IA), con confirmación. Lo demás no se puede borrar desde aquí: es trabajo del usuario.
- Los **tamaños se calculan al abrir el panel**, en segundo plano, con un «Calculando…» por fila; una carpeta enorme no bloquea la app.
- **Seguridad:** el proceso principal decide las rutas (lista cerrada). La parte web solo pide «dame el inventario» o «vacía la caché n.º 4»; nunca manda una ruta. Las rutas no salen del equipo.
- **En la web** (Vercel/Docker) no hay disco que mostrar. Opcional: una línea «Datos guardados en este navegador: ≈ N MB» (`navigator.storage.estimate()`) con el aviso de que se borran con los datos del sitio.

## Preguntas para Maxter
1. **Dónde vive:** apartado propio en el menú ⋯ (**recomendado**) o dentro de «Versión y actualizaciones».
2. **«Vaciar»:** solo caché, descargas y temporales de la IA (**recomendado**), o también un «Borrar todos los datos de la app» con doble confirmación.
3. **Web:** añadir la línea de lo guardado en el navegador (**recomendado**, es pequeño) o solo escritorio.
4. **Diseño:** mesa en el lienzo o «sin mesas» como las últimas tareas.

## Archivos que tocaría (tras la aprobación)
- `desktop/storage.mjs` nuevo (inventario y tamaños, con pruebas) e IPC `desktop:storage:list` / `desktop:storage:clear` en `main.mjs` + `preload.cjs`.
- Componente `components/storage-panel` y su entrada en el menú ⋯ (`components/header`), claves `storage.*` en los 7 idiomas.
- e2e con el puente de escritorio simulado (como `update-channel.spec.ts`), README (sección de escritorio) y `docs/ARCHITECTURE.md` §10b.
