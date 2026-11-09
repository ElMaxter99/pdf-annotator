# Genera las mesas P-16 a P-23 (propuesta: nueva vista inicial y vista de guía). Solo escritorio.
# Uso: python3 design/tools/gboards.py <carpeta-de-salida>   (la CSS base se toma de P-11)
import os, re, sys
OUT = sys.argv[1] if len(sys.argv) > 1 else 'canvas/project'
BASE = os.path.join(os.path.dirname(__file__), '..', 'canvas', 'P-11-avanzado-valores-de-muestra.dc.html')
base_css = re.search(r'<style>(.*?)</style>', open(BASE, encoding='utf8').read(), re.S).group(1)
LOGO = '/_blob/3b1c7d405f5e428ffa466253ab28e2ae'
SHOT = {'main': '50d6d2ad39c2cca0d68a95f4cfdbefb0', 'workspace': 'a955919952982793d23565639c478b87',
        'example': 'aece94461ffeb284d0fcf441f818290e', 'guides': '3488174be16d079ba7cc81c3a897c51d',
        'json': '775971d64356c046e6a2f03fa4ce2dd4', 'shortcuts': 'c85b25f2b16edcecc0d7d511ec57ece7',
        'light': '0c0adbc047f4ef5be00c3baa19299d6b'}
