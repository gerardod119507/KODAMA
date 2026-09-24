/**
 * KODAMA — pagos de los alumnos de Academia Fractal (Checkpoint 8).
 *
 * Hoja "Pagos": una fila por pago (o por cobro pendiente) de un alumno por
 * un periodo. El monto se calcula en la app (horas dictadas × tarifa del
 * alumno) y se guarda FIJO en la fila: si después cambia la tarifa, un pago
 * ya registrado no cambia. Archivar, nunca borrar.
 */

const HOJA_PAGOS = 'Pagos';
const COLUMNAS_PAGOS = [
  'id', 'alumno_id', 'desde', 'hasta', 'monto', 'fecha_pago', 'estado', 'notas', 'creado', 'archivado'
];
const CAMPOS_EDITABLES_PAGO = ['alumno_id', 'desde', 'hasta', 'monto', 'fecha_pago', 'estado', 'notas'];
const ESTADOS_PAGO = ['pendiente', 'pagado'];

function asegurarHojaPagos(libro) {
  const hoja = libro.getSheetByName(HOJA_PAGOS) || libro.insertSheet(HOJA_PAGOS);
  if (hoja.getLastRow() === 0) {
    // Todo en texto, igual que Bloques: fechas YYYY-MM-DD sin conversión.
    hoja.getRange(1, 1, hoja.getMaxRows(), COLUMNAS_PAGOS.length).setNumberFormat('@');
    hoja.getRange(1, 1, 1, COLUMNAS_PAGOS.length).setValues([COLUMNAS_PAGOS]);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function hojaPagos() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_PAGOS);
}

function filaAPago(fila) {
  const pago = {};
  COLUMNAS_PAGOS.forEach(function (clave, i) { pago[clave] = fila[i] || ''; });
  return pago;
}

function pagoAFila(pago) {
  return COLUMNAS_PAGOS.map(function (clave) { return pago[clave] != null ? pago[clave] : ''; });
}

/** Todos los pagos, archivados incluidos (con archivado: "TRUE"). */
function listarPagos() {
  const hoja = hojaPagos();
  if (hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, COLUMNAS_PAGOS.length).getDisplayValues()
    .filter(function (fila) { return fila[0]; })
    .map(filaAPago);
}

/** "Bs 350", "350,50" → "350", "350.5". Vacío o negativo falla. */
function normalizarMonto(texto) {
  const limpio = String(texto == null ? '' : texto).replace(/bs\.?/i, '').replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(limpio)) {
    throw new Error('monto_invalido: "' + texto + '" (usá un número, ej. 350)');
  }
  return String(Math.round(Number(limpio) * 100) / 100);
}

/** Deja un pago listo para guardar, o tira un error con el motivo. */
function prepararPago(pago) {
  pago.alumno_id = String(pago.alumno_id || '').trim();
  if (!pago.alumno_id || pago.alumno_id.indexOf(',') !== -1) {
    throw new Error('falta_alumno: un pago es de un solo alumno');
  }
  validarIdsAlumnos(pago.alumno_id);
  ['desde', 'hasta', 'fecha_pago'].forEach(function (campo) {
    pago[campo] = String(pago[campo] || '').trim();
  });
  validarFechaPago(pago.desde, 'desde');
  validarFechaPago(pago.hasta, 'hasta');
  if (pago.desde > pago.hasta) {
    throw new Error('periodo_invalido: "desde" (' + pago.desde + ') es posterior a "hasta" (' + pago.hasta + ')');
  }
  pago.monto = normalizarMonto(pago.monto);
  pago.estado = String(pago.estado || '').trim() || 'pendiente';
  if (ESTADOS_PAGO.indexOf(pago.estado) === -1) {
    throw new Error('estado_pago_invalido: "' + pago.estado + '" (usá pendiente o pagado)');
  }
  if (pago.estado === 'pagado' && !pago.fecha_pago) {
    pago.fecha_pago = hoyEnTexto();
  }
  if (pago.fecha_pago) validarFechaPago(pago.fecha_pago, 'fecha_pago');
  pago.notas = String(pago.notas || '');
  return pago;
}

function validarFechaPago(texto, campo) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) {
    throw new Error('pago_fecha_invalida: campo "' + campo + '" (usá YYYY-MM-DD, ej. 2026-09-30)');
  }
}

function crearPago(datos) {
  const entrada = datos || {};
  const pago = { id: 'p' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase(), creado: ahoraEnTexto(), archivado: '' };
  CAMPOS_EDITABLES_PAGO.forEach(function (campo) { pago[campo] = entrada[campo]; });
  prepararPago(pago);
  hojaPagos().appendRow(pagoAFila(pago));
  return pago;
}

function buscarFilaDePago(id) {
  const buscado = String(id || '').trim();
  if (!buscado) throw new Error('falta_id_pago');
  const hoja = hojaPagos();
  const filas = hoja.getDataRange().getDisplayValues();
  for (let f = 1; f < filas.length; f++) {
    if (filas[f][0] === buscado) {
      return { hoja: hoja, fila: f + 1, pago: filaAPago(filas[f]) };
    }
  }
  throw new Error('pago_no_encontrado: ' + buscado);
}

function actualizarPago(id, cambios) {
  const ubicacion = buscarFilaDePago(id);
  const pago = ubicacion.pago;
  CAMPOS_EDITABLES_PAGO.forEach(function (campo) {
    if (cambios && cambios[campo] !== undefined && cambios[campo] !== null) {
      pago[campo] = cambios[campo];
    }
  });
  prepararPago(pago);
  ubicacion.hoja.getRange(ubicacion.fila, 1, 1, COLUMNAS_PAGOS.length).setValues([pagoAFila(pago)]);
  return pago;
}

function archivarPago(id) {
  const ubicacion = buscarFilaDePago(id);
  ubicacion.pago.archivado = 'TRUE';
  ubicacion.hoja.getRange(ubicacion.fila, 1, 1, COLUMNAS_PAGOS.length).setValues([pagoAFila(ubicacion.pago)]);
  return ubicacion.pago;
}
