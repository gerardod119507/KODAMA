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
  en `apps-script/` en este repo. Un workflow de GitHub Actions lo despliega
  solo con cada push a `main` que toque esa carpeta (`clasp push` +
  `clasp deploy`) — ver "Despliegue de Apps Script (CI/CD)" más abajo. El
  editor de Apps Script deja de ser donde se edita código; sigue siendo
  necesario para tareas puntuales que no se pueden hacer por API (generar el
  token, ver logs de ejecución).
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
  texto plano. La prueba es `config.html`: el token se escribe en un campo
  `type="password"`, viaja en el cuerpo del `POST` y se guarda solo en
  `localStorage` del dispositivo. Se eligió una página en vez de un script de
  terminal por dos motivos: Gerardo prueba desde el celular, y una prueba con
  `curl` no verificaría CORS —solo una petición real desde el origen de
  GitHub Pages demuestra que el navegador puede hablar con el Web App.

## Despliegue de Apps Script (CI/CD)

`.github/workflows/deploy-apps-script.yml` corre en cada push a `main` que
toque `apps-script/**`. Usa [`clasp`](https://github.com/google/clasp) (CLI
oficial de Google) para:

1. `clasp push --force` — sube el contenido de `apps-script/` al proyecto de
   Apps Script, pisando lo que haya en el editor. El repo es la fuente de
   verdad; el editor ya no se edita a mano.
2. `clasp deploy -i "$DEPLOYMENT_ID"` — crea una versión nueva del script y
   la asocia al **mismo despliegue** que ya existía. La URL del Web App está
   atada al despliegue (no a la versión del código), así que nunca cambia.

### Secrets del repo (`Settings` → `Secrets and variables` → `Actions`)

- `SCRIPT_ID` — identifica el proyecto de Apps Script. Se genera un
  `.clasp.json` con este valor dentro del workflow (nunca se commitea).
- `DEPLOYMENT_ID` — identifica el despliegue existente (Web App), para que
  `clasp deploy -i` actualice ese y no cree uno nuevo con otra URL.
- `CLASPRC_JSON` — las credenciales OAuth que `clasp login` guarda en
  `~/.clasprc.json` en una máquina local. El workflow reconstruye ese
  archivo a partir del secret antes de correr `clasp push`/`clasp deploy`.
  Son credenciales de la cuenta de Gerardo con permiso para editar el
  script — por eso viven solo como secret, nunca en el repo.

### Qué sigue siendo manual (no se puede automatizar por API)

- **Generar el token** (`generarToken()` en Setup.gs): correrlo desde un
  workflow público sin autenticación sería crear un secreto por un endpoint
  no protegido — justo lo que el token existe para evitar. Se genera una
  sola vez a mano, como en el Checkpoint 2.
- **La primera creación del script y el primer despliegue**: `SCRIPT_ID` y
  `DEPLOYMENT_ID` solo existen después de crear el proyecto y publicarlo una
  vez desde la interfaz de Google (Checkpoint 2). El workflow actualiza un
  despliegue que ya existe; no crea el primero.
- **`clasp login`**: requiere el flujo interactivo de OAuth de Google en un
  navegador. Se corre una vez en una computadora para generar el
  `CLASPRC_JSON` que se pegó como secret.

### Auto-creación de hojas

`asegurarEstructura()` (Code.gs) corre en **cada** `POST` autorizado, antes
de ejecutar la acción pedida: crea `Areas` (con las 4 áreas) y `Bloques`
(con encabezados, en formato texto) si no existen, y fija la zona horaria
del libro. Es idempotente — si una hoja ya tiene filas, no la toca. Motivo:
con el despliegue automatizado, la idea es tocar el editor de Apps Script lo
menos posible; si alguna vez hay que recrear el Sheet desde cero, la primera
petición al Web App ya lo deja usable. `Horario` se suma a esta función
recién en el Checkpoint 4, cuando se defina su estructura de columnas.

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

## API (acciones del Web App)