shot = lambda k: '/_blob/' + SHOT[k]
THEMES = {
 'dark': dict(bg='#1e1e2f', panel='#2a2a3d', accent='#5eead4', danger='#ff4d4d', text='#f5f5f5', muted='#b0b0b0', ink='#1e1e2f', line='rgba(255,255,255,.14)', soft='rgba(255,255,255,.06)', warn='#fbbf24', ok='#5eead4', inset='#1e1e2f'),
 'light': dict(bg='#f6f7fb', panel='#ffffff', accent='#0f9b8e', danger='#dc2626', text='#0f172a', muted='#475569', ink='#ffffff', line='rgba(15,23,42,.18)', soft='rgba(15,23,42,.05)', warn='#b45309', ok='#0f766e', inset='#eef0f6'),
}
EXTRA = '''
.p{height:auto;min-height:900px}
a{color:var(--accent);text-decoration:none}
.nav{display:flex;align-items:center;gap:20px;padding:4px 8px}
.nav .lnk{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:14px;font-weight:600;padding:8px 12px;border-radius:999px}
.nav .lnk.on{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
.badge{display:inline-flex;border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);color:var(--accent);border-radius:999px;padding:5px 14px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px}
.hero h1{font-size:54px;line-height:1.08;font-weight:700;max-width:900px;letter-spacing:-.02em}
.hero p{font-size:18px;color:var(--muted);max-width:640px;line-height:1.5}
.zone{position:relative;width:860px;border:2px dashed color-mix(in srgb,var(--accent) 50%,var(--line));border-radius:24px;background:color-mix(in srgb,var(--accent) 4%,var(--inset));padding:30px 36px;display:flex;align-items:center;gap:34px;animation:march 1.6s linear infinite}
.zone.act{border-style:solid;border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--inset));box-shadow:0 0 0 6px color-mix(in srgb,var(--accent) 16%,transparent)}
.zone.err{border-color:var(--danger);background:color-mix(in srgb,var(--danger) 7%,var(--inset))}
.zone.busy{border-style:solid;border-color:var(--line)}
.zone h2{font-size:28px;font-weight:600}
.zone .big{font-size:16px;color:var(--muted);line-height:1.45}
.mock{position:relative;width:132px;height:176px;flex-shrink:0;animation:float 3.2s ease-out infinite alternate}
.mock .pg{width:132px;height:176px}
.mock .fd{animation:pop .6s ease-out both}
.sub{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--text);border:1px solid var(--line);border-radius:999px;padding:8px 16px;min-height:40px;background:transparent}
.chip.q{color:var(--accent);border-color:transparent;padding-left:4px}
.chip.focus{outline:3px solid var(--accent);outline-offset:3px}
.batch{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--muted);border-radius:999px;padding:6px 8px 6px 16px;background:var(--soft)}
.batch b{color:var(--text);font-weight:600}
.batch .go{display:inline-flex;align-items:center;gap:6px;color:var(--accent);font-weight:700;border-radius:999px;padding:6px 12px;background:color-mix(in srgb,var(--accent) 14%,transparent)}
.trust{display:flex;gap:28px;color:var(--muted);font-size:14px}
.trust span{display:inline-flex;gap:8px;align-items:center}
.steps{display:flex;gap:10px;align-items:center;color:var(--muted);font-size:14px}
.steps b{display:inline-flex;width:24px;height:24px;border-radius:50%;background:var(--soft);color:var(--text);align-items:center;justify-content:center;font-size:12px}
.feat{display:flex;gap:14px;flex:1;min-width:0}
.feat h3{font-size:16px;margin-bottom:4px}
.feat p{font-size:14px;color:var(--muted);line-height:1.5}
.feat .more{font-size:13px;font-weight:700;display:inline-block;margin-top:6px}
.sep{height:1px;background:var(--line)}
.cell{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:12px;min-width:0}
.cell .zone{width:auto;padding:18px 20px;gap:18px;animation:none}
.cell .zone h2{font-size:20px}
.cell .zone .big{font-size:14px}
.cell .mock{width:76px;height:100px}.cell .mock .pg{width:76px;height:100px}
.side{width:300px;flex-shrink:0;display:flex;flex-direction:column;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px}
.side .search{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:9px 12px;background:var(--inset);color:var(--muted);font-size:14px;margin-bottom:6px}
.side .grp{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:10px 8px 2px}
.side .it{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;font-size:14px;color:var(--text);min-height:36px}
.side .it.on{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);font-weight:700}
.side .it small{margin-left:auto;color:var(--muted);font-weight:400}
.tcard{background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;min-width:0;transition:transform .2s ease-out,border-color .2s ease-out}
.tcard .th{height:150px;overflow:hidden;background:var(--inset);border-bottom:1px solid var(--line)}
.tcard .th img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
.tcard .tb{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px}
.tcard h3{font-size:16px;font-weight:600}
.tcard.hov{transform:translateY(-3px);border-color:var(--accent)}
.shot{position:relative;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--inset)}
.shot img{display:block;width:100%}
.pin{position:absolute;width:28px;height:28px;border-radius:50%;background:var(--accent);color:var(--ink);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 30%,transparent);animation:pulse 2s ease-out infinite}
.stp{display:flex;gap:14px;align-items:flex-start}
.stp b{flex-shrink:0;width:28px;height:28px;border-radius:50%;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:13px}
.stp p{font-size:15px;line-height:1.5}
.tip{border-radius:14px;padding:14px 18px;background:color-mix(in srgb,var(--accent) 9%,transparent);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);font-size:14px;line-height:1.5;display:flex;gap:12px}
.crumb{font-size:13px;color:var(--muted);display:flex;gap:8px}
.pn{display:flex;justify-content:space-between;gap:16px}
.pn .card{flex:1;padding:14px 18px;gap:2px}
.code{background:var(--inset);border:1px solid var(--line);border-radius:14px;padding:16px 18px;font-family:Consolas,monospace;font-size:13px;line-height:1.6;white-space:pre;color:var(--text);overflow:hidden}
.code i{color:var(--muted);font-style:normal}.code b{color:var(--accent);font-weight:400}
.ar{display:flex;align-items:center;color:var(--accent);font-size:22px}
.skl{display:block;border-radius:8px;background:linear-gradient(90deg,var(--soft) 25%,var(--line) 50%,var(--soft) 75%);background-size:200% 100%;animation:shimmer 1.4s ease-out infinite}
@keyframes march{to{border-color:color-mix(in srgb,var(--accent) 80%,var(--line))}}
@keyframes float{to{transform:translateY(-8px)}}
@keyframes pop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}
@keyframes pulse{50%{box-shadow:0 0 0 9px color-mix(in srgb,var(--accent) 0%,transparent)}}
@keyframes shimmer{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
'''
CSS = base_css.replace('.p{width:1720px;height:900px;', '.p{width:1720px;height:900px;') + EXTRA

