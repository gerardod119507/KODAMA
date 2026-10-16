/**
 * KODAMA — importador de filas pegadas (antes apps-script/Importar.gs).
 *
 * Recibe texto separado por tabulaciones (lo que se copia de una tabla o
 * de un Sheet) y lo convierte en alumnos, reglas del horario o clases
 * pasadas ya dictadas.
 *
 * - Primero SIEMPRE una vista previa (aplicar=false): qué crea, qué
 *   actualiza, qué no cambia y qué filas tienen errores. No escribe nada.
 * - Con aplicar=true escribe exactamente lo mismo que mostró la vista
 *   previa (se vuelve a calcular con los mismos datos).
 * - Una fila mal escrita se marca con su motivo y NO frena al resto.
 */
(function (B) {
  const ALIAS_ALUMNOS = {
    nombre: ['nombre', 'nombres'],
    apellido: ['apellido', 'apellidos'],
    curso: ['curso', 'grado'],
    colegio: ['colegio', 'escuela', 'institucion', 'universidad', 'unidad educativa'],
    tarifa_hora: ['tarifa', 'tarifa hora', 'tarifa por hora', 'precio', 'precio hora'],
    forma_pago: ['forma pago', 'forma de pago', 'pago'],
    notas: ['notas', 'nota', 'observaciones'],
    lugar: ['lugar', 'lugar habitual', 'direccion']
  };
  const ORDEN_ALUMNOS = ['nombre', 'apellido', 'curso', 'colegio', 'tarifa_hora', 'forma_pago', 'notas', 'lugar'];

  const ALIAS_HORARIO = {
    id: ['id'],
    titulo: ['titulo', 'materia', 'clase', 'tema'],
    area: ['area'],
    dias: ['dias', 'dia'],
    inicio: ['inicio', 'hora inicio', 'desde hora'],
    fin: ['fin', 'hora fin', 'hasta hora'],
    desde: ['desde', 'fecha desde', 'fecha inicio'],
    hasta: ['hasta', 'fecha hasta', 'fecha fin'],
    etiqueta: ['etiqueta'],
    notas: ['notas', 'nota'],
    lugar: ['lugar', 'aula', 'salon'],
    archivado: ['archivado'],
    alumnos: ['alumnos', 'alumno', 'alumno id']
  };
  const ORDEN_HORARIO = ['titulo', 'area', 'dias', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'alumnos', 'lugar'];

  // Histórico (Checkpoint 8): clases pasadas ya dictadas de Academia Fractal.
  const ALIAS_HISTORICO = {
    alumnos: ['alumno', 'alumnos', 'nombre', 'estudiante'],
    fecha: ['fecha', 'dia'],
    inicio: ['inicio', 'hora inicio', 'desde'],
    fin: ['fin', 'hora fin', 'hasta'],
    tema: ['tema', 'titulo', 'materia'],
    lugar: ['lugar', 'aula'],
    notas: ['notas', 'nota', 'observaciones']
  };
  const ORDEN_HISTORICO = ['alumnos', 'fecha', 'inicio', 'fin', 'tema', 'lugar', 'notas'];

  // --- Lectura del texto pegado ----------------------------------------

  function normalizarEncabezado(texto) {
    return B.normalizarTexto(texto).replace(/_/g, ' ');
  }

  /**
   * Texto con tabulaciones → [{ numero, valores: { campo: texto } }].
   * Si la primera fila tiene al menos 2 encabezados conocidos, se usa para
   * saber qué columna es qué (el orden da igual); si no, se asume el orden
   * por defecto del modo. Las filas vacías se saltean.
   */
  B.leerFilasPegadas = function (texto, alias, ordenPorDefecto) {
    const lineas = String(texto || '').split(/\r?\n/);
    const celdas = lineas.map(function (linea) {
      return linea.split('\t').map(function (c) { return c.trim(); });
    });

    const campoDeEncabezado = function (celda) {
      const n = normalizarEncabezado(celda);
      for (const campo in alias) {
        if (alias[campo].indexOf(n) !== -1) return campo;
      }
      return null;
    };

    let columnas = ordenPorDefecto;
    let desde = 0;
    const primera = celdas.find(function (c) { return c.some(Boolean); });
    if (primera) {
      const mapeo = primera.map(campoDeEncabezado);
      if (mapeo.filter(Boolean).length >= 2) {
        columnas = mapeo;
        desde = celdas.indexOf(primera) + 1;
      }
    }

    const filas = [];
    for (let i = desde; i < celdas.length; i++) {
      if (!celdas[i].some(Boolean)) continue;
      const valores = {};
      columnas.forEach(function (campo, j) {
        if (campo) valores[campo] = celdas[i][j] || '';
      });
      filas.push({ numero: i + 1, valores: valores });
    }
    return { filas: filas, conEncabezado: desde > 0 };
  };

  /** "9:00" → "09:00". Cualquier otra cosa queda como vino (la valida después). */
  function normalizarHoraPegada(texto) {
    const m = /^(\d{1,2}):(\d{2})(:\d{2})?$/.exec(String(texto || '').trim());
    return m ? m[1].padStart(2, '0') + ':' + m[2] : String(texto || '').trim();
  }

  /** "22/09/2026" o "22-9-2026" → "2026-09-22". ISO queda igual. */
  function normalizarFechaPegada(texto) {
    const t = String(texto || '').trim();
    const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(t);
    return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : t;
  }

  function mensajeDe(error) {
    return String(error && error.message ? error.message : error);
  }

  function resumenDe(filas) {
    const resumen = { crear: 0, actualizar: 0, sin_cambios: 0, error: 0 };
    filas.forEach(function (f) { resumen[f.estado] = (resumen[f.estado] || 0) + 1; });
    return resumen;
  }

  function sinDatosInternos(filas) {
    return filas.map(function (f) { return { numero: f.numero, estado: f.estado, detalle: f.detalle }; });
  }

  // --- Punto de entrada ------------------------------------------------

  B.importar = async function (modo, texto, aplicar) {
    if (modo === 'alumnos') return importarAlumnos(texto, aplicar);
    if (modo === 'horario') return importarHorario(texto, aplicar);
    if (modo === 'historico') return importarHistorico(texto, aplicar);
    throw new Error('modo_desconocido: "' + modo + '" (usa alumnos, horario o historico)');
  };

  // --- Alumnos -----------------------------------------------------------

  /** "Agustín Aliendre — 4to SA" (igual que en la app), para la vista previa. */
  function etiquetaDeAlumnoTexto(alumno, catalogos) {
    const corto = function (lista, nombre) {
      const item = lista.find(function (c) { return c.nombre === nombre; });
      return item ? item.corto : nombre;
    };
    const extra = [
      alumno.curso ? corto(catalogos.cursos, alumno.curso) : '',
      alumno.colegio ? corto(catalogos.colegios, alumno.colegio) : ''
    ].filter(Boolean).join(' ');
    return (alumno.nombre + ' ' + alumno.apellido).trim() + (extra ? ' — ' + extra : '');
  }

  async function importarAlumnos(texto, aplicar) {
    const leido = B.leerFilasPegadas(texto, ALIAS_ALUMNOS, ORDEN_ALUMNOS);
    const leidos = await Promise.all([B.leerAlumnos(), B.catalogosActuales()]);
    const existentes = leidos[0];
    const catalogos = leidos[1];
    const catalogosNuevos = { cursos: [], colegios: [] };
    const vistas = {}; // clave nombre+apellido → número de fila, para repetidos en lo pegado
    const usados = {};
    existentes.forEach(function (a) { usados[a.id] = true; });

    // Curso o colegio que no está en el catálogo: se propone agregarlo (con
    // el mismo texto como código corto, editable después) en vez de frenar.
    function resolverOAgregar(tipo, valor) {
      const encontrado = B.resolverCatalogo(catalogos[tipo], valor);
      if (encontrado !== null) return encontrado;
      const nuevo = { nombre: valor.trim(), corto: valor.trim() };
      catalogos[tipo].push(nuevo);
      catalogosNuevos[tipo].push(nuevo);
      return nuevo.nombre;
    }

    const filas = leido.filas.map(function (fila) {
      const v = fila.valores;
      const resultado = { numero: fila.numero, estado: 'error', detalle: '', datos: v };
      try {
        if (!String(v.nombre || '').trim()) throw new Error('falta el nombre');
        const clave = B.claveDeAlumno(v.nombre, v.apellido);
        if (vistas[clave]) throw new Error('repetido: ya está en la fila ' + vistas[clave] + ' de lo pegado');

        const datos = {
          nombre: v.nombre, apellido: v.apellido || '',
          curso: v.curso ? resolverOAgregar('cursos', v.curso) : '',
          colegio: v.colegio ? resolverOAgregar('colegios', v.colegio) : '',
          tarifa_hora: B.normalizarTarifa(v.tarifa_hora),
          forma_pago: B.normalizarFormaPago(v.forma_pago),
          notas: v.notas || '',
          lugar: String(v.lugar || '').trim()
        };
        vistas[clave] = fila.numero;

        const existente = existentes.find(function (a) { return B.claveDeAlumno(a.nombre, a.apellido) === clave; });
        if (!existente) {
          const alumno = B.prepararAlumno(Object.assign({ id: '', archivado: '' }, datos), catalogos, existentes);
          resultado.estado = 'crear';
          resultado.alumno = alumno;
          resultado.detalle = etiquetaDeAlumnoTexto(alumno, catalogos);
          return resultado;
        }

        // Ya existe (mismo nombre y apellido): se actualizan solo los campos
        // que vienen con algo en lo pegado; lo vacío no borra lo guardado.
        const actualizado = Object.assign({}, existente);
        const cambios = [];
        ['curso', 'colegio', 'tarifa_hora', 'notas', 'lugar'].forEach(function (campo) {
          if (datos[campo] && datos[campo] !== existente[campo]) {
            actualizado[campo] = datos[campo];
            cambios.push(campo);
          }
        });
        if (v.forma_pago && datos.forma_pago !== existente.forma_pago) {
          actualizado.forma_pago = datos.forma_pago;
          cambios.push('forma_pago');
        }
        resultado.alumno = actualizado;
        resultado.estado = cambios.length ? 'actualizar' : 'sin_cambios';
        resultado.detalle = existente.nombre + ' ' + existente.apellido +
          (cambios.length ? ' (cambia: ' + cambios.join(', ') + ')' : ' (ya está igual)');
        return resultado;
      } catch (error) {
        resultado.detalle = mensajeDe(error);
        return resultado;
      }
    });

    if (aplicar) {
      // Primero los catálogos: un alumno nuevo puede usar un curso nuevo.
      await Promise.all(['cursos', 'colegios'].map(function (tipo) {
        return KodamaDB.insertar(tipo, catalogosNuevos[tipo]);
      }));
      const aCrear = filas.filter(function (f) { return f.estado === 'crear'; }).map(function (f) {
        f.alumno.id = B.nuevoIdDeAlumno(usados);
        return f.alumno;
      });
      const aActualizar = filas.filter(function (f) { return f.estado === 'actualizar'; })
        .map(function (f) { return f.alumno; });
      // Un envío para los cambios y otro para los nuevos, no uno por alumno.
      await KodamaDB.guardar('alumnos', aActualizar);
      await KodamaDB.insertar('alumnos', aCrear);
    }

    return {
      modo: 'alumnos',
      aplicado: Boolean(aplicar),
      conEncabezado: leido.conEncabezado,
      resumen: resumenDe(filas),
      catalogosNuevos: catalogosNuevos,
      filas: sinDatosInternos(filas)
    };
  }

  // --- Reglas del horario ------------------------------------------------

  /** Clave para detectar una regla repetida: mismo título, alumnos, área, días y hora de inicio. */
  function claveDeRegla(regla) {
    let dias;
    try {
      dias = B.parseDias(regla.dias, '').slice().sort().join('');
    } catch (e) {
      dias = B.normalizarTexto(regla.dias);
    }
    return [B.normalizarTexto(regla.titulo), regla.alumno_id.split(',').sort().join(','),
      B.normalizarTexto(regla.area), dias, regla.inicio].join('|');
  }

  async function importarHorario(texto, aplicar) {
    const leido = B.leerFilasPegadas(texto, ALIAS_HORARIO, ORDEN_HORARIO);
    const leidos = await Promise.all([KodamaDB.leer('horario'), B.leerAlumnos(), B.nombresDeAreas()]);
    const reglasExistentes = leidos[0]
      .filter(function (regla) { return regla.titulo || regla.alumno_id; })
      .map(function (regla) { return { regla: regla, clave: claveDeRegla(regla) }; });
    const alumnos = leidos[1];
    const areas = leidos[2];
    const vistas = {};

    const filas = leido.filas.map(function (fila) {
      const v = fila.valores;
      const resultado = { numero: fila.numero, estado: 'error', detalle: '' };
      try {
        if (String(v.archivado || '').trim().toUpperCase() === 'TRUE') {
          throw new Error('está archivada: no se importa');
        }
        const area = areas.find(function (a) { return B.normalizarTexto(a) === B.normalizarTexto(v.area); });
        if (!area) throw new Error('área desconocida: "' + (v.area || '') + '" (usa ' + areas.join(', ') + ')');

        // Alumnos por nombre ("Agustín Aliendre" o "Agustín Aliendre — 4to SA"),
        // separados por coma. Tienen que existir: importa primero los alumnos.
        const ids = String(v.alumnos || '').split(/[,;]/).map(function (t) { return t.trim(); }).filter(Boolean)
          .map(function (escrito) {
            const nombre = escrito.split(/\s+[—–-]\s+/)[0];
            const porId = alumnos.find(function (a) { return a.id === nombre; });
            if (porId) return porId.id;
            const palabras = nombre.split(/\s+/);
            const alumno = B.buscarAlumnoPorNombre(alumnos, palabras[0], palabras.slice(1).join(' '));
            if (!alumno) throw new Error('alumno no encontrado: "' + escrito + '" (importa primero los alumnos)');
            return alumno.id;
          });

        const regla = {
          id: '', archivado: '',
          titulo: String(v.titulo || '').trim(),
          area: area,
          dias: String(v.dias || '').trim(),
          inicio: normalizarHoraPegada(v.inicio),
          fin: normalizarHoraPegada(v.fin),
          desde: normalizarFechaPegada(v.desde),
          hasta: normalizarFechaPegada(v.hasta),
          etiqueta: String(v.etiqueta || '').trim(),
          notas: String(v.notas || ''),
          lugar: String(v.lugar || '').trim(),
          alumno_id: B.normalizarIdsAlumnos(ids.join(','))
        };
        if (!regla.titulo && !regla.alumno_id) throw new Error('falta el título o los alumnos');
        B.reglaParaGenerar(regla, '');

        const clave = claveDeRegla(regla);
        if (vistas[clave]) throw new Error('repetida: ya está en la fila ' + vistas[clave] + ' de lo pegado');
        vistas[clave] = fila.numero;

        const nombreRegla = regla.titulo || ids.map(function (id) {
          const a = alumnos.find(function (x) { return x.id === id; });
          return a.nombre + ' ' + a.apellido;
        }).join(', ');
        const existente = reglasExistentes.find(function (e) { return e.clave === clave; });
        if (!existente) {
          resultado.estado = 'crear';
          resultado.regla = regla;
          resultado.detalle = nombreRegla + ' · ' + regla.dias + ' ' + regla.inicio + '–' + regla.fin;
          return resultado;
        }
        const cambios = ['fin', 'desde', 'hasta', 'etiqueta', 'notas', 'lugar'].filter(function (c) {
          return regla[c] && regla[c] !== existente.regla[c];
        });
        resultado.regla = Object.assign({}, existente.regla);
        cambios.forEach(function (c) { resultado.regla[c] = regla[c]; });
        resultado.estado = cambios.length ? 'actualizar' : 'sin_cambios';
        resultado.detalle = nombreRegla + (cambios.length ? ' (cambia: ' + cambios.join(', ') + ')' : ' (ya está igual)');
        return resultado;
      } catch (error) {
        resultado.detalle = mensajeDe(error);
        return resultado;
      }
    });

    if (aplicar) {
      const usados = {};
      leidos[0].forEach(function (regla) { usados[regla.id] = true; });
      const aCrear = filas.filter(function (f) { return f.estado === 'crear'; }).map(function (f) {
        do {
          f.regla.id = B.nuevoId('h');
        } while (usados[f.regla.id]);
        usados[f.regla.id] = true;
        return f.regla;
      });
      const aActualizar = filas.filter(function (f) { return f.estado === 'actualizar'; })
        .map(function (f) { return f.regla; });
      await KodamaDB.guardar('horario', aActualizar);
      await KodamaDB.insertar('horario', aCrear);
    }

    return {
      modo: 'horario',
      aplicado: Boolean(aplicar),
      conEncabezado: leido.conEncabezado,
      resumen: resumenDe(filas),
      catalogosNuevos: { cursos: [], colegios: [] },
      filas: sinDatosInternos(filas)
    };
  }

  // --- Histórico: clases pasadas ya dictadas -------------------------------

  /** Misma clase = mismos alumnos (en cualquier orden), fecha y hora de inicio. */
  function claveDeClase(idsAlumnos, fecha, inicio) {
    return String(idsAlumnos).split(',').sort().join(',') + '|' + fecha + '|' + inicio;
  }

  /**
   * Carga clases de Academia Fractal que ya pasaron, como bloques con estado
   * "dictada" (así suman horas y monto en Estadísticas y Cobros).
   *
   * - Columnas: alumno (uno o varios separados por coma), fecha, inicio,
   *   fin, y opcionales tema, lugar y notas. Fechas dd/mm/aaaa y horas 9:00.
   * - Un alumno que no existe se crea (nombre = primera palabra, apellido =
   *   el resto), una sola vez aunque aparezca en varias filas. Un nombre sin
   *   apellido que tienen varios alumnos es un error de esa fila: nunca se
   *   crea un alumno por las dudas.
   * - Solo fechas de hoy o anteriores: el histórico no programa el futuro.
   * - Sin duplicar: la misma clase (mismos alumnos, fecha y hora de inicio)
   *   que ya existe queda "sin cambios".
   */
  async function importarHistorico(texto, aplicar) {
    const leido = B.leerFilasPegadas(texto, ALIAS_HISTORICO, ORDEN_HISTORICO);
    const hoy = B.hoy();
    const leidos = await Promise.all([
      B.leerAlumnos(),
      // Solo pueden repetirse clases con alumnos de antes de hoy (o de hoy).
      KodamaDB.leer('bloques', [['archivado', 'is', false], ['fecha', 'lte', hoy]])
    ]);
    const alumnos = leidos[0];
    const nuevos = []; // alumnos a crear, sin repetir
    const usados = {};
    alumnos.forEach(function (a) { usados[a.id] = true; });

    const existentes = {};
    leidos[1].forEach(function (b) {
      if (b.alumno_id) existentes[claveDeClase(b.alumno_id, b.fecha, b.inicio)] = true;
    });
    const vistas = {};

    function alumnoPara(escrito) {
      const nombreCompleto = escrito.split(/\s+[—–-]\s+/)[0].trim();
      const palabras = nombreCompleto.split(/\s+/);
      const nombre = palabras[0];
      const apellido = palabras.slice(1).join(' ');
      const todos = alumnos.concat(nuevos);
      const exacto = B.candidatosPorNombre(todos, nombre, apellido);
      if (apellido && exacto.length) return exacto[0];
      if (!apellido) {
        if (exacto.length === 1) return exacto[0];
        if (exacto.length > 1) {
          throw new Error('"' + nombre + '" es ambiguo (' + exacto.map(function (a) {
            return (a.nombre + ' ' + a.apellido).trim();
          }).join(' / ') + '): escribe también el apellido');
        }
      }
      const nuevo = {
        id: B.nuevoIdDeAlumno(usados), nombre: nombre, apellido: apellido, curso: '', colegio: '',
        tarifa_hora: '', forma_calculo: B.FORMA_CALCULO, forma_pago: 'hora', notas: '', archivado: '', lugar: '',
        esNuevo: true
      };
      nuevos.push(nuevo);
      return nuevo;
    }

    const filas = leido.filas.map(function (fila) {
      const v = fila.valores;
      const resultado = { numero: fila.numero, estado: 'error', detalle: '' };
      try {
        const nombres = String(v.alumnos || '').split(/[,;]/).map(function (t) { return t.trim(); }).filter(Boolean);
        if (!nombres.length) throw new Error('falta el alumno');
        const fecha = normalizarFechaPegada(v.fecha);
        const inicio = normalizarHoraPegada(v.inicio);
        const fin = normalizarHoraPegada(v.fin);
        B.validarFecha(fecha, nombres.join(', '), 'fecha');
        B.validarHora(inicio, nombres.join(', '), 'inicio');
        B.validarHora(fin, nombres.join(', '), 'fin');
        if (inicio >= fin) throw new Error('el inicio (' + inicio + ') es después del fin (' + fin + ')');
        if (fecha > hoy) throw new Error('la fecha ' + fecha + ' es futura: el histórico es solo para clases que ya pasaron');

        // Primero se resuelven todos los nombres; si uno falla, la fila no
        // deja alumnos nuevos a medias.
        const antes = nuevos.length;
        let vinculados;
        try {
          vinculados = nombres.map(alumnoPara);
        } catch (error) {
          nuevos.splice(antes);
          throw error;
        }
        const ids = B.normalizarIdsAlumnos(vinculados.map(function (a) { return a.id; }).join(','));
        const clave = claveDeClase(ids, fecha, inicio);
        const detalle = vinculados.map(function (a) {
          return (a.nombre + ' ' + a.apellido).trim() + (a.esNuevo ? ' (alumno nuevo)' : '');
        }).join(', ') + ' · ' + fecha + ' ' + inicio + '–' + fin;
        if (vistas[clave]) throw new Error('repetida: ya está en la fila ' + vistas[clave] + ' de lo pegado');
        vistas[clave] = fila.numero;
        if (existentes[clave]) {
          resultado.estado = 'sin_cambios';
          resultado.detalle = detalle + ' (ya está cargada)';
          return resultado;
        }
        resultado.estado = 'crear';
        resultado.detalle = detalle;
        resultado.bloque = {
          id: B.nuevoId('b'),
          titulo: String(v.tema || '').trim(), area: B.AREA_FRACTAL, tipo: 'fijo',
          fecha: fecha, inicio: inicio, fin: fin, etiqueta: '', notas: String(v.notas || ''),
          creado: '', actualizado: '', archivado: '', alumno_id: ids, lugar: String(v.lugar || '').trim(),
          estado: 'dictada', fecha_original: '', inicio_original: '', fin_original: '', motivo: ''
        };
        resultado.vinculados = vinculados;
        return resultado;
      } catch (error) {
        resultado.detalle = mensajeDe(error);
        return resultado;
      }
    });

    const aCrear = filas.filter(function (f) { return f.estado === 'crear'; });
    // Solo se crean los alumnos que usa alguna fila que se importa.
    const nuevosUsados = nuevos.filter(function (a) {
      return aCrear.some(function (f) { return f.vinculados.indexOf(a) !== -1; });
    });

    if (aplicar && aCrear.length) {
      await KodamaDB.insertar('alumnos', nuevosUsados.map(function (a) {
        const alumno = Object.assign({}, a);
        delete alumno.esNuevo;
        return alumno;
      }));
      const ahora = B.ahora();
      await KodamaDB.insertar('bloques', aCrear.map(function (f) {
        f.bloque.creado = ahora;
        f.bloque.actualizado = ahora;
        return f.bloque;
      }));
    }

    return {
      modo: 'historico',
      aplicado: Boolean(aplicar),
      conEncabezado: leido.conEncabezado,
      resumen: resumenDe(filas),
      catalogosNuevos: { cursos: [], colegios: [] },
      alumnosNuevos: nuevosUsados.map(function (a) { return (a.nombre + ' ' + a.apellido).trim(); }),
      filas: sinDatosInternos(filas)
    };
  }
})(KodamaBackend);