Todas se piden con `POST` (`action` + `token` + parámetros en el cuerpo).
Respuesta uniforme: `{ ok: true, data: ... }` o `{ ok: false, error: "..." }`.

**Fuente de verdad de los nombres:** el objeto `ACCIONES` en
`apps-script/Code.gs`. Es lo único que decide qué `action` reconoce el
backend — no hay un `switch` aparte ni una lista duplicada. Si el nombre
que manda el frontend (`KodamaApi.llamar(url, token, 'nombreDeAccion', ...)`
en `js/*.js`) no coincide **letra por letra** con una clave de `ACCIONES`,
el backend responde `accion_desconocida` y el mensaje de error incluye la
acción recibida y la lista de acciones válidas — no hace falta adivinar,
revisar la respuesta alcanza. Agregar una acción nueva es agregar una
entrada a `ACCIONES`, en un solo lugar.

Esta tabla es una copia legible de `ACCIONES` — si alguna vez no coincide
con el código, el código manda:

- `ping` — sin parámetros. Devuelve `{ mensaje, zonaHoraria }`; confirma que
  el Web App responde.
- `listarAreas` — sin parámetros. Devuelve un array de `{ nombre, color }`.
- `listarBloquesDia` — parámetro `fecha` (texto `YYYY-MM-DD`). Devuelve los
  bloques de ese día no archivados, ordenados por `inicio`. Cada bloque usa
  claves en ASCII —`titulo`, `area`, sin tildes— aunque en la hoja las
  columnas se llamen `título`/`área`, para que el JSON no dependa de
  codificación: `{ id, titulo, area, tipo, fecha, inicio, fin, notas,
  creado, actualizado, archivado }`.

Se agrega una acción por checkpoint; esta lista se mantiene al día.

**Por qué pasó el bug de "accion_desconocida" después del Checkpoint 3:** la
rama del despliegue automático (CI/CD) se había creado desde `main` *antes*
de que el Checkpoint 3 (con `listarBloquesDia`) se mergeara. Su
`apps-script/Code.gs` todavía no tenía esa acción. Si ese código se copió al
editor de Apps Script después de tener el Checkpoint 3 andando, pisó
`listarBloquesDia` con una versión anterior que no la reconocía — el
frontend (ya en la versión del Checkpoint 3) seguía pidiéndola igual. La
rama de CI/CD se actualizó (merge con `main`) para que esto no se repita: a
partir de ahora, esa rama siempre incluye la última acción agregada.

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

## Dirección visual

Se aplica **desde el Checkpoint 3 en adelante** (el esqueleto del
Checkpoint 1 es intencionalmente básico).

- **Identidad:** de bosque, orgánica, sobria, cálida. Nada infantil ni de
  plantilla genérica. La paleta de arriba ya apunta ahí; el resto del diseño
  (tipografía, espaciado, formas) debe sostener esa sensación, no
  contradecirla con componentes genéricos de "dashboard".
- **Mascota:** un espíritu del bosque **original** de KODAMA — inspirado en
  el imaginario de espíritus del bosque, pero con diseño propio, sin copiar
  el estilo de Ghibli. Ilustración en **SVG propio** (nunca una imagen
  externa ni una librería de íconos de terceros, por la regla de no sumar
  dependencias sin justificar). 4 estados:
  - **Tranquilo** — estado por defecto, nada pendiente.
  - **Atento** — hay algo pendiente (ej. bloques sin confirmar).
  - **Contento** — feedback tras una acción completada (ej. guardar una
    reunión).
  - **Dormido** — día libre o vista vacía.
  - *Motivo de solo 4 estados:* cubren los momentos reales de la app sin
    convertir la mascota en un sistema de animación aparte que haya que
    mantener.
- **Dónde aparece:** estados vacíos, confirmaciones, carga y encabezado.
  **Nunca** debe estorbar la lectura del horario (ni superpuesta a bloques,
  ni compitiendo por atención en la vista principal).
