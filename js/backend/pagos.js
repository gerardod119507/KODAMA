/**
 * KODAMA — pagos y plantillas (antes apps-script/Pagos.gs y Plantillas.gs).
 *
 * Pagos: una fila por pago (o por cobro pendiente) de un alumno por un
 * periodo. El monto se calcula en la app (horas dictadas × tarifa del
 * alumno) y se guarda FIJO: si después cambia la tarifa, un pago ya
 * registrado no cambia. Archivar, nunca borrar.
 *
 * Plantillas: lo que se repite de un bloque (área, tipo, tema, alumnos,
 * duración, lugar, etiqueta). Nunca la fecha ni la hora. Archivar, nunca
 * borrar.
 */
(function (B) {
  const CAMPOS_EDITABLES_PAGO = ['alumno_id', 'desde', 'hasta', 'monto', 'fecha_pago', 'estado', 'notas'];
  const ESTADOS_PAGO = ['pendiente', 'pagado'];

  /** Todos los pagos, archivados incluidos (con archivado: "TRUE"). */
  B.listarPagos = function () {
    return KodamaDB.leer('pagos');
  };

  /** "Bs 350", "350,50" → "350", "350.5". Vacío o negativo falla. */
  function normalizarMonto(texto) {
    const limpio = String(texto == null ? '' : texto).replace(/bs\.?/i, '').replace(/\s+/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(limpio)) {
      throw new Error('monto_invalido: "' + texto + '" (usa un número, ej. 350)');
    }
    return String(Math.round(Number(limpio) * 100) / 100);
  }

  function validarFechaPago(texto, campo) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) {
      throw new Error('pago_fecha_invalida: campo "' + campo + '" (usa YYYY-MM-DD, ej. 2026-09-30)');
    }
  }

  /** Deja un pago listo para guardar, o tira un error con el motivo. */
  async function prepararPago(pago) {
    pago.alumno_id = String(pago.alumno_id || '').trim();
    if (!pago.alumno_id || pago.alumno_id.indexOf(',') !== -1) {
      throw new Error('falta_alumno: un pago es de un solo alumno');
    }
    await B.validarIdsAlumnos(pago.alumno_id);
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
      throw new Error('estado_pago_invalido: "' + pago.estado + '" (usa pendiente o pagado)');
    }
    if (pago.estado === 'pagado' && !pago.fecha_pago) {
      pago.fecha_pago = B.hoy();
    }
    if (pago.fecha_pago) validarFechaPago(pago.fecha_pago, 'fecha_pago');
    pago.notas = String(pago.notas || '');
    return pago;
  }

  B.crearPago = async function (datos) {
    const entrada = datos || {};
    const pago = { id: B.nuevoId('p'), creado: B.ahora(), archivado: '' };
    CAMPOS_EDITABLES_PAGO.forEach(function (campo) { pago[campo] = entrada[campo]; });
    await prepararPago(pago);
    await B.insertarConIdNuevo('pagos', pago, 'p');
    return pago;
  };

  async function buscarPago(id) {
    const buscado = String(id || '').trim();
    if (!buscado) throw new Error('falta_id_pago');
    const encontrados = await KodamaDB.leer('pagos', [['id', 'eq', buscado]]);
    if (!encontrados.length) throw new Error('pago_no_encontrado: ' + buscado);
    return encontrados[0];
  }

  B.actualizarPago = async function (id, cambios) {
    const pago = await buscarPago(id);
    CAMPOS_EDITABLES_PAGO.forEach(function (campo) {
      if (cambios && cambios[campo] !== undefined && cambios[campo] !== null) {
        pago[campo] = cambios[campo];
      }
    });
    await prepararPago(pago);
    const fila = {};
    CAMPOS_EDITABLES_PAGO.forEach(function (campo) { fila[campo] = pago[campo]; });
    await KodamaDB.actualizar('pagos', [['id', 'eq', pago.id]], fila);
    return pago;
  };

  B.archivarPago = async function (id) {
    const pago = await buscarPago(id);
    pago.archivado = 'TRUE';
    await KodamaDB.actualizar('pagos', [['id', 'eq', pago.id]], { archivado: 'TRUE' });
    return pago;
  };

  // --- Plantillas ----------------------------------------------------

  /** Plantillas activas (sin las archivadas), en el orden en que se crearon. */
  B.listarPlantillas = function () {
    return KodamaDB.leer('plantillas', [['archivado', 'is', false]]);
  };

  B.crearPlantilla = async function (datos) {
    const e = datos || {};
    const plantilla = {
      id: B.nuevoId('t'),
      nombre: String(e.nombre || '').trim().slice(0, 60),
      area: String(e.area || '').trim(),
      tipo: String(e.tipo || '').trim(),
      titulo: String(e.titulo || '').trim(),
      alumno_id: B.normalizarIdsAlumnos(e.alumno_id),
      duracion: String(e.duracion == null ? '' : e.duracion).trim(),
      lugar: String(e.lugar || '').trim(),
      etiqueta: String(e.etiqueta || '').trim(),
      creado: B.ahora(),
      archivado: ''
    };
    if (!plantilla.nombre) throw new Error('falta_nombre: ponle un nombre a la plantilla');
    await B.validarArea(plantilla.area);
    if (B.TIPOS_BLOQUE.indexOf(plantilla.tipo) === -1) {
      throw new Error('tipo_invalido: "' + plantilla.tipo + '" (usa ' + B.TIPOS_BLOQUE.join(', ') + ')');
    }
    if (!/^\d+$/.test(plantilla.duracion) || Number(plantilla.duracion) < 5 || Number(plantilla.duracion) > 720) {
      throw new Error('duracion_invalida: "' + plantilla.duracion + '" (minutos, entre 5 y 720)');
    }
    if (plantilla.area !== B.AREA_FRACTAL) plantilla.alumno_id = '';
    await B.validarIdsAlumnos(plantilla.alumno_id);
    if (!plantilla.titulo && !plantilla.alumno_id) throw new Error('falta_titulo');

    await B.insertarConIdNuevo('plantillas', plantilla, 't');
    return plantilla;
  };

  B.archivarPlantilla = async function (id) {
    const buscado = String(id || '').trim();
    if (!buscado) throw new Error('falta_id_plantilla');
    const encontradas = await KodamaDB.leer('plantillas', [['id', 'eq', buscado]]);
    if (!encontradas.length) throw new Error('plantilla_no_encontrada: ' + buscado);
    await KodamaDB.actualizar('plantillas', [['id', 'eq', buscado]], { archivado: 'TRUE' });
    const plantilla = encontradas[0];
    plantilla.archivado = 'TRUE';
    return plantilla;
  };
})(KodamaBackend);
