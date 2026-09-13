# Kalibra Backend — análisis de fotos de comida

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
```

## 3. El demo web vive en `public/index.html`, no en el Artifact de Claude

**Importante — esto costó descubrirlo:** los Artifacts de Claude (el link
`claude.ai/code/artifact/...`) bloquean por política de seguridad que la
página haga `fetch()` a cualquier servidor externo, el tuyo incluido. Por
eso la app completa (`public/index.html`, la misma que el Artifact pero
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
