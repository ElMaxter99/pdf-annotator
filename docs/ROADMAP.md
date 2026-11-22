# Hoja de ruta

El histórico de la iteración inicial está en `docs/archive/PROPUESTA_MEJORAS.md`. Este archivo es el vivo: actualízalo en cada PR que cambie el estado.

## Hecho (hasta v1.5.0)
Parser seguro, cabecera y layout compactos, atajos, extracción de `AnnotationEditor`, `PdfExportService`, `FontCatalogService`, `AnnotationStore`, `AnnotationImportService`, sidebar por pestañas, selección múltiple, sesión en IndexedDB, toasts, avisos de importación, e2e y CI.

## Hecho: 1.15 «Solidez» (solo mantenimiento, sin cambios visibles)
Publicada como v1.15.0 (ver `CHANGELOG.md`). Solo refactor del editor: `workspace.page.ts` pasó de 6.348 a 5.811 líneas (estado A↔B, arrastre, ajuste por textos y estado de «Copiar y adaptar con IA» fuera de la página). No quedan bloques seguros que extraer, así que **se deja de partir el archivo**. Atajos, pruebas de coordenadas y `OnPush` ya estaban hechos en la 1.13.

## Hecho: 1.16 «Cierre de pendientes»
Publicada como v1.16.0 (ver `CHANGELOG.md`): doble clic del visor, espacio de trabajo ampliado y «Centrar A/B», modal mínimo de «Trasladar con IA», motor de IA por partes (páginas útiles, candidatas de B, re-pregunta, reintentos iguales, tope de 8 peticiones), anclar en B con huecos de escritura, colocación sin IA y «no existe en B», `start:docker` verificado, `OnPush` en todo menos `app.ts` y auditoría axe. Planes: `docs/PLAN-1.16.md` y `docs/PLAN-IA-ROBUSTA.md`.

## Hecho: 1.17 «IA medible y pulido»
Publicada como v1.17.0 el 2026-11-22 tras 8 RC (ver `CHANGELOG.md`): banco de medida de la IA, motor más robusto (tablas, etiquetas repetidas, lado del hueco, huecos escritos, parcial si no lee imágenes, códigos sin caracteres confusos), prueba de vista del modelo, instrucciones para la IA, propuesta editable en B, parejas A↔B, número de página repetido, lista y chips de la propuesta más claros, créditos de Copilot, actualizar tras cancelar la contraseña o el permiso, limpieza de la descarga del actualizador, accesibilidad (contraste del acento, `h1`, títulos, axe en el CI), colores a tokens y editor repartido en 8 archivos. Plan: `docs/PLAN-1.17.md`. Lo hecho sin mesas queda en `design/PENDIENTE-MESAS.md`.

## Siguiente: 1.18 (alcance por elegir)
Plan por tareas en `docs/PLAN-1.18.md`, **pendiente de que Maxter elija el alcance**: apartado «Almacenamiento» (con mesa), pintar en el lienzo lo hecho sin mesas, comprobar la IA con PDF reales y Copilot, e2e sin intermitencias y mantenimiento de dependencias. Cifrado de proyectos y firma de macOS, aparcados muy a futuro.

## Hecho tras v1.5.0
- Dockerfile con `nginx-unprivileged` y `npm ci`; `npm audit` y Dependabot en CI (v1.11).
- Remaquetado por lotes: vista dividida, aviso y escalado cuando A y B miden distinto, «Copiar y ajustar por textos», «Trasladar con IA» en cola, selección múltiple en el panel y ajuste por dos anclas (traslación + escala) en la cascada previa a la IA.

