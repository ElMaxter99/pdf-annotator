# Genera las mesas P-NN (propuesta de remaquetado por lotes). Solo escritorio.
import os,sys
OUT=sys.argv[1] if len(sys.argv)>1 else 'canvas/project'
LOGO='/_blob/3b1c7d405f5e428ffa466253ab28e2ae'
Z='{​{'   # llaves dobles sin disparar el motor
THEMES={
 'dark':dict(bg='#1e1e2f',panel='#2a2a3d',accent='#5eead4',danger='#ff4d4d',text='#f5f5f5',muted='#b0b0b0',ink='#1e1e2f',line='rgba(255,255,255,.14)',soft='rgba(255,255,255,.06)',warn='#fbbf24',ok='#5eead4',inset='#1e1e2f'),
 'light':dict(bg='#f6f7fb',panel='#ffffff',accent='#0f9b8e',danger='#dc2626',text='#0f172a',muted='#475569',ink='#ffffff',line='rgba(15,23,42,.18)',soft='rgba(15,23,42,.05)',warn='#b45309',ok='#0f766e',inset='#eef0f6'),
}
CSS='''
*{box-sizing:border-box}
body{margin:0}
.p{width:1720px;height:900px;position:relative;overflow:hidden;background:var(--bg);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:15px;padding:24px;display:flex;flex-direction:column;gap:16px}
.p h1,.p h2,.p h3,.p p{margin:0}
.lab{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:600}
.cap{color:var(--muted);font-size:14px;line-height:1.45}
.hdr{background:var(--panel);border-radius:16px;padding:12px 20px;display:flex;align-items:center;gap:14px;border:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--accent);margin-right:8px}
.brand small{display:block;color:var(--muted);font-weight:400;font-size:12px}
.btn{font:inherit;font-size:14px;font-weight:600;border:0;border-radius:999px;padding:8px 18px;min-height:40px;background:var(--accent);color:var(--ink);display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.btn.g{background:transparent;color:var(--text);border:1px solid var(--line)}
.btn.d{background:transparent;color:var(--danger);border:1px solid var(--danger)}
.btn.s{min-height:32px;padding:4px 12px;font-size:13px}
.btn[disabled]{opacity:.45}
.st{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;background:var(--soft);color:var(--muted);white-space:nowrap}
.st.on{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}
.st.done{color:var(--text)}
.st.err{color:var(--danger);background:color-mix(in srgb,var(--danger) 14%,transparent)}
.st.warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 16%,transparent)}
.seg{display:inline-flex;background:var(--soft);border-radius:999px;padding:4px}
.seg span{font-size:13px;font-weight:600;color:var(--muted);border-radius:999px;padding:7px 16px}
.seg span.on{background:var(--accent);color:var(--ink)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:12px}
.card h3{font-size:17px;font-weight:600}
.drop{border:2px dashed var(--line);border-radius:16px;padding:24px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;background:var(--inset)}
.drop.act{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--inset))}
.ic{width:44px;height:44px;border-radius:12px;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:22px}
.row{display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:12px;background:var(--soft);font-size:14px}
.row.sel{outline:2px solid var(--accent)}
.bar{height:8px;border-radius:999px;background:var(--soft);overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent);border-radius:999px}
.bar i.w{background:var(--warn)}.bar i.e{background:var(--danger)}
.mono{font-family:Consolas,monospace;font-size:13px}
.kbd{font-family:Consolas,monospace;font-size:12px;border:1px solid var(--line);border-radius:6px;padding:1px 6px}
.pane{background:var(--inset);border-radius:14px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:0}
.pg{position:relative;background:#fff;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,.35);overflow:hidden}
.pg .band{position:absolute;left:0;right:0;top:0;height:9%;background:#0f9b8e}
.ln{position:absolute;height:5px;border-radius:3px;background:#cfd2da}
.fd{position:absolute;border:2px solid #0f9b8e;background:rgba(15,155,142,.16);border-radius:3px}
.fd.bad{border-color:#dc2626;background:rgba(220,38,38,.14)}
.fd.ghost{border:2px dashed #dc2626;background:transparent}
.tag{font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;background:var(--soft);color:var(--text)}
.tbl{display:flex;flex-direction:column;gap:6px}
.tr{display:grid;gap:14px;align-items:center;padding:7px 14px;border-radius:12px;background:var(--soft);font-size:14px}
.tr.h{background:transparent;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.sp{flex-grow:1}
.sk{background:linear-gradient(90deg,var(--soft),var(--line),var(--soft));border-radius:6px;display:inline-block}
.note{border-radius:12px;padding:12px 16px;display:flex;gap:12px;align-items:flex-start;font-size:14px;line-height:1.45}
.note.w{background:color-mix(in srgb,var(--warn) 14%,transparent);border:1px solid color-mix(in srgb,var(--warn) 55%,transparent)}
.note.e{background:color-mix(in srgb,var(--danger) 12%,transparent);border:1px solid color-mix(in srgb,var(--danger) 60%,transparent)}
.note.i{background:color-mix(in srgb,var(--accent) 10%,transparent);border:1px solid color-mix(in srgb,var(--accent) 45%,transparent)}
.radio{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:14px;border:1px solid var(--line)}
.radio.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
.dot{width:18px;height:18px;border-radius:50%;border:2px solid var(--muted);flex-shrink:0;margin-top:2px}
.radio.on .dot{border-color:var(--accent);background:radial-gradient(var(--accent) 45%,transparent 50%)}
.chk{width:18px;height:18px;border-radius:5px;border:2px solid var(--muted);flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-size:12px;line-height:1}
.chk.on{background:var(--accent);border-color:var(--accent);color:var(--ink)}
.ta{background:var(--inset);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-family:Consolas,monospace;font-size:13px;line-height:1.55;white-space:pre;overflow:hidden}
.g2{display:grid;gap:16px}
.toast{position:absolute;right:24px;bottom:24px;background:var(--panel);border-left:4px solid var(--accent);border-radius:12px;padding:12px 16px;box-shadow:0 8px 30px rgba(0,0,0,.4);display:flex;gap:12px;font-size:14px}
.toast.e{border-color:var(--danger)}
'''
def page(w,h=None,fields=(),ghost=(),band=True,lines=None):
    h=h or int(w*842/595)
    ls=lines or [(8,11,48),(15,11,34),(30,8,78),(35,8,74),(40,8,76),(48,8,62),(58,8,70),(63,8,66),(68,8,72),(78,8,40)]
    s=f'<div class="pg" style="width:{w}px;height:{h}px">'+('<div class="band"></div>' if band else '')
    for t,l,wd in ls: s+=f'<div class="ln" style="top:{t+4}%;left:{l}%;width:{wd}%"></div>'
    for f in fields:
        l,t,wd,ht,*c=f; cls='fd '+(c[0] if c else ''); s+=f'<div class="{cls}" style="left:{l}%;top:{t}%;width:{wd}%;height:{ht}%"></div>'
    for f in ghost:
        l,t,wd,ht=f; s+=f'<div class="fd ghost" style="left:{l}%;top:{t}%;width:{wd}%;height:{ht}%"></div>'
    return s+'</div>'