def svg(name, s=18):
    p = {
     'doc': '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
     'book': '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 8h6"/>',
     'layers': '<path d="M12 3 3 8l9 5 9-5zM3 13l9 5 9-5"/>',
     'arrow': '<path d="M5 12h14M13 6l6 6-6 6"/>',
     'back': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
     'search': '<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>',
     'check': '<path d="m5 12 5 5 9-10"/>',
     'x': '<path d="M6 6l12 12M18 6 6 18"/>',
     'lock': '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
     'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
     'heart': '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.500-7 10-7 10z"/>',
     'spark': '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
     'up': '<path d="M12 16V5M7 10l5-5 5 5M5 19h14"/>',
     'gh': '<path d="M9 19c-5 1.500-5-2.500-7-3m14 6v-3.800a3.300 3.300 0 0 0-1-2.600c3.100-.3 6.400-1.500 6.400-7a5.400 5.400 0 0 0-1.500-3.800 5 5 0 0 0-.1-3.800s-1.200-.3-3.900 1.500a13.400 13.400 0 0 0-7 0C6.200 2.800 5 3.100 5 3.100a5 5 0 0 0-.1 3.800A5.400 5.400 0 0 0 3.400 10.700c0 5.400 3.300 6.600 6.400 7a3.300 3.300 0 0 0-1 2.600V22"/>',
     'edit': '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
     'grid': '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
     'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
     'warn': '<path d="M12 3 2 20h20zM12 10v5M12 18h.01"/>',
    }[name]
    return f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{p}</svg>'

def mock(fields=True):
    ls = ''.join(f'<div class="ln" style="top:{t}%;left:{l}%;width:{w}%"></div>' for t, l, w in [(22, 10, 50), (30, 10, 70), (38, 10, 64), (50, 10, 76), (58, 10, 60), (66, 10, 70), (82, 10, 36)])
    fd = ''
    if fields:
        for i, (l, t, w, h) in enumerate([(10, 18, 44, 7), (52, 46, 30, 7), (10, 62, 46, 7), (58, 78, 30, 8)]):
            fd += f'<div class="fd" style="left:{l}%;top:{t}%;width:{w}%;height:{h}%;animation-delay:{.2 + i * .25}s"></div>'
    return f'<div class="mock"><div class="pg"><div class="band"></div>{ls}{fd}</div></div>'

def nav(active='', theme_lbl='Tema oscuro'):
    g = 'lnk on' if active == 'guia' else 'lnk'
    return (f'<div class="nav"><div class="brand"><img src="{LOGO}" width="36" height="36" alt=""><div>Pdf Annotator<small>v1.5.0</small></div></div><span class="sp"></span>'
            f'<a class="lnk" href="#">{svg("gh")} GitHub</a><a class="{g}" href="#">{svg("book")} Guía</a><a class="lnk" href="#">{theme_lbl}</a><span class="st">ES · Español ▾</span></div>')

def head(code, title, sub):
    return f'<div style="display:flex;flex-direction:column;gap:4px"><span class="lab">{code} · Propuesta · pendiente de aprobación</span><h1 style="font-size:26px;font-weight:600">{title}</h1><p class="cap" style="max-width:1400px">{sub}</p></div>'

made = []
def board(code, title, body, theme='dark', nm='x', h=900, annot=None):
    t = THEMES[theme]; vars = ';'.join(f'--{k}:{v}' for k, v in t.items())
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
<div class="p" style="{vars};min-height:{h}px">
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

