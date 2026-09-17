"use strict";

/* ============================================================
   Mi Barrio Mejor — capa de datos (SQLite nativo, sin deps)
   Usa node:sqlite (incluido en Node >= 22.5, estable en 24).
   ============================================================ */

const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "mibarrio.db");

const CATEGORIAS_VALIDAS = [
  "via-publica",
  "iluminacion",
  "basura",
  "areas-verdes",
  "seguridad",
  "patrimonio",
  "otro"
];
const PRIORIDADES_VALIDAS = ["baja", "media", "alta"];
const ESTADOS_VALIDOS = ["pendiente", "proceso", "resuelto"];
const TIPOS_NOTICIA_VALIDOS = ["noticia", "negocio", "historia"];

/* ---------- Datos semilla (primera vez que se abre) ---------- */
const REPORTES_SEMILLA = [
  {
    titulo: "Bache profundo frente al Castillo Azul",
    categoria: "via-publica",
    prioridad: "alta",
    calle: "Calle Bolívar, entre Junín y O'Connor",
    descripcion: "El bache se agrandó con las últimas lluvias y ya complica el paso de vehículos frente al Castillo Azul.",
    reportante: "Vecino de la cuadra",
    estado: "pendiente",
    fecha: Date.now() - 1000 * 60 * 60 * 24 * 2
  },
  {
    titulo: "Farol apagado cerca de la Casa Dorada",
    categoria: "iluminacion",
    prioridad: "media",
    calle: "Calle Ingavi casi General Trigo",
    descripcion: "Hace más de una semana que el poste no enciende, la esquina queda muy oscura de noche.",
    reportante: "",
    estado: "proceso",
    fecha: Date.now() - 1000 * 60 * 60 * 24 * 5
  },
  {
    titulo: "Acumulación de basura junto al parral",
    categoria: "basura",
    prioridad: "baja",
    calle: "Calle Colón, final",
    descripcion: "Vecinos dejan bolsas fuera del horario de recolección, cerca de donde vendían chicha las hermanas Panoso.",
    reportante: "Doña Ceci",
    estado: "resuelto",
    fecha: Date.now() - 1000 * 60 * 60 * 24 * 9
  }
];

const NOTICIAS_SEMILLA = [
  {
    titulo: "La Casa Dorada recupera su pan de oro",
    tipo: "historia",
    resumen: "La restauración de la fachada dorada avanza a buen ritmo y ya se ven los tonos dorados que hicieron famosa a la esquina.",
    contenido: "Los trabajos de restauración del emblemático edificio de la Plaza Luis de Fuentes entraron en su etapa final. La fachada vuelve a lucir el dorado que la convirtió en referencia del casco viejo. Restauradores del municipio trabajan en detalles de la cornisa y las molduras que le dieron nombre al barrio.",
    autor: "Junta Vecinal Las Panosas",
    fecha: Date.now() - 1000 * 60 * 60 * 24 * 1
  },
  {
    titulo: "Nueva chichería artesanal abre en la calle Colón",
    tipo: "negocio",
    resumen: "Un emprendimiento local retoma la tradición de las hermanas Panoso con chicha de uva y repostería típica.",
    contenido: "En el lugar donde tradicionalmente se vendía chicha de la familia Panoso, un nuevo emprendimiento retoma la costumbre. Ofrecen chicha en 'callejón' con tortilla, bizcochuelo y presentaciones artesanales. El objetivo: recuperar la memoria del barrio y generar empleo local.",
    autor: "Emprendedores de Colón",
    fecha: Date.now() - 1000 * 60 * 60 * 24 * 4
  },
  {
    titulo: "Talleres comunitarios de poda del parral",
    tipo: "noticia",
    resumen: "La junta vecinal organiza jornadas para cuidar los parrales y las áreas verdes del barrio.",
    contenido: "Este fin de semana arranca el ciclo de talleres de poda y mantenimiento de parrales. Los vecinos aprenderán técnicas de cuidado junto a agrónomos voluntarios. Se busca preservar el paisaje vitícola que caracteriza a Las Panosas.",
    autor: "Junta Vecinal Las Panosas",
    fecha: Date.now() - 1000 * 60 * 60 * 24 * 6
  },
  {
    titulo: "Festejos de San Plácido: la novena comienza en el barrio",
    tipo: "historia",
    resumen: "Desde 1938 el barrio celebra a su patrono con misas, castillos y la tradicional vendimia chapaca.",
    contenido: "La novena a San Plácido, patrono del barrio desde 1938, comienza este mes. Las familias de Las Panosas se preparan con castillos, bandas y las comidas típicas de la vendimia. Una tradición que reúne a las cuatro esquinas del casco viejo.",
    autor: "Comité San Plácido",
    fecha: Date.now() - 1000 * 60 * 60 * 24 * 8
  },
  {
    titulo: "Mural colectivo en la esquina de Bolívar y O'Connor",
    tipo: "noticia",
    resumen: "Artistas locales pintarán un gran mural que reúne la historia de la vid, la chicha y los edificios del barrio.",
    contenido: "La convocatoria está abierta para quienes quieran sumarse a pintar un mural de 40 metros cuadrados en la esquina histórica. El diseño une la vid chapaca, la Casa Dorada y el Castillo Azul en una sola pieza.",
    autor: "Colectivo Pincel Chapaco",
    fecha: Date.now() - 1000 * 60 * 60 * 24 * 10
  }
];