STEPS=['Lote','Plantilla','PDF nuevo','Comparar','Exportar']
def stepper(cur):
    o=''
    for i,n in enumerate(STEPS):
        if i<cur: o+=f'<span class="st done">✓ {n}</span>'
        elif i==cur: o+=f'<span class="st on">{i+1} {n}</span>'
        else: o+=f'<span class="st">{i+1} {n}</span>'
    return o
def hdr(cur,right=''):
    return f'<div class="hdr"><div class="brand"><img src="{LOGO}" width="36" height="36" alt=""><div>Pdf Annotator<small>Remaquetado por lotes</small></div></div>{stepper(cur)}<span class="sp"></span>{right}</div>'
def head(code,title,sub):
    return f'<div style="display:flex;flex-direction:column;gap:4px"><span class="lab">{code}</span><h1 style="font-size:26px;font-weight:600">{title}</h1><p class="cap" style="max-width:1300px">{sub}</p></div>'
def board(code,title,body,theme='dark',nm=None):
    t=THEMES[theme]; vars=';'.join(f'--{k}:{v}' for k,v in t.items())
    fn=f'{code}-{nm}.dc.html'
    doc=f'''<!doctype html>
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
<div class="p" style="{vars}">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1720,"height":900}}}}'>
class Component extends DCLogic {{
  renderVals() {{
    return {{}};
  }}
}}
</script>
</body>
</html>
'''
    open(f'{OUT}/{fn}','w',encoding='utf8').write(doc)
    return fn,f'{code} {title}'
made=[]
def add(*a,**k): made.append(board(*a,**k))
FIELDS_OK=[(8,14,30,4),(8,30,50,4),(8,40,48,4),(8,50,40,4),(55,14,28,4)]
# ---------- P-01 flujo
cards=''
info=[('1','Lote','Sube hasta 50 PDF y tus JSON de Mongo. Se asocian por nombre y puedes corregirlo.','Estados: vacío · arrastrando · subiendo n de N · rechazados'),
('2','Plantilla','Pega o carga el script (solo cuenta «pages»). Validación en vivo con línea y columna del error.','Estados: sin plantilla · válida · con error'),
('3','PDF nuevo','Sube el PDF que sustituye al original. Se muestra tamaño de página y peso.','Aviso si la página mide distinto (A4 frente a Letter)'),
('4','Comparar','Original, nuevo, lado a lado o superpuesto. Zoom y scroll sincronizados. Arrastra los campos descolocados.','Deshacer / rehacer como en el editor de siempre'),
('5','Exportar','JSON por PDF y PDF anotado, en un ZIP o sueltos, con contador «26 de 80».','Estados: preparando · descargando · completo · error')]
for n,t,d,e in info:
    cards+=f'<div class="card" style="flex:1"><span class="st on" style="align-self:flex-start">Paso {n}</span><h3 style="font-size:22px">{t}</h3><p class="cap" style="font-size:15px">{d}</p><p class="cap" style="color:var(--accent)">{e}</p></div>'
