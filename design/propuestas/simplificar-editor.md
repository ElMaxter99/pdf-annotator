# Simplificar el editor y la caja de la anotación (P-139 a P-142)

**Estado: aprobada por Maxter el 2026-11-23 («diseño ok»; en las cuatro preguntas, lo recomendado: propuesta B, pie fuera, «Limpiar» a ⋯, botones con texto). Fase 1 (caja de la anotación, P-142) y fase 2 (píldora flotante en lugar del pie; zoom, vista y Limpiar fuera de la barra) implementadas; fase 3 hecha en su versión simple: pestañas Plantillas y Avanzado reunidas en «Ajustes» (3 pestañas). Faltan el carril de iconos y fundir la barra del lote. La «Vista» se queda como tres botones en la píldora (no como desplegable) para no romper los flujos actuales.**
**Diseño:** lienzo, zona «Propuestas», mesas P-139 (hoy y opciones), P-140 (B oscuro 1650), P-141 (B claro 1280 con la caja), P-142 (estados de la caja). https://claude.ai/artifact/AUL7g11U4ZDtLFf3katowh

## 1. Problema
Las personas que han visto la app dicen que las funciones molan pero «no sabes por dónde tocar». Además, la caja de la anotación se sale de la pantalla al hacer clic abajo del todo.

## 2. Inventario (código de la 1.18.0-rc.4)
- **Barra superior** (`components/header`): 15 controles a la vista (casa, ‹ página ›, − + ancho, Muestra/Mapeo/Datos, ↶ ↷, Limpiar, Descargar PDF, ⋯) y 7 en ⋯ (paleta, atajos, almacenamiento, acerca de, rueda, tema, idioma).
- **Segunda barra** (`components/migration/migration-bar`, solo en lote): ‹ Panel, anterior/siguiente, vistas A/B, ajuste, IA, tablas de páginas, avisos (hasta 44 botones).
- **Panel izquierdo** (`components/sidebar`, ≈45 controles): Documento (subir, miniaturas), Anotaciones (importar/aplicar JSON, texto/árbol, copiar con 7 opciones de formato, descargar), Plantillas (guardar, cargar, borrar, exportar), Avanzado (fuentes, guías con 12 opciones, campos avanzados del JSON, valores de muestra, datos de prueba).
- **Pie** (`components/footer`): atajo «?», X/Y del cursor, guardado, zoom % (menú) y ajustar.
- **Caja de la anotación** (`components/annotation-editor`): 14 campos siempre visibles, `position:absolute` en `x·escala, alto − y·escala`, sin límite de alto ni acotación al visor (por eso sale por debajo).
- **Duplicados:** zoom (barra, pie, rueda), página (barra, miniaturas, ‹ ›), atajos/paleta (⋯, pie, Ctrl+K).

## 3. Propuestas
| | A · Ordenar | B · Una barra, un panel (recomendada) | C · Lienzo primero |
|---|---|---|---|
| Idea | Mismo diseño, sin duplicados | Barra única + carril de 3 iconos + píldora flotante (zoom, vista, guardado); sin pie | Solo PDF + barra flotante + inspector contextual |
| Barra | 22 → ≈12 | 22 → ≈9; lote fundido en ella (menú «Lote») | 3 botones |
| Panel | 4 → 3 pestañas | Carril: Páginas, Anotaciones, Ajustes (plegado, con buscador) | Diálogos + Ctrl+K |
| Esfuerzo | ≈2 días | ≈5-6 días en 3 PR | ≈3 semanas |
| Riesgo | mínimo | medio (mover e2e) | alto (descubribilidad, rehacer lote e IA) |

**Recomendación: B**, por fases independientes: 1) caja de la anotación, 2) barra única y píldora (quita el pie), 3) carril lateral y Ajustes. A es un subconjunto de B (se puede empezar por A sin tirar trabajo). C no se recomienda.

## 4. Caja de la anotación (P-142)
- **Nivel básico:** Campo (mapeo), Tipo (4 botones), Valor de muestra, Tamaño, Color (selector + hex). Decimales y Sufijo solo con tipo Número.
- **«Más opciones» (plegado y recordado):** Fuente, Opacidad, Fondo, Color RGB, Bloqueada, Oculta, posición X/Y.
- **Botones con texto:** Aceptar, Cancelar; en edición, Duplicar y Eliminar. Ctrl+Intro acepta, Esc cancela.
- **Colocación:** función pura `placePopover(punto, tamaño, visor)` en `utils/` (con spec): prueba abajo-dcha, arriba-dcha, abajo-izq, arriba-izq; si ninguna cabe, se desplaza al borde con 12 px. Alto máximo = alto del visor − 24 px, scroll solo en el cuerpo. Con visor < 720 × 520, hoja inferior y el visor se desplaza para dejar el punto visible. Se recoloca con scroll, zoom, «Más opciones» y `ResizeObserver`.
- **Estados diseñados:** crear, abajo del todo, esquina, poco alto, hoja inferior, bloqueada, Número, error de validación.
- **Accesibilidad:** foco al primer campo, Tab dentro de la caja, 150 ms ease-out (sin animación con `prefers-reduced-motion`), botones con nombre accesible.

## 5. Implementación prevista (tras aprobación)
1. PR 1: `annotation-editor` (plantilla, estilos) + `utils/popover-placement.utils.ts` + e2e (clic en el borde inferior y derecho, ventana baja). Claves i18n nuevas en los 7 idiomas (`annotation.more`, `annotation.actions.accept/cancel/delete`, `annotation.error.field`…).
2. PR 2: `components/header` única (absorbe `migration-bar`), píldora en `viewer`, eliminar `components/footer`; actualizar e2e y atajos/paleta.
3. PR 3: carril + paneles (`components/sidebar`), «Ajustes» con secciones plegadas y buscador.
Cada PR pasa build, `test:ci`, e2e, a11y, oscuro y claro a 1650 y 1280 px; actualiza CHANGELOG, `design/` y `docs/ARCHITECTURE.md`. No se fusiona ni se publica versión sin orden de Maxter.

## 6. Decisiones pendientes de Maxter
1. ¿A, B o C? (recomendado B).
2. ¿El pie desaparece (B) o se conserva «guardado hace…» fijo?
3. «Limpiar» pasa de la barra a ⋯ y la paleta.
4. Sustituir ✅ ❌ 🗑️ de la caja por botones con texto.
