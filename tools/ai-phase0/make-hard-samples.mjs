#!/usr/bin/env node
// Casos sintéticos DIFÍCILES (datos inventados) para medir el motor antes de tener PDF reales: npm run bench -- --cases sample-dificil
// Mismo formato que make-samples.mjs (A-<caso>.pdf/.json, B-<caso>.pdf, expected-<caso>.json, README-<caso>.md) en sample-dificil/.
// Cada caso reproduce una categoría del análisis de pares reales: estructura que cambia de páginas, etiquetas renombradas,
// campos sin etiqueta cerca (frases con huecos «____»), secciones con las mismas etiquetas, tablas con columnas
// reordenadas y casillas que cambian de lado. La solución esperada se calcula con la misma convención que la app:
// texto = inicio de la línea base sobre el hueco; casilla = «X» centrada (toFieldXY de place.mjs).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { toFieldXY } from './place.mjs';

const OUT = new URL('sample-dificil/', import.meta.url);
const ink = rgb(0.12, 0.16, 0.22);
const gray = rgb(0.45, 0.5, 0.58);
const ruleC = rgb(0.6, 0.64, 0.7);
const A4 = [595, 842];
const r1 = (n) => Math.round(n * 10) / 10;

const metricsDoc = await PDFDocument.create();
const FONT = await metricsDoc.embedFont(StandardFonts.Helvetica);
const BOLD = await metricsDoc.embedFont(StandardFonts.HelveticaBold);
const width = (text, size = 10, bold = false) => (bold ? BOLD : FONT).widthOfTextAtSize(text, size);

/**
 * Elementos de página:
 *  T(text,x,y)                       texto fijo (gris; title/bold opcionales)
 *  F(k,label,x,y,{slot})             etiqueta con hueco. slot: 'right' (raya tras el texto), 'below' (raya debajo),
 *                                    'under' (guiones bajos «____» tras el texto), 'box-left'/'box-right' (casilla dibujada)
 *  S(k,before,x,y,{after})          frase con hueco escrito «____» en medio («D./Dña. ____ con NIF ____»): una clave por hueco
 *  C(k,header,x,y,w)                 celda de tabla: cabecera en y, hueco en la fila de debajo
 */
const T = (text, x, y, o = {}) => ({ t: 'text', text, x, y, ...o });
const F = (k, label, x, y, o = {}) => ({ t: 'field', k, label, x, y, slot: 'right', len: 180, ...o });
const S = (parts, x, y, o = {}) => ({ t: 'sentence', parts, x, y, ...o });
const C = (k, header, x, y, w) => ({ t: 'cell', k, header, x, y, w });