body=head('P-01 · Propuesta · pendiente de aprobación','Flujo de remaquetado por lotes','Para 20–50 PDF, uno por uno: importar plantillas y PDF, asociarlos, subir el PDF sustituto, comparar antes y después, ajustar, exportar y pasar al siguiente. Todo se queda en el navegador. Solo escritorio.')+f'<div style="display:flex;gap:16px">{cards}</div>'
body+=f'''<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;flex-grow:1">
<div class="card"><h3>Principios de diseño</h3><ul class="cap" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px"><li>Cada acción larga muestra progreso con contador y estado por fila.</li><li>Nada se pierde: el lote se guarda en el navegador y se puede retomar.</li><li>Todo se puede deshacer; borrar pide confirmar con aviso, nunca con diálogo del sistema.</li><li>Animaciones de 150–300 ms con ease-out y sin movimiento si el sistema lo pide.</li></ul></div>
<div class="card"><h3>Qué se conserva del editor actual</h3><ul class="cap" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px"><li>Cabecera, barra de herramientas y paneles de las mesas V-04 a V-09.</li><li>Colores y tipografía de los tokens (tema oscuro y claro).</li><li>Atajos del editor; los nuevos se añaden al diálogo V-14.</li><li>Formato JSON: <span class="mono">{{ "pages": [...] }}</span>.</li></ul></div>
<div class="card"><h3>Decisiones que necesito de Maxter</h3><ul class="cap" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px"><li>¿Lado a lado desde la primera versión, o primero «Original/Nuevo»?</li><li>¿Exportar en ZIP además de archivos sueltos?</li><li>¿Cuánto pesan tus PDF normalmente? Define el límite por archivo y el aviso de almacenamiento.</li><li>¿Se exporta también el PDF anotado o solo el JSON?</li></ul></div></div>'''
add('P-01','Flujo de remaquetado',body,nm='flujo')
# ---------- P-02 subir lote
def filerow(n,sz,state):
    ic={'ok':'<span style="color:var(--accent)">✓</span>','run':'<span style="color:var(--accent)">◔</span>','wait':'<span style="color:var(--muted)">·</span>','err':'<span style="color:var(--danger)">!</span>'}[state]
    bar='<div class="bar" style="width:80px"><i style="width:60%"></i></div>' if state=='run' else ''
    return f'<div class="row">{ic}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{n}</span>{bar}<span class="cap">{sz}</span></div>'
def dz(title,sub,cls='',extra=''):
    return f'<div class="drop {cls}"><div class="ic">📄</div><h3 style="font-size:18px">{title}</h3><p class="cap">{sub}</p>{extra}</div>'
col=lambda lab,inner: f'<div class="card" style="flex:1;min-width:0"><span class="lab">{lab}</span>{inner}</div>'
c1=col('Vacío',dz('Carga tus PDF y JSON','Arrastra hasta 50 PDF y sus JSON, o haz clic para buscar. Solo PDF y JSON.','','<span class="btn" style="margin-top:6px">Seleccionar archivos</span>')+'<p class="cap">🔒 Todo ocurre en tu navegador. Nada se sube a ningún servidor.</p>')
c2=col('Arrastrando',dz('Suelta para añadir','12 archivos: 6 PDF y 6 JSON','act')+'<p class="cap">El borde se ilumina en 150 ms. Si hay archivos no válidos, se avisa al soltar.</p>')
rows=''.join([filerow('albaran-0331.pdf','1,2 MB','ok'),filerow('albaran-0332.pdf','0,9 MB','ok'),filerow('contraste-0107.pdf','2,4 MB','run'),filerow('contraste-0108.pdf','1,1 MB','wait'),filerow('advice-0021.pdf','1,6 MB','wait')])
c3=col('Subiendo',f'<div style="display:flex;justify-content:space-between"><h3>Leyendo 12 de 40</h3><span class="cap">30 %</span></div><div class="bar"><i style="width:30%"></i></div>{rows}<p class="cap">Los nombres se leen en local; puedes seguir mientras tanto.</p>')
rows=''.join([filerow('datos.txt','Solo PDF y JSON','err'),filerow('factura-gigante.pdf','Supera 25 MB','err'),filerow('result-0402.json','JSON no válido · línea 7','err'),filerow('albaran-0331.pdf','Ya está en el lote','err')])
c4=col('Con avisos',f'<div class="note w">⚠ <div><b>4 archivos no se han añadido</b><br>Los otros 36 están listos.</div></div>{rows}<div style="display:flex;gap:8px"><span class="btn s">Revisar el lote</span><span class="btn g s">Ocultar avisos</span></div>')
body=head('P-02 · Propuesta · pendiente de aprobación','Landing · subir el lote','Misma landing de V-01, con la zona de carga ampliada a varios archivos. Cuatro estados: vacío, arrastrando, subiendo con contador y avisos por archivo.')+hdr(0)+f'<div style="display:flex;gap:16px;flex-grow:1;align-items:flex-start">{c1}{c2}{c3}{c4}</div>'
add('P-02','Subir el lote',body,nm='subir-lote')
# ---------- P-03 lista
def tr(name,tpl,size,kb,fields,state,sel=False):
    stm={'listo':('st done','Listo para remaquetar'),'sinjson':('st warn','Sin plantilla'),'sinpdf':('st','Falta PDF nuevo'),'remaq':('st on','Remaquetado'),'err':('st err','Error en JSON'),'exp':('st done','✓ Exportado'),'cargando':('st','Leyendo…')}[state]
    act={'listo':'Abrir','sinjson':'Asociar','sinpdf':'Subir PDF','remaq':'Revisar','err':'Corregir','exp':'Descargar de nuevo','cargando':''}[state]
    tp=tpl if tpl else '<span style="color:var(--warn)">Sin asociar ▾</span>'
    if state=='cargando': tp='<span class="sk" style="width:120px;height:14px"></span>'; size='<span class="sk" style="width:90px;height:14px"></span>'
    return f'<div class="tr{" sel" if sel else ""}" style="grid-template-columns:24px 40px 1.6fr 1.4fr 150px 90px 80px 190px 150px{";outline:2px solid var(--accent)" if sel else ""}"><span class="chk{" on" if sel else ""}">{"✓" if sel else ""}</span><span class="sk" style="width:28px;height:36px"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{name}</span><span class="cap">{tp}</span><span class="cap">{size}</span><span class="cap">{kb}</span><span class="cap">{fields}</span><span class="{stm[0]}">{stm[1]}</span><span class="btn g s" style="justify-self:end">{act}</span></div>' if act else f'<div class="tr" style="grid-template-columns:24px 40px 1.6fr 1.4fr 150px 90px 80px 190px 150px"><span class="chk"></span><span class="sk" style="width:28px;height:36px"></span><span>{name}</span><span>{tp}</span><span>{size}</span><span class="cap">…</span><span class="cap">…</span><span class="{stm[0]}">{stm[1]}</span><span></span></div>'
