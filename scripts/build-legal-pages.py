"""Genera las páginas legales públicas (public/legal/*.html) a partir de
legal-src/documentos.html — la fuente completa de los 5 documentos (es la
misma que se publica como Artifact "Documentos Legales KalibraFit").

Por qué existen: las tiendas (App Store / Google Play) exigen un ENLACE
público a la política de privacidad, y el sitio principal (/) está detrás de
una clave de acceso mientras dura la beta. Estas páginas viven en public/
(archivos estáticos, sin pasar por api/app.js), así que son públicas.

Uso (desde kalibra-backend/):   python scripts/build-legal-pages.py
Después de editar legal-src/documentos.html, vuelve a correrlo y haz commit
de los archivos generados en public/legal/.
"""
import html
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "legal-src", "documentos.html")
OUT = os.path.join(ROOT, "public", "legal")

COMPANY = "Kalibrafit Tecnología y Bienestar SpA"
RUT = "78.528.326-0"
DOMICILE = "Rancagua, Región del Libertador General Bernardo O'Higgins, Chile"
EMAIL = "kalibrafit@gmail.com"

# id en la fuente -> (ruta pública, título corto, título de la página, descripción)
DOCS = [
    ("terminos", "terminos", "Términos y Condiciones", "Las reglas de uso de KalibraFit: quién puede usarla, tus obligaciones y los límites de responsabilidad."),
    ("privacidad", "privacidad", "Política de Privacidad", "Qué datos recopila KalibraFit, dónde se guardan, para qué se usan y cuáles son tus derechos."),
    ("membresia", "membresia", "Condiciones de la Membresía", "Precio, renovación automática, cómo cancelar, derecho a retracto y qué pasa si un pago es rechazado."),
    ("salud", "datos-de-salud", "Consentimiento para Datos de Salud", "Qué datos de salud puedes entregar (condiciones, sueño, estrés), para qué se usan y cómo revocarlos."),
    ("entrenamiento", "aviso-entrenamiento", "Aviso sobre Entrenamiento y Salud", "Por qué las rutinas y planes son recomendaciones generales y cuándo consultar a un profesional."),
]
HREF_MAP = {"#" + src: "/" + path for src, path, _, _ in DOCS}

src = open(SRC, encoding="utf-8").read()

# ---- CSS: se reutiliza el de la fuente, sin lo propio de la página única ----
css = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
css = re.sub(r"/\* ---- doc nav ---- \*/.*?(?=main\{)", "", css, flags=re.S)  # nav pegajosa de la fuente
css = css.replace(".doc{ padding-top:56px; margin-top:-56px; border-top:1px solid var(--rule); margin-bottom:8px; }", ".doc{ margin-bottom:8px; }")
css += """
  .site-nav{ display:flex; flex-wrap:wrap; gap:6px 14px; justify-content:center; padding:14px 16px; border-bottom:1px solid var(--rule); font-family:var(--font-sans); font-size:13px; }
  .site-nav a{ color:var(--ink-soft); text-decoration:none; font-weight:600; }
  .site-nav a:hover, .site-nav a[aria-current="page"]{ color:var(--accent-ink); }
  .brand{ display:flex; align-items:center; gap:10px; justify-content:center; padding:22px 16px 6px; text-decoration:none; color:var(--ink); }
  .brand .k{ width:30px; height:30px; border-radius:8px; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-family:var(--font-sans); font-weight:700; font-size:16px; }
  .brand .name{ font-family:var(--font-sans); font-weight:700; font-size:17px; letter-spacing:0.02em; }
  .doc-list{ list-style:none; padding:0; margin:24px 0 0; display:flex; flex-direction:column; gap:12px; }
  .doc-list a{ display:block; padding:16px 18px; border:1px solid var(--rule); border-radius:12px; background:var(--paper-raised); text-decoration:none; color:var(--ink); }
  .doc-list a:hover{ border-color:var(--accent); }
  .doc-list strong{ display:block; font-size:17px; margin-bottom:4px; }
  .doc-list span{ font-family:var(--font-sans); font-size:13px; color:var(--ink-soft); line-height:1.5; }
  .lead{ font-family:var(--font-sans); font-size:14px; color:var(--ink-soft); line-height:1.7; }
"""
fonts = re.search(r'<link rel="stylesheet" href="(https://fonts[^"]+)">', src).group(1)

footer_html = (
    '<footer>%s · RUT %s · %s · <a href="mailto:%s">%s</a>'
    '<br>Estos documentos son la versión completa; dentro de la app se muestra una versión resumida.</footer>'
    % (COMPANY, RUT, html.escape(DOMICILE), EMAIL, EMAIL)
)

def nav(current):
    items = ['<a href="/legal"%s>Inicio</a>' % (' aria-current="page"' if current == "legal" else "")]
    for _, path, title, _ in DOCS:
        items.append('<a href="/%s"%s>%s</a>' % (path, ' aria-current="page"' if current == path else "", title))
    return '<nav class="site-nav">' + "".join(items) + "</nav>"

def page(title, description, body, current):
    return """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s — KalibraFit</title>
<meta name="description" content="%s">
<link rel="stylesheet" href="%s">
<style>%s</style>
</head>
<body>
<a class="brand" href="/legal"><span class="k">K</span><span class="name">KALIBRAFIT</span></a>
%s
<main>
%s
</main>
%s
</body>
</html>
""" % (html.escape(title), html.escape(description), fonts, css, nav(current), body, footer_html)

os.makedirs(OUT, exist_ok=True)

def section(src_id):
    m = re.search(r'<section class="doc" id="%s">(.*?)</section>' % src_id, src, re.S)
    assert m, src_id
    body = m.group(1)
    body = re.sub(r'\s*<div class="doc-num">.*?</div>', "", body)          # "Documento 02 / 05"
    for old, new in HREF_MAP.items():
        body = body.replace('href="%s"' % old, 'href="%s"' % new)
    body = body.replace(EMAIL, '<a href="mailto:%s">%s</a>' % (EMAIL, EMAIL))
    return '<section class="doc">%s</section>' % body

for src_id, path, title, description in DOCS:
    with open(os.path.join(OUT, path + ".html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(page(title, description, section(src_id), path))

index_body = """<section class="doc"><div class="doc-head"><h2>Documentos legales de KalibraFit</h2></div>
<p class="lead">KalibraFit es ofrecida por <strong>%s</strong> (RUT %s), con domicilio en %s. Aquí están completos los documentos que aceptas al usar la app. Para consultas o para ejercer tus derechos escribe a <a href="mailto:%s">%s</a>.</p>
<ul class="doc-list">%s</ul></section>""" % (
    COMPANY, RUT, html.escape(DOMICILE), EMAIL, EMAIL,
    "".join('<li><a href="/%s"><strong>%s</strong><span>%s</span></a></li>' % (p, t, d) for _, p, t, d in DOCS),
)
with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n") as f:
    f.write(page("Documentos legales", "Términos, privacidad, membresía, datos de salud y aviso de entrenamiento de KalibraFit.", index_body, "legal"))

print("páginas generadas:", ["index"] + [p for _, p, _, _ in DOCS])
