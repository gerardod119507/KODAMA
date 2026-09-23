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
toque `apps-script/**` **o el propio archivo del workflow**, y también se
puede disparar a mano (`workflow_dispatch` — botón "Run workflow" en la
pestaña **Actions**). Usa [`clasp`](https://github.com/google/clasp) (CLI
oficial de Google) para:

1. `clasp push --force` — sube el contenido de `apps-script/` al proyecto de
   Apps Script, pisando lo que haya en el editor. El repo es la fuente de
   verdad; el editor ya no se edita a mano.
2. `clasp deploy -i "$DEPLOYMENT_ID"` — crea una versión nueva del script y
   la asocia al **mismo despliegue** que ya existía. La URL del Web App está
   atada al despliegue (no a la versión del código), así que nunca cambia.

**Versión de clasp: `@google/clasp@3`** (misma mayor que corre
`clasp login` localmente). Motivo: clasp cambió el formato de
`~/.clasprc.json` entre versiones mayores — v2 usa `{"token": {...}}`, v3
usa `{"tokens": {...}}` — así que lo que importa es que la mayor coincida
con la que generó `CLASPRC_JSON`; el número de parche no afecta el formato.
Si el workflow instalara una mayor distinta a la que usaste para loguearte,
`clasp push` falla leyendo el token
(`Cannot read properties of undefined (reading 'access_token')`). Un paso
del workflow imprime `clasp --version` en cada run, para notar enseguida si
una mayor nueva (`@4`, etc.) alguna vez vuelve a cambiar el formato. Si en
el futuro actualizás tu `clasp` local a otra mayor (`npm install -g
@google/clasp@la-que-sea` + `clasp login` de nuevo para regenerar
`CLASPRC_JSON`), actualizá el número acá y en el workflow en el mismo PR.

**Por qué el workflow también se dispara con `.github/workflows/…yml` en
los `paths`, y por qué existe `workflow_dispatch`:** "Re-run failed jobs" en
GitHub Actions vuelve a correr el workflow **tal como estaba en el commit
que originó ese run**, no el que está hoy en `main` — así que no sirve para
probar un fix hecho en un PR posterior (así fue como el primer intento de
fijar la versión de clasp pasó varios reintentos sin detectarse que nunca
se estaba probando). Con el workflow en los `paths`, mergear un cambio al
propio archivo dispara un run nuevo de verdad; `workflow_dispatch` da un
botón para forzarlo a mano cuando ni `apps-script/` ni el workflow
cambiaron.

**Un job en verde no significaba "desplegado" (incidente 2026-09-23):** el
Checkpoint 4 se dio por terminado con el workflow en verde, pero el paso de
deploy había impreso `Invalid deployment ID` y **salido con código 0**.
`clasp push` sí había subido el código al proyecto, pero el despliegue nunca
se actualizó, así que el Web App siguió sirviendo la versión anterior y la
hoja `Horario` nunca se creó. Ahora el paso de deploy revisa **la salida de
clasp además del código de salida** y falla el job si aparece
`invalid`/`error`/`not found`/`failed`. Regla que quedó: *clasp puede fallar
sin fallar*, así que cualquier paso que lo use tiene que validar su salida.

**Nunca imprimir el deployment ID en los logs:** el ID es literalmente la
parte `/macros/s/<ID>/exec` de la URL del Web App, y los logs de Actions de
un repo público son públicos. El paso de deploy reemplaza el ID por
`<DEPLOYMENT_ID>` antes de mostrar cualquier salida de clasp.

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

## Pruebas automáticas

`tests/` + `.github/workflows/tests.yml`. Corren con `npm test` (que es
`node --test tests/*.test.js`) en cada push y cada PR. **Cero dependencias:**
usan el runner de pruebas que ya trae Node, no se instala nada.

- `tests/fake-google.js` — entorno falso de Apps Script (`SpreadsheetApp`,
  `Utilities`, `PropertiesService`, `ContentService`) que evalúa los `.gs`
  reales de `apps-script/` con `vm`. Imita **a propósito** las partes
  estrictas de Sheets (rangos de 0 filas, `setValues` con dimensiones que no
  coinciden) para que un error que rompería en producción también rompa acá.
  `Utilities.formatDate` devuelve un instante fijo, así las pruebas de
  "hoy vs. futuro" son deterministas.