# ---------------------------------------------------------------- P-16/P-18 inicio
def inicio(theme):
    feats = [('Coordenadas exactas', 'Cada clic es una posición en puntos PDF, con guías y snapping.', 'target'),
             ('JSON en vivo', 'Edita el JSON o el visor: ambos se sincronizan al instante.', 'json'),
             ('Plantillas reutilizables', 'Guarda tus anotaciones y aplícalas a otros documentos.', 'tpl'),
             ('Privado por diseño', 'Todo ocurre en tu navegador. Tu PDF nunca se sube.', 'priv')]
    fh = ''.join(f'<div class="feat"><div class="ic" style="flex-shrink:0">{svg(i,22)}</div><div><h3>{t}</h3><p>{d}</p><a class="more" href="#">Verlo en la guía →</a></div></div>'
                 for (t, d, _), i in zip(feats, ['search', 'doc', 'grid', 'lock']))
    zone = f'''<div class="zone" role="button" aria-label="Carga tu PDF: arrastra aquí o haz clic">
{mock()}
<div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start;text-align:left">
<h2>Arrastra aquí tu PDF</h2>
<p class="big">o haz clic para buscarlo en tu equipo. Se abre al instante en el editor.</p>
<div class="sub"><span class="btn">{svg("up")} Seleccionar PDF</span><span class="chip q">{svg("spark")} Probar con un documento de ejemplo</span></div>
<span class="cap" style="font-size:13px">Solo PDF · hasta 25 MB · no sale de tu navegador</span></div></div>'''
    body = head('P-16' if theme == 'dark' else 'P-18', 'Inicio · zona «arrastra aquí» mejorada' + ('' if theme == 'dark' else ' (claro)'), 'Vuelve el cuadrado central del diseño original, más grande y con una página de muestra que respira. Debajo, un aviso discreto al modo Lotes y un enlace «Guía» en la cabecera. Las cuatro funciones llevan a su sección de la guía.')
    body += nav('', 'Tema oscuro' if theme == 'dark' else 'Tema claro')
    body += f'''<div class="hero" style="padding-top:8px"><span class="badge">Empieza a anotar</span><h1>Maqueta coordenadas de cualquier PDF en segundos</h1><p>Sube tu documento para añadir anotaciones vinculadas a JSON, reutilizar plantillas y exportar archivos listos para trabajar.</p></div>
<div style="display:flex;flex-direction:column;align-items:center;gap:16px">{zone}
<div class="steps"><b>1</b> Suelta tu PDF <span>{svg("arrow",14)}</span> <b>2</b> Coloca anotaciones <span>{svg("arrow",14)}</span> <b>3</b> Exporta JSON o PDF</div>
<div class="batch"><span>¿Tienes <b>muchos PDF</b> con plantillas?</span><a class="go" href="#">Probar el modo Lotes {svg("arrow",14)}</a></div>
<div class="trust"><span>{svg("lock",16)} 100 % en tu navegador</span><span>{svg("globe",16)} 7 idiomas</span><span>{svg("heart",16)} Código abierto</span></div></div>
<div class="sep"></div><div style="display:flex;gap:28px">{fh}</div>'''
    board('P-16' if theme == 'dark' else 'P-18', 'Inicio' + ('' if theme == 'dark' else ' (claro)'), body, theme, 'inicio' if theme == 'dark' else 'inicio-claro', 1060)
inicio('dark'); inicio('light')

# ---------------------------------------------------------------- P-17 estados
def cell(lab, inner, note=''):
    return f'<div class="cell"><span class="lab">{lab}</span>{inner}<p class="cap" style="font-size:13px">{note}</p></div>'
def zone_s(cls, title, text, extra=''):
    return f'<div class="zone {cls}">{mock(cls != "busy")}<div style="display:flex;flex-direction:column;gap:8px;text-align:left"><h2>{title}</h2><p class="big">{text}</p>{extra}</div></div>'
