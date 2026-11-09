# Genera las mesas P-24 a P-29 (rediseño simple de la vista inicial, 3 variantes, estados y guía con «así se ve»).
# Uso: python3 design/tools/hboards.py <carpeta-de-salida>   (reutiliza CSS, iconos y tokens de gboards.py)
import json, os, sys
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else [sys.argv[0], 'canvas/project']
sys.path.insert(0, os.path.dirname(__file__))
import gboards as g
from gboards import svg, mock, THEMES, LOGO, shot, CSS as BASE

OUT = sys.argv[1]
H = '''
.hp{width:1720px;height:900px;position:relative;overflow:hidden;background:var(--bg);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:15px;display:flex;flex-direction:column}
.hp h1,.hp h2,.hp h3,.hp p{margin:0}
.top{display:flex;align-items:center;justify-content:space-between;padding:22px 44px}
.b2{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--accent);font-size:18px}
.b2 small{color:var(--muted);font-weight:400;font-size:13px}
.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:8px 16px;font-size:14px;color:var(--text);min-height:40px}
.tools{display:flex;gap:10px}
.foot{display:flex;justify-content:space-between;align-items:center;padding:18px 44px;color:var(--muted);font-size:14px}
.foot .ls{display:flex;gap:26px}.foot .ls a{color:var(--muted);display:inline-flex;gap:8px;align-items:center}
.foot .ls a.hl{color:var(--accent);font-weight:600}
.mn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;min-height:0}
.bg{position:absolute;inset:0;background:radial-gradient(900px 500px at 50% 42%,color-mix(in srgb,var(--accent) 9%,transparent),transparent 70%);pointer-events:none}
.bigz{position:relative;width:1000px;height:500px;border:2px dashed color-mix(in srgb,var(--accent) 45%,var(--line));border-radius:32px;background:color-mix(in srgb,var(--accent) 3%,var(--panel));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;animation:march 1.6s linear infinite}
.bigz h2{font-size:48px;font-weight:700;letter-spacing:-.02em}
.bigz .sub2{font-size:19px;color:var(--muted)}
.bigz .mock{width:140px;height:188px;margin-bottom:6px}.bigz .mock .pg{width:140px;height:188px}
.btn.xl{min-height:56px;padding:0 32px;font-size:17px}
.ex{color:var(--accent);font-weight:600;font-size:16px;display:inline-flex;gap:8px;align-items:center}
.hint2{font-size:13px;color:var(--muted)}
.vals{display:flex;gap:46px;color:var(--muted);font-size:15px}
.vals span{display:inline-flex;gap:10px;align-items:center}.vals svg{color:var(--accent)}
.vals b{color:var(--text);font-weight:600}
.seg2{display:inline-flex;background:var(--soft);border-radius:999px;padding:5px}
.seg2 span{font-size:15px;font-weight:600;color:var(--muted);border-radius:999px;padding:9px 22px;display:inline-flex;gap:8px;align-items:center}
.seg2 span.on{background:var(--panel);color:var(--text);box-shadow:0 1px 6px rgba(0,0,0,.25)}
.card2{width:900px;background:var(--panel);border:1px solid var(--line);border-radius:28px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.28)}
.card2 .inner{border:2px dashed var(--line);border-radius:20px;height:380px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;background:var(--inset)}
.card2 .inner h2{font-size:38px;font-weight:700;letter-spacing:-.02em}
.frame{position:absolute;inset:20px;border:2px dashed color-mix(in srgb,var(--accent) 45%,var(--line));border-radius:36px;display:flex;flex-direction:column}
.frame .mn h2{font-size:64px;font-weight:700;letter-spacing:-.03em}
.zc{position:relative;border:2px dashed color-mix(in srgb,var(--accent) 45%,var(--line));border-radius:22px;background:color-mix(in srgb,var(--accent) 3%,var(--panel));padding:22px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;height:250px;justify-content:center}
.zc h3{font-size:22px;font-weight:700}.zc .mock{width:62px;height:84px;margin-bottom:2px}.zc .mock .pg{width:62px;height:84px}
.zc.act{border-style:solid;border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--panel));box-shadow:0 0 0 6px color-mix(in srgb,var(--accent) 16%,transparent)}
.zc.err{border-color:var(--danger);background:color-mix(in srgb,var(--danger) 7%,var(--panel))}
.zc.busy{border-style:solid;border-color:var(--line)}
.zc.focus{outline:3px solid var(--accent);outline-offset:4px}
.banner{display:flex;align-items:center;gap:14px;border-radius:16px;padding:12px 18px;background:color-mix(in srgb,var(--accent) 9%,var(--panel));border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);font-size:14px}
.win{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--inset);box-shadow:0 30px 70px rgba(0,0,0,.35)}
.win .bar2{display:flex;gap:6px;padding:10px 14px;background:var(--soft)}.win .bar2 i{width:10px;height:10px;border-radius:50%;background:#ff5f57}.win .bar2 i:nth-child(2){background:#febc2e}.win .bar2 i:nth-child(3){background:#28c840}
.win img{display:block;width:100%}
'''
CSS = BASE + H


