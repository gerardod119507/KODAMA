# KODAMA — contexto para Claude

Este archivo es la memoria del proyecto. Léelo completo antes de tocar código.
Si algo aquí contradice lo que ves en el repo, pregunta antes de asumir.

## Quién soy y cómo trabajar conmigo

Soy Gerardo, Product Owner de KODAMA. Es mi primera app y soy principiante en
desarrollo.

- Explica brevemente el **porqué** de cada decisión técnica, no solo el qué.
- Responde siempre en español.
- Avanza por **checkpoints pequeños**: cada uno debe terminar en algo que yo
  pueda probar en el navegador o el celular.
- Al final de cada checkpoint, dime: qué cambió, qué debo hacer (pasos
  exactos, incluidos los de Google), qué debo observar, cómo confirmar que
  funcionó.
- Commits pequeños con convención `feat:` / `fix:` / `docs:` / `chore:`, en
  una rama por checkpoint, con un PR que yo reviso antes de merge.
- No agregues librerías ni herramientas nuevas sin justificarlo primero.
- Nunca hagas force push ni reescribas historial compartido.

## Qué es KODAMA

Sistema personal para organizar tiempo y trabajo en 4 áreas:

- **Universidad**
- **Academia Fractal** (clases particulares)
- **Startup**
- **Personal**

Además existen las **reuniones imprevistas**, que no son un área: son un
**tipo** de bloque que cruza todas las áreas (ver "Modelo de datos").

## Stack (100% gratuito, sin excepciones)

- **Base de datos:** Google Sheets.
- **API:** Google Apps Script publicado como Web App. El código fuente vive
  en `apps-script/` en este repo; se copia manualmente al editor de Apps
  Script (no hay despliegue automático).
- **Frontend:** HTML + CSS + JavaScript vanilla. Sin frameworks, sin build
  step. Publicado en GitHub Pages.
- **PWA** instalable en el celular (manifest + service worker) — checkpoint 7.
- **Mobile-first.** Uso principal: celular. El dictado por voz usa el
  micrófono del teclado del móvil, así que basta con buenos campos de texto;
  no hace falta integrar reconocimiento de voz en la app.

### Por qué este stack

Cero costo, cero servidor propio que mantener, y todo el código (menos el
Apps Script) es estático y cacheable por el navegador — ideal para una PWA
simple sin build tools.

## Código anterior (abandonado)

Hubo un intento previo en React + Vite + Dexie/IndexedDB. **Vivía en la PC
de Gerardo, nunca llegó a este repo.** No hay nada que preservar ni migrar.
Se parte de cero.

## Seguridad (no negociable)

- El repo es **público** (requisito de GitHub Pages gratis en cuenta
  personal). Nunca subir datos reales, IDs de hojas, tokens ni la URL del
  Web App al repo.
- El Web App valida un **token secreto** guardado en *Script Properties* de
  Apps Script (nunca en el código fuente). El frontend lo pide una vez
  (prompt) y lo guarda solo en el dispositivo (`localStorage`), nunca en el
  repo.
- **El token nunca va en la URL** (ni como query param, ni en `doGet`).
  Todas las llamadas —incluidas las de prueba— son `POST` con el token en el
  cuerpo. Motivo: las URLs quedan en logs del navegador, del proxy, del
  historial y de Apps Script; el cuerpo de un POST no se loguea igual.
- **CORS con Apps Script:** el Web App no permite configurar headers CORS
  personalizados en un `doPost` normal, así que evitamos el *preflight*
  (`OPTIONS`) enviando el `POST` con `Content-Type: text/plain`. Si usáramos
  `application/json`, el navegador dispararía un preflight que Apps Script no
  responde bien, y la petición fallaría. El body igual contiene JSON (como
  texto), y lo parseamos manualmente en `doPost`.
- **Riesgo residual del token en `localStorage`:** si alguien tiene acceso
  físico al celular desbloqueado, o si en el futuro se agrega una librería de
  terceros comprometida (XSS), el token podría leerse. Mitigamos limitando
  qué puede hacer el token (solo esta Web App, no acceso directo a la
  cuenta de Google) y evitando cualquier script de terceros no auditado. No
  es un secreto de nivel bancario; es suficiente para un proyecto personal.
- **Nunca usar `innerHTML` con contenido que venga del usuario o del Sheet**
  (notas, títulos). Usar `textContent` o creación de nodos DOM, para evitar
  XSS.
- **Cómo probar el Web App sin exponer el token:** nunca pegar el token en la
  barra de direcciones ni en un comando que quede en el historial de shell en
  texto plano. En el checkpoint 2 se entrega un script de prueba que lee el
  token desde una variable de entorno local (no versionada) o lo pide de
  forma interactiva oculta (`read -s`), y lo envía por `POST` en el cuerpo.

## Modelo de datos (Google Sheets)

### Hoja `Areas`
4 filas fijas al arrancar (sin fila para "Reunión": no es un área, es un
tipo de bloque):

