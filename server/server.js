"use strict";

/* ============================================================
   Mi Barrio Mejor — servidor HTTP (Node puro, sin dependencias)
   - API REST JSON:
       GET    /api/reportes
       POST   /api/reportes                  (necesita captcha)
       GET    /api/reportes/:id
       GET    /api/noticias
       POST   /api/captcha
       GET    /api/stats
       POST   /api/admin/login               -> { token }
       ----- rutas protegidas por token -----
       GET/PATCH/DELETE  /api/admin/reportes[/:id]
       GET/POST/PATCH/DELETE /api/admin/noticias[/:id]
       GET    /api/admin/stats
   - Sirve los estáticos de /public.
   ============================================================ */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const db = require("./db");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "mibarrio2026";
const SECRETO_SESION = crypto.randomBytes(32).toString("hex");
const SESION_HORAS = 12;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8"
};

/* ---------- Captcha (sencillo, sin dependencias) ---------- */
const captchas = new Map(); // token -> {respuesta, expira}

function generarCaptcha() {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const token = crypto.randomBytes(18).toString("hex");
  captchas.set(token, { respuesta: String(a + b), expira: Date.now() + 1000 * 60 * 5 });
  return {
    token,
    pregunta: `${a} + ${b} = ?`,
    svgColor: a % 2 === 0 ? "#C8862B" : "#4A7BB5"
  };
}

function limpiarCaptchas() {
  const ahora = Date.now();
  for (const [token, data] of captchas) {
    if (data.expira < ahora) captchas.delete(token);
  }
}

function validarCaptcha(token, respuesta) {
  if (!token || !respuesta) return false;
  limpiarCaptchas();
  const data = captchas.get(String(token));
  if (!data) return false;
  captchas.delete(String(token)); // uso único
  return String(respuesta).trim() === data.respuesta;
}

/* ---------- Sesiones de admin ---------- */
const sesiones = new Map(); // token -> {usuario, expira}

function crearSesion(usuario) {
  const token = crypto.randomBytes(32).toString("hex");
  sesiones.set(token, { usuario, expira: Date.now() + SESION_HORAS * 3600 * 1000 });
  return token;
}

function validarSesion(token) {
  if (!token) return null;
  const s = sesiones.get(String(token));
  if (!s) return null;
  if (s.expira < Date.now()) {
    sesiones.delete(String(token));
    return null;
  }
  return s;
}

function esAdmin(req) {
  const cab = req.headers["authorization"] || "";
  const token = cab.replace(/^Bearer\s+/i, "").trim();
  return validarSesion(token) !== null;
}

