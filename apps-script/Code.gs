/**
 * KODAMA — API (Web App de Google Apps Script)
 *
 * Todas las peticiones son POST con Content-Type: text/plain.
 * El cuerpo es un JSON: { token: "...", action: "...", ...parametros }
 */

const PROPIEDAD_TOKEN = 'KODAMA_TOKEN';
const HOJA_AREAS = 'Areas';
const HOJA_BLOQUES = 'Bloques';
const ZONA_HORARIA = 'America/La_Paz';

// Mismo orden que los encabezados que crea asegurarHojaBloques().
// Claves en ASCII (sin tildes) para que el JSON no dependa de codificación.
const COLUMNAS_BLOQUES = [
  'id', 'titulo', 'area', 'tipo', 'fecha', 'inicio', 'fin',
  'etiqueta', 'notas', 'creado', 'actualizado', 'archivado'
];
const ENCABEZADOS_BLOQUES = [
  'id', 'título', 'área', 'tipo', 'fecha', 'inicio', 'fin',
  'etiqueta', 'notas', 'creado', 'actualizado', 'archivado'
];

// Sugerencias de "etiqueta" (no restringen: se cargan con "permitir
// inválido" para que se pueda escribir cualquier otra cosa).
const SUGERENCIAS_ETIQUETA = ['Nerak', 'Data cocha', 'otro'];

// ÚNICA fuente de verdad de qué acciones existen: el nombre acá tiene que
// ser IDÉNTICO, carácter por carácter, al que manda el frontend (ver
// KodamaApi.llamar(...) en js/*.js — grep 'action' o revisá "API (acciones
// del Web App)" en CLAUDE.md). Agregar una acción nueva es agregar una
// entrada acá, nunca un "case" suelto en otro lado.
const ACCIONES = {
  ping: function () {
    return {
      mensaje: 'pong',
      zonaHoraria: SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()
    };
  },
  listarAreas: function () {
    return listarAreas();
  },
  listarBloquesDia: function (peticion) {
    return listarBloquesDia(peticion.fecha);
  },
  generarHorario: function () {
    return generarHorario();
  },
  listarSeries: function () {
    return listarSeries();
  },
  borrarSerie: function (peticion) {
    return borrarSerie(peticion.idSerie);
  }
};

function doPost(e) {
  let peticion;
  try {
    peticion = JSON.parse(e.postData.contents);
  } catch (err) {
    return responderJson({ ok: false, error: 'cuerpo_invalido' });
  }

  if (!tokenEsValido(peticion.token)) {
    return responderJson({ ok: false, error: 'no_autorizado' });
  }

  try {
    // Se ejecuta en cada request autorizado (no solo en un setup manual) para
    // que un Sheet nuevo, o uno al que le falte una hoja, quede utilizable
    // sin que Gerardo tenga que abrir el editor de Apps Script.
    asegurarEstructura();
    return responderJson({ ok: true, data: ejecutarAccion(peticion) });
  } catch (err) {
    return responderJson({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return responderJson({ ok: false, error: 'usa_post' });
}

function ejecutarAccion(peticion) {
  const manejador = ACCIONES[peticion.action];
  if (!manejador) {
    throw new Error(
      'accion_desconocida: recibida "' + peticion.action + '", ' +
      'acciones válidas: ' + Object.keys(ACCIONES).join(', ')
    );
  }
  return manejador(peticion);
}

function tokenEsValido(recibido) {
  const esperado = PropertiesService.getScriptProperties().getProperty(PROPIEDAD_TOKEN);
  return Boolean(esperado) && recibido === esperado;
}

function listarAreas() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_AREAS);
  // getDisplayValues devuelve texto tal como se ve en la hoja, sin que Apps
  // Script reinterprete nada.
  return hoja.getDataRange().getDisplayValues()
    .slice(1)
    .filter(function (fila) { return fila[0]; })
    .map(function (fila) { return { nombre: fila[0], color: fila[1] }; });
}

function listarBloquesDia(fecha) {
  if (!fecha) {
    throw new Error('falta_fecha');
  }
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_BLOQUES);
  return hoja.getDataRange().getDisplayValues()
    .slice(1)
    .filter(function (fila) { return fila[0]; })
    .map(filaABloque)
    .filter(function (bloque) { return bloque.fecha === fecha && bloque.archivado !== 'TRUE'; })
    .sort(function (a, b) { return a.inicio.localeCompare(b.inicio); });
}

