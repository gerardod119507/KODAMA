/**
 * KODAMA — funciones de un solo uso.
 * Se ejecutan a mano desde el editor de Apps Script (botón "Ejecutar").
 */

/**
 * Logger.log con "%s", pero armando el texto aquí. Motivo: Logger.log de
 * Apps Script formatea los números de JavaScript como decimales ("8.0
 * alumnos"); así sale "8 alumnos".
 */
function registrar(formato) {
  const valores = Array.prototype.slice.call(arguments, 1);
  Logger.log(String(formato).replace(/%s/g, function () {
    return valores.length ? String(valores.shift()) : '%s';
  }));
}

function configurarHojas() {
  // Misma lógica que corre sola en cada POST (Code.gs). Esta función queda
  // como atajo manual, por si quieres forzar el chequeo sin esperar a que
  // la app haga una petición.
  asegurarEstructura();
  registrar('Listo. Hojas "%s", "%s" y "%s" verificadas, zona horaria %s.',
    HOJA_AREAS, HOJA_BLOQUES, HOJA_HORARIO, ZONA_HORARIA);
}

function generarToken() {
  const propiedades = PropertiesService.getScriptProperties();
  if (propiedades.getProperty(PROPIEDAD_TOKEN)) {
    registrar('Ya existe un token. Para crear uno nuevo, borra primero la propiedad %s ' +
      'en Configuración del proyecto.', PROPIEDAD_TOKEN);
    return;
  }
  const token = Utilities.getUuid().replace(/-/g, '');
  propiedades.setProperty(PROPIEDAD_TOKEN, token);
  registrar('Token creado y guardado en Propiedades del script. Cópialo:');
  Logger.log(token);
}

/**
 * Vincula las reglas de la hoja Horario de Academia Fractal que tienen
 * alumno_id vacío con los alumnos de la hoja Alumnos, leyendo el nombre
 * desde el título ("Clase con Camila y Adriana" → Camila y Adriana).
 *
 * - Compara nombre y apellido sin distinguir tildes ni mayúsculas. Si el
 *   título trae solo el nombre, sirve si hay UN solo alumno con ese nombre.
 * - Si el título nombra a varios alumnos, vincula a todos.
 * - Si algún nombre no aparece o es ambiguo (dos alumnos con ese nombre),
 *   la fila queda sin tocar y se anota como pendiente.
 * - Solo escribe la columna alumno_id de las filas que vincula: no cambia
 *   títulos, no crea alumnos, no borra nada.
 *
 * Se ejecuta a mano desde el editor; el resultado queda en el registro de
 * ejecución (Logger).
 */
function vincularAlumnosEnHorario() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_HORARIO);
  const datos = hoja.getDataRange().getDisplayValues();
  const encabezados = datos[0];
  const cTitulo = encabezados.indexOf('título');
  const cArea = encabezados.indexOf('área');
  const cAlumnos = encabezados.indexOf('alumno_id');
  if (cTitulo === -1 || cArea === -1 || cAlumnos === -1) {
    throw new Error('A la hoja Horario le falta la columna "título", "área" o "alumno_id". ' +
      'Abre la app una vez (o ejecuta configurarHojas) y vuelve a intentar.');
  }

  const alumnos = leerAlumnos();
  const vinculadas = [];
  const pendientes = [];

  for (let f = 1; f < datos.length; f++) {
    const fila = datos[f];
    const titulo = String(fila[cTitulo] || '').trim();
    if (normalizarTexto(fila[cArea]) !== normalizarTexto(AREA_FRACTAL)) continue;
    if (String(fila[cAlumnos] || '').trim()) continue;
    const numeroFila = f + 1;
    if (!titulo) {
      pendientes.push({ fila: numeroFila, titulo: '', motivo: 'sin título' });
      continue;
    }

    const resuelto = resolverNombresDeTitulo(titulo, alumnos);
    if (resuelto.problema) {
      pendientes.push({ fila: numeroFila, titulo: titulo, motivo: resuelto.problema });
      continue;
    }
    const encontrados = resuelto.alumnos;
    fila[cAlumnos] = normalizarIdsAlumnos(encontrados.map(function (a) { return a.id; }).join(','));
    vinculadas.push({
      fila: numeroFila,
      titulo: titulo,
      alumnos: encontrados.map(function (a) { return (a.nombre + ' ' + a.apellido).trim(); })
    });
  }

  // Una sola escritura, solo de la columna alumno_id (las filas que no se
  // vincularon vuelven a escribirse con el mismo valor que ya tenían).
  if (vinculadas.length) {
    const columna = datos.slice(1).map(function (fila) { return [fila[cAlumnos]]; });
    hoja.getRange(2, cAlumnos + 1, columna.length, 1).setValues(columna);
  }

  registrar('Reglas vinculadas: %s. Pendientes: %s.', vinculadas.length, pendientes.length);
  vinculadas.forEach(function (v) {
    registrar('  ✓ fila %s: "%s" → %s', v.fila, v.titulo, v.alumnos.join(', '));
  });
  pendientes.forEach(function (p) {
    registrar('  ✗ fila %s: "%s" — %s (quedó sin tocar)', p.fila, p.titulo, p.motivo);
  });
  if (vinculadas.length) {
    registrar('Para que los bloques ya generados hereden los alumnos, toca "Regenerar horario" en la app.');
  }
  return { vinculadas: vinculadas, pendientes: pendientes };
}

