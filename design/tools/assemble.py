import json,re,os
CAP='cap'; ROOT='canvas/project'
ov={'V-17':'089eb460c32a6df369d0e63c09d6b9c0'}
blobs={'V-04':'4819f958dd64bfb413cb2650e97711d1','V-05':'ba5121f30a62ddd12b83e5df52cda4f9','V-06':'74a0055dc6b762bfaa9073e3e2ed8fcf','V-07':'e2c791e615cf88f615fc8a01bda53129','V-08':'1dbdb10ba0f7e905b43cada857fa215f','V-09':'e7f52cf8d8932cdac865cc3f37895bf6','V-10':'5f2421b142b887e8aa6511810b35b523','V-11':'ff7d21467c8af854859d5dca37251162','V-12':'0fd6f8573f7d861846fffb3a32b3c192','V-13':'889f4fb78e68114dc5cdcc40c13ae8c7','V-14':'010297402ed8e3377d55fed59f2a3102','V-15':'98abd15ace7d0016847e04dcaedc86b1','V-16':'5f65901ecc07f56ef214beacb05d977e','V-17':'600ee4ecfe028603be234399ed4fac48','V-18':'89709f100eeeb524cca925ccb5ae703c'}
imgs={'/logo.svg':'3b1c7d405f5e428ffa466253ab28e2ae','/assets/landing/preview-dark.webp':'eef37433276ba17c50a7ceb6427a1d0b','/assets/landing/preview-light.webp':'34a3ce82589e27b42e324c2d33141e1f'}
idx=json.load(open(f'{CAP}/index.json'))
slug=lambda s: re.sub(r'[^A-Za-z0-9]+','-',s.encode('ascii','ignore').decode() if False else re.sub('[áàä]','a',re.sub('[éè]','e',re.sub('[íì]','i',re.sub('[óò]','o',re.sub('[úù]','u',s.lower()))))) ).strip('-')
boards={}; order=['Main.dc.html']
names={}
for e in idx:
    h=open(f"{CAP}/{e['file']}.body.html",encoding='utf8').read()
    h=re.sub(r'^<[a-z-]+',"<div",h,count=1); h=re.sub(r'</[a-z-]+>$',"</div>",h)
    if e['canvases']: h=h.replace('__CANVAS_0__','/_blob/'+blobs[e['id']])
    if e['id'] in ov: h=h.replace('__CANVAS_1__','/_blob/'+ov[e['id']])
    def img(m):
        tag=m.group(0); src=re.search(r'src="__IMG__:([^"]*)"',tag).group(1)
        if src in imgs: return tag.replace(f'__IMG__:{src}','/_blob/'+imgs[src])
        st=re.search(r'style="([^"]*)"',tag); st=st.group(1) if st else ''
        return f'<div style="{st};background-color:rgba(128,128,128,.25)"></div>'
    h=re.sub(r'<img[^>]*src="__IMG__:[^"]*"[^>]*>',img,h)
    fname=f"{e['id']}-{slug(e['name'])}.dc.html"
    title=f"{e['id']} {e['name']}"
    doc=f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
body{{margin:0}}
</style>
</helmet>
<div style="width:{e['w']}px;height:{e['h']}px;position:relative;overflow:hidden;background-color:{e['bg']};font-family:'Segoe UI',sans-serif">
{h}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{e['w']},"height":{e['h']}}}}}'>
class Component extends DCLogic {{
  renderVals() {{
    return {{}};
  }}
}}
</script>
</body>
</html>
'''
    open(f'{ROOT}/{fname}','w',encoding='utf8').write(doc)
    names[e['id']]=(fname,title,e['w'],e['h'])
# layout
rows=[('Landing',['V-01','V-02','V-03','V-19']),('Workspace · pestañas y temas',['V-04','V-05','V-06','V-07','V-08','V-09','V-10']),('Workspace · editores y selección',['V-11','V-12','V-13']),('Workspace · atajos, avisos y vistas',['V-14','V-15','V-16','V-17','V-18'])]
cfg={'v':3,'createdOnFiles':{'v':1,'at':'2026-11-09T15:35:00Z'},'title':'PDF Annotator · Diseño de la interfaz','launch':{'view':'canvas'},'pages':[],'boards':{'Main.dc.html':{'x':0,'y':0,'w':1280,'h':760,'title':'Tokens de diseño'}},'order':['Main.dc.html'],'notes':{},'designSystems':[]}
cfg['notes']['t0']={'x':0,'y':-300,'text':'Referencia · tokens','kind':'title1','maxW':1280}
cfg['notes']['convencion']={'x':-420,'y':0,'w':340,'text':'Convención: V-NN pantallas que ya existen, P-NN propuestas (remaquetado por lotes, pendiente de aprobación). Una fila por versión o propuesta, solo con las mesas que cambian. La app es solo de escritorio (no hay diseño móvil). Las mesas V-01 a V-19 son capturas del DOM real de la app v1.5.0 (1:1): textos, medidas y colores salen del código. Las imágenes del visor y las miniaturas son del PDF de ejemplo; las miniaturas aparecen como cajas grises.'}
y=760+120+260; n=0
for title,ids in rows:
    # place in lines of up to 3 wide boards
    cfg['notes'][f'r{n}']={'x':0,'y':y-300,'text':title,'kind':'title1','maxW':5400}; n+=1
    x=0; rowh=0; line=0
    for i in ids:
        f,t,w,h=names[i]
        if x+w>5400 and x>0:
            y+=rowh+120; x=0; rowh=0
        cfg['boards'][f]={'x':x,'y':y,'w':w,'h':h,'title':t}
        order.append(f); x+=w+80; rowh=max(rowh,h)
    y+=rowh+120+260
import json as _j
for code,fn,t in [(m[1].split(' ')[0],m[0],m[1]) for m in _j.load(open('p_made.json'))]: names[code]=(fn,t,1720,900)
prows=[('Propuesta · remaquetado por lotes (pendiente de aprobación) · flujo y lote',['P-01','P-02','P-03']),('Propuesta · remaquetado · plantilla, comparar y tamaños',['P-04','P-05','P-06','P-07','P-08']),('Propuesta · remaquetado · cierre y tema claro',['P-09','P-10'])]
for title,ids in prows:
    cfg['notes'][f'r{n}']={'x':0,'y':y-300,'text':title,'kind':'title1','maxW':5400}; n+=1
    x=0; rowh=0
    for i in ids:
        f,t,w,h=names[i]
        if x+w>5400 and x>0:
            y+=rowh+120; x=0; rowh=0
        cfg['boards'][f]={'x':x,'y':y,'w':w,'h':h,'title':t}; order.append(f); x+=w+80; rowh=max(rowh,h)
    y+=rowh+120+260
cfg['order']=order
json.dump(cfg,open(f'{ROOT}/canvas.json','w'),ensure_ascii=False,indent=1)
print(len(order),'boards'); 
