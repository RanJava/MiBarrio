"use strict";

/* ============================================================
   Mi Barrio Mejor — panel de administración (JS vanilla)
   - Login con sesión por token (Bearer)
   - Resumen de estadísticas
   - CRUD de noticias / anuncios / negocios / historias
   - Revisión de reclamos y reportes (cambio de estado, borrado)
   ============================================================ */

const API = "/api";
const TOKEN_KEY = "mibarrio_admin_token";
const USER_KEY = "mibarrio_admin_user";

let token = null;
let noticias = [];
let reportes = [];

/* ---------- Utilidades ---------- */
function mostrarToast(mensaje, tipo = "info") {
  const region = document.getElementById("toast-region");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.tipo = tipo;
  toast.textContent = mensaje;
  const icono = tipo === "success" ? "✓ " : tipo === "error" ? "✕ " : "ℹ ";
  toast.prepend(icono);
  region.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, 3200);
}

function formatearFecha(timestamp) {
  return new Date(timestamp).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" });
}

function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function cargarCredenciales() {
  try {
    token = localStorage.getItem(TOKEN_KEY);
    const user = localStorage.getItem(USER_KEY);
    document.getElementById("admin-user").textContent = user || "";
  } catch (err) { token = null; }
}

function guardarCredenciales(usuario, nuevoToken) {
  try {
    localStorage.setItem(TOKEN_KEY, nuevoToken);
    localStorage.setItem(USER_KEY, usuario);
  } catch (err) { /* ignorar */ }
}

function limpiarCredenciales() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (err) { /* ignorar */ }
  token = null;
}

/* ---------- API con token ---------- */
async function api(url, opciones = {}) {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...opciones
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(cuerpo.error || `Error ${res.status}`);
    if (res.status === 401 && url.includes("/admin/")) {
      cerrarSesion(true);
    }
    throw err;
  }
  return cuerpo;
}

/* ---------- Vistas ---------- */
function mostrarLogin() {
  document.getElementById("login-view").hidden = false;
  document.getElementById("panel-view").hidden = true;
  document.getElementById("btn-logout").hidden = true;
}

function mostrarPanel() {
  document.getElementById("login-view").hidden = true;
  document.getElementById("panel-view").hidden = false;
  document.getElementById("btn-logout").hidden = false;
  cargarResumen();
  cargarNoticias();
  cargarReportes();
  activarTab("resumen");
}

function activarTab(nombre) {
  document.querySelectorAll(".admin-tab").forEach(t =>
    t.classList.toggle("is-active", t.dataset.tab === nombre));
  ["resumen", "noticias", "reportes"].forEach(n => {
    document.getElementById("panel-" + n).hidden = n !== nombre;
  });
}

/* ---------- Login ---------- */
async function manejarLogin(evento) {
  evento.preventDefault();
  const status = document.getElementById("login-status");
  const btn = document.getElementById("btn-login");
  const usuario = document.getElementById("login-usuario").value.trim();
  const clave = document.getElementById("login-clave").value;

  if (!usuario || !clave) {
    status.textContent = "Completa ambos campos.";
    status.dataset.state = "error";
    return;
  }

  btn.classList.add("is-loading");
  btn.disabled = true;
  status.textContent = "";
  status.removeAttribute("data-state");

  try {
    const r = await api(`${API}/admin/login`, {
      method: "POST",
      body: JSON.stringify({ usuario, clave })
    });
    guardarCredenciales(usuario, r.datos.token);
    token = r.datos.token;
    document.getElementById("admin-user").textContent = usuario;
    mostrarPanel();
    mostrarToast("Sesión iniciada. Bienvenido de nuevo.", "success");
  } catch (err) {
    status.textContent = err.message;
    status.dataset.state = "error";
  } finally {
    btn.classList.remove("is-loading");
    btn.disabled = false;
  }
}

function cerrarSesion(forzado) {
  limpiarCredenciales();
  mostrarLogin();
  document.getElementById("login-clave").value = "";
  if (forzado) mostrarToast("Tu sesión expiró. Inicia sesión de nuevo.", "error");
}

