# Actualizar después de cancelar la contraseña o el permiso del sistema (candidata 1.17/1.18)

**Estado: análisis y plan de Claude, pendiente de aprobación de Maxter (2026-11-22).** Origen: Maxter, probando la rc.5 en Ubuntu: «a veces me pone *No se instaló la actualización, cancelaste la contraseña*; quiero que en ese caso me la vuelva a pedir sin tener que cerrar y abrir la app; y que en Mac y Windows funcione igual».

## 1. Cómo funciona hoy (verificado en el código y en electron-updater 6.8.11)

| Sistema | Cómo se instala | ¿Pide contraseña o permiso? | Qué pasa si se cancela |
| --- | --- | --- | --- |
| **Linux .deb** | `DebUpdater` ejecuta `pkexec dpkg -i <archivo>` de forma **síncrona** (la app se congela mientras está la ventana de la contraseña) | Sí, la contraseña del sistema | electron-updater, al fallar `dpkg`, **lanza otra vez `pkexec apt-get install -f -y`** para «arreglar dependencias»: sale **una segunda ventana de contraseña**. Si se cancelan las dos, la app vuelve a «lista para instalar» con el aviso «Cancelaste la contraseña» (código 126). Hay un botón «Reintentar» que llama otra vez a la instalación |
| **Linux .rpm** | `RpmUpdater`: `pkexec dnf/zypper/rpm …`, también síncrono | Sí | Igual: aviso «Cancelaste la contraseña» y «Reintentar» |
| **Linux AppImage** | Sustituye el archivo, sin privilegios | No | No aplica |
| **Windows** | NSIS por usuario (`perMachine: false`): se lanza el instalador y **la app se cierra antes** de que acabe | Solo si se instaló en una carpeta del sistema (p. ej. `Program Files`, permitido por `allowToChangeInstallationDirectory`): entonces sale el aviso de Windows (UAC) | Si se dice «No» al aviso de Windows, el instalador no sigue y **la app ya está cerrada y no vuelve a abrirse**: hay que abrirla a mano. La app no se entera de nada |
| **macOS** | Modo manual (la app no está firmada): el aviso lleva a la página de descarga | No desde la app (lo pide macOS al copiar a Aplicaciones, si hace falta) | No aplica mientras no se firme |

**Por qué Maxter tiene que cerrar y abrir en Linux:** «Reintentar» existe, pero (a) la doble ventana de contraseña confunde (cancelar la primera hace que salga otra, y parece que la app «se ha quedado pidiendo»); (b) la instalación es síncrona, así que durante la ventana la app no responde; y (c) no hay forma de comprobar desde aquí qué pasa en un escritorio real con `pkexec`. El registro `update.log` (en `~/.config/PDF Annotator/`) dirá qué hizo en su caso.

## 2. Plan (recomendado)

### Linux .deb/.rpm: instalación propia, asíncrona y con una sola contraseña
1. **No usar el `doInstall` de electron-updater en Linux .deb/.rpm.** El proceso principal ejecuta él mismo, **en segundo plano** (`spawn`, no `spawnSync`): `pkexec dpkg -i <archivo descargado>` (o `pkexec rpm -U --replacepkgs <archivo>`), con la ruta que ya da electron-updater (`downloadedUpdateHelper.file`). La app sigue respondiendo y muestra «Esperando la contraseña del sistema…».
2. **Una sola ventana:** si `pkexec` sale con 126/127 (cancelado o sin autorizar) se para ahí, sin el `apt-get -f` automático. Ese arreglo de dependencias solo se intenta si `dpkg` falla **por dependencias** y la persona ya puso la contraseña (y entonces se dice).
3. **Tras cancelar**, el aviso cambia a: «Cancelaste la contraseña del sistema. La actualización ya está descargada.» con el botón principal **«Pedir la contraseña otra vez»** (lanza `pkexec` de nuevo al momento), «Al cerrar la app» y «Ahora no». Sin cerrar ni abrir nada.
4. **Al terminar bien**, la app se reinicia sola (`app.relaunch()` + `app.exit()`), como hoy.

### Windows: no quedarse sin app si se cancela el permiso
5. Antes de instalar se mira si la carpeta de instalación necesita permiso de administrador (`isAdminRightsRequired` del archivo descargado, o si no se puede escribir en la carpeta del programa). Si **no** lo necesita (lo normal con la instalación por usuario), todo sigue igual.
6. Si **sí** lo necesita: el aviso lo dice antes («Windows te pedirá permiso para instalar»), y el instalador se lanza a través de un pequeño lanzador (PowerShell `Start-Process -Verb RunAs -Wait`) que, **si el permiso se cancela, vuelve a abrir la app** con la marca «actualización cancelada». La app reabierta enseña el mismo aviso que en Linux, con **«Pedir permiso otra vez»**.

### macOS
7. Mientras la app no esté firmada sigue el modo manual (no hay contraseña dentro de la app). Si un día se firma, Squirrel.Mac no pide contraseña para una app en Aplicaciones del propio usuario; si la pidiera, se aplica el mismo patrón: aviso y «Pedir la contraseña otra vez».

## 3. Qué no cambia
La descarga (no se vuelve a bajar nada), el canal de actualizaciones, «Al cerrar la app» y la limpieza del instalador tras actualizar (1.17).

## 4. Pruebas
- Unitarias de las reglas puras en `update-logic.mjs`: qué comando usar por tipo de paquete, cómo clasificar la salida (cancelado / dependencias / otro error), cuándo hace falta permiso en Windows.
- Prueba con un `pkexec` simulado (un script que sale con 126 la primera vez y con 0 la segunda) para el ciclo «cancelar → pedir otra vez → instalada».
- e2e del aviso con el puente de escritorio simulado (como `update-install.spec.ts`).
- Lo que no se puede probar en la nube (ventana real de `pkexec` y UAC) lo prueba Maxter en Ubuntu y, si puede, en un Windows con la app instalada en `Program Files`.

## 5. Preguntas para Maxter
1. ¿Lo hacemos así (Linux asíncrono con una sola contraseña + Windows que reabre la app si se cancela)?
2. Textos y botón nuevo del aviso: ¿sin mesas, como lo último, o se pinta antes? (queda anotado en `PENDIENTE-MESAS.md` en cualquier caso).
3. ¿Entra en la 1.17 (una RC más) o va a la 1.18?
4. Si puedes, pásame las últimas líneas de `~/.config/PDF Annotator/update.log` de cuando te pasó: confirma si «Reintentar» llegó a lanzar la contraseña otra vez.
