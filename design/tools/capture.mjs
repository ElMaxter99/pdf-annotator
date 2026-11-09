import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire('/home/user/pdf-annotator/');
const { chromium } = require('playwright');
const REPO = '/home/user/pdf-annotator';
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const PDF = join(REPO, 'examples/factura-ejemplo.pdf');
const JSONTXT = readFileSync(join(REPO, 'examples/anotaciones-ejemplo.json'), 'utf8');

const PROPS = ['display','position','top','left','right','bottom','width','height','margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-top-style','border-top-color','border-right-width','border-right-style','border-right-color','border-bottom-width','border-bottom-style','border-bottom-color','border-left-width','border-left-style','border-left-color','border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius','box-sizing','background-color','background-image','color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','text-decoration-line','white-space','text-overflow','overflow-x','overflow-y','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','align-items','justify-content','align-self','gap','grid-template-columns','grid-template-rows','grid-template-areas','grid-column-start','grid-column-end','grid-row-start','grid-row-end','grid-auto-flow','grid-auto-columns','grid-auto-rows','place-items','align-content','justify-items','opacity','box-shadow','transform','z-index','visibility','vertical-align','object-fit','text-shadow','list-style-type','word-break','overflow-wrap'];

async function extract(page, rootSel) {
  return page.evaluate(({ PROPS, rootSel }) => {
    const defaults = new Map();
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:absolute;left:-9999px;width:800px;height:600px;visibility:hidden';
    document.body.appendChild(frame);
    const fdoc = frame.contentDocument;
    fdoc.open(); fdoc.write('<!doctype html><html><body></body></html>'); fdoc.close();
    const defFor = (tag) => {
      if (defaults.has(tag)) return defaults.get(tag);
      const el = fdoc.createElement(tag);
      fdoc.body.appendChild(el);
      const cs = frame.contentWindow.getComputedStyle(el);
      const d = {};
      for (const p of PROPS) d[p] = cs.getPropertyValue(p);
      defaults.set(tag, d);
      return d;
    };
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{\{/g, '{​{').replace(/\}\}/g, '}​}');
    const escA = (s) => esc(s).replace(/"/g, '&quot;');
    const canvases = [];
    const SKIP = new Set(['SCRIPT','STYLE','LINK','META','TITLE','NOSCRIPT','TEMPLATE','IFRAME','OBJECT','EMBED']);
    const VOID = new Set(['img','input','br','hr']);
    const INH = new Set(['color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','white-space','visibility','list-style-type','word-break','overflow-wrap','text-shadow','text-decoration-line']);
    function styleOf(el, tag, rect) {
      const cs = getComputedStyle(el);
      const d = defFor(tag);
      const pcs = el !== window.__rootEl && el.parentElement && el.parentElement !== document.documentElement ? getComputedStyle(el.parentElement) : null;
      const out = [];
      for (const p of PROPS) {
        let v = cs.getPropertyValue(p);
        if (!v) continue;
        if (INH.has(p)) { if (pcs && v === pcs.getPropertyValue(p) && el.tagName !== 'BODY') continue; }
        else if (v === d[p]) continue;
        if (p === 'background-image' && /url\(/.test(v)) continue;
        if (['top','left','right','bottom'].includes(p) && cs.position === 'static') continue;
        if (p === 'font-family') v = v.replace(/"/g, "'");
        out.push(`${p}:${v}`);
      }
      const par = el.parentElement;
      if (par && el.classList.contains('canvas-container') && ['block','flex'].includes(getComputedStyle(par).display) && ['block','flex','grid'].includes(cs.display) && cs.position !== 'absolute' && cs.position !== 'fixed' && cs.float === 'none') {
        const pr = par.getBoundingClientRect(); const pcs2 = getComputedStyle(par);
        const base = pr.left + parseFloat(pcs2.borderLeftWidth) + parseFloat(pcs2.paddingLeft) - par.scrollLeft;
        const want = rect.left - base;
        const have = parseFloat(cs.marginLeft) || 0;
        if (Math.abs(want - have) > 1 && want > 0 && want < pr.width) out.push(`margin-left:${Math.round(want * 100) / 100}px`);
      }
      out.push(`box-sizing:border-box`, `width:${rect.width}px`, `height:${rect.height}px`);
      return out.filter((s, i, a) => !(i < a.length - 3 && /^(width|height|box-sizing):/.test(s))).join(';');
    }
    function walk(node, depth) {
      if (node.nodeType === 3) return esc(node.nodeValue);
      if (node.nodeType !== 1) return '';
      const el = node;
      const tag = el.tagName.toLowerCase();
      if (SKIP.has(el.tagName)) return '';
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return '';
      const rect = el.getBoundingClientRect();
      if (tag === 'canvas') {
        if (el.classList.contains('canvas--pdf')) {
          const idx = canvases.length;
          canvases.push(el.toDataURL('image/png'));
          return `<img alt="" src="__CANVAS_${idx}__" style="${styleOf(el, 'canvas', rect).replace(/"/g, "'")};background-color:#fff">`;
        }
        try {
          const c2 = el.getContext('2d'); const d = c2.getImageData(0, 0, el.width, el.height).data; let any = false;
          for (let i = 3; i < d.length; i += 4) { if (d[i]) { any = true; break; } }
          if (any) { const idx = canvases.length; canvases.push(el.toDataURL('image/png')); return `<img alt="" src="__CANVAS_${idx}__" style="${styleOf(el, 'canvas', rect).replace(/"/g, "'")};pointer-events:none">`; }
        } catch {}
        return `<div style="width:${rect.width}px;height:${rect.height}px;position:${cs.position === 'static' ? 'absolute' : cs.position};top:0;left:0;pointer-events:none"></div>`;
      }
      if (tag === 'svg') {
        const clone = el.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('style', `width:${rect.width}px;height:${rect.height}px;color:${cs.color};display:${cs.display};flex-shrink:0`);
        return clone.outerHTML.replace(/\{\{/g, '{​{');
      }
      let attrs = '';
      for (const a of ['type','placeholder','aria-label','role','aria-selected','aria-pressed','aria-expanded','title','alt','for','id','checked','disabled','lang','rows']) {
        if (el.hasAttribute(a) && !(tag === 'a' && a === 'href')) {
          if (a === 'id') continue;
          attrs += ` ${a}="${escA(el.getAttribute(a))}"`;
        }
      }
      if (tag === 'input') {
        if (el.type === 'file') return '';
        attrs += ` value="${escA(el.value)}"`;
        if (el.type === 'checkbox' || el.type === 'radio') attrs += el.checked ? ' checked' : '';
        attrs = attrs.replace(/ type="[^"]*"/, '') + ` type="${el.type}"`;
      }
      if (tag === 'img') attrs += ` src="__IMG__:${escA(el.getAttribute('src') || '')}"`;
      const cls = el.getAttribute('class');
      const style = styleOf(el, tag, rect);
      const dataTag = cls ? ` data-c="${escA(cls.split(/\s+/)[0])}"` : '';
      const open = `<${tag === 'a' ? 'a' : tag}${attrs}${dataTag} style="${style.replace(/"/g, "'")}"`;
      if (VOID.has(tag)) return `${open}>`;
      let inner = '';
      if (tag === 'textarea') inner = esc(el.value);
      else if (tag === 'select') {
        for (const o of el.options) inner += `<option${o.selected ? ' selected' : ''}>${esc(o.textContent)}</option>`;
      } else for (const c of el.childNodes) inner += walk(c, depth + 1);
      return `${open}>${inner}</${tag}>`;
    }
    const root = document.querySelector(rootSel);
    window.__rootEl = root;
    const rr = root.getBoundingClientRect();
    const html = walk(root, 0);
    const rootCs = getComputedStyle(root.parentElement || root);
    return { html, canvases, w: Math.ceil(rr.width), h: Math.ceil(rr.height), bg: getComputedStyle(document.body).backgroundColor, bgImg: getComputedStyle(document.body).backgroundImage };
  }, { PROPS, rootSel });
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const index = [];

async function newPage(w, h, theme) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'es-ES' });
  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    try { localStorage.setItem('pdf-annotator-theme', t); localStorage.setItem('pdf-annotator.language', 'es-ES'); } catch {}
  }, theme);
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  await page.route('**/_vercel/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  return page;
}
async function landing(page) {
  await page.goto('http://127.0.0.1:4300/landing');
  await page.waitForTimeout(800);
}
async function workspace(page, { zoomOut = 4, tab = 'Anotaciones', json = true } = {}) {
  await landing(page);
  await page.locator('input[type=file]').setInputFiles(PDF);
  await page.waitForURL('**/workspace');
  await page.locator('.canvas--pdf').waitFor();
  await page.waitForTimeout(1000);
  for (let i = 0; i < zoomOut; i++) { await page.keyboard.press('-'); await page.waitForTimeout(120); }
  await openTab(page, 'Anotaciones');
  if (json) { await applyJson(page, JSONTXT); }
  if (tab !== 'Anotaciones') await openTab(page, tab);
  if (tab === 'Avanzado') { try { const t = page.locator('.advanced-toggle'); if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click(); await page.waitForTimeout(300); } catch {} }
  await page.evaluate(() => document.activeElement?.blur());
}
async function openTab(page, name) {
  await page.getByRole('tab', { name: new RegExp(`^\\s*${name}`) }).click();
  await page.waitForTimeout(250);
}
async function applyJson(page, text) {
  await page.locator('textarea.json-editor').fill(text);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(700);
}
async function snap(id, name, file, page, rootSel, extra = {}) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${file}.real.png`) });
  const r = await extract(page, rootSel);
  const png = [];
  r.canvases.forEach((d, i) => { const f = `${file}-canvas${i}.png`; writeFileSync(join(OUT, f), Buffer.from(d.split(',')[1], 'base64')); png.push(f); });
  writeFileSync(join(OUT, `${file}.body.html`), r.html);
  index.push({ id, name, file, w: r.w, h: r.h, bg: r.bg, canvases: png, ...extra });
  console.log('ok', id, name, r.w, r.h, r.html.length);
}
const SCENES = JSON.parse(process.env.SCENES || 'null');
const want = (id) => !SCENES || SCENES.includes(id);

// ---- Landing
for (const [theme, id, nameS] of [['dark', 'V-01', 'Landing'], ['light', 'V-02', 'Landing claro']]) {
  if (!want(id)) continue;
  const p = await newPage(1720, 900, theme);
  await landing(p);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: 1720, height: Math.max(900, h) });
  await p.waitForTimeout(400);
  await snap(id, nameS, `${id}`, p, 'app-root, body > app-root, body', { theme });
  await p.context().close();
}
// ---- Workspace
const W = [
  ['V-04', 'Workspace · Anotaciones', { tab: 'Anotaciones' }, 'dark', 1720, 900],
  ['V-05', 'Workspace · Documento', { tab: 'Documento', json: true }, 'dark', 1720, 900],
  ['V-06', 'Workspace · Plantillas', { tab: 'Plantillas' }, 'dark', 1720, 900],
  ['V-07', 'Workspace · Avanzado', { tab: 'Avanzado' }, 'dark', 1720, 900],
  ['V-08', 'Workspace · Anotaciones (claro)', { tab: 'Anotaciones' }, 'light', 1720, 900],
  ['V-09', 'Workspace 1280', { tab: 'Anotaciones', zoomOut: 3 }, 'dark', 1280, 800],
];
for (const [id, name, opts, theme, w, h] of W) {
  if (!want(id)) continue;
  const p = await newPage(w, h, theme);
  await workspace(p, opts);
  let hh = h;
  if (false) { hh = await p.evaluate(() => Math.max(document.documentElement.scrollHeight, innerHeight)); await p.setViewportSize({ width: w, height: hh }); await p.waitForTimeout(400); }
  await snap(id, name, id, p, 'body', { theme });
  await p.context().close();
}
// ---- States
async function stateScene(id, name, fn, { theme = 'dark', w = 1720, h = 900, tab = 'Anotaciones', zoomOut = 2, json = false } = {}) {
  if (!want(id)) return;
  const p = await newPage(w, h, theme);
  await workspace(p, { tab, zoomOut, json });
  await fn(p);
  await snap(id, name, id, p, 'body', { theme });
  await p.context().close();
}
const FIELDS = { pages: [{ num: 1, fields: [
  { x: 150, y: 722, mapField: '{{cliente.nombre}}', fontSize: 12, type: 'text' },
  { x: 125, y: 682, mapField: '{{cliente.nif}}', fontSize: 12, type: 'text' },
  { x: 450, y: 722, mapField: '{{factura.fecha}}', fontSize: 12, type: 'text' },
  { x: 160, y: 482, mapField: '1250.5', fontSize: 12, type: 'number', decimals: 2, appender: ' €' },
  { x: 125, y: 342, mapField: 'pagada', fontSize: 14, type: 'check' },
] }] };
const box = async (p) => (await p.locator('.hitbox').boundingBox());
await stateScene('V-11', 'Crear anotación (editor flotante)', async (p) => {
  await applyJson(p, JSON.stringify(FIELDS)); await p.evaluate(() => document.activeElement?.blur());
  const b = await box(p); await p.mouse.click(b.x + b.width * 0.35, b.y + b.height * 0.55);
  await p.locator('.annotation-editor').waitFor(); await p.keyboard.type('{{cliente.telefono}}');
});
await stateScene('V-12', 'Editar anotación (editor flotante)', async (p) => {
  await applyJson(p, JSON.stringify(FIELDS)); await p.evaluate(() => document.activeElement?.blur());
  await p.locator('.annotation').nth(0).click(); await p.locator('.annotation-editor.editing').waitFor();
});
await stateScene('V-13', 'Selección múltiple y barra de alineación', async (p) => {
  await applyJson(p, JSON.stringify(FIELDS)); await p.evaluate(() => document.activeElement?.blur());
  await p.locator('.annotation').nth(0).click({ modifiers: ['Shift'] });
  await p.locator('.annotation').nth(1).click({ modifiers: ['Shift'] });
  await p.locator('.annotation').nth(2).click({ modifiers: ['Shift'] });
});
await stateScene('V-14', 'Diálogo de atajos', async (p) => {
  await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('?'); await p.waitForTimeout(500);
}, { json: true });
await stateScene('V-15', 'JSON con error de sintaxis', async (p) => {
  await p.locator('textarea.json-editor').fill('{ "pages": [ { "num": 1, "fields": [ { "x": 10, "y": } ] } ] }');
  await p.waitForTimeout(700);
});
await stateScene('V-16', 'Aviso de importación (toast)', async (p) => {
  await applyJson(p, JSON.stringify({ pages: [{ num: 1, fields: [{ x: 9999, y: 50, mapField: 'fuera', fontSize: 12, type: 'text' }, { x: 100, y: 100, mapField: 'ok', fontSize: 4, type: 'text' }] }, { num: 9, fields: [{ x: 10, y: 10, mapField: 'p9', fontSize: 12, type: 'text' }] }] }));
}, { json: false });
await stateScene('V-17', 'Guías y rejilla activas', async (p) => {
  await p.getByText(/Activar guías/i).first().click();
  await p.waitForTimeout(400);
  try { await p.getByText(/Mostrar rejilla|Rejilla/i).first().click({ timeout: 2000 }); } catch {}
  await p.waitForTimeout(500);
}, { tab: 'Avanzado', json: true });
await stateScene('V-18', 'Árbol JSON', async (p) => {
  const t = p.locator('.json-toolbar__view-toggle-option').nth(1);
  try { await t.click({ timeout: 3000 }); } catch {}
  await p.waitForTimeout(500);
}, { json: true });


// ---- Extra desktop states
if (want('V-03')) {
  const p = await newPage(1720, 900, 'dark');
  await workspace(p, { tab: 'Anotaciones', zoomOut: 2, json: false });
  await applyJson(p, JSON.stringify(FIELDS)); await p.waitForTimeout(2500);
  await p.goto('http://127.0.0.1:4300/landing'); await p.waitForTimeout(1200);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: 1720, height: Math.max(900, h) }); await p.waitForTimeout(400);
  await snap('V-03', 'Landing con sesión recuperable', 'V-03', p, 'app-root, body > app-root, body', { theme: 'dark' });
  await p.context().close();
}
if (want('V-10')) {
  const p = await newPage(1720, 900, 'dark');
  await workspace(p, { tab: 'Anotaciones', zoomOut: 2, json: false });
  await applyJson(p, JSON.stringify(FIELDS)); await p.evaluate(() => document.activeElement?.blur());
  await openTab(p, 'Plantillas');
  await p.locator('input[type=text]').first().fill('Factura trimestral');
  await p.getByRole('button', { name: /Guardar/i }).first().click(); await p.waitForTimeout(600);
  await p.locator('input[type=text]').first().fill('Factura mensual');
  await snap('V-10', 'Workspace · Plantillas con plantilla guardada', 'V-10', p, 'body', { theme: 'dark' });
  await p.context().close();
}
if (want('V-19')) {
  const p = await newPage(1720, 900, 'dark');
  await landing(p);
  writeFileSync('/tmp/nota.txt', 'esto no es un pdf');
  await p.locator('input[type=file]').setInputFiles('/tmp/nota.txt'); await p.waitForTimeout(700);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: 1720, height: Math.max(900, h) }); await p.waitForTimeout(400);
  await snap('V-19', 'Landing · archivo no válido (aviso)', 'V-19', p, 'app-root, body > app-root, body', { theme: 'dark' });
  await p.context().close();
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
await browser.close();