/* ---------- Resumen ---------- */
async function cargarResumen() {
  try {
    const r = await api(`${API}/admin/stats`);
    const d = r.datos;
    document.querySelector('[data-stat="total"]').textContent = d.total;
    document.querySelector('[data-stat="pendientes"]').textContent = d.pendientes;
    document.querySelector('[data-stat="proceso"]').textContent = d.enproceso;
    document.querySelector('[data-stat="resueltos"]').textContent = d.resueltos;
    document.querySelector('[data-stat="noticias"]').textContent = d.noticias.total;
  } catch (err) {
    mostrarToast("No se pudo cargar el resumen: " + err.message, "error");
  }
}

/* ---------- Noticias ---------- */
const TIPO_BADGE = {
  noticia: { label: "Noticia", clase: "badge-tipo--noticia" },
  negocio: { label: "Negocio", clase: "badge-tipo--negocio" },
  historia: { label: "Historia", clase: "badge-tipo--historia" }
};

function renderNoticias() {
  const list = document.getElementById("noticias-list");
  list.innerHTML = "";

  if (noticias.length === 0) {
    list.innerHTML = '<p class="admin-empty">Todavía no hay publicaciones. ¡Escribe la primera!</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  noticias.forEach(n => {
    const tipo = TIPO_BADGE[n.tipo] || TIPO_BADGE.noticia;

    const item = document.createElement("article");
    item.className = "admin-item";

    const head = document.createElement("div");
    head.className = "admin-item-head";

    const info = document.createElement("div");
    const meta = document.createElement("div");
    meta.className = "admin-item-meta";
    const b = document.createElement("span");
    b.className = "badge-tipo " + tipo.clase;
    b.textContent = tipo.label;
    const fecha = document.createElement("span");
    fecha.textContent = formatearFecha(n.fecha);
    meta.appendChild(b);
    meta.appendChild(fecha);
    const titulo = document.createElement("h3");
    titulo.className = "admin-item-title";
    titulo.textContent = n.titulo;
    info.appendChild(titulo);
    info.appendChild(meta);

    const acciones = document.createElement("div");
    acciones.className = "admin-item-actions";
    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "btn-small";
    btnEdit.textContent = "✎ Editar";
    btnEdit.style.background = "var(--bg-alt)";
    btnEdit.style.color = "var(--secondary)";
    btnEdit.addEventListener("click", () => editarNoticia(n.id));
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn-small btn-delete";
    btnDel.textContent = "🗑 Eliminar";
    btnDel.addEventListener("click", () => confirmarEliminarNoticia(n.id));
    acciones.appendChild(btnEdit);
    acciones.appendChild(btnDel);

    head.appendChild(info);
    head.appendChild(acciones);

    const body = document.createElement("p");
    body.className = "admin-item-body";
    body.textContent = n.resumen || n.contenido;

    item.appendChild(head);
    item.appendChild(body);
    fragment.appendChild(item);
  });
  list.appendChild(fragment);
}

let noticiaEditandoId = null;

