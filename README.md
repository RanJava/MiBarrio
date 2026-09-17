# Mi Barrio Mejor — Las Panosas, Tarija

Plataforma de reportes comunitarios para el barrio Las Panosas (Distrito 3, casco viejo de Tarija), hecha para el Concurso Mi Barrio Mejor.

## Cómo ejecutarlo

> Requiere \\\*\\\*Node.js 22.5+\\\*\\\* (se usa el módulo `node:sqlite`, incluido en Node, sin dependencias externas). No hace falta `npm install`.

```bash
npm start          # arranca el servidor en http://localhost:3000
npm run dev        # igual, pero con recarga automática (node --watch)
```

La primera vez, el servidor crea `data/mibarrio.db` y lo precarga con 3 reportes de ejemplo.

## Stack

* **Node.js puro + SQLite nativo** (`node:sqlite`, cero dependencias) como backend: API REST en JSON y servidor de estáticos.
* **HTML + CSS + JavaScript vanilla** en el frontend (`fetch`, manipulación directa del DOM, sin frameworks).
* **tsParticles v4 (slim, vía CDN)** — partículas interactivas con el cursor en el hero (grab, bubble, repulse, push).
* **Canvas de estela de partículas** que sigue al cursor en toda la página.
* **Scroll interactivo implementado con `IntersectionObserver`** (funciona en todos los navegadores, incluido Firefox): revelado de elementos con transformaciones, parallax del hero y de los arcos, barra de progreso de scroll, scrollspy de navegación y botón "volver arriba".
* **Animaciones unificadas en botones** (onda/ripple, elevación, brillo y compresión al presionar) respetando `prefers-reduced-motion`.
* **SQLite** como persistencia real de los reportes (la base vive en `data/`).

## Estructura

```
mi-barrio-mejor/
├── package.json              # scripts: start / dev
├── server/
│   ├── server.js             # servidor HTTP + API REST + estáticos
│   └── db.js                 # capa de datos SQLite (node:sqlite) + semilla
├── public/
│   ├── index.html
│   ├── css/styles.css        # sistema de diseño unificado
│   └── js/script.js          # lógica del frontend (fetch + animaciones)
├── data/                     # base SQLite (se crea sola, no se versiona)
└── README.md
```

## API REST

|Método|Ruta|Descripción|
|-|-|-|
|GET|`/api/reportes`|Lista todos los reportes|
|POST|`/api/reportes`|Crea un reporte|
|GET|`/api/reportes/:id`|Obtiene un reporte|
|PATCH|`/api/reportes/:id`|Cambia `{ "estado": "resuelto" }`|
|DELETE|`/api/reportes/:id`|Elimina un reporte|
|GET|`/api/stats`|Totales: pendientes / en proceso / resueltos|

Ejemplo de creación:

```bash
curl -X POST http://localhost:3000/api/reportes \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"titulo":"Farol apagado","categoria":"iluminacion","prioridad":"alta","calle":"Calle Bolívar","descripcion":"No enciende de noche."}'
```

## Funcionalidad implementada

* Formulario de reportes con validación en tiempo real y contador de caracteres.
* Los reportes se **guardan en SQLite** a través del backend (crear, resolver, eliminar con modal de confirmación).
* Tarjetas generadas con `createElement` y **tilt 3D** al pasar el cursor.
* Contadores animados que se activan al entrar en el viewport.
* Filtros por categoría y estado, búsqueda por texto y orden (recientes / antiguos / por estado / por prioridad).
* Notificaciones toast al crear, resolver y eliminar.
* Tema claro/oscuro persistente.
* Partículas del hero interactivas con el cursor + estela de partículas global.

## Identidad visual

Paleta basada en la Casa Dorada (dorado ocre `#C8862B`), el Castillo Azul (azul cielo `#4A7BB5`), la bandera departamental (rojo punzó `#C8102E`) y la cultura de la vid chapaca (morado `#6B2D5C`). Las tarjetas y divisores usan arcos de medio punto como motivo, evocando las fachadas coloniales del casco viejo. Tipografía: Fraunces (títulos) + Manrope (interfaz).

## Notas

* Si accedes sin arrancar el servidor, el frontend muestra un aviso amistoso: el backend es obligatorio (los reportes viven en SQLite, ya no en `localStorage`).
* Todo el frontend respeta `prefers-reduced-motion` (la estela del cursor y las animaciones se desactivan).