- `tests/estructura.test.js` — que `asegurarEstructura()` cree las 3 hojas
  (la prueba de regresión del incidente del Checkpoint 4), encabezados,
  formato de texto en fechas/horas, idempotencia, y la migración de la
  columna `etiqueta` sobre una hoja que ya tenía datos.
- `tests/horario.test.js` — el generador: expansión de días a fechas,
  días con y sin tilde, límites de `desde`/`hasta`, respeto del pasado al
  regenerar, idempotencia, y convivencia con lo editado a mano.
- `tests/frontend.test.js` — lógica pura del navegador: filtro de capas y
  agrupación de bloques que se pisan.
- `tests/escritura.test.js` — las acciones de escritura del Checkpoint 5:
  crear/editar/archivar bloques y reglas, validaciones que fallan sin tocar
  la hoja, y que todas exijan token.
- `tests/semana.test.js` — Checkpoint 6: `listarBloquesRango` (extremos
  incluidos, orden, archivados, token), semana lunes–domingo cruzando mes y
  año, franja horaria, reparto lado a lado y recordar día/semana.

**Qué NO cubren:** nada que necesite un navegador o el Sheet real (render
del DOM, CSS, permisos de Google, que el despliegue efectivamente sirva la
versión nueva). Eso se verifica a mano, y si no se verificó hay que decirlo
como riesgo, no darlo por bueno.

**Al agregar comportamiento nuevo al backend o a la lógica del frontend, se
agrega su prueba en el mismo PR.**

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
`fecha`, `inicio`, `fin`, `etiqueta`, `notas`, `creado`, `actualizado`,
`archivado`.

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
- **`etiqueta`** (Checkpoint 4): texto libre, opcional. Para Startup se
  sugieren "Nerak", "Data cocha" y "otro" — sugieren, no restringen: la
  celda tiene una lista desplegable de Sheets con "permitir inválido"
  activado (`SpreadsheetApp` → `DataValidationBuilder.setAllowInvalid(true)`),
  así que se puede escribir cualquier otra cosa. Cambiarla nunca requiere
  regenerar nada: el generador del horario (ver más abajo) nunca toca
  `etiqueta` ni `notas` en un bloque que ya existía, solo las completa al
  crearlo por primera vez.
- **Columna agregada en el Checkpoint 4 a una hoja que ya tenía datos:**
  `asegurarHojaBloques()` (Code.gs) detecta si falta `etiqueta` en el
  encabezado y, si falta, inserta la columna justo antes de `notas` con
  `insertColumnBefore` — corre las columnas existentes sin tocar ninguna
  fila. Si la hoja ya tiene `etiqueta`, no hace nada (idempotente).

