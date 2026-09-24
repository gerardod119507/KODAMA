/**
 * KODAMA — API (Web App de Google Apps Script)
 *
 * Todas las peticiones son POST con Content-Type: text/plain.
 * El cuerpo es un JSON: { token: "...", action: "...", ...parametros }
 */

const PROPIEDAD_TOKEN = 'KODAMA_TOKEN';
// Firma de la estructura ya verificada (ver asegurarEstructuraSiHaceFalta).
const PROPIEDAD_ESTRUCTURA = 'KODAMA_ESTRUCTURA';
const HOJA_AREAS = 'Areas';
const HOJA_BLOQUES = 'Bloques';
const ZONA_HORARIA = 'America/La_Paz';

// Mismo orden que los encabezados que crea asegurarHojaBloques().
// Claves en ASCII (sin tildes) para que el JSON no dependa de codificación.
// alumno_id y lugar (Checkpoint 7) van AL FINAL, para no mover ninguna
// columna de una hoja que ya tiene datos. alumno_id: ids de la hoja Alumnos
// separados por coma (una clase puede tener varios alumnos). lugar: dónde
// es (en la UMSS, el aula).
// estado … motivo (Checkpoint 8), también al final: estado de la clase
// (programada | dictada | movida | cancelada; vacío = programada), fecha y
// horas originales si se movió, y el motivo si se canceló.
const COLUMNAS_BLOQUES = [
  'id', 'titulo', 'area', 'tipo', 'fecha', 'inicio', 'fin',
  'etiqueta', 'notas', 'creado', 'actualizado', 'archivado', 'alumno_id', 'lugar',
  'estado', 'fecha_original', 'inicio_original', 'fin_original', 'motivo'
];
const ENCABEZADOS_BLOQUES = [
  'id', 'título', 'área', 'tipo', 'fecha', 'inicio', 'fin',
  'etiqueta', 'notas', 'creado', 'actualizado', 'archivado', 'alumno_id', 'lugar',
  'estado', 'fecha_original', 'inicio_original', 'fin_original', 'motivo'
];
// Columnas del Checkpoint 8 que se agregan al final de una hoja vieja.
const COLUMNAS_ESTADO_BLOQUE = ['estado', 'fecha_original', 'inicio_original', 'fin_original', 'motivo'];

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
  listarBloquesRango: function (peticion) {
    return listarBloquesRango(peticion.desde, peticion.hasta);
  },
  generarHorario: function () {
    return generarHorario();
  },
  crearBloque: function (peticion) {
    return crearBloque(peticion.bloque);
  },
  actualizarBloque: function (peticion) {
    return actualizarBloque(peticion.id, peticion.cambios);
  },
  archivarBloque: function (peticion) {
    return archivarBloque(peticion.id);
  },
  cambiarEstadoBloque: function (peticion) {
    return cambiarEstadoBloque(peticion.id, peticion.estado, peticion.motivo);
  },
  moverBloque: function (peticion) {
    return moverBloque(peticion.id, peticion.fecha, peticion.inicio, peticion.fin);
  },
  listarHorario: function () {
    return listarHorario();
  },
  crearRegla: function (peticion) {
    return crearRegla(peticion.regla);
  },
  actualizarRegla: function (peticion) {
    return actualizarRegla(peticion.id, peticion.cambios);
  },
  archivarRegla: function (peticion) {
    return archivarRegla(peticion.id);
  },
  listarSeries: function () {
    return listarSeries();
  },
  borrarSerie: function (peticion) {
    return borrarSerie(peticion.idSerie);
  },
  listarAlumnos: function () {
    return listarAlumnos();
  },
  crearAlumno: function (peticion) {
    return crearAlumno(peticion.alumno);
  },
  actualizarAlumno: function (peticion) {
    return actualizarAlumno(peticion.id, peticion.cambios);
  },
  archivarAlumno: function (peticion) {
    return archivarAlumno(peticion.id);
  },
  guardarCatalogo: function (peticion) {
    return guardarCatalogo(peticion.tipo, peticion.anterior, peticion.item);
  },
  importar: function (peticion) {
    return importar(peticion.modo, peticion.texto, peticion.aplicar === true);
  },
  migrarAlumnosFractal: function (peticion) {
    return migrarAlumnosFractal(peticion.aplicar === true, peticion.ids);
  },
  listarPagos: function () {
    return listarPagos();
  },
  crearPago: function (peticion) {
    return crearPago(peticion.pago);
  },
  actualizarPago: function (peticion) {
    return actualizarPago(peticion.id, peticion.cambios);
  },
  archivarPago: function (peticion) {
    return archivarPago(peticion.id);
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
    // Un Sheet nuevo, o uno al que le falte una hoja, queda utilizable sin
    // que Gerardo tenga que abrir el editor de Apps Script.
    asegurarEstructuraSiHaceFalta();
    return responderJson({ ok: true, data: ejecutarAccion(peticion) });
  } catch (err) {
    // Ante cualquier error, la próxima petición vuelve a verificar todo:
    // si el error vino de una hoja borrada o cambiada a mano, se repara ahí.
    PropertiesService.getScriptProperties().deleteProperty(PROPIEDAD_ESTRUCTURA);
    return responderJson({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * asegurarEstructura() hace unas 15 llamadas a Sheets, y correrla en cada
 * petición era la mayor parte del trabajo de una lectura. Ahora corre solo
 * si la estructura esperada cambió desde la última vez que se verificó: la
 * "firma" son los encabezados y la zona horaria, así que un cambio de
 * columnas en el código (una migración nueva) dispara la verificación solo,
 * sin tener que acordarse de nada al desplegar.
 */
function firmaEstructura() {
  return JSON.stringify([ZONA_HORARIA, ENCABEZADOS_BLOQUES, ENCABEZADOS_HORARIO, COLUMNAS_ALUMNOS, HOJAS_CATALOGO, COLUMNAS_PAGOS]);
}

function asegurarEstructuraSiHaceFalta() {
  const propiedades = PropertiesService.getScriptProperties();
  const firma = firmaEstructura();
  if (propiedades.getProperty(PROPIEDAD_ESTRUCTURA) === firma) {
    return false;
  }
  asegurarEstructura();
  propiedades.setProperty(PROPIEDAD_ESTRUCTURA, firma);
  return true;
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
  return leerFilasEntreFechas(hoja, fecha, fecha)
    .filter(function (fila) { return fila[0]; })
    .map(filaABloque)
    .filter(function (bloque) { return bloque.fecha === fecha && bloque.archivado !== 'TRUE'; })
    .sort(function (a, b) { return a.inicio.localeCompare(b.inicio); });
}

/**
 * Lee de Bloques solo las filas que pueden caer entre dos fechas, en vez
 * de la hoja entera: primero la columna "fecha" sola (una columna, no 12),
 * y después únicamente el tramo de filas entre la primera y la última que
 * coinciden. Como la hoja se mantiene ordenada por fecha (ver
 * ordenarHojaBloques), ese tramo es justo la semana pedida.
 *
 * No depende de que el orden sea correcto: si alguien desordena la hoja a
 * mano, el tramo es más largo (más lento) pero sigue incluyendo todo — el
 * filtro por fecha de quien llama deja solo lo que corresponde.
 */
function leerFilasEntreFechas(hoja, desde, hasta) {
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) {
    return [];
  }
  const columnaFecha = COLUMNAS_BLOQUES.indexOf('fecha') + 1;
  const fechas = hoja.getRange(2, columnaFecha, ultimaFila - 1, 1).getDisplayValues();
  let primera = -1;
  let ultima = -1;
  for (let i = 0; i < fechas.length; i++) {
    const fecha = fechas[i][0];
    if (fecha >= desde && fecha <= hasta) {
      if (primera === -1) primera = i;
      ultima = i;
    }
  }
  if (primera === -1) {
    return [];
  }
  return hoja.getRange(primera + 2, 1, ultima - primera + 1, COLUMNAS_BLOQUES.length).getDisplayValues();
}

/**
 * Deja Bloques ordenada por fecha y hora de inicio (una sola operación de
 * Sheets). Se llama después de cada escritura que puede romper el orden,
 * para que leerFilasEntreFechas lea un tramo corto.
 */
function ordenarHojaBloques(hoja) {
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 3) {
    return; // 0 o 1 bloque: ya está ordenada
  }
  hoja.getRange(2, 1, ultimaFila - 1, COLUMNAS_BLOQUES.length).sort([
    { column: COLUMNAS_BLOQUES.indexOf('fecha') + 1, ascending: true },
    { column: COLUMNAS_BLOQUES.indexOf('inicio') + 1, ascending: true }
  ]);
}

function compararPorFechaEInicio(filaA, filaB) {
  const fecha = COLUMNAS_BLOQUES.indexOf('fecha');
  const inicio = COLUMNAS_BLOQUES.indexOf('inicio');
  return String(filaA[fecha]).localeCompare(String(filaB[fecha])) ||
    String(filaA[inicio]).localeCompare(String(filaB[inicio]));
}

/**
 * Bloques no archivados entre dos fechas, ambas incluidas (vista de
 * semana). Las fechas son texto YYYY-MM-DD, así que compararlas como texto
 * ordena igual que compararlas como fechas.
 */
function listarBloquesRango(desde, hasta) {
  const formato = /^\d{4}-\d{2}-\d{2}$/;
  if (!formato.test(desde || '') || !formato.test(hasta || '')) {
    throw new Error('rango_invalido: desde y hasta tienen que ser YYYY-MM-DD (recibido "' + desde + '" a "' + hasta + '")');
  }
  if (desde > hasta) {
    throw new Error('rango_invalido: "desde" (' + desde + ') es posterior a "hasta" (' + hasta + ')');
  }
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_BLOQUES);
  return leerFilasEntreFechas(hoja, desde, hasta)
    .filter(function (fila) { return fila[0]; })
    .map(filaABloque)
    .filter(function (bloque) {
      return bloque.fecha >= desde && bloque.fecha <= hasta && bloque.archivado !== 'TRUE';
    })
    .sort(function (a, b) {
      return a.fecha.localeCompare(b.fecha) || a.inicio.localeCompare(b.inicio);
    });
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
  asegurarHojaAlumnos(libro);
  asegurarCatalogo(libro, HOJA_CURSOS, CURSOS_INICIALES);
  asegurarCatalogo(libro, HOJA_COLEGIOS, COLEGIOS_INICIALES);
  asegurarHojaPagos(libro);
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
    migrarColumnaAlFinal(hoja, ENCABEZADOS_BLOQUES, 'alumno_id');
    migrarColumnaAlFinal(hoja, ENCABEZADOS_BLOQUES, 'lugar');
    COLUMNAS_ESTADO_BLOQUE.forEach(function (nombre) {
      migrarColumnaAlFinal(hoja, ENCABEZADOS_BLOQUES, nombre);
    });
  }
  return hoja;
}

/**
 * Agrega una columna nueva en su lugar (siempre al final de las que ya
 * existían), con formato de texto, si todavía no está. No toca ninguna
 * fila con datos. Idempotente.
 */
function migrarColumnaAlFinal(hoja, encabezadosEsperados, nombre) {
  const encabezados = hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getDisplayValues()[0];
  if (encabezados.indexOf(nombre) !== -1) {
    return;
  }
  const columnaNueva = encabezadosEsperados.indexOf(nombre) + 1;
  hoja.getRange(1, columnaNueva, hoja.getMaxRows(), 1).setNumberFormat('@');
  hoja.getRange(1, columnaNueva).setValue(nombre);
}

/**
 * Texto para comparar sin que importen tildes, mayúsculas ni espacios de
 * más: "  Agustín  ALIENDRE " → "agustin aliendre". Lo usan el buscador de
 * alumnos, el importador y la migración.
 */
function normalizarTexto(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
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
