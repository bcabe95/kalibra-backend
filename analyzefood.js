// Backend minimo de Kalibra: recibe una foto de comida (en base64) y le pide
// a Claude que estime sus macros. La API key de Anthropic vive SOLO aca,
// como variable de entorno del servidor -- nunca en el codigo del cliente,
// nunca en el repo, nunca en el chat.
//
// Ruta: POST /api/analyze-food
// Body: { image: "<base64 sin el prefijo data:...>", mediaType: "image/jpeg" }
// Responde: { name, kcal, p, c, f } o { error: "no_food" } si Claude no
// reconoce comida en la foto.

module.exports = async function handler(req, res) {
  // CORS: el demo de Kalibra corre en el dominio de los Artifacts de
  // Claude (distinto al de este backend), asi que hace falta permitir la
  // llamada cross-origin explicitamente.
  res.setHeader("Access-Control-Allow-Origin", "*");
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
    if (provided !== expectedSecret) {
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
      const errBody = await anthropicRes.text().catch(function () { return ""; });
      res.status(502).json({ error: "upstream_error", status: anthropicRes.status, detail: errBody.slice(0, 500) });
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
      res.status(502).json({ error: "invalid_ai_response", raw: text.slice(0, 500) });
      return;
    }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(502).json({ error: "upstream_error", message: String((e && e.message) || e) });
  }
};
