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
- **La app me habla de tú, nunca de vos** ("Elige", "Toca", "puedes"; no
  "Elegí", "Tocá", "podés"), en pantallas, errores del backend y
  registros del editor.
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
- **PWA** instalable en el celular (manifest + service worker, Checkpoint 9).
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

`asegurarEstructura()` (Code.gs) corre antes de la acción pedida en el
primer `POST` autorizado, y después solo cuando hace falta (ver abajo): crea `Areas` (con las 4 áreas) y `Bloques`
(con encabezados, en formato texto) si no existen, y fija la zona horaria
del libro. Es idempotente — si una hoja ya tiene filas, no la toca. Motivo:
con el despliegue automatizado, la idea es tocar el editor de Apps Script lo
menos posible; si alguna vez hay que recrear el Sheet desde cero, la primera
petición al Web App ya lo deja usable. `Horario` se suma a esta función
recién en el Checkpoint 4, cuando se defina su estructura de columnas.

**Desde el Checkpoint 6.5 no corre en cada petición** (eran ~15 llamadas a
Sheets de 18 en una lectura). `asegurarEstructuraSiHaceFalta()` guarda en
Script Properties (`KODAMA_ESTRUCTURA`) una *firma* — zona horaria +
encabezados de `Bloques` y `Horario` — y solo verifica si la firma guardada
no coincide con la del código. Así, un cambio de columnas en el código (una
migración nueva) dispara la verificación solo, sin acordarse de nada al
desplegar. Además, **cualquier error** borra la firma: si alguien borró o
rompió una hoja a mano, esa petición falla y la siguiente la repara.

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
- `tests/frontend.test.js` — lógica pura del navegador: filtro de capas
  (qué se muestra completo y qué como "ocupado"). El reparto lado a lado y
  los huecos están en `semana.test.js`/`huecos.test.js`: la vista de día
  usa la misma grilla que la semana.
- `tests/escritura.test.js` — las acciones de escritura del Checkpoint 5:
  crear/editar/archivar bloques y reglas, validaciones que fallan sin tocar
  la hoja, y que todas exijan token.
- `tests/velocidad.test.js` — Checkpoint 6.5: que una semana lea una
  fracción de la hoja (no la hoja entera), que `Bloques` quede ordenada
  tras generar/crear/mover, que una hoja desordenada a mano igual dé
  resultados correctos, que la estructura se verifique una vez (y de nuevo
  tras un error o un cambio de columnas), la caché por semana del
  navegador y "Duplicar".
- `tests/huecos.test.js` — ajustes de la semana: rango de días elegible,
  qué huecos se colapsan (más de 2 h, libres en todos los días visibles),
  que las alturas sigan proporcionales con huecos colapsados, y qué bloques
  llevan el borde de superposición.
- `tests/alumnos.test.js` — Checkpoint 7: hojas `Alumnos`/`Cursos`/
  `Colegios`, alta/edición/archivo con sus validaciones (catálogo, tarifa,
  forma de pago, duplicados), renombrar un catálogo actualiza a los
  alumnos, bloques y reglas con `alumno_id` (título opcional), el
  generador copia los alumnos, y la **migración** de los bloques de
  Fractal con el nombre en el título (vista previa sin escribir, cada
  alumno creado una sola vez, nada perdido, filas elegidas).
- `tests/importar.test.js` — el importador: encabezados en cualquier
  orden o sin encabezado, vista previa sin escribir, filas malas señaladas
  sin frenar el resto, sin duplicar (ni contra la hoja ni dentro de lo
  pegado), catálogos nuevos propuestos, y reglas del horario con alumnos
  por nombre.
- `tests/buscador.test.js` — el buscador del autocompletado (sin tildes
  ni mayúsculas, por nombre/apellido/colegio, "ag" → Agustín primero) y el
  nombre que se ve de un bloque armado desde sus alumnos.
- `tests/vincular-horario.test.js` — `vincularAlumnosEnHorario()`:
  vincula por nombre y apellido sin tildes/mayúsculas, varios alumnos por
  regla, deja sin tocar (y registra) lo no encontrado o ambiguo, no toca
  otras áreas, reglas ya vinculadas ni otras columnas, y es idempotente.
- `tests/lugar.test.js` — el campo `lugar`: columnas al final en las tres
  hojas (y migración de una hoja vieja), guardar/editar en bloques,
  reglas y alumnos, el generador lo copia y lo refresca,
  `moverAulasALugar()` (solo Universidad, resto de la nota conservado, dos
  aulas = pendiente, idempotente) y el lugar habitual del alumno elegido.
- `tests/auditoria.test.js` — `auditarDatos()`: encuentra cada tipo de
  problema (repetidos, homónimos sin apellido, catálogo, tarifas,
  vínculos faltantes o de más, nombre en el título, bloques que no
  heredaron, huérfanos, `(vacío)`, bloques de prueba), cuenta las filas y
  **no escribe nada**.
- `tests/reparar.test.js` — `repararAlumnosFractal()` sobre una copia
  armada como los datos reales: la vista previa no escribe nada, id solo
  a alumnos con nombre, curso al del catálogo, reglas y bloques (pasados
  y futuros) vinculados, título vaciado solo si es exactamente el nombre,
  pendientes sin tocar, idempotencia; además los ids automáticos al leer
  alumnos (y que las vistas previas no los escriban), la migración que
  no crea un alumno ante un nombre ambiguo, y que el registro llegue a
  Logger ya armado (enteros, nunca "8.0").
- `tests/estados.test.js` — Checkpoint 8: estado de la clase (nuevo =
  programada, dictada, cancelada con motivo, volver), "movida" solo al
  mover, fecha/hora originales guardadas una vez, volver al original, una
  dictada movida sigue dictada, "Editar" no marca movida, el generador no
  toca una clase movida, y token.
- `tests/pagos.test.js` — hoja `Pagos`: alta, validaciones (alumno,
  periodo, monto, estado, fechas), pagado sin fecha = hoy, edición
  parcial, archivar sin borrar, token.
- `tests/historico.test.js` — importador de clases pasadas: vista previa
  sin escribir, bloques de Fractal "dictada", alumno nuevo creado una sola
  vez, sin duplicar, filas malas (ambiguo, futura, horas al revés, fecha
  mal escrita, sin alumno, repetida) sin frenar al resto.
- `tests/estadisticas.test.js` — **cálculo de montos** (tarifa por
  alumno, clase compartida, solo dictadas, sin tarifa, centavos),
  **estados** (qué suma y qué no, movida+dictada, textos de la ficha,
  "movida del jue 24 al sáb 26") y **rango de fechas** (extremos, área,
  periodo anterior cruzando mes/año, bisiesto), más el resumen mensual de
  Cobros.
- `tests/formas.test.js` — Checkpoint 9: duración por área, fin que se
  corrige solo, días de texto a botones y de vuelta, plantillas (qué se
  guarda de un bloque y cómo se arma uno nuevo desde una) y la hoja
  `Plantillas` (crear, listar, archivar, validaciones, token).