let db = null;

function conectar() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS reportes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo      TEXT    NOT NULL,
      categoria   TEXT    NOT NULL,
      prioridad   TEXT    NOT NULL DEFAULT 'media',
      calle       TEXT    NOT NULL,
      descripcion TEXT    NOT NULL,
      reportante  TEXT    NOT NULL DEFAULT '',
      estado      TEXT    NOT NULL DEFAULT 'pendiente',
      fecha       INTEGER NOT NULL,
      CHECK (categoria IN ('via-publica','iluminacion','basura','areas-verdes','seguridad','patrimonio','otro')),
      CHECK (prioridad IN ('baja','media','alta')),
      CHECK (estado   IN ('pendiente','proceso','resuelto'))
    );

    CREATE TABLE IF NOT EXISTS noticias (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo    TEXT    NOT NULL,
      tipo      TEXT    NOT NULL DEFAULT 'noticia',
      resumen   TEXT    NOT NULL DEFAULT '',
      contenido TEXT    NOT NULL DEFAULT '',
      autor     TEXT    NOT NULL DEFAULT '',
      fecha     INTEGER NOT NULL,
      CHECK (tipo IN ('noticia','negocio','historia'))
    );
  `);
  return db;
}

function sembrar() {
  const bd = conectar();

  const fila = bd.prepare("SELECT COUNT(*) AS c FROM reportes").get();
  if (Number(fila.c) === 0) {
    const insert = bd.prepare(`
      INSERT INTO reportes (titulo, categoria, prioridad, calle, descripcion, reportante, estado, fecha)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    bd.exec("BEGIN");
    try {
      for (const r of REPORTES_SEMILLA) {
        insert.run(r.titulo, r.categoria, r.prioridad, r.calle, r.descripcion, r.reportante, r.estado, r.fecha);
      }
      bd.exec("COMMIT");
    } catch (err) {
      bd.exec("ROLLBACK");
      throw err;
    }
  }

  const fNoticias = bd.prepare("SELECT COUNT(*) AS c FROM noticias").get();
  if (Number(fNoticias.c) === 0) {
    const insertN = bd.prepare(`
      INSERT INTO noticias (titulo, tipo, resumen, contenido, autor, fecha)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    bd.exec("BEGIN");
    try {
      for (const n of NOTICIAS_SEMILLA) {
        insertN.run(n.titulo, n.tipo, n.resumen, n.contenido, n.autor, n.fecha);
      }
      bd.exec("COMMIT");
    } catch (err) {
      bd.exec("ROLLBACK");
      throw err;
    }
  }
}

/* ---------- Mapeo de fila ---------- */
function mapearReporte(fila) {
  return {
    id: fila.id,
    titulo: fila.titulo,
    categoria: fila.categoria,
    prioridad: fila.prioridad,
    calle: fila.calle,
    descripcion: fila.descripcion,
    reportante: fila.reportante,
    estado: fila.estado,
    fecha: fila.fecha
  };
}

function mapearNoticia(fila) {
  return {
    id: fila.id,
    titulo: fila.titulo,
    tipo: fila.tipo,
    resumen: fila.resumen,
    contenido: fila.contenido,
    autor: fila.autor,
    fecha: fila.fecha
  };
}

/* ---------- Reportes ---------- */
function listar() {
  return conectar()
    .prepare("SELECT * FROM reportes ORDER BY fecha DESC, id DESC")
    .all()
    .map(mapearReporte);
}

function crear(datos) {
  const titulo = String(datos.titulo || "").trim();
  const categoria = String(datos.categoria || "");
  const prioridad = String(datos.prioridad || "media");
  const calle = String(datos.calle || "").trim();
  const descripcion = String(datos.descripcion || "").trim();
  const reportante = String(datos.reportante || "").trim();

  if (!titulo || !categoria || !calle || !descripcion) return null;
  if (!CATEGORIAS_VALIDAS.includes(categoria)) return null;
  if (!PRIORIDADES_VALIDAS.includes(prioridad)) return null;

  const resultado = conectar()
    .prepare(`
      INSERT INTO reportes (titulo, categoria, prioridad, calle, descripcion, reportante, estado, fecha)
      VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?)
    `)
    .run(titulo, categoria, prioridad, calle, descripcion, reportante, Date.now());

  return obtener(resultado.lastInsertRowid);
}

function obtener(id) {
  const fila = conectar()
    .prepare("SELECT * FROM reportes WHERE id = ?")
    .get(Number(id));
  return fila ? mapearReporte(fila) : null;
}

function actualizarEstado(id, estado) {
  if (!ESTADOS_VALIDOS.includes(estado)) return null;
  const bd = conectar();
  const resultado = bd
    .prepare("UPDATE reportes SET estado = ? WHERE id = ?")
    .run(estado, Number(id));
  return resultado.changes > 0 ? obtener(id) : null;
}

function eliminar(id) {
  const resultado = conectar()
    .prepare("DELETE FROM reportes WHERE id = ?")
    .run(Number(id));
  return resultado.changes > 0;
}

/* ---------- Noticias ---------- */
function listarNoticias() {
  return conectar()
    .prepare("SELECT * FROM noticias ORDER BY fecha DESC, id DESC")
    .all()
    .map(mapearNoticia);
}

function obtenerNoticia(id) {
  const fila = conectar()
    .prepare("SELECT * FROM noticias WHERE id = ?")
    .get(Number(id));
  return fila ? mapearNoticia(fila) : null;
}

function crearNoticia(datos) {
  const titulo = String(datos.titulo || "").trim();
  const tipo = String(datos.tipo || "noticia");
  const resumen = String(datos.resumen || "").trim();
  const contenido = String(datos.contenido || "").trim();
  const autor = String(datos.autor || "").trim();

  if (!titulo || !contenido) return null;
  if (!TIPOS_NOTICIA_VALIDOS.includes(tipo)) return null;

  const resultado = conectar()
    .prepare(`
      INSERT INTO noticias (titulo, tipo, resumen, contenido, autor, fecha)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(titulo, tipo, resumen, contenido, autor, Date.now());

  return obtenerNoticia(resultado.lastInsertRowid);
}

