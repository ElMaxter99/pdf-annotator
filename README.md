# 📑 PDF Annotator

Aplicación web en **Angular 20** para preparar anotaciones sobre PDFs sin modificar el documento original. Permite cargar archivos, obtener coordenadas exactas, ajustar estilos visuales y exportar los resultados como JSON o como un PDF renderizado con las marcas.

## 📚 Tabla de contenidos
- [Requisitos](#-requisitos)
- [Instalación](#-instalación)
- [Scripts disponibles](#-scripts-disponibles)
- [Uso paso a paso](#-uso-paso-a-paso)
  - [1. Inicia el servidor de desarrollo](#1-inicia-el-servidor-de-desarrollo)
  - [2. Carga un PDF](#2-carga-un-pdf)
  - [3. Navega y ajusta el zoom](#3-navega-y-ajusta-el-zoom)
  - [4. Crea una anotación](#4-crea-una-anotación)
  - [5. Edita o mueve anotaciones](#5-edita-o-mueve-anotaciones)
  - [6. Controla el color y la tipografía](#6-controla-el-color-y-la-tipografía)
  - [7. Gestiona las anotaciones en JSON](#7-gestiona-las-anotaciones-en-json)
  - [8. Exporta un PDF anotado](#8-exporta-un-pdf-anotado)
  - [9. Atajos de teclado](#9-atajos-de-teclado)
  - [10. Formato de las coordenadas](#10-formato-de-las-coordenadas)
- [Captura de pantalla](#-captura-de-pantalla)
- [Solución de problemas](#-solución-de-problemas)
- [Build de producción](#-build-de-producción)
- [Licencia](#-licencia)

## 🛠 Requisitos
- Node.js **v22.12.0** (o compatible con Angular 20).
- Angular CLI **v20.2.0** instalado globalmente (`npm install -g @angular/cli`) o disponible vía `npx`.
- Navegador moderno con soporte para ES2022.

## ⚙ Instalación
```bash
# Clona el repositorio
git clone https://github.com/ElMaxter99/pdf-annotator.git
cd pdf-annotator

# Instala las dependencias
npm install
```
> El proyecto ya incluye `pdf-lib` y `pdfjs-dist`, por lo que no necesitas instalar dependencias adicionales para exportar PDFs.

## 🧾 Scripts disponibles
| Comando | Descripción |
|---------|-------------|
| `npm start` | Levanta la aplicación en modo desarrollo. Puedes pasar banderas adicionales como `-- --host 0.0.0.0 --port 4200` para exponerla en tu red. |
| `npm run build` | Ejecuta una verificación de traducciones y genera los artefactos en `dist/pdf-annotator/browser`. |
| `npm test` | Ejecuta las pruebas unitarias con Karma y Jasmine. |

## ▶ Uso paso a paso
### 1. Inicia el servidor de desarrollo
```bash
npm start -- --host 0.0.0.0 --port 4200
```
Abre `http://localhost:4200` en tu navegador (o la IP indicada si usaste otro host).

### 2. Carga un PDF
Haz clic en **Seleccionar PDF** y elige un archivo `.pdf`. El visor mostrará la primera página y habilitará el panel de anotaciones.

### 3. Navega y ajusta el zoom
- Usa **◀ / ▶** para cambiar de página.
- Ajusta el zoom con los botones `−` y `+` (pasos de 0.25x). El escalado se aplica tanto al PDF como a las anotaciones ya dibujadas.

### 4. Crea una anotación
1. Haz clic sobre el documento (capa transparente "Hitbox").
2. En la tarjeta flotante escribe el texto que quieres mostrar (`mapField`).
3. Ajusta el tamaño de fuente (8–72 px) y selecciona un color desde el selector o introduciendo valores hex (`#RRGGBB`) o RGB (`rgb(r, g, b)`).
4. Pulsa ✅ para confirmar o ❌ para cancelar.

### 5. Edita o mueve anotaciones
- Haz clic sobre una anotación existente para abrir el editor en modo **Edición**.
- Arrastra la tarjeta para reposicionarla; el sistema recalcula las coordenadas en tiempo real.
- Modifica texto, tamaño o color y confirma con ✅. Usa 🗑️ para eliminar la marca.

### 6. Controla el color y la tipografía
El panel de edición sincroniza automáticamente el selector de color, la entrada hexadecimal y la representación RGB. Cambiar cualquiera actualiza las otras. El tamaño de fuente se guarda en puntos (`fontSize`).

### 7. Gestiona las anotaciones en JSON
- **Panel lateral**: visualiza y edita el JSON en vivo. Puedes pegar datos y aplicar cambios con **Aplicar JSON**.
- **Copiar JSON**: copia el objeto `{ pages: [...] }` al portapapeles.
- **Descargar JSON**: guarda las coordenadas como `coords.json`.
- **Importar JSON**: carga un archivo externo desde el botón del panel.
- El sistema acepta tanto un array directo como un objeto `{ "pages": [...] }` y normaliza coordenadas, textos y colores.

### 8. Exporta un PDF anotado
Con al menos una anotación y un PDF cargado:
1. Haz clic en **Descargar PDF anotado**.
2. La app reutiliza los bytes del archivo original, renderiza las marcas con `pdf-lib` (tipografía Helvetica) y descarga `annotated.pdf`.

### 9. Atajos de teclado
- **Enter** confirma la anotación en curso (creación o edición).
- **Escape** cancela la tarjeta activa.

### 10. Formato de las coordenadas
Cada anotación se almacena como:
```json
{
  "pages": [
    {
      "num": 1,
      "fields": [
        {
          "x": 120.5,
          "y": 450.25,
          "mapField": "Firma",
          "fontSize": 14,
          "color": "#FF0000"
        }
      ]
    }
  ]
}
```
- `x` e `y` están en puntos PDF (origen en la esquina inferior izquierda).
- `mapField` corresponde al texto que se pintará sobre el documento.
- `fontSize` se almacena en puntos; si no se indica, la app usa 14.
- `color` acepta hexadecimales (`#RRGGBB`).

## 📸 Captura de pantalla
![Demostración de PDF Annotator](browser:/invocations/thbhafwe/artifacts/artifacts/pdf-annotator-demo.png)

## 🧰 Solución de problemas
- **El PDF no se renderiza**: revisa que el archivo no esté protegido y que el servidor de desarrollo muestre el log sin errores.
- **No puedo mover una anotación**: asegúrate de arrastrar desde el cuerpo de la tarjeta (no solo desde los campos de texto).
- **Error al importar JSON**: confirma que el archivo contenga la estructura indicada y que los valores numéricos sean válidos.
- **El PDF exportado no abre**: prueba con otra copia del PDF original; la app intenta tres variantes (original, canónica y saneada) para asegurar compatibilidad.

## 🏗 Build de producción
```bash
npm run build
```
Los artefactos estáticos quedarán en `dist/pdf-annotator/browser` y pueden desplegarse en cualquier servidor web.

## 📝 Licencia
MIT © 2025 AlvaroMaxter
