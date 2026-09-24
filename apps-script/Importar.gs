/**
 * KODAMA — importador de filas pegadas (Checkpoint 7).
 *
 * Recibe texto separado por tabulaciones (lo que se copia de una tabla o
 * de un Sheet) y lo convierte en alumnos o en reglas de la hoja Horario.
 *
 * - Primero SIEMPRE una vista previa (aplicar=false): qué crea, qué
 *   actualiza, qué no cambia y qué filas tienen errores. No escribe nada.
 * - Con aplicar=true escribe exactamente lo mismo que mostró la vista
 *   previa (se vuelve a calcular con los mismos datos).
 * - Una fila mal escrita se marca con su motivo y NO frena al resto.
 * - Todo lo escrito queda en el Sheet; nada pasa por el repositorio.
 */

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

// ---------------------------------------------------------------------
// Lectura del texto pegado
// ---------------------------------------------------------------------

function normalizarEncabezado(texto) {
  return normalizarTexto(texto).replace(/_/g, ' ');
}

/**
 * Texto con tabulaciones → [{ numero, valores: { campo: texto } }].
 * Si la primera fila tiene al menos 2 encabezados conocidos, se usa para
 * saber qué columna es qué (el orden da igual); si no, se asume el orden
 * por defecto del modo. Las filas vacías se saltean.
 */
function leerFilasPegadas(texto, alias, ordenPorDefecto) {
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
}

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

// ---------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------

function importar(modo, texto, aplicar) {
  if (modo === 'alumnos') return importarAlumnos(texto, aplicar);
  if (modo === 'horario') return importarHorario(texto, aplicar);
  if (modo === 'historico') return importarHistorico(texto, aplicar);
  throw new Error('modo_desconocido: "' + modo + '" (usa alumnos, horario o historico)');
}

function resumenDe(filas) {
  const resumen = { crear: 0, actualizar: 0, sin_cambios: 0, error: 0 };
  filas.forEach(function (f) { resumen[f.estado] = (resumen[f.estado] || 0) + 1; });
  return resumen;
}

// ---------------------------------------------------------------------
// Alumnos
// ---------------------------------------------------------------------