/** Dibuja la página y devuelve, por clave, el punto del valor ({ x, y, kind }). */
function layout(page, els, draw) {
  const spots = new Map();
  for (const e of els) {
    if (e.t === 'text') {
      const size = e.size ?? (e.title ? 16 : 9);
      const bold = e.bold ?? !!e.title;
      draw?.text(e.text, e.x, e.y, size, bold, e.title || e.bold ? ink : gray);
      continue;
    }
    if (e.t === 'field') {
      const lw = width(e.label, 10, true);
      draw?.text(e.label, e.x, e.y, 10, true, ink);
      if (e.slot === 'right') {
        const x0 = e.x + lw + 6;
        draw?.line(x0, e.y - 3, x0 + e.len, e.y - 3);
        spots.set(e.k, { x: x0 + 2, y: e.y + 2, kind: 'line' });
      } else if (e.slot === 'below') {
        draw?.line(e.x, e.y - 20, e.x + e.len, e.y - 20);
        spots.set(e.k, { x: e.x + 2, y: e.y - 17, kind: 'line' });
      } else if (e.slot === 'under') {
        const x0 = e.x + lw + 4;
        draw?.text('_'.repeat(e.n ?? 30), x0, e.y, 10, false, ink);
        spots.set(e.k, { x: x0 + 2, y: e.y + 2, kind: 'line' });
      } else if (e.slot === 'box-left' || e.slot === 'box-right') {
        const bx = e.slot === 'box-left' ? e.x - 16 : e.x + lw + 8;
        draw?.rect(bx, e.y - 1.5, 10, 10);
        spots.set(e.k, { x: bx + 5, y: e.y + 3.5, kind: 'box' });
      }
      continue;
    }
    if (e.t === 'sentence') {
      // parts: ['D./Dña.', {k:'nombre', n:28}, 'con NIF', {k:'nif', n:14}, '.']
      let x = e.x;
      for (const p of e.parts) {
        if (typeof p === 'string') {
          draw?.text(p, x, e.y, 10, false, ink);
          x += width(p, 10) + 4;
        } else {
          const u = '_'.repeat(p.n);
          draw?.text(u, x, e.y, 10, false, ink);
          spots.set(p.k, { x: x + 2, y: e.y + 2, kind: 'line' });
          x += width(u, 10) + 4;
        }
      }
      continue;
    }
    if (e.t === 'cell') {
      draw?.text(e.header, e.x + 4, e.y, 9, true, ink);
      draw?.rectLine(e.x, e.y - 30, e.w, 44);
      draw?.line(e.x, e.y - 6, e.x + e.w, e.y - 6);
      spots.set(e.k, { x: e.x + 4, y: e.y - 24, kind: 'line' });
    }
  }
  return spots;
}

async function render(pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const els of pages) {
    const page = doc.addPage(A4);
    layout(page, els, {
      text: (text, x, y, size, b, color) => page.drawText(text, { x, y, size, font: b ? bold : font, color }),
      line: (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.6, color: ruleC }),
      rect: (x, y, w, h) => page.drawRectangle({ x, y, width: w, height: h, borderColor: ink, borderWidth: 0.8 }),
      rectLine: (x, y, w, h) => page.drawRectangle({ x, y, width: w, height: h, borderColor: ruleC, borderWidth: 0.6 }),
    });
  }
  return doc.save();
}

const spotsOf = (pages) => pages.map((els) => layout(null, els, null));
const find = (spots, k) => {
  for (let i = 0; i < spots.length; i++) if (spots[i].has(k)) return { page: i + 1, ...spots[i].get(k) };
  return null;
};
const xyFor = (spot, field) => (spot.kind === 'box' ? toFieldXY({ x: spot.x, y: spot.y }, 'box', field) : { x: r1(spot.x), y: r1(spot.y) });

async function build(name, c) {
  await mkdir(OUT, { recursive: true });
  const sa = spotsOf(c.A);
  const sb = spotsOf(c.B);
  const aJson = { pages: c.A.map((_, i) => ({ num: i + 1, fields: [] })) };
  const expected = [];
  const perPage = new Map();
  for (const f of c.fields) {
    const a = find(sa, f.k);
    if (!a) throw new Error(`${name}: ${f.k} no está en A`);
    const { k, ...field } = f;
    const xy = xyFor(a, field);
    aJson.pages[a.page - 1].fields.push({ x: xy.x, y: xy.y, ...field });
    const n = (perPage.get(a.page) ?? 0) + 1;
    perPage.set(a.page, n);
    const id = `p${a.page}-f${n}`;
    const b = find(sb, f.k);
    if (!b) expected.push({ id, gone: true });
    else {
      const bxy = xyFor(b, field);
      expected.push({ id, page: b.page, x: bxy.x, y: bxy.y });
    }
  }
  await writeFile(new URL(`A-${name}.pdf`, OUT), await render(c.A));
  await writeFile(new URL(`B-${name}.pdf`, OUT), await render(c.B));
  await writeFile(new URL(`A-${name}.json`, OUT), JSON.stringify(aJson, null, 2) + '\n');
  await writeFile(new URL(`expected-${name}.json`, OUT), JSON.stringify(expected, null, 2) + '\n');
  await writeFile(new URL(`README-${name}.md`, OUT), `# ${name}\n\nCategoría: ${c.category}\n\n${c.about}\n`);
  console.log(`✓ ${name} (${expected.length} campos, ${expected.filter((e) => e.gone).length} desaparecen)`);
}

