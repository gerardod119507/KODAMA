/**
 * KODAMA — funciones de un solo uso.
 * Se ejecutan a mano desde el editor de Apps Script (botón "Ejecutar").
 */

function configurarHojas() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  libro.setSpreadsheetTimeZone('America/La_Paz');

  const areas = obtenerOCrearHoja(libro, HOJA_AREAS);
  if (areas.getLastRow() === 0) {
    areas.getRange(1, 1, 5, 2).setValues([
      ['nombre', 'color'],
      ['Universidad', '#245A8D'],
      ['Academia Fractal', '#8A5A00'],
      ['Startup', '#6650A4'],
      ['Personal', '#476A54']
    ]);
    areas.setFrozenRows(1);
  }

  const bloques = obtenerOCrearHoja(libro, HOJA_BLOQUES);
  if (bloques.getLastRow() === 0) {
    // El formato de texto va ANTES de escribir nada: si no, Sheets convierte
    // "2026-09-22" en fecha y "14:30" en hora, y se pierde el formato.
    bloques.getRange('A:K').setNumberFormat('@');
    bloques.getRange(1, 1, 1, 11).setValues([[
      'id', 'título', 'área', 'tipo', 'fecha', 'inicio', 'fin',
      'notas', 'creado', 'actualizado', 'archivado'
    ]]);
    bloques.setFrozenRows(1);
  }

  Logger.log('Listo. Hojas "%s" y "%s" configuradas, zona horaria America/La_Paz.',
    HOJA_AREAS, HOJA_BLOQUES);
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

function obtenerOCrearHoja(libro, nombre) {
  return libro.getSheetByName(nombre) || libro.insertSheet(nombre);
}
