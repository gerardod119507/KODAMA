# Cómo cargar el horario del semestre (Checkpoint 4)

Esto reemplaza tener que escribir a mano cada clase de cada semana en
`Bloques`. Escribís **una fila por materia/actividad fija** en `Horario`, y
un botón genera todas las fechas.

> **Desde el Checkpoint 5 podés hacer todo esto desde la app**, sin abrir
> el Sheet: abrí `horario.html` (enlace "Horario" arriba), tocá `+` para
> agregar una regla, tocá una regla para editarla o archivarla, y usá
> "Regenerar horario". Lo de abajo sigue valiendo si preferís escribir
> directo en la hoja.

## 1. Llenar la hoja `Horario`

Abrí tu Sheet → pestaña **Horario** (el Web App la crea sola la primera vez
que la app le pide algo; si no aparece, recargá la hoja o mandá cualquier
acción desde la app una vez).

> **La columna `id` NO se toca: se deja la celda en blanco.** El generador
> la completa solo. Si escribís algo ahí, lo va a reemplazar.

Columnas, en este orden (la columna `id` va vacía, por eso aparece en
blanco en los ejemplos):

| id | título | área | días | inicio | fin | desde | hasta | etiqueta | notas |
|---|---|---|---|---|---|---|---|---|---|
| | Cálculo II | Universidad | Lun, Mié | 09:00 | 10:30 | 2026-09-01 | 2026-12-15 | | |
| | Clase con Valentina | Academia Fractal | Mar | 15:00 | 16:00 | 2026-09-01 | 2026-12-15 | | |
| | Standup | Startup | Lun, Mié, Vie | 09:00 | 09:15 | 2026-09-01 | 2026-12-15 | Nerak | |

**Cómo escribir cada columna:**

- **id**: no escribas nada. Se completa solo con algo como `h3f9a21bc` la
  primera vez que generás, y a partir de ahí no cambia.
- **título**: el nombre que vas a ver en la app.
- **área**: exactamente `Universidad`, `Academia Fractal`, `Startup` o
  `Personal` (tal cual están en la hoja `Areas`).
- **días**: abreviaturas separadas por coma, espacio, guion o barra —
  `Lun`, `Mar`, `Mié`, `Jue`, `Vie`, `Sáb`, `Dom`. Con tilde o sin tilde da
  igual (`Mie` funciona igual que `Mié`). Si escribís un día que no
  reconoce, el botón de generar te va a decir exactamente cuál y en qué
  fila.
- **inicio** / **fin**: `HH:mm`, por ejemplo `09:00`.
- **desde** / **hasta**: `YYYY-MM-DD`, el rango de fechas del semestre para
  esa fila (podés poner el mismo rango en todas).
- **etiqueta**: opcional. En Startup la celda tiene sugerencias ("Nerak",
  "Data cocha", "otro") en un desplegable, pero podés escribir cualquier
  otra cosa — no está restringido.
- **notas**: opcional, libre.

## 2. Generar

1. Abrí `config.html` en el navegador (el mismo lugar donde configuraste la
   conexión).
2. Bajá hasta **"Horario del semestre"** y tocá **"Generar horario del
   semestre"**.
3. En unos segundos aparece un resumen: `Listo: X creados, Y actualizados,
   Z archivados`.

Eso crea, en `Bloques`, una fila de tipo `fijo` por cada fecha real que
corresponde a cada regla — nunca fechas anteriores a hoy, aunque el
`desde` de la regla sea del pasado.

## 3. Editar una regla y volver a generar

Si cambiás el horario, el título o el área de una fila de `Horario` y
volvés a tocar el botón:

- Las fechas **futuras** de esa regla se actualizan con los datos nuevos.
- Las fechas **pasadas** no se tocan (quedan como estaban, aunque hayas
  cambiado la regla).
- Si acortaste el rango (`hasta` más chico) o sacaste un día, las fechas
  futuras que ya no corresponden se **archivan solas** (no se borran, y
  desaparecen de la vista de día como cualquier bloque archivado).

## 4. Cancelar una clase puntual (un feriado, una falta)

**No toques `Horario` para esto.** Andá directo a `Bloques`, buscá la fila
de esa fecha puntual, y poné `TRUE` en la columna `archivado`. Esa fila
específica queda cancelada y el generador nunca la va a "revivir" ni
tocar, aunque vuelvas a generar el horario completo.

## 5. Notas y etiquetas puntuales

Si le agregás algo a `notas` o cambiás `etiqueta` directamente en una fila
de `Bloques` (por ejemplo, "clase en el aula 4 esta semana"), eso queda
aunque vuelvas a generar — el generador nunca pisa `notas` ni `etiqueta` de
un bloque que ya existía, solo las completa la primera vez que lo crea.

## Capas en la vista de día

En `index.html` hay un selector **Capa**: General, Universidad, Academia
Fractal, Startup, Personal. Filtra lo que ya se ve ese día — General
muestra todo. Se acuerda de la última capa que elegiste en ese dispositivo.

Si dos bloques de ese día se superponen en horario, se muestran uno al
lado del otro. No hay ningún aviso de "choque": es una decisión a propósito
para no complicar el MVP.

## Borrar los bloques de una serie

Para limpiar bloques generados (por ejemplo los de una prueba) sin tocar el
Sheet a mano:

1. Abrí `config.html`.
2. Bajá a **"Limpiar bloques generados"** y tocá **"Ver series generadas"**.
3. Elegí una serie (o "Todas las series") y tocá **"Borrar los bloques de
   esta serie"**.

Borra de verdad, no archiva, y no se puede deshacer. Solo toca bloques
generados por el horario: las reuniones y los bloques cargados a mano no se
tocan nunca.