c1 = cell('Arrastrando un PDF', zone_s('act', 'Suelta para abrir en el Editor', 'factura-ejemplo.pdf · 1,2 MB'), 'El borde pasa a sólido y se ilumina en 150 ms (ease-out). El aviso se anuncia con aria-live.')
c2 = cell('Arrastrando varios archivos', zone_s('act', 'Suelta para abrir en Lotes', '3 PDF y 2 JSON detectados', '<span class="st on" style="align-self:flex-start">Se abrirá el modo Lotes · puedes cambiarlo</span>'), 'Misma regla que R-02: 1 PDF abre el Editor; 2 o más PDF, o cualquier JSON, abren Lotes. Siempre se avisa antes.')
c3 = cell('Leyendo el PDF', zone_s('busy', 'Abriendo factura-ejemplo.pdf', 'Preparando la página 1…', '<div class="bar" style="width:260px"><i style="width:62%"></i></div><span class="cap" style="font-size:13px">62 % · 0,8 de 1,2 MB</span>'), 'Barra con contador. Si tarda, la zona muestra esqueletos de la página; nunca queda en blanco.')
c4 = cell('Archivo no válido', zone_s('err', 'Ese archivo no es un PDF', 'Prueba con otro, o con el documento de ejemplo.', '<div class="sub"><span class="btn g s">Elegir otro</span><span class="chip q" style="min-height:32px">Probar el ejemplo</span></div>') + f'<div class="note e">{svg("x",18)}<div><b>«datos.txt» no se ha abierto.</b> Solo se admiten PDF (hasta 25 MB) y plantillas JSON.</div></div>', 'Mismo toast .toast--error de V-19; el borde rojo no es el único indicador (también icono y texto).')
c5 = cell('Sesión recuperable', zone_s('', 'Arrastra aquí tu PDF', 'o haz clic para buscarlo.') + f'<div class="note i">{svg("info",18)}<div><b>Continuar donde lo dejaste</b><br><span class="cap">factura-ejemplo.pdf · 14 anotaciones · hoy 17:42. Solo en este navegador.</span><div class="sub" style="margin-top:8px"><span class="btn s">Continuar</span><span class="btn g s">Descartar</span></div></div></div>', 'El aviso va por encima de la zona y no la sustituye. Una sesión del Editor y un lote en curso se muestran en dos tarjetas iguales.')
c6 = cell('Lote en curso', f'<div class="note i">{svg("layers",18)}<div style="flex:1"><b>Tienes un lote de 40 PDF</b><div class="bar" style="margin:8px 0"><i style="width:30%"></i></div><span class="cap">12 de 40 exportados</span><div class="sub" style="margin-top:8px"><span class="btn s">Continuar el lote</span><span class="btn g s">Descartar</span></div></div></div><div class="batch" style="align-self:flex-start"><span>¿Más PDF? <b>Añade otro lote</b></span><a class="go" href="#">Modo Lotes {svg("arrow",14)}</a></div>', 'El aviso discreto de Lotes sigue visible debajo de la zona aunque haya un lote guardado.')
body = head('P-17', 'Inicio · todos los estados', 'Arrastrando uno o varios archivos, leyendo, archivo no válido, sesión recuperable y lote en curso. Misma zona en todos; solo cambia el borde, el texto y el aviso.')
body += nav() + f'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start">{c1}{c2}{c3}{c4}{c5}{c6}</div>'
board('P-17', 'Inicio · estados', body, 'dark', 'inicio-estados', 1040)

# ---------------------------------------------------------------- Guía
TOP = [('Empezar', 'main', 'Abre un PDF, pon tu primera anotación y exporta.', 'Empezar · 2 min'),
       ('Espacio de trabajo', 'workspace', 'Cabecera, panel lateral con 4 pestañas y visor.', 'Editor'),
       ('Editar una anotación', 'example', 'Tipo, fuente, color, valor fijo, bloqueo y duplicar.', 'Editor'),
       ('Guías y precisión', 'guides', 'Rejilla, reglas, imán y alineación de varias a la vez.', 'Editor'),
       ('JSON en vivo', 'json', 'Texto o árbol, sincronizado con el visor.', 'Datos'),
       ('Atajos y tema claro', 'shortcuts', 'Pulsa ? en la app para verlos todos.', 'Editor')]
def sidebar(on, q=''):
    groups = [('Primeros pasos', ['Empezar', 'Espacio de trabajo']), ('Editor', ['Editar una anotación', 'Guías y precisión', 'JSON en vivo', 'Plantillas', 'Valores de muestra y datos de prueba', 'Atajos']), ('Lotes', ['Cargar PDF y plantillas', 'Emparejar', 'Comparar y descargar']), ('Más', ['Exportar', 'Privacidad'])]
    h = f'<div class="side"><div class="search">{svg("search",16)} {q or "Buscar en la guía"}</div>'
    for g, its in groups:
        h += f'<div class="grp">{g}</div>'
        for i in its:
            if q and q.lower() not in i.lower(): continue
            h += f'<a class="it{" on" if i == on else ""}" href="#">{i}</a>'
    return h + '</div>'
