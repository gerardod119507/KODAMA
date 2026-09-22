/**
 * KODAMA — API (Web App de Google Apps Script)
 *
 * Todas las peticiones son POST con Content-Type: text/plain.
 * El cuerpo es un JSON: { token: "...", action: "...", ...parametros }
 */

const PROPIEDAD_TOKEN = 'KODAMA_TOKEN';
const HOJA_AREAS = 'Areas';
const HOJA_BLOQUES = 'Bloques';

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
    return responderJson({ ok: true, data: ejecutarAccion(peticion) });
  } catch (err) {
    return responderJson({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return responderJson({ ok: false, error: 'usa_post' });
}

function ejecutarAccion(peticion) {
  switch (peticion.action) {
    case 'ping':
      return {
        mensaje: 'pong',
        zonaHoraria: SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()
      };
    case 'listarAreas':
      return listarAreas();
    default:
      throw new Error('accion_desconocida');
  }
}

function tokenEsValido(recibido) {
  const esperado = PropertiesService.getScriptProperties().getProperty(PROPIEDAD_TOKEN);
  return Boolean(esperado) && recibido === esperado;
}

function listarAreas() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_AREAS);
  if (!hoja) {
    throw new Error('falta_hoja_areas');
  }
  // getDisplayValues devuelve texto tal como se ve en la hoja, sin que Apps
  // Script reinterprete nada.
  return hoja.getDataRange().getDisplayValues()
    .slice(1)
    .filter(function (fila) { return fila[0]; })
    .map(function (fila) { return { nombre: fila[0], color: fila[1] }; });
}

function responderJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