function importarAlumnos(texto, aplicar) {
  const leido = leerFilasPegadas(texto, ALIAS_ALUMNOS, ORDEN_ALUMNOS);
  const existentes = leerAlumnos(!aplicar);
  const catalogos = catalogosActuales();
  const catalogosNuevos = { cursos: [], colegios: [] };
  const vistas = {}; // clave nombre+apellido → número de fila, para repetidos en lo pegado
  const usados = {};
  existentes.forEach(function (a) { usados[a.id] = true; });

  // Curso o colegio que no está en el catálogo: se propone agregarlo (con
  // el mismo texto como código corto, editable después) en vez de frenar.
  function resolverOAgregar(tipo, valor) {
    const encontrado = resolverCatalogo(catalogos[tipo], valor);
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
      const clave = claveDeAlumno(v.nombre, v.apellido);
      if (vistas[clave]) throw new Error('repetido: ya está en la fila ' + vistas[clave] + ' de lo pegado');

      const datos = {
        nombre: v.nombre, apellido: v.apellido || '',
        curso: v.curso ? resolverOAgregar('cursos', v.curso) : '',
        colegio: v.colegio ? resolverOAgregar('colegios', v.colegio) : '',
        tarifa_hora: normalizarTarifa(v.tarifa_hora),
        forma_pago: normalizarFormaPago(v.forma_pago),
        notas: v.notas || '',
        lugar: String(v.lugar || '').trim()
      };
      vistas[clave] = fila.numero;

      const existente = existentes.find(function (a) { return claveDeAlumno(a.nombre, a.apellido) === clave; });
      if (!existente) {
        const alumno = prepararAlumno(Object.assign({ id: '', archivado: '' }, datos), catalogos, existentes);
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
    const libro = SpreadsheetApp.getActiveSpreadsheet();
    ['cursos', 'colegios'].forEach(function (tipo) {
      const nuevos = catalogosNuevos[tipo];
      if (!nuevos.length) return;
      const hoja = libro.getSheetByName(HOJAS_CATALOGO[tipo]);
      hoja.getRange(hoja.getLastRow() + 1, 1, nuevos.length, 2)
        .setValues(nuevos.map(function (c) { return [c.nombre, c.corto]; }));
    });

    const hoja = hojaAlumnos();
    const aCrear = filas.filter(function (f) { return f.estado === 'crear'; }).map(function (f) {
      f.alumno.id = nuevoIdDeAlumno(usados);
      return alumnoAFila(f.alumno);
    });
    const aActualizar = filas.filter(function (f) { return f.estado === 'actualizar'; });
    if (aActualizar.length) {
      // Una lectura y una escritura de toda la hoja, no una por alumno.
      const grilla = hoja.getRange(1, 1, hoja.getLastRow(), COLUMNAS_ALUMNOS.length).getDisplayValues();
      aActualizar.forEach(function (f) {
        for (let r = 1; r < grilla.length; r++) {
          if (grilla[r][0] === f.alumno.id) grilla[r] = alumnoAFila(f.alumno);
        }
      });
      hoja.getRange(1, 1, grilla.length, COLUMNAS_ALUMNOS.length).setValues(grilla);
    }
    if (aCrear.length) {
      hoja.getRange(hoja.getLastRow() + 1, 1, aCrear.length, COLUMNAS_ALUMNOS.length).setValues(aCrear);
    }
  }

  return {
    modo: 'alumnos',
    aplicado: Boolean(aplicar),
    conEncabezado: leido.conEncabezado,
    resumen: resumenDe(filas),
    catalogosNuevos: catalogosNuevos,
    filas: filas.map(function (f) { return { numero: f.numero, estado: f.estado, detalle: f.detalle }; })
  };
}

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

// ---------------------------------------------------------------------
// Reglas de la hoja Horario
// ---------------------------------------------------------------------

/** Clave para detectar una regla repetida: mismo título, alumnos, área, días y hora de inicio. */
function claveDeRegla(regla) {
  let dias;
  try {
    dias = parseDias(regla.dias, '').slice().sort().join('');
  } catch (e) {
    dias = normalizarTexto(regla.dias);
  }
  return [normalizarTexto(regla.titulo), regla.alumno_id.split(',').sort().join(','),
    normalizarTexto(regla.area), dias, regla.inicio].join('|');
}

function importarHorario(texto, aplicar) {
  const leido = leerFilasPegadas(texto, ALIAS_HORARIO, ORDEN_HORARIO);
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_HORARIO);
  const grilla = hoja.getDataRange().getDisplayValues();
  const alumnos = leerAlumnos(!aplicar);
  const areas = nombresDeAreas();

  const reglasExistentes = [];
  for (let r = 1; r < grilla.length; r++) {
    if (!filaDeHorarioConContenido(grilla[r])) continue;
    const regla = {};
    COLUMNAS_HORARIO.forEach(function (c, i) { regla[c] = grilla[r][i] || ''; });
    reglasExistentes.push({ fila: r, regla: regla, clave: claveDeRegla(regla) });
  }
  const vistas = {};

  const filas = leido.filas.map(function (fila) {
    const v = fila.valores;
    const resultado = { numero: fila.numero, estado: 'error', detalle: '' };
    try {
      if (String(v.archivado || '').trim().toUpperCase() === 'TRUE') {
        throw new Error('está archivada: no se importa');
      }
      const area = areas.find(function (a) { return normalizarTexto(a) === normalizarTexto(v.area); });
      if (!area) throw new Error('área desconocida: "' + (v.area || '') + '" (usa ' + areas.join(', ') + ')');

      // Alumnos por nombre ("Agustín Aliendre" o "Agustín Aliendre — 4to SA"),
      // separados por coma. Tienen que existir: importa primero los alumnos.
      const ids = String(v.alumnos || '').split(/[,;]/).map(function (t) { return t.trim(); }).filter(Boolean)
        .map(function (texto) {
          const nombre = texto.split(/\s+[—–-]\s+/)[0];
          const porId = alumnos.find(function (a) { return a.id === nombre; });
          if (porId) return porId.id;
          const palabras = nombre.split(/\s+/);
          const alumno = buscarAlumnoPorNombre(alumnos, palabras[0], palabras.slice(1).join(' '));
          if (!alumno) throw new Error('alumno no encontrado: "' + texto + '" (importa primero los alumnos)');
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
        alumno_id: normalizarIdsAlumnos(ids.join(','))
      };
      if (!regla.titulo && !regla.alumno_id) throw new Error('falta el título o los alumnos');
      filaARegla(reglaAFila(regla), '');

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
      resultado.existente = existente;
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
    const aActualizar = filas.filter(function (f) { return f.estado === 'actualizar'; });
    if (aActualizar.length) {
      aActualizar.forEach(function (f) { grilla[f.existente.fila] = reglaAFila(f.regla); });
      const ancho = grilla.map(function (fila) {
        return COLUMNAS_HORARIO.map(function (_, i) { return fila[i] != null ? fila[i] : ''; });
      });
      hoja.getRange(1, 1, ancho.length, COLUMNAS_HORARIO.length).setValues(ancho);
    }
    const aCrear = filas.filter(function (f) { return f.estado === 'crear'; });
    if (aCrear.length) {
      const idsUsados = idsDeSerieUsados(grilla);
      const nuevas = aCrear.map(function (f) {
        f.regla.id = nuevoIdDeSerie(idsUsados);
        return reglaAFila(f.regla);
      });
      hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, COLUMNAS_HORARIO.length).setValues(nuevas);
    }
  }

  return {
    modo: 'horario',
    aplicado: Boolean(aplicar),
    conEncabezado: leido.conEncabezado,
    resumen: resumenDe(filas),
    catalogosNuevos: { cursos: [], colegios: [] },
    filas: filas.map(function (f) { return { numero: f.numero, estado: f.estado, detalle: f.detalle }; })
  };
}

// ---------------------------------------------------------------------
// Histórico: clases pasadas ya dictadas
// ---------------------------------------------------------------------

/**
 * Carga clases de Academia Fractal que ya pasaron, como bloques con estado
 * "dictada" (así suman horas y monto en Estadísticas y Cobros).
 *
 * - Columnas: alumno (uno o varios separados por coma), fecha, inicio, fin,
 *   y opcionales tema, lugar y notas. Fechas dd/mm/aaaa y horas 9:00 valen.
 * - Un alumno que no existe se crea (nombre = primera palabra, apellido =
 *   el resto), una sola vez aunque aparezca en varias filas. Un nombre sin
 *   apellido que tienen varios alumnos es un error de esa fila: nunca se
 *   crea un alumno por las dudas.
 * - Solo fechas de hoy o anteriores: el histórico no programa el futuro.
 * - Sin duplicar: la misma clase (mismos alumnos, fecha y hora de inicio)
 *   que ya está en Bloques queda "sin cambios".
 */
function importarHistorico(texto, aplicar) {
  const leido = leerFilasPegadas(texto, ALIAS_HISTORICO, ORDEN_HISTORICO);
  const alumnos = leerAlumnos(!aplicar);
  const hoy = hoyEnTexto();
  const nuevos = []; // alumnos a crear, sin repetir
  const usados = {};
  alumnos.forEach(function (a) { usados[a.id] = true; });

  // Clases que ya están: alumnos + fecha + inicio.
  const hojaB = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_BLOQUES);
  const existentes = {};
  hojaB.getDataRange().getDisplayValues().slice(1).forEach(function (fila) {
    const b = filaABloque(fila);
    if (b.id && b.archivado !== 'TRUE' && b.alumno_id) existentes[claveDeClase(b.alumno_id, b.fecha, b.inicio)] = true;
  });
  const vistas = {};

  function alumnoPara(texto) {
    const nombreCompleto = texto.split(/\s+[—–-]\s+/)[0].trim();
    const palabras = nombreCompleto.split(/\s+/);
    const nombre = palabras[0];
    const apellido = palabras.slice(1).join(' ');
    const todos = alumnos.concat(nuevos);
    const exacto = candidatosPorNombre(todos, nombre, apellido);
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
      id: nuevoIdDeAlumno(usados), nombre: nombre, apellido: apellido, curso: '', colegio: '',
      tarifa_hora: '', forma_calculo: FORMA_CALCULO, forma_pago: 'hora', notas: '', archivado: '', lugar: '',
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
      validarFecha(fecha, nombres.join(', '), 'fecha');
      validarHora(inicio, nombres.join(', '), 'inicio');
      validarHora(fin, nombres.join(', '), 'fin');
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
      const ids = normalizarIdsAlumnos(vinculados.map(function (a) { return a.id; }).join(','));
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
        id: 'b' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase(),
        titulo: String(v.tema || '').trim(), area: AREA_FRACTAL, tipo: 'fijo',
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
    if (nuevosUsados.length) {
      const hojaA = hojaAlumnos();
      hojaA.getRange(hojaA.getLastRow() + 1, 1, nuevosUsados.length, COLUMNAS_ALUMNOS.length)
        .setValues(nuevosUsados.map(alumnoAFila));
    }
    const ahora = ahoraEnTexto();
    const nuevasFilas = aCrear.map(function (f) {
      f.bloque.creado = ahora;
      f.bloque.actualizado = ahora;
      return bloqueAFila(f.bloque);
    });
    hojaB.getRange(hojaB.getLastRow() + 1, 1, nuevasFilas.length, COLUMNAS_BLOQUES.length).setValues(nuevasFilas);
    ordenarHojaBloques(hojaB);
  }

  return {
    modo: 'historico',
    aplicado: Boolean(aplicar),
    conEncabezado: leido.conEncabezado,
    resumen: resumenDe(filas),
    catalogosNuevos: { cursos: [], colegios: [] },
    alumnosNuevos: nuevosUsados.map(function (a) { return (a.nombre + ' ' + a.apellido).trim(); }),
    filas: filas.map(function (f) { return { numero: f.numero, estado: f.estado, detalle: f.detalle }; })
  };
}

/** Misma clase = mismos alumnos (en cualquier orden), fecha y hora de inicio. */
function claveDeClase(idsAlumnos, fecha, inicio) {
  return String(idsAlumnos).split(',').sort().join(',') + '|' + fecha + '|' + inicio;
}