rows=''.join([
tr('albaran-0331.pdf','albaran-0331.json','A4 · 595×842','1,2 MB','14','remaq',True),
tr('albaran-0332.pdf','albaran-0332.json','A4 · 595×842','0,9 MB','12','listo'),
tr('contraste-0107.pdf','contraste-0107.json','Letter · 612×792','2,4 MB','21','sinpdf'),
tr('contraste-0108.pdf','','A4 · 595×842','1,1 MB','—','sinjson'),
tr('advice-0021.pdf','advice-0021.json','A4 · 595×842','1,6 MB','9','err'),
tr('result-0402.pdf','result-0402.json','A4 · 595×842','0,7 MB','17','exp'),
tr('result-0403.pdf','result-0403.json','A4 · 595×842','0,8 MB','17','exp'),
tr('cleanser-0015.pdf','cleanser-0015.json','A4 · 595×842','1,9 MB','11','listo'),
tr('cleanser-0016.pdf','','',' ','','cargando'),
])
filt=''.join(f'<div class="row{" sel" if i==0 else ""}"><span style="flex:1">{a}</span><b>{b}</b></div>' for i,(a,b) in enumerate([('Todos','40'),('Sin plantilla','3'),('Falta PDF nuevo','5'),('Listos para remaquetar','11'),('Remaquetados','9'),('Exportados','8'),('Con error','2')]))
side=f'''<div class="card" style="width:340px;flex-shrink:0"><h3>Lote · 40 PDF</h3><div class="row" style="background:var(--inset)"><span style="color:var(--muted)">🔍 Buscar por nombre</span></div>{filt}<div style="height:1px;background:var(--line)"></div><h3 style="font-size:15px">Almacenamiento local</h3><div class="bar"><i style="width:34%"></i></div><p class="cap">62 MB de unos 180 MB disponibles · detalle en P-08</p><span class="btn g s" style="align-self:flex-start">Asociar JSON por nombre</span></div>'''
main=f'''<div class="card" style="flex:1;min-width:0"><div style="display:flex;gap:10px;align-items:center"><div class="seg"><span class="on">Lista</span><span>Cuadrícula</span></div><span class="cap">1 seleccionado</span><span class="sp"></span><span class="btn g s">Añadir archivos</span><span class="btn g s">Quitar del lote</span><span class="btn">Remaquetar el siguiente →</span></div>
<div class="tbl"><div class="tr h" style="grid-template-columns:24px 40px 1.6fr 1.4fr 150px 90px 80px 190px 150px"><span></span><span></span><span>PDF</span><span>Plantilla JSON</span><span>Página</span><span>Peso</span><span>Campos</span><span>Estado</span><span></span></div>{rows}</div>
<p class="cap">Cada fila muestra su estado y la acción que toca. Miniaturas como cajas grises mientras se generan. Atajos: <span class="kbd">↑</span> <span class="kbd">↓</span> moverse · <span class="kbd">Enter</span> abrir · <span class="kbd">N</span> siguiente pendiente.</p></div>'''
body=head('P-03 · Propuesta · pendiente de aprobación','Lista del lote','Seis estados por fila (sin plantilla, falta PDF nuevo, listo, remaquetado, error, exportado) más «leyendo». Incluye tamaño de página y peso de cada PDF, filtros con contador y el uso de almacenamiento.')+hdr(0)+f'<div style="display:flex;gap:16px;flex-grow:1;min-height:0">{side}{main}</div>'
add('P-03','Lista del lote',body,nm='lista-lote')
# ---------- P-04 plantilla + PDF nuevo
js1=f'''{{
  "pages": [
    {{
      "num": 1,
      "fields": [
        {{ "x": 150, "y": 722, "mapField": "{Z}cliente.nombre}}}}", "type": "text" }},
        {{ "x": 125, "y": 682, "mapField": "{Z}cliente.nif}}}}", "type": "text" }}
      ]
    }}
  ]
}}'''.replace('}}','}').replace('{{','{') if False else '''{
  "pages": [
    { "num": 1, "fields": [
      { "x": 150, "y": 722, "mapField": "cliente.nombre" },
      { "x": 125, "y": 682, "mapField": "cliente.nif" }
    ] }
  ]
}'''
js2='''{
  "pages": [
    { "num": 1, "fields": [
      { "x": 150, "y": 722, "mapField": "cliente.nombre" },
      { "x": 125, "y": , "mapField": "cliente.nif" }
    ] }
  ]
}'''
c1=f'''<div class="card" style="flex:1"><span class="lab">Plantilla válida</span><h3>albaran-0331 · pegar JSON</h3><div class="ta" style="height:236px">{js1}</div><div class="note i">✓ <div><b>3 páginas · 22 campos</b><br>Solo se usa «pages». El resto del script (id, fontSize global…) se ignora; los campos sin tamaño usan 14 pt.</div></div><div style="display:flex;gap:8px"><span class="btn">Usar plantilla</span><span class="btn g">Cargar archivo .json</span></div><div style="height:1px;background:var(--line)"></div><h3 style="font-size:15px">Páginas detectadas</h3><div class="row"><span>Página 1</span><span class="sp"></span><span class="cap">8 campos</span></div><div class="row"><span>Página 2</span><span class="sp"></span><span class="cap">9 campos</span></div><div class="row"><span>Página 3</span><span class="sp"></span><span class="cap">5 campos</span></div></div>'''
c2=f'''<div class="card" style="flex:1"><span class="lab">Plantilla con error</span><h3>advice-0021 · pegar JSON</h3><div class="ta" style="height:236px">{js2.replace('      { "x": 125, "y": , "mapField": "cliente.nif" }','<span style="background:color-mix(in srgb,var(--danger) 30%,transparent);display:inline-block;width:100%">      { "x": 125, "y": , "mapField": "cliente.nif" }</span>')}</div><div class="note e">⚠ <div><b>Falta un valor en la línea 5, columna 18</b><br>La línea con el error está marcada. Corrígelo y se revalida solo, sin pulsar nada.</div></div><div style="display:flex;gap:8px"><span class="btn" disabled>Usar plantilla</span><span class="btn g">Ir a la línea 5</span></div><div style="height:1px;background:var(--line)"></div><h3 style="font-size:15px">Mientras tanto</h3><p class="cap">Este PDF queda como «Error en JSON» en la lista y no bloquea al resto del lote. Puedes saltarlo y volver luego.</p><span class="btn g s" style="align-self:flex-start">Saltar este PDF</span></div>'''
c3=f'''<div class="card" style="flex:1"><span class="lab">PDF nuevo</span><h3>Sustituir el PDF de albaran-0331</h3><div class="row"><span>📄</span><span style="flex:1">Original · albaran-0331.pdf</span><span class="cap">A4 · 1,2 MB</span></div>{dz('Suelta el PDF nuevo','Solo un PDF · hasta 25 MB','act')}<div class="row sel"><span style="color:var(--accent)">✓</span><span style="flex:1">albaran-0331-v2.pdf</span><span class="cap">A4 · 595×842 · 1,8 MB</span><span class="btn g s">Cambiar</span></div><div class="note i">ℹ <div>Mismo tamaño de página que el original: las anotaciones se colocan tal cual.</div></div><div style="display:flex;gap:8px"><span class="btn">Comparar →</span><span class="btn g">Saltar este PDF</span></div><div style="height:1px;background:var(--line)"></div><h3 style="font-size:15px">Con otro tamaño de página</h3><p class="cap">Si el PDF nuevo mide distinto (A4 frente a Letter) se abre primero la mesa P-07 para elegir cómo colocar los campos.</p></div>'''
body=head('P-04 · Propuesta · pendiente de aprobación','Plantilla y PDF sustituto','Pegar el script de Mongo (solo «pages»), validación en vivo con línea y columna, y subida del PDF nuevo con tamaño de página y peso a la vista.')+hdr(1)+f'<div style="display:flex;gap:16px;flex-grow:1">{c1}{c2}{c3}</div>'
add('P-04','Plantilla y PDF sustituto',body,nm='plantilla-pdf-nuevo')
# ---------- P-05/10 comparar lado a lado
def compare(theme,code,title,sub,nm):
    toolbar=f'''<div class="hdr" style="padding:8px 20px">{stepper(3)}<span class="sp"></span><div class="seg"><span>Original</span><span>Nuevo</span><span class="on">Lado a lado</span><span>Superpuesto</span></div><span class="btn g s" style="border-color:var(--accent);color:var(--accent)">🔗 Zoom y scroll sincronizados</span><span class="btn g s">− 100 % +</span><span class="btn g s">Anterior</span><span class="cap">3 de 40</span><span class="btn g s">Saltar</span></div>'''
    bad=[(8,14,30,4),(8,30,50,4),(8,40,48,4,'bad'),(8,50,40,4),(55,14,28,4)]
    old=[(8,14,30,4),(8,30,50,4),(8,38,48,4),(8,48,40,4),(55,14,28,4)]
    side_list=''.join(f'<div class="row{" sel" if i==2 else ""}"><span style="color:{"var(--danger)" if i==2 else "var(--accent)"}">{"!" if i==2 else "✓"}</span><span style="flex:1">{n}</span></div>' for i,n in enumerate(['cliente.nombre','cliente.nif','linea.concepto','factura.fecha','total']))
    ex=f'''<div class="card" style="width:300px;flex-shrink:0"><h3>Campos de la página 1</h3>{side_list}<div class="note w">⚠ <div><b>1 campo descolocado</b><br>Arrástralo o usa las flechas. Se muestra en rojo.</div></div><div class="cap">Nuevo: A4 · 595×842 pt<br>Original: A4 · 595×842 pt</div><div style="flex:1"></div><span class="btn">Guardar y siguiente →</span><div style="display:flex;gap:8px"><span class="btn g s">↶ Deshacer</span><span class="btn g s">↷ Rehacer</span></div></div>'''
    panes=f'''<div style="display:flex;gap:16px;flex:1;min-width:0"><div class="pane" style="flex:1"><span class="tag">ANTES · albaran-0331.pdf</span>{page(520,736,old)}</div><div class="pane" style="flex:1"><span class="tag" style="background:var(--accent);color:var(--ink)">DESPUÉS · albaran-0331-v2.pdf</span>{page(520,736,bad)}</div></div>'''
    body=head(code,title,sub)+toolbar+f'<div style="display:flex;gap:16px;flex-grow:1;min-height:0">{panes}{ex}</div>'
    add(code,title,body,theme=theme,nm=nm)