# P-19 vista general
cards = ''.join(f'<div class="tcard{" hov" if i == 2 else ""}"><div class="th"><img src="{shot(k)}" alt="Captura: {t}"></div><div class="tb"><span class="lab" style="font-size:11px">{tag}</span><h3>{t}</h3><p class="cap" style="font-size:14px">{d}</p></div></div>' for i, (t, k, d, tag) in enumerate(TOP))
paths = f'''<div style="display:flex;gap:16px"><div class="card" style="flex:1;flex-direction:row;align-items:center;gap:16px"><div class="ic">{svg("edit",22)}</div><div style="flex:1"><h3>Un PDF: el Editor</h3><p class="cap">Colocas campos a mano y los afinas con el JSON.</p></div><a class="btn g s" href="#">Leer {svg("arrow",14)}</a></div>
<div class="card" style="flex:1;flex-direction:row;align-items:center;gap:16px"><div class="ic">{svg("layers",22)}</div><div style="flex:1"><h3>Muchos PDF: Lotes</h3><p class="cap">Remaquetas de 2 a 50 PDF con plantillas que ya tienes.</p></div><a class="btn g s" href="#">Leer {svg("arrow",14)}</a></div></div>'''
body = head('P-19', 'Guía · vista general', 'Se abre desde «Guía» en la cabecera de cualquier pantalla. Índice lateral con buscador, dos caminos (Editor y Lotes) y una tarjeta por tema con la captura del README. El contenido sale de docs/GUIDE.md (ver P-23).')
body += nav('guia', 'Tema oscuro')
body += f'''<div style="display:flex;gap:24px;align-items:flex-start">{sidebar('')}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:20px"><div class="crumb"><a href="#">Inicio</a> / <span>Guía</span></div>
<div><span class="badge">Guía</span><h1 style="font-size:40px;margin:12px 0 8px;letter-spacing:-.01em">Todo lo que puede hacer PDF Annotator</h1><p style="font-size:17px;color:var(--muted);max-width:760px;line-height:1.55">Elige por dónde empezar. Cada tema explica una función con su captura, los pasos y los atajos relacionados.</p></div>
{paths}<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">{cards}</div></div></div>'''
board('P-19', 'Guía · vista general', body, 'dark', 'guia-general', 1150)

# P-20/P-22 sección
def seccion(theme):
    code = 'P-20' if theme == 'dark' else 'P-22'
    body = head(code, 'Guía · un tema con captura y pasos' + ('' if theme == 'dark' else ' (claro)'), 'Plantilla común a todos los temas: miga de pan, título, captura con puntos numerados que se corresponden con los pasos, consejo, atajos, «Probar en la app» y anterior/siguiente. Todo accesible con teclado.')
    body += nav('guia', 'Tema oscuro' if theme == 'dark' else 'Tema claro')
    steps = [('Haz clic sobre el PDF', 'Se abre el editor flotante con el campo en esa posición.'), ('Escribe el texto o el mapeo', 'Usa <span class="mono">cliente.nombre</span> para ligarlo a tus datos, o «Valor fijo» para un texto.'), ('Ajusta fuente, tamaño y color', 'Las fuentes estándar y las que subas (.ttf, .otf, .woff, .woff2) están en el buscador.'), ('Confirma con Intro', 'Duplica con ⧉, bloquea con el candado o borra con Supr.')]
    sh = ''.join(f'<div class="stp"><b>{i + 1}</b><p><b style="all:unset;font-weight:700">{t}.</b> <span class="cap" style="font-size:15px">{d}</span></p></div>' for i, (t, d) in enumerate(steps))
    kb = ''.join(f'<span class="kbd">{k}</span>' for k in ['Intro', 'Esc', 'Ctrl + D', 'Supr'])
    body += f'''<div style="display:flex;gap:24px;align-items:flex-start">{sidebar('Editar una anotación')}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:18px"><div class="crumb"><a href="#">Inicio</a> / <a href="#">Guía</a> / <span>Editor</span> / <span style="color:var(--text)">Editar una anotación</span></div>
<div><h1 style="font-size:38px;letter-spacing:-.01em;margin-bottom:8px">Editar una anotación</h1><p style="font-size:17px;color:var(--muted);line-height:1.55;max-width:820px">Cada campo tiene su propio editor: texto, tipo, valor fijo, decimales, tamaño, opacidad, fuente, fondo y color. Es el mismo en crear y en editar.</p></div>
<div style="display:flex;gap:24px;align-items:flex-start"><div class="shot" style="flex:1.4"><img src="{shot('example')}" alt="Captura del editor de anotación sobre una factura"><span class="pin" style="left:38%;top:30%">1</span><span class="pin" style="left:62%;top:36%">2</span><span class="pin" style="left:62%;top:58%">3</span><span class="pin" style="left:62%;top:84%">4</span></div>
<div style="flex:1;display:flex;flex-direction:column;gap:16px">{sh}<div class="tip">{svg("info",18)}<div><b>Consejo.</b> Selecciona varias con <span class="kbd">Shift</span> + clic para alinearlas o moverlas a la vez.</div></div>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="cap">Atajos:</span>{kb}</div>
<div class="sub"><a class="btn" href="#">{svg("spark")} Probar en la app</a><a class="chip" href="#">Ver el JSON de esta anotación</a></div></div></div>
<div class="pn"><a class="card" href="#"><span class="cap">{svg("back",14)} Anterior</span><b>Espacio de trabajo</b></a><a class="card" href="#" style="text-align:right"><span class="cap">Siguiente {svg("arrow",14)}</span><b>Guías y precisión</b></a></div></div></div>'''
    board(code, 'Guía · tema' + ('' if theme == 'dark' else ' (claro)'), body, theme, 'guia-tema' if theme == 'dark' else 'guia-tema-claro', 1130)
