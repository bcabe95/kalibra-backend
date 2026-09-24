// Puerta de acceso a KalibraFit mientras está en beta privada: exige una
// clave compartida antes de servir la página (Basic Auth estándar del
// navegador — no hace falta cuenta ni backend de usuarios).
//
// Por qué una función y no solo un archivo en public/: si el HTML viviera en
// public/, Vercel lo serviría como archivo estático directo, sin pasar por
// ningún chequeo — cualquiera con el link vería la app entera sin pedir
// nada. Por eso index.html se movió fuera de public/ (a app-src/) y esta
// función es la única forma de llegar a su contenido: primero valida la
// clave, recién después lee y devuelve el archivo.
//
// La clave vive en la variable de entorno SITE_ACCESS_PASSWORD (Vercel
// dashboard -> Project Settings -> Environment Variables). Si esa variable
// no está configurada, la función deja pasar a cualquiera (para que
// "vercel dev" sin configurar siga funcionando) — hay que configurarla en
// producción para que la puerta esté realmente activa.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // Mismo motivo que en analyze-food.js: si los largos difieren, igual se
  // compara contra un buffer del mismo largo que bufA para no filtrar por
  // timing cuánto mide la clave real.
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Mismos headers de seguridad que vercel.json aplica al resto del sitio —
// repetidos acá explícitamente para no depender de que el rewrite a esta
// función herede las reglas de "headers" de vercel.json.
function setSecurityHeaders(res) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), geolocation=(), microphone=(), payment=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
  );
}

module.exports = async function handler(req, res) {
  const password = process.env.SITE_ACCESS_PASSWORD;

  if (password) {
    const header = req.headers.authorization || "";
    const [scheme, encoded] = header.split(" ");
    let provided = "";
    if (scheme === "Basic" && encoded) {
      try {
        const decoded = Buffer.from(encoded, "base64").toString("utf8");
        // "usuario:clave" -- el usuario no se valida, cualquier texto sirve
        // ahí; solo importa lo que venga después de los ":".
        const sep = decoded.indexOf(":");
        provided = sep >= 0 ? decoded.slice(sep + 1) : decoded;
      } catch (e) {
        provided = "";
      }
    }
    if (!provided || !timingSafeEqualStrings(provided, password)) {
      setSecurityHeaders(res);
      res.setHeader("WWW-Authenticate", 'Basic realm="KalibraFit", charset="UTF-8"');
      // Nunca cachear una respuesta 401/200 de esta ruta -- si el borde de
      // Vercel guardara en caché la página ya autenticada, la próxima
      // persona sin clave podría recibirla servida desde caché sin que la
      // función vuelva a chequear nada.
      res.setHeader("Cache-Control", "private, no-store, must-revalidate");
      res.status(401).send("Acceso restringido. Pide la clave al equipo de KalibraFit.");
      return;
    }
  }

  setSecurityHeaders(res);
  res.setHeader("Cache-Control", "private, no-store, must-revalidate");
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  try {
    const html = fs.readFileSync(path.join(__dirname, "..", "app-src", "index.html"), "utf8");
    res.status(200).send(html);
  } catch (e) {
    console.error("app.js: no se pudo leer app-src/index.html", e);
    res.status(500).send("Error interno.");
  }
};