def top(theme_lbl='Tema oscuro'):
    return (f'<div class="top"><div class="b2"><img src="{LOGO}" width="36" height="36" alt="">Pdf Annotator <small>v1.5.0</small></div>'
            f'<div class="tools"><span class="pill">{svg("globe",16)} Español ▾</span><span class="pill">{theme_lbl}</span></div></div>')


def foot():
    return (f'<div class="foot"><span>© 2026 · Código abierto · MIT</span><div class="ls"><a class="hl" href="#">{svg("layers",16)} Modo Lotes</a>'
            f'<a href="#">{svg("book",16)} Guía</a><a href="#">{svg("gh",16)} GitHub</a></div></div>')


VALS = (f'<div class="vals"><span>{svg("search",18)}<b>Coordenadas exactas</b></span><span>{svg("doc",18)}<b>JSON en vivo</b></span>'
        f'<span>{svg("lock",18)}<b>100 % en tu navegador</b></span></div>')

made = []


def board(code, title, body, theme, nm, h=900, cls='hp'):
    t = THEMES[theme]
    vars = ';'.join(f'--{k}:{v}' for k, v in t.items())
    fn = f'{code}-{nm}.dc.html'
    doc = f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{code} {title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>{CSS}</style>
</helmet>
<div class="{cls}" style="{vars};height:{h}px">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1720,"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{
    return {{}};
  }}
}}
</script>
</body>
</html>
'''
    os.makedirs(OUT, exist_ok=True)
    open(f'{OUT}/{fn}', 'w', encoding='utf8').write(doc)
    made.append((code, fn, f'{code} {title}', h))


# ---------------------------------------------------------------- variantes
def varA(theme):
    lbl = 'Tema oscuro' if theme == 'dark' else 'Tema claro'
    z = f'''<div class="bigz" role="button" aria-label="Arrastra aquí tu PDF">{mock()}<h2>Arrastra aquí tu PDF</h2><p class="sub2">o haz clic para buscarlo en tu equipo</p>