| nombre | color |
|---|---|
| Universidad | `#245A8D` |
| Academia Fractal | `#8A5A00` |
| Startup | `#6650A4` |
| Personal | `#476A54` |

### Hoja `Bloques`
Columnas: `id`, `título`, `área`, `tipo` (`fijo` / `variable` / `reunión`),
`fecha`, `inicio`, `fin`, `notas`, `creado`, `actualizado`, `archivado`.

- **Fecha y hora se guardan como TEXTO**, formato `YYYY-MM-DD` y `HH:mm`
  (ej. `2026-09-22`, `14:30`). Motivo: si se guardan como tipo Fecha/Hora,
  Google Sheets las autoconvierte según el locale y rompe el formato al leer
  desde Apps Script o al editar manualmente en la hoja. Guardarlas como texto
  evita esa conversión silenciosa.
- **Zona horaria:** `America/La_Paz` en dos lugares — configuración regional
  del Google Sheet (Archivo → Configuración) y configuración del proyecto de
  Apps Script (`appsscript.json` → `timeZone`). Debe coincidir en ambos o los
  cálculos de fecha/hora en Apps Script quedan desfasados.
- **Archivar, no borrar:** `archivado` es `TRUE`/`FALSE` (o vacío). Borrar un
  bloque de verdad no es parte del MVP.

### Hoja `Horario` (checkpoint 4)
Define las clases fijas del semestre; una función de Apps Script la lee y
genera una fila individual por cada clase en `Bloques`. Sin recurrencia
compleja: se materializan filas, no reglas.

## Caché local

Solo para **lectura offline** (ver el último día/semana cargado sin
conexión). Crear o editar un bloque **requiere conexión** — si falla el
POST, se muestra error y no se guarda nada localmente. No hay cola offline
ni sincronización diferida en el MVP: se agrega complejidad (conflictos,
reintentos) que no se justifica para un uso personal.

## Paleta y tema

| Uso | Color |
|---|---|
| Forest (marca) | `#16372B` |
| Bone (marca) | `#F5F1E8` |
| Fondo oscuro | `#0E1713` |
| Universidad | `#245A8D` |
| Academia Fractal | `#8A5A00` |
| Startup | `#6650A4` |
| Personal | `#476A54` |
| Reunión (tipo, no área) | `#9D3D2E` |

Todo color de área/tipo debe combinarse con un **ícono o borde**, nunca ser
el único indicador (accesibilidad para daltonismo). Verificar contraste
texto/fondo con WCAG AA (mínimo 4.5:1 para texto normal) en ambos temas,
claro y oscuro.

## Alcance del MVP

1. Hojas `Areas` y `Bloques` (ver modelo de datos).
2. Vista de día (celular) y de semana (escritorio), color por área + ícono/
   borde por tipo.
3. Captura rápida de una reunión desde cualquier vista, en 1 toque.
4. Horario fijo del semestre generado desde la hoja `Horario` (filas
   individuales, sin recurrencia).
5. Editar y archivar bloques (nunca borrar).
6. Tema claro/oscuro con la paleta de arriba, contraste WCAG AA.

**Fuera de alcance por ahora:** estudiantes, kanban, buscador global, drag &
drop, notificaciones, cola offline.

## Estructura de carpetas

```
KODAMA/
├── index.html              # vista principal (día/semana)
├── manifest.webmanifest    # PWA (checkpoint 7)
├── sw.js                   # service worker (checkpoint 7)
├── css/
│   └── styles.css
├── js/
│   ├── app.js               # bootstrap + router simple de vistas
│   ├── api.js                # fetch al Web App (POST text/plain)
│   ├── state.js               # estado en memoria + cache local (lectura)
│   └── ui/                    # render de día, semana, formulario
├── icons/                   # íconos PWA
├── apps-script/
│   ├── Code.gs               # Web App: doPost, validación de token
│   ├── Bloques.gs             # CRUD de la hoja Bloques
│   └── Horario.gs             # generador de clases fijas → filas
├── docs/
│   └── setup-google.md      # pasos exactos para Sheet + Apps Script
└── CLAUDE.md
```

Cada carpeta se crea cuando el checkpoint correspondiente la necesita, no
antes.

## Plan de checkpoints

1. **Esqueleto + CLAUDE.md + GitHub Pages** — este checkpoint.
2. **Sheet + Apps Script base con token** — hojas `Areas`/`Bloques`, Web App
   con validación de token por POST.
3. **Vista de día + lectura** — frontend pide bloques del día y los pinta.
4. **Generador del horario fijo del semestre** — hoja `Horario` → filas en
   `Bloques`.
5. **Captura rápida de reunión + editar/archivar.**
6. **Vista de semana (escritorio).**
7. **Tema claro/oscuro + PWA + contraste WCAG AA.**

Cada checkpoint: rama corta → PR pequeño → Gerardo prueba y aprueba → merge.
