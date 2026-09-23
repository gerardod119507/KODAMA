/**
 * KODAMA — generador del horario fijo del semestre.
 *
 * Cada fila de la hoja Horario es una REGLA ("esta clase se repite estos
 * días, entre estas fechas"). generarHorario() la convierte en filas
 * individuales de Bloques (tipo "fijo"), una por cada fecha que cumple la
 * regla, y guarda el resultado en un solo golpe (una lectura y una
 * escritura de toda la hoja Bloques, no una llamada por fila).
 *
 * Nunca toca el pasado: solo crea/actualiza ocurrencias de hoy en adelante,
 * aunque "desde" de la regla sea anterior a hoy.
 */

const HOJA_HORARIO = 'Horario';
const COLUMNAS_HORARIO = ['id', 'titulo', 'area', 'dias', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas'];
const ENCABEZADOS_HORARIO = ['id', 'título', 'área', 'días', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas'];

// Primeras 3 letras, sin tilde, en minúscula. parseDias() normaliza así
// cualquier variante ("Mié", "mie", "MIE...") antes de buscar acá.
const DIAS_SEMANA = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };

function asegurarHojaHorario(libro) {
  const hoja = libro.getSheetByName(HOJA_HORARIO) || libro.insertSheet(HOJA_HORARIO);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, hoja.getMaxRows(), ENCABEZADOS_HORARIO.length).setNumberFormat('@');
    hoja.getRange(1, 1, 1, ENCABEZADOS_HORARIO.length).setValues([ENCABEZADOS_HORARIO]);
    hoja.setFrozenRows(1);
    aplicarSugerenciasEtiqueta(hoja, ENCABEZADOS_HORARIO.indexOf('etiqueta') + 1);
  }
  return hoja;
}

function generarHorario() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hojaHorario = libro.getSheetByName(HOJA_HORARIO);
  const hojaBloques = libro.getSheetByName(HOJA_BLOQUES);
  const hoy = Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd');
  const ahora = Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd HH:mm');

  const filasHorario = hojaHorario.getDataRange().getDisplayValues();
  const datosBloques = hojaBloques.getDataRange().getDisplayValues();

  const indicePorId = {};
  for (let f = 1; f < datosBloques.length; f++) {
    if (datosBloques[f][0]) {
      indicePorId[datosBloques[f][0]] = f;
    }
  }

  let creados = 0;
  let actualizados = 0;
  let archivados = 0;

  for (let f = 1; f < filasHorario.length; f++) {
    const fila = filasHorario[f];
    if (!fila[1]) continue; // fila sin título: vacía, se ignora

    // El id lo pone siempre el generador. Cualquier cosa que no tenga la
    // forma exacta de un id de serie (vacío, un texto pegado a mano, un
    // resto de una prueba) se reemplaza por uno nuevo y se escribe en la
    // hoja, así queda estable de ahí en adelante.
    let id = String(fila[0] || '').trim();
    if (!esIdDeSerie(id)) {
      id = nuevoIdDeSerie(idsDeSerieUsados(filasHorario));
      filasHorario[f][0] = id;
      hojaHorario.getRange(f + 1, 1).setValue(id);
    }

    const regla = filaARegla(fila, id);
    const ocurrencias = calcularOcurrencias(regla, hoy);
    const idsValidos = {};

    ocurrencias.forEach(function (fecha) {
      const idBloque = id + '-' + fecha;
      idsValidos[idBloque] = true;
      const indiceExistente = indicePorId[idBloque];

      if (indiceExistente !== undefined) {
        const bloque = filaABloque(datosBloques[indiceExistente]);
        if (bloque.archivado === 'TRUE') {
          return; // cancelada a mano (bloque archivado): no se toca
        }
        // Se refrescan los campos que vienen de la regla; notas, etiqueta
        // y archivado quedan como estén (son del bloque puntual, no de la
        // regla, y no deben perderse al regenerar).
        bloque.titulo = regla.titulo;
        bloque.area = regla.area;
        bloque.tipo = 'fijo';
        bloque.inicio = regla.inicio;
        bloque.fin = regla.fin;
        bloque.actualizado = ahora;
        datosBloques[indiceExistente] = bloqueAFila(bloque);
        actualizados++;
      } else {
        const bloqueNuevo = {
          id: idBloque, titulo: regla.titulo, area: regla.area, tipo: 'fijo',
          fecha: fecha, inicio: regla.inicio, fin: regla.fin, etiqueta: regla.etiqueta,
          notas: '', creado: ahora, actualizado: ahora, archivado: ''
        };
        datosBloques.push(bloqueAFila(bloqueNuevo));
        indicePorId[idBloque] = datosBloques.length - 1;
        creados++;
      }
    });

    // Ocurrencias futuras que ya existían pero la regla editada ya no
    // genera (por ej. se acortó "hasta" o se sacó un día): se archivan,
    // nunca se borran (regla del proyecto: archivar en vez de borrar).
    Object.keys(indicePorId).forEach(function (idBloque) {
      if (idBloque.indexOf(id + '-') !== 0 || idsValidos[idBloque]) return;
      const indice = indicePorId[idBloque];
      const bloque = filaABloque(datosBloques[indice]);
      if (bloque.fecha < hoy || bloque.archivado === 'TRUE') return;
      bloque.archivado = 'TRUE';
      bloque.actualizado = ahora;
      datosBloques[indice] = bloqueAFila(bloque);
      archivados++;
    });
  }

  // Se normaliza el ancho de cada fila: getDataRange() devuelve tantas
  // columnas como tenga la hoja, y si alguien escribió algo a la derecha de
  // "archivado" la escritura fallaría por dimensiones que no coinciden.
  // Las columnas extra quedan intactas (no entran en el rango que se pisa).
  const grillaFinal = datosBloques.map(function (fila) {
    return COLUMNAS_BLOQUES.map(function (_, indice) {
      return fila[indice] != null ? fila[indice] : '';
    });
  });
  hojaBloques.getRange(1, 1, grillaFinal.length, COLUMNAS_BLOQUES.length).setValues(grillaFinal);

  return { creados: creados, actualizados: actualizados, archivados: archivados };
}