function abrirFormularioNoticia(noticia) {
  const form = document.getElementById("noticia-form");
  form.hidden = false;
  noticiaEditandoId = noticia ? noticia.id : null;
  document.getElementById("n-titulo").value = noticia ? noticia.titulo : "";
  document.getElementById("n-tipo").value = noticia ? noticia.tipo : "noticia";
  document.getElementById("n-resumen").value = noticia ? noticia.resumen : "";
  document.getElementById("n-contenido").value = noticia ? noticia.contenido : "";
  document.getElementById("n-autor").value = noticia ? noticia.autor : "";
  document.getElementById("noticia-status").textContent = "";
  document.getElementById("noticia-status").removeAttribute("data-state");
  document.getElementById("btn-nueva").textContent = noticia ? "✎ Editando…" : "+ Nueva publicación";
  document.getElementById("n-titulo").focus();
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function editarNoticia(id) {
  const n = noticias.find(x => x.id === id);
  if (n) abrirFormularioNoticia(n);
}

function cerrarFormularioNoticia() {
  document.getElementById("noticia-form").hidden = true;
  noticiaEditandoId = null;
  document.getElementById("btn-nueva").textContent = "+ Nueva publicación";
}

async function cargarNoticias() {
  try {
    const r = await api(`${API}/admin/noticias`);
    noticias = r.datos;
    renderNoticias();
  } catch (err) {
    mostrarToast("No se pudo cargar las noticias: " + err.message, "error");
  }
}

async function guardarNoticia(evento) {
  evento.preventDefault();
  const status = document.getElementById("noticia-status");
  const datos = {
    titulo: document.getElementById("n-titulo").value.trim(),
    tipo: document.getElementById("n-tipo").value,
    resumen: document.getElementById("n-resumen").value.trim(),
    contenido: document.getElementById("n-contenido").value.trim(),
    autor: document.getElementById("n-autor").value.trim()
  };

  if (!datos.titulo || !datos.contenido) {
    status.textContent = "El título y el contenido son obligatorios.";
    status.dataset.state = "error";
    return;
  }

  try {
    if (noticiaEditandoId === null) {
      await api(`${API}/admin/noticias`, { method: "POST", body: JSON.stringify(datos) });
      mostrarToast("Noticia publicada.", "success");
    } else {
      await api(`${API}/admin/noticias/${noticiaEditandoId}`, { method: "PATCH", body: JSON.stringify(datos) });
      mostrarToast("Noticia actualizada.", "success");
    }
    cerrarFormularioNoticia();
    await cargarNoticias();
    await cargarResumen();
  } catch (err) {
    status.textContent = err.message;
    status.dataset.state = "error";
  }
}

function confirmarEliminarNoticia(id) {
  const n = noticias.find(x => x.id === id);
  abrirModal(
    "¿Eliminar esta publicación?",
    n ? `"${n.titulo}" se quitará del sitio permanentemente.` : "Se quitará del sitio permanentemente.",
    async () => {
      try {
        await api(`${API}/admin/noticias/${id}`, { method: "DELETE" });
        mostrarToast("Noticia eliminada.", "info");
        await cargarNoticias();
        await cargarResumen();
      } catch (err) {
        mostrarToast("No se pudo eliminar: " + err.message, "error");
      }
    }
  );
}

/* ---------- Reportes ---------- */
const ESTADO_LABEL = { pendiente: "Pendiente", proceso: "En proceso", resuelto: "Resuelto" };
const CATEGORIA_LABEL = {
  "via-publica": "Vía pública",
  iluminacion: "Iluminación",
  basura: "Basura",
  "areas-verdes": "Áreas verdes",
  seguridad: "Seguridad",
  patrimonio: "Patrimonio",
  otro: "Otro"
};

function renderReportes() {
  const list = document.getElementById("reportes-list");
  const filtro = document.getElementById("admin-filtro-estado").value;
  const visibles = filtro === "todas" ? reportes : reportes.filter(r => r.estado === filtro);

  list.innerHTML = "";

  if (visibles.length === 0) {
    list.innerHTML = '<p class="admin-empty">No hay reportes para este filtro.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  visibles.forEach(r => {
    const item = document.createElement("article");
    item.className = "admin-item";

    const head = document.createElement("div");
    head.className = "admin-item-head";

    const info = document.createElement("div");
    const meta = document.createElement("div");
    meta.className = "admin-item-meta";
    const b = document.createElement("b");
    b.textContent = CATEGORIA_LABEL[r.categoria] || r.categoria;
    const fecha = document.createElement("span");
    fecha.textContent = formatearFecha(r.fecha);
    meta.appendChild(b);
    meta.appendChild(fecha);
    const titulo = document.createElement("h3");
    titulo.className = "admin-item-title";
    titulo.textContent = r.titulo;
    info.appendChild(titulo);
    info.appendChild(meta);

    const acciones = document.createElement("div");
    acciones.className = "admin-item-actions";

    const select = document.createElement("select");
    select.setAttribute("aria-label", "Cambiar estado");
    ["pendiente", "proceso", "resuelto"].forEach(e => {
      const op = document.createElement("option");
      op.value = e;
      op.textContent = ESTADO_LABEL[e];
      op.selected = r.estado === e;
      select.appendChild(op);
    });
    select.addEventListener("change", () => cambiarEstado(r.id, select.value, select));
    acciones.appendChild(select);

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn-small btn-delete";
    btnDel.textContent = "🗑 Eliminar";
    btnDel.addEventListener("click", () => confirmarEliminarReporte(r.id));
    acciones.appendChild(btnDel);

    head.appendChild(info);
    head.appendChild(acciones);

    const body = document.createElement("p");
    body.className = "admin-item-body";
    body.innerHTML = "📍 <b>" + escaparHTML(r.calle) + "</b> — " + escaparHTML(r.descripcion) +
      (r.reportante ? " <i>(reportado por " + escaparHTML(r.reportante) + ")</i>" : "");

    item.appendChild(head);
    item.appendChild(body);
    fragment.appendChild(item);
  });
  list.appendChild(fragment);
}