<div style="display:flex;gap:20px;align-items:center;margin-top:6px"><span class="btn xl">{svg("up",20)} Seleccionar PDF</span><span class="ex">{svg("spark",18)} Probar con un documento de ejemplo</span></div>
<p class="hint2">Solo PDF · no sale de tu navegador</p></div>'''
    return f'<div class="bg"></div>{top(lbl)}<div class="mn">{z}{VALS}</div>{foot()}'


board('P-24', 'Inicio · variante A · zona grande', varA('dark'), 'dark', 'inicio-a')
board('P-28', 'Inicio · variante A (claro)', varA('light'), 'light', 'inicio-a-claro')

zb = f'''<div class="card2"><div class="inner">{mock()}<h2>Arrastra aquí tu PDF</h2><p style="font-size:17px;color:var(--muted)">o haz clic para buscarlo en tu equipo</p>
<div style="display:flex;gap:18px;align-items:center"><span class="btn xl">{svg("up",20)} Seleccionar PDF</span><span class="ex">{svg("spark",18)} Probar con un ejemplo</span></div></div></div>'''
board('P-25', 'Inicio · variante B · tarjeta con modo', f'<div class="bg"></div>{top()}<div class="mn"><div class="seg2" role="tablist"><span class="on">{svg("edit",16)} Un PDF · Editor</span><span>{svg("layers",16)} Varios PDF · Lotes</span></div>{zb}<p class="hint2" style="font-size:14px">Solo PDF · no sale de tu navegador · <span style="color:var(--accent)">Con «Lotes» se aceptan hasta 50 PDF y plantillas JSON</span></p></div>{foot()}', 'dark', 'inicio-b')

zc = f'''<div class="frame"><div class="top" style="padding:22px 28px"><div class="b2"><img src="{LOGO}" width="36" height="36" alt="">Pdf Annotator <small>v1.5.0</small></div><div class="tools"><span class="pill">{svg("globe",16)} Español ▾</span><span class="pill">Tema oscuro</span></div></div>
<div class="mn" style="gap:18px">{mock()}<h2>Arrastra aquí tu PDF</h2><p style="font-size:20px;color:var(--muted)">o <u style="text-decoration-color:var(--accent);text-underline-offset:6px">haz clic para buscarlo</u> · <span style="color:var(--accent)">Probar con un ejemplo</span></p></div>
<div class="foot" style="padding:18px 28px"><span>Coordenadas exactas · JSON en vivo · 100 % en tu navegador</span><div class="ls"><a class="hl" href="#">{svg("layers",16)} Modo Lotes</a><a href="#">{svg("book",16)} Guía</a><a href="#">{svg("gh",16)} GitHub</a></div></div></div>'''
board('P-26', 'Inicio · variante C · pantalla entera', f'<div class="bg"></div>{zc}', 'dark', 'inicio-c')


# ---------------------------------------------------------------- estados de A
def zcell(lab, cls, title, text, extra='', note='', mockon=True):
    return (f'<div class="cell"><span class="lab">{lab}</span><div class="zc {cls}">{mock(mockon) if cls != "busy" else mock(False)}<h3>{title}</h3><p class="cap" style="font-size:14px">{text}</p>{extra}</div>'
            f'<p class="cap" style="font-size:13px">{note}</p></div>')


cells = [
    zcell('Reposo con foco de teclado', 'focus', 'Arrastra aquí tu PDF', 'o haz clic para buscarlo en tu equipo', '<span class="btn s">Seleccionar PDF</span>', 'Enter o Espacio abren el selector. Anillo de foco de 3 px.'),
    zcell('Arrastrando un PDF', 'act', 'Suelta para abrir en el Editor', 'factura-ejemplo.pdf · 1,2 MB', '', 'Toda la zona se ilumina en 150 ms (ease-out) y se anuncia con aria-live.'),
    zcell('Arrastrando varios archivos', 'act', 'Suelta para abrir en Lotes', '3 PDF y 2 JSON detectados · se abrirá el modo Lotes', '', 'Misma regla de siempre: 2 o más PDF, o cualquier JSON, abren Lotes. Siempre se avisa antes.'),
    zcell('Abriendo el PDF', 'busy', 'Abriendo factura-ejemplo.pdf', 'Preparando la página 1…', '<div class="bar" style="width:240px"><i style="width:62%"></i></div><span class="cap" style="font-size:12px">62 % · 0,8 de 1,2 MB</span>', 'Barra con contador; sin campos de muestra hasta que carga.'),
    zcell('Archivo no válido', 'err', 'Ese archivo no es un PDF', 'Prueba con otro o con el documento de ejemplo.', '<div style="display:flex;gap:8px"><span class="btn g s">Elegir otro</span><span class="ex" style="font-size:14px">Probar el ejemplo</span></div>', 'Borde rojo + icono + texto + toast de error (no solo color).', False),
    f'''<div class="cell"><span class="lab">Sesión y lote recuperables</span><div class="banner">{svg("info",18)}<div style="flex:1"><b>Continuar donde lo dejaste</b><br><span class="cap">factura-ejemplo.pdf · 14 anotaciones · hoy 17:42</span></div><span class="btn s">Continuar</span><span class="btn g s">Descartar</span></div>