/**
 * Los alumnos que nombra un título ("Camila y Adriana" → las dos), o el
 * motivo por el que no se puede decidir: algún nombre no está en Alumnos
 * o es ambiguo (dos alumnos con ese nombre). Nunca vincula a medias.
 */
function resolverNombresDeTitulo(titulo, alumnos) {
  const nombres = extraerNombresDeTitulo(titulo).nombres;
  if (nombres.length === 0) return { problema: 'no se reconoce ningún nombre' };
  const encontrados = [];
  const problemas = [];
  nombres.forEach(function (n) {
    const texto = (n.nombre + ' ' + n.apellido).trim();
    const candidatos = candidatosPorNombre(alumnos, n.nombre, n.apellido);
    if (candidatos.length === 1) {
      encontrados.push(candidatos[0]);
    } else if (candidatos.length === 0) {
      problemas.push('"' + texto + '" no está en Alumnos');
    } else {
      problemas.push('"' + texto + '" es ambiguo (' +
        candidatos.map(function (a) { return (a.nombre + ' ' + a.apellido).trim(); }).join(' / ') + ')');
    }
  });
  return problemas.length ? { problema: problemas.join('; ') } : { alumnos: encontrados };
}

/**
 * Mueve el aula de "notas" a "lugar" en las reglas de Universidad de la
 * hoja Horario ("Aula E511" en notas → lugar "Aula E511", notas vacía).
 *
 * - Solo reglas de Universidad con lugar vacío.
 * - Busca en notas UN aula ("Aula E511", "aula e 103", "AULA 12"). Lo que
 *   haya además del aula queda en notas ("Aula E511 - traer calculadora"
 *   → lugar "Aula E511", notas "traer calculadora").
 * - Si hay más de un aula en las notas, la fila queda sin tocar y se anota.
 * - Solo escribe las columnas notas y lugar de las filas que cambia.
 *
 * Después hay que tocar "Regenerar horario" para que los bloques ya
 * generados tomen el lugar de su regla.
 */
