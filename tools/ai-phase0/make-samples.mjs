#!/usr/bin/env node
// Genera pares A/B sintéticos (datos inventados) en sample/<caso>/ con A.pdf, A.json, B.pdf, B.json y expected.json.
// `expected.json` es la solución correcta de cada campo de A en B: { id, page, x, y } o { id, gone: true }.
// Cada campo se define por la etiqueta a la que acompaña (clave `k`): el valor va tras el texto de la etiqueta si tiene
// línea de relleno, o a (dx, dy) del inicio de la etiqueta si no. La solución esperada sale de la etiqueta en B.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = new URL('sample/', import.meta.url);
const ink = rgb(0.12, 0.16, 0.22);
const gray = rgb(0.45, 0.5, 0.58);
const rule = rgb(0.72, 0.76, 0.82);
const A4 = [595, 842];
const LETTER = [612, 792];

// Elemento con clave: etiqueta con línea de relleno opcional. Elemento sin clave: texto fijo.
const L = (k, text, x, y, o = {}) => ({ k, text, x, y, ruleLen: 200, ...o });
const T = (text, x, y, o = {}) => ({ text, x, y, ...o });

async function render(size, pages) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const els of pages) {
    const page = doc.addPage(size);
    for (const e of els) {
      if (e.band) page.drawRectangle({ x: 0, y: e.y, width: size[0], height: e.band, color: rgb(0.1, 0.32, 0.5) });
      const isLabel = !!e.k;
      const b = e.bold ?? (isLabel || e.title);
      page.drawText(e.text, { x: e.x, y: e.y, size: e.size ?? (e.title ? 18 : isLabel ? 10 : 9), font: b ? bold : font, color: e.white ? rgb(1, 1, 1) : isLabel || e.title ? ink : gray });
      if (isLabel && e.ruleLen) {
        const w = (b ? bold : font).widthOfTextAtSize(e.text, 10);
        page.drawLine({ start: { x: e.x + w + 6, y: e.y - 3 }, end: { x: e.x + w + 6 + e.ruleLen, y: e.y - 3 }, thickness: 0.6, color: rule });
      }
    }
  }
  return doc.save();
}

const widthDoc = await PDFDocument.create();
const widthFont = await widthDoc.embedFont(StandardFonts.HelveticaBold);
// Posición del campo: si la etiqueta lleva línea de relleno, el valor se escribe justo tras el texto de la etiqueta
// (como haría una persona), así que depende de su anchura; si no, se mide desde el inicio de la etiqueta.
const anchorX = (e, dx) => (e.ruleLen > 0 ? e.x + widthFont.widthOfTextAtSize(e.text, 10) + 8 : e.x + dx);
const pos = (pages, k) => {
  for (let i = 0; i < pages.length; i++) {
    const e = pages[i].find((x) => x.k === k);
    if (e) return { page: i + 1, x: e.x, y: e.y, el: e };
  }
  return null;
};
const r1 = (n) => Math.round(n * 10) / 10;

async function build(name, c) {
  const dir = new URL(`${name}/`, OUT);
  await mkdir(dir, { recursive: true });
  const aJson = { pages: c.A.pages.map((_, i) => ({ num: i + 1, fields: [] })) };
  const expected = [];
  const bJson = { pages: c.B.pages.map((_, i) => ({ num: i + 1, fields: [] })) };
  const counters = new Map();
  for (const f of c.fields) {
    const a = pos(c.A.pages, f.k);
    const { k, dx, dy, ...rest } = f;
    const field = { x: r1(anchorX(a.el, dx)), y: r1(a.y + dy), ...rest };
    aJson.pages[a.page - 1].fields.push(field);
  }
  // ids = p<página>-f<posición en la página>, igual que flattenFields del script
  for (const page of aJson.pages) page.fields.forEach(() => {});
  const order = [];
  for (const f of c.fields) order.push(f);
  const perPage = new Map();
  for (const f of order) {
    const a = pos(c.A.pages, f.k);
    const n = (perPage.get(a.page) ?? 0) + 1;
    perPage.set(a.page, n);
    const id = `p${a.page}-f${n}`;
    const b = pos(c.B.pages, f.k);
    const { k, dx, dy, ...rest } = f;
    if (!b || c.gone?.includes(f.k)) {
      expected.push({ id, gone: true });
      continue;
    }
    const field = { x: r1(anchorX(b.el, dx)), y: r1(b.y + dy), ...rest };
    expected.push({ id, page: b.page, x: field.x, y: field.y });
    bJson.pages[b.page - 1].fields.push(field);
  }
  for (const n of c.newFields ?? []) {
    const b = pos(c.B.pages, n.k);
    const { k, dx, dy, ...rest } = n;
    bJson.pages[b.page - 1].fields.push({ x: r1(anchorX(b.el, dx)), y: r1(b.y + dy), ...rest });
  }
  void counters;
  await writeFile(new URL('A.pdf', dir), await render(c.A.size ?? A4, c.A.pages));
  await writeFile(new URL('B.pdf', dir), await render(c.B.size ?? A4, c.B.pages));
  await writeFile(new URL('A.json', dir), JSON.stringify(aJson, null, 2) + '\n');
  await writeFile(new URL('B.json', dir), JSON.stringify(bJson, null, 2) + '\n');
  await writeFile(new URL('expected.json', dir), JSON.stringify(expected, null, 2) + '\n');
  await writeFile(new URL('README.md', dir), `# ${name}\n\n${c.about}\n`);
  console.log(`✓ ${name} (${expected.length} campos)`);
}

