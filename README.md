# KalibraFit Backend — análisis de fotos de comida

Backend de un solo endpoint: recibe una foto de comida y le pide a Claude
que estime sus calorías y macros. Existe porque **ningún artifact estático
ni app sin servidor puede guardar una clave de API de forma segura** — la
clave de Anthropic vive acá, como variable de entorno del servidor, y
nunca en el código del demo web ni en el repo.

## 1. Conseguir una clave de Anthropic (si todavía no tienes una)

1. Entra a [console.anthropic.com](https://console.anthropic.com) y crea una cuenta.
2. Agrega un método de pago (se cobra por uso — el estimado de una foto
   cuesta centavos de dólar).
3. Ve a **API Keys** → **Create Key**. Copia la clave (empieza con `sk-ant-...`)
   y guárdala en un lugar seguro — no la vas a poder ver de nuevo.

## 2. Desplegar en Vercel

**Opción simple (dashboard, sin instalar nada):**
1. Sube esta carpeta (`kalibra-backend`) a un repo de GitHub.
2. Entra a [vercel.com](https://vercel.com), crea una cuenta gratis, **Add
   New Project** → importa ese repo.
3. Antes de darle "Deploy", o después en **Settings → Environment
   Variables**, agrega:
   - `ANTHROPIC_API_KEY` = tu clave real de Anthropic
   - `APP_SHARED_SECRET` = cualquier texto largo que inventes (opcional
     pero recomendado — ver la nota de seguridad en `api/analyze-food.js`)
   - `SITE_ACCESS_PASSWORD` = la clave que le vas a pasar a quien pruebe la
     beta (opcional — sin esta variable, el sitio queda abierto para
     cualquiera; ver la sección 3 más abajo)
4. Deploy. Si agregaste las variables después del primer deploy, hace falta
   un **Redeploy** para que las tome.

**Opción CLI:**
```bash
npm install -g vercel
cd kalibra-backend
vercel login
vercel          # despliegue de prueba
vercel --prod   # despliegue de producción
vercel env add ANTHROPIC_API_KEY
vercel env add APP_SHARED_SECRET
vercel env add SITE_ACCESS_PASSWORD
```

## 3. Clave de acceso al sitio (beta privada)

Mientras la app no esté lanzada de verdad, `api/app.js` pide una clave
compartida (Basic Auth del navegador — sale el cuadro nativo pidiendo
usuario/contraseña) antes de mostrar la página. El usuario puede ser
cualquier cosa, solo se revisa la contraseña contra `SITE_ACCESS_PASSWORD`.

- **Para activarla**: configura `SITE_ACCESS_PASSWORD` en Vercel (ver
  arriba) y comparte esa clave con quien deba probar la beta.
- **Para dejar el sitio abierto** (por ejemplo, el día del lanzamiento
  real): borra esa variable de entorno en Vercel y redeploy — sin ella,
  `api/app.js` deja pasar a cualquiera.
- El HTML de la app vive en `app-src/index.html` (no en `public/`) a
  propósito: si estuviera en `public/`, Vercel lo serviría como archivo
  estático directo, sin pasar por el chequeo de la clave. `api/app.js` es
  la única puerta hacia ese archivo — primero valida, después lo lee y lo
  devuelve.
- El endpoint `/api/analyze-food` (la foto con IA) sigue con su propia
  protección aparte (`APP_SHARED_SECRET`, sección de abajo) — no depende
  de `SITE_ACCESS_PASSWORD`.

## 4. El demo web vive en `app-src/index.html`, no en el Artifact de Claude

**Importante — esto costó descubrirlo:** los Artifacts de Claude (el link
`claude.ai/code/artifact/...`) bloquean por política de seguridad que la
página haga `fetch()` a cualquier servidor externo, el tuyo incluido. Por
eso la app completa (`app-src/index.html`, la misma que el Artifact pero
con `FOOD_ANALYZE_URL = "/api/analyze-food"` en vez de vacío) se publica
**en este mismo proyecto de Vercel**, junto al backend — al ser el mismo
origen, el `fetch()` sí funciona. El link del Artifact en claude.ai sigue
existiendo como demo de solo-formulario-manual (útil para mostrar el resto
de la app), pero la foto con IA solo funciona en la URL de Vercel.

Al terminar el deploy, tu app completa (con foto funcionando) queda en:
```
https://kalibra-backend-tuusuario.vercel.app/
```
y el endpoint que usa internamente en:
```
https://kalibra-backend-tuusuario.vercel.app/api/analyze-food
```

Si más adelante le agregas un dominio propio en Vercel, no hace falta
tocar nada del código — `FOOD_ANALYZE_URL` es una ruta relativa
(`/api/analyze-food`), así que sigue funcionando igual sea cual sea el
dominio.

## Probar el endpoint a mano

```bash
curl -X POST https://tu-proyecto.vercel.app/api/analyze-food \
  -H "Content-Type: application/json" \
  -H "X-App-Secret: tu-secreto-opcional" \
  -d '{"image":"<una foto en base64, sin el prefijo data:...>","mediaType":"image/jpeg"}'
```

Debería responder algo como:
```json
{"name":"Ensalada César con pollo","kcal":480,"p":35,"c":20,"f":26}
```

## Nota de seguridad honesta

Este endpoint no tiene autenticación de usuarios reales — solo el secreto
compartido opcional, que es visible en el código del cliente igual que la
URL (cualquier demo público es así). Es suficiente para un demo o una beta
cerrada, pero **no** evita que alguien decidido gaste tu cuota si encuentra
la URL. Para producción de verdad, la protección adecuada es atar esto a
una cuenta de usuario autenticada (login + recibo de compra de la tienda —
ver la sección de membresía en el README de `kalibra-app`), no un secreto
compartido.