const txt = (k, map, o = {}) => ({ k, type: 'text', fontSize: 10, mapField: `{{${map}}}`, ...o });
const chk = (k, map) => ({ k, type: 'check', fontSize: 12, mapField: map });

// 1. Formulario bancario: 1 página → 3 (portada nueva, titular y banco separados), etiquetas renombradas y valores debajo.
await build('banco-una-a-tres', {
  category: 'estructura cambia (1→3 páginas) + renombradas + relación con el hueco distinta',
  about:
    'A tiene todo en una página con el hueco a la derecha de cada etiqueta. B antepone una portada, separa «Datos del titular» (pág. 2, huecos DEBAJO de la etiqueta) y «Datos bancarios» (pág. 3), y renombra: «Nombre y apellidos»→«Nombre completo», «D.N.I.»→«NIF / NIE», «Domicilio»→«Dirección», «C.P.»→«Código postal», «Localidad»→«Población». Las casillas pasan de la derecha a la izquierda y «Fecha» y «Firma» usan guiones bajos.',
  A: [[
    T('SOLICITUD DE DOMICILIACIÓN', 50, 790, { title: true }),
    F('nombre', 'Nombre y apellidos', 50, 740), F('dni', 'D.N.I.', 50, 710, { len: 120 }), F('dom', 'Domicilio', 50, 680, { len: 260 }),
    F('cp', 'C.P.', 50, 650, { len: 60 }), F('loc', 'Localidad', 200, 650, { len: 160 }),
    F('iban', 'IBAN', 50, 590, { len: 300 }), F('entidad', 'Entidad', 50, 560, { len: 160 }), F('oficina', 'Oficina', 330, 560, { len: 100 }),
    F('acepto', 'Acepto la domiciliación', 50, 500, { slot: 'box-right' }), F('publi', 'Deseo recibir información comercial', 50, 475, { slot: 'box-right' }),
    F('fecha', 'Fecha', 50, 160, { len: 120 }), F('firma', 'Firma', 300, 160, { len: 160 }),
  ]],
  B: [
    [T('SOLICITUD DE DOMICILIACIÓN · 2026', 50, 790, { title: true }), T('Lea las instrucciones antes de rellenar el impreso.', 50, 750), T('Escriba en mayúsculas y sin tachaduras.', 50, 735)],
    [
      T('Datos del titular', 50, 790, { bold: true, size: 12 }),
      F('nombre', 'Nombre completo', 50, 740, { slot: 'below', len: 300 }), F('dni', 'NIF / NIE', 50, 690, { slot: 'below', len: 150 }),
      F('dom', 'Dirección', 50, 640, { slot: 'below', len: 400 }), F('cp', 'Código postal', 50, 590, { slot: 'below', len: 100 }), F('loc', 'Población', 250, 590, { slot: 'below', len: 200 }),
    ],
    [
      T('Datos bancarios', 50, 790, { bold: true, size: 12 }),
      F('iban', 'IBAN', 50, 740, { len: 320 }), F('entidad', 'Entidad', 50, 710, { len: 160 }), F('oficina', 'Oficina', 330, 710, { len: 100 }),
      F('acepto', 'Acepto la domiciliación', 70, 650, { slot: 'box-left' }), F('publi', 'Deseo recibir información comercial', 70, 625, { slot: 'box-left' }),
      F('fecha', 'Fecha', 50, 200, { slot: 'under', n: 20 }), F('firma', 'Firma', 300, 200, { slot: 'under', n: 26 }),
    ],
  ],
  fields: [
    txt('nombre', 'titular.nombre'), txt('dni', 'titular.nif'), txt('dom', 'titular.domicilio'), txt('cp', 'titular.cp'), txt('loc', 'titular.localidad'),
    txt('iban', 'banco.iban'), txt('entidad', 'banco.entidad'), txt('oficina', 'banco.oficina'),
    chk('acepto', 'acepto'), chk('publi', 'publicidad'), txt('fecha', 'firma.fecha'), txt('firma', 'firma.nombre'),
  ],
});

