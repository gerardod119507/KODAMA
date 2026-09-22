# Agregar bloques de prueba (Checkpoint 3)

Esto es solo para probar la vista de día. Más adelante (Checkpoint 5) vas a
poder crear bloques desde la app; por ahora se agregan a mano en el Sheet.

1. Abrí tu hoja **KODAMA** en <https://sheets.google.com>.
2. Andá a la pestaña **Bloques** (abajo).
3. Las columnas ya están en formato **Texto sin formato** (lo hizo
   `configurarHojas()` en el Checkpoint 2), así que lo que escribas queda
   exactamente como lo tipeás — Sheets no lo va a convertir a fecha ni a
   número.
4. Escribí estas 3 filas a partir de la fila 2 (una fila = un bloque), **una
   celda por columna**, en este orden exacto:

   `id | título | área | tipo | fecha | inicio | fin | notas | creado | actualizado | archivado`

   | id | título | área | tipo | fecha | inicio | fin | notas | creado | actualizado | archivado |
   |---|---|---|---|---|---|---|---|---|---|---|
   | b1 | Cálculo II | Universidad | fijo | **HOY** | 09:00 | 10:30 | | **HOY** 08:00 | **HOY** 08:00 | |
   | b2 | Clase con Valentina | Academia Fractal | variable | **HOY** | 15:00 | 16:00 | | **HOY** 08:00 | **HOY** 08:00 | |
   | b3 | Café con inversionista | Startup | reunión | **HOY** | 18:30 | 19:00 | | **HOY** 08:00 | **HOY** 08:00 | |

5. Reemplazá **HOY** por la fecha de hoy en formato `YYYY-MM-DD` (ej.
   `2026-09-22`). Tiene que ser la fecha real del día en que probás, porque
   la vista de día solo pide los bloques de hoy.

> **Ojo con estos 3 valores, tienen que coincidir exactamente (mayúsculas y
> tildes incluidas) o el bloque no se va a ver bien:**
> - `área`: `Universidad`, `Academia Fractal`, `Startup` o `Personal` — tal
>   cual están escritas en la hoja `Areas`.
> - `tipo`: `fijo`, `variable` o `reunión` (con tilde).
> - `fecha`: `YYYY-MM-DD`, con guiones, sin espacios.

## Qué deberías ver

Abrí `https://gerardod119507.github.io/KODAMA/` en el celular (ya configurado
desde el Checkpoint 2):

- Los 3 bloques ordenados por hora (09:00, 15:00, 18:30).
- `b1` (fijo) con un ícono **cuadrado** del color de Universidad (azul).
- `b2` (variable) con un ícono **círculo** del color de Academia Fractal
  (mostaza).
- `b3` (reunión) con un ícono **triángulo** en el color rojizo de Reunión
  (no el color de Startup — las reuniones siempre se marcan así, sin
  importar el área).
- Cada bloque muestra título, horario y el nombre del área como texto, no
  solo el color.

## Para ver el estado vacío (y los bocetos de la mascota)

Cambiá la `fecha` de las 3 filas a un día distinto de hoy (o borrá las
filas) y recargá la página. Sin bloques para hoy, en vez de la lista vas a
ver dos bocetos del espíritu del bosque (**Boceto A** y **Boceto B**) — esa
comparación es temporal, solo para que elijas uno. Contame cuál preferís.

## Para probar el aviso de "sin conexión"

Cargá la página una vez con los 3 bloques (para que quede guardado en el
caché del dispositivo). Después activá el modo avión y volvé a abrir la
página: debería seguir mostrando los mismos 3 bloques, con un aviso arriba
que dice "Mostrando lo último guardado. Sin conexión."
