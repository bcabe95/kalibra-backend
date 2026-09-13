// Backend minimo de Kalibra: recibe una foto de comida (en base64) y le pide
// a Claude que estime sus macros. La API key de Anthropic vive SOLO aca,
// como variable de entorno del servidor -- nunca en el codigo del cliente,
// nunca en el repo, nunca en el chat.
//
// Ruta: POST /api/analyze-food
// Body: { image: "<base64 sin el prefijo data:...>", mediaType: "image/jpeg" }
// Responde: { name, kcal, p, c, f } o { error: "no_food" } si Claude no
// reconoce comida en la foto.

const crypto = require("crypto");

// La app nativa llama con fetch() desde React Native, que no aplica CORS —
// el header solo importa para navegadores. El unico consumidor de navegador
// es este mismo sitio (kalibra-backend.vercel.app, mismo origen -> el
// navegador ni siquiera revisa CORS ahi) y localhost durante desarrollo. El
// Artifact de Claude NO llama a este endpoint (FOOD_ANALYZE_URL queda vacio
// ahi porque los Artifacts bloquean fetch externo). Por eso ya no hace
// falta "*": una lista blanca angosta evita que cualquier sitio de
// terceros pueda invocar este endpoint desde el navegador de un visitante
// y gastar tu cuota de la API sin que ni siquiera abran kalibra-backend.
const ALLOWED_ORIGINS = ["https://kalibra-backend.vercel.app", "http://localhost:3000"];

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // Los buffers deben ser del mismo largo para timingSafeEqual -- si no lo
  // son, igual se compara contra algo del mismo largo que bufA para no
  // filtrar por un camino rapido cuanto mide el secreto real.
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Secret");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  // Freno liviano contra abuso. OJO: la URL de este endpoint es publica por
  // naturaleza (cualquiera puede verla mirando el codigo del artifact), asi
  // que este secreto compartido NO es seguridad real -- un atacante
  // decidido tambien lo encontraria ahi. Solo evita que bots genericos que
  // escanean internet buscando endpoints abiertos gasten tu cuota de la
  // API sin querer. La proteccion real para produccion es autenticar
  // usuarios de verdad (login + recibo de compra de la tienda -- ver el
  // README del proyecto kalibra-app para el plan de suscripcion nativa).
  const expectedSecret = process.env.APP_SHARED_SECRET;
  if (expectedSecret) {
    const provided = req.headers["x-app-secret"];
    // Comparacion en tiempo constante -- con "!==" alguien podria medir
    // cuantos caracteres del secreto acerto por la diferencia de tiempo de
    // respuesta (timing attack), letra por letra.
    if (!provided || !timingSafeEqualStrings(provided, expectedSecret)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "server_misconfigured",
      message: "Falta ANTHROPIC_API_KEY en las variables de entorno del servidor.",
    });
    return;
  }

  const body = req.body || {};
  const image = body.image;
  const mediaType = body.mediaType;
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "missing_image" });
    return;
  }
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const safeMediaType = allowedTypes.includes(mediaType) ? mediaType : "image/jpeg";

  // Tope duro de tamano -- el cliente ya manda la imagen redimensionada,
  // esto solo protege contra payloads absurdos o mal formados.
  const approxBytes = (image.length * 3) / 4;
  if (approxBytes > 8 * 1024 * 1024) {
    res.status(413).json({ error: "image_too_large" });
    return;
  }

  const prompt =
    "Eres un nutricionista. Mira la foto de este plato de comida y estima sus valores " +
    "nutricionales aproximados. Responde SOLO con un objeto JSON, sin texto adicional ni " +
    "explicacion, exactamente con este formato: " +
    '{"name": "nombre breve del plato, en espanol", "kcal": numero_entero, ' +
    '"p": gramos_de_proteina_entero, "c": gramos_de_carbohidratos_entero, "f": gramos_de_grasa_entero}. ' +
    'Si la imagen no muestra comida reconocible, responde exactamente {"error":"no_food"}.';

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: safeMediaType, data: image } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      // El detalle completo (que puede traer info interna de la cuenta de
      // Anthropic) queda solo en los logs del servidor -- al cliente le
      // llega un codigo generico, no el cuerpo crudo del error.
      const errBody = await anthropicRes.text().catch(function () { return ""; });
      console.error("analyze-food: upstream error", anthropicRes.status, errBody.slice(0, 500));
      res.status(502).json({ error: "upstream_error" });
      return;
    }

    const data = await anthropicRes.json();
    const text = (data.content && data.content[0] && data.content[0].text) || "";

    let parsed;
    try {
      // Tolerante: agarra el primer bloque {...} del texto, por si Claude
      // agrega algo alrededor pese a la instruccion de responder solo JSON.
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : text);
    } catch (e) {
      console.error("analyze-food: invalid AI response", text.slice(0, 500));
      res.status(502).json({ error: "invalid_ai_response" });
      return;
    }

    // Nunca reenviar el objeto de Claude tal cual: solo los 4 campos que la
    // app espera, ya tipados -- si el modelo fuera manipulado (via texto
    // escondido en la foto) para devolver campos extra o de otro tipo, no
    // llegan al cliente.
    const safeName = typeof parsed.name === "string" ? parsed.name.slice(0, 120) : "";
    const safeNum = function (v) { return Number.isFinite(Number(v)) ? Number(v) : 0; };
    if (parsed && parsed.error === "no_food") {
      res.status(200).json({ error: "no_food" });
      return;
    }
    res.status(200).json({ name: safeName, kcal: safeNum(parsed.kcal), p: safeNum(parsed.p), c: safeNum(parsed.c), f: safeNum(parsed.f) });
  } catch (e) {
    console.error("analyze-food: unexpected error", e);
    res.status(502).json({ error: "upstream_error" });
  }
};