- `tests/pwa.test.js` — que el service worker guarde **cada** script,
  estilo e ícono que usan las páginas (si falta uno, esa pantalla no abre
  sin conexión), que todo lo listado exista, el manifest, y que cada
  página cargue el tema en el `<head>` y registre el service worker.
- `tests/contraste.test.js` — contraste WCAG AA de la paleta leída de
  `css/styles.css`, en claro y en oscuro: texto 4,5:1 (también sobre los
  diálogos y el botón principal), áreas y "ocupado" 3:1, y ninguna
  opacidad de texto por debajo de 0,75.
- `tests/lorenz.test.js` — Checkpoint 10: las ecuaciones de Lorenz,
  Runge-Kutta (paso grueso = pasos finos), que la trayectoria se quede en
  el atractor y recorra las dos alas, que cada carga arranque de un punto
  distinto y que la figura entre en pantalla. `tests/contraste.test.js`
  suma el sello de agua (el texto encima sigue en 4,5:1) y
  `tests/pwa.test.js` los archivos que usa el CSS (el símbolo).
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
`archivado`, `alumno_id`, `lugar`, `estado`, `fecha_original`,
`inicio_original`, `fin_original`, `motivo`.

- **Fecha y hora se guardan como TEXTO**, formato `YYYY-MM-DD` y `HH:mm`
  (ej. `2026-09-22`, `14:30`). Motivo: si se guardan como tipo Fecha/Hora,
  Google Sheets las autoconvierte según el locale y rompe el formato al leer
  desde Apps Script o al editar manualmente en la hoja. Guardarlas como texto
  evita esa conversión silenciosa.
- **Zona horaria:** `America/La_Paz` en dos lugares — configuración regional
  del Google Sheet (Archivo → Configuración) y configuración del proyecto de
  Apps Script (`appsscript.json` → `timeZone`). Debe coincidir en ambos o los
  cálculos de fecha/hora en Apps Script quedan desfasados.
- **Ordenada por `fecha` y `inicio`** (Checkpoint 6.5): `generarHorario`
  escribe la grilla ordenada (en memoria, sin llamadas extra), y
  `crearBloque`/`actualizarBloque` (si cambió fecha u hora) llaman a
  `ordenarHojaBloques()` — una sola operación de Sheets. Motivo: las
  lecturas (`leerFilasEntreFechas`) leen primero solo la columna `fecha` y
  después solo el tramo de filas entre la primera y la última fecha
  pedida; con la hoja ordenada ese tramo es exactamente la semana. **La
  corrección no depende del orden**: si la hoja se desordena a mano, el
  tramo es más largo (más lento) pero sigue incluyendo todo.
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

- **`alumno_id`** (Checkpoint 7): ids de la hoja `Alumnos` separados por
  coma (una clase puede tener varios alumnos). Va **al final** (columna
  13), agregada sola con `migrarColumnaAlFinal()` para no mover ninguna
  columna existente. Con alumnos, el `título` es opcional y guarda solo un
  tema ("Física"): **el nombre del alumno no vive en el título**, se arma
  desde el vínculo (ver "Alumnos").
- **`lugar`** (cierre del Checkpoint 7): dónde es la clase (en la UMSS, el
  aula: "Aula E511"). Texto libre, opcional, **al final** (columna 14),
  agregado con `migrarColumnaAlFinal()`.
- **Estado de la clase** (Checkpoint 8), columnas 15–19 al final:
  `estado` (`programada` | `dictada` | `movida` | `cancelada`; **vacío =
  programada**, así los bloques de antes no hubo que tocarlos),
  `fecha_original`/`inicio_original`/`fin_original` (dónde estaba antes de
  moverse) y `motivo` (solo si está cancelada, opcional, hasta 200
  letras). Reglas:
  - Un bloque nuevo (y un duplicado) empieza programado. Las clases
    pasadas **siguen programadas hasta que Gerardo las marque**: nada se
    marca dictado solo.
  - `movida` no se elige: la pone `moverBloque` (el botón "Mover" de la
    ficha) y guarda el original **una sola vez** (moverla otra vez no lo
    pisa). Si vuelve exactamente a su fecha y hora originales, deja de
    estar movida. Una dictada o cancelada que se mueve conserva su
    estado. Desmarcar una dictada que se había movido la deja `movida`.
  - "Editar" puede cambiar la fecha sin marcarla movida: es para
    corregir un error, no para reprogramar.
  - **El generador del horario no toca una clase movida** (igual que una
    archivada): si no, al regenerar la devolvería a su día original.
  - Cancelada no suma horas ni monto, y su horario queda libre: no lleva
    borde de superposición ni casilla "ocupado" en otras capas.

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
- **`alumno_id`** (Checkpoint 7): igual que en `Bloques`, al final
  (columna 12). El generador lo copia a cada bloque que crea y lo refresca
  en los que actualiza, igual que el título. Una fila sin título pero con
  alumnos es una regla válida.
- **`lugar`**: al final (columna 13). El generador lo copia a cada bloque y
  lo **refresca** en los futuros que actualiza, igual que título y hora: si
  cambia el aula en la regla, cambia en todas las clases futuras (un
  cambio puntual de aula en un solo bloque se pisa al regenerar).
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

**Cancelar una clase puntual** (un feriado, una clase que no fue): desde
el Checkpoint 8, "Cancelar clase" en la ficha (estado `cancelada`, con
motivo opcional); sigue visible, tachada, y cuenta en las estadísticas
como cancelada. Archivar queda para lo que no debería existir (un error,
una prueba). Nunca se edita `Horario` para eso — `Horario` son las reglas
generales, no el detalle de cada semana.

### Hoja `Alumnos` y catálogos `Cursos` / `Colegios` (Checkpoint 7)

`Alumnos`: `id`, `nombre`, `apellido`, `curso`, `colegio`, `tarifa_hora`,
`forma_calculo`, `forma_pago`, `notas`, `archivado`, `lugar`. Todo en
formato texto. `lugar` es el **lugar habitual** de sus clases (al final,
agregado después).

- **`id`**: `a` + 8 hexadecimales, lo pone el backend. **Un alumno
  cargado a mano en el Sheet sin id** (fila con nombre y `id` vacío)
  recibe uno la primera vez que el backend lee la hoja (`leerAlumnos()` →
  `asignarIdsFaltantes()`, solo escribe la columna `id`). Una fila sin
  nombre se ignora. Motivo: antes esas filas quedaban invisibles para la
  app y para toda vinculación (incidente de la auditoría, 2026-09-24).
  Las vistas previas (importar, migrar) ponen el id solo en memoria.
- **`curso` y `colegio` guardan el nombre COMPLETO** del catálogo; la app
  muestra el código corto ("Agustín Aliendre — 4to SA"). Al guardar se
  acepta cualquiera de los dos ("SA" o "Unidad Educativa San Agustín", sin
  importar tildes ni mayúsculas) y se guarda el completo.
