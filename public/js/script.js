"use strict";

/* ============================================================
   Mi Barrio Mejor — lógica del frontend (JS vanilla)
   Se comunica con el backend SQLite vía fetch (/api/...).

   Incluye:
   - API REST (noticias, reportes, captcha, stats)
   - Scrollytelling: motor de escenas que expone --sp por
     [data-scene], anima [data-slide] y las cadenas geométricas
     (data-chain) haciendo que los elementos roten, cambien de
     tamaño, se desplacen y se transformen unos en otros.
   - Contadores animados, filtros, búsqueda y orden
   - Captcha de verificación del formulario
   - Partículas del hero + estela del cursor (canvas vanilla)
   - Tilt 3D en tarjetas, ondas en botones, toasts
   - Gestión de reportes: marcar como resuelto y eliminar (con
     modal de confirmación)
   - Constelación de la iglesia / castillo azul / Casa Dorada en
     la sección "El barrio" (nodos + líneas con transición cíclica)
   ============================================================ */

const API = "/api";

const CATEGORIAS = {
  "via-publica": { label: "Vía pública", color: "#B5651D" },
  "iluminacion": { label: "Iluminación", color: "#D4A017" },
  "basura": { label: "Basura", color: "#C8102E" },
  "areas-verdes": { label: "Áreas verdes", color: "#4B7F52" },
  "seguridad": { label: "Seguridad", color: "#722F37" },
  "patrimonio": { label: "Patrimonio", color: "#4A7BB5" },
  "otro": { label: "Otro", color: "#8A8D8F" }
};

const PRIORIDADES = {
  baja: { label: "Prioridad baja", color: "#4B7F52" },
  media: { label: "Prioridad media", color: "#D4A017" },
  alta: { label: "Prioridad alta", color: "#C8102E" }
};

const TIPOS_NOTICIA = {
  noticia: { label: "Noticia", color: "#4A7BB5" },
  negocio: { label: "Negocio", color: "#C8862B" },
  historia: { label: "Historia", color: "#6B2D5C" }
};

const ESTADOS = ["pendiente", "proceso", "resuelto"];
const ESTADO_LABEL = { pendiente: "Pendiente", proceso: "En proceso", resuelto: "Resuelto" };

/* ---------------- Estado ---------------- */
let reportes = [];
let noticias = [];
let filtroCategoriaActivo = "todas";
let filtroEstadoActivo = "todas";
let filtroNoticiaActivo = "todas";
let terminoBusqueda = "";
let ordenActivo = "recientes";
let captchaActual = null;
let idPendienteDeEliminar = null;

/* ============================================================
   Capa de datos
   ============================================================ */
async function api(url, opciones = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opciones
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(cuerpo.error || `Error ${res.status}`);
  }
  return cuerpo;
}

const apiListarReportes = () => api(`${API}/reportes`).then(r => r.datos);
const apiCrearReporte = (datos) => api(`${API}/reportes`, { method: "POST", body: JSON.stringify(datos) });
const apiActualizarEstado = (id, estado) => api(`${API}/reportes/${id}`, { method: "PATCH", body: JSON.stringify({ estado }) });
const apiEliminarReporte = (id) => api(`${API}/reportes/${id}`, { method: "DELETE" });
const apiStats = () => api(`${API}/stats`).then(r => r.datos);
const apiListarNoticias = () => api(`${API}/noticias`).then(r => r.datos);
const apiObtenerCaptcha = () => api(`${API}/captcha`, { method: "POST" }).then(r => r.datos);

/* ============================================================
   Utilidades
   ============================================================ */
function formatearFecha(timestamp) {
  const fecha = new Date(timestamp);
  return fecha.toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" });
}

const reducirMovimiento = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t;

/* ---------- Notificaciones toast ---------- */
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

/* ============================================================
   Motor de scrollytelling
   ============================================================ */
function iniciarScenes() {
  const escenas = document.querySelectorAll("[data-scene]");
  const slides = new Map();
  const cadenas = new Map();

  const SLIDES = {
    eyebrow: (s) => `translate3d(0, ${(1 - Math.min(s / 0.4, 1)) * 30}px, 0)`,
    title: (s) => {
      const a = Math.min(s / 0.4, 1);
      const i = 1 - easeOut(a);
      return `translate3d(0, ${i * 80}px, 0) rotate(${i * 2.5}deg) scale(${1 + i * 0.1})`;
    },
    sub: (s) => `translate3d(0, ${(1 - Math.min(s / 0.4, 1)) * 46}px, 0)`,
    cta: (s) => `translate3d(${(1 - Math.min(s / 0.45, 1)) * -30}px, ${(1 - Math.min(s / 0.45, 1)) * 20}px, 0)`,
    cue: (s) => {
      const b = Math.max(0, (s - 0.55) / 0.3);
      return `translate3d(-50%, ${b * -42}px, 0)`;
    },
    reveal: (s) => {
      const a = Math.min(s / 0.4, 1);
      return `translate3d(0, ${(1 - easeOut(a)) * 48}px, 0)`;
    },
    stat: (s) => {
      const a = Math.min(s / 0.35, 1);
      return `translate3d(${(1 - a) * 30}px, ${(1 - a) * 20}px, 0) rotate(${(1 - a) * 4}deg)`;
    },
    form: (s) => {
      const a = Math.min(s / 0.45, 1);
      const i = 1 - easeOut(a);
      return `perspective(1200px) rotateY(${i * 18}deg) translate3d(${i * 70}px, 0, 0) scale(${1 - i * 0.05})`;
    },
    media: (s) => `translate3d(0, ${(0.5 - s) * 40}px, 0) rotate(${(0.5 - s) * 3}deg)`
  };

  const CHAINS = {
    casa: (s) => `translate3d(${s * 46}px, ${s * -34}px, 0) rotate(${s * 20}deg) scale(${0.92 + s * 0.1})`,
    archA: (s) => `translate3d(${s * -130}px, ${s * 26}px, 0) rotate(${s * -20}deg)`,
    archB: (s) => `translate3d(${s * 100}px, ${s * -40}px, 0) rotate(${s * 26}deg)`,
    barA: (s) => `translate3d(${s * -70}px, ${s * -46}px, 0) scaleX(${1 - s * 0.4}) rotate(${s * -10}deg)`,
    barB: (s) => `translate3d(${s * 80}px, ${s * 34}px, 0) rotate(${s * 12}deg)`,
    arco: (s) => `translate3d(${(0.5 - s) * 60}px, ${(0.5 - s) * 30}px, 0) rotate(${(0.5 - s) * 6}deg)`
  };

  document.querySelectorAll("[data-slide]").forEach(el => {
    slides.set(el, SLIDES[el.dataset.slide] || null);
  });
  document.querySelectorAll("[data-chain]").forEach(el => {
    cadenas.set(el, CHAINS[el.dataset.chain] || null);
  });

  if (escenas.length === 0) {
    document.querySelectorAll("[data-scene]").forEach(el => el.style.setProperty("--sp", "1"));
    slides.forEach((fn, el) => fn && (el.style.transform = fn(1)));
    return;
  }

  let rafPedido = null;
  const actualizar = () => {
    rafPedido = null;
    const vh = window.innerHeight;

    const doc = document.documentElement;
    const maxScroll = doc.scrollHeight - vh;
    const page = maxScroll > 0 ? clamp01(window.scrollY / maxScroll) : 0;
    document.documentElement.style.setProperty("--g", page.toFixed(4));

    escenas.forEach(escena => {
      const rect = escena.getBoundingClientRect();
      const sp = clamp01((vh - rect.top) / (vh + rect.height));
      escena.style.setProperty("--sp", sp.toFixed(4));

      escena.querySelectorAll("[data-slide]").forEach(el => {
        if (!slides.has(el)) return;
        const fn = slides.get(el);
        el.style.transform = fn ? fn(sp) : "";
        el.style.willChange = "transform";
      });

      escena.querySelectorAll("[data-chain]").forEach(el => {
        const fn = cadenas.get(el);
        if (fn) {
          el.style.transform = fn(sp);
          el.style.willChange = "transform";
        }
      });
    });
  };

  const pedirFrame = () => {
    if (!rafPedido) rafPedido = requestAnimationFrame(actualizar);
  };

  window.addEventListener("scroll", pedirFrame, { passive: true });
  window.addEventListener("resize", pedirFrame, { passive: true });
  actualizar();
}

/* ============================================================
   Render de noticias (bento)
   ============================================================ */
function crearTarjetaNoticia(noticia, resaltada) {
  const tipo = TIPOS_NOTICIA[noticia.tipo] || TIPOS_NOTICIA.noticia;

  const card = document.createElement("article");
  card.className = "bento-item bento-item--noticia" + (resaltada ? " bento-item--lg" : "");
  card.style.setProperty("--item-tint", tipo.color);
  if (noticia.tipo === "historia") card.classList.add("bento-item--historia");

  const topline = document.createElement("div");
  topline.className = "bento-item__topline";

  const badge = document.createElement("span");
  badge.className = "bento-item__type";
  badge.textContent = tipo.label;

  const fecha = document.createElement("span");
  fecha.className = "bento-item__date";
  fecha.textContent = formatearFecha(noticia.fecha);

  topline.appendChild(badge);
  topline.appendChild(fecha);

  const titulo = document.createElement("h3");
  titulo.textContent = noticia.titulo;

  const resumen = document.createElement("p");
  resumen.textContent = noticia.resumen || noticia.contenido;

  const autor = document.createElement("span");
  autor.className = "bento-item__autor";
  autor.textContent = "— " + (noticia.autor || "Junta Vecinal");

  card.appendChild(topline);
  card.appendChild(titulo);
  card.appendChild(resumen);
  card.appendChild(autor);

  return card;
}