<div class="banner">{svg("layers",18)}<div style="flex:1"><b>Tienes un lote de 40 PDF</b><br><span class="cap">12 de 40 exportados</span></div><span class="btn s">Continuar</span><span class="btn g s">Descartar</span></div><p class="cap" style="font-size:13px">Dos franjas finas encima de la zona, que baja unos 120 px; en 900 px de alto sigue entrando todo sin scroll.</p></div>''',
]
body = f'<div style="padding:22px 44px;display:flex;flex-direction:column;gap:6px"><span class="lab">P-27 · Propuesta · pendiente de aprobación</span><h1 style="font-size:26px;font-weight:600">Inicio (variante A) · todos los estados</h1><p class="cap">Arrastrando uno o varios archivos, abriendo, no válido, foco de teclado y recuperables. La zona es siempre la misma; cambian el borde, el texto y las franjas.</p></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:0 44px 24px">' + ''.join(cells) + '</div>'
board('P-27', 'Inicio · variante A · estados', body, 'dark', 'inicio-a-estados', 900, 'hp')

# ---------------------------------------------------------------- guía con «así se ve»
feat = [('search', 'Coordenadas exactas', 'Cada clic se convierte en una posición en puntos PDF, con guías y snapping para alinear con precisión.'),
        ('doc', 'JSON en vivo', 'Edita el JSON o el visor: ambos se sincronizan al instante. Importa, copia y descarga.'),
        ('grid', 'Plantillas reutilizables', 'Guarda tus anotaciones y aplícalas a otros documentos con un clic.'),
        ('lock', 'Privado por diseño', 'Todo ocurre en tu navegador. Tu PDF nunca se sube a ningún servidor.')]
fh = ''.join(f'<div class="card" style="gap:8px"><div class="ic">{svg(i,22)}</div><h3>{t}</h3><p class="cap">{d}</p><a href="#" style="font-weight:700;font-size:13px">Leer el tema →</a></div>' for i, t, d in feat)
gbody = f'''<div class="bg"></div>{top()}
<div style="display:flex;gap:24px;padding:0 44px;flex:1;min-height:0;align-items:flex-start"><div class="side" style="width:280px"><div class="search">{svg("search",16)} Buscar en la guía</div><div class="grp">Primeros pasos</div><a class="it on" href="#">Así se ve</a><a class="it" href="#">Empezar</a><a class="it" href="#">Espacio de trabajo</a><div class="grp">Editor</div><a class="it" href="#">Editar una anotación</a><a class="it" href="#">Guías y precisión</a><a class="it" href="#">JSON en vivo</a></div>
<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px"><div><span class="badge">Guía</span><h1 style="font-size:36px;margin:10px 0 6px;letter-spacing:-.01em">Así se ve PDF Annotator</h1><p class="cap" style="font-size:16px;max-width:760px">Esto es lo que antes estaba en la pantalla de inicio: la vista previa del editor y las cuatro ventajas, ahora con enlace a su tema.</p></div>
<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;align-items:start"><div class="win"><div class="bar2"><i></i><i></i><i></i></div><img src="{shot('workspace')}" alt="Captura del espacio de trabajo"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">{fh}</div></div></div></div>{foot()}'''
board('P-29', 'Guía · «Así se ve» (lo que sale de la inicio)', gbody, 'dark', 'guia-asi-se-ve')

json.dump(made, open(f'{OUT}/../h_made.json', 'w'))
print('ok', [m[0] for m in made])


# ---------------------------------------------------------------- inicio como la referencia de Maxter (P-30 a P-32)
H2 = '''
.ref{width:1720px;position:relative;overflow:hidden;background:var(--bg);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:15px;display:flex;flex-direction:column;align-items:center}
.ref h1,.ref h2,.ref h3,.ref p{margin:0}
.ref .top{width:1200px;padding:22px 0}
.ref .badge2{margin-top:18px;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase;padding:7px 16px;border-radius:999px}
.ref h1{font-size:56px;line-height:1.1;letter-spacing:-.02em;text-align:center;max-width:760px;margin-top:16px;font-weight:700}
.ref .desc{color:var(--muted);font-size:16px;line-height:1.6;max-width:600px;text-align:center;margin-top:14px}
.ref .zone{margin-top:22px;width:960px;border:1.5px dashed color-mix(in srgb,var(--accent) 45%,var(--line));border-radius:26px;background:color-mix(in srgb,var(--accent) 3%,var(--panel));padding:30px 36px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.ico{width:64px;height:64px;border-radius:20px;background:color-mix(in srgb,var(--accent) 16%,var(--panel));display:grid;place-items:center;font-size:30px;margin-bottom:6px}
.ref .zone h2{font-size:22px;font-weight:700}
.ref .zone .s{color:var(--muted);font-size:16px}
.ref .zone .t{color:var(--muted);font-size:13px}
.ref .trust{display:flex;gap:26px;color:var(--muted);font-size:15px;margin-top:22px}
.ref .feats{width:1200px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;border-top:1px solid var(--line);margin-top:34px;padding-top:26px}
.ref .feat{display:flex;gap:14px}.ref .feat .fi{flex:none;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--accent) 14%,var(--panel));display:grid;place-items:center;font-size:18px}
.ref .feat h3{font-size:16px;font-weight:700}.ref .feat p{color:var(--muted);font-size:13.5px;line-height:1.5;margin-top:4px}
.ref .rf{width:1200px;display:flex;align-items:center;justify-content:space-between;padding:26px 0 30px;color:var(--muted);font-size:14px;margin-top:20px}
.ref .rf .ls{display:flex;align-items:center;gap:26px}.ref .rf .ls .hl{color:var(--accent);font-weight:600}
.ref .rf .gh{display:inline-flex;gap:8px;align-items:center;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:999px;padding:5px 14px;color:var(--text)}
.zc .ico{width:50px;height:50px;font-size:24px;border-radius:15px}
'''
CSS = CSS + H2
NOTA = '<div style="position:absolute;right:22px;top:92px;width:300px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));border:1px solid var(--accent);border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.5"><b>Diferencias a propósito</b><br>1. El pie añade «Modo Lotes» y «Guía» junto a GitHub.<br>2. Sin vista previa de la app (está en la Guía → «Así se ve»).</div>'


def varI(theme, note=True):
    lbl = 'Tema oscuro' if theme == 'dark' else 'Tema claro'
    feats = ''.join(f'<div class="feat"><span class="fi">{ic}</span><div><h3>{t}</h3><p>{d}</p></div></div>' for ic, t, d in [
        ('🎯', 'Coordenadas exactas', 'Cada clic se convierte en una posición en puntos PDF, con guías y snapping para alinear con precisión.'),
        ('🧾', 'JSON en vivo', 'Edita el JSON o el visor: ambos se sincronizan al instante. Importa, copia y descarga.'),
        ('🧩', 'Plantillas reutilizables', 'Guarda tus anotaciones y aplícalas a otros documentos con un clic.'),
        ('🔐', 'Privado por diseño', 'Todo ocurre en tu navegador. Tu PDF nunca se sube a ningún servidor.')])
    return f'''<div class="bg"></div>{top(lbl)}<span class="badge2">Empieza a anotar</span><h1>Maqueta coordenadas de cualquier PDF en segundos</h1>
