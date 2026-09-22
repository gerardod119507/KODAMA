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
  'notas', 'creado', 'actualizado', 'archivado'
];

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

/**
 * Crea las hojas que falten, con encabezados y datos iniciales, y fija la
 * zona horaria del libro. Se llama en cada POST autorizado (ver doPost) y
 * también puede correrse a mano desde el editor via Setup.gs.
 *
 * Idempotente: si una hoja ya tiene filas, no la toca.
 */
function asegurarEstructura() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  if (libro.getSpreadsheetTimeZone() !== ZONA_HORARIA) {
    libro.setSpreadsheetTimeZone(ZONA_HORARIA);
  }
  asegurarHojaAreas(libro);
  asegurarHojaBloques(libro);
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
    hoja.getRange('A:K').setNumberFormat('@');
    hoja.getRange(1, 1, 1, 11).setValues([[
      'id', 'título', 'área', 'tipo', 'fecha', 'inicio', 'fin',
      'notas', 'creado', 'actualizado', 'archivado'
    ]]);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function responderJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