// 2. Frases con huecos: los campos no tienen etiqueta propia, solo una frase legal que B reescribe.
await build('frase-con-huecos', {
  category: 'sin etiqueta cercana (frase con huecos «____») + reescrita',
  about:
    'Los datos van dentro de frases con huecos escritos con guiones bajos. B reescribe las frases («D./Dña. ____ con D.N.I. ____ y domicilio en ____» → «Yo, ____, con documento de identidad ____, con domicilio a efectos de notificaciones en ____») y cambia el orden de la segunda frase.',
  A: [[
    T('AUTORIZACIÓN', 50, 790, { title: true }),
    S(['D./Dña.', { k: 'nom', n: 30 }, 'con D.N.I.', { k: 'dni', n: 14 }], 50, 730),
    S(['y domicilio en', { k: 'dom', n: 50 }], 50, 705),
    S(['autoriza a', { k: 'aut', n: 30 }, 'a recoger el documento', { k: 'doc', n: 20 }], 50, 670),
    S(['En', { k: 'lugar', n: 20 }, ', a', { k: 'fecha', n: 16 }], 50, 200),
  ]],
  B: [[
    T('AUTORIZACIÓN DE RECOGIDA', 50, 790, { title: true }),
    S(['Yo,', { k: 'nom', n: 34 }, ', con documento de identidad', { k: 'dni', n: 14 }, ','], 50, 730),
    S(['con domicilio a efectos de notificaciones en', { k: 'dom', n: 40 }], 50, 705),
    S(['autorizo a recoger', { k: 'doc', n: 22 }, 'en mi nombre a', { k: 'aut', n: 26 }], 50, 670),
    S(['Firmado en', { k: 'lugar', n: 20 }, 'el día', { k: 'fecha', n: 16 }], 50, 200),
  ]],
  fields: [txt('nom', 'persona.nombre'), txt('dni', 'persona.dni'), txt('dom', 'persona.domicilio'), txt('aut', 'autorizado.nombre'), txt('doc', 'documento'), txt('lugar', 'firma.lugar'), txt('fecha', 'firma.fecha')],
});

// 3. Dos secciones con las mismas etiquetas: Comprador y Vendedor, que en B cambian de orden y pasan a dos columnas.
const party = (pre, x, y, slot = 'right', len = 170) => [
  F(`${pre}-nombre`, 'Nombre', x, y, { slot, len }), F(`${pre}-nif`, 'NIF', x, y - (slot === 'below' ? 45 : 28), { slot, len: 120 }),
  F(`${pre}-dom`, 'Domicilio', x, y - (slot === 'below' ? 90 : 56), { slot, len }), F(`${pre}-firma`, 'Firma', x, y - (slot === 'below' ? 135 : 84), { slot, len: 140 }),
];
await build('secciones-repetidas', {
  category: 'repetida o ambigua en B (mismas etiquetas en dos secciones) + recolocada',
  about:
    'Las etiquetas «Nombre», «NIF», «Domicilio» y «Firma» aparecen dos veces (Comprador y Vendedor). En A van una sección debajo de otra con el hueco a la derecha; en B van en dos columnas, primero el VENDEDOR (izquierda) y luego el COMPRADOR (derecha), con el hueco debajo. Mide si la IA distingue por el título de la sección.',
  A: [[
    T('CONTRATO DE COMPRAVENTA', 50, 790, { title: true }),
    T('COMPRADOR', 50, 740, { bold: true, size: 11 }), ...party('c', 50, 710),
    T('VENDEDOR', 50, 560, { bold: true, size: 11 }), ...party('v', 50, 530),
  ]],
  B: [[
    T('CONTRATO DE COMPRAVENTA (modelo 2026)', 50, 790, { title: true }),
    T('VENDEDOR', 50, 740, { bold: true, size: 11 }), ...party('v', 50, 715, 'below', 200),
    T('COMPRADOR', 310, 740, { bold: true, size: 11 }), ...party('c', 310, 715, 'below', 200),
  ]],
  fields: ['c', 'v'].flatMap((p) => [txt(`${p}-nombre`, `${p === 'c' ? 'comprador' : 'vendedor'}.nombre`), txt(`${p}-nif`, `${p === 'c' ? 'comprador' : 'vendedor'}.nif`), txt(`${p}-dom`, `${p === 'c' ? 'comprador' : 'vendedor'}.domicilio`), txt(`${p}-firma`, `${p === 'c' ? 'comprador' : 'vendedor'}.firma`)]),
});