- **`forma_calculo`** es siempre `hora` (cómo se calcula lo que se debe).
  **`forma_pago`** es `hora` o `mensual` (cuándo se cobra). Son cosas
  distintas: un alumno puede calcularse por hora y pagar por mes.
- **La tarifa es por alumno, nunca por grupo:** si dos hermanas comparten
  una clase, el bloque tiene los dos ids y cada una suma su propia tarifa.
- **Duplicados:** no puede haber dos alumnos con el mismo nombre y
  apellido (sin tildes/mayúsculas). **Archivar, nunca borrar.**

### Hoja `Pagos` (Checkpoint 8)

`id` (`p` + 8 hexadecimales), `alumno_id` (uno solo), `desde`, `hasta`
(el periodo que se cobra), `monto`, `fecha_pago`, `estado` (`pendiente` |
`pagado`), `notas`, `creado`, `archivado`. Todo en texto.

- **El monto se guarda fijo.** La app lo propone (horas dictadas del
  periodo × tarifa del alumno) y se puede corregir antes de guardar; si
  después cambia la tarifa, un pago ya registrado no cambia.
- Marcar `pagado` sin fecha de pago pone la de hoy.
- Archivar, nunca borrar (un pago archivado deja de contar).

### Hoja `Plantillas` (Checkpoint 9)

`id` (`t` + 8 hexadecimales), `nombre`, `area`, `tipo`, `titulo`,
`alumno_id`, `duracion` (minutos, 5–720), `lugar`, `etiqueta`, `creado`,
`archivado`. Lo que se repite de un bloque, **nunca la fecha ni la hora**.
Fuera de Academia Fractal no guarda alumnos. Vive en el Sheet (no solo en
el celular) para no perderla al cambiar de dispositivo; en el dispositivo
queda una copia de lectura (`kodama.cache.plantillas`). Archivar, nunca
borrar.

`Cursos` y `Colegios`: columnas `nombre`, `corto`. Se crean con valores
iniciales (secundaria 1ro–6to y universidad 1er–5to año; San Agustín = SA,
Colegio Poveda = Poveda, UCB) y se editan desde la pantalla de Alumnos. Si
cambia el nombre completo, `guardarCatalogo` lo cambia también en todos
los alumnos que lo tenían.

## Alumnos en la app (Checkpoint 7)

- **Pantalla `alumnos.html`** (`js/alumnos-pagina.js`): lista con
  buscador, "Mostrar archivados", crear/editar/archivar, y los catálogos
  de cursos y colegios.
- **`js/alumnos.js` (`KodamaAlumnos`)**: el directorio (alumnos +
  catálogos, una sola llamada `listarAlumnos`, guardado en el dispositivo
  y refrescado por detrás), el buscador y `tituloDeBloque()`: con alumnos,
  el nombre que se ve es "Agustín Aliendre — 4to SA" (uno) o "Camila
  Aliendre, Lucía Aliendre" (varios), más " · tema" si hay título. La
  grilla y la ficha usan ese nombre (`tituloMostrado`, armado en copias
  por `app.js`, nunca guardado).
- **Buscador:** cada palabra escrita tiene que aparecer en nombre,
  apellido o colegio (nombre completo o código), sin tildes ni
  mayúsculas; primero los que tienen una palabra que *empieza* con lo
  escrito ("ag" → Agustín), después los que solo la contienen. Los
  archivados no se sugieren.
- **Campo de alumnos** (`js/ui/selector-alumnos.js`), en el formulario de
  bloques y en el de reglas, solo cuando el área es Academia Fractal (el
  título pasa a "Tema (opcional)"): sugerencias mientras se escribe
  (flechas/Enter/Escape o tocando), varios alumnos por clase, y "+ Crear
  alumno" abre un mini formulario **dentro del mismo diálogo**. Si el
  área cambia a otra, la clase se guarda sin alumnos.
- **Importador** (Configuración, `js/importar.js` + `Importar.gs`): se
  pegan filas separadas por tabulación (copiadas de una tabla o un Sheet),
  modo Alumnos o Reglas del horario. Si la primera fila tiene nombres de
  columna conocidos, se usan (cualquier orden); si no, orden por defecto.
  Siempre **vista previa** (crear / actualizar / sin cambios / error, cada
  una con su motivo) y después "Importar N filas". Una fila mala no frena
  al resto. Duplicados por nombre+apellido: actualiza solo los campos que
  vienen con algo, nunca duplica; repetidos dentro de lo pegado se marcan.
  Un curso o colegio desconocido se propone para el catálogo (código corto
  = el mismo texto, editable). En reglas, los alumnos van por nombre y
  tienen que existir; fechas `dd/mm/aaaa` y horas `9:00` se aceptan. Los
  datos van solo al Sheet, nunca al repo.