function moverAulasALugar() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_HORARIO);
  const datos = hoja.getDataRange().getDisplayValues();
  const encabezados = datos[0];
  const cTitulo = encabezados.indexOf('título');
  const cArea = encabezados.indexOf('área');
  const cNotas = encabezados.indexOf('notas');
  const cLugar = encabezados.indexOf('lugar');
  if (cArea === -1 || cNotas === -1 || cLugar === -1) {
    throw new Error('A la hoja Horario le falta la columna "área", "notas" o "lugar". ' +
      'Abre la app una vez (o ejecuta configurarHojas) y vuelve a intentar.');
  }

  const movidas = [];
  const pendientes = [];
  for (let f = 1; f < datos.length; f++) {
    const fila = datos[f];
    if (normalizarTexto(fila[cArea]) !== 'universidad') continue;
    if (String(fila[cLugar] || '').trim()) continue;
    const resultado = separarAula(fila[cNotas]);
    if (!resultado) continue; // sin aula en las notas: nada que mover
    if (resultado.varias) {
      pendientes.push({ fila: f + 1, titulo: fila[cTitulo], notas: fila[cNotas], motivo: 'hay más de un aula' });
      continue;
    }
    movidas.push({ fila: f + 1, titulo: fila[cTitulo], lugar: resultado.aula, notas: resultado.resto });
    fila[cLugar] = resultado.aula;
    fila[cNotas] = resultado.resto;
  }

  if (movidas.length) {
    const columna = function (c) { return datos.slice(1).map(function (fila) { return [fila[c]]; }); };
    hoja.getRange(2, cNotas + 1, datos.length - 1, 1).setValues(columna(cNotas));
    hoja.getRange(2, cLugar + 1, datos.length - 1, 1).setValues(columna(cLugar));
  }

  registrar('Aulas movidas a "lugar": %s. Pendientes: %s.', movidas.length, pendientes.length);
  movidas.forEach(function (m) {
    registrar('  ✓ fila %s: "%s" → lugar "%s"%s', m.fila, m.titulo, m.lugar,
      m.notas ? ' (en notas quedó: "' + m.notas + '")' : '');
  });
  pendientes.forEach(function (p) {
    registrar('  ✗ fila %s: "%s" — %s en "%s" (quedó sin tocar)', p.fila, p.titulo, p.motivo, p.notas);
  });
  if (movidas.length) {
    registrar('Toca "Regenerar horario" en la app para que las clases ya generadas muestren el aula.');
  }
  return { movidas: movidas, pendientes: pendientes };
}

/**
 * "Aula E511 - traer calculadora" → { aula: "Aula E511", resto: "traer calculadora" }.
 * Sin aula → null. Más de una → { varias: true }.
 */
function separarAula(notas) {
  const texto = String(notas || '');
  const patron = /\baula\s*[a-z]?\s*-?\s*\d+[a-z]?\b/gi;
  const encontradas = texto.match(patron);
  if (!encontradas) return null;
  if (encontradas.length > 1) return { varias: true };
  const aula = encontradas[0].replace(/\s+/g, ' ').replace(/^aula/i, 'Aula').trim();
  const resto = texto.replace(encontradas[0], ' ')
    .replace(/^[\s\-–—·,;:.]+|[\s\-–—·,;:]+$/g, '')
    .replace(/\s{2,}/g, ' ');
  return { aula: aula, resto: resto };
}

// ---------------------------------------------------------------------
// Reparación de Academia Fractal (lo que encontró auditarDatos)
// ---------------------------------------------------------------------

/**
 * VISTA PREVIA: no escribe nada. Anota en el registro todo lo que haría
 * repararAlumnosFractalAplicar(). Ejecuta esta primero.
 */
function repararAlumnosFractal() {
  return repararDatosFractal(false);
}

/** Aplica la reparación (misma lógica que la vista previa, pero escribe). */
function repararAlumnosFractalAplicar() {
  return repararDatosFractal(true);
}

/**
 * Arregla, en este orden:
 * 1. Alumnos con nombre y sin id: les pone un id (a + 8 hexadecimales).
 *    Las filas sin nombre se ignoran.
 * 2. Curso que no está en el catálogo pero es una forma de escribir uno
 *    que sí está ("3ero de secundaria" → "3ro de secundaria").
 * 3. Reglas de Fractal sin alumnos: las vincula por el nombre del título
 *    (misma lógica que vincularAlumnosEnHorario).
 * 4. Bloques de Fractal sin alumnos, pasados y futuros: los de una regla
 *    copian los alumnos de su regla; los sueltos se vinculan por el título.
 *
 * El título se vacía SOLO si es exactamente el nombre de los alumnos
 * vinculados ("Katy", "Camila y Adriana"). Si tiene algo más ("Clase con
 * Katy", "Katy - Física") queda tal cual y se anota.
 *
 * Solo escribe: id y curso en Alumnos; título y alumno_id en Horario y
 * Bloques. No crea alumnos, no borra nada, no toca archivados ni otras
 * áreas. Lo que no se puede decidir (nombre que no está o ambiguo) queda
 * sin tocar y se anota como pendiente.
 */