compare('dark','P-05','Comparar · lado a lado','Original a la izquierda y PDF nuevo a la derecha, con las mismas anotaciones. Zoom y scroll van sincronizados (se puede desactivar). El campo descolocado se ve en rojo y se arrastra en el nuevo.','comparar-lado-a-lado')
# ---------- P-06 superpuesto
toolbar=f'''<div class="hdr" style="padding:8px 20px">{stepper(3)}<span class="sp"></span><div class="seg"><span>Original</span><span>Nuevo</span><span>Lado a lado</span><span class="on">Superpuesto</span></div><span class="btn g s">− 100 % +</span><span class="btn g s">Anterior</span><span class="cap">3 de 40</span><span class="btn g s">Saltar</span></div>'''
ov=f'''<div class="pane" style="flex:1"><span class="tag">Superpuesto · el original sobre el nuevo al 50 %</span><div style="position:relative;width:470px;height:655px">{page(470,655,[(8,14,30,4),(8,30,50,4),(8,40,48,4,'bad'),(8,50,40,4),(55,14,28,4)])}<div style="position:absolute;inset:0;opacity:.5">{page(470,655,[],[(8,14,30,4),(8,30,50,4),(8,38,48,4),(8,48,40,4),(55,14,28,4)],band=False,lines=[(9,11,48),(16,11,34),(30,8,78),(36,8,74),(41,8,76),(50,8,62),(60,8,70),(66,8,66),(70,8,72),(80,8,40)])}</div></div></div>'''
panel=f'''<div class="card" style="width:420px;flex-shrink:0"><h3>Superpuesto</h3><p class="cap">Dibuja el original encima del nuevo para ver qué se ha movido. Útil cuando solo cambia la maquetación.</p><div><div style="display:flex;justify-content:space-between"><b>Opacidad del original</b><span>50 %</span></div><div class="bar" style="height:10px;margin-top:8px"><i style="width:50%"></i></div><div style="display:flex;justify-content:space-between" class="cap"><span>Solo nuevo</span><span>Solo original</span></div></div><div class="row"><span class="chk on">✓</span>Mostrar contornos de los campos</div><div class="row"><span class="chk"></span>Invertir capas</div><div style="height:1px;background:var(--line)"></div><h3 style="font-size:15px">Leyenda</h3><div class="row"><i style="width:22px;height:12px;border:2px solid #0f9b8e;background:rgba(15,155,142,.2);display:inline-block"></i>Campo en su sitio</div><div class="row"><i style="width:22px;height:12px;border:2px solid #dc2626;background:rgba(220,38,38,.15);display:inline-block"></i>Campo del nuevo descolocado</div><div class="row"><i style="width:22px;height:12px;border:2px dashed #dc2626;display:inline-block"></i>Posición en el original</div><div class="sp"></div><span class="btn">Guardar y siguiente →</span></div>'''
body=head('P-06 · Propuesta · pendiente de aprobación','Comparar · superpuesto','Tercer modo del conmutador, con control de opacidad. Los contornos discontinuos rojos marcan dónde estaba cada campo en el original.')+toolbar+f'<div style="display:flex;gap:16px;flex-grow:1;min-height:0">{ov}{panel}</div>'
add('P-06','Comparar · superpuesto',body,nm='comparar-superpuesto')
# ---------- P-07 tamaño distinto
def pgs(w,h,f): return page(w,h,f)
left=f'''<div class="card" style="flex:1.1"><span class="lab">Tamaños a escala</span><div style="display:flex;gap:40px;align-items:flex-end;justify-content:center;flex-grow:1"><div style="display:flex;flex-direction:column;align-items:center;gap:10px">{page(357,505,[(8,14,30,4),(8,30,50,4),(8,40,48,4)])}<span class="tag">Original · A4 · 595×842 pt</span></div><div style="display:flex;flex-direction:column;align-items:center;gap:10px">{page(367,475,[(8,14,30,4),(8,30,50,4),(8,40,48,4)])}<span class="tag" style="background:var(--warn);color:#1e1e2f">Nuevo · Letter · 612×792 pt</span></div></div><div class="cap">Diferencia: +17 pt de ancho y −50 pt de alto. Con «Escalar campos» el campo cliente.nif pasa de (125, 682) a (128,6, 641,1).</div></div>'''
right=f'''<div class="card" style="flex:1"><div class="note w">⚠ <div><b>El PDF nuevo no mide lo mismo que el original</b><br>Elige cómo colocar las anotaciones. Después podrás ajustarlas en la comparación.</div></div>
<div class="radio on"><span class="dot"></span><div><b>Escalar campos proporcionalmente <span class="st on" style="padding:2px 10px;margin-left:6px">Recomendado</span></b><br><span class="cap">Multiplica x e y por la relación entre las dos páginas. Mantiene la posición relativa.</span></div></div>
<div class="radio"><span class="dot"></span><div><b>Mantener las coordenadas</b><br><span class="cap">No toca x ni y. Úsalo si el contenido nuevo parte del mismo origen (abajo a la izquierda).</span></div></div>
<div class="radio"><span class="dot"></span><div><b>Ajustar a mano</b><br><span class="cap">Colocas los campos tú en la comparación; empiezan en las coordenadas originales.</span></div></div>
<div class="row"><span class="chk on">✓</span><span>Aplicar la misma opción a los otros 6 PDF Letter del lote</span></div>
<div class="sp"></div><div style="display:flex;gap:8px"><span class="btn">Aplicar y comparar →</span><span class="btn g">Cancelar</span></div></div>'''
body=head('P-07 · Propuesta · pendiente de aprobación','Tamaño de página distinto','Aviso al subir un PDF cuya página no mide lo mismo que el original (por ejemplo A4 frente a Letter). Se muestran los dos tamaños a escala y en puntos PDF, y tres formas de resolverlo.')+hdr(2)+f'<div style="display:flex;gap:16px;flex-grow:1;min-height:0">{left}{right}</div>'
add('P-07','Tamaño de página distinto',body,nm='tamano-pagina')
# ---------- P-08 peso / almacenamiento
def frow(n,mb,pct,cls='',state=''):
    return f'<div class="tr" style="grid-template-columns:1.6fr 100px 1.2fr 160px"><span>{n}</span><span class="cap">{mb}</span><div class="bar"><i class="{cls}" style="width:{pct}%"></i></div><span class="cap">{state}</span></div>'
