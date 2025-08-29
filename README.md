# 📑 PDF Annotator

Una aplicación en **Angular 20** que permite:

- Subir un PDF.
- Renderizarlo en el navegador.
- Hacer click en cualquier parte de la página para capturar las coordenadas.
- Mostrar en un panel lateral un JSON con las coordenadas capturadas y el texto asociado.
- Modificar el texto que se va a “pintar” en el PDF.

Ideal para preparar procesos de anotación de coordenadas y probar posiciones antes de generar PDFs en backend.

---

## 🚀 Requisitos

- Node.js 20+  
- Angular CLI 20+  

---

## ⚙️ Instalación

```bash
# Clonar el repositorio
git clone https://github.com/ElMaxter99/pdf-annotator.git
cd pdf-annotator

# Instalar dependencias
npm install

## ▶️ Desarrollo
ng serve
```
La aplicación se levantará en:
```bash
http://localhost:4200
```

## 🖼️ Uso

**1.** Haz click en **Seleccionar PDF** y carga un archivo `.pdf`.

**2.** Usa las flechas de navegación para cambiar de página.

**3.** Haz click sobre el PDF para **registrar una coordenada**.

**4.** Escribe en el campo de texto para definir qué valor quieres pintar (ej: `"X"`, `"Firma"`, `"21/21/2020"`).

**5.** Las coordenadas se mostrarán en el panel derecho como un JSON.

Ejemplo de salida:
```json
[
  { "page": 1, "x": 120, "y": 450, "value": "X" },
  { "page": 2, "x": 300, "y": 220, "value": "Firma" }
]
```

## 🛠️ Tecnologías usadas
* Angular 20
* pdf.js ~ 5.4.54


## 📌 Notas
* Esta app no modifica el PDF, solo muestra coordenadas y texto como overlay.
* Para aplicar estas coordenadas en un PDF final, se recomienda usar librerías de servidor como:
  * [`hummus`](https://www.npmjs.com/package/hummus) (Node.js)
  
## 📦 Build producción
```bash
ng build
```
Los artefactos se generan en dist/pdf-annotator/browser.

## 📝 Licencia
MIT © 2025 AlvaroMaxter