function repararDatosFractal(aplicar) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hojaA = libro.getSheetByName(HOJA_ALUMNOS);
  const hojaH = libro.getSheetByName(HOJA_HORARIO);
  const hojaB = libro.getSheetByName(HOJA_BLOQUES);
  const datosA = hojaA.getDataRange().getDisplayValues();
  const datosH = hojaH.getDataRange().getDisplayValues();
  const datosB = hojaB.getDataRange().getDisplayValues();
  const resumen = { ids: [], cursos: [], reglas: [], bloques: [], titulosQueQuedan: [], pendientes: [] };

  // --- 1. Ids de alumnos ---------------------------------------------------
  const filasA = datosA.slice(1);
  const cId = COLUMNAS_ALUMNOS.indexOf('id');
  const cCurso = COLUMNAS_ALUMNOS.indexOf('curso');
  asignarIdsFaltantes(filasA).forEach(function (i) {
    resumen.ids.push({ fila: i + 2, alumno: nombreDeFilaAlumno(filasA[i]), id: filasA[i][cId] });
  });

  // --- 2. Cursos fuera del catálogo ----------------------------------------
  const cursos = leerCatalogo('cursos');
  filasA.forEach(function (fila, i) {
    const curso = String(fila[cCurso] || '').trim();
    if (!String(fila[1]).trim() || !curso || cursos.some(function (c) { return c.nombre === curso; })) return;
    const nuevo = cursoParecidoDelCatalogo(cursos, curso);
    if (nuevo) {
      resumen.cursos.push({ fila: i + 2, alumno: nombreDeFilaAlumno(fila), antes: curso, despues: nuevo });
      fila[cCurso] = nuevo;
    } else {
      resumen.pendientes.push({ hoja: 'Alumnos', fila: i + 2, titulo: nombreDeFilaAlumno(fila),
        motivo: 'el curso "' + curso + '" no se parece a ninguno del catálogo' });
    }
  });

  const alumnos = filasA.filter(function (fila) { return fila[cId] && String(fila[1]).trim(); }).map(filaAAlumno);

  // --- 3. Reglas del horario -----------------------------------------------
  const h = columnasPorEncabezado(datosH[0], ['id', 'título', 'área', 'archivado', 'alumno_id'], 'Horario');
  const reglaPorId = {};
  for (let f = 1; f < datosH.length; f++) {
    const fila = datosH[f];
    if (fila[h.id]) reglaPorId[fila[h.id]] = { fila: f + 1, valores: fila };
    if (!esFilaFractalSinAlumnos(fila, h)) continue;
    const titulo = String(fila[h['título']] || '').trim();
    if (!titulo) continue; // sin título ni alumnos: una fila vacía
    const resuelto = resolverNombresDeTitulo(titulo, alumnos);
    if (resuelto.problema) {
      resumen.pendientes.push({ hoja: 'Horario', fila: f + 1, titulo: titulo, motivo: resuelto.problema });
      continue;
    }
    vincularFila(fila, h, resuelto.alumnos, 'Horario', f + 1, '', resumen, resumen.reglas);
  }

  // --- 4. Bloques ------------------------------------------------------------
  const b = columnasPorEncabezado(datosB[0], ['id', 'título', 'área', 'fecha', 'archivado', 'alumno_id'], 'Bloques');
  const porAlumnoId = {};
  alumnos.forEach(function (a) { porAlumnoId[a.id] = a; });
  for (let f = 1; f < datosB.length; f++) {
    const fila = datosB[f];
    if (!fila[b.id] || !esFilaFractalSinAlumnos(fila, b)) continue;
    const titulo = String(fila[b['título']] || '').trim();
    const donde = ' (' + fila[b.fecha] + ')';
    const partes = partirIdDeBloque(fila[b.id]);
    const regla = partes && reglaPorId[partes.idSerie];
    let vinculados;
    if (regla) {
      // Bloque de una regla: hereda los alumnos de su regla (ya vinculada).
      const ids = String(regla.valores[h.alumno_id] || '').trim();
      if (!ids) {
        resumen.pendientes.push({ hoja: 'Bloques', fila: f + 1, titulo: titulo + donde,
          motivo: 'su regla (fila ' + regla.fila + ' de Horario) quedó sin alumnos' });
        continue;
      }
      vinculados = ids.split(',').map(function (id) { return porAlumnoId[id]; });
      if (vinculados.some(function (a) { return !a; })) {
        resumen.pendientes.push({ hoja: 'Bloques', fila: f + 1, titulo: titulo + donde,
          motivo: 'su regla (fila ' + regla.fila + ' de Horario) tiene un alumno que no existe' });
        continue;
      }
    } else {
      // Bloque suelto (o de una regla que ya no está): por el título.
      const resuelto = titulo ? resolverNombresDeTitulo(titulo, alumnos) : { problema: 'sin título' };
      if (resuelto.problema) {
        resumen.pendientes.push({ hoja: 'Bloques', fila: f + 1, titulo: titulo + donde, motivo: resuelto.problema });
        continue;
      }
      vinculados = resuelto.alumnos;
    }
    vincularFila(fila, b, vinculados, 'Bloques', f + 1, donde, resumen, resumen.bloques);
  }

  // --- Escritura: solo las columnas que cambiaron ------------------------------
  if (aplicar) {
    if (resumen.ids.length) escribirColumna(hojaA, filasA, cId);
    if (resumen.cursos.length) escribirColumna(hojaA, filasA, cCurso);
    if (resumen.reglas.length) {
      escribirColumna(hojaH, datosH.slice(1), h.alumno_id);
      escribirColumna(hojaH, datosH.slice(1), h['título']);
    }
    if (resumen.bloques.length) {
      escribirColumna(hojaB, datosB.slice(1), b.alumno_id);
      escribirColumna(hojaB, datosB.slice(1), b['título']);
    }
  }

  registrarReparacion(resumen, aplicar);
  return resumen;
}