<p class="desc">Sube tu documento para añadir anotaciones vinculadas a JSON, reutilizar plantillas y exportar archivos listos para trabajar.</p>
<div class="zone" role="button" aria-label="Carga tu PDF"><span class="ico">📄</span><h2>Carga tu PDF</h2><p class="s">Arrastra y suelta el archivo aquí o haz clic para buscar</p><p class="t">Solo PDF</p><p class="t">¿Muchos PDF? Elige varios (y sus JSON) y se abre el remaquetado por lotes.</p><span class="btn" style="margin-top:6px">Seleccionar PDF</span></div>
<span class="ex" style="margin-top:18px">{svg("spark",18)} Probar con un documento de ejemplo</span>
<div class="trust"><span>🔒 100 % en tu navegador</span><span>🌍 7 idiomas</span><span>💚 Código abierto</span></div>
<div class="feats">{feats}</div>
<div class="rf"><span><b style="color:var(--text)">Pdf Annotator</b> v1.5.0</span><div class="ls"><a class="hl">Modo Lotes</a><a>Guía</a><span class="gh">Proyecto de código abierto · Licencia MIT</span></div><span>© 2026 · Desarrollado por AAmoros</span></div>{NOTA if note else ''}'''


board('P-30', 'Inicio · como la referencia', varI('dark'), 'dark', 'inicio-referencia', 1180, 'ref')
board('P-31', 'Inicio · como la referencia (claro)', varI('light', False), 'light', 'inicio-referencia-claro', 1180, 'ref')


def zi(lab, cls, title, text, extra='', note=''):
    return (f'<div class="cell"><span class="lab">{lab}</span><div class="zc {cls}"><span class="ico">📄</span><h3>{title}</h3><p class="cap" style="font-size:14px">{text}</p>{extra}</div><p class="cap" style="font-size:13px">{note}</p></div>')


cells2 = [
    zi('Reposo con foco de teclado', 'focus', 'Carga tu PDF', 'Arrastra y suelta el archivo aquí o haz clic para buscar', '<span class="btn s">Seleccionar PDF</span>', 'Enter o Espacio abren el selector.'),
    zi('Arrastrando un PDF', 'act', 'Suelta para abrir en el Editor', 'factura-ejemplo.pdf · 1,2 MB', '', 'La zona se ilumina en 150 ms.'),
    zi('Arrastrando varios archivos', 'act', 'Suelta para abrir en Lotes', '3 PDF y 2 JSON detectados · se abrirá el modo Lotes', '', '2 o más PDF, o cualquier JSON, abren Lotes.'),
    zi('Abriendo el PDF', 'busy', 'Abriendo factura-ejemplo.pdf', 'Preparando la página 1…', '<div class="bar" style="width:240px"><i style="width:62%"></i></div>', 'Barra de progreso.'),
    zi('Archivo no válido', 'err', 'Ese archivo no es un PDF', 'Prueba con otro o con el documento de ejemplo.', '<div style="display:flex;gap:8px"><span class="btn g s">Elegir otro</span><span class="ex" style="font-size:14px">Probar el ejemplo</span></div>', 'Borde rojo, texto y aviso (no solo color).'),
    cells[5],
]
body2 = '<div style="padding:22px 44px;display:flex;flex-direction:column;gap:6px"><span class="lab">P-32 · Versión final</span><h1 style="font-size:26px;font-weight:600">Inicio · todos los estados</h1><p class="cap">La zona de P-30 en cada estado.</p></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:0 44px 24px">' + ''.join(cells2) + '</div>'
board('P-32', 'Inicio · estados de la zona', body2, 'dark', 'inicio-referencia-estados', 900, 'hp')
json.dump(made, open(f'{OUT}/../h_made.json', 'w'))
