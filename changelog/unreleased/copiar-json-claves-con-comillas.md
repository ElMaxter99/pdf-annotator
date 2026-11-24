---
type: Fixed
---
**«Copiar JSON» entrega siempre JSON válido (1.19):** si el texto del editor llevaba claves sin comillas o comillas simples, el botón lo copiaba tal cual; ahora lo reescribe con el formato elegido (por defecto, JSON estricto). Además, si el navegador no permite el portapapeles (contexto no seguro o permiso denegado) se usa el método antiguo en lugar de fallar sin aviso.