rows=''.join([frow('contraste-0107-v2.pdf','2,4 MB',60,'','Dentro del límite'),frow('cleanser-0015.pdf','1,9 MB',48),frow('albaran-0331-v2.pdf','1,8 MB',45),frow('advice-0021.pdf','1,6 MB',40),frow('informe-anual.pdf','19,2 MB',96,'w','Cerca del límite de 25 MB'),frow('catalogo-completo.pdf','31 MB',100,'e','No se añadió · supera 25 MB')])
left=f'''<div class="card" style="flex:1.5"><span class="lab">Peso por PDF</span><h3>Los más pesados del lote</h3><div class="tbl"><div class="tr h" style="grid-template-columns:1.6fr 100px 1.2fr 160px"><span>PDF</span><span>Peso</span><span>Frente al límite (25 MB)</span><span>Estado</span></div>{rows}</div><div class="row" style="margin-top:6px"><span class="cap">Peso medio</span><b>1,6 MB</b><span class="sp"></span><span class="cap">Total del lote</span><b>62 MB</b></div></div>'''
right=f'''<div class="card" style="flex:1"><span class="lab">Almacenamiento del navegador</span><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:34px;font-weight:600">62 MB</span><span class="cap">de unos 180 MB disponibles</span></div><div class="bar" style="height:12px"><i style="width:34%"></i></div>
<div class="note i">ℹ <div>El navegador decide cuánto deja guardar. Calculamos el margen y avisamos antes de llenarlo.</div></div>
<h3 style="font-size:15px">Cómo avisa</h3><div class="row"><i style="width:60px;height:8px;border-radius:99px;background:var(--accent);display:inline-block"></i><span>Hasta el 70 %: sin avisos</span></div><div class="row"><i style="width:60px;height:8px;border-radius:99px;background:var(--warn);display:inline-block"></i><span>Del 70 al 90 %: aviso amarillo con atajo para liberar</span></div><div class="row"><i style="width:60px;height:8px;border-radius:99px;background:var(--danger);display:inline-block"></i><span>Más del 90 %: bloquea nuevas cargas</span></div>
<div class="note w">⚠ <div><b>Ejemplo al 82 %</b><br>Quedan 32 MB. Quitar los 8 PDF ya exportados libera 14 MB.</div></div><div style="display:flex;gap:8px"><span class="btn s">Quitar exportados (14 MB)</span><span class="btn g s">Descargar y vaciar</span></div></div>'''
body=head('P-08 · Propuesta · pendiente de aprobación','Tamaño de los PDF y almacenamiento','El peso de cada PDF se ve en la lista y en la subida. Límite por archivo de 25 MB (a confirmar con Maxter) y barra de uso del navegador con aviso al 70 % y bloqueo al 90 %.')+hdr(0)+f'<div style="display:flex;gap:16px;flex-grow:1;min-height:0">{left}{right}</div>'
add('P-08','Tamaño de los PDF y almacenamiento',body,nm='peso-almacenamiento')
# ---------- P-09 cierre / descarga
def drow(n,state):
    ic={'ok':'<span style="color:var(--accent)">✓</span>','run':'<span style="color:var(--accent)">◔</span>','wait':'<span style="color:var(--muted)">·</span>','err':'<span style="color:var(--danger)">!</span>'}[state]
    return f'<div class="row">{ic}<span style="flex:1" class="mono">{n}</span></div>'
