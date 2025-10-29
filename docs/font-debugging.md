# Guía de depuración de fuentes para anotaciones

Esta guía reúne comprobaciones rápidas para verificar por qué una fuente no se aplica en las anotaciones (en el lienzo, en los editores o al exportar el PDF).

## 1. Confirmar que los datos de la anotación incluyen la fuente
1. Abre las DevTools y selecciona una anotación (`div.annotation`).
2. Comprueba que tenga el atributo `data-font="..."` y que el estilo en línea define `--annotation-font-family` y `font-family`.
3. Si falta alguno de ellos:
   * Verifica en `src/app/app.ts` que `redrawAllForPage()` escriba ambos valores cuando crea las anotaciones. 【F:src/app/app.ts†L720-L744】
   * Comprueba que `field.fontType` llega normalizado en los métodos `selectPreviewFont`, `selectEditFont`, `confirmPreview` y `confirmEdit`. 【F:src/app/app.ts†L532-L612】

## 2. Revisar que el stylesheet dinámico exista
1. En el inspector busca una etiqueta `<style id="annotation-fonts-style">`.
2. Si no aparece, revisa que `ensureFontStyles()` se ejecute al cargar cada `FontOption`. 【F:src/app/fonts/font-options.ts†L548-L593】
3. Confirma que cada regla `.annotation[data-font='ID']` declare el `font-family` esperado.

## 3. Verificar que los archivos de fuente estén disponibles
1. En la pestaña *Network* filtra por `woff`, `woff2`, `ttf` u `otf` y recarga el modal o la página.
2. Si la fuente no se descarga:
   * Confirma que el archivo exista en `public/fonts/<folder>/<file>`.
   * Comprueba que `FontOption.face.sources` apunte al path `/fonts/...`. 【F:src/app/fonts/font-options.ts†L120-L200】

## 4. Comprobar el estado de `document.fonts`
Ejecuta estos comandos en la consola del navegador:

```ts
// Ver si el navegador ya conoce la fuente seleccionada
const fontType = 'crimson-pro';
document.querySelector(`.annotation[data-font='${fontType}']`)
  ?.computedStyleMap()?.get('font-family');

document.fonts.check("1em 'Crimson Pro'");

document.fonts.entries();
```

Si `document.fonts.check(...)` devuelve `false`, la fuente todavía no está registrada.

## 5. Forzar la precarga manualmente
Desde la consola puedes invocar la misma rutina que usa la aplicación:

```ts
import('src/app/fonts/font-options').then(({ ensureFontFaceLoaded, resolveFontOption }) => {
  const option = resolveFontOption('crimson-pro');
  ensureFontFaceLoaded(option, document).then(() => console.log('Crimson Pro lista'));
});
```

Esto te ayuda a detectar errores de red (por ejemplo, si la descarga desde Google Fonts falla).

## 6. Validar que el selector previa las fuentes
1. Inspecciona un botón `.font-picker__option[data-font]` y revisa el `font-family` calculado. 【F:src/styles.scss†L300-L330】
2. Si la opción no se renderiza con su fuente, confirma que `primeFontOptions()` se ejecuta cuando se abre el buscador. 【F:src/app/app.ts†L360-L368】

## 7. Exportar PDF con fuentes embebidas
Antes de exportar, la app llama a `ensureFontsForTypes()` sobre las fuentes detectadas en las coordenadas. 【F:src/app/app.ts†L1160-L1168】

Si las letras del PDF siguen en Helvetica:
1. Lanza manualmente `ensureFontsForTypes(this.collectFontTypesFromPages(this.coords()))` desde la consola usando `ng.getComponent(...)` sobre el elemento raíz.
2. Abre el PDF resultante con un visor que permita inspeccionar las fuentes incrustadas (por ejemplo, Acrobat o Firefox) para confirmar que se insertaron.

## 8. Registrar información de depuración en consola
Temporalmente puedes añadir logs dentro de `ensureFontFaceLoaded()` para ver qué ramas se ejecutan (local vs Google) y si alguna promesa se rechaza. 【F:src/app/fonts/font-options.ts†L520-L593】

Elimina los logs antes de subir cambios a producción.

---

Con estas comprobaciones deberías poder identificar si el problema viene de datos faltantes, de que el estilo dinámico no se inyecta, de que el navegador todavía no ha cargado la fuente o de que el PDF no la incluye.
