/**
 * KODAMA — plantillas de bloques (Checkpoint 9).
 *
 * Una plantilla guarda lo que se repite de un bloque: área, tipo, título
 * (tema), alumnos, duración, lugar y etiqueta. Nunca la fecha ni la hora:
 * esas se eligen al crear. Viven en una hoja (no solo en el celular) para
 * no perderlas al cambiar de dispositivo o borrar los datos del navegador.
 * Archivar, nunca borrar.
 */

const HOJA_PLANTILLAS = 'Plantillas';
const COLUMNAS_PLANTILLAS = [
  'id', 'nombre', 'area', 'tipo', 'titulo', 'alumno_id', 'duracion', 'lugar', 'etiqueta', 'creado', 'archivado'
];

function asegurarHojaPlantillas(libro) {
  const hoja = libro.getSheetByName(HOJA_PLANTILLAS) || libro.insertSheet(HOJA_PLANTILLAS);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, hoja.getMaxRows(), COLUMNAS_PLANTILLAS.length).setNumberFormat('@');
    hoja.getRange(1, 1, 1, COLUMNAS_PLANTILLAS.length).setValues([COLUMNAS_PLANTILLAS]);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function hojaPlantillas() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_PLANTILLAS);
}

function filaAPlantilla(fila) {
  const p = {};
  COLUMNAS_PLANTILLAS.forEach(function (clave, i) { p[clave] = fila[i] || ''; });
  return p;
}

/** Plantillas activas (sin las archivadas), en el orden en que se crearon. */
function listarPlantillas() {
  const hoja = hojaPlantillas();
  if (hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, COLUMNAS_PLANTILLAS.length).getDisplayValues()
    .filter(function (fila) { return fila[0]; })
    .map(filaAPlantilla)
    .filter(function (p) { return p.archivado !== 'TRUE'; });
}

function crearPlantilla(datos) {
  const e = datos || {};
  const plantilla = {
    id: 't' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase(),
    nombre: String(e.nombre || '').trim().slice(0, 60),
    area: String(e.area || '').trim(),
    tipo: String(e.tipo || '').trim(),
    titulo: String(e.titulo || '').trim(),
    alumno_id: normalizarIdsAlumnos(e.alumno_id),
    duracion: String(e.duracion == null ? '' : e.duracion).trim(),
    lugar: String(e.lugar || '').trim(),
    etiqueta: String(e.etiqueta || '').trim(),
    creado: ahoraEnTexto(),
    archivado: ''
  };
  if (!plantilla.nombre) throw new Error('falta_nombre: ponle un nombre a la plantilla');
  validarArea(plantilla.area);
  if (TIPOS_BLOQUE.indexOf(plantilla.tipo) === -1) {
    throw new Error('tipo_invalido: "' + plantilla.tipo + '" (usa ' + TIPOS_BLOQUE.join(', ') + ')');
  }
  if (!/^\d+$/.test(plantilla.duracion) || Number(plantilla.duracion) < 5 || Number(plantilla.duracion) > 720) {
    throw new Error('duracion_invalida: "' + plantilla.duracion + '" (minutos, entre 5 y 720)');
  }
  if (plantilla.area !== AREA_FRACTAL) plantilla.alumno_id = '';
  validarIdsAlumnos(plantilla.alumno_id);
  if (!plantilla.titulo && !plantilla.alumno_id) throw new Error('falta_titulo');

  hojaPlantillas().appendRow(COLUMNAS_PLANTILLAS.map(function (c) { return plantilla[c]; }));
  return plantilla;
}

function archivarPlantilla(id) {
  const buscado = String(id || '').trim();
  if (!buscado) throw new Error('falta_id_plantilla');
  const hoja = hojaPlantillas();
  const filas = hoja.getDataRange().getDisplayValues();
  for (let f = 1; f < filas.length; f++) {
    if (filas[f][0] === buscado) {
      hoja.getRange(f + 1, COLUMNAS_PLANTILLAS.indexOf('archivado') + 1).setValue('TRUE');
      const p = filaAPlantilla(filas[f]);
      p.archivado = 'TRUE';
      return p;
    }
  }
  throw new Error('plantilla_no_encontrada: ' + buscado);
}