// Un id de serie es SIEMPRE "h" + 8 caracteres hexadecimales. Tener una
// forma fija permite distinguir un id puesto por el generador de cualquier
// texto que haya quedado en la celda.
const PATRON_ID_SERIE = /^h[0-9a-f]{8}$/;

function esIdDeSerie(valor) {
  return PATRON_ID_SERIE.test(String(valor || '').trim());
}

function idsDeSerieUsados(filasHorario) {
  const usados = {};
  filasHorario.forEach(function (fila) {
    const id = String(fila[0] || '').trim();
    if (esIdDeSerie(id)) {
      usados[id] = true;
    }
  });
  return usados;
}

function nuevoIdDeSerie(usados) {
  for (let intento = 0; intento < 20; intento++) {
    const id = 'h' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase();
    if (esIdDeSerie(id) && !usados[id]) {
      usados[id] = true;
      return id;
    }
  }
  throw new Error('no_se_pudo_generar_id_de_serie');
}

/**
 * Separa el id de un bloque generado en { idSerie, fecha }. Devuelve null
 * si el bloque no viene de una serie (por ejemplo una reunión suelta).
 */
function partirIdDeBloque(idBloque) {
  const partes = String(idBloque || '').match(/^(.+)-(\d{4}-\d{2}-\d{2})$/);
  return partes ? { idSerie: partes[1], fecha: partes[2] } : null;
}

/**
 * Series que hoy tienen bloques en la hoja Bloques, con cuántos y de qué
 * regla vienen. Incluye series huérfanas (cuya fila de Horario ya no
 * existe o cambió de id), que son justamente las que hay que poder
 * limpiar.
 */
function listarSeries() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const filasHorario = libro.getSheetByName(HOJA_HORARIO).getDataRange().getDisplayValues();
  const filasBloques = libro.getSheetByName(HOJA_BLOQUES).getDataRange().getDisplayValues();

  const tituloPorId = {};
  filasHorario.slice(1).forEach(function (fila) {
    const id = String(fila[0] || '').trim();
    if (id) {
      tituloPorId[id] = fila[1];
    }
  });

  const series = {};
  filasBloques.slice(1).forEach(function (fila) {
    const partes = partirIdDeBloque(fila[0]);
    if (!partes) return;
    if (!series[partes.idSerie]) {
      series[partes.idSerie] = { idSerie: partes.idSerie, titulo: tituloPorId[partes.idSerie] || '', cantidad: 0 };
    }
    series[partes.idSerie].cantidad++;
  });

  return Object.keys(series).map(function (id) { return series[id]; });
}

/**
 * Borra (de verdad, no archiva) las filas de Bloques generadas por una
 * serie. Es la excepción a "archivar en vez de borrar": existe para poder
 * limpiar datos de prueba sin editar el Sheet a mano, y solo toca filas
 * cuyo id pertenece a esa serie.
 */