- **Migración de lo existente** (Configuración → "Vincular alumnos en
  clases de Fractal", acción `migrarAlumnosFractal`): busca bloques y
  reglas de Fractal sin `alumno_id` con el nombre en el título, saca los
  nombres (`extraerNombresDeTitulo`: quita "Clase con/de…", separa por
  coma/"y"/"/", "Camila y Lucía Aliendre" comparten apellido, lo que va
  después de " - " queda como tema), reusa alumnos existentes, crea los
  que falten una sola vez, y vincula. Vista previa con casillas: solo se
  aplica a las filas marcadas. Lo único que se descarta del título es el
  prefijo ("Clase con").
- **Lugar** (cierre del Checkpoint 7): campo "Lugar" en el formulario de
  bloques y en el de reglas, y "Lugar habitual" en el de alumnos (y en el
  alta rápida desde el selector). En un bloque o regla **nuevos**, al
  elegir alumnos el lugar se completa con el lugar habitual del primero
  que tenga uno (`KodamaAlumnos.lugarDeAlumnos`), mientras no lo hayas
  escrito vos: si lo tocás, manda lo tuyo. Al **editar** nunca se completa
  solo. En la grilla (día y semana de escritorio) va junto al horario,
  "06:45–08:15 · Aula E511"; sin lugar no se muestra nada (ni un
  separador). En la semana compacta del celular no se ve (tampoco la
  hora). En la ficha, fila "Lugar" (oculta si está vacío) y las notas
  completas.
- **Función manual `moverAulasALugar()`** (`apps-script/Setup.gs`, desde el
  editor): en las reglas de `Horario` de **Universidad** con `lugar` vacío,
  mueve el aula que está en `notas` ("Aula E511") a `lugar`; si las notas
  tenían algo más, ese resto queda en notas. Dos aulas en las mismas notas
  → la fila queda sin tocar y se registra. Solo escribe `notas` y `lugar`.
  Después, "Regenerar horario" lleva el aula a los bloques ya generados.
- **Auditoría `auditarDatos()`** (`apps-script/Auditoria.gs`, desde el
  editor): **solo lectura**. Revisa Alumnos (repetidos, homónimos sin
  apellido, curso/colegio fuera del catálogo, tarifa y forma de pago),
  Horario y Bloques (Fractal sin alumnos, otras áreas con alumnos, ids de
  alumno inexistentes, título que nombra más alumnos que los vinculados,
  nombre todavía en el título), series (huérfanas, `(vacío)`, bloques
  generados que no heredaron los alumnos de su regla, separando pasados y
  futuros) y bloques de prueba (ids raros, títulos de ejemplo de la
  documentación). Escribe en el Logger cada problema con cuántas filas
  afecta, ejemplos con número de fila y una propuesta. Motivo de que sea
  una función del editor: Claude no tiene acceso al Sheet real (ni el ID
  ni el token), así que la auditoría la corre Gerardo y comparte el
  registro.
- **Función manual `vincularAlumnosEnHorario()`** (`apps-script/Setup.gs`,
  se ejecuta desde el editor de Apps Script): solo para las **reglas** de
  `Horario` de Fractal con `alumno_id` vacío. Lee los nombres del título
  (misma `extraerNombresDeTitulo`) y los busca en `Alumnos` por nombre y
  apellido sin tildes/mayúsculas (solo nombre: vale si hay uno solo con
  ese nombre). Varios nombres → vincula a todos. Si alguno no aparece o es
  ambiguo, la fila queda **sin tocar** y se anota como pendiente. A
  diferencia de la migración de Configuración, **no crea alumnos ni cambia
  títulos**: solo escribe la columna `alumno_id`. El resultado (vinculadas
  y pendientes con su motivo) queda en el registro de ejecución. Después
  hay que tocar "Regenerar horario" para que los bloques ya generados
  hereden los alumnos.
- **Reparación `repararAlumnosFractal()`** (`apps-script/Setup.gs`, desde
  el editor): **vista previa, no escribe nada**; la que escribe es
  `repararAlumnosFractalAplicar()` (el editor no deja pasar argumentos,
  por eso son dos funciones y la sin sufijo es la segura). Arregla lo que
  encontró la auditoría: id a los alumnos con nombre y sin id; curso
  escrito distinto al del catálogo ("3ero de secundaria" → "3ro de
  secundaria", solo si hay exactamente uno parecido); reglas de Fractal
  sin alumnos, por el título; y bloques de Fractal sin alumnos, **pasados
  y futuros** (los de una regla copian los alumnos de su regla, los
  sueltos van por el título). El título se vacía **solo si es exactamente
  el nombre** de los vinculados ("Katy", "Camila y Adriana"); si tiene
  algo más ("Clase con Katy", "… - Física") queda tal cual y se anota.
  Solo escribe `id`/`curso` en Alumnos y `título`/`alumno_id` en Horario y
  Bloques; no toca archivados ni otras áreas; nombre ambiguo o que no
  está → pendiente, sin tocar. Es idempotente.
- **Registro legible:** las funciones del editor escriben con
  `registrar()` (Setup.gs), que arma el texto antes de `Logger.log`.
  Motivo: `Logger.log('%s', 8)` imprime "8.0".
- **Migración y nombres ambiguos:** si el título trae solo un nombre que
  tienen varios alumnos ("Santiago" con Santiago Aliendre y Santiago
  Méndez), la migración de Configuración ya no crea un alumno nuevo: la
  fila queda "sin resolver", con el motivo a la vista y sin casilla.

## Estado de clases, cobros y estadísticas (Checkpoint 8)

- **Ficha** (`js/ui/ficha.js`): muestra el estado ("✓ Dictada", "✕
  Cancelada · feriado", "↷ Movida") y, si se movió, "Movida del jue 24 al
  sáb 26" (o "Movida de 15:00 a 17:00 (jue 24)" si solo cambió la hora;
  `KodamaClases.textoMovida`). **"Marcar dictada" es un solo toque**: guarda
  y cierra la ficha. "Cancelar clase" abre un campo de motivo opcional y
  "Confirmar cancelación". Una dictada o cancelada muestra un solo botón
  para deshacerlo ("Desmarcar dictada" / "Reactivar clase").
- **Grilla**: una dictada lleva "✓" antes del título; una cancelada se ve
  tenue y tachada. Programada y movida se ven igual que siempre.
- **Cálculo** (`js/estadisticas.js`, lógica pura con pruebas): solo las
  **dictadas** suman clases, horas y monto. **Monto = horas dictadas ×
  `tarifa_hora` de cada alumno**: una clase compartida es 1 clase en los
  totales pero suma la tarifa de cada alumno. Sin tarifa → suma horas,
  no monto, y se avisa. Movidas = se movieron alguna vez y no se
  cancelaron (una movida que después se dictó cuenta en las dos).
  **Horas por área** cuenta todas las clases no canceladas (el tiempo que
  ocupó cada área), porque Universidad o Startup no se marcan dictadas.
  El monto usa la tarifa **actual** del alumno: para un periodo viejo,
  lo que manda es lo guardado en `Pagos`.
- **Estadísticas** (`estadisticas.html`): desde/hasta libres (por
  defecto, el mes en curso) y área. Totales (clases dictadas, horas,
  monto, movidas, canceladas) contra el **periodo anterior del mismo
  largo, justo antes** (1–30 sep → 2–31 ago); tabla por alumno; dos
  gráficas de barras en SVG propio (`js/ui/graficas.js`): horas dictadas
  por alumno y horas por área. Una sola llamada (`listarBloquesRango` del
  periodo anterior al actual); cambiar el área no pide nada. Nada de
  indicadores que Gerardo no pidió.
- **Gráficas**: barras finas que crecen desde una línea base, valor en la
  punta, nombre escrito al lado (el color nunca es lo único que dice qué
  es), nombre completo y valor al tocar (`<title>`). Colores de área de
  la paleta; los alumnos, todos del color de Fractal.
- **Cobros** (`cobros.html`, `js/cobros.js`): elegir el mes; "Pago
  mensual" lista a los alumnos con `forma_pago` mensual con lo acumulado
  en el mes y su situación (pagado / pendiente / sin registrar, según los
  pagos no archivados cuyo periodo se cruza con el mes). "Registrar pago"
  abre el formulario con el mes y el monto calculado; "Calcular"
  recalcula para cualquier periodo. "Pagos del mes" lista todos los pagos
  del mes (de cualquier alumno) para editar o archivar.
- **Importar histórico** (Configuración → importador, modo "Clases
  pasadas ya dictadas", `importarHistorico` en Importar.gs): columnas
  alumno (varios con coma), fecha, inicio, fin y opcionales tema, lugar,
  notas. Crea bloques de Fractal con estado `dictada` (id `b…`, el
  generador nunca los toca). Un alumno que no existe se crea (nombre =
  primera palabra, apellido = el resto) una sola vez; un nombre sin
  apellido que tienen varios alumnos es un error de la fila, nunca un
  alumno nuevo. Solo fechas de hoy o anteriores. La misma clase (mismos
  alumnos, fecha e inicio) no se duplica.

## Formularios prácticos, tema y PWA (Checkpoint 9)

- **Duración y fin** (`js/formas.js`, lógica pura; `js/ui/horas.js` la
  conecta a los campos, en bloques y en reglas): al elegir el inicio, el
  fin se completa con la duración — 90 min en **clases** (Universidad y
  Academia Fractal), 60 en el resto. Si cambiaste el fin a mano (o al
  editar un bloque), se conserva **tu** duración. Un fin antes o igual al
  inicio se corrige solo y lo avisa ("lo cambié a 16:30"); guardar nunca
  manda un horario invertido. Nada cruza la medianoche (tope 23:59).
- **Valores por área** (en un bloque o regla nuevos, mientras no los
  toques): Universidad y Fractal → tipo `fijo`, 90 min; Startup y
  Personal → `variable`, 60 min.
- **Días de la semana** en las reglas: 7 botones Lun–Dom
  (`js/ui/dias.js`); marcado = relleno + línea gruesa abajo (no solo
  color). En la hoja sigue siendo el texto "Lun, Mié".
- **Fecha**: botones "Hoy" y "Mañana" junto al selector (también al mover
  y al duplicar).
- **Duplicar** (ficha): solo pide la fecha nueva (vacía a propósito, para
  no duplicar sin querer el mismo día); todo lo demás, hora incluida, se
  copia. Modo `duplicar` del formulario: oculta `.oculto-al-mover` y
  `.oculto-al-duplicar`.
- **Plantillas** (`js/plantillas.js`): "Guardar como plantilla" en la
  ficha (pide solo el nombre). Al tocar "+", arriba del formulario
  aparecen las plantillas; un toque llena área, tipo, tema, alumnos,
  lugar, etiqueta y el fin según su duración, con la fecha y el inicio
  que ya estaban. ✕ al lado la archiva (con confirmación).
- **Tema** (`js/tema.js`, en el `<head>` de cada página para que no haya
  destello): botón "☾ Oscuro / ☀ Claro" en el encabezado de todas las
  pantallas. Sin elegir, sigue al sistema; lo elegido se recuerda en el
  dispositivo (`kodama.tema`). Tokens `--acento-fondo/--acento-texto`
  (botón principal: marino en claro, **hueso en oscuro**, porque un botón
  marino casi no se ve sobre el fondo marino oscuro), `--fondo-dialogo` y `color-scheme` para que los
  controles nativos (fecha, hora, listas) también se vean oscuros. La
  mascota usa `--fg`/`--bg`, así se invierte con el tema.
- **Contraste**: verificado de dos formas. `tests/contraste.test.js` sobre
  los tokens, y una auditoría en Chromium que mide el contraste real de
  cada texto visible (con sus opacidades y fondos) en las 6 pantallas, la
  ficha y el formulario, en claro y en oscuro: todo ≥ 4,5:1. Para
  lograrlo: ninguna opacidad de texto < 0,75 (con 0,7 no llega en claro)
  y el rojo de reunión en oscuro pasó de `#CB5E4D` a `#D86C5A` (sobre los
  diálogos daba 4,1:1).
- **PWA**: `manifest.webmanifest` (standalone, colores de la paleta,
  íconos 192/512/maskable en `icons/`, dibujados en SVG propio —
  `icons/icono.svg`— y pasados a PNG una vez con el Chromium de las
  pruebas; no es una dependencia de la app). `sw.js` guarda todos los
  archivos de la app y responde **primero con lo guardado y actualiza por
  detrás**: abre al instante y sin conexión; una versión nueva se ve al
  abrir la app por segunda vez después del despliegue. Los datos no pasan
  por el service worker (son POST a otro dominio): offline se ve lo último
  cargado (caché por semana, alumnos, plantillas) con "Sin conexión".
  `VERSION` en `sw.js` solo cambia si cambia la lista de archivos;
  `tests/pwa.test.js` avisa si una página usa un archivo que no está.

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
- `cambiarEstadoBloque` — `id`, `estado` (`programada` | `dictada` |
  `cancelada`; `movida` no se elige) y `motivo` opcional (solo cuenta si
  es `cancelada`). Devuelve el bloque.
- `moverBloque` — `id`, `fecha`, `inicio`, `fin`. Guarda el original la
  primera vez y marca `movida` (ver "Estado de la clase"). Devuelve el
  bloque.
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
- `listarAlumnos` — sin parámetros. Devuelve `{ alumnos, cursos,
  colegios }` en una sola llamada (alumnos archivados incluidos).
- `crearAlumno` — parámetro `alumno` (`nombre`, `apellido`, `curso`,
  `colegio`, `tarifa_hora`, `forma_pago`, `notas`). Valida y rechaza
  duplicados por nombre+apellido.
- `actualizarAlumno` — `id` y `cambios` (solo los campos que vienen).
- `archivarAlumno` — `id`. Nunca borra.
- `guardarCatalogo` — `tipo` (`cursos`/`colegios`), `item: { nombre,
  corto }` y opcional `anterior` (nombre completo actual, para editar).
- `importar` — `modo` (`alumnos`/`horario`), `texto` (filas con
  tabulaciones) y `aplicar` (`false` = vista previa). Devuelve `{ resumen,
  filas: [{ numero, estado, detalle }], catalogosNuevos }`.
- `migrarAlumnosFractal` — `aplicar` y opcional `ids` (filas elegidas).
  Devuelve `{ alumnosNuevos, filas, sinResolver }`.
- `importar` con `modo: 'historico'` — clases pasadas ya dictadas (ver
  "Importar histórico"). Devuelve además `alumnosNuevos`.
- `listarPagos` — todos los pagos (archivados incluidos).
- `crearPago` — `pago: { alumno_id, desde, hasta, monto, fecha_pago,
  estado, notas }`. Valida todo y falla sin escribir.
- `actualizarPago` — `id` y `cambios` (solo los campos que vienen).
- `archivarPago` — `id`. Nunca borra.
- `listarPlantillas` — las plantillas activas (sin archivadas).
- `crearPlantilla` — `plantilla: { nombre, area, tipo, titulo, alumno_id,
  duracion, lugar, etiqueta }`. Valida y falla sin escribir.
- `archivarPlantilla` — `id`. Nunca borra.
- `crearBloque`/`actualizarBloque` y `crearRegla`/`actualizarRegla`
  aceptan además `alumno_id` (ids separados por coma); con alumnos, el
  título es opcional. Un id que no existe falla con `alumno_no_encontrado`.
  También aceptan `lugar` (texto libre), igual que `crearAlumno`/
  `actualizarAlumno` (lugar habitual). El importador reconoce las columnas
  `lugar`/`aula` (reglas) y `lugar`/`lugar habitual` (alumnos).

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

Solo para **lectura**: lo último guardado se muestra **al instante** al
abrir la app o cambiar de semana, y se actualiza por detrás (indicador
discreto "actualizando" junto a la fecha). Si la actualización falla, queda
lo guardado con el aviso "Sin conexión".

- Se guarda **por semana** (`kodama.cache.semana.<lunes>`), siempre la
  semana completa: tanto la vista de día como la de semana piden la semana
  entera en una sola llamada (`listarBloquesRango`), así cambiar de día
  dentro de la semana o pasar de Día a Semana no pide nada.
- Como mucho 12 semanas guardadas; las más viejas se borran. Las cachés de
  versiones anteriores (`kodama.cache.bloques.*`, `kodama.cache.rango.*`) se
  borran al abrir la app.
- Al guardar, mover, duplicar o archivar, el cambio se aplica **en la
  lista local primero** (se ve al instante) y después se vuelve a pedir la
  semana para confirmar. Cada carga lleva un número; una respuesta vieja
  que llega tarde se descarta.

Crear o editar un bloque **requiere conexión** — si falla el
POST, se muestra error y no se guarda nada localmente. No hay cola offline
ni sincronización diferida en el MVP: se agrega complejidad (conflictos,
reintentos) que no se justifica para un uso personal.

## Escritura desde la app (Checkpoint 5)

Desde el Checkpoint 5 **no hace falta abrir el Sheet para nada de uso
diario**. La hoja sigue siendo la base de datos, pero se escribe por la API.

- **Un solo botón `+`**, siempre visible, para crear cualquier bloque; el
  tipo (fijo, variable, reunión) se elige adentro. Hasta el Checkpoint 6.5
  había además un botón "Reunión" con un formulario reducido; se quitó por
  redundante. Tocar un bloque abre su **ficha** (ver abajo).
  `js/ui/formulario.js` es un solo diálogo con dos modos: completo (crear,
  editar, duplicar) y mover (oculta `.oculto-al-mover`: quedan solo fecha y
  hora). El modo oculta campos por CSS en vez de duplicar el formulario.
- **Ficha de bloque** (`js/ui/ficha.js`, Checkpoint 6.5): solo lectura —
  tipo y área (con el ícono), título, fecha y horario, etiqueta y notas
  (las vacías no se muestran) — con **Editar** (formulario completo),
  **Mover** (solo fecha y hora), **Duplicar** (desde el Checkpoint 9 solo
  pide la fecha nueva; el duplicado es un bloque suelto con id `b…`, así
  que el generador nunca lo toca aunque venga de una clase fija),
  **Guardar como plantilla** y **Archivar**.
  Tocar fuera de la ficha la cierra.
- **La app nunca cambia de página sola.** Antes, sin URL/token guardados,
  `index.html` y `horario.html` saltaban a `config.html`; ahora muestran
  "Falta configurar la conexión" con un enlace. Motivo: Gerardo reportó que
  tocar un bloque lo mandaba a Configuración. No se pudo reproducir en
  Chromium (se tocaron todos los bloques, día y semana, sin ningún salto);
  la única navegación automática del código era esa redirección al cargar,
  así que se eliminó.
- **Editor de horario** (`horario.html` + `js/horario.js`): lista de reglas,
  crear/editar/archivar, y botón "Regenerar horario".
- **Valores por defecto**: fecha = el día que se está viendo; inicio = la
  próxima media hora en `America/La_Paz`; área = la capa activa, o
  Universidad si la capa es General; tipo y fin según el área (ver
  "Formularios prácticos").
- **Celular primero**: `type="date"` y `type="time"` para que salga el
  selector nativo, `type="text"` y `<textarea>` en título y notas para que
  funcione el dictado por voz del teclado, y `font-size: max(1rem, 16px)` en
  los campos del diálogo porque iOS hace zoom automático con menos de 16px.
- **Escribir requiere conexión** (igual que dice "Caché local"): si el POST
  falla, **el diálogo queda abierto con todo lo escrito** y muestra el error
  del backend. Nunca se cierra ni se limpia un formulario que no se guardó.

## Vista de semana (Checkpoint 6) y de día

**La vista de día usa la misma grilla horaria que la semana**, con una sola
columna (`KodamaDia.render` → `KodamaSemana.render` con `unDia: true`):
cada bloque en su hora y con alto proporcional a su duración, las mismas
casillas "ocupado", el mismo colapso de huecos en el celular y el mismo
borde de superposición. Diferencias: no tiene encabezado de día (la fecha
ya está arriba), usa la escala normal también en el celular (una columna
ancha tiene lugar para el texto) y cada bloque muestra horario · área ·
etiqueta. Si el día no tiene ningún bloque, se ve el estado vacío con la
mascota. Antes (hasta el Checkpoint 6.5) el día era una lista de tarjetas
apiladas, sin eje de horas.

`index.html` tiene dos modos, **Día** y **Semana** (`js/vista.js`). La
elección se guarda en `localStorage` (`kodama.vista`); si nunca se eligió,
una pantalla de 900px o más arranca en semana y el celular en día.

- **Navegación:** `‹` / `›` mueven 1 día en modo día y 7 días en modo
  semana; "Hoy" vuelve a la fecha actual. La semana va de lunes a domingo.
- **Rango de días elegible** (selector "Días del … al …", solo en modo
  semana): por defecto lunes a domingo; se puede elegir, por ejemplo, solo
  jueves a sábado y la grilla muestra esas columnas (`--dias` en CSS). Es
  un rango de días **de la semana** (índices 0–6 en `KodamaVista`), así
  que `‹`/`›` siguen moviendo de a 7 días y muestran jueves a sábado de la
  otra semana. "Hoy" vuelve a lunes–domingo. No se guarda en el
  dispositivo: al abrir la app siempre es la semana completa. Elegir días
  no pide nada al Web App (la semana entera ya está en memoria).
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
- **Celular en modo semana — semana compacta** (Checkpoint 6.5, `@media
  (max-width: 699px)`): los 7 días entran en el ancho de la pantalla, sin
  desplazamiento lateral. Horas más bajas (`--escala-semana` menor), columna
  de horas angosta (solo "07", sin ":00"), encabezados "lun / 22" en dos
  líneas, bloques con fondo del color del área (tenue, con `color-mix`),
  borde e ícono de tipo, y el título sin el horario. El título completo
  está en la ficha. En pantallas de 700px o más la semana queda igual que
  en el Checkpoint 6.
- **Texto que no entra (celular, día y semana):** se recorta en una línea
  con puntos suspensivos (`text-overflow: ellipsis`), nunca se parte letra
  por letra. (Se probó cortar en sílabas con `hyphens`, pero depende del
  diccionario del navegador y en columnas angostas igual partía letras.)
- **Huecos colapsados (solo celular, `max-width: 699px`, en día y en
  semana):** si una franja está vacía en **todos** los días visibles y dura **más de 2 horas**, se
  colapsa en una línea fina ("3 h libres · 12:00–15:00") que se toca para
  expandirla. Se colapsa el hueco menos 30 min a cada lado, para que un
  bloque corto pegado al hueco nunca quede tapado. La posición vertical la
  calcula `crearEscala()` en JS: fuera de los huecos cada minuto mide lo
  mismo (una clase de 1 h mide la mitad que una de 2 h) y cada hueco
  colapsado mide un alto fijo. Por eso las líneas de hora son elementos y
  no un fondo repetido. Un hueco expandido sigue expandido mientras la app
  esté abierta. En escritorio no se colapsa nada.
- Tocar un bloque abre su ficha (ver "Escritura desde la app"). Un bloque
  nuevo desde la semana toma hoy si hoy está entre los días visibles; si
  no, el primero visible.

## Capas (vista de día y de semana)

Selector en la vista de día y de semana (`js/capas.js`): **General**, Universidad,
Academia Fractal, Startup, Personal. Filtra client-side sobre los bloques
que ya trajo `listarBloquesDia` o `listarBloquesRango` — no pega otra vez al Web App, así que
cambiar de capa es instantáneo. `General` muestra todo, sin filtrar. La
capa elegida se guarda en `localStorage` (dispositivo), no en el Sheet.

**Bloques de otras áreas → "ocupado"**: en una capa filtrada, cada bloque
de otra área se dibuja como una casilla **en la misma posición y del mismo
tamaño** que el bloque real (el reparto lado a lado se calcula con todos los
bloques del día, igual que en General), que dice "ocupado" y su horario:
se ve **cuándo** está ocupado, nunca **qué** es (sin título, área ni
etiqueta), y no se puede tocar. Se ve con rayado
diagonal tenue (`--ocupado-raya`) y una barra vertical saturada
(`--ocupado-barra`, gris azulado para no confundirse con ningún color de
área) en claro y en oscuro. En `General` no hay casillas "ocupado". La
franja horaria de la semana se calcula con todos los bloques, así la
grilla no salta al cambiar de capa.

**Superposición: sin avisos, solo un borde.** Si dos bloques de la capa que
se está viendo (en General, cualquiera) se pisan de verdad —uno empieza
antes de que el otro termine; tocarse no cuenta—, los dos llevan un borde
con el color de reunión (`--tipo-reunion`, `#9D3D2E`) arriba, a la derecha
y abajo; a la izquierda sigue la barra del área. `KodamaDia.idsSolapados()`
decide cuáles, en día y en semana. No hay texto, ícono ni alerta. Los
bloques que se pisan se siguen dibujando lado a lado (`distribuir()` en
`js/ui/semana.js`, igual en día y en semana).

## Paleta y tema

Desde el Checkpoint 10 **predomina el azul marino del logo de Academia
Fractal** (antes era verde bosque `#16372B`).

| Uso | Claro | Oscuro |
|---|---|---|
| Marino (marca, `--marino`) — texto y acentos en claro | `#071743` | — |
| Hueso (marca, `--bone`) — fondo en claro, texto en oscuro | `#F5F1E8` | `#F5F1E8` |
| Fondo | `#F5F1E8` | `#070F28` (marino muy oscuro) |
| Fondo de diálogos | `#F5F1E8` | `#101A3A` |
| Universidad | `#245A8D` | `#5A9BE0` |
| Academia Fractal | `#8A5A00` | `#C98A1E` |
| Startup | `#6650A4` | `#9A88D0` |
| Personal | `#476A54` | `#6FA383` |
| Reunión (tipo, no área) | `#9D3D2E` | `#E07A68` |

El marino `#071743` se **midió** en el núcleo de los trazos del logo (los
bordes de las líneas son más claros por el suavizado). En oscuro, cada área
es el mismo tono más luminoso: todas pasan 5,5:1 sobre el fondo y sobre los
diálogos. Texto marino sobre hueso da 15,4:1; hueso sobre el fondo oscuro,
16,8:1.

Todo color de área/tipo debe combinarse con un **ícono o borde**, nunca ser
el único indicador (accesibilidad para daltonismo). Verificar contraste
texto/fondo con WCAG AA (mínimo 4.5:1 para texto normal) en ambos temas,
claro y oscuro.

## Dirección visual

Se aplica **desde el Checkpoint 3 en adelante** (el esqueleto del
Checkpoint 1 es intencionalmente básico).

- **Identidad (Checkpoint 10):** azul marino y el **atractor de Lorenz**
  del logo de Academia Fractal. Sobria, precisa, con el orden dentro del
  caos como idea. Esquinas redondeadas y tipografía, como estaban. Nada de
  componentes genéricos de "dashboard". (Hasta el Checkpoint 9 era de
  bosque, verde; el espíritu del bosque sigue solo en el estado vacío.)
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

**Símbolo e íconos (Checkpoint 10):** el logo que subió Gerardo está en
`academia-fractal-logo.png` (raíz). Se usa **solo el símbolo** (la
circunferencia abierta, el atractor, la línea y los puntos), sin las
palabras. Se vectorizó **midiendo** el PNG en Chromium, no a ojo: círculo
ajustado por mínimos cuadrados (centro, radio, dónde se abre), puntos y
línea por sus centroides, y los 4 lazos del ala izquierda siguiendo la
"cresta" oscura de cada trazo píxel a píxel. El ala derecha corre pegada a
la línea diagonal y no se puede seguir así: se armó con una transformación
(afín, por lazo, con el punto central fijo) del ala izquierda, ajustada a
los tramos que sí se leen (error mediano 1–2 px sobre 1254 px). Los trazos
llegan al punto central afinándose, como en el logo.
- `icons/simbolo.svg` — completo (sello de agua).
- `icons/simbolo-chico.svg` — **simplificado para 48 px o menos**: un lazo
  por ala y trazos 4–6 veces más gruesos (las curvas finas desaparecen).
  Es la marca del encabezado y el favicon.
- `icons/icono.svg` (favicon), `icono-grande.svg` (192/512 e iPhone) e
  `icono-maskable.svg` (con margen para la zona segura de Android): **en
  todos los tamaños, el símbolo simplificado** (el mismo de la marca del
  encabezado), trazo hueso sobre **marino sólido**, sin esquinas
  redondeadas (las pone el sistema). Motivo: con el símbolo completo, las
  curvas finas se veían borrosas en la pantalla de inicio. Los PNG
  (`favicon-16/32`, `icono-48/192/512`, `icono-maskable-512`,
  `apple-touch-icon`) salen de esos SVG con el Chromium de las pruebas. El
  símbolo completo queda solo para el sello de agua.
- **Marca del encabezado** (`.marca`) y **sello de agua** (`.sello`): el SVG
  como **máscara CSS** pintada con `--fg`, así cambian solos con el tema.
  El sello es fijo, grande (92 % del lado corto, hasta 44rem), `z-index:
  -1` (detrás de todo; los bloques tienen fondo opaco y lo tapan) y muy
  tenue (`--sello-opacidad`: 4,5 % claro, 6 % oscuro).

**Pantalla de carga (Checkpoint 10):** `js/lorenz.js` (las ecuaciones,
Runge-Kutta 4, lógica pura con pruebas) + `js/ui/carga.js` (canvas). El
atractor se dibuja en tiempo real desde un **punto inicial al azar** (cada
carga es distinta); tres esferas recorren la trayectoria ya dibujada a
distinta velocidad, con estela. Con `prefers-reduced-motion` se dibuja la
figura completa, quieta. **No demora la app**: cada pantalla llama a
`KodamaCarga.listo()` apenas tiene algo que mostrar (con la semana ya
guardada, enseguida: ~0,4 s con la red tardando 2,5 s en la prueba) y se
desvanece en 250 ms; si algo falla, se va sola a los 8 s. Está en todas
las pantallas con datos (no en Configuración).

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
elementos gráficos) sobre un fondo oscuro. `css/styles.css` define
variantes más claras (mismo matiz, más luminosidad) solo bajo
`[data-theme="dark"]`; desde el Checkpoint 10, sobre el marino oscuro
`#070F28`, todas por encima de 5,5:1 (ver la tabla de la paleta). En modo claro se usan los valores de la paleta sin cambios (ya dan
5.2–6.4:1 sobre `bone`). Desde el Checkpoint 9 el modo oscuro se activa
con el botón de tema de cada pantalla (ver "Formularios prácticos, tema y
PWA").

## Alcance del MVP

1. Hojas `Areas` y `Bloques` (ver modelo de datos).
2. Vista de día (celular) y de semana (escritorio), color por área + ícono/
   borde por tipo.
3. Crear cualquier bloque (incluida una reunión) desde el `+`, siempre
   visible en día y en semana; el tipo se elige en el formulario.
4. Horario fijo del semestre generado desde la hoja `Horario` (filas
   individuales, sin recurrencia).
5. Editar y archivar bloques (nunca borrar).
6. Tema claro/oscuro con la paleta de arriba, contraste WCAG AA
   (Checkpoint 9, con PWA instalable).

7. Alumnos de Academia Fractal (Checkpoint 7): ficha de cada alumno,
   vínculo con clases e importador.

8. Estado de cada clase, pagos y estadísticas (Checkpoint 8).

**Fuera de alcance por ahora:** kanban, buscador global, drag & drop,
notificaciones, cola offline.

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
├── config.html             # URL del Web App + token, prueba de conexión, importador
├── alumnos.html            # alumnos de Fractal + catálogos de cursos y colegios
├── cobros.html             # pago mensual y pagos registrados (Checkpoint 8)
├── estadisticas.html       # totales, por alumno y gráficas (Checkpoint 8)
├── manifest.webmanifest    # PWA: nombre, colores, íconos
├── sw.js                   # service worker: la app abre sin conexión
├── css/
│   └── styles.css
├── js/
│   ├── app.js               # bootstrap de index.html (vista de día)
│   ├── api.js                # fetch al Web App (POST text/plain)
│   ├── config.js              # lógica de config.html
│   ├── horario.js              # lógica de horario.html (editor de reglas)
│   ├── state.js               # semana por llamada + caché local (lectura)
│   ├── fecha.js                # fecha "hoy" y formato legible en America/La_Paz
│   ├── capas.js                 # selector de capa (día y semana): leer/guardar/filtrar
│   ├── vista.js                 # modo día/semana, recordado en el dispositivo
│   ├── alumnos.js               # directorio de alumnos, buscador, nombre visible de un bloque
│   ├── alumnos-pagina.js        # lógica de alumnos.html
│   ├── importar.js              # importador y vinculación (en config.html)
│   ├── clases.js                # estado de una clase y "movida del … al …"
│   ├── estadisticas.js          # cálculo de horas, montos y periodo anterior (lógica pura)
│   ├── estadisticas-pagina.js   # lógica de estadisticas.html
│   ├── cobros.js                # resumen mensual y situación de pago (lógica pura)
│   ├── cobros-pagina.js         # lógica de cobros.html
│   ├── formas.js                # duración por área, fin corregido, días (lógica pura)
│   ├── plantillas.js            # plantillas de bloques (+ copia en el dispositivo)
│   ├── tema.js                  # tema claro/oscuro, en el <head> de cada página
│   ├── pwa.js                   # registra el service worker
│   ├── lorenz.js                # ecuaciones del atractor de Lorenz (lógica pura)
│   └── ui/
│       ├── dia.js                # vista de día (grilla de una columna) y estados vacío/carga/error
│       ├── semana.js             # grilla de semana: días × horas
│       ├── formulario.js          # diálogo de alta/edición/mover/duplicar
│       ├── ficha.js               # ficha de solo lectura al tocar un bloque
│       ├── selector-alumnos.js    # campo de alumnos con autocompletado
│       ├── graficas.js            # barras horizontales en SVG propio
│       ├── horas.js               # conecta inicio/fin/área/tipo de un formulario
│       ├── dias.js                # botones Lun–Dom
│       ├── carga.js               # pantalla de carga: el atractor dibujándose
│       ├── iconos.js              # formas SVG por tipo de bloque
│       └── espiritu.js            # bocetos SVG de la mascota
├── academia-fractal-logo.png  # el logo original (fuente del símbolo)
├── icons/                   # símbolo e íconos (los SVG son la fuente; los PNG salen de ahí)
├── apps-script/
│   ├── appsscript.json       # manifiesto: zona horaria, tipo de despliegue
│   ├── Code.gs               # Web App: doPost, validación de token, hojas Areas/Bloques
│   ├── Bloques.gs             # crear/editar/archivar/mover bloques y su estado
│   ├── Setup.gs               # funciones manuales: configurarHojas, generarToken, vincularAlumnosEnHorario, moverAulasALugar, repararAlumnosFractal
│   ├── Horario.gs             # hoja Horario + generarHorario(): reglas → filas de Bloques
│   ├── Alumnos.gs             # hojas Alumnos/Cursos/Colegios, ABM y migración de Fractal
│   ├── Importar.gs            # importador de filas pegadas (alumnos y reglas)
│   ├── Auditoria.gs           # auditarDatos(): revisión de coherencia, solo lectura
│   ├── Pagos.gs               # hoja Pagos: listar/crear/editar/archivar
│   └── Plantillas.gs          # hoja Plantillas: listar/crear/archivar
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
7. **Alumnos de Academia Fractal (CRM) + importador.**
8. **Estado de clases, pagos y estadísticas.**
9. **Tema claro/oscuro + PWA + contraste WCAG AA + formularios prácticos**
   (duración automática, días con botones, Hoy/Mañana, duplicar con solo
   la fecha, plantillas) y la app de tú.
10. **Identidad visual**: marino del logo, símbolo de Academia Fractal
    (íconos, favicon, encabezado, sello de agua) y pantalla de carga con el
    atractor de Lorenz.

Cada checkpoint: rama corta → PR pequeño → Gerardo prueba y aprueba → merge.
