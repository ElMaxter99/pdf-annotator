# Hoja de ruta

El histórico de la iteración inicial está en `docs/archive/PROPUESTA_MEJORAS.md`. Este archivo es el vivo: actualízalo en cada PR que cambie el estado.

## Hecho (hasta v1.5.0)
Parser seguro, cabecera y layout compactos, atajos, extracción de `AnnotationEditor`, `PdfExportService`, `FontCatalogService`, `AnnotationStore`, `AnnotationImportService`, sidebar por pestañas, selección múltiple, sesión en IndexedDB, toasts, avisos de importación, e2e y CI.

## En curso
- **Lote de documentos y remaquetado, fase 1** (diseño aprobado `L-01`..`L-11`): pasos de subida, panel en cuadrícula o lista, editor de B con A como capa de referencia, estados por campo, «Poner plantilla A», «Listo» y descarga. Sin vista dividida ni miniaturas reales en el panel todavía.

## Hecho tras v1.5.0
- Dockerfile con `nginx-unprivileged` y `npm ci`; `npm audit` y Dependabot en CI (v1.11).
- Remaquetado por lotes: vista dividida, aviso y escalado cuando A y B miden distinto, «Copiar y ajustar por textos», «Trasladar con IA» en cola, selección múltiple en el panel y ajuste por dos anclas (traslación + escala) en la cascada previa a la IA.