### Hoja `Horario` (Checkpoint 4)
Columnas: `id`, `título`, `área`, `días`, `inicio`, `fin`, `desde`, `hasta`,
`etiqueta`, `notas`, `archivado`. Cada fila es una **regla** ("esta clase se repite estos
días, entre estas fechas"), no una clase puntual.

- **`id`**: lo asigna siempre `generarHorario()` y lo escribe de vuelta en
  la hoja. **Tiene forma fija: `h` + 8 caracteres hexadecimales**
  (`PATRON_ID_SERIE` en Horario.gs). Cualquier valor que no tenga esa forma
  —celda vacía, un texto pegado a mano, un resto de una prueba— se
  reemplaza por uno nuevo. Una vez asignado es estable: no cambia al
  regenerar. Motivo de la forma fija: sin ella no había manera de
  distinguir un id puesto por el generador de basura en la celda, y un
  ejemplo de la documentación (`(vacío)`) terminó copiado literalmente,
  generando bloques con id `(vacío)-2026-09-22`. La unicidad se verifica
  contra los otros ids de la hoja antes de asignar.
- **`días`**: abreviaturas en español separadas por lo que sea (coma,
  espacio, guion, barra) — `Lun`, `Mar`, `Mié`, `Jue`, `Vie`, `Sáb`, `Dom`,
  con o sin tilde, mayúscula o minúscula (`parseDias()` en Horario.gs solo
  mira las primeras 3 letras sin tilde). Un día no reconocido tira un error
  que nombra el token y la fila, no falla en silencio.
- **`inicio`/`fin`**: `HH:mm`. **`desde`/`hasta`**: `YYYY-MM-DD`. Mismo
  formato de texto que en `Bloques`, mismo motivo (Sheets no debe
  autoconvertirlas).
- **`archivado`** (Checkpoint 5): `TRUE` o vacío. Una regla archivada deja
  de generar bloques, y sus bloques futuros se archivan en la próxima
  corrida. Se agregó **al final** de la hoja (no en el medio) para no mover
  ninguna columna existente; `migrarColumnaArchivadoHorario()` en Horario.gs
  lo hace solo y es idempotente.

**`generarHorario()` (Horario.gs) — cómo genera:**

1. Por cada fila de `Horario` con título, calcula todas las fechas entre
   `desde` y `hasta` cuyo día de semana está en `días`.
2. **Nunca toca el pasado**: de esas fechas, solo procesa las que son de
   hoy en adelante (`fecha >= hoy`, comparación de texto `YYYY-MM-DD`, que
   ordena igual que una fecha real). Aunque `desde` sea anterior a hoy, esas
   fechas pasadas simplemente no se generan ni se tocan.
3. El `id` de cada bloque generado es `idDeLaRegla + '-' + fecha` — estable
   entre corridas, así una fecha ya generada se **actualiza** (no se
   duplica) la próxima vez.
4. Si el bloque para esa fecha **ya existe y está archivado** (Gerardo
   canceló esa clase puntual archivándola), no se toca — ni se actualiza ni
   se "revive".
5. Si el bloque ya existe y no está archivado, se refrescan `título`,
   `área`, `tipo` (siempre `fijo`), `inicio`, `fin`; **nunca** se tocan
   `etiqueta`, `notas` ni `archivado` (son del bloque puntual, no de la
   regla).
6. Si el bloque no existe, se crea con `etiqueta` copiada de la regla,
   `notas` vacío.
7. Si una fecha futura **ya existía** de una corrida anterior pero la regla
   editada ya no la genera (se acortó `hasta`, se sacó un día), esa fila se
   **archiva** — nunca se borra (regla del proyecto).
8. Todo el cálculo se hace en memoria y se escribe con una sola lectura y
   una sola escritura de toda la hoja `Bloques` (no una llamada a Sheets por
   fila), para que no sea lento con varias reglas.

Devuelve `{ creados, actualizados, archivados }`. El botón "Generar horario
del semestre" en `config.html` llama a la acción `generarHorario` y muestra
ese resumen.

**Cancelar una clase puntual** (un feriado, una clase que no fue): se
archiva esa fila específica directamente en `Bloques`, nunca se edita
`Horario` para eso — `Horario` son las reglas generales, no el detalle de
cada semana.

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
  codificación: `{ id, titulo, area, tipo, fecha, inicio, fin, etiqueta,
  notas, creado, actualizado, archivado }`.
- `listarBloquesRango` — parámetros `desde` y `hasta` (texto
  `YYYY-MM-DD`, ambos incluidos). Mismo formato de bloque que
  `listarBloquesDia`, sin archivados, ordenados por `fecha` y después
  `inicio`. Falla con `rango_invalido` si una fecha está mal escrita o
  `desde` es posterior a `hasta`. Lo usa la vista de semana.
- `generarHorario` — sin parámetros. Lee la hoja `Horario`, crea/actualiza
  bloques fijos en `Bloques` (ver "Modelo de datos" para el algoritmo
  completo) y devuelve `{ creados, actualizados, archivados }`.
- `crearBloque` — parámetro `bloque` con `{ titulo, area, tipo, fecha,
  inicio, fin, etiqueta, notas }`. Valida todo antes de escribir (área
  existente, tipo válido, formatos de fecha/hora, `inicio < fin`) y falla
  sin tocar la hoja si algo está mal. El id es `b` + 8 hexadecimales, **sin
  sufijo de fecha**, así el generador del horario nunca lo confunde con un
  bloque de serie. Devuelve el bloque creado.
- `actualizarBloque` — parámetros `id` y `cambios`. Solo toca los campos que
  vienen en `cambios`; el resto queda como estaba. Revalida el bloque
  completo antes de escribir.
- `archivarBloque` — parámetro `id`. Marca `archivado = TRUE`. Nunca borra.
- `listarHorario` — sin parámetros. Devuelve todas las reglas de la hoja
  `Horario`, incluidas las archivadas (con `archivado: "TRUE"`), para el
  editor de la app.
- `crearRegla` — parámetro `regla`. Asigna el id de serie y valida con la
  misma función que usa el generador, así un error se ve al guardar y no
  recién al regenerar.
- `actualizarRegla` — parámetros `id` y `cambios`, misma lógica parcial que
  `actualizarBloque`.
- `archivarRegla` — parámetro `id`. La regla deja de generar bloques; sus
  bloques futuros se archivan en la próxima corrida de `generarHorario`.
- `listarSeries` — sin parámetros. Devuelve
  `[{ idSerie, titulo, cantidad }]` con las series que hoy tienen bloques,
  incluidas las **huérfanas** (sin fila en `Horario`), que son las que hay
  que poder limpiar.
- `borrarSerie` — parámetro `idSerie`. **Borra de verdad** (no archiva) las
  filas de `Bloques` de esa serie, y devuelve `{ borrados }`. Es la única
  excepción a "archivar en vez de borrar": existe para limpiar datos de
  prueba sin editar el Sheet a mano. Sin `idSerie` falla; nunca borra
  bloques que no pertenezcan a una serie (reuniones, bloques manuales).

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

## Escritura desde la app (Checkpoint 5)

Desde el Checkpoint 5 **no hace falta abrir el Sheet para nada de uso
diario**. La hoja sigue siendo la base de datos, pero se escribe por la API.

- **Vista de día** (`index.html`): botón `+` (bloque completo) y botón
  "Reunión" (modo rápido: solo título y hora, el resto por defecto) siempre
  visibles. Tocar un bloque lo abre para editar o archivar.
  `js/ui/formulario.js` es un solo diálogo con dos modos; el rápido oculta
  los campos `.solo-completo` por CSS en vez de duplicar el formulario.
- **Editor de horario** (`horario.html` + `js/horario.js`): lista de reglas,
  crear/editar/archivar, y botón "Regenerar horario".
- **Valores por defecto**: fecha = el día que se está viendo; inicio = la
  próxima media hora en `America/La_Paz`; fin = +60 min (bloque) o +30 min
  (reunión); área = la capa activa, o Universidad si la capa es General;
  tipo = `variable` (bloque) o `reunión` (rápido).
- **Celular primero**: `type="date"` y `type="time"` para que salga el
  selector nativo, `type="text"` y `<textarea>` en título y notas para que
  funcione el dictado por voz del teclado, y `font-size: max(1rem, 16px)` en
  los campos del diálogo porque iOS hace zoom automático con menos de 16px.
- **Escribir requiere conexión** (igual que dice "Caché local"): si el POST
  falla, **el diálogo queda abierto con todo lo escrito** y muestra el error
  del backend. Nunca se cierra ni se limpia un formulario que no se guardó.

## Vista de semana (Checkpoint 6)

`index.html` tiene dos modos, **Día** y **Semana** (`js/vista.js`). La
elección se guarda en `localStorage` (`kodama.vista`); si nunca se eligió,
una pantalla de 900px o más arranca en semana y el celular en día.

- **Navegación:** `‹` / `›` mueven 1 día en modo día y 7 días en modo
  semana; "Hoy" vuelve a la fecha actual. La semana va de lunes a domingo.
  Las fechas se calculan en UTC puro (`KodamaFecha.sumarDias`,
  `diasDeSemana`) por el mismo motivo que el generador: una fecha es un día
  de calendario, no un instante.
- **Grilla** (`js/ui/semana.js`): días en columnas, horas en filas. Cada
  bloque se posiciona con variables CSS (`--min-inicio`, `--min-duracion`)
  multiplicadas por el token `--escala-semana` — la escala vive en CSS, no
  en el JS. Franja base **06:30–21:00** (el horario real va de 6:45 a
  21:00); si un bloque cae afuera, la franja se estira sola a la media hora.
- **Lado a lado, sin avisos:** los bloques que se pisan (misma regla de
  cadena que la vista de día) se reparten el ancho; cada uno toma la
  primera columna libre, así en A–B–C, C reusa el lugar de A si A ya
  terminó.
- **Celular en modo semana:** la grilla se desplaza de costado dentro de su
  caja (la página nunca), con la columna de horas fija y arrancando en el
  día de hoy.
- Tocar un bloque abre el mismo editor del Checkpoint 5. Un bloque nuevo
  desde la semana toma hoy si hoy está en la semana vista, si no el lunes.
- Caché de lectura offline propia por rango
  (`kodama.cache.rango.<desde>.<hasta>`), igual que la del día.

## Capas (vista de día y de semana)

Selector en la vista de día y de semana (`js/capas.js`): **General**, Universidad,
Academia Fractal, Startup, Personal. Filtra client-side sobre los bloques
que ya trajo `listarBloquesDia` o `listarBloquesRango` — no pega otra vez al Web App, así que
cambiar de capa es instantáneo. `General` muestra todo, sin filtrar. La
capa elegida se guarda en `localStorage` (dispositivo), no en el Sheet.

**Sin avisos de choques ni solapamientos, en ninguna capa** (decisión
explícita del alcance): si dos bloques comparten horario, `js/ui/dia.js`
los agrupa en la misma fila visual y los pinta lado a lado
(`.fila-simultanea` en `css/styles.css`) — nada más. La agrupación es por
**cadena** de solapamiento (si A se pisa con B y B con C, los 3 van
juntos), calculada sobre los bloques ya ordenados por `inicio` que devuelve
el backend.

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
│       ├── deploy-apps-script.yml  # clasp push + clasp deploy en cada push a main
│       └── tests.yml                # npm test en cada push y PR
├── .gitignore               # .clasp.json / .clasprc.json (nunca al repo)
├── package.json             # sin dependencias: solo el comando de pruebas
├── tests/                   # pruebas con el runner de Node (ver "Pruebas automáticas")
├── index.html              # vista de día/semana + alta/edición de bloques
├── horario.html            # editor de las reglas del semestre
├── config.html             # URL del Web App + token, y prueba de conexión
├── manifest.webmanifest    # PWA (checkpoint 7)
├── sw.js                   # service worker (checkpoint 7)
├── css/
│   └── styles.css
├── js/
│   ├── app.js               # bootstrap de index.html (vista de día)
│   ├── api.js                # fetch al Web App (POST text/plain)
│   ├── config.js              # lógica de config.html
│   ├── horario.js              # lógica de horario.html (editor de reglas)
│   ├── state.js               # estado en memoria + cache local (lectura)
│   ├── fecha.js                # fecha "hoy" y formato legible en America/La_Paz
│   ├── capas.js                 # selector de capa (día y semana): leer/guardar/filtrar
│   ├── vista.js                 # modo día/semana, recordado en el dispositivo
│   └── ui/
│       ├── dia.js                # render de bloques (agrupa los que se pisan)
│       ├── semana.js             # grilla de semana: días × horas
│       ├── formulario.js          # diálogo de alta/edición de bloque
│       ├── iconos.js              # formas SVG por tipo de bloque
│       └── espiritu.js            # bocetos SVG de la mascota
├── icons/                   # íconos PWA
├── apps-script/
│   ├── appsscript.json       # manifiesto: zona horaria, tipo de despliegue
│   ├── Code.gs               # Web App: doPost, validación de token, hojas Areas/Bloques
│   ├── Bloques.gs             # crear/editar/archivar bloques desde la app
│   ├── Setup.gs               # configurarHojas() y generarToken(), un solo uso
│   └── Horario.gs             # hoja Horario + generarHorario(): reglas → filas de Bloques
├── docs/
│   ├── setup-google.md      # pasos exactos para Sheet + Apps Script
│   ├── datos-prueba.md       # cómo cargar bloques de prueba a mano
│   └── horario.md             # cómo llenar la hoja Horario y usar el generador
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