function filaABloque(fila) {
  const bloque = {};
  COLUMNAS_BLOQUES.forEach(function (clave, indice) { bloque[clave] = fila[indice]; });
  return bloque;
}

function bloqueAFila(bloque) {
  return COLUMNAS_BLOQUES.map(function (clave) {
    return bloque[clave] != null ? bloque[clave] : '';
  });
}

/**
 * Crea las hojas que falten, con encabezados y datos iniciales, y fija la
 * zona horaria del libro. Se llama en cada POST autorizado (ver doPost) y
 * también puede correrse a mano desde el editor via Setup.gs.
 *
 * Idempotente: si una hoja ya tiene filas, no la toca (salvo la migración
 * de la columna "etiqueta" en Bloques, ver migrarColumnaEtiqueta).
 */
function asegurarEstructura() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  if (libro.getSpreadsheetTimeZone() !== ZONA_HORARIA) {
    libro.setSpreadsheetTimeZone(ZONA_HORARIA);
  }
  asegurarHojaAreas(libro);
  asegurarHojaBloques(libro);
  asegurarHojaHorario(libro);
}

function asegurarHojaAreas(libro) {
  const hoja = libro.getSheetByName(HOJA_AREAS) || libro.insertSheet(HOJA_AREAS);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 5, 2).setValues([
      ['nombre', 'color'],
      ['Universidad', '#245A8D'],
      ['Academia Fractal', '#8A5A00'],
      ['Startup', '#6650A4'],
      ['Personal', '#476A54']
    ]);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function asegurarHojaBloques(libro) {
  const hoja = libro.getSheetByName(HOJA_BLOQUES) || libro.insertSheet(HOJA_BLOQUES);
  if (hoja.getLastRow() === 0) {
    // El formato de texto va ANTES de escribir nada: si no, Sheets convierte
    // "2026-09-22" en fecha y "14:30" en hora, y se pierde el formato.
    hoja.getRange(1, 1, hoja.getMaxRows(), ENCABEZADOS_BLOQUES.length).setNumberFormat('@');
    hoja.getRange(1, 1, 1, ENCABEZADOS_BLOQUES.length).setValues([ENCABEZADOS_BLOQUES]);
    hoja.setFrozenRows(1);
    aplicarSugerenciasEtiqueta(hoja, ENCABEZADOS_BLOQUES.indexOf('etiqueta') + 1);
  } else {
    // La hoja ya existía desde antes del Checkpoint 4 (sin columna
    // "etiqueta"). Se agrega sin tocar las filas que ya tenía.
    migrarColumnaEtiqueta(hoja);
  }
  return hoja;
}

function migrarColumnaEtiqueta(hoja) {
  const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getDisplayValues()[0];
  if (encabezados.indexOf('etiqueta') !== -1) {
    return; // ya migrada
  }
  const indiceNotas = encabezados.indexOf('notas');
  if (indiceNotas === -1) {
    return; // encabezados inesperados: no tocar nada a ciegas
  }
  const columnaNueva = indiceNotas + 1; // insertar ANTES de "notas" (1-indexado)
  hoja.insertColumnBefore(columnaNueva);
  hoja.getRange(1, columnaNueva, hoja.getMaxRows(), 1).setNumberFormat('@');
  hoja.getRange(1, columnaNueva).setValue('etiqueta');
  aplicarSugerenciasEtiqueta(hoja, columnaNueva);
}

function aplicarSugerenciasEtiqueta(hoja, columna) {
  const regla = SpreadsheetApp.newDataValidation()
    .requireValueInList(SUGERENCIAS_ETIQUETA, true)
    .setAllowInvalid(true) // sugiere, pero nunca bloquea escribir otra cosa
    .build();
  // Un rango con 0 filas tira error en Sheets. Si la hoja quedó recortada a
  // una sola fila, esto no debe romper toda la creación de estructura.
  const filas = Math.max(1, hoja.getMaxRows() - 1);
  hoja.getRange(2, columna, filas, 1).setDataValidation(regla);
}

function responderJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