function actualizarNoticia(id, datos) {
  const actual = obtenerNoticia(id);
  if (!actual) return null;

  const titulo = String(datos.titulo ?? actual.titulo).trim();
  const tipo = String(datos.tipo ?? actual.tipo);
  const resumen = String(datos.resumen ?? actual.resumen).trim();
  const contenido = String(datos.contenido ?? actual.contenido).trim();
  const autor = String(datos.autor ?? actual.autor).trim();

  if (!titulo || !contenido) return null;
  if (!TIPOS_NOTICIA_VALIDOS.includes(tipo)) return null;

  const bd = conectar();
  bd.prepare(`
    UPDATE noticias SET titulo = ?, tipo = ?, resumen = ?, contenido = ?, autor = ? WHERE id = ?
  `).run(titulo, tipo, resumen, contenido, autor, Number(id));

  return obtenerNoticia(id);
}

function eliminarNoticia(id) {
  const resultado = conectar()
    .prepare("DELETE FROM noticias WHERE id = ?")
    .run(Number(id));
  return resultado.changes > 0;
}

/* ---------- Estadísticas ---------- */
function estadisticas() {
  const bd = conectar();
  const total = Number(bd.prepare("SELECT COUNT(*) AS c FROM reportes").get().c);
  const apiladas = bd
    .prepare("SELECT estado, COUNT(*) AS c FROM reportes GROUP BY estado")
    .all()
    .reduce((acc, f) => {
      acc[f.estado] = Number(f.c);
      return acc;
    }, {});
  const porTipo = bd
    .prepare("SELECT tipo, COUNT(*) AS c FROM noticias GROUP BY tipo")
    .all()
    .reduce((acc, f) => {
      acc[f.tipo] = Number(f.c);
      return acc;
    }, {});
  return {
    total,
    pendientes: apiladas.pendiente || 0,
    enproceso: apiladas.proceso || 0,
    resueltos: apiladas.resuelto || 0,
    noticias: {
      total: Number(bd.prepare("SELECT COUNT(*) AS c FROM noticias").get().c),
      porTipo
    }
  };
}

/* ---------- Utilidades de hash (para sesiones de admin) ---------- */
function hashTexto(texto, sal) {
  return crypto.createHmac("sha256", sal).update(String(texto)).digest("hex");
}

module.exports = {
  conectar,
  sembrar,
  listar,
  crear,
  obtener,
  actualizarEstado,
  eliminar,
  estadisticas,
  listarNoticias,
  obtenerNoticia,
  crearNoticia,
  actualizarNoticia,
  eliminarNoticia,
  hashTexto,
  TIPOS_NOTICIA_VALIDOS,
  DB_PATH,
  CATEGORIAS_VALIDAS,
  PRIORIDADES_VALIDAS,
  ESTADOS_VALIDOS
};