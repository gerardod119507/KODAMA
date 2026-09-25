/**
 * KODAMA — alta, edición y archivado de bloques desde la app.
 *
 * Los bloques que crea Gerardo a mano llevan id "b" + 8 hexadecimales, sin
 * sufijo de fecha, así nunca los confunde el generador del horario (que
 * solo toca ids con forma "idDeSerie-YYYY-MM-DD").
 */

const TIPOS_BLOQUE = ['fijo', 'variable', 'reunión'];

// Estado de la clase (Checkpoint 8). "movida" no se elige a mano: la pone
// moverBloque. Una celda vacía (bloques de antes) cuenta como programada.
const ESTADOS_BLOQUE = ['programada', 'dictada', 'movida', 'cancelada'];
const ESTADOS_A_MANO = ['programada', 'dictada', 'cancelada'];
// "Dictada" sirve para cobrar: solo existe en Academia Fractal. Cancelar y
// mover sí valen en todas las áreas (una clase de la U también se suspende).
const AREA_QUE_SE_DICTA = 'Academia Fractal';

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
    lugar: String(entrada.lugar || '').trim(),
    // Un bloque nuevo (también un duplicado) empieza programado y sin
    // historia: el estado nunca se copia.
    estado: 'programada', fecha_original: '', inicio_original: '', fin_original: '', motivo: ''
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
  quitarDictadaFueraDeFractal(bloque); // si cambió de área
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

function estadoDeBloque(bloque) {
  return String(bloque.estado || '').trim() || 'programada';
}

/**
 * Un bloque que no es de Academia Fractal nunca queda "dictado": vuelve a
 * programada (o a movida, si está en otro día u hora que el original).
 * Devuelve true si cambió algo.
 */
function quitarDictadaFueraDeFractal(bloque) {
  if (String(bloque.area || '').trim() === AREA_QUE_SE_DICTA || estadoDeBloque(bloque) !== 'dictada') {
    return false;
  }
  bloque.estado = bloque.fecha_original ? 'movida' : 'programada';
  return true;
}

/**
 * Marca una clase como dictada, cancelada (con un motivo corto opcional) o
 * de nuevo programada. Volver a "programada" una clase que se movió la
 * deja "movida": sigue estando en otro día que el original.
 */
function cambiarEstadoBloque(id, estado, motivo) {
  const pedido = String(estado || '').trim();
  if (ESTADOS_A_MANO.indexOf(pedido) === -1) {
    throw new Error('estado_invalido: "' + estado + '" (usa programada, dictada o cancelada; ' +
      '"movida" se pone sola al mover la clase)');
  }
  const ubicacion = buscarFilaDeBloque(id);
  const bloque = ubicacion.bloque;
  if (pedido === 'dictada' && bloque.area !== AREA_QUE_SE_DICTA) {
    throw new Error('dictada_solo_fractal: solo las clases de ' + AREA_QUE_SE_DICTA +
      ' se marcan dictadas; este bloque es de ' + bloque.area + '. Puedes cancelarlo o moverlo.');
  }
  bloque.estado = pedido === 'programada' && bloque.fecha_original ? 'movida' : pedido;
  bloque.motivo = pedido === 'cancelada' ? String(motivo || '').trim().slice(0, 200) : '';
  bloque.actualizado = ahoraEnTexto();
  escribirBloque(ubicacion, bloque);
  return bloque;
}

/**
 * Mueve una clase a otra fecha u hora y recuerda dónde estaba: la primera
 * vez guarda fecha, inicio y fin originales (moverla de nuevo no las pisa,
 * así la ficha sigue diciendo "movida del jue 24 al …" del día real).
 *
 * - Una clase programada pasa a "movida". Una dictada o cancelada queda
 *   como estaba (mover no la reprograma).
 * - Si vuelve exactamente a su fecha y hora originales, deja de estar
 *   movida.
 * - El generador del horario no toca una clase movida (ver generarHorario).
 */
function moverBloque(id, fecha, inicio, fin) {
  const ubicacion = buscarFilaDeBloque(id);
  const bloque = ubicacion.bloque;
  const antes = { fecha: bloque.fecha, inicio: bloque.inicio, fin: bloque.fin };
  bloque.fecha = String(fecha || '').trim();
  bloque.inicio = String(inicio || '').trim();
  bloque.fin = String(fin || '').trim();
  validarBloque(bloque);
  if (bloque.fecha === antes.fecha && bloque.inicio === antes.inicio && bloque.fin === antes.fin) {
    return bloque; // no cambió nada
  }

  if (!bloque.fecha_original) {
    bloque.fecha_original = antes.fecha;
    bloque.inicio_original = antes.inicio;
    bloque.fin_original = antes.fin;
  }
  const volvio = bloque.fecha === bloque.fecha_original &&
    bloque.inicio === bloque.inicio_original && bloque.fin === bloque.fin_original;
  const estado = estadoDeBloque(bloque);
  if (volvio) {
    bloque.fecha_original = '';
    bloque.inicio_original = '';
    bloque.fin_original = '';
    if (estado === 'movida') bloque.estado = 'programada';
  } else if (estado === 'programada') {
    bloque.estado = 'movida';
  }
  bloque.actualizado = ahoraEnTexto();
  escribirBloque(ubicacion, bloque);
  ordenarHojaBloques(ubicacion.hoja);
  return bloque;
}

/**
 * Corrección de datos (una sola vez, desde asegurarEstructura): los bloques
 * de Universidad, Startup o Personal que ya habían quedado "dictada" vuelven
 * a programada (o a movida si se habían movido). Lee solo las columnas
 * área, estado y fecha_original, y escribe la columna estado una sola vez,
 * únicamente si hay algo que corregir. Idempotente. Devuelve cuántos cambió.
 */
function corregirDictadasFueraDeFractal(hoja) {
  const filas = hoja.getLastRow() - 1;
  if (filas < 1) return 0;
  // Por el encabezado real de la hoja, no por la posición esperada.
  const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getDisplayValues()[0];
  const columna = function (nombre) { return encabezados.indexOf(nombre) + 1; };
  if (!columna('área') || !columna('estado') || !columna('fecha_original')) return 0;
  const leer = function (nombre) { return hoja.getRange(2, columna(nombre), filas, 1).getDisplayValues(); };
  const areas = leer('área');
  const estados = leer('estado');
  const originales = leer('fecha_original');
  let cambiados = 0;
  const nuevos = estados.map(function (fila, i) {
    const bloque = { area: areas[i][0], estado: fila[0], fecha_original: originales[i][0] };
    if (quitarDictadaFueraDeFractal(bloque)) cambiados++;
    return [bloque.estado];
  });
  if (cambiados) {
    hoja.getRange(2, columna('estado'), filas, 1).setValues(nuevos);
    Logger.log('Bloques fuera de Academia Fractal que estaban "dictada" y volvieron a programada: ' + cambiados);
  }
  return cambiados;
}

function escribirBloque(ubicacion, bloque) {
  ubicacion.hoja
    .getRange(ubicacion.fila, 1, 1, COLUMNAS_BLOQUES.length)
    .setValues([bloqueAFila(bloque)]);
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
    throw new Error('tipo_invalido: "' + bloque.tipo + '" (usa ' + TIPOS_BLOQUE.join(', ') + ')');
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
    throw new Error('area_invalida: "' + area + '" (usa ' + validas.join(', ') + ')');
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