- **Dinamismo:** transiciones cortas (150–250 ms), feedback inmediato al
  tocar (ej. cambio de estado visual al presionar un botón), animación suave
  de entrada para bloques nuevos en la vista. Todo dentro de
  `prefers-reduced-motion: reduce` desactivado o reducido — motivo: parte de
  la audiencia (incluido el propio Gerardo en algún momento) puede tener
  sensibilidad al movimiento, y es una media query nativa del navegador, sin
  librerías.
- **Tokens de diseño:** colores, tipografía, espaciado, radios y sombras
  viven como variables CSS (`:root`, ya empezado en `css/styles.css` con la
  paleta). Todo componente nuevo consume tokens, nunca valores sueltos
  (`padding: 13px` está prohibido si no sale de un token de espaciado).
  Motivo: sin esto, mantener consistencia visual sin un framework de CSS se
  vuelve inmanejable a medida que crecen las vistas.
- **Accesibilidad:** contraste WCAG AA verificado (ya definido arriba); el
  tipo de bloque se distingue por ícono o borde, nunca solo por color (ya
  definido arriba, se repite aquí porque aplica también a la mascota y sus
  estados).

**Bocetos de la mascota:** propuestos en `js/ui/espiritu.js` (`dormidoA` /
`dormidoB`), visibles en el estado vacío de la vista de día mientras no haya
una elección de Gerardo. Solo existe el estado **dormido** por ahora; los
otros 3 estados se agregan una vez elegido el diseño base.

**Forma por tipo de bloque** (`js/ui/iconos.js`): cuadrado = fijo, círculo =
variable, triángulo = reunión. La forma es el canal accesible para el tipo;
el color del ícono es el del área (o el color dedicado de Reunión cuando
`tipo` es `reunión`, ver paleta arriba) — dos canales distintos para dos
datos distintos, ninguno solo por color.

**Contraste de los colores de área en modo oscuro:** los 5 valores de la
paleta, usados como relleno de ícono, no llegan a 3:1 (mínimo WCAG para
elementos gráficos) sobre el fondo oscuro `#0E1713` — el peor caso,
Universidad, da 2.54:1. `css/styles.css` define variantes más claras (mismo
matiz, más luminosidad) solo bajo `[data-theme="dark"]`, todas por encima de
4.5:1. En modo claro se usan los valores de la paleta sin cambios (ya dan
5.2–6.4:1 sobre `bone`). El modo oscuro todavía no tiene un botón que lo
active (eso es el Checkpoint 7); los tokens ya están listos para cuando lo
tenga.

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
├── .github/
│   └── workflows/
│       └── deploy-apps-script.yml  # clasp push + clasp deploy en cada push a main
├── .gitignore               # .clasp.json / .clasprc.json (nunca al repo)
├── index.html              # vista principal (día/semana)
├── config.html             # URL del Web App + token, y prueba de conexión
├── manifest.webmanifest    # PWA (checkpoint 7)
├── sw.js                   # service worker (checkpoint 7)
├── css/
│   └── styles.css
├── js/
│   ├── app.js               # bootstrap de index.html (vista de día)
│   ├── api.js                # fetch al Web App (POST text/plain)
│   ├── config.js              # lógica de config.html
│   ├── state.js               # estado en memoria + cache local (lectura)
│   ├── fecha.js                # fecha "hoy" y formato legible en America/La_Paz
│   └── ui/
│       ├── dia.js                # render de la lista de bloques del día
│       ├── iconos.js              # formas SVG por tipo de bloque
│       └── espiritu.js            # bocetos SVG de la mascota
├── icons/                   # íconos PWA
├── apps-script/
│   ├── appsscript.json       # manifiesto: zona horaria, tipo de despliegue
│   ├── Code.gs               # Web App: doPost, validación de token
│   ├── Setup.gs               # configurarHojas() y generarToken(), un solo uso
│   ├── Bloques.gs             # CRUD de la hoja Bloques
│   └── Horario.gs             # generador de clases fijas → filas
├── docs/
│   ├── setup-google.md      # pasos exactos para Sheet + Apps Script
│   └── datos-prueba.md       # cómo cargar bloques de prueba a mano
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