seccion('dark'); seccion('light')

# P-21 estados de la guía
c1 = cell('Cargando', f'<div style="display:flex;gap:14px"><div style="width:150px;display:flex;flex-direction:column;gap:10px"><span class="skl" style="height:34px"></span><span class="skl" style="height:20px;width:70%"></span><span class="skl" style="height:20px;width:85%"></span><span class="skl" style="height:20px;width:60%"></span></div><div style="flex:1;display:flex;flex-direction:column;gap:12px"><span class="skl" style="height:30px;width:55%"></span><span class="skl" style="height:14px"></span><span class="skl" style="height:14px;width:80%"></span><span class="skl" style="height:150px"></span></div></div>', 'Esqueletos con brillo suave (1,4 s). La guía es local: casi nunca se ve, pero las capturas cargan perezosas.')
res = lambda tag, t: f'<div class="tcard"><div class="tb"><span class="lab" style="font-size:11px">{tag}</span><h3>{t}</h3></div></div>'
mk = '<mark style="background:color-mix(in srgb,var(--accent) 30%,transparent);color:var(--text);border-radius:4px">rejilla</mark>'
c2 = cell('Buscando «rejilla»', f'<div class="side" style="width:auto"><div class="search">{svg("search",16)} rejilla</div></div>' + res('Editor · Guías y precisión', f'…activa la {mk} y las reglas en puntos PDF') + res('Editor · Atajos', f'Atajos para mostrar la {mk} y las reglas') + '<span class="cap" style="font-size:13px">2 resultados</span>', 'Resultados al escribir, con la coincidencia resaltada. Intro abre el primero; flechas recorren la lista.')
c3 = cell('Sin resultados', f'<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 10px;text-align:center"><div class="ic">{svg("search",22)}</div><b>Nada para «cuchillo»</b><p class="cap">Prueba con otra palabra o mira todos los temas.</p><div class="sub"><span class="btn s">Ver todos los temas</span><span class="btn g s">Borrar búsqueda</span></div></div>', 'Mensaje claro y salida directa; nunca una lista vacía.')
c4 = cell('Foco con teclado', f'<div style="display:flex;flex-direction:column;gap:10px"><span class="chip focus" style="align-self:flex-start">Probar en la app</span><div class="side" style="width:auto"><a class="it on" href="#" style="outline:3px solid var(--accent);outline-offset:-3px">Editar una anotación</a><a class="it" href="#">Guías y precisión</a></div></div>', 'Anillo de foco de 3 px en todo. Orden: cabecera, buscador, índice, contenido, anterior/siguiente. Esc vuelve al editor.')
c5 = cell('Tema Lotes', f'<div class="tcard"><div class="tb"><span class="lab" style="font-size:11px">Lotes</span><h3>Emparejar PDF y plantillas</h3><p class="cap">Cada plantilla se une a su PDF por <span class="mono">pdfName</span>. Lo ambiguo nunca se asigna solo.</p><div class="steps" style="flex-wrap:wrap"><b>1</b> Cargar <b>2</b> Emparejar <b>3</b> Comparar <b>4</b> Descargar</div></div></div>', 'Los temas de Lotes usan esquemas dibujados con los tokens (no capturas) mientras la app evoluciona.')
c6 = cell('Enlace desde la app', f'<div style="display:flex;flex-direction:column;gap:10px"><div class="chip" style="align-self:flex-start">{svg("book",16)} ¿Cómo se hace? → Guía</div><p class="cap">Dentro del editor, el menú de ayuda y el diálogo de atajos enlazan al tema que corresponde. Se abre en la misma pestaña y «Volver» regresa a tu trabajo sin perderlo.</p></div>', 'La sesión del editor se guarda antes de salir (ya lo hace el autoguardado de 800 ms).')
body = head('P-21', 'Guía · estados', 'Cargando, búsqueda con y sin resultados, foco de teclado, un tema de Lotes y el enlace desde dentro de la app.')
body += nav('guia', 'Tema oscuro') + f'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start">{c1}{c2}{c3}{c4}{c5}{c6}</div>'
board('P-21', 'Guía · estados', body, 'dark', 'guia-estados', 1010)