function renderNoticias() {
  const grid = document.getElementById("noticias-bento");
  const empty = document.getElementById("noticias-empty");
  if (!grid) return;

  const filtradas = noticias.filter(n =>
    filtroNoticiaActivo === "todas" || n.tipo === filtroNoticiaActivo
  );

  grid.innerHTML = "";
  if (filtradas.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const fragment = document.createDocumentFragment();
  filtradas.forEach((noticia, i) => {
    const card = crearTarjetaNoticia(noticia, i === 0 && filtroNoticiaActivo === "todas");
    card.style.animation = `card-in 0.5s var(--ease-out) backwards`;
    card.style.animationDelay = `${Math.min(i * 70, 420)}ms`;
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}

/* ============================================================
   Render de reportes (bento)
   ============================================================ */
function crearTarjetaReporte(reporte) {
  const cat = CATEGORIAS[reporte.categoria] || CATEGORIAS.otro;
  const prio = PRIORIDADES[reporte.prioridad] || PRIORIDADES.media;

  const card = document.createElement("article");
  card.className = "bento-item bento-item--reporte";
  card.style.setProperty("--cat-color", cat.color);
  card.dataset.id = reporte.id;

  const meta = document.createElement("div");
  meta.className = "report-meta";

  const badgeCat = document.createElement("span");
  badgeCat.className = "report-cat-badge";
  badgeCat.textContent = cat.label;

  const badgePrio = document.createElement("span");
  badgePrio.className = "report-priority-badge";
  badgePrio.style.background = prio.color;
  badgePrio.textContent = prio.label;

  meta.appendChild(badgeCat);
  meta.appendChild(badgePrio);

  const titulo = document.createElement("h3");
  titulo.textContent = reporte.titulo;

  const loc = document.createElement("p");
  loc.className = "report-loc";
  loc.innerHTML = "📍 <b>" + escaparHTML(reporte.calle) + "</b>";

  const desc = document.createElement("p");
  desc.textContent = reporte.descripcion;

  const footer = document.createElement("div");
  footer.className = "report-footer";

  const estadoSpan = document.createElement("span");
  estadoSpan.className = "report-status";
  estadoSpan.dataset.status = reporte.estado;
  estadoSpan.textContent = ESTADO_LABEL[reporte.estado];

  const fecha = document.createElement("span");
  fecha.className = "report-date";
  fecha.textContent = formatearFecha(reporte.fecha);

  footer.appendChild(estadoSpan);
  footer.appendChild(fecha);

  const acciones = document.createElement("div");
  acciones.className = "report-actions";

  if (reporte.estado !== "resuelto") {
    const btnResolver = document.createElement("button");
    btnResolver.type = "button";
    btnResolver.className = "btn-small btn-resolve";
    btnResolver.textContent = "✓ Marcar como resuelto";
    btnResolver.addEventListener("click", () => marcarComoResuelto(reporte.id));
    acciones.appendChild(btnResolver);
  }

  const btnEliminar = document.createElement("button");
  btnEliminar.type = "button";
  btnEliminar.className = "btn-small btn-delete";
  btnEliminar.textContent = "🗑 Eliminar";
  btnEliminar.addEventListener("click", () => pedirConfirmacionEliminar(reporte.id));
  acciones.appendChild(btnEliminar);

  if (reporte.reportante) {
    const autor = document.createElement("span");
    autor.className = "bento-item__autor";
    autor.textContent = "— " + reporte.reportante;
    card.appendChild(autor);
  }

  card.appendChild(meta);
  card.appendChild(titulo);
  card.appendChild(loc);
  card.appendChild(desc);
  card.appendChild(footer);
  card.appendChild(acciones);

  return card;
}

/* ---------- Acciones sobre el estado ---------- */
async function marcarComoResuelto(id) {
  try {
    await apiActualizarEstado(id, "resuelto");
    reportes = await apiListarReportes();
    render();
    mostrarToast("Reporte marcado como resuelto. ¡Buena onda vecinal!", "success");
  } catch (err) {
    mostrarToast("No se pudo actualizar: " + err.message, "error");
  }
}

/* ---------- Eliminar (modal) ---------- */
function pedirConfirmacionEliminar(id) {
  idPendienteDeEliminar = id;
  document.getElementById("modal-overlay").hidden = false;
}

function cerrarModal() {
  idPendienteDeEliminar = null;
  document.getElementById("modal-overlay").hidden = true;
}

async function confirmarEliminar() {
  if (!idPendienteDeEliminar) return;
  const id = idPendienteDeEliminar;
  const card = document.querySelector(`.bento-item--reporte[data-id="${id}"]`);

  const quitar = async () => {
    try {
      await apiEliminarReporte(id);
      reportes = await apiListarReportes();
      render();
      mostrarToast("Reporte eliminado.", "info");
    } catch (err) {
      mostrarToast("No se pudo eliminar: " + err.message, "error");
    }
  };

  if (card && !reducirMovimiento()) {
    card.classList.add("is-removing");
    card.addEventListener("animationend", quitar, { once: true });
    setTimeout(quitar, 350);
  } else {
    quitar();
  }
  cerrarModal();
}

/* ---------- Filtro + búsqueda + orden ---------- */
function obtenerReportesVisibles() {
  const termino = terminoBusqueda.trim().toLowerCase();

  let visibles = reportes.filter(r => {
    const coincideCategoria = filtroCategoriaActivo === "todas" || r.categoria === filtroCategoriaActivo;
    const coincideEstado = filtroEstadoActivo === "todas" || r.estado === filtroEstadoActivo;
    const coincideBusqueda =
      termino === "" ||
      r.titulo.toLowerCase().includes(termino) ||
      r.calle.toLowerCase().includes(termino) ||
      r.descripcion.toLowerCase().includes(termino);
    return coincideCategoria && coincideEstado && coincideBusqueda;
  });

  const ordenPrioridad = { alta: 0, media: 1, baja: 2 };

  visibles = visibles.slice().sort((a, b) => {
    if (ordenActivo === "recientes") return b.fecha - a.fecha;
    if (ordenActivo === "antiguos") return a.fecha - b.fecha;
    if (ordenActivo === "estado") return ESTADOS.indexOf(a.estado) - ESTADOS.indexOf(b.estado);
    if (ordenActivo === "prioridad") return ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad];
    return 0;
  });

  return visibles;
}

/* ---------- Render principal ---------- */
function renderGaleria() {
  const grid = document.getElementById("report-grid");
  const emptyState = document.getElementById("empty-state");
  const visibles = obtenerReportesVisibles();

  grid.innerHTML = "";

  if (visibles.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  const fragment = document.createDocumentFragment();
  visibles.forEach((reporte, i) => {
    const card = crearTarjetaReporte(reporte);
    card.style.animation = `card-in 0.45s var(--ease-out) backwards`;
    card.style.animationDelay = `${Math.min(i * 45, 360)}ms`;
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}

function renderContadores() {
  const total = reportes.length;
  const pendientes = reportes.filter(r => r.estado === "pendiente").length;
  const proceso = reportes.filter(r => r.estado === "proceso").length;
  const resueltos = reportes.filter(r => r.estado === "resuelto").length;

  actualizarTarget("stat-total", total);
  actualizarTarget("stat-pendientes", pendientes);
  actualizarTarget("stat-proceso", proceso);
  actualizarTarget("stat-resueltos", resueltos);
}

function render() {
  renderGaleria();
  renderContadores();
}

/* ---------- Contadores animados ---------- */
function actualizarTarget(elementId, valorFinal) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.dataset.target = valorFinal;
  if (el.dataset.enViewport) {
    animarContador(elementId, valorFinal);
  }
}

function animarContador(elementId, valorFinal) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const valorActual = Number(el.textContent) || 0;
  const duracion = 600;
  const inicio = performance.now();

  function paso(ahora) {
    const progreso = Math.min((ahora - inicio) / duracion, 1);
    const valor = Math.round(valorActual + (valorFinal - valorActual) * easeOut(progreso));
    el.textContent = valor;
    if (progreso < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

function observarContadores() {
  const contadores = document.querySelectorAll("[data-counter]");
  if (!("IntersectionObserver" in window)) {
    contadores.forEach(el => {
      el.dataset.enViewport = "true";
      el.textContent = el.dataset.target || 0;
    });
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.dataset.enViewport = "true";
        animarContador(entry.target.id, Number(entry.target.dataset.target || 0));
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });
  contadores.forEach(el => observer.observe(el));
}

/* ============================================================
   Captcha
   ============================================================ */
async function cargarCaptcha() {
  const questionEl = document.getElementById("captcha-question");
  const respEl = document.getElementById("captcha-respuesta");
  const errorEl = document.querySelector('[data-error-for="captcha"]');
  try {
    const data = await apiObtenerCaptcha();
    captchaActual = data;
    if (questionEl) questionEl.textContent = data.pregunta;
    if (respEl) { respEl.value = ""; respEl.focus({ preventScroll: true }); }
    if (errorEl) errorEl.textContent = "";
  } catch (err) {
    if (questionEl) questionEl.textContent = "✕";
    if (errorEl) errorEl.textContent = "No se pudo cargar la verificación.";
  }
}

/* ============================================================
   Formulario
   ============================================================ */
function validarCampo(campo) {
  const errorEl = document.querySelector(`[data-error-for="${campo.id}"]`);
  if (!errorEl) return true;
  if (campo.hasAttribute("required") && !campo.value.trim()) {
    errorEl.textContent = "Este campo es obligatorio.";
    return false;
  }
  errorEl.textContent = "";
  return true;
}

async function manejarEnvioFormulario(evento) {
  evento.preventDefault();
  const form = evento.target;
  const status = document.getElementById("form-status");
  const btnSubmit = document.getElementById("btn-submit");

  const captchaResp = document.getElementById("captcha-respuesta");
  if (!captchaResp || !captchaResp.value.trim()) {
    document.querySelector('[data-error-for="captcha"]').textContent = "Resuelve la verificación para continuar.";
    return;
  }

  const campos = [form.titulo, form.categoria, form.prioridad, form.calle, form.descripcion];
  const esValido = campos.map(validarCampo).every(Boolean);

  if (!esValido) {
    status.textContent = "Revisa los campos marcados.";
    status.dataset.state = "error";
    return;
  }

  const nuevoReporte = {
    titulo: form.titulo.value.trim(),
    categoria: form.categoria.value,
    prioridad: form.prioridad.value,
    calle: form.calle.value.trim(),
    descripcion: form.descripcion.value.trim(),
    reportante: form.reportante.value.trim(),
    captchaToken: captchaActual ? captchaActual.token : "",
    captchaRespuesta: captchaResp.value.trim()
  };

  btnSubmit.classList.add("is-loading");
  btnSubmit.disabled = true;
  status.textContent = "";
  status.removeAttribute("data-state");

  try {
    await apiCrearReporte(nuevoReporte);
    reportes = await apiListarReportes();
    render();
    form.reset();
    actualizarContadorCaracteres();
    status.textContent = "¡Reporte enviado! Gracias por cuidar el barrio.";
    status.dataset.state = "success";
    mostrarToast("Reporte registrado en la base del barrio.", "success");
    setTimeout(() => {
      status.textContent = "";
      status.removeAttribute("data-state");
    }, 4000);
  } catch (err) {
    status.textContent = "No se pudo guardar el reporte: " + err.message;
    status.dataset.state = "error";
    mostrarToast("Error al guardar el reporte. Verifica el captcha.", "error");
  } finally {
    btnSubmit.classList.remove("is-loading");
    btnSubmit.disabled = false;
    cargarCaptcha();
  }
}

function actualizarContadorCaracteres() {
  const textarea = document.getElementById("descripcion");
  const contador = document.getElementById("char-counter");
  const max = Number(textarea.getAttribute("maxlength")) || 400;
  const actual = textarea.value.length;
  contador.textContent = `${actual} / ${max} caracteres`;
  contador.classList.toggle("is-near-limit", actual > max * 0.9);
}

/* ---------- Filtros de chips ---------- */
function manejarClicChipCategoria(evento) {
  document.querySelectorAll(".filter-chips:not(.filter-chips-estado):not(.noticias-tabs) .chip")
    .forEach(chip => chip.classList.remove("is-active"));
  evento.target.classList.add("is-active");
  filtroCategoriaActivo = evento.target.dataset.filter;
  renderGaleria();
}

function manejarClicChipEstado(evento) {
  document.querySelectorAll(".filter-chips-estado .chip")
    .forEach(chip => chip.classList.remove("is-active"));
  evento.target.classList.add("is-active");
  filtroEstadoActivo = evento.target.dataset.filterEstado;
  renderGaleria();
}

function manejarClicChipNoticia(evento) {
  document.querySelectorAll(".noticias-tabs .chip")
    .forEach(chip => chip.classList.remove("is-active"));
  evento.target.classList.add("is-active");
  filtroNoticiaActivo = evento.target.dataset.noticiaTipo;
  renderNoticias();
}

/* ============================================================
   Tema claro / oscuro
   ============================================================ */
function aplicarTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  document.getElementById("theme-icon").textContent = tema === "dark" ? "☀️" : "🌙";
  try {
    localStorage.setItem("mibarrio_tema", tema);
  } catch (err) { /* ignorar */ }
}

function iniciarTema() {
  let temaGuardado = null;
  try { temaGuardado = localStorage.getItem("mibarrio_tema"); } catch (err) { /* ignorar */ }

  if (temaGuardado === "dark" || temaGuardado === "light") {
    aplicarTema(temaGuardado);
  } else {
    const prefiereOscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
    aplicarTema(prefiereOscuro ? "dark" : "light");
  }

  document.getElementById("theme-toggle").addEventListener("click", () => {
    const actual = document.documentElement.getAttribute("data-theme");
    aplicarTema(actual === "dark" ? "light" : "dark");
  });
}

/* ============================================================
   Partículas del hero (canvas vanilla, sin dependencias externas)
   ============================================================ */
function iniciarParticulas() {
  const contenedor = document.getElementById("tsparticles");
  if (!contenedor) return;

  const canvas = document.createElement("canvas");
  canvas.className = "hero-particles-canvas";
  contenedor.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const COLORS = ["#F2D88B", "#D4A017", "#C8862B", "#7FB2D9", "#A88BC4", "#C9A8DC"];
  let W = 0, H = 0, dpr = 1;
  let particulas = [];
  let cursor = { x: -9e9, y: -9e9 };
  let ultimoResize = 0;

  function dimensionar() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = contenedor.getBoundingClientRect();
    W = Math.max(rect.width, 1);
    H = Math.max(rect.height, 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    crearParticulas();
  }

  function crearParticulas() {
    const objetivo = Math.max(28, Math.min(80, Math.floor((W * H) / 15000)));
    particulas = Array.from({ length: objetivo }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 2.2 + 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      fase: Math.random() * Math.PI * 2,
      pulso: 0.014 + Math.random() * 0.02
    }));
  }

  window.addEventListener("pointermove", e => {
    if (e.target.closest && e.target.closest("#tsparticles, .hero")) {
      const rect = contenedor.getBoundingClientRect();
      cursor.x = e.clientX - rect.left;
      cursor.y = e.clientY - rect.top;
    }
  }, { passive: true });
  window.addEventListener("pointerleave", () => { cursor.x = -9e9; cursor.y = -9e9; }, { passive: true });

  window.addEventListener("resize", () => {
    const ahora = performance.now();
    if (ahora - ultimoResize < 120) return;
    ultimoResize = ahora;
    dimensionar();
  });

  function paso(t) {
    ctx.clearRect(0, 0, W, H);

    if (cursor.x > -1000) {
      for (let i = 0; i < particulas.length; i++) {
        const p = particulas[i];
        const dx = p.x - cursor.x;
        const dy = p.y - cursor.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 19600) {
          const d = Math.sqrt(d2) || 1;
          const fuerza = (140 - d) / 140;
          p.vx += (dx / d) * fuerza * 0.14;
          p.vy += (dy / d) * fuerza * 0.14;
        }
      }
    }

    for (let i = 0; i < particulas.length; i++) {
      const p = particulas[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -12) p.x = W + 12;
      else if (p.x > W + 12) p.x = -12;
      if (p.y < -12) p.y = H + 12;
      else if (p.y > H + 12) p.y = -12;

      p.vx *= 0.985;
      p.vy *= 0.985;

      const brillo = 0.35 + Math.abs(Math.sin(p.fase + t * p.pulso)) * 0.5;
      ctx.globalAlpha = Math.min(brillo, 0.95);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const limite = 120;
    for (let i = 0; i < particulas.length; i++) {
      const a = particulas[i];
      for (let j = i + 1; j < particulas.length; j++) {
        const b = particulas[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < limite * limite) {
          const d = Math.sqrt(d2);
          ctx.globalAlpha = (1 - d / limite) * 0.16;
          ctx.strokeStyle = a.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    if (cursor.x > -1000) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#F2D88B";
      for (let i = 0; i < particulas.length; i++) {
        const p = particulas[i];
        const dx = p.x - cursor.x;
        const dy = p.y - cursor.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 16000) {
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(cursor.x, cursor.y);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(paso);
  }

  dimensionar();
  requestAnimationFrame(paso);
}

/* ============================================================
   Estela de partículas bajo el cursor (canvas global)
   ============================================================ */
const TRAIL_COLORS = ["#D4A017", "#C8862B", "#4A7BB5", "#C9A8DC", "#B5651D"];

function iniciarEstelaCursor() {
  const canvas = document.getElementById("cursor-trail");
  const ctx = canvas.getContext("2d");
  let particulas = [];
  let ultimoDisparo = 0;

  function redimensionar() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  redimensionar();
  window.addEventListener("resize", redimensionar);

  const PALETA = TRAIL_COLORS;
  const MAX = 120;

  function sembrar(e) {
    const ahora = performance.now();
    if (ahora - ultimoDisparo < 40) return;
    ultimoDisparo = ahora;

    for (let i = 0; i < 2; i++) {
      particulas.push({
        x: e.clientX + (Math.random() * 10 - 5),
        y: e.clientY + (Math.random() * 10 - 5),
        vx: Math.random() * 1 - 0.5,
        vy: Math.random() * -1.4 - 0.2,
        tam: Math.random() * 3 + 1,
        vida: 1,
        decaida: 0.022 + Math.random() * 0.02,
        color: PALETA[Math.floor(Math.random() * PALETA.length)]
      });
    }
    if (particulas.length > MAX) {
      particulas = particulas.slice(particulas.length - MAX);
    }
  }

  window.addEventListener("pointermove", sembrar, { passive: true });

  function dibujar() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particulas.length - 1; i >= 0; i--) {
      const p = particulas[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.02;
      p.vida -= p.decaida;

      if (p.vida <= 0) {
        particulas.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = Math.max(p.vida, 0) * 0.7;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.tam, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(dibujar);
  }
  requestAnimationFrame(dibujar);
}

/* ============================================================
   Scroll: estados, scrollspy, volver arriba
   ============================================================ */
function iniciarScrollEstados() {
  const header = document.getElementById("site-header");
  const toTop = document.getElementById("to-top");
  const progress = document.getElementById("scroll-progress");
  let pidiendo = false;

  window.addEventListener("scroll", () => {
    if (pidiendo) return;
    pidiendo = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      header.classList.toggle("is-scrolled", y > 12);

      const altoDoc = document.documentElement.scrollHeight - window.innerHeight;
      const pct = altoDoc > 0 ? Math.min((y / altoDoc) * 100, 100) : 0;
      progress.style.width = pct + "%";

      if (y > 560) {
        toTop.hidden = false;
        requestAnimationFrame(() => toTop.classList.add("is-visible"));
      } else {
        toTop.classList.remove("is-visible");
        setTimeout(() => { if (!toTop.classList.contains("is-visible")) toTop.hidden = true; }, 320);
      }
      pidiendo = false;
    });
  }, { passive: true });

  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reducirMovimiento() ? "auto" : "smooth" });
  });
}

function iniciarScrollspy() {
  const enlaces = document.querySelectorAll(".nav-link[data-spy]");
  const secciones = [...enlaces].map(enlace =>
    document.getElementById(enlace.dataset.spy)
  ).filter(Boolean);

  if (!secciones.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        enlaces.forEach(enlace => {
          enlace.classList.toggle("is-active", enlace.dataset.spy === id);
        });
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px", threshold: 0 });

  secciones.forEach(seccion => observer.observe(seccion));
}

/* ============================================================
   Tilt 3D en tarjetas
   ============================================================ */
function iniciarTilt() {
  const grid = document.getElementById("report-grid");
  if (!grid) return;

  grid.addEventListener("pointermove", e => {
    const card = e.target.closest(".bento-item--reporte");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty("--ry", (px * 6).toFixed(2) + "deg");
    card.style.setProperty("--rx", (-py * 6).toFixed(2) + "deg");
  });

  grid.addEventListener("pointerleave", e => {
    if (e.target.classList && e.target.classList.contains("bento-item--reporte")) {
      e.target.style.setProperty("--rx", "0deg");
      e.target.style.setProperty("--ry", "0deg");
    }
  });
}

/* ============================================================
   Onda (ripple) en botones y chips
   ============================================================ */
function iniciarRipple() {
  document.addEventListener("pointerdown", e => {
    const boton = e.target.closest(".btn, .chip, .theme-toggle, .captcha-refresh");
    if (!boton) return;

    const rect = boton.getBoundingClientRect();
    const tam = Math.max(rect.width, rect.height);
    const onda = document.createElement("span");
    onda.className = "ripple";
    onda.style.width = onda.style.height = tam + "px";
    onda.style.left = (e.clientX - rect.left - tam / 2) + "px";
    onda.style.top = (e.clientY - rect.top - tam / 2) + "px";
    boton.appendChild(onda);
    onda.addEventListener("animationend", () => onda.remove(), { once: true });
  });
}

/* ============================================================
   Constelación de la iglesia / Castillo Azul / Casa Dorada
   (sección "El barrio")
   Silueta calcada de la imagen de referencia con nodos + líneas
   fijas, fondo tipo espacio, etiquetas de texto debajo, y brillo
   interactivo con el cursor.
   ============================================================ */

function iniciarConstelacion() {
  const canvas = document.getElementById("constelacion");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let ancho = 0, alto = 0;
  let escala = 1, despx = 0, despy = 0;
  let fondoEstrellas = [];

  const puntero = { x: -9999, y: -9999 };
  const COLOR = { blanco: "#EAF6FF", celeste: "#9BD4FF", dorado: "#EFC97A" };

  function pointsAlongPolyline(waypoints, spacing) {
    const pts = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [x1, y1] = waypoints[i];
      const [x2, y2] = waypoints[i + 1];
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(1, Math.round(dist / spacing));
      for (let s = (i > 0 ? 1 : 0); s <= steps; s++) {
        const t = s / steps;
        pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      }
    }
    return pts;
  }

  /* ---------- Silueta 1: Templo / Colegio ---------- */
  function siluetaIglesia() {
    const SPACING = 9;
    const chains = [];
    const addChain = (waypoints, cerrado = false) => {
      const wp = cerrado ? [...waypoints, waypoints[0]] : waypoints;
      chains.push(pointsAlongPolyline(wp, SPACING));
    };

    addChain([[17.36, 5.88], [29.6, 3.59], [36.13, 10.12], [35.48, 10.99], [29.6, 4.79], [18.5, 7.07], [18.18, 16.38], [16.87, 16.71], [17.85, 18.34], [29.28, 16.87], [35.15, 21.11], [35.97, 19.81], [35.32, 18.99], [29.44, 14.91], [29.77, 5.12]]);
    addChain([[21.93, 14.26], [22.09, 12.62], [22.09, 9.36], [23.4, 8.05], [24.38, 8.05], [25.19, 9.03], [25.03, 11.16], [24.87, 13.93], [21.93, 14.26]]);
    addChain([[32.21, 15.4], [33.52, 16.54], [33.52, 13.6], [33.36, 11.81], [33.03, 10.34], [32.21, 10.18], [32.21, 11.48], [32.05, 15.24], [33.52, 16.38]]);
    addChain([[18.01, 16.38], [29.6, 14.91]]);
    addChain([[35.15, 10.83], [35.32, 18.5]]);
    addChain([[18.01, 18.34], [17.52, 31.56], [18.83, 31.56], [21.11, 29.11], [23.07, 28.3], [24.87, 29.11], [27.64, 29.93], [27.48, 31.07], [31.07, 31.72], [32.87, 30.58], [34.01, 30.26], [35.48, 31.89], [35.81, 32.87], [35.81, 49.03], [27.48, 49.19], [27.64, 45.44], [27.32, 39.07], [26.66, 36.46], [23.73, 34.99], [20.79, 36.46], [19.48, 39.4], [19.64, 49.19], [15.4, 49.36], [16.05, 32.87], [15.24, 32.21], [17.52, 31.89]]);
    addChain([[21.44, 49.19], [21.44, 39.07], [22.42, 36.62], [25.36, 35.64]]);
    addChain([[19.48, 39.4], [21.28, 39.23]]);
    addChain([[19.81, 49.03], [21.6, 49.03]]);
    addChain([[35.48, 48.7], [31.72, 45.11], [30.91, 31.72]]);
    addChain([[31.89, 44.95], [27.81, 45.27]]);
    addChain([[15.56, 48.54], [18.66, 45.93]]);
    addChain([[19.15, 49.19], [18.99, 45.93]]);
    addChain([[15.89, 45.6], [19.15, 45.6]]);
    addChain([[29.28, 16.87], [29.44, 30.58]]);
    addChain([[35.32, 21.28], [35.32, 30.75]]);
    addChain([[21.93, 25.68], [24.71, 25.52], [25.03, 19.81], [23.56, 18.83], [21.77, 20.13], [21.93, 25.36]]);
    addChain([[32.21, 26.01], [33.68, 26.99], [33.85, 22.42], [33.36, 20.95], [32.38, 21.11], [32.38, 25.68]]);
    addChain([[35.15, 23.73], [43.81, 26.99], [56.05, 36.3], [56.38, 39.23], [43.81, 39.56], [64.21, 39.23], [64.54, 49.52], [35.97, 49.36], [35.48, 39.56], [43.64, 39.72], [43.97, 27.15]]);
    addChain([[64.7, 38.74], [64.54, 34.5], [66.82, 32.38], [83.47, 32.05], [84.13, 34.01], [84.45, 49.36], [64.7, 49.36], [64.54, 38.91], [64.37, 23.4], [62.58, 21.93], [66.33, 21.44], [66.5, 23.07], [64.86, 23.56]]);
    addChain([[66.17, 18.18], [66.82, 32.54], [66.66, 18.5], [83.15, 16.87], [83.47, 32.21]]);
    addChain([[66.17, 21.44], [64.54, 17.2], [83.96, 14.75], [84.45, 29.77]]);
    addChain([[64.54, 34.34], [84.13, 34.17]]);
    addChain([[68.46, 48.87], [68.13, 39.72]]);
    addChain([[68.46, 39.56], [70.74, 38.25], [74.66, 37.77], [79.56, 38.42], [82.66, 39.4], [82.82, 49.19], [79.88, 49.52], [79.88, 38.42]]);
    addChain([[70.41, 38.42], [71.07, 49.36]]);
    addChain([[72.37, 23.89], [72.05, 29.77], [77.11, 29.6], [76.46, 23.73], [72.7, 23.73]]);

    return chains;
  }

  /* ---------- Silueta 2: Castillo Azul ---------- */
  function siluetaCastillo() {
    const SPACING = 4;
    const chains = [];
    const addChain = (waypoints, cerrado = false) => {
      const wp = cerrado ? [...waypoints, waypoints[0]] : waypoints;
      chains.push(pointsAlongPolyline(wp, SPACING));
    };

    addChain([[12.52, 40.34], [11.96, 47.61], [10.95, 53.98], [10.73, 56.66], [14.97, 56.99], [18.89, 57.33], [19.33, 54.42], [20.34, 47.38], [20.56, 39.9], [16.65, 39.23], [12.85, 40.34]]);
    addChain([[19, 57.44], [24.47, 56.99], [26.37, 57.11], [32.18, 57.11], [33.86, 56.88], [34.76, 56.99], [42.35, 57.11], [42.35, 55.09], [42.47, 51.52], [42.69, 49.06], [43.03, 40.57], [34.76, 40.68], [33.75, 57.11], [32.41, 57.11], [33.08, 40.9], [27.6, 40.9], [26.37, 56.88], [24.59, 56.88], [25.82, 41.01], [20.56, 39.9]]);
    addChain([[42.38, 56.98], [42.17, 60.17], [43.87, 59.96], [48.34, 59.96], [50.47, 60.17], [51.53, 59.74], [56, 59.96], [57.7, 59.96], [57.7, 56.98], [57.92, 54.85], [57.7, 51.02], [57.49, 48.68], [57.7, 40.38], [58.77, 40.38], [67.49, 40.17], [68.98, 40.17], [76, 40.17], [77.28, 39.74], [78.55, 39.53], [80.47, 39.53], [84.51, 39.32], [87.28, 40.17], [87.92, 47.4], [89.19, 56.98], [85.36, 56.77], [84.09, 56.77], [81.53, 56.98], [80.04, 56.77], [78.13, 56.77], [76.64, 56.98], [70.04, 56.77], [67.92, 56.98], [57.92, 56.55]]);
    addChain([[27.06, 46.43], [28.55, 44.51], [29.83, 43.45], [30.89, 44.72], [32.6, 47.49]]);
    addChain([[34.51, 48.55], [35.79, 44.94], [36.85, 42.6], [38.77, 41.74], [40.47, 42.6], [41.53, 44.3], [42.6, 48.77]]);
    addChain([[67.49, 40.17], [68.13, 56.98], [69.83, 56.55], [69.19, 40.17], [76, 40.17], [76.85, 56.55], [78.34, 56.77], [77.28, 39.74], [78.55, 39.74], [80.04, 56.98], [81.75, 57.19], [80.26, 39.74], [84.09, 39.32], [86, 56.77], [84.09, 56.55], [82.38, 39.32]]);
    addChain([[57.7, 48.68], [59.41, 45.06], [60.89, 42.94], [63.02, 41.23], [64.94, 42.3], [66.21, 44], [67.28, 46.13]]);
    addChain([[69.41, 44.98], [70.47, 43.7], [71.75, 42.64], [73.45, 43.06], [75.15, 45.19], [76, 46.26]]);
    addChain([[84.94, 46.81], [85.58, 45.74], [86.21, 45.11], [87.28, 46.17], [87.92, 47.23]]);
    addChain([[43.02, 51.23], [44.09, 51.23], [48.77, 48.68], [49.83, 48.68], [51.75, 48.68], [55.79, 51.23], [57.49, 50.81], [57.7, 54.64], [56, 55.06], [51.53, 55.06], [51.53, 51.23], [51.75, 48.89], [49.83, 48.68], [50.04, 51.23], [50.04, 54.85], [50.26, 59.96], [51.53, 59.53], [51.96, 55.06], [56, 54.85], [56, 59.96], [55.58, 39.32], [57.7, 39.11], [57.7, 40.17]]);
    addChain([[48.77, 59.74], [48.77, 54.85], [48.77, 51.45], [48.77, 48.68], [44.3, 51.02], [44.09, 54.85], [44.09, 59.96], [42.17, 59.96], [42.17, 55.06], [48.55, 54.85], [48.77, 51.45], [42.38, 51.23], [43.02, 39.32], [44.51, 39.11], [44.94, 40.17], [44.09, 59.96]]);
    addChain([[10.47, 38.64], [12.81, 37.79], [15.57, 36.72], [25.79, 38.43], [32.81, 38.43], [43.02, 38.43], [42.6, 36.72], [43.45, 36.51], [47.28, 36.72], [53.23, 36.3], [58.13, 36.3], [58.34, 37.79], [68.98, 37.79], [69.83, 37.36], [74.94, 37.15], [74.72, 37.79], [76, 37.57], [80.26, 37.15], [82.6, 36.94], [84.51, 36.94], [86.43, 36.94], [88.98, 38], [87.49, 39.28], [87.28, 40.34], [58.55, 40.34], [58.13, 37.79], [43.02, 38.21]]);
    addChain([[10.47, 38.34], [12.17, 39.62], [12.38, 40.47]]);
    addChain([[16.64, 39.36], [14.94, 56.81]]);
    addChain([[13.45, 40.21], [12.38, 53.83]]);
    addChain([[14.94, 39.57], [13.66, 53.62]]);
    addChain([[11.11, 53.83], [12.38, 53.62], [13.87, 53.62], [15.15, 53.4], [19.62, 53.83]]);
    addChain([[11.96, 47.45], [12.6, 45.96], [12.6, 47.02]]);
    addChain([[13.87, 46.81], [15.36, 45.11], [15.79, 46.81]]);
    addChain([[18.13, 39.57], [16.85, 46.81], [16, 57.02]]);
    addChain([[23.87, 40.64], [22.6, 56.81]]);
    addChain([[22.17, 40.21], [20.68, 57.02]]);
    addChain([[10.26, 38.55], [10.89, 35.15], [16.43, 32.81], [15.57, 36.64], [21.53, 37.28], [21.53, 34.09], [16.43, 32.81]]);
    addChain([[27.28, 38.47], [27.49, 35.06], [32.38, 35.06], [32.17, 37.83], [33.23, 38.04], [33.45, 35.28], [32.38, 34.85]]);
    addChain([[43.66, 33.23], [43.45, 36.43], [58.13, 36.21], [58.13, 33.02], [43.45, 33.02]]);
    addChain([[69.62, 37.06], [69.62, 34.09], [74.51, 34.3], [74.94, 37.06], [69.83, 37.06], [68.98, 37.28], [68.77, 35.15], [69.62, 34.09]]);
    addChain([[86.64, 36.64], [85.58, 33.45], [88.77, 34.72], [89.19, 37.49], [86.43, 36.64], [84.51, 37.06], [84.09, 34.3], [85.36, 33.45]]);
    addChain([[12.38, 37.79], [13.87, 28.64], [14.51, 21.4], [18.34, 18.85], [25.36, 20.77], [27.28, 21.62], [28.34, 21.19], [33.87, 21.19], [35.36, 21.19], [43.45, 20.98], [50.89, 20.98], [58.34, 20.77], [67.06, 20.55], [68.13, 20.77], [73.66, 20.34], [74.51, 20.55], [76.64, 19.91], [78.34, 19.49], [81.96, 19.49], [83.87, 19.91], [85.36, 21.19], [85.79, 28.21], [86.64, 36.72]]);
    addChain([[88.34, 34.94], [86.43, 35.79]]);
    addChain([[18.34, 18.64], [16.43, 36.72]]);
    addChain([[27.28, 21.74], [25.57, 38.34]]);
    addChain([[34.3, 21.19], [33.23, 37.15]]);
    addChain([[35.57, 21.15], [34.72, 38.38]]);
    addChain([[43.23, 20.94], [43.23, 37.96]]);
    addChain([[51.11, 21.11], [50.89, 27.06], [52.17, 24.09], [53.45, 22.6], [54.51, 21.74], [57.06, 23.45], [57.92, 24.72], [58.77, 27.28], [58.34, 21.11], [66.85, 20.68], [67.06, 27.06], [66, 24.72], [64.51, 22.81], [62.6, 21.74], [60.68, 23.23], [59.41, 24.51], [59.19, 26.85], [67.06, 26.85], [67.06, 27.49], [67.7, 37.7]]);
    addChain([[13.66, 28], [14.94, 25.23], [15.36, 27.36], [17.06, 23.96], [17.7, 26.51], [20.47, 23.53], [21.96, 27.15], [18.34, 26.51], [15.36, 27.36], [13.66, 27.79], [15.15, 27.36], [15.36, 27.57], [14.09, 37.36]]);
    addChain([[21.96, 27.06], [20.68, 37.06]]);
    addChain([[28.13, 28.43], [31.11, 24.17], [33.45, 28.21], [28.34, 28.64], [28.13, 37.36], [31.75, 37.57], [33.23, 28.43], [31.32, 24.6], [31.11, 34.17]]);
    addChain([[35.36, 27.36], [36.43, 24.38], [38.34, 23.11], [39.4, 22.04], [41.11, 23.11], [42.6, 25.23], [43.45, 27.36], [44.3, 24.38], [46.21, 22.68], [47.06, 22.04], [49.19, 23.11], [50.89, 26.51], [50.89, 27.36], [43.45, 27.36], [35.57, 27.57], [58.77, 27.36]]);
    addChain([[36.43, 27.32], [37.92, 25.62], [39.62, 25.19], [40.68, 25.19], [42.17, 27.11]]);
    addChain([[44.3, 27.11], [45.79, 25.4], [48.55, 25.19], [50.04, 27.32]]);
    addChain([[52.38, 27.06], [53.66, 25.36], [55.79, 24.94], [57.49, 27.06]]);
    addChain([[60.26, 26.85], [61.53, 25.15], [63.66, 24.94], [65.58, 26.64]]);
    addChain([[38.34, 25.15], [38.77, 23.87], [39.62, 23.45], [40.47, 24.09], [40.47, 24.94]]);
    addChain([[46.21, 25.36], [46.64, 23.66], [47.28, 23.45], [48.13, 24.09], [48.13, 24.72]]);
    addChain([[53.87, 24.89], [54.94, 23.19], [55.58, 23.62], [56, 24.89]]);
    addChain([[61.75, 24.68], [61.75, 23.62], [62.6, 22.98], [63.45, 23.4], [63.66, 24.68]]);
    addChain([[36.43, 27.74], [36, 35.62], [34.94, 35.83]]);
    addChain([[37.28, 27.66], [36.85, 37.87]]);
    addChain([[38.13, 27.4], [38.13, 38.3]]);
    addChain([[39.19, 27.66], [38.98, 37.87]]);
    addChain([[40.47, 27.32], [39.83, 38.17]]);
    addChain([[41.53, 27.53], [41.11, 38.38]]);
    addChain([[45.79, 25.57], [47.06, 27.06], [47.06, 25.36], [48.34, 25.15], [47.28, 27.06], [49.4, 26.43], [50.04, 27.28], [44.51, 27.28], [44.72, 26.43], [47.06, 27.06]]);
    addChain([[47.06, 27.87], [47.06, 36.38], [49.4, 36.38], [49.83, 28.09], [44.72, 28.09], [44.51, 36.38], [49.19, 36.38], [52.6, 36.38], [52.17, 28.09], [54.94, 27.66], [55.15, 36.38], [57.7, 36.38], [57.49, 28.09], [54.72, 27.87]]);
    addChain([[53.02, 26.43], [54.72, 27.28], [53.66, 25.36], [55.15, 24.94], [54.72, 27.06], [56, 25.79], [57.06, 26.64], [54.94, 27.28]]);
    addChain([[45.15, 42], [46.64, 41.15], [48.34, 42.21], [49.83, 44.13], [50.68, 46.89], [51.75, 44.34], [53.23, 42.43], [54.94, 41.15], [55.58, 41.57]]);
    addChain([[45.36, 40.04], [55.58, 39.62], [50.89, 39.83], [50.68, 46.64]]);
    addChain([[50.47, 28.17], [51.75, 28.17], [51.75, 35.4], [50.26, 35.4], [50.26, 28.38]]);
    addChain([[59.19, 27.53], [58.77, 37.74]]);
    addChain([[60.68, 27.45], [61.11, 37.23], [61.96, 37.66], [61.96, 27.66], [62.6, 27.45], [63.23, 37.45], [64.3, 37.66], [64.09, 27.66], [65.15, 27.23], [65.58, 37.45]]);
    addChain([[61.32, 25.15], [62.6, 26.85], [63.02, 24.94], [64.09, 24.72], [63.02, 26.64]]);
    addChain([[68.98, 34.64], [68.55, 28.04], [74.3, 27.83], [74.3, 34]]);
    addChain([[68.77, 25.74], [70.47, 24.04], [71.53, 23.62], [73.66, 25.74], [73.66, 20.43], [68.13, 20.85], [68.77, 25.74]]);
    addChain([[69.62, 34.09], [69.19, 28.13], [69.41, 26.85], [70.47, 26.21], [71.75, 26.21], [72.81, 26.85], [73.24, 27.91], [73.66, 34.3], [69.83, 34.3], [71.75, 34.3], [71.32, 27.91], [72.81, 26.85], [71.75, 26.21], [71.32, 27.91], [70.26, 26.43], [69.41, 26.85], [71.11, 27.7], [70.47, 26], [70.47, 24.94], [71.53, 24.51], [71.96, 25.57]]);
    addChain([[75.58, 20.3], [76.64, 37.53], [78.13, 37.32], [76.85, 19.87], [78.77, 19.66], [80.04, 36.89], [81.53, 37.11], [79.62, 19.66], [80.68, 19.66], [83.02, 36.89], [84.51, 37.11], [83.45, 20.09]]);
    addChain([[83.87, 26.81], [84.3, 25.53], [84.72, 25.11], [84.94, 24.04], [85.36, 23.62]]);
    addChain([[14.3, 21.45], [13.02, 19.96], [14.94, 18.89], [18.98, 15.91], [27.06, 18.89], [34.94, 19.11], [55.36, 18.68], [67.06, 18.47], [74.3, 18.04], [78.13, 17.4], [82.6, 17.19], [84.94, 17.62], [86.21, 19.32], [85.58, 21.23]]);
    addChain([[14.51, 18.89], [14.72, 16.55], [19.19, 13.15], [27.7, 16.13], [34.72, 15.91], [43.45, 15.49], [59.62, 15.06], [67.92, 15.49], [74.72, 15.28], [77.92, 14.64], [81.53, 14.21], [84.72, 15.49], [84.94, 17.4]]);
    addChain([[27.92, 16.3], [27.7, 18.64]]);
    addChain([[20.68, 5.66], [18.98, 15.87], [19.4, 13.11]]);
    addChain([[84.3, 14.89], [83.87, 11.28], [83.87, 8.94], [83.24, 7.66], [80.68, 4.47], [77.28, 3.4], [74.51, 4.68], [72.38, 8.94], [71.32, 11.49], [69.62, 9.15], [69.19, 11.28], [67.49, 9.57], [67.7, 12.77], [67.7, 15.11], [73.66, 15.32], [73.24, 13.83], [73.87, 11.49], [75.58, 8.51], [77.49, 10.43], [79.41, 7.87], [81.32, 10.64], [82.81, 8.09], [83.66, 11.28], [81.53, 10.77], [77.49, 10.55], [73.66, 11.62], [74.51, 15.23], [77.92, 14.6], [77.49, 10.98], [81.32, 10.77], [81.53, 14.17]]);
    addChain([[14.72, 15.74], [15.36, 12.77], [15.79, 9.57], [20.89, 5.74], [23.23, 2.98], [29.4, 9.36], [31.11, 12.13], [31.96, 14.26], [33.45, 11.91], [34.72, 14.04], [34.51, 15.96], [31.96, 15.96], [32.17, 14.47], [30.26, 14.26], [31.32, 12.34], [29.19, 9.36], [28.77, 12.34], [27.92, 15.96], [24.3, 14.89], [24.72, 11.06], [27.06, 9.36], [28.77, 12.34], [29.19, 9.36], [21.11, 5.96], [15.79, 9.36], [23.23, 2.77], [21.11, 5.53], [19.4, 13.19], [20.04, 9.36], [18.98, 8.09], [17.7, 10.85], [16.64, 9.79], [15.57, 11.91], [17.7, 10.85], [20.04, 9.36], [22.81, 7.66], [24.51, 10.85], [20.68, 9.36], [17.49, 10.85], [17.06, 14.04]]);
    addChain([[25.36, 20.77], [23.87, 37.79]]);
    addChain([[24.94, 10.94], [28.55, 12.21]]);
    addChain([[69.83, 12.04], [69.41, 12.47], [69.41, 13.32], [70.04, 13.74], [71.11, 13.32], [71.11, 12.47], [70.04, 11.83]]);
    addChain([[72.38, 8.77], [74.09, 7.7], [76, 6.85], [80.26, 6.64], [83.24, 7.49], [80.04, 6.64], [78.77, 3.66], [77.49, 3.66], [76.43, 6.64], [77.49, 10.04], [74.3, 11.32], [73.87, 7.91], [72.6, 8.77], [73.24, 13.66]]);
    addChain([[76.64, 0], [77.28, 3.19]]);
    addChain([[23.66, 0.38], [23.23, 2.94]]);

    return chains;
  }

  /* ---------- Silueta 3: Casa Dorada ---------- */
  function siluetaCasaDorada() {
    const SPACING = 4; // ajustá densidad de nodos acá
    const chains = [];
    const addChain = (waypoints, cerrado = false) => {
      const wp = cerrado ? [...waypoints, waypoints[0]] : waypoints;
      chains.push(pointsAlongPolyline(wp, SPACING));
    };

    addChain([[11.67, 41.88], [11.52, 51.13], [12.42, 50.99], [12.27, 45.61], [12.42, 44.27], [13.02, 43.52], [13.46, 44.42], [13.61, 51.13], [15.4, 51.28], [15.7, 45.13], [15.7, 43.34], [16.45, 42.45], [17.49, 42.75], [18.24, 44.84], [17.94, 46.18], [17.94, 51.85], [19.88, 52], [19.73, 46.18], [19.73, 44.99], [20.03, 42.9], [20.93, 41.85], [22.27, 42.75], [22.72, 44.54], [22.72, 46.18], [22.57, 52.3], [24.81, 52.6], [24.96, 46.18], [24.81, 44.99], [25.1, 43.05], [26.45, 41.25], [27.64, 42.15], [28.24, 44.54], [28.24, 46.18], [28.24, 53.05], [30.63, 53.34], [30.48, 46.18], [30.63, 44.24], [31.52, 41.85], [33.02, 40.96], [34.66, 42.15], [35.55, 44.99], [35.55, 46.18], [35.55, 54.09], [39.43, 54.69], [42.57, 54.54], [44.51, 54.69], [44.81, 44.99], [45.55, 43.49], [47.19, 42.3], [48.69, 41.85], [51.22, 42.75], [52.42, 43.64], [52.87, 44.84], [52.72, 54.54], [55.25, 54.99], [58.39, 54.84], [62.57, 54.39], [62.42, 46.03], [62.42, 44.69], [62.57, 43.05], [63.31, 41.55], [64.21, 41.1], [65.7, 42], [66.45, 43.94], [66.45, 44.99], [66.45, 46.03], [66.3, 53.34], [69.13, 53.19], [68.99, 46.03], [68.99, 43.79], [69.58, 42.3], [70.63, 41.4], [71.67, 42.3], [72.42, 44.39], [72.42, 45.94], [72.27, 52.81], [74.21, 52.51], [74.21, 46.09], [74.21, 44.15], [74.51, 42.66], [75.4, 41.91], [76.6, 42.81], [77.05, 44.9], [76.9, 46.24], [76.75, 52.51], [78.39, 52.21], [78.24, 45.94], [78.24, 44.75], [78.69, 42.96], [79.28, 42.21], [80.03, 42.96], [80.33, 44.75], [80.48, 46.09], [80.33, 51.91], [82.27, 51.76], [82.27, 46.09], [82.27, 44.75], [82.72, 43.4], [83.31, 42.66], [84.21, 43.4], [84.36, 45.05], [84.21, 51.02], [85.55, 51.16], [85.4, 45.94], [85.4, 44.45], [86.15, 42.81], [86.9, 44.3], [86.9, 45.79], [87.05, 50.72], [87.94, 50.87], [87.64, 41.46], [78.84, 40.27], [69.58, 39.37], [63.16, 38.63], [58.24, 38.18], [39.43, 38.03], [34.21, 38.63], [31.97, 38.93], [27.94, 39.07], [25.55, 39.52], [20.93, 39.97], [16.75, 40.42], [13.76, 40.87], [11.52, 41.31]]); // cadena 1 — 124 puntos
    addChain([[10.78, 51.16], [11.82, 51.31], [11.67, 53.1], [10.78, 53.1], [10.63, 51.31]]); // cadena 2 — 5 puntos
    addChain([[11.82, 53.1], [12.72, 53.1], [12.87, 51.31], [11.82, 51.16]]); // cadena 3 — 4 puntos
    addChain([[13.31, 51.67], [15.85, 51.82], [16, 53.76], [13.31, 53.31], [13.16, 51.67]]); // cadena 4 — 5 puntos
    addChain([[16, 51.7], [17.04, 51.7], [17.19, 53.64], [16.15, 53.94]]); // cadena 5 — 4 puntos
    addChain([[17.64, 52.09], [17.49, 54.03], [19.73, 54.33], [19.88, 52.54], [17.79, 52.24]]); // cadena 6 — 5 puntos
    addChain([[19.73, 52.48], [21.22, 52.18], [21.22, 54.3], [19.88, 54.45]]); // cadena 7 — 4 puntos
    addChain([[21.97, 52.66], [21.82, 54.9], [25.1, 55.19], [25.1, 53.1], [22.12, 52.66]]); // cadena 8 — 5 puntos
    addChain([[25.25, 52.99], [26.3, 52.84], [26.6, 54.78], [25.25, 55.37]]); // cadena 9 — 4 puntos
    addChain([[27.49, 53.34], [27.49, 55.58], [30.93, 56.18], [30.93, 53.79], [27.64, 53.34]]); // cadena 10 — 5 puntos
    addChain([[31.07, 53.49], [32.42, 53.49], [32.72, 55.88], [30.93, 56.33]]); // cadena 11 — 4 puntos
    addChain([[34.56, 54.33], [34.56, 57.22], [39.11, 57.56], [44.78, 57.56], [44.56, 54.78], [39.67, 55], [34.89, 54.44]]); // cadena 12 — 7 puntos
    addChain([[52.89, 55], [52.89, 57.44], [57.89, 57.67], [58.33, 55.11], [52.67, 54.67], [58.11, 55.11], [62.56, 54.44], [62.89, 56.78], [58, 57.22]]); // cadena 13 — 9 puntos
    addChain([[39.56, 55], [39.11, 57.44]]); // cadena 14 — 2 puntos
    addChain([[64.56, 53.67], [66, 53.89], [69.22, 53.67], [69.33, 56], [65.89, 56.56], [64.33, 56.22], [64.67, 53.78], [65.78, 53.89], [65.89, 56.67]]); // cadena 15 — 9 puntos
    addChain([[42.67, 39.67], [42.56, 54.44], [42.78, 39.78], [55.11, 39.67], [55.33, 54.56]]); // cadena 16 — 5 puntos
    addChain([[58.11, 39.22], [58.44, 55.11]]); // cadena 17 — 2 puntos
    addChain([[39.22, 39], [39.33, 54.78]]); // cadena 18 — 2 puntos
    addChain([[39.44, 38], [37.78, 34.89], [60.33, 34.89], [58.33, 37.89]]); // cadena 19 — 4 puntos
    addChain([[60.33, 35], [88.89, 39.56], [87.56, 41.22]]); // cadena 20 — 3 puntos
    addChain([[60.44, 34.67], [60.11, 31], [89.11, 37.33], [89, 39.44]]); // cadena 21 — 4 puntos
    addChain([[59.78, 31], [37.67, 31], [37.33, 35]]); // cadena 22 — 3 puntos
    addChain([[37.56, 35.11], [9.56, 39.44], [9.56, 37.44], [37.22, 31.22]]); // cadena 23 — 4 puntos
    addChain([[9.56, 39.33], [11.33, 41.33]]); // cadena 24 — 2 puntos
    addChain([[11.33, 39], [11.33, 27.67], [10, 25.44], [11.56, 24.22], [14.44, 22.33], [18.89, 19.67], [23.56, 17], [28.56, 14.33], [35.89, 10.78], [38.89, 8.56], [44, 8.33], [54, 8.22], [58.67, 8.33], [61.44, 10], [67.11, 13.56], [68.78, 14.11], [71.56, 16.44], [73.67, 17.22], [76.89, 19.11], [78.22, 19.89], [80.22, 21], [82.89, 22.89], [85, 23.89], [87.67, 25.44], [88, 26.78], [89.11, 27.33], [87.33, 29.11], [88, 39.22]]); // cadena 25 — 28 puntos
    addChain([[13.44, 23.78], [15, 26.11], [15.22, 38.44]]); // cadena 26 — 3 puntos
    addChain([[17.33, 21.78], [19.22, 25], [20.22, 37]]); // cadena 27 — 3 puntos
    addChain([[21.44, 19.11], [24.22, 22.33], [24.56, 36.89]]); // cadena 28 — 3 puntos
    addChain([[26.11, 16], [29.78, 21.22], [29.67, 36.22]]); // cadena 29 — 3 puntos
    addChain([[33.89, 12.89], [36.67, 15.89], [37.44, 17.44], [37.44, 34.89]]); // cadena 30 — 4 puntos
    addChain([[43.89, 10.78], [42.33, 15], [42.22, 16.78], [42.67, 34.56]]); // cadena 31 — 4 puntos
    addChain([[53.78, 10.78], [55.22, 14.67], [55.33, 17.22], [55.56, 34.67]]); // cadena 32 — 4 puntos
    addChain([[63.56, 13], [61.33, 15.44], [60.11, 17.44], [60, 35.11]]); // cadena 33 — 4 puntos
    addChain([[38, 10.89], [39.33, 13.33], [39, 16.33], [37.22, 17.56], [38.78, 16.44], [42.11, 16.78]]); // cadena 34 — 6 puntos
    addChain([[59.89, 11.44], [58.78, 14.56], [58.67, 16.67], [55.56, 17], [58.56, 16.56], [60.22, 17.56]]); // cadena 35 — 6 puntos
    addChain([[42.56, 19.44], [45.56, 17], [48.89, 16], [52, 16.67], [55.33, 19.67]]); // cadena 36 — 5 puntos
    addChain([[70.89, 16.78], [68.44, 19.78], [68.22, 35.89]]); // cadena 37 — 3 puntos
    addChain([[76.11, 19.56], [73.89, 21.56], [73.56, 36.78]]); // cadena 38 — 3 puntos
    addChain([[80.33, 21.56], [77.78, 24], [77.89, 37.44]]); // cadena 39 — 3 puntos
    addChain([[83.89, 23.89], [81.44, 26.33], [81.67, 38.22]]); // cadena 40 — 3 puntos
    addChain([[87.56, 25.78], [85, 28.44], [85.56, 39]]); // cadena 41 — 3 puntos
    addChain([[48.89, 34.78], [48.56, 23.33], [49.56, 21], [51.44, 19], [54.22, 20.44], [55.22, 23.33], [55.44, 34.56]]); // cadena 42 — 7 puntos
    addChain([[42.56, 34.56], [43.11, 21.67], [44.22, 19.67], [45.78, 18.89], [48.22, 20.78], [48.56, 23.22]]); // cadena 43 — 6 puntos
    addChain([[62.89, 34.89], [62.33, 25.44], [63.89, 22.56], [66.22, 25.78], [66.44, 35.33]]); // cadena 44 — 5 puntos
    addChain([[69.67, 36.44], [69.22, 27.56], [70.22, 24.33], [71.78, 28.22], [72.33, 36.56]]); // cadena 45 — 5 puntos
    addChain([[74.44, 28.67], [75.44, 26.67], [76.44, 30.11], [76.67, 37.44]]); // cadena 46 — 4 puntos
    addChain([[74.56, 28.89], [74.44, 37.11]]); // cadena 47 — 2 puntos
    addChain([[78.67, 37.67], [78.56, 29.67], [79.11, 28.67], [80.33, 30.78], [80.33, 37.56]]); // cadena 48 — 5 puntos
    addChain([[82.89, 38.33], [81.89, 31.67], [82.89, 29.67], [83.78, 32.11], [84.56, 38.56]]); // cadena 49 — 5 puntos
    addChain([[85.33, 32.11], [86.22, 31], [87.33, 33.33], [87.44, 39]]); // cadena 50 — 4 puntos
    addChain([[12, 38.44], [12.22, 31.56], [13.33, 29.67], [13.89, 31.44], [14, 38.44]]); // cadena 51 — 5 puntos
    addChain([[16.11, 38], [16.11, 30.67], [17.44, 28.22], [18.22, 30.11], [18.78, 37.67]]); // cadena 52 — 5 puntos
    addChain([[20.89, 37.56], [20.44, 30.11], [21.44, 26.56], [22.89, 29.56], [23.11, 37]]); // cadena 53 — 5 puntos
    addChain([[25.89, 37], [25.22, 28.11], [26.56, 24.33], [28.33, 27], [28.44, 36.56]]); // cadena 54 — 5 puntos
    addChain([[31.33, 35.56], [31.22, 25.78], [32.89, 22.11], [35.11, 24.67], [34.89, 35.56]]); // cadena 55 — 5 puntos
    addChain([[14.89, 21.89], [16.44, 18.22], [14.67, 16.67]]); // cadena 56 — 3 puntos
    addChain([[19.56, 19.11], [20.44, 15.67], [18.78, 14.22]]); // cadena 57 — 3 puntos
    addChain([[24.22, 16.44], [25.22, 13.56], [23.56, 11.44]]); // cadena 58 — 3 puntos
    addChain([[30.89, 12.22], [31.22, 9.44], [29.22, 7.56]]); // cadena 59 — 3 puntos
    addChain([[37.89, 8.33], [39.44, 4.78], [36.89, 2.78]]); // cadena 60 — 3 puntos
    addChain([[43.22, 7.22], [42.67, 4.11], [43.67, 2.33]]); // cadena 61 — 3 puntos
    addChain([[54.89, 2.67], [57.11, 5.22], [55.11, 8]]); // cadena 62 — 3 puntos
    addChain([[61.44, 3], [59, 5.33], [59.56, 8.89]]); // cadena 63 — 3 puntos
    addChain([[68.44, 8], [66.11, 10.11], [66.67, 13]]); // cadena 64 — 3 puntos
    addChain([[72.67, 12.11], [72, 13.67], [72.11, 16.11]]); // cadena 65 — 3 puntos
    addChain([[77.22, 15.67], [76.11, 17.11], [76.89, 18.33]]); // cadena 66 — 3 puntos
    addChain([[80.89, 18.11], [79.78, 19.22], [81.33, 21.67]]); // cadena 67 — 3 puntos
    addChain([[84, 20.11], [83.11, 21.56], [85.22, 23.33]]); // cadena 68 — 3 puntos
    addChain([[49.11, 3.44], [48.89, 6], [47.44, 4.44], [50.67, 4.44], [49.22, 6]]); // cadena 69 — 5 puntos
    addChain([[43.22, 6.89], [49.44, 5.67], [55.56, 7.56]]); // cadena 70 — 3 puntos
    addChain([[33.89, 13], [38.22, 11.11], [44, 10.89], [54.11, 11], [60.44, 11.56], [63.56, 13], [71.56, 16.78]]); // cadena 71 — 7 puntos
    addChain([[34.22, 13], [26.44, 16]]); // cadena 72 — 2 puntos
    addChain([[70.33, 53.11], [72, 53.33], [74.56, 53], [75, 55.11], [72.11, 55.56], [70.22, 55.56], [70.44, 53.44], [71.56, 53.44], [72.33, 55.44]]); // cadena 73 — 9 puntos
    addChain([[76.56, 52.89], [76.44, 54.89], [78.56, 54.78], [78.89, 52.44], [76.89, 52.67], [75.22, 52.44], [75.33, 54.78], [76.22, 54.78]]); // cadena 74 — 8 puntos
    addChain([[80.56, 52.44], [80.22, 54.33], [82.78, 54.11], [82.78, 52.22], [81, 52]]); // cadena 75 — 5 puntos
    addChain([[83.67, 51.44], [83.67, 53.33], [85.78, 53.56], [85.78, 51.22], [83.44, 51.22]]); // cadena 76 — 5 puntos
    addChain([[86.89, 51.44], [87.11, 53.33], [88.56, 53.11], [88.56, 51.22], [86.67, 51.33]]); // cadena 77 — 5 puntos

    return chains;
  }

  const constelaciones = [
    {
      nombre: "iglesia",
      chains: siluetaIglesia(),
      etiquetas: [
        { x: 25, y: 54, texto: "TEMPLO DE LA TERCERA ORDEN" },
        { x: 73, y: 54, texto: "COLEGIO TERCERA ORDEN FRANCISCANA" }
      ]
    },
    {
      nombre: "castillo",
      chains: siluetaCastillo(),
      etiquetas: [
        { x: 50, y: 63, texto: "CASTILLO AZUL" }
      ]
    },
    {
      nombre: "casa-dorada",
      chains: siluetaCasaDorada(),
      etiquetas: [
        { x: 50, y: 61, texto: "CASA DORADA" }
      ]
    }
  ];

  constelaciones.forEach(c => {
    const pts = [];
    const edges = [];
    c.chains.forEach(chain => {
      const base = pts.length;
      chain.forEach((p, i) => {
        pts.push({
          wx: p[0],
          wy: p[1],
          ix: Math.floor(Math.random() * 3),
          radio: 1.6 + Math.random() * 0.6,
          fase: Math.random() * Math.PI * 2
        });
        if (i > 0) edges.push([base + i - 1, base + i]);
      });
    });
    c.puntos = pts;
    c.edges = edges;
  });

  const MARGEN = 4;
  let bboxFinal = null;

  function calcularBBoxSiluetas() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    constelaciones.forEach(c => c.puntos.forEach(p => {
      if (p.wx < minX) minX = p.wx;
      if (p.wx > maxX) maxX = p.wx;
      if (p.wy < minY) minY = p.wy;
      if (p.wy > maxY) maxY = p.wy;
    }));
    return {
      minX: minX - MARGEN, maxX: maxX + MARGEN,
      minY: minY - MARGEN, maxY: maxY + MARGEN
    };
  }

  function calcularBBoxConTexto(escalaProv) {
    const base = calcularBBoxSiluetas();
    let { minX, maxX, minY, maxY } = base;

    ctx.font = `${Math.max(9, escalaProv * 2.6)}px "Manrope", sans-serif`;
    constelaciones.forEach(c => {
      c.etiquetas.forEach(e => {
        const anchoTextoPx = ctx.measureText(e.texto).width;
        const medioAnchoUnid = (anchoTextoPx / 2) / escalaProv + 1.5;
        const alturaTextoUnid = (escalaProv * 2.6 * 1.3) / escalaProv;
        minX = Math.min(minX, e.x - medioAnchoUnid);
        maxX = Math.max(maxX, e.x + medioAnchoUnid);
        maxY = Math.max(maxY, e.y + alturaTextoUnid);
      });
    });
    return { minX, maxX, minY, maxY };
  }

  function generarFondo() {
    fondoEstrellas = [];
    for (let i = 0; i < 90; i++) {
      fondoEstrellas.push({
        x: Math.random() * ancho,
        y: Math.random() * alto,
        r: Math.random() * 1.2 + 0.3,
        a: Math.random() * 0.45 + 0.08
      });
    }
  }

  function redimensionar() {
    const rect = canvas.parentElement.getBoundingClientRect();
    ancho = Math.max(rect.width, 1);
    alto = Math.max(rect.height, 1);
    canvas.width = Math.round(ancho * dpr);
    canvas.height = Math.round(alto * dpr);

    const marginPx = 16;
    const bboxSil = calcularBBoxSiluetas();
    const escalaProv = Math.min(
      (ancho - marginPx * 2) / (bboxSil.maxX - bboxSil.minX),
      (alto - marginPx * 2) / (bboxSil.maxY - bboxSil.minY)
    );

    bboxFinal = calcularBBoxConTexto(escalaProv);
    const bboxAncho = bboxFinal.maxX - bboxFinal.minX;
    const bboxAlto = bboxFinal.maxY - bboxFinal.minY;

    escala = Math.min(
      (ancho - marginPx * 2) / bboxAncho,
      (alto - marginPx * 2) / bboxAlto
    );
    despx = (ancho - bboxAncho * escala) / 2;
    despy = (alto - bboxAlto * escala) / 2;

    generarFondo();
  }
  redimensionar();
  window.addEventListener("resize", redimensionar);

  window.addEventListener("pointermove", e => {
    const rect = canvas.getBoundingClientRect();
    const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    if (lx < 0 || ly < 0 || lx > rect.width || ly > rect.height) {
      puntero.x = -9999; puntero.y = -9999;
    } else {
      puntero.x = lx; puntero.y = ly;
    }
  }, { passive: true });

  function mundoAPantalla(wx, wy) {
    return {
      x: despx + (wx - bboxFinal.minX) * escala,
      y: despy + (wy - bboxFinal.minY) * escala
    };
  }

  const HOLD_MS = 5000;
  const MORPH_MS = 1800;
  let idxActual = 0;
  let idxSiguiente = 1 % constelaciones.length;
  let fase = "hold";
  let tFaseInicio = performance.now();

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function actualizarEstado(ahoraMs) {
    const transcurrido = ahoraMs - tFaseInicio;
    if (fase === "hold" && transcurrido >= HOLD_MS) {
      fase = "morph";
      tFaseInicio = ahoraMs;
    } else if (fase === "morph" && transcurrido >= MORPH_MS) {
      idxActual = idxSiguiente;
      idxSiguiente = (idxActual + 1) % constelaciones.length;
      fase = "hold";
      tFaseInicio = ahoraMs;
    }
  }

  function obtenerProgresoMorph(ahoraMs) {
    if (fase !== "morph") return 0;
    return easeInOutCubic(Math.min((ahoraMs - tFaseInicio) / MORPH_MS, 1));
  }

  function drawNode(x, y, p, alpha, tiempo) {
    if (alpha <= 0.01) return;
    const cerca = Math.hypot(x - puntero.x, y - puntero.y) < p.radio * 9;
    const pulso = 0.6 + 0.4 * Math.sin(tiempo * 0.08 + p.fase);
    const brillo = cerca ? 1 : pulso;
    const color = p.ix === 0 ? COLOR.blanco : p.ix === 1 ? COLOR.celeste : COLOR.dorado;
    const r = p.radio * (cerca ? 1.9 : 1);

    ctx.globalAlpha = Math.min(1, brillo + 0.15) * alpha;
    ctx.shadowBlur = cerca ? 14 : 7;
    ctx.shadowColor = "rgba(234,246,255,0.9)";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.85 * alpha;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function dibujarEdges(constelacion, posiciones, alphaGlobal) {
    if (alphaGlobal <= 0.01) return;
    ctx.lineWidth = 0.8;
    ctx.lineCap = "round";
    constelacion.edges.forEach(([i, j]) => {
      const a = posiciones[i], b = posiciones[j];
      if (!a || !b) return;
      const alphaFinal = alphaGlobal * Math.min(a.alpha, b.alpha);
      if (alphaFinal <= 0.01) return;
      const activo = a.activo || b.activo;
      ctx.strokeStyle = activo
        ? `rgba(234,246,255,${0.6 * alphaFinal})`
        : `rgba(155,212,255,${0.32 * alphaFinal})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }

  function posicionSimple(p) {
    const scr = mundoAPantalla(p.wx, p.wy);
    const cerca = Math.hypot(scr.x - puntero.x, scr.y - puntero.y) < p.radio * 9;
    return { x: scr.x, y: scr.y, alpha: 1, ix: p.ix, radio: p.radio, fase: p.fase, activo: cerca };
  }

  function calcularPosicionesInterpoladas(cA, cB, t) {
    const lenA = cA.puntos.length;
    const lenB = cB.puntos.length;
    const maxLen = Math.max(lenA, lenB);
    const posiciones = new Array(maxLen);

    for (let i = 0; i < maxLen; i++) {
      const pa = i < lenA ? cA.puntos[i] : null;
      const pb = i < lenB ? cB.puntos[i] : null;
      let wx, wy, alpha, ix, radio, fase;

      if (pa && pb) {
        wx = pa.wx + (pb.wx - pa.wx) * t;
        wy = pa.wy + (pb.wy - pa.wy) * t;
        alpha = 1;
        ix = t < 0.5 ? pa.ix : pb.ix;
        radio = pa.radio + (pb.radio - pa.radio) * t;
        fase = pa.fase;
      } else if (pa && !pb) {
        wx = pa.wx; wy = pa.wy;
        alpha = 1 - t;
        ix = pa.ix; radio = pa.radio; fase = pa.fase;
      } else {
        wx = pb.wx; wy = pb.wy;
        alpha = t;
        ix = pb.ix; radio = pb.radio; fase = pb.fase;
      }

      const scr = mundoAPantalla(wx, wy);
      const cerca = Math.hypot(scr.x - puntero.x, scr.y - puntero.y) < radio * 9;
      posiciones[i] = { x: scr.x, y: scr.y, alpha, ix, radio, fase, activo: cerca };
    }
    return posiciones;
  }

  function dibujarEtiquetas(cA, cB, t) {
    ctx.textAlign = "center";
    ctx.font = `${Math.max(9, escala * 2.6)}px "Manrope", sans-serif`;
    ctx.shadowBlur = 6;
    ctx.shadowColor = "rgba(155,212,255,0.4)";

    const alphaA = 1 - t;
    if (alphaA > 0.01) {
      cA.etiquetas.forEach(e => {
        const scr = mundoAPantalla(e.x, e.y);
        ctx.fillStyle = `rgba(155,212,255,${0.75 * alphaA})`;
        ctx.fillText(e.texto, scr.x, scr.y);
      });
    }
    if (t > 0.01) {
      cB.etiquetas.forEach(e => {
        const scr = mundoAPantalla(e.x, e.y);
        ctx.fillStyle = `rgba(155,212,255,${0.75 * t})`;
        ctx.fillText(e.texto, scr.x, scr.y);
      });
    }
    ctx.shadowBlur = 0;
  }

  function dibujarFondo() {
    ctx.fillStyle = "#BBD8FF";
    for (const s of fondoEstrellas) {
      ctx.globalAlpha = s.a;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function animate(tiempoMs) {
    actualizarEstado(tiempoMs);
    const t = obtenerProgresoMorph(tiempoMs);
    const cA = constelaciones[idxActual];
    const cB = constelaciones[idxSiguiente];

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    dibujarFondo();

    if (t <= 0.001) {
      const posiciones = cA.puntos.map(posicionSimple);
      dibujarEdges(cA, posiciones, 1);
      posiciones.forEach(p => drawNode(p.x, p.y, p, p.alpha, tiempoMs / 1000));
      dibujarEtiquetas(cA, cA, 0);
    } else {
      const posiciones = calcularPosicionesInterpoladas(cA, cB, t);
      dibujarEdges(cA, posiciones, 1 - t);
      dibujarEdges(cB, posiciones, t);
      posiciones.forEach(p => drawNode(p.x, p.y, p, p.alpha, tiempoMs / 1000));
      dibujarEtiquetas(cA, cB, t);
    }
  }

  if (reducirMovimiento()) {
    const cA = constelaciones[0];
    const dibujarEstatico = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, ancho, alto);
      dibujarFondo();
      const posiciones = cA.puntos.map(posicionSimple);
      dibujarEdges(cA, posiciones, 1);
      posiciones.forEach(p => drawNode(p.x, p.y, p, 1, 0));
      dibujarEtiquetas(cA, cA, 0);
    };
    window.addEventListener("pointermove", dibujarEstatico, { passive: true });
    dibujarEstatico();
  } else {
    (function bucle(ahora) {
      animate(ahora);
      requestAnimationFrame(bucle);
    })(performance.now());
  }
}

/* ============================================================
   Carga inicial
   ============================================================ */
async function init() {
  iniciarTema();
  iniciarRipple();
  iniciarScenes();
  iniciarScrollEstados();
  iniciarScrollspy();
  iniciarTilt();

  document.getElementById("formulario").addEventListener("submit", manejarEnvioFormulario);
  document.getElementById("descripcion").addEventListener("input", actualizarContadorCaracteres);
  document.getElementById("captcha-refresh").addEventListener("click", cargarCaptcha);
  actualizarContadorCaracteres();
  cargarCaptcha();

  document.getElementById("buscar").addEventListener("input", e => {
    terminoBusqueda = e.target.value;
    renderGaleria();
  });
  document.getElementById("orden").addEventListener("change", e => {
    ordenActivo = e.target.value;
    renderGaleria();
  });

  document.querySelectorAll(".filter-chips:not(.filter-chips-estado):not(.noticias-tabs) .chip")
    .forEach(chip => chip.addEventListener("click", manejarClicChipCategoria));
  document.querySelectorAll(".filter-chips-estado .chip")
    .forEach(chip => chip.addEventListener("click", manejarClicChipEstado));
  document.querySelectorAll(".noticias-tabs .chip")
    .forEach(chip => chip.addEventListener("click", manejarClicChipNoticia));

  // Modal de confirmación para eliminar reportes
  const modalCancel = document.getElementById("modal-cancel");
  const modalConfirm = document.getElementById("modal-confirm");
  const modalOverlay = document.getElementById("modal-overlay");
  if (modalCancel) modalCancel.addEventListener("click", cerrarModal);
  if (modalConfirm) modalConfirm.addEventListener("click", confirmarEliminar);
  if (modalOverlay) {
    modalOverlay.addEventListener("click", e => {
      if (e.target.id === "modal-overlay") cerrarModal();
    });
  }
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") cerrarModal();
  });

  iniciarParticulas();
  iniciarEstelaCursor();
  try {
    iniciarConstelacion();
  } catch (err) {
    console.warn("La constelación no se pudo iniciar:", err);
  }

  try {
    const [r, n] = await Promise.all([apiListarReportes(), apiListarNoticias()]);
    reportes = r;
    noticias = n;
    observarContadores();
    render();
    renderNoticias();
  } catch (err) {
    console.error("No se pudo conectar con el backend.", err);
    const empty = document.getElementById("empty-state");
    empty.hidden = false;
    empty.textContent = "No se pudo conectar con el servidor. ¿Lo iniciaste con `npm start`?";
    const emptyN = document.getElementById("noticias-empty");
    if (emptyN) emptyN.hidden = false;
    mostrarToast("Backend no disponible. Ejecuta `npm start`.", "error");
  }
}

document.addEventListener("DOMContentLoaded", init);