function nombreDeFilaAlumno(fila) {
  return (String(fila[1] || '') + ' ' + String(fila[2] || '')).trim();
}

/** { id: 0, 'título': 1, … } con la posición de cada encabezado; falla si falta alguno. */
function columnasPorEncabezado(encabezados, nombres, hoja) {
  const columnas = {};
  nombres.forEach(function (nombre) {
    columnas[nombre] = encabezados.indexOf(nombre);
    if (columnas[nombre] === -1) {
      throw new Error('A la hoja ' + hoja + ' le falta la columna "' + nombre + '". ' +
        'Abre la app una vez (o ejecuta configurarHojas) y vuelve a intentar.');
    }
  });
  return columnas;
}

function esFilaFractalSinAlumnos(fila, c) {
  return normalizarTexto(fila[c['área']]) === normalizarTexto(AREA_FRACTAL) &&
    String(fila[c.archivado] || '').trim().toUpperCase() !== 'TRUE' &&
    !String(fila[c.alumno_id] || '').trim();
}

/** En memoria: pone los alumnos y, si el título es solo sus nombres, lo vacía. */
function vincularFila(fila, c, vinculados, hoja, numero, donde, resumen, lista) {
  const titulo = String(fila[c['título']] || '').trim();
  const nombres = vinculados.map(function (a) { return (a.nombre + ' ' + a.apellido).trim(); });
  fila[c.alumno_id] = vinculados.map(function (a) { return a.id; }).join(',');
  const vaciar = Boolean(titulo) && tituloEsSoloNombres(titulo, vinculados);
  if (vaciar) fila[c['título']] = '';
  lista.push({ fila: numero, titulo: titulo, alumnos: nombres, tituloVaciado: vaciar, donde: donde });
  if (titulo && !vaciar) {
    resumen.titulosQueQuedan.push({ hoja: hoja, fila: numero, titulo: titulo + donde });
  }
}

/**
 * true si el título no tiene nada más que los nombres de estos alumnos
 * (y "y", "e", comas o barras entre ellos), y los nombra a todos.
 * "Camila y Adriana" → true; "Clase con Katy", "Katy - Física" → false.
 */
