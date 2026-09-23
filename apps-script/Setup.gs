/**
 * KODAMA — funciones de un solo uso.
 * Se ejecutan a mano desde el editor de Apps Script (botón "Ejecutar").
 */

function configurarHojas() {
  // Misma lógica que corre sola en cada POST (Code.gs). Esta función queda
  // como atajo manual, por si querés forzar el chequeo sin esperar a que
  // la app haga una petición.
  asegurarEstructura();
  Logger.log('Listo. Hojas "%s", "%s" y "%s" verificadas, zona horaria %s.',
    HOJA_AREAS, HOJA_BLOQUES, HOJA_HORARIO, ZONA_HORARIA);
}

function generarToken() {
  const propiedades = PropertiesService.getScriptProperties();
  if (propiedades.getProperty(PROPIEDAD_TOKEN)) {
    Logger.log('Ya existe un token. Para crear uno nuevo, borrá primero la propiedad %s ' +
      'en Configuración del proyecto.', PROPIEDAD_TOKEN);
    return;
  }
  const token = Utilities.getUuid().replace(/-/g, '');
  propiedades.setProperty(PROPIEDAD_TOKEN, token);
  Logger.log('Token creado y guardado en Propiedades del script. Copialo:');
  Logger.log(token);
}

/**
 * Vincula las reglas de la hoja Horario de Academia Fractal que tienen
 * alumno_id vacío con los alumnos de la hoja Alumnos, leyendo el nombre
 * desde el título ("Clase con Camila y Adriana" → Camila y Adriana).
 *
 * - Compara nombre y apellido sin distinguir tildes ni mayúsculas. Si el
 *   título trae solo el nombre, sirve si hay UN solo alumno con ese nombre.
 * - Si el título nombra a varios alumnos, vincula a todos.
 * - Si algún nombre no aparece o es ambiguo (dos alumnos con ese nombre),
 *   la fila queda sin tocar y se anota como pendiente.
 * - Solo escribe la columna alumno_id de las filas que vincula: no cambia
 *   títulos, no crea alumnos, no borra nada.
 *
 * Se ejecuta a mano desde el editor; el resultado queda en el registro de
 * ejecución (Logger).
 */
function vincularAlumnosEnHorario() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_HORARIO);
  const datos = hoja.getDataRange().getDisplayValues();
  const encabezados = datos[0];
  const cTitulo = encabezados.indexOf('título');
  const cArea = encabezados.indexOf('área');
  const cAlumnos = encabezados.indexOf('alumno_id');
  if (cTitulo === -1 || cArea === -1 || cAlumnos === -1) {
    throw new Error('A la hoja Horario le falta la columna "título", "área" o "alumno_id". ' +
      'Abrí la app una vez (o corré configurarHojas) y volvé a intentar.');
  }

  const alumnos = leerAlumnos();
  const vinculadas = [];
  const pendientes = [];

  for (let f = 1; f < datos.length; f++) {
    const fila = datos[f];
    const titulo = String(fila[cTitulo] || '').trim();
    if (normalizarTexto(fila[cArea]) !== normalizarTexto(AREA_FRACTAL)) continue;
    if (String(fila[cAlumnos] || '').trim()) continue;
    const numeroFila = f + 1;
    if (!titulo) {
      pendientes.push({ fila: numeroFila, titulo: '', motivo: 'sin título' });
      continue;
    }

    const nombres = extraerNombresDeTitulo(titulo).nombres;
    if (nombres.length === 0) {
      pendientes.push({ fila: numeroFila, titulo: titulo, motivo: 'no se reconoce ningún nombre' });
      continue;
    }

    const encontrados = [];
    const problemas = [];
    nombres.forEach(function (n) {
      const texto = (n.nombre + ' ' + n.apellido).trim();
      const candidatos = candidatosPorNombre(alumnos, n.nombre, n.apellido);
      if (candidatos.length === 1) {
        encontrados.push(candidatos[0]);
      } else if (candidatos.length === 0) {
        problemas.push('"' + texto + '" no está en Alumnos');
      } else {
        problemas.push('"' + texto + '" es ambiguo (' +
          candidatos.map(function (a) { return (a.nombre + ' ' + a.apellido).trim(); }).join(' / ') + ')');
      }
    });

    if (problemas.length) {
      pendientes.push({ fila: numeroFila, titulo: titulo, motivo: problemas.join('; ') });
      continue;
    }
    fila[cAlumnos] = normalizarIdsAlumnos(encontrados.map(function (a) { return a.id; }).join(','));
    vinculadas.push({
      fila: numeroFila,
      titulo: titulo,
      alumnos: encontrados.map(function (a) { return (a.nombre + ' ' + a.apellido).trim(); })
    });
  }

  // Una sola escritura, solo de la columna alumno_id (las filas que no se
  // vincularon vuelven a escribirse con el mismo valor que ya tenían).
  if (vinculadas.length) {
    const columna = datos.slice(1).map(function (fila) { return [fila[cAlumnos]]; });
    hoja.getRange(2, cAlumnos + 1, columna.length, 1).setValues(columna);
  }

  Logger.log('Reglas vinculadas: %s. Pendientes: %s.', vinculadas.length, pendientes.length);
  vinculadas.forEach(function (v) {
    Logger.log('  ✓ fila %s: "%s" → %s', v.fila, v.titulo, v.alumnos.join(', '));
  });
  pendientes.forEach(function (p) {
    Logger.log('  ✗ fila %s: "%s" — %s (quedó sin tocar)', p.fila, p.titulo, p.motivo);
  });
  if (vinculadas.length) {
    Logger.log('Para que los bloques ya generados hereden los alumnos, tocá "Regenerar horario" en la app.');
  }
  return { vinculadas: vinculadas, pendientes: pendientes };
}

/**
 * Alumnos que corresponden a un nombre sacado de un título: por nombre y
 * apellido exactos (sin tildes/mayúsculas); si el título solo trae el
 * nombre, todos los que se llaman así (más de uno = ambiguo).
 */
function candidatosPorNombre(alumnos, nombre, apellido) {
  if (apellido) {
    const clave = claveDeAlumno(nombre, apellido);
    return alumnos.filter(function (a) { return claveDeAlumno(a.nombre, a.apellido) === clave; });
  }
  return alumnos.filter(function (a) { return normalizarTexto(a.nombre) === normalizarTexto(nombre); });
}