function borrarSerie(idSerie) {
  const id = String(idSerie || '').trim();
  if (!id) {
    throw new Error('falta_id_serie');
  }

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_BLOQUES);
  const filas = hoja.getDataRange().getDisplayValues();
  const aBorrar = [];

  for (let f = 1; f < filas.length; f++) {
    const partes = partirIdDeBloque(filas[f][0]);
    if (partes && partes.idSerie === id) {
      aBorrar.push(f + 1); // número de fila en la hoja (1-indexado)
    }
  }

  // De abajo hacia arriba: si se borrara de arriba hacia abajo, cada
  // borrado correría las filas siguientes y los índices quedarían mal.
  for (let i = aBorrar.length - 1; i >= 0; i--) {
    hoja.deleteRow(aBorrar[i]);
  }

  return { borrados: aBorrar.length };
}

function filaARegla(fila, id) {
  const titulo = fila[1];
  const area = fila[2];
  const diasTexto = fila[3];
  const inicio = fila[4];
  const fin = fila[5];
  const desde = fila[6];
  const hasta = fila[7];
  const etiqueta = fila[8] || '';

  if (!area) throw new Error('horario_sin_area: "' + titulo + '"');
  validarHora(inicio, titulo, 'inicio');
  validarHora(fin, titulo, 'fin');
  if (inicio >= fin) {
    throw new Error('horario_horario_invertido: "' + titulo + '" (inicio es después de fin)');
  }
  validarFecha(desde, titulo, 'desde');
  validarFecha(hasta, titulo, 'hasta');
  if (desde > hasta) {
    throw new Error('horario_rango_invertido: "' + titulo + '" (desde es posterior a hasta)');
  }

  return {
    id: id, titulo: titulo, area: area, dias: parseDias(diasTexto, titulo),
    inicio: inicio, fin: fin, desde: desde, hasta: hasta, etiqueta: etiqueta
  };
}

function validarHora(texto, titulo, campo) {
  if (!/^\d{2}:\d{2}$/.test(texto || '')) {
    throw new Error('horario_hora_invalida: "' + titulo + '", campo "' + campo + '" (usá HH:mm, ej. 09:00)');
  }
}

function validarFecha(texto, titulo, campo) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) {
    throw new Error('horario_fecha_invalida: "' + titulo + '", campo "' + campo + '" (usá YYYY-MM-DD, ej. 2026-09-22)');
  }
}

function parseDias(texto, tituloParaError) {
  const tokens = String(texto || '').split(/[^a-záéíóúñA-ZÁÉÍÓÚÑ]+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error('horario_sin_dias: "' + tituloParaError + '"');
  }
  return tokens.map(function (token) {
    const clave = quitarTildes(token).toLowerCase().slice(0, 3);
    if (!(clave in DIAS_SEMANA)) {
      throw new Error(
        'dia_invalido: "' + token + '" en "' + tituloParaError + '" ' +
        '(usá Lun, Mar, Mié, Jue, Vie, Sáb o Dom)'
      );
    }
    return DIAS_SEMANA[clave];
  });
}

function quitarTildes(texto) {
  return texto
    .replace(/[áÁ]/g, 'a').replace(/[éÉ]/g, 'e').replace(/[íÍ]/g, 'i')
    .replace(/[óÓ]/g, 'o').replace(/[úÚ]/g, 'u');
}

function calcularOcurrencias(regla, hoy) {
  const desde = regla.desde.split('-').map(Number);
  const hasta = regla.hasta.split('-').map(Number);
  const fechas = [];
  const unDia = 24 * 60 * 60 * 1000;
  let cursor = Date.UTC(desde[0], desde[1] - 1, desde[2]);
  const limite = Date.UTC(hasta[0], hasta[1] - 1, hasta[2]);

  // Fechas en UTC puro (Date.UTC), sin conversión de zona horaria: acá solo
  // se hace aritmética de calendario ("qué día de la semana cae tal
  // fecha"), no se trabaja con instantes reales, así que mezclar con
  // America/La_Paz solo agregaría una fuente de error de más.
  while (cursor <= limite) {
    const fecha = new Date(cursor);
    if (regla.dias.indexOf(fecha.getUTCDay()) !== -1) {
      const texto = formatearFechaUTC(fecha);
      if (texto >= hoy) {
        fechas.push(texto);
      }
    }
    cursor += unDia;
  }
  return fechas;
}

function formatearFechaUTC(fecha) {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return anio + '-' + mes + '-' + dia;
}
