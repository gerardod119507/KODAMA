/**
 * KODAMA — alta, edición y archivado de bloques desde la app.
 *
 * Los bloques que crea Gerardo a mano llevan id "b" + 8 hexadecimales, sin
 * sufijo de fecha, así nunca los confunde el generador del horario (que
 * solo toca ids con forma "idDeSerie-YYYY-MM-DD").
 */

const TIPOS_BLOQUE = ['fijo', 'variable', 'reunión'];

// Campos que la app puede escribir. El resto (id, creado, actualizado,
// archivado) los maneja el backend.
const CAMPOS_EDITABLES_BLOQUE = ['titulo', 'area', 'tipo', 'fecha', 'inicio', 'fin', 'etiqueta', 'notas', 'alumno_id', 'lugar'];

function crearBloque(datos) {
  const entrada = datos || {};
  const bloque = {
    id: 'b' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase(),
    titulo: String(entrada.titulo || '').trim(),
    area: String(entrada.area || '').trim(),
    tipo: String(entrada.tipo || '').trim(),
    fecha: String(entrada.fecha || '').trim(),
    inicio: String(entrada.inicio || '').trim(),
    fin: String(entrada.fin || '').trim(),
    etiqueta: String(entrada.etiqueta || '').trim(),
    notas: String(entrada.notas || ''),
    creado: ahoraEnTexto(),
    actualizado: ahoraEnTexto(),
    archivado: '',
    alumno_id: normalizarIdsAlumnos(entrada.alumno_id),
    lugar: String(entrada.lugar || '').trim()
  };

  validarBloque(bloque);

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_BLOQUES);
  hoja.appendRow(bloqueAFila(bloque));
  ordenarHojaBloques(hoja);
  return bloque;
}

function actualizarBloque(id, cambios) {
  const ubicacion = buscarFilaDeBloque(id);
  const bloque = ubicacion.bloque;
  const posicionAnterior = bloque.fecha + ' ' + bloque.inicio;

  CAMPOS_EDITABLES_BLOQUE.forEach(function (campo) {
    if (cambios && cambios[campo] !== undefined && cambios[campo] !== null) {
      bloque[campo] = campo === 'notas' ? String(cambios[campo]) : String(cambios[campo]).trim();
    }
  });
  bloque.alumno_id = normalizarIdsAlumnos(bloque.alumno_id);
  bloque.actualizado = ahoraEnTexto();

  validarBloque(bloque);

  ubicacion.hoja
    .getRange(ubicacion.fila, 1, 1, COLUMNAS_BLOQUES.length)
    .setValues([bloqueAFila(bloque)]);
  if (bloque.fecha + ' ' + bloque.inicio !== posicionAnterior) {
    ordenarHojaBloques(ubicacion.hoja); // se movió: mantener el orden por fecha
  }
  return bloque;
}

function archivarBloque(id) {
  const ubicacion = buscarFilaDeBloque(id);
  const bloque = ubicacion.bloque;
  bloque.archivado = 'TRUE';
  bloque.actualizado = ahoraEnTexto();

  ubicacion.hoja
    .getRange(ubicacion.fila, 1, 1, COLUMNAS_BLOQUES.length)
    .setValues([bloqueAFila(bloque)]);
  return bloque;
}

function buscarFilaDeBloque(id) {
  const buscado = String(id || '').trim();
  if (!buscado) {
    throw new Error('falta_id_bloque');
  }
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_BLOQUES);
  const filas = hoja.getDataRange().getDisplayValues();
  for (let f = 1; f < filas.length; f++) {
    if (filas[f][0] === buscado) {
      return { hoja: hoja, fila: f + 1, bloque: filaABloque(filas[f]) };
    }
  }
  throw new Error('bloque_no_encontrado: ' + buscado);
}

function validarBloque(bloque) {
  // Con alumnos vinculados el título es opcional: el nombre que se ve en la
  // app sale de la hoja Alumnos, no del título (Checkpoint 7).
  if (!bloque.titulo && !bloque.alumno_id) {
    throw new Error('falta_titulo');
  }
  validarArea(bloque.area);
  validarIdsAlumnos(bloque.alumno_id);
  if (TIPOS_BLOQUE.indexOf(bloque.tipo) === -1) {
    throw new Error('tipo_invalido: "' + bloque.tipo + '" (usá ' + TIPOS_BLOQUE.join(', ') + ')');
  }
  validarFecha(bloque.fecha, bloque.titulo, 'fecha');
  validarHora(bloque.inicio, bloque.titulo, 'inicio');
  validarHora(bloque.fin, bloque.titulo, 'fin');
  if (bloque.inicio >= bloque.fin) {
    throw new Error('horario_invertido: "' + bloque.titulo + '" (inicio es después de fin)');
  }
}

function validarArea(area) {
  const validas = nombresDeAreas();
  if (validas.indexOf(String(area || '').trim()) === -1) {
    throw new Error('area_invalida: "' + area + '" (usá ' + validas.join(', ') + ')');
  }
}

function nombresDeAreas() {
  return listarAreas().map(function (area) { return area.nombre; });
}

function ahoraEnTexto() {
  return Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd HH:mm');
}

function hoyEnTexto() {
  return Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd');
}
