/**
 * KODAMA — horario fijo: reglas y su generador (antes apps-script/Horario.gs).
 *
 * Cada fila de la tabla horario es una REGLA ("esta clase se repite estos
 * días, entre estas fechas"). generarHorario() la convierte en bloques
 * individuales (tipo "fijo"), uno por cada fecha que cumple la regla, y
 * escribe todos los cambios en un solo envío.
 *
 * Nunca toca el pasado: solo crea/actualiza ocurrencias de hoy en adelante,
 * aunque "desde" de la regla sea anterior a hoy.
 */
(function (B) {
  // Campos que la app puede escribir en una regla. El id y archivado los
  // maneja el backend.
  const CAMPOS_EDITABLES_REGLA = ['titulo', 'area', 'dias', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'alumno_id', 'lugar'];

  // Primeras 3 letras, sin tilde, en minúscula. parseDias() normaliza así
  // cualquier variante ("Mié", "mie", "MIE...") antes de buscar aquí.
  const DIAS_SEMANA = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };

  // Un id de serie es SIEMPRE "h" + 8 caracteres hexadecimales (la base lo
  // exige). Un bloque generado es "idDeSerie-YYYY-MM-DD".
  const PATRON_ID_SERIE = /^h[0-9a-f]{8}$/;

  /** Una regla cuenta si tiene título o alumnos (Checkpoint 7). */
  function reglaConContenido(regla) {
    return Boolean(regla.titulo || regla.alumno_id);
  }

  B.esIdDeSerie = function (valor) {
    return PATRON_ID_SERIE.test(String(valor || '').trim());
  };

  /**
   * Separa el id de un bloque generado en { idSerie, fecha }. Devuelve null
   * si el bloque no viene de una serie (por ejemplo una reunión suelta).
   */
  B.partirIdDeBloque = function (idBloque) {
    const partes = String(idBloque || '').match(/^(.+)-(\d{4}-\d{2}-\d{2})$/);
    return partes ? { idSerie: partes[1], fecha: partes[2] } : null;
  };

  function quitarTildes(texto) {
    return texto
      .replace(/[áÁ]/g, 'a').replace(/[éÉ]/g, 'e').replace(/[íÍ]/g, 'i')
      .replace(/[óÓ]/g, 'o').replace(/[úÚ]/g, 'u');
  }

  B.parseDias = function (texto, tituloParaError) {
    const tokens = String(texto || '').split(/[^a-záéíóúñA-ZÁÉÍÓÚÑ]+/).filter(Boolean);
    if (tokens.length === 0) {
      throw new Error('horario_sin_dias: "' + tituloParaError + '"');
    }
    return tokens.map(function (token) {
      const clave = quitarTildes(token).toLowerCase().slice(0, 3);
      if (!(clave in DIAS_SEMANA)) {
        throw new Error(
          'dia_invalido: "' + token + '" en "' + tituloParaError + '" ' +
          '(usa Lun, Mar, Mié, Jue, Vie, Sáb o Dom)'
        );
      }
      return DIAS_SEMANA[clave];
    });
  };

  /**
   * Valida una regla y la deja lista para el generador (días como números).
   * Mismos errores, en el mismo orden, que filaARegla en Horario.gs.
   */
  B.reglaParaGenerar = function (fila, id) {
    const alumnoId = fila.alumno_id || '';
    // En los mensajes de error, una regla sin título se nombra por sus alumnos.
    const titulo = fila.titulo || alumnoId;
    const area = fila.area;
    const inicio = fila.inicio;
    const fin = fila.fin;
    const desde = fila.desde;
    const hasta = fila.hasta;

    if (!area) throw new Error('horario_sin_area: "' + titulo + '"');
    B.validarHora(inicio, titulo, 'inicio');
    B.validarHora(fin, titulo, 'fin');
    if (inicio >= fin) {
      throw new Error('horario_horario_invertido: "' + titulo + '" (inicio es después de fin)');
    }
    B.validarFecha(desde, titulo, 'desde');
    B.validarFecha(hasta, titulo, 'hasta');
    if (desde > hasta) {
      throw new Error('horario_rango_invertido: "' + titulo + '" (desde es posterior a hasta)');
    }

    return {
      id: id, titulo: fila.titulo || '', area: area, dias: B.parseDias(fila.dias, titulo),
      inicio: inicio, fin: fin, desde: desde, hasta: hasta, etiqueta: fila.etiqueta || '',
      alumno_id: alumnoId,
      lugar: fila.lugar || ''
    };
  };

  function formatearFechaUTC(fecha) {
    const anio = fecha.getUTCFullYear();
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getUTCDate()).padStart(2, '0');
    return anio + '-' + mes + '-' + dia;
  }

  B.calcularOcurrencias = function (regla, hoy) {
    const desde = regla.desde.split('-').map(Number);
    const hasta = regla.hasta.split('-').map(Number);
    const fechas = [];
    const unDia = 24 * 60 * 60 * 1000;
    let cursor = Date.UTC(desde[0], desde[1] - 1, desde[2]);
    const limite = Date.UTC(hasta[0], hasta[1] - 1, hasta[2]);

    // Fechas en UTC puro (Date.UTC), sin conversión de zona horaria: aquí
    // solo se hace aritmética de calendario ("qué día de la semana cae tal
    // fecha"), no se trabaja con instantes reales.
    while (cursor <= limite) {
      const fecha = new Date(cursor);
      if (regla.dias.indexOf(fecha.getUTCDay()) !== -1) {
        const texto = formatearFechaUTC(fecha);
        if (texto >= hoy) fechas.push(texto);
      }
      cursor += unDia;
    }
    return fechas;
  };

  // --- Generador -------------------------------------------------------

  const CAMPOS_COMPARABLES = ['titulo', 'area', 'tipo', 'fecha', 'inicio', 'fin', 'etiqueta', 'notas',
    'archivado', 'alumno_id', 'lugar', 'estado', 'fecha_original', 'inicio_original', 'fin_original', 'motivo'];

  function cambioAlgo(antes, despues) {
    return CAMPOS_COMPARABLES.some(function (campo) { return (antes[campo] || '') !== (despues[campo] || ''); });
  }

  B.generarHorario = async function () {
    const hoy = B.hoy();
    const ahora = B.ahora();

    // Solo hacen falta los bloques generados por alguna regla (serie_id lo
    // calcula la base a partir del id).
    const lecturas = await Promise.all([
      KodamaDB.leer('horario'),
      KodamaDB.leer('bloques', [['serie_id', 'not_null']])
    ]);
    const reglas = lecturas[0];
    const generados = lecturas[1];

    const porId = {};
    generados.forEach(function (bloque) { porId[bloque.id] = bloque; });
    const aEscribir = {}; // id → bloque nuevo o cambiado

    let creados = 0;
    let actualizados = 0;
    let archivados = 0;

    reglas.forEach(function (fila) {
      if (!reglaConContenido(fila)) return;
      const id = fila.id;

      // Una regla archivada no genera nada, pero igual pasa por el barrido
      // de abajo para que sus bloques futuros queden archivados.
      const archivada = String(fila.archivado || '').trim() === 'TRUE';
      const regla = B.reglaParaGenerar(fila, id);
      const ocurrencias = archivada ? [] : B.calcularOcurrencias(regla, hoy);
      const idsValidos = {};

      ocurrencias.forEach(function (fecha) {
        const idBloque = id + '-' + fecha;
        idsValidos[idBloque] = true;
        const existente = porId[idBloque];

        if (existente) {
          if (existente.archivado === 'TRUE') {
            return; // cancelada a mano (bloque archivado): no se toca
          }
          if (existente.fecha_original) {
            return; // movida a otro día u hora: manda lo que eligió Gerardo
          }
          // Se refrescan los campos que vienen de la regla; notas, etiqueta
          // y archivado quedan como estén (son del bloque puntual, no de la
          // regla, y no deben perderse al regenerar).
          const bloque = Object.assign({}, existente);
          bloque.titulo = regla.titulo;
          bloque.area = regla.area;
          B.quitarDictadaFueraDeFractal(bloque); // la regla cambió de área
          bloque.tipo = 'fijo';
          bloque.inicio = regla.inicio;
          bloque.fin = regla.fin;
          bloque.alumno_id = regla.alumno_id;
          // El lugar sale de la regla, igual que el título y la hora: si
          // cambia el aula en la regla, cambia en todas las clases futuras.
          bloque.lugar = regla.lugar;
          bloque.actualizado = ahora;
          // Solo se escribe si de verdad cambió algo: la cuenta de
          // "actualizados" es la misma, pero el envío es más corto.
          if (cambioAlgo(existente, bloque)) aEscribir[idBloque] = bloque;
          porId[idBloque] = bloque;
          actualizados++;
        } else {
          const nuevo = {
            id: idBloque, titulo: regla.titulo, area: regla.area, tipo: 'fijo',
            fecha: fecha, inicio: regla.inicio, fin: regla.fin, etiqueta: regla.etiqueta,
            notas: '', creado: ahora, actualizado: ahora, archivado: '',
            alumno_id: regla.alumno_id, lugar: regla.lugar,
            estado: 'programada', fecha_original: '', inicio_original: '', fin_original: '', motivo: ''
          };
          aEscribir[idBloque] = nuevo;
          porId[idBloque] = nuevo;
          creados++;
        }
      });

      // Ocurrencias futuras que ya existían pero la regla editada ya no
      // genera (por ej. se acortó "hasta" o se sacó un día): se archivan,
      // nunca se borran.
      Object.keys(porId).forEach(function (idBloque) {
        if (idBloque.indexOf(id + '-') !== 0 || idsValidos[idBloque]) return;
        const bloque = Object.assign({}, porId[idBloque]);
        if (bloque.fecha < hoy || bloque.archivado === 'TRUE') return;
        bloque.archivado = 'TRUE';
        bloque.actualizado = ahora;
        aEscribir[idBloque] = bloque;
        porId[idBloque] = bloque;
        archivados++;
      });
    });

    await KodamaDB.guardar('bloques', Object.keys(aEscribir).map(function (id) { return aEscribir[id]; }));
    return { creados: creados, actualizados: actualizados, archivados: archivados };
  };

  /** La regla guardada, y si se pidió, el resumen de regenerar el horario. */
  B.conRegeneracion = async function (reglaPendiente, regenerar) {
    const regla = await reglaPendiente;
    if (regenerar) regla.generado = await B.generarHorario();
    return regla;
  };

  // --- Series ------------------------------------------------------------

  /**
   * Series que hoy tienen bloques, con cuántos y de qué regla vienen.
   * Incluye series huérfanas (cuya regla ya no existe), que son justamente
   * las que hay que poder limpiar.
   */
  B.listarSeries = async function () {
    const lecturas = await Promise.all([
      KodamaDB.leer('horario'),
      KodamaDB.leer('bloques', [['serie_id', 'not_null']])
    ]);
    const tituloPorId = {};
    lecturas[0].forEach(function (regla) { tituloPorId[regla.id] = regla.titulo; });

    const series = {};
    const orden = [];
    lecturas[1].forEach(function (bloque) {
      const partes = B.partirIdDeBloque(bloque.id);
      if (!partes) return;
      if (!series[partes.idSerie]) {
        series[partes.idSerie] = { idSerie: partes.idSerie, titulo: tituloPorId[partes.idSerie] || '', cantidad: 0 };
        orden.push(partes.idSerie);
      }
      series[partes.idSerie].cantidad++;
    });
    return orden.map(function (id) { return series[id]; });
  };

  /**
   * Borra (de verdad, no archiva) los bloques generados por una serie. Es
   * la excepción a "archivar en vez de borrar": existe para poder limpiar
   * datos de prueba, y solo toca bloques cuyo id pertenece a esa serie.
   */
  B.borrarSerie = async function (idSerie) {
    const id = String(idSerie || '').trim();
    if (!id) throw new Error('falta_id_serie');
    const borrados = await KodamaDB.borrar('bloques', [['serie_id', 'eq', id]]);
    return { borrados: borrados };
  };

  // --- Reglas ------------------------------------------------------------

  async function buscarRegla(id) {
    const buscado = String(id || '').trim();
    if (!buscado) throw new Error('falta_id_regla');
    const encontradas = await KodamaDB.leer('horario', [['id', 'eq', buscado]]);
    if (!encontradas.length) throw new Error('regla_no_encontrada: ' + buscado);
    return encontradas[0];
  }

  async function escribirRegla(regla) {
    const cambios = {};
    Object.keys(regla).forEach(function (campo) {
      if (campo !== 'id' && campo !== 'generado') cambios[campo] = regla[campo];
    });
    await KodamaDB.actualizar('horario', [['id', 'eq', regla.id]], cambios);
  }

  /** Misma validación que usa el generador, para fallar al guardar y no después. */
  async function validarRegla(regla) {
    // Una clase de Fractal se identifica por sus alumnos: el título es
    // opcional si tiene alumnos (el nombre sale del vínculo, no del título).
    if (!regla.titulo && !regla.alumno_id) {
      throw new Error('falta_titulo');
    }
    await B.validarArea(regla.area);
    await B.validarIdsAlumnos(regla.alumno_id);
    B.reglaParaGenerar(regla, regla.id);
  }

  /** Las reglas tal como están, archivadas incluidas, para el editor de la app. */
  B.listarHorario = async function () {
    return (await KodamaDB.leer('horario')).filter(reglaConContenido);
  };

  B.crearRegla = async function (datos) {
    const entrada = datos || {};
    const regla = { id: B.nuevoId('h'), archivado: '' };
    CAMPOS_EDITABLES_REGLA.forEach(function (campo) {
      const valor = entrada[campo];
      regla[campo] = campo === 'notas' ? String(valor || '') : String(valor || '').trim();
    });
    regla.alumno_id = B.normalizarIdsAlumnos(regla.alumno_id);

    await validarRegla(regla);
    await B.insertarConIdNuevo('horario', regla, 'h');
    return regla;
  };

  B.actualizarRegla = async function (id, cambios) {
    const regla = await buscarRegla(id);
    CAMPOS_EDITABLES_REGLA.forEach(function (campo) {
      if (cambios && cambios[campo] !== undefined && cambios[campo] !== null) {
        regla[campo] = campo === 'notas' ? String(cambios[campo]) : String(cambios[campo]).trim();
      }
    });
    regla.alumno_id = B.normalizarIdsAlumnos(regla.alumno_id);

    await validarRegla(regla);
    await escribirRegla(regla);
    return regla;
  };

  /**
   * Archiva una regla: deja de generar bloques. Los bloques futuros que ya
   * había generado se archivan en la próxima corrida de generarHorario().
   */
  B.archivarRegla = async function (id) {
    const regla = await buscarRegla(id);
    regla.archivado = 'TRUE';
    await escribirRegla(regla);
    return regla;
  };

  /**
   * Borra DE VERDAD un horario fijo (Gerardo lo pidió para los alumnos
   * fijos de Fractal, que se reprograman cada mes): la regla y sus clases de
   * hoy en adelante. Las pasadas quedan (y las dictadas, aunque sean de
   * hoy): cuentan para el cobro y las estadísticas.
   *
   * Primero las clases y después la regla: si algo se corta a la mitad,
   * queda la regla y "Regenerar" vuelve a dejar todo como estaba.
   */
  B.borrarRegla = async function (id) {
    const regla = await buscarRegla(id);
    const hoy = B.hoy();
    const deLaSerie = await KodamaDB.leer('bloques', [['serie_id', 'eq', regla.id]]);
    const aBorrar = [];
    let quedan = 0;
    deLaSerie.forEach(function (bloque) {
      if (bloque.fecha >= hoy && B.estadoDeBloque(bloque) !== 'dictada') {
        aBorrar.push(bloque.id);
      } else {
        quedan++;
      }
    });
    if (aBorrar.length) await KodamaDB.borrar('bloques', [['id', 'in', aBorrar]]);
    await KodamaDB.borrar('horario', [['id', 'eq', regla.id]]);
    return { borradas: aBorrar.length, quedan: quedan };
  };
})(KodamaBackend);