const txt = (id, k, o = {}) => ({ k, dx: 0, dy: 0, type: 'text', fontSize: 11, mapField: `{{${id}}}`, ...o });
const val = (id, k, dx, o = {}) => txt(id, k, { dx, dy: 2, ...o });
const chk = (id, k, o = {}) => ({ k, dx: -18, dy: 0, type: 'check', fontSize: 12, mapField: id, ...o });

// 1. Factura: bloques desplazados en la misma página, una etiqueta renombrada y dos campos que pasan a la página 2.
await build('factura-desplazada', {
  about: 'Mismo documento rediseñado (el campo sigue al texto de su etiqueta, que cambia de anchura): los bloques bajan 20 pt, «Base imponible» pasa a llamarse «Base» y «Pagada» pasa a la página 2.',
  A: {
    pages: [[
      T('FACTURA', 50, 795, { title: true, white: true, band: 70 }), L('num', 'Nº', 400, 800, { white: true, ruleLen: 0 }),
      L('cliente', 'Cliente', 50, 720), L('nif', 'NIF', 50, 680), L('dir', 'Dirección', 50, 640), L('fecha', 'Fecha', 400, 720, { ruleLen: 120 }),
      L('concepto', 'Concepto', 50, 560), L('base', 'Base imponible', 50, 480), L('iva', 'IVA (21%)', 50, 440), L('total', 'Total', 50, 400),
      L('pagada', 'Pagada', 50, 340, { ruleLen: 0 }), T('Textil Norte S.L. · CIF B00000000', 50, 40),
    ]],
  },
  B: {
    pages: [
      [
        T('FACTURA', 50, 795, { title: true, white: true, band: 70 }), L('num', 'Nº', 400, 800, { white: true, ruleLen: 0 }),
        L('cliente', 'Cliente', 50, 700), L('nif', 'NIF', 50, 660), L('dir', 'Dirección', 50, 620), L('fecha', 'Fecha', 400, 700, { ruleLen: 120 }),
        L('concepto', 'Concepto', 50, 540), L('base', 'Base', 50, 460), L('iva', 'IVA (21%)', 50, 420), L('total', 'Total', 50, 380),
        T('Continúa en la página 2', 50, 40),
      ],
      [T('Estado del pago', 50, 790, { title: true }), L('pagada', 'Pagada', 50, 700, { ruleLen: 0 })],
    ],
  },
  fields: [
    val('cliente.nombre', 'cliente', 70), val('cliente.nif', 'nif', 40), val('cliente.direccion', 'dir', 70), val('factura.fecha', 'fecha', 50),
    val('factura.numero', 'num', 25, { fontSize: 14, color: '#FFFFFF' }), val('linea.concepto', 'concepto', 75),
    val('base', 'base', 115, { type: 'number', decimals: 2, appender: ' €' }), val('iva', 'iva', 70, { type: 'number', decimals: 2, appender: ' €' }),
    val('total', 'total', 40, { type: 'number', decimals: 2, appender: ' €', fontSize: 14 }), chk('pagada', 'pagada'),
  ],
});