opts=f'''<div class="card" style="flex:1.1"><span class="lab">Qué descargar</span><div class="radio on"><span class="dot"></span><div><b>Un solo ZIP <span class="st on" style="padding:2px 10px;margin-left:6px">Recomendado</span></b><br><span class="cap">80 archivos en un paquete: 40 JSON y 40 PDF anotados. Unos 64 MB.</span></div></div><div class="radio"><span class="dot"></span><div><b>Archivos sueltos</b><br><span class="cap">Se descargan uno a uno. El navegador puede pedir permiso para descargas múltiples.</span></div></div>
<h3 style="font-size:15px;margin-top:6px">Contenido</h3><div class="row"><span class="chk on">✓</span>JSON remaquetado de cada PDF<span class="sp"></span><span class="cap">40 · 0,3 MB</span></div><div class="row"><span class="chk on">✓</span>PDF anotado (tamaño nuevo)<span class="sp"></span><span class="cap">40 · 63 MB</span></div><div class="row"><span class="chk"></span>Informe CSV del lote<span class="sp"></span><span class="cap">1 · 6 KB</span></div><div class="row"><span class="cap">Nombres:</span><span class="mono">{{nombre}}.json · {{nombre}}.pdf</span></div><div class="sp"></div><span class="btn">⬇ Descargar 80 archivos</span></div>'''.replace('{{nombre}}',Z+'nombre}}')
prog=f'''<div class="card" style="flex:1"><span class="lab">Descargando</span><div style="display:flex;justify-content:space-between"><h3>26 de 80 archivos</h3><span class="cap">33 %</span></div><div class="bar"><i style="width:33%"></i></div>{drow('albaran-0331.json','ok')}{drow('albaran-0331.pdf','ok')}{drow('albaran-0332.json','ok')}{drow('albaran-0332.pdf','run')}{drow('contraste-0107.json','wait')}{drow('contraste-0107.pdf','wait')}<p class="cap">Puedes seguir trabajando. Si cierras la pestaña, se retoma donde se quedó.</p><div class="sp"></div><span class="btn g">Pausar</span></div>'''
done=f'''<div class="card" style="flex:1"><span class="lab">Completo</span><div class="ic" style="background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)">✓</div><h3 style="font-size:22px">Lote terminado</h3><div class="row"><b>38</b><span>remaquetados y descargados</span></div><div class="row"><b>2</b><span>saltados (sin PDF nuevo)</span></div><div class="row"><b>0</b><span>con error</span></div><div class="note e" style="margin-top:4px">⚠ <div><b>Estado de error posible</b><br>Si el navegador bloquea las descargas múltiples, se ofrece el ZIP con un botón «Reintentar como ZIP».</div></div><div class="sp"></div><div style="display:flex;gap:8px"><span class="btn">Descargar de nuevo</span><span class="btn g">Empezar otro lote</span></div></div>'''
body=head('P-09 · Propuesta · pendiente de aprobación','Cierre · descargar el lote','Elegir entre un ZIP o archivos sueltos, qué contenido incluir (con el peso de cada parte), progreso con contador «26 de 80» y pantalla de lote terminado con el caso de error.')+hdr(4)+f'<div style="display:flex;gap:16px;flex-grow:1;min-height:0">{opts}{prog}{done}</div>'
add('P-09','Cierre y descarga',body,nm='cierre-descarga')
# ---------- P-10 comparar claro
compare('light','P-10','Comparar · lado a lado (claro)','Misma mesa P-05 en el tema claro para comprobar contraste: rojo de error #dc2626, acento #0f9b8e en bordes y fondos de botón con texto blanco.','comparar-lado-a-lado-claro')
import json; json.dump(made,open('p_made.json','w'))
print(len(made),'P boards')