/* ---------- Helpers ---------- */
function json(res, status, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(cuerpo),
    "Cache-Control": "no-store"
  });
  res.end(cuerpo);
  return true;
}

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let datos = "";
    req.on("data", c => {
      datos += c;
      if (datos.length > 1e6) {
        reject(new Error("cuerpo demasiado grande"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!datos) return resolve({});
      try {
        resolve(JSON.parse(datos));
      } catch (err) {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

/* ---------- Enrutamiento de la API ---------- */
async function manejarApi(req, res, ruta) {
  const metodo = req.method;
  const partes = ruta.split("/").filter(Boolean); // ["api", "recursos", "id"]

  if (partes[0] !== "api") return false;
  const recurso = partes[1];

  try {
    /* ---- Captcha ---- */
    if (recurso === "captcha" && partes.length === 2 && metodo === "POST") {
      limpiarCaptchas();
      return json(res, 200, { datos: generarCaptcha() });
    }

    /* ---- Reportes públicos ---- */
    if (recurso === "reportes" && partes.length === 2) {
      if (metodo === "GET") {
        return json(res, 200, { datos: db.listar() });
      }
      if (metodo === "POST") {
        const cuerpo = await leerBody(req);
        const captchaOk = validarCaptcha(cuerpo.captchaToken, cuerpo.captchaRespuesta);
        if (!captchaOk) return json(res, 400, { error: "La verificación del captcha no es válida o expiró." });
        const creado = db.crear(cuerpo);
        if (!creado) return json(res, 400, { error: "Datos de reporte inválidos." });
        return json(res, 201, { datos: creado });
      }
    }

    if (recurso === "reportes" && partes.length === 3) {
      const id = Number(partes[2]);
      if (!Number.isFinite(id)) return json(res, 400, { error: "ID inválido." });

      if (metodo === "GET") {
        const reporte = db.obtener(id);
        if (!reporte) return json(res, 404, { error: "Reporte no encontrado." });
        return json(res, 200, { datos: reporte });
      }
    }

    /* ---- Noticias públicas ---- */
    if (recurso === "noticias" && partes.length === 2 && metodo === "GET") {
      return json(res, 200, { datos: db.listarNoticias() });
    }

    /* ---- Stats públicos ---- */
    if (recurso === "stats" && partes.length === 2 && metodo === "GET") {
      return json(res, 200, { datos: db.estadisticas() });
    }

    /* ---- Admin ---- */
    if (recurso === "admin" && partes.length === 3 && partes[2] === "login" && metodo === "POST") {
      const cuerpo = await leerBody(req);
      const valido = String(cuerpo.usuario || "") === ADMIN_USER && String(cuerpo.clave || "") === ADMIN_PASS;
      if (!valido) return json(res, 401, { error: "Credenciales incorrectas." });
      const token = crearSesion(cuerpo.usuario);
      return json(res, 200, { datos: { token, usuario: cuerpo.usuario } });
    }

    if (recurso === "admin") {
      if (!esAdmin(req)) return json(res, 401, { error: "Sesión no válida. Vuelve a iniciar sesión." });
      const sub = partes[2];

      if (sub === "stats" && partes.length === 3 && metodo === "GET") {
        return json(res, 200, { datos: db.estadisticas() });
      }

      if (sub === "reportes") {
        if (partes.length === 3 && metodo === "GET") {
          return json(res, 200, { datos: db.listar() });
        }
        if (partes.length === 4) {
          const id = Number(partes[3]);
          if (!Number.isFinite(id)) return json(res, 400, { error: "ID inválido." });
          if (metodo === "PATCH") {
            const cuerpo = await leerBody(req);
            const actualizado = db.actualizarEstado(id, cuerpo.estado);
            if (actualizado === null) {
              if (!db.ESTADOS_VALIDOS.includes(cuerpo.estado)) return json(res, 400, { error: "Estado inválido." });
              return json(res, 404, { error: "Reporte no encontrado." });
            }
            return json(res, 200, { datos: actualizado });
          }
          if (metodo === "DELETE") {
            if (!db.eliminar(id)) return json(res, 404, { error: "Reporte no encontrado." });
            return json(res, 200, { ok: true });
          }
        }
      }

      if (sub === "noticias") {
        if (partes.length === 3 && metodo === "GET") {
          return json(res, 200, { datos: db.listarNoticias() });
        }
        if (partes.length === 3 && metodo === "POST") {
          const cuerpo = await leerBody(req);
          const creada = db.crearNoticia(cuerpo);
          if (!creada) return json(res, 400, { error: "Datos de noticia inválidos." });
          return json(res, 201, { datos: creada });
        }
        if (partes.length === 4) {
          const id = Number(partes[3]);
          if (!Number.isFinite(id)) return json(res, 400, { error: "ID inválido." });
          if (metodo === "PATCH") {
            const cuerpo = await leerBody(req);
            const actualizada = db.actualizarNoticia(id, cuerpo);
            if (!actualizada) {
              if (!db.TIPOS_NOTICIA_VALIDOS.includes(cuerpo.tipo) && cuerpo.tipo) {
                return json(res, 400, { error: "Tipo de noticia inválido." });
              }
              return json(res, 404, { error: "Noticia no encontrada o datos inválidos." });
            }
            return json(res, 200, { datos: actualizada });
          }
          if (metodo === "DELETE") {
            if (!db.eliminarNoticia(id)) return json(res, 404, { error: "Noticia no encontrada." });
            return json(res, 200, { ok: true });
          }
        }
      }
    }

    return json(res, 405, { error: "Método no permitido." });
  } catch (err) {
    if (err.message === "JSON inválido") return json(res, 400, { error: "JSON inválido." });
    if (err.message === "cuerpo demasiado grande") return json(res, 413, { error: "Cuerpo demasiado grande." });
    console.error("[api] error:", err);
    return json(res, 500, { error: "Error interno del servidor." });
  }
}

/* ---------- Estáticos ---------- */
function servirEstatico(req, res, ruta) {
  let relativa = ruta === "/" || ruta === "" ? "/index.html" : ruta;
  const destino = path.resolve(PUBLIC_DIR, "." + decodeURIComponent(relativa));

  if (!destino.startsWith(PUBLIC_DIR + path.sep) && destino !== path.join(PUBLIC_DIR, "index.html")) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("403 Prohibido");
  }

  fs.stat(destino, (err, stats) => {
    if (err || !stats.isFile()) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (err2, html) => {
        if (err2) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("404 No encontrado");
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      });
      return;
    }

    const ext = path.extname(destino).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    fs.createReadStream(destino).pipe(res);
  });
}

/* ---------- Servidor ---------- */
const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  manejarApi(req, res, pathname).then(procesado => {
    if (!procesado) servirEstatico(req, res, pathname);
  });
});

db.sembrar();
server.listen(PORT, () => {
  console.log("──────────────────────────────────────────────");
  console.log("  Mi Barrio Mejor — servidor listo");
  console.log(`  URL:     http://localhost:${PORT}`);
  console.log(`  SQLite:  ${db.DB_PATH}`);
  console.log(`  Admin:   ${ADMIN_USER} / ${ADMIN_PASS}  (panel en /admin.html)`);
  console.log("  Ctrl+C para detener");
  console.log("──────────────────────────────────────────────");
});