## Siguiente
1. **Remaquetado por lotes:** ayudante con cola propia: **hecho** (`/batch`, concurrencia 2 con Claude y 1 con Copilot, y el panel del lote la usa con reenganche tras recargar, mesas P-65 y P-66); falta medir créditos reales con Copilot (guion en `docs/IA-LOCAL.md`, necesita la cuenta de Maxter).
2. **Cerrado en la 1.15** (5.811 líneas; sin bloques seguros que extraer). Antes: dividir `workspace.page.ts` en módulos, por partes pequeñas: ya salen la generación de miniaturas y el parseo/exportación del JSON; ya salen también las reglas de la sesión guardada; el estado del desplegable de fuentes, la cola de `render()` y las cuentas de ajuste de zoom; las cuentas de mover el lienzo y del anclaje del zoom; el desplazamiento de las copias al pegar y duplicar; el resto del render sigue en la página (acoplado al DOM).
3. Accesibilidad: **hecho** el trap de foco en todos los diálogos modales, el `aria-live` de la posición de la anotación seleccionada y la revisión de contraste de los tokens del tema claro (cumplen AA). Auditoría axe hecha (`npm run a11y`, `docs/AUDITORIA-A11Y.md`): los invisibles ya están arreglados; pendiente de mesa el contraste de `--accent` como fondo en el tema claro (3,44:1 con texto blanco), los colores sueltos fuera de los tokens y un `h1` en el editor y los pasos del lote.
4. Rendimiento: ya van bajo demanda las miniaturas (se dibujan al entrar en pantalla) y **hecho (1.13)** `OnPush` en las hojas simples y en los 10 subcomponentes que reciben `[vm]` y en la propia página, con el estado mutable pasado a signals. **Hecho (1.16, T4a-T4c, PR `claude/t4-onpush`)** `OnPush` en las hojas, los diálogos, `ai-batch/*` y la landing (guardia en `src/app/onpush-idle.spec.ts`). **Hecho (1.16, T4d)** también `pages/batch/batch.page.ts` (guardia en `src/app/pages/batch/batch.page.onpush.spec.ts`). Solo el componente raíz `app.ts` sigue en `Eager`.
5. **Hecho (1.13):** más tests de atajos (`shortcuts.utils.spec.ts`) y de normalización de coordenadas importadas.
6. **Hecho (PR #245):** **Subir a Node 26 en todo el proyecto**, como parte de una feature de la siguiente versión (decisión de Maxter): `Dockerfile` (`node:22.12.0-alpine` → `26.x-alpine`, PR #221 de Dependabot como referencia), `node-version` en `ci.yml`, `release.yml`, `desktop-ci.yml` y `desktop-release.yml`, y la mención de Node 22.12 en `AGENTS.md`. Comprobar build, tests, e2e y el empaquetado de escritorio antes de fusionar.
7. **Hecho (PR #245):** **Migrar a Angular 22 de una sola vez**, también para la siguiente versión (decisión de Maxter): `ng update` de todos los paquetes `@angular/*` a la vez (referencias: PRs #227 y #228 de Dependabot, que no se pueden subir por separado), `zone.js` 0.15 → 0.16 (#240; Angular 20 exige `~0.15`) y `jasmine-core` 5 → 7 con un `karma-jasmine-html-reporter` compatible (#226). Dejar las cuatro PRs abiertas como referencia hasta hacerlo; después, `npm run build`, `npm run test:ci` y `npm run e2e` en verde.
8. **Navegar las páginas de A en el traslado (1.14, diseño aprobado P-74 a P-77, implementado en su PR):** rango máx(A, B) con panel «sin página», chip «Páginas enlazadas / libres» junto al de zoom, `Mayús + ←/→` para mover solo A y «Poner plantilla A» con confirmación cuando las páginas difieren. Detalle en `design/propuestas/navegar-paginas-de-a.md`.
9. **Hecho (1.14, mesas P-78 a P-81 y P-100 a P-102):** tabla de correspondencia de páginas A↔B: diálogo «Emparejar páginas…» con sugerencia por textos (la IA y el ajuste por textos la usan) y «Sugerir tablas» para varios PDFs desde el panel del lote. Detalle en `design/propuestas/emparejar-paginas-a-b.md`.

## Ideas sin priorizar
**Aparcado muy a futuro (Maxter, 2026-11-22):** cifrado opcional de proyectos («más problemas que ventajas») y firmar la app de macOS (nadie la usa en Mac). No se proponen de nuevo salvo que Maxter lo pida. El tope por proyecto (200 PDFs / 2 GB, avisos a 100 PDFs / 1 GB) está **confirmado** (`DECISIONS` 16).

**Hecho (mesa P-96, 1.14):** exportación en ZIP de varias plantillas. Detalle en `CHANGELOG.md`.

## Hecho (solo escritorio): proyectos locales y sincronización
Brainstorming de Maxter (2026-11-17); las tres fases están implementadas y publicadas en la 1.14. Todo va en la app de escritorio (Electron); la web no cambia. Principio: **sin servidores propios, sin cuentas de usuario de la app y sin APIs**; todo en local o en un almacenamiento que el usuario ya tenga.

**Fase 1 · Proyectos locales (implementada, mesas P-82 a P-84).** Separar el trabajo por proyecto o cliente (un PDF suelto o un lote de, por ejemplo, 90 PDFs), guardar varios a la vez y recuperar cada uno al volver a abrir la app. Hoy solo existe la «última sesión» (#249, `SessionStoreService`) y el lote (`BatchStoreService`), ambos en IndexedDB y de un solo hueco. Contenido de un proyecto: nombre, PDFs (A/B), anotaciones, plantillas, estado del lote y de cada PDF, página y zoom.
- Dependencias: modelo de datos con `id`/nombre/fechas y versión de esquema; migrar la sesión y el lote actuales a «proyecto por defecto»; selector de proyectos (pantalla nueva: diseño primero).
- Riesgos: cuota de IndexedDB con muchos PDFs; migración sin perder la sesión actual; tratar los datos restaurados como no confiables (`AnnotationImportService`).

**Fase 2 · Importar y exportar un proyecto (implementada, mesas P-85 a P-87).** Archivo portable (por ejemplo `.pdfannotator`, un ZIP con `project.json` + PDFs + coordenadas + estado a medias) para llevarlo a otro equipo o pasárselo a un compañero. Reutiliza `zip.utils`.
- Dependencias: fase 1; formato versionado y documentado en `docs/DOMAIN.md`; validación estricta al importar (tamaños, tipos, rutas del ZIP, sin evaluar nada).
- Riesgos: PDFs pesados (límite y barra de progreso); PDFs con datos personales en un archivo que viaja por correo (aviso, y cifrado opcional más adelante); qué pasa al importar un proyecto que ya existe (duplicar, reemplazar o fusionar).

**Fase 3 · Sincronizar sin servidores propios (carpeta sincronizada o de red, mesas P-88 a P-90, y SFTP, fase 3b, mesas P-91 a P-93: implementadas).** El usuario vincula una carpeta que ya tiene y la app guarda ahí el proyecto con rutas tipo `Álvaro/cliente1`, `Álvaro/cliente2`: carpeta local sincronizada por Google Drive u OneDrive (sin API, la sincroniza su cliente de escritorio), carpeta compartida de red (SMB/NFS) y, más adelante, SFTP preconfigurado. Mismo usuario en varios equipos; la app no tiene noción de usuarios.
- Dependencias: fases 1 y 2 (la carpeta contiene proyectos exportables), formato de carpeta por proyecto (`project.json` + PDFs por separado para no reescribir todo), bloqueo y detección de cambios.
- Riesgos: **conflictos** (dos equipos editan a la vez; los clientes de Drive/OneDrive crean «copias en conflicto»), por lo que hace falta un archivo de bloqueo con caducidad, una versión por proyecto y una regla clara de resolución; **privacidad** (los PDFs de clientes salen del equipo: el aviso debe ser explícito y las credenciales de SFTP irán en el almacén seguro del sistema, nunca en el repo ni en `localStorage`); **tamaño** (subir solo lo que cambió); la web no puede acceder a carpetas arbitrarias, por eso es solo escritorio; SFTP/LDAP añaden dependencias y superficie de seguridad (CSP/permisos de Electron).

**Decisiones de Maxter (2026-11-17):**
1. **Un proyecto siempre contiene un lote**, aunque tenga un solo PDF (así hay un único modelo). Abrir un PDF suelto en la app **no cambia**: sin ventanas ni pasos de más; el proyecto es para quien quiere gestionar más cosas (p. ej. «cliente 1» con 5, 10 o 20 maquetas).
2. **Nombre:** «Proyecto» para la funcionalidad nueva; «Espacio de trabajo» sigue siendo la zona de anotar (el `workspace` de siempre), para no liar.
3. **Dónde viven:** en una **carpeta visible en el disco** (no oculta en IndexedDB), para que la sincronización de la fase 3 sea fácil.
4. **Conflictos: bloqueo.** Solo un equipo edita cada proyecto; el otro lo ve en solo lectura. No se busca edición simultánea (se perdería trabajo al sincronizar); podría estudiarse mucho más adelante.
5. **Proveedores:** primero carpeta sincronizada (Drive, OneDrive) o carpeta de red, como prueba de concepto; SFTP después.
6. **Cifrado:** por ahora **no** (lo que subes a tu SFTP o Drive ya es tuyo; no hace falta protegerlo doble y pedir contraseña al crear cada proyecto es incómodo). Queda como idea futura con propuestas abajo.
7. **Tope de tamaño:** lo propone Claude (abajo), pendiente de que Maxter lo confirme.

**Propuestas de Claude, pendientes de validar:**
- **Tope por proyecto (confirmado por Maxter el 2026-11-20, `DECISIONS` 16):** hoy un PDF del lote admite hasta 40 MB (`MAX_BATCH_PDF_BYTES`). Se propone mantenerlo y añadir **200 PDFs y 2 GB por proyecto**, con aviso suave a partir de 1 GB y de 100 PDFs (Maxter ya trabaja con ≈90). Es un tope de la app, ajustable en una constante, no del disco.
- **Cifrado futuro, sin pedir contraseña siempre:** (a) opcional por proyecto, activado desde sus ajustes («Proteger con contraseña»), nunca obligatorio; (b) la clave se guarda en el almacén seguro del sistema (Keychain, Credential Manager, libsecret) para no teclearla cada vez; (c) solo se pide al abrir el proyecto en un equipo nuevo; (d) al exportar (fase 2) se ofrece cifrar el archivo con contraseña y esa sí se pide en el momento.

**Hecho (renombrar, mesas P-97 a P-99):** «Renombrar…» en el menú ⋯ de la tarjeta (nombre visible y, opcional, carpeta; en sincronizados solo el nombre).