// 4. Tabla: columnas reordenadas y una renombrada; el valor va en la celda de debajo de la cabecera.
await build('tabla-columnas', {
  category: 'tabla: columnas reordenadas + una renombrada + una desaparece',
  about:
    'Una tabla de una fila: cabeceras «Concepto | Cantidad | Precio unidad | Descuento | Importe» con el valor en la celda de debajo. En B el orden es «Cantidad | Concepto | Importe | Precio» («Precio unidad»→«Precio») y la columna «Descuento» desaparece.',
  A: [[
    T('PRESUPUESTO', 50, 790, { title: true }),
    C('concepto', 'Concepto', 40, 700, 200), C('cant', 'Cantidad', 240, 700, 70), C('precio', 'Precio unidad', 310, 700, 90), C('desc', 'Descuento', 400, 700, 70), C('imp', 'Importe', 470, 700, 85),
  ]],
  B: [[
    T('PRESUPUESTO', 50, 790, { title: true }),
    C('cant', 'Cantidad', 40, 650, 70), C('concepto', 'Concepto', 110, 650, 240), C('imp', 'Importe', 350, 650, 100), C('precio', 'Precio', 450, 650, 100),
  ]],
  fields: [txt('concepto', 'linea.concepto'), txt('cant', 'linea.cantidad'), txt('precio', 'linea.precio'), txt('desc', 'linea.descuento'), txt('imp', 'linea.importe')],
});

// 5. Casillas: de la derecha a la izquierda, reordenadas, una renombrada y otra que desaparece.
await build('casillas-cambian-de-lado', {
  category: 'casillas: cambian de lado + reordenadas + una renombrada + una desaparece',
  about:
    'Lista de opciones con casilla. En A la casilla está a la DERECHA del texto; en B a la IZQUIERDA, en otro orden, «Factura en papel» pasa a «Factura impresa» y «Envío urgente» desaparece.',
  A: [[
    T('PREFERENCIAS', 50, 790, { title: true }),
    F('email', 'Avisos por correo electrónico', 50, 720, { slot: 'box-right' }), F('sms', 'Avisos por SMS', 50, 695, { slot: 'box-right' }),
    F('papel', 'Factura en papel', 50, 670, { slot: 'box-right' }), F('urgente', 'Envío urgente', 50, 645, { slot: 'box-right' }), F('datos', 'Ceder datos a terceros', 50, 620, { slot: 'box-right' }),
  ]],
  B: [[
    T('PREFERENCIAS DEL CLIENTE', 50, 790, { title: true }),
    F('datos', 'Ceder datos a terceros', 70, 720, { slot: 'box-left' }), F('email', 'Avisos por correo electrónico', 70, 695, { slot: 'box-left' }),
    F('papel', 'Factura impresa', 70, 670, { slot: 'box-left' }), F('sms', 'Avisos por SMS', 70, 645, { slot: 'box-left' }),
  ]],
  fields: [chk('email', 'avisos.email'), chk('sms', 'avisos.sms'), chk('papel', 'factura.papel'), chk('urgente', 'envio.urgente'), chk('datos', 'datos.ceder')],
});