async function cargarReportes() {
  try {
    const r = await api(`${API}/admin/reportes`);
    reportes = r.datos;
    renderReportes();
  } catch (err) {
    mostrarToast("No se pudo cargar los reportes: " + err.message, "error");
  }
}

async function cambiarEstado(id, estado, select) {
  select.disabled = true;
  try {
    await api(`${API}/admin/reportes/${id}`, { method: "PATCH", body: JSON.stringify({ estado }) });
    mostrarToast("Estado actualizado a " + ESTADO_LABEL[estado].toLowerCase() + ".", "success");
    await cargarReportes();
    await cargarResumen();
  } catch (err) {
    mostrarToast("No se pudo actualizar: " + err.message, "error");
    renderReportes();
  }
}

function confirmarEliminarReporte(id) {
  const r = reportes.find(x => x.id === id);
  abrirModal(
    "¿Eliminar este reporte?",
    r ? `"${r.titulo}" se quitará del sitio permanentemente.` : "Esta acción no se puede deshacer.",
    async () => {
      try {
        await api(`${API}/admin/reportes/${id}`, { method: "DELETE" });
        mostrarToast("Reporte eliminado.", "info");
        await cargarReportes();
        await cargarResumen();
      } catch (err) {
        mostrarToast("No se pudo eliminar: " + err.message, "error");
      }
    }
  );
}

/* ---------- Modal genérico ---------- */
let accionModal = null;

function abrirModal(titulo, desc, accion) {
  document.getElementById("modal-title").textContent = titulo;
  document.getElementById("modal-desc").textContent = desc;
  accionModal = accion;
  document.getElementById("modal-overlay").hidden = false;
}

function cerrarModal() {
  accionModal = null;
  document.getElementById("modal-overlay").hidden = true;
}

async function confirmarModal() {
  const accion = accionModal;
  cerrarModal();
  if (accion) {
    const cancelBtn = document.getElementById("modal-confirm");
    cancelBtn.disabled = true;
    try {
      await accion();
    } finally {
      cancelBtn.disabled = false;
    }
  }
}

/* ---------- Inicialización ---------- */
function init() {
  cargarCredenciales();
  document.getElementById("login-form").addEventListener("submit", manejarLogin);
  document.getElementById("btn-logout").addEventListener("click", () => { cerrarSesion(false); mostrarToast("Sesión cerrada.", "info"); });

  document.querySelectorAll(".admin-tab").forEach(t =>
    t.addEventListener("click", () => activarTab(t.dataset.tab)));

  document.getElementById("btn-nueva").addEventListener("click", () => abrirFormularioNoticia(null));
  document.getElementById("noticia-form").addEventListener("submit", guardarNoticia);
  document.getElementById("btn-cancelar-n").addEventListener("click", cerrarFormularioNoticia);

  document.getElementById("admin-filtro-estado").addEventListener("change", renderReportes);

  document.getElementById("modal-cancel").addEventListener("click", cerrarModal);
  document.getElementById("modal-confirm").addEventListener("click", confirmarModal);
  document.getElementById("modal-overlay").addEventListener("click", e => {
    if (e.target.id === "modal-overlay") cerrarModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") cerrarModal();
  });

  if (token) {
    mostrarPanel();
  } else {
    mostrarLogin();
  }
}

document.addEventListener("DOMContentLoaded", init);