// 2. Alta de cliente: la sección de datos bancarios pasa de la página 1 a la 2.
const datosPersonales = (dy) => [
  L('nombre', 'Nombre', 50, 700 - dy), L('apellidos', 'Apellidos', 50, 670 - dy), L('nacim', 'Fecha de nacimiento', 50, 640 - dy, { ruleLen: 110 }),
  L('tel', 'Teléfono', 330, 700 - dy, { ruleLen: 120 }), L('email', 'Correo electrónico', 330, 670 - dy, { ruleLen: 90 }),
];
await build('alta-banco-otra-pagina', {
  about: 'En B el bloque «Datos bancarios» (titular, IBAN, banco, aceptación) pasa a la página 2 y los datos personales bajan 25 pt.',
  A: { pages: [[T('ALTA DE CLIENTE', 50, 780, { title: true }), T('Datos personales', 50, 735, { bold: true }), ...datosPersonales(0), T('Datos bancarios', 50, 540, { bold: true }),
    L('titular', 'Titular de la cuenta', 50, 500), L('iban', 'IBAN', 50, 470), L('banco', 'Entidad', 50, 440), L('acepto', 'Acepto la domiciliación de recibos', 70, 400, { ruleLen: 0 })]] },
  B: { pages: [
    [T('ALTA DE CLIENTE', 50, 780, { title: true }), T('Impreso 2026-A · Datos personales', 50, 735, { bold: true }), ...datosPersonales(25), T('Los datos bancarios están en la página siguiente.', 50, 120)],
    [T('Datos bancarios', 50, 780, { bold: true }), L('titular', 'Titular de la cuenta', 50, 700), L('iban', 'IBAN', 50, 670), L('banco', 'Entidad', 50, 640), L('acepto', 'Acepto la domiciliación de recibos', 70, 600, { ruleLen: 0 })],
  ] },
  fields: [
    val('cliente.nombre', 'nombre', 55), val('cliente.apellidos', 'apellidos', 60), val('cliente.nacimiento', 'nacim', 125), val('cliente.tel', 'tel', 60), val('cliente.email', 'email', 105),
    val('banco.titular', 'titular', 110), val('banco.iban', 'iban', 35), val('banco.entidad', 'banco', 50), chk('acepto', 'acepto'),
  ],
});

// 3. Contrato: etiquetas reescritas, una desaparece (con su campo) y aparece una nueva.
await build('contrato-etiquetas-cambian', {
  about: 'B reescribe etiquetas («Nombre y apellidos»→«Nombre completo», «D.N.I.»→«NIF / NIE», «Domicilio»→«Dirección postal», «Teléfono fijo»→«Teléfono»), elimina «Fax» (su campo ya no existe) y añade «Móvil» (campo nuevo, no está en A).',
  A: { pages: [[T('CONTRATO DE SERVICIOS', 50, 780, { title: true }), T('Datos del contratante', 50, 740, { bold: true }),
    L('nombre', 'Nombre y apellidos', 50, 700), L('dni', 'D.N.I.', 50, 660, { ruleLen: 150 }), L('dom', 'Domicilio', 50, 620), L('tel', 'Teléfono fijo', 50, 580, { ruleLen: 150 }), L('fax', 'Fax', 50, 540, { ruleLen: 150 }),
    L('lugar', 'Lugar', 50, 150, { ruleLen: 160 }), L('fecha', 'Fecha de firma', 380, 150, { ruleLen: 90 })]] },
  B: { pages: [[T('CONTRATO DE SERVICIOS', 50, 780, { title: true }), T('Datos del contratante', 50, 740, { bold: true }),
    L('nombre', 'Nombre completo', 50, 700), L('dni', 'NIF / NIE', 50, 660, { ruleLen: 150 }), L('dom', 'Dirección postal', 50, 620), L('tel', 'Teléfono', 50, 580, { ruleLen: 150 }), L('movil', 'Móvil', 50, 540, { ruleLen: 150 }),
    L('lugar', 'Lugar de firma', 50, 150, { ruleLen: 130 }), L('fecha', 'Fecha de firma', 380, 150, { ruleLen: 90 })]] },
  gone: ['fax'],
  fields: [
    val('contratante.nombre', 'nombre', 100), val('contratante.dni', 'dni', 40), val('contratante.domicilio', 'dom', 55), val('contratante.tel', 'tel', 70), val('contratante.fax', 'fax', 30),
    val('firma.lugar', 'lugar', 40), val('firma.fecha', 'fecha', 80),
  ],
  newFields: [val('contratante.movil', 'movil', 40)],
});

// 4. Parte de horas: de A4 a Carta, con la maquetación reescalada.
const sc = (x, y) => [Math.round((x * 612) / 595), Math.round((y * 792) / 842)];
const parte = (f) => {
  const p = (x, y) => (f ? sc(x, y) : [x, y]);
  return [[
    T('PARTE DE HORAS', ...p(40, 790), { title: true }),
    L('emp', 'Empleado', ...p(40, 740)), L('dep', 'Departamento', ...p(40, 700)), L('fecha', 'Fecha', ...p(330, 740), { ruleLen: 100 }), L('horas', 'Horas trabajadas', ...p(330, 700), { ruleLen: 60 }),
    L('obs', 'Observaciones', ...p(40, 620)), L('firma', 'Firma del responsable', ...p(330, 120), { ruleLen: 90 }),
  ]];
};
await build('parte-a4-a-carta', {
  about: 'A mide 595×842 pt (A4) y B 612×792 pt (Carta); B reparte los mismos bloques con la escala de la página. La solución espera la posición de la etiqueta en B más el mismo desplazamiento (sin reescalar el desplazamiento).',
  A: { size: A4, pages: parte(false) }, B: { size: LETTER, pages: parte(true) },
  fields: [val('emp.nombre', 'emp', 60), val('emp.dep', 'dep', 80), val('parte.fecha', 'fecha', 40), val('parte.horas', 'horas', 90), val('parte.obs', 'obs', 75), val('parte.firma', 'firma', 110)],
});