function tituloEsSoloNombres(titulo, alumnos) {
  const palabras = normalizarTexto(titulo).split(/[\s,\/+&]+/).filter(Boolean);
  const permitidas = { y: true, e: true };
  alumnos.forEach(function (a) {
    normalizarTexto(a.nombre + ' ' + a.apellido).split(' ').forEach(function (p) { if (p) permitidas[p] = true; });
  });
  return palabras.length > 0 &&
    palabras.every(function (p) { return permitidas[p]; }) &&
    alumnos.every(function (a) {
      return normalizarTexto(a.nombre).split(' ').every(function (p) { return palabras.indexOf(p) !== -1; });
    });
}

/**
 * El curso del catálogo que corresponde a una forma distinta de escribirlo:
 * mismo número y mismo resto, sin importar el sufijo del ordinal ni tildes
 * ("3ero de secundaria", "3° de secundaria" → "3ro de secundaria"). Si no
 * hay exactamente uno, null.
 */
function cursoParecidoDelCatalogo(cursos, texto) {
  const exacto = resolverCatalogo(cursos, texto);
  if (exacto) return exacto;
  const clave = function (t) {
    return normalizarTexto(t).replace(/^(\d+)\s*(ero|era|ro|ra|er|do|da|to|ta|vo|va|no|na|mo|ma|°|º|o|a)?\.?(?=\s|$)/, '$1');
  };
  const buscado = clave(texto);
  const iguales = cursos.filter(function (c) { return clave(c.nombre) === buscado || clave(c.corto) === buscado; });
  return iguales.length === 1 ? iguales[0].nombre : null;
}

function escribirColumna(hoja, filas, columna) {
  if (!filas.length) return;
  hoja.getRange(2, columna + 1, filas.length, 1).setValues(filas.map(function (fila) {
    return [fila[columna] != null ? fila[columna] : ''];
  }));
}

function registrarReparacion(r, aplicar) {
  registrar(aplicar
    ? 'REPARACIÓN APLICADA en el Sheet.'
    : 'VISTA PREVIA: no se cambió nada. Para aplicarlo, ejecuta repararAlumnosFractalAplicar().');

  registrar('1. Ids de alumnos: %s.', r.ids.length);
  r.ids.forEach(function (x) { registrar('  ✓ fila %s: %s → id %s', x.fila, x.alumno, x.id); });

  registrar('2. Cursos corregidos: %s.', r.cursos.length);
  r.cursos.forEach(function (x) { registrar('  ✓ fila %s: %s: "%s" → "%s"', x.fila, x.alumno, x.antes, x.despues); });

  registrar('3. Reglas del horario vinculadas: %s (título vaciado en %s).', r.reglas.length,
    r.reglas.filter(function (x) { return x.tituloVaciado; }).length);
  r.reglas.forEach(function (x) {
    registrar('  ✓ fila %s: "%s" → %s%s', x.fila, x.titulo, x.alumnos.join(', '), x.tituloVaciado ? ' (título vaciado)' : '');
  });

  registrar('4. Bloques vinculados: %s (título vaciado en %s).', r.bloques.length,
    r.bloques.filter(function (x) { return x.tituloVaciado; }).length);
  // Agrupados por alumnos, para no listar 95 líneas iguales.
  const grupos = agrupar(r.bloques, function (x) { return x.alumnos.join(', '); });
  Object.keys(grupos).forEach(function (nombres) {
    const g = grupos[nombres];
    const fechas = g.map(function (x) { return x.donde.replace(/[ ()]/g, ''); }).sort();
    registrar('  ✓ %s: %s bloques, del %s al %s (título vaciado en %s)', nombres, g.length,
      fechas[0], fechas[fechas.length - 1], g.filter(function (x) { return x.tituloVaciado; }).length);
  });

  registrar('Títulos que quedan como están (tienen algo más que el nombre): %s.', r.titulosQueQuedan.length);
  r.titulosQueQuedan.forEach(function (x) { registrar('  · %s fila %s: "%s"', x.hoja, x.fila, x.titulo); });

  registrar('Pendientes (quedaron sin tocar): %s.', r.pendientes.length);
  r.pendientes.forEach(function (x) { registrar('  ✗ %s fila %s: "%s" — %s', x.hoja, x.fila, x.titulo, x.motivo); });

  if (aplicar) registrar('Listo. Ejecuta auditarDatos() para confirmar.');
}