## Siguiente
1. **Remaquetado por lotes, pendiente:** ayudante con cola propia: **hecho** (`/batch`, concurrencia 2 con Claude y 1 con Copilot, y el panel del lote la usa con reenganche tras recargar, mesas P-65 y P-66); falta medir créditos reales con Copilot (guion en `docs/IA-LOCAL.md`, necesita la cuenta de Maxter).
2. Dividir `workspace.page.ts` (≈5.780 líneas) en módulos, por partes pequeñas: ya salen la generación de miniaturas y el parseo/exportación del JSON; ya salen también las reglas de la sesión guardada; el estado del desplegable de fuentes, la cola de `render()` y las cuentas de ajuste de zoom; las cuentas de mover el lienzo y del anclaje del zoom; el resto del render sigue en la página (acoplado al DOM).
3. Accesibilidad: trap de foco en diálogos, `aria-live` en coordenadas, contraste en tema claro.
4. Rendimiento: miniaturas bajo demanda y `OnPush` en el resto de componentes. Ya están en `OnPush` las hojas simples (tema, avisos, miniatura de PDF, «Acerca de», landing, miniaturas de página y árbol JSON); falta el resto, que lee estado mutable de la página (`vm`) y exige pasarlo antes a signals.
5. Más tests: atajos y normalización de coordenadas.
6. **Subir a Node 26 en todo el proyecto**, como parte de una feature de la siguiente versión (decisión de Maxter): `Dockerfile` (`node:22.12.0-alpine` → `26.x-alpine`, PR #221 de Dependabot como referencia), `node-version` en `ci.yml`, `release.yml`, `desktop-ci.yml` y `desktop-release.yml`, y la mención de Node 22.12 en `AGENTS.md`. Comprobar build, tests, e2e y el empaquetado de escritorio antes de fusionar.
7. **Migrar a Angular 22 de una sola vez**, también para la siguiente versión (decisión de Maxter): `ng update` de todos los paquetes `@angular/*` a la vez (referencias: PRs #227 y #228 de Dependabot, que no se pueden subir por separado), `zone.js` 0.15 → 0.16 (#240; Angular 20 exige `~0.15`) y `jasmine-core` 5 → 7 con un `karma-jasmine-html-reporter` compatible (#226). Dejar las cuatro PRs abiertas como referencia hasta hacerlo; después, `npm run build`, `npm run test:ci` y `npm run e2e` en verde.
8. **Navegar las páginas de A en el traslado (1.14, diseño aprobado P-74 a P-77, implementado en su PR):** rango máx(A, B) con panel «sin página», chip «Páginas enlazadas / libres» junto al de zoom, `Mayús + ←/→` para mover solo A y «Poner plantilla A» con confirmación cuando las páginas difieren. Detalle en `design/propuestas/navegar-paginas-de-a.md`.
9. **Tabla de correspondencia de páginas A↔B (diseño aprobado P-78 a P-81, implementado en su PR):** diálogo «Emparejar páginas…» con sugerencia por textos; la IA y el ajuste por textos la usan. Pendiente para más adelante: «Sugerir tablas» para varios PDFs desde el panel del lote. Detalle en `design/propuestas/emparejar-paginas-a-b.md`.

## Ideas sin priorizar
Exportación en ZIP de varias plantillas.

## Futuro (solo escritorio): proyectos locales y sincronización
Brainstorming de Maxter (2026-11-17). **No hay diseño ni código todavía:** cada fase necesita mesas aprobadas antes de programarse (ver `docs/WORKFLOW.md`). Todo va en la app de escritorio (Electron); la web no cambia. Principio: **sin servidores propios, sin cuentas de usuario de la app y sin APIs**; todo en local o en un almacenamiento que el usuario ya tenga.

**Fase 1 · Proyectos locales (implementada en la PR de proyectos locales, mesas P-82 a P-84 aprobadas por Maxter).** Separar el trabajo por proyecto o cliente (un PDF suelto o un lote de, por ejemplo, 90 PDFs), guardar varios a la vez y recuperar cada uno al volver a abrir la app. Hoy solo existe la «última sesión» (#249, `SessionStoreService`) y el lote (`BatchStoreService`), ambos en IndexedDB y de un solo hueco. Contenido de un proyecto: nombre, PDFs (A/B), anotaciones, plantillas, estado del lote y de cada PDF, página y zoom.
- Dependencias: modelo de datos con `id`/nombre/fechas y versión de esquema; migrar la sesión y el lote actuales a «proyecto por defecto»; selector de proyectos (pantalla nueva: diseño primero).
- Riesgos: cuota de IndexedDB con muchos PDFs; migración sin perder la sesión actual; tratar los datos restaurados como no confiables (`AnnotationImportService`).

**Fase 2 · Importar y exportar un proyecto.** Archivo portable (por ejemplo `.pdfannotator`, un ZIP con `project.json` + PDFs + coordenadas + estado a medias) para llevarlo a otro equipo o pasárselo a un compañero. Reutiliza `zip.utils`.
- Dependencias: fase 1; formato versionado y documentado en `docs/DOMAIN.md`; validación estricta al importar (tamaños, tipos, rutas del ZIP, sin evaluar nada).
- Riesgos: PDFs pesados (límite y barra de progreso); PDFs con datos personales en un archivo que viaja por correo (aviso, y cifrado opcional más adelante); qué pasa al importar un proyecto que ya existe (duplicar, reemplazar o fusionar).

**Fase 3 · Sincronizar sin servidores propios.** El usuario vincula una carpeta que ya tiene y la app guarda ahí el proyecto con rutas tipo `Álvaro/cliente1`, `Álvaro/cliente2`: carpeta local sincronizada por Google Drive u OneDrive (sin API, la sincroniza su cliente de escritorio), carpeta compartida de red (SMB/NFS) y, más adelante, SFTP preconfigurado. Mismo usuario en varios equipos; la app no tiene noción de usuarios.
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
- **Tope por proyecto:** hoy un PDF del lote admite hasta 40 MB (`MAX_BATCH_PDF_BYTES`). Se propone mantenerlo y añadir **200 PDFs y 2 GB por proyecto**, con aviso suave a partir de 1 GB y de 100 PDFs (Maxter ya trabaja con ≈90). Es un tope de la app, ajustable en una constante, no del disco.
- **Cifrado futuro, sin pedir contraseña siempre:** (a) opcional por proyecto, activado desde sus ajustes («Proteger con contraseña»), nunca obligatorio; (b) la clave se guarda en el almacén seguro del sistema (Keychain, Credential Manager, libsecret) para no teclearla cada vez; (c) solo se pide al abrir el proyecto en un equipo nuevo; (d) al exportar (fase 2) se ofrece cifrar el archivo con contraseña y esa sí se pide en el momento.

**Pendiente de diseño (fase 1):** pantalla de proyectos, crear/abrir/renombrar/quitar, qué ve un equipo que no tiene el bloqueo, migración de la «última sesión» y del lote actual, y cómo se llega desde la landing sin molestar a quien solo anota un PDF. Mesas en «Propuestas» del lienzo; no se programa hasta que Maxter las apruebe.
