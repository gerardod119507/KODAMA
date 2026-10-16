/**
 * KODAMA — bloques: leer, crear, editar, mover, estado, archivar, borrar
 * (antes apps-script/Bloques.gs y la lectura de Code.gs).
 *
 * Los bloques que crea Gerardo a mano llevan id "b" + 8 hexadecimales, sin
 * sufijo de fecha, así nunca los confunde el generador del horario (que
 * solo toca ids con forma "idDeSerie-YYYY-MM-DD").
 */
(function (B) {
  const TIPOS_BLOQUE = ['fijo', 'variable', 'reunión'];
  B.TIPOS_BLOQUE = TIPOS_BLOQUE;

  // Estado de la clase (Checkpoint 8). "movida" no se elige a mano: la pone
  // moverBloque. Vacío (bloques de antes) cuenta como programada.
  const ESTADOS_A_MANO = ['programada', 'dictada', 'cancelada'];
  // "Dictada" sirve para cobrar: solo existe en Academia Fractal. Cancelar y
  // mover sí valen en todas las áreas (una clase de la U también se suspende).
  const AREA_QUE_SE_DICTA = B.AREA_FRACTAL;

  // Campos que la app puede escribir. El resto (id, creado, actualizado,
  // archivado) los maneja el backend.
  const CAMPOS_EDITABLES_BLOQUE = ['titulo', 'area', 'tipo', 'fecha', 'inicio', 'fin', 'etiqueta', 'notas', 'alumno_id', 'lugar'];

  // Un bloque suelto (creado con el +, duplicado o importado): "b" + 8
  // hexadecimales. Los de un horario fijo son "idDeSerie-fecha".
  const PATRON_ID_SUELTO = /^b[0-9a-f]{8}$/;
  const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

  // --- Lectura -------------------------------------------------------

  B.listarBloquesDia = async function (fecha) {
    if (!fecha) throw new Error('falta_fecha');
    if (!PATRON_FECHA.test(fecha)) return [];
    const bloques = await KodamaDB.leer('bloques', [['fecha', 'eq', fecha], ['archivado', 'is', false]]);
    return bloques.sort(function (a, b) { return a.inicio.localeCompare(b.inicio); });
  };

  /**
   * Bloques no archivados entre dos fechas, ambas incluidas (vista de
   * semana), ordenados por fecha y después por hora de inicio.
   */
  B.listarBloquesRango = async function (desde, hasta) {
    if (!PATRON_FECHA.test(desde || '') || !PATRON_FECHA.test(hasta || '')) {
      throw new Error('rango_invalido: desde y hasta tienen que ser YYYY-MM-DD (recibido "' + desde + '" a "' + hasta + '")');
    }
    if (desde > hasta) {
      throw new Error('rango_invalido: "desde" (' + desde + ') es posterior a "hasta" (' + hasta + ')');
    }
    return KodamaDB.leer('bloques', [['fecha', 'gte', desde], ['fecha', 'lte', hasta], ['archivado', 'is', false]]);
  };

  async function buscarBloque(id) {
    const buscado = String(id || '').trim();
    if (!buscado) throw new Error('falta_id_bloque');
    const encontrados = await KodamaDB.leer('bloques', [['id', 'eq', buscado]]);
    if (!encontrados.length) throw new Error('bloque_no_encontrado: ' + buscado);
    return encontrados[0];
  }

  /** Escribe el bloque entero (todas sus columnas), como hacía setValues en la fila. */
  async function escribirBloque(bloque) {
    const cambios = Object.assign({}, bloque);
    delete cambios.id;
    await KodamaDB.actualizar('bloques', [['id', 'eq', bloque.id]], cambios);
  }

  // --- Estado ----------------------------------------------------------

  function estadoDeBloque(bloque) {
    return String(bloque.estado || '').trim() || 'programada';
  }
  B.estadoDeBloque = estadoDeBloque;

  /**
   * Un bloque que no es de Academia Fractal nunca queda "dictado": vuelve a
   * programada (o a movida, si está en otro día u hora que el original).
   * Devuelve true si cambió algo.
   */
  B.quitarDictadaFueraDeFractal = function (bloque) {
    if (String(bloque.area || '').trim() === AREA_QUE_SE_DICTA || estadoDeBloque(bloque) !== 'dictada') {
      return false;
    }
    bloque.estado = bloque.fecha_original ? 'movida' : 'programada';
    return true;
  };

  // --- Validación ------------------------------------------------------

  async function validarBloque(bloque) {
    // Con alumnos vinculados el título es opcional: el nombre que se ve en
    // la app sale de los alumnos, no del título (Checkpoint 7).
    if (!bloque.titulo && !bloque.alumno_id) {
      throw new Error('falta_titulo');
    }
    await B.validarArea(bloque.area);
    await B.validarIdsAlumnos(bloque.alumno_id);
    if (TIPOS_BLOQUE.indexOf(bloque.tipo) === -1) {
      throw new Error('tipo_invalido: "' + bloque.tipo + '" (usa ' + TIPOS_BLOQUE.join(', ') + ')');
    }
    B.validarFecha(bloque.fecha, bloque.titulo, 'fecha');
    B.validarHora(bloque.inicio, bloque.titulo, 'inicio');
    B.validarHora(bloque.fin, bloque.titulo, 'fin');
    if (bloque.inicio >= bloque.fin) {
      throw new Error('horario_invertido: "' + bloque.titulo + '" (inicio es después de fin)');
    }
  }

  // --- Escritura -------------------------------------------------------

  B.crearBloque = async function (datos) {
    const entrada = datos || {};
    const ahora = B.ahora();
    const bloque = {
      id: B.nuevoId('b'),
      titulo: String(entrada.titulo || '').trim(),
      area: String(entrada.area || '').trim(),
      tipo: String(entrada.tipo || '').trim(),
      fecha: String(entrada.fecha || '').trim(),
      inicio: String(entrada.inicio || '').trim(),
      fin: String(entrada.fin || '').trim(),
      etiqueta: String(entrada.etiqueta || '').trim(),
      notas: String(entrada.notas || ''),
      creado: ahora,
      actualizado: ahora,
      archivado: '',
      alumno_id: B.normalizarIdsAlumnos(entrada.alumno_id),
      lugar: String(entrada.lugar || '').trim(),
      // Un bloque nuevo (también un duplicado) empieza programado y sin
      // historia: el estado nunca se copia.
      estado: 'programada', fecha_original: '', inicio_original: '', fin_original: '', motivo: ''
    };

    await validarBloque(bloque);
    await B.insertarConIdNuevo('bloques', bloque, 'b');
    return bloque;
  };

  B.actualizarBloque = async function (id, cambios) {
    const bloque = await buscarBloque(id);

    CAMPOS_EDITABLES_BLOQUE.forEach(function (campo) {
      if (cambios && cambios[campo] !== undefined && cambios[campo] !== null) {
        bloque[campo] = campo === 'notas' ? String(cambios[campo]) : String(cambios[campo]).trim();
      }
    });
    bloque.alumno_id = B.normalizarIdsAlumnos(bloque.alumno_id);
    B.quitarDictadaFueraDeFractal(bloque); // si cambió de área
    bloque.actualizado = B.ahora();

    await validarBloque(bloque);
    await escribirBloque(bloque);
    return bloque;
  };

  /**
   * Marca una clase como dictada, cancelada (con un motivo corto opcional) o
   * de nuevo programada. Volver a "programada" una clase que se movió la
   * deja "movida": sigue estando en otro día que el original.
   */
  B.cambiarEstadoBloque = async function (id, estado, motivo) {
    const pedido = String(estado || '').trim();
    if (ESTADOS_A_MANO.indexOf(pedido) === -1) {
      throw new Error('estado_invalido: "' + estado + '" (usa programada, dictada o cancelada; ' +
        '"movida" se pone sola al mover la clase)');
    }
    const bloque = await buscarBloque(id);
    if (pedido === 'dictada' && bloque.area !== AREA_QUE_SE_DICTA) {
      throw new Error('dictada_solo_fractal: solo las clases de ' + AREA_QUE_SE_DICTA +
        ' se marcan dictadas; este bloque es de ' + bloque.area + '. Puedes cancelarlo o moverlo.');
    }
    bloque.estado = pedido === 'programada' && bloque.fecha_original ? 'movida' : pedido;
    bloque.motivo = pedido === 'cancelada' ? String(motivo || '').trim().slice(0, 200) : '';
    bloque.actualizado = B.ahora();
    await escribirBloque(bloque);
    return bloque;
  };

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
  B.moverBloque = async function (id, fecha, inicio, fin) {
    const bloque = await buscarBloque(id);
    const antes = { fecha: bloque.fecha, inicio: bloque.inicio, fin: bloque.fin };
    bloque.fecha = String(fecha || '').trim();
    bloque.inicio = String(inicio || '').trim();
    bloque.fin = String(fin || '').trim();
    await validarBloque(bloque);
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
    bloque.actualizado = B.ahora();
    await escribirBloque(bloque);
    return bloque;
  };

  B.archivarBloque = async function (id) {
    const bloque = await buscarBloque(id);
    bloque.archivado = 'TRUE';
    bloque.actualizado = B.ahora();
    await escribirBloque(bloque);
    return bloque;
  };

  /**
   * Borra DE VERDAD una clase suelta (para las de Fractal marcadas "fijo"
   * por error). Una clase de un horario fijo no se borra aquí: el generador
   * la volvería a crear; se borra el horario fijo. Una dictada tampoco:
   * cuenta para el cobro.
   */
  B.borrarBloque = async function (id) {
    const bloque = await buscarBloque(id);
    if (!PATRON_ID_SUELTO.test(bloque.id)) {
      throw new Error('bloque_de_horario_fijo: esta clase sale de un horario fijo; bórrala desde Horario.');
    }
    if (estadoDeBloque(bloque) === 'dictada') {
      throw new Error('bloque_dictado: una clase dictada no se borra (cuenta para el cobro).');
    }
    await KodamaDB.borrar('bloques', [['id', 'eq', bloque.id]]);
    return { borrado: bloque.id };
  };

  /**
   * Clases sueltas de Academia Fractal marcadas "fijo", de hoy en adelante y
   * sin archivar: las que se crearon con el + eligiendo "Fijo". Ordenadas.
   */
  B.listarFijosSueltos = async function () {
    const bloques = await KodamaDB.leer('bloques', [
      ['area', 'eq', AREA_QUE_SE_DICTA], ['tipo', 'eq', 'fijo'], ['archivado', 'is', false],
      ['fecha', 'gte', B.hoy()], ['id', 'like', 'b*']
    ]);
    return bloques.filter(function (b) { return PATRON_ID_SUELTO.test(b.id); });
  };
})(KodamaBackend);
