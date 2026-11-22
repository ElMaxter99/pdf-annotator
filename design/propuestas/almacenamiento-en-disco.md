# «Almacenamiento»: qué guarda la app de escritorio y dónde (candidata 1.18)

**Estado: análisis cerrado por Claude con las decisiones de Maxter (2026-11-22). Falta la mesa en el lienzo antes de programar** (anotado en [`../PENDIENTE-MESAS.md`](../PENDIENTE-MESAS.md)). Origen: Maxter: «que la app instalada diga en qué ruta está todo (configuración, proyectos…) para que el usuario tenga una transparencia del 100 % de qué carpetas usa y cuánto ocupa en su disco».

**Decidido:** solo en la app de escritorio. La web no lo lleva (Maxter: «en la web no tiene sentido»).

## 1. Qué guarda hoy la app de escritorio (inventario verificado en el código)

| # | Qué | Dónde (Windows · macOS · Linux) | Quién lo crea |
| --- | --- | --- | --- |
| 1 | **Programa instalado** | `%LOCALAPPDATA%\Programs\PDF Annotator` · `/Applications/PDF Annotator.app` · AppImage o `/opt/PDF Annotator` | el instalador |
| 2 | **Ajustes**: canal de actualizaciones (`update-channel.json`), carpeta de proyectos (`projects-root.json`), enlace de sincronización (`projects-sync.json`) y su secreto cifrado por el sistema (`projects-sync-secret.bin`), marcadores de versión (`last-run-version`, `just-updated.json`) | `%APPDATA%\PDF Annotator` · `~/Library/Application Support/PDF Annotator` · `~/.config/PDF Annotator` (`app.getPath('userData')`) | `desktop/main.mjs`, `projects-ipc.mjs` |
| 3 | **Registro de actualizaciones** (`update.log`) | la misma carpeta | `desktop/main.mjs` |
| 4 | **Datos del editor**: lote y última sesión con sus PDF (IndexedDB), plantillas, fuentes propias y preferencias (localStorage) | subcarpetas `IndexedDB` y `Local Storage` de la misma carpeta | la parte web de la app |
| 5 | **Caché del navegador interno** (Chromium): `Cache`, `Code Cache`, `GPUCache` | subcarpetas de la misma carpeta | Electron |
| 6 | **Proyectos** | `Documentos/PDF Annotator` por defecto o la carpeta elegida, más la carpeta sincronizada si la hay | `projects-ipc.mjs` |
| 7 | **Descargas de actualizaciones** | `%LOCALAPPDATA%\pdf-annotator-desktop-updater\pending` · `~/Library/Caches/pdf-annotator-desktop-updater` · `~/.cache/pdf-annotator-desktop-updater` | electron-updater (se borra sola tras actualizar desde la 1.17) |
| 8 | **Temporales de la IA**: una carpeta por petición con imágenes y textos de las páginas | carpeta temporal del sistema, `pdfann-ia-*` | `tools/ai-helper/pipeline.mjs` (se borran al acabar cada petición) |

## 2. Dónde va (decisión)
- **En el menú ⋯ de la cabecera del editor**, como «Almacenamiento», junto a «Versión y actualizaciones». Es donde ya viven las cosas de la app instalada (actualizaciones, canal), se llega desde cualquier pantalla del editor y no añade ruido a la interfaz principal.
- **También desde «Proyectos»**: un enlace «Dónde se guarda» junto a la carpeta de proyectos, que abre el mismo panel. Es el sitio donde la persona piensa en carpetas.
- **Un panel** (no una página nueva): lista de grupos con su ruta y su tamaño, como el de «Versión y actualizaciones». Solo aparece si hay puente de escritorio (`getDesktopBridge()`); en la web la entrada no existe.

## 3. Cómo se presenta (decisión)
Tres grupos, de lo que es del usuario a lo que es desechable:

1. **Tu trabajo**: proyectos (6) y datos del editor (4). Ruta, tamaño, «Abrir carpeta» y «Copiar ruta». **No se vacía desde aquí.**
2. **La app**: programa instalado (1) y ajustes (2). Ruta y tamaño, «Abrir carpeta». **No se vacía.**
3. **Se puede vaciar**: caché del navegador interno (5), descargas de actualizaciones (7), temporales de la IA (8) y el registro de actualizaciones (3). Ruta, tamaño y «Vaciar», con confirmación. Debajo, «Vaciar todo esto (N MB)».

Arriba, una línea: «PDF Annotator ocupa N MB en tu disco (M MB son tu trabajo)».

## 4. Qué se puede vaciar (decisión)
- **Sí:** caché del navegador interno (se regenera al abrir la app), descargas de actualizaciones (ya no hacen falta tras instalar), temporales de la IA (solo quedan si la app se cerró a mitad de una petición) y el registro de actualizaciones.
- **No:** proyectos, datos del editor (lotes, sesión, plantillas, fuentes), ajustes y programa. Borrarlos es perder trabajo o configuración; quien quiera hacerlo tiene «Abrir carpeta». Un «Borrar todos los datos» queda fuera: es destructivo y no lo ha pedido nadie.
- **La caché del navegador interno** se vacía con las funciones de Electron: `session.clearCache()` / `clearStorageData({ storages: ['shadercache', 'cachestorage'] })` de Electron, nunca borrando carpetas a mano mientras Chromium las usa.

## 5. Cómo se calcula y seguridad
- **Tamaños en segundo plano**, en el proceso principal, al abrir el panel (recorrido de carpetas con tope de tiempo; «Calculando…» por fila). Una carpeta enorme no bloquea la app.
- **Lista cerrada de rutas** decidida por el proceso principal. La parte web solo pide `desktop:storage:list` y `desktop:storage:clear(<id>)` con un identificador de la lista; nunca manda una ruta. Las rutas no salen del equipo.
- **«Abrir carpeta»** con `shell.openPath`, solo para rutas de la lista.

## 6. Archivos que tocaría (tras la mesa)
- `desktop/storage.mjs` (inventario, tamaños y vaciado, con pruebas) e IPC en `main.mjs` + `preload.cjs`.
- Componente `components/storage-panel`, entrada en el menú ⋯ (`components/header`) y enlace en `pages/projects`. Claves `storage.*` en los 7 idiomas.
- e2e con el puente de escritorio simulado (como `update-channel.spec.ts`), README (sección de escritorio) y `docs/ARCHITECTURE.md` §10b.

## 7. Qué tiene que pintar la mesa
- El panel en oscuro 1650 y claro 1280, con los tres grupos y tamaños reales de ejemplo.
- Estados: «Calculando…», carpeta inexistente (p. ej. sin proyectos), confirmación de «Vaciar», después de vaciar y error al vaciar.
- La entrada en el menú ⋯ y el enlace en «Proyectos».