# P-23 mantenimiento
md = '''<i># docs/GUIDE.md</i>

<b>## id: editar-anotacion</b>
<b>título:</b> Editar una anotación
<b>grupo:</b> Editor
<b>resumen:</b> Tipo, fuente, color, valor fijo…
<b>captura:</b> screenshots/example_use.png
<b>pasos:</b>
  1. Haz clic sobre el PDF
  2. Escribe el texto o el mapeo
<b>atajos:</b> Intro · Esc · Ctrl+D · Supr
<b>claves i18n:</b> guide.editarAnotacion.*
<b>componente:</b> annotation-editor
<b>desde:</b> v1.0.0'''
body = head('P-23', 'Cómo se mantiene la guía', 'Una sola fuente en Markdown para personas y para la IA. Cuando se añade una función, la misma PR actualiza docs/GUIDE.md, las claves guide.* en los 7 idiomas y, si cambia lo que se ve, la captura.')
body += f'''<div style="display:grid;grid-template-columns:1.1fr 1fr;gap:20px;align-items:start"><div style="display:flex;flex-direction:column;gap:16px">
<div class="card"><h3>El camino de una función nueva</h3><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="st on">1 Se programa</span><span class="ar">→</span><span class="st on">2 Se anota en docs/GUIDE.md</span><span class="ar">→</span><span class="st on">3 Textos en 7 idiomas</span><span class="ar">→</span><span class="st on">4 Captura nueva</span><span class="ar">→</span><span class="st done">5 Aparece en la guía</span></div></div>
<div class="card"><h3>Regla para AGENTS.md y CLAUDE.md</h3><p class="cap" style="font-size:15px">«Si añades, cambias o quitas una función visible, actualiza <span class="mono">docs/GUIDE.md</span> (tema, pasos, atajos, captura) y las claves <span class="mono">guide.*</span> en los 7 idiomas en la misma PR. La definición de terminado incluye la guía.»</p><p class="cap">Se añade también a la lista «Definición de terminado» y a la sección «Cómo trabajar en tareas típicas». Un test (<span class="mono">npm run guide:check</span>) comprueba que cada id de GUIDE.md tenga sus claves y su captura.</p></div>
<div class="card"><h3>Movimiento y accesibilidad de la guía</h3><ul class="l cap" style="font-size:15px"><li>Hover de tarjeta, cambio de tema y borde de la zona: 150–200 ms, ease-out.</li><li>Pines numerados con pulso lento (2 s); con prefers-reduced-motion todo queda estático.</li><li>Contraste AA, foco visible de 3 px, <span class="mono">&lt;nav&gt;</span> con aria-label, <span class="mono">aria-current</span> en el tema abierto, capturas con texto alternativo.</li><li>Solo escritorio, igual que el resto: 1650 y 1280 px.</li></ul></div></div>
<div style="display:flex;flex-direction:column;gap:16px"><div class="card"><h3>Formato propuesto de cada tema en docs/GUIDE.md</h3><div class="code">{md}</div></div>
<div class="note i">{svg("info",18)}<div><b>Por qué Markdown y no solo i18n.</b> La IA ya lee los docs al empezar; un archivo legible con cada función y dónde vive evita que se olvide la guía. Los textos que ve el usuario siguen en los JSON de traducción, como manda AGENTS.md.</div></div></div></div>'''
board('P-23', 'Cómo se mantiene la guía', body, 'dark', 'mantenimiento-guia', 960)

import json
json.dump(made, open(f'{OUT}/../g_made.json', 'w'))
print('ok', [m[0] for m in made])