// 5. Solicitud: B antepone una página de instrucciones y mueve un campo dentro de la página.
await build('solicitud-portada-nueva', {
  about: 'A tiene 2 páginas y B 3: se antepone una página de instrucciones, así que todo pasa a la página siguiente; además «Importe solicitado» se coloca a la derecha de «Motivo».',
  A: { pages: [
    [T('SOLICITUD DE AYUDA', 50, 780, { title: true }), L('nom', 'Solicitante', 50, 700), L('nif', 'NIF', 50, 660, { ruleLen: 120 }), L('prov', 'Provincia', 300, 660, { ruleLen: 110 })],
    [T('Datos de la ayuda', 50, 780, { bold: true }), L('motivo', 'Motivo', 50, 700), L('imp', 'Importe solicitado', 50, 660, { ruleLen: 100 }), L('firma', 'Firma del solicitante', 50, 200, { ruleLen: 170 })],
  ] },
  B: { pages: [
    [T('INSTRUCCIONES', 50, 780, { title: true }), T('1. Rellene todos los apartados en mayúsculas.', 50, 740), T('2. Adjunte fotocopia del documento de identidad.', 50, 720), T('3. Entregue el impreso en la ventanilla de registro.', 50, 700)],
    [T('SOLICITUD DE AYUDA', 50, 780, { title: true }), L('nom', 'Solicitante', 50, 700), L('nif', 'NIF', 50, 660, { ruleLen: 120 }), L('prov', 'Provincia', 300, 660, { ruleLen: 110 })],
    [T('Datos de la ayuda', 50, 780, { bold: true }), L('motivo', 'Motivo', 50, 700, { ruleLen: 130 }), L('imp', 'Importe solicitado', 330, 700, { ruleLen: 80 }), L('firma', 'Firma del solicitante', 50, 200, { ruleLen: 170 })],
  ] },
  fields: [
    val('sol.nombre', 'nom', 70), val('sol.nif', 'nif', 30), val('sol.provincia', 'prov', 55), val('ayuda.motivo', 'motivo', 45), val('ayuda.importe', 'imp', 95, { type: 'number', decimals: 2 }), val('ayuda.firma', 'firma', 110),
  ],
});

// 6. Pedido: el texto «Total» aparece dos veces y los bloques se recolocan (ambigüedad entre anclas).
await build('pedido-totales-repetidos', {
  about: 'El texto «Total» aparece en la cabecera y en el pie; en B ambos bloques cambian de sitio. Comprueba que la IA no confunde las dos anclas iguales.',
  A: { pages: [[T('PEDIDO', 50, 790, { title: true }), L('refe', 'Referencia', 50, 740, { ruleLen: 90 }), L('totcab', 'Total', 450, 790, { ruleLen: 0 }),
    L('cli', 'Cliente', 50, 700), L('subt', 'Subtotal', 380, 300, { ruleLen: 0 }), L('iva', 'IVA', 380, 280, { ruleLen: 0 }), L('totpie', 'Total', 380, 260, { ruleLen: 0 }), L('obs', 'Observaciones', 50, 300, { ruleLen: 130 })]] },
  B: { pages: [[T('PEDIDO', 50, 790, { title: true }), L('refe', 'Referencia', 50, 740, { ruleLen: 90 }), L('totcab', 'Total', 380, 790, { ruleLen: 0 }),
    L('cli', 'Cliente', 50, 700), L('subt', 'Subtotal', 380, 380, { ruleLen: 0 }), L('iva', 'IVA', 380, 360, { ruleLen: 0 }), L('totpie', 'Total', 380, 340, { ruleLen: 0 }), L('obs', 'Observaciones', 50, 380, { ruleLen: 130 })]] },
  fields: [
    val('pedido.ref', 'refe', 80), val('pedido.totalcab', 'totcab', 40, { type: 'number', decimals: 2 }), val('pedido.cliente', 'cli', 60),
    val('pedido.subtotal', 'subt', 60, { type: 'number', decimals: 2 }), val('pedido.iva', 'iva', 60, { type: 'number', decimals: 2 }), val('pedido.total', 'totpie', 60, { type: 'number', decimals: 2 }), val('pedido.obs', 'obs', 90),
  ],
});
