# Decisiones de arquitectura (ADR cortos)

Formato: decisión · motivo · consecuencia. Añade una entrada nueva en vez de reescribir una vieja; si se revoca, márcala «Sustituida por».

1. **100 % en el navegador, sin backend.** Los PDFs son documentos sensibles. Consecuencia: nada de red con datos del usuario; la persistencia es local (localStorage, IndexedDB).
2. **`coords` es la única fuente de verdad.** JSON, DOM y localStorage se derivan. Todo cambio pasa por `applyCoordsChange` para entrar en el historial.
3. **Parser JSON propio sin evaluación.** Se sustituyó un `Function(...)` que permitía ejecutar código. Es regla de seguridad no negociable.
4. **Un único `AnnotationEditorComponent`** para crear y editar (`mode`). Un campo nuevo se añade una sola vez.
5. **Sesión en IndexedDB** (no localStorage) por el tamaño de los PDFs; límite de 40 MB y tolerante a fallos.
6. **Sidebar por pestañas con `[hidden]`** y no `*ngIf`, para conservar los `@ViewChild`.
7. **`render()` serializado.** pdf.js no admite dos renders a la vez en un canvas.
8. **`workspace.page.ts` sigue siendo grande a propósito** hasta que se extraiga por partes con tests; la lógica nueva va a servicios y `utils/*.ts`.
9. **Subcomponentes reciben `[vm]="vm"`** en lugar de inputs granulares; se respeta el patrón o se refactoriza de forma deliberada.
10. **Diseño primero** para todo cambio visible (ver `docs/WORKFLOW.md`). Fecha: 2026-11-09. Motivo: mismo flujo que usa el autor en pugIDE; evita rehacer UI.
