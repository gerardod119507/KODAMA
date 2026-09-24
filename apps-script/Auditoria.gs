/**
 * KODAMA — auditoría del modelo de datos. SOLO LECTURA.
 *
 * auditarDatos() se ejecuta a mano desde el editor de Apps Script. Lee
 * Alumnos, Cursos, Colegios, Horario y Bloques una vez cada una, revisa que
 * todo sea coherente y escribe un informe en el registro de ejecución
 * (Logger): cada problema con cuántas filas afecta y ejemplos con su número
 * de fila. No escribe, no borra y no cambia nada en ninguna hoja.
 */

const MAX_EJEMPLOS_AUDITORIA = 15;
// Títulos de ejemplo que aparecían en la documentación (docs/*.md): si
// están en la hoja, probablemente son de las pruebas del principio.
const TITULOS_DE_EJEMPLO = ['Café con inversionista', 'Clase con Valentina', 'Reunión imprevista', 'Standup'];

function auditarDatos() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoy = Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd');

  function leer(nombre) {
    const hoja = libro.getSheetByName(nombre);
    if (!hoja || hoja.getLastRow() < 1) return { encabezados: [], filas: [] };
    const datos = hoja.getDataRange().getDisplayValues();
    return {
      encabezados: datos[0],
      filas: datos.slice(1)
        .map(function (valores, i) { return { numero: i + 2, valores: valores }; })
        .filter(function (f) { return f.valores.some(function (v) { return String(v).trim(); }); })
    };
  }
  function col(tabla, nombre) {
    return function (fila) { const i = tabla.encabezados.indexOf(nombre); return i === -1 ? '' : String(fila.valores[i] || '').trim(); };
  }

  const tAlumnos = leer(HOJA_ALUMNOS);
  const tHorario = leer(HOJA_HORARIO);
  const tBloques = leer(HOJA_BLOQUES);
  const cursos = leerCatalogo('cursos').map(function (c) { return c.nombre; });
  const colegios = leerCatalogo('colegios').map(function (c) { return c.nombre; });

  const hallazgos = [];
  function hallazgo(seccion, titulo, filas, propuesta, cantidad) {
    if (filas.length) {
      hallazgos.push({ seccion: seccion, titulo: titulo, cantidad: cantidad || filas.length, ejemplos: filas, propuesta: propuesta });
    }
  }

  // --- Alumnos -----------------------------------------------------------
  const a = {
    id: col(tAlumnos, 'id'), nombre: col(tAlumnos, 'nombre'), apellido: col(tAlumnos, 'apellido'),
    curso: col(tAlumnos, 'curso'), colegio: col(tAlumnos, 'colegio'), tarifa: col(tAlumnos, 'tarifa_hora'),
    pago: col(tAlumnos, 'forma_pago'), archivado: col(tAlumnos, 'archivado')
  };
  const alumnos = tAlumnos.filas.filter(function (f) { return a.id(f) || a.nombre(f); });
  const alumnoPorId = {};
  alumnos.forEach(function (f) { alumnoPorId[a.id(f)] = f; });
  const nombreDe = function (f) { return (a.nombre(f) + ' ' + a.apellido(f)).trim(); };
  const activos = alumnos.filter(function (f) { return a.archivado(f) !== 'TRUE'; });

  const repetidos = duplicados(agrupar(alumnos, function (f) { return claveDeAlumno(a.nombre(f), a.apellido(f)); }));
  hallazgo('Alumnos', 'Alumnos repetidos (mismo nombre y apellido)',
    repetidos.map(function (g) { return g.map(function (f) { return 'fila ' + f.numero; }).join(' y ') + ': ' + nombreDe(g[0]); }),
    'Unificar en uno solo: pasar sus clases al que queda y archivar el otro.',
    repetidos.reduce(function (n, g) { return n + g.length; }, 0));

  const porNombre = agrupar(alumnos, function (f) { return normalizarTexto(a.nombre(f)); });
  const homonimosSinApellido = [];
  Object.keys(porNombre).forEach(function (k) {
    const grupo = porNombre[k];
    if (grupo.length < 2) return;
    grupo.filter(function (f) { return !a.apellido(f); }).forEach(function (f) {
      homonimosSinApellido.push('fila ' + f.numero + ': "' + a.nombre(f) + '" sin apellido, y hay ' +
        grupo.filter(function (o) { return o !== f; }).map(nombreDe).join(', '));
    });
  });
  hallazgo('Alumnos', 'Alumno sin apellido con el mismo nombre que otro (no se sabe cuál es)', homonimosSinApellido,
    'Decidir a cuál de los otros corresponde, pasarle sus clases y archivar el que no tiene apellido.');

  hallazgo('Alumnos', 'Curso que no está en el catálogo Cursos (texto suelto)',
    alumnos.filter(function (f) { return a.curso(f) && cursos.indexOf(a.curso(f)) === -1; })
      .map(function (f) { return 'fila ' + f.numero + ': ' + nombreDe(f) + ' → "' + a.curso(f) + '"'; }),
    'Cambiarlo por el curso del catálogo que corresponde, o agregarlo al catálogo.');
  hallazgo('Alumnos', 'Colegio que no está en el catálogo Colegios (texto suelto)',
    alumnos.filter(function (f) { return a.colegio(f) && colegios.indexOf(a.colegio(f)) === -1; })
      .map(function (f) { return 'fila ' + f.numero + ': ' + nombreDe(f) + ' → "' + a.colegio(f) + '"'; }),
    'Cambiarlo por el colegio del catálogo que corresponde, o agregarlo al catálogo.');
  hallazgo('Alumnos', 'Alumno activo sin curso o sin colegio',
    activos.filter(function (f) { return !a.curso(f) || !a.colegio(f); })
      .map(function (f) { return 'fila ' + f.numero + ': ' + nombreDe(f) + ' (falta ' + [!a.curso(f) ? 'curso' : '', !a.colegio(f) ? 'colegio' : ''].filter(Boolean).join(' y ') + ')'; }),
    'Completarlo en la pantalla Alumnos.');
  hallazgo('Alumnos', 'Alumno activo sin tarifa',
    activos.filter(function (f) { return !a.tarifa(f); }).map(function (f) { return 'fila ' + f.numero + ': ' + nombreDe(f); }),
    'Cargar la tarifa en la pantalla Alumnos (solo tú sabes el monto).');
  hallazgo('Alumnos', 'Tarifa que no es un número',
    alumnos.filter(function (f) { return a.tarifa(f) && !/^\d+(\.\d+)?$/.test(a.tarifa(f)); })
      .map(function (f) { return 'fila ' + f.numero + ': ' + nombreDe(f) + ' → "' + a.tarifa(f) + '"'; }),
    'Corregirla en la pantalla Alumnos.');
  hallazgo('Alumnos', 'Forma de pago distinta de "hora" o "mensual"',
    alumnos.filter(function (f) { return FORMAS_PAGO.indexOf(a.pago(f)) === -1; })
      .map(function (f) { return 'fila ' + f.numero + ': ' + nombreDe(f) + ' → "' + a.pago(f) + '"'; }),
    'Corregirla en la pantalla Alumnos.');
  hallazgo('Alumnos', 'Id de alumno con forma rara (no es "a" + 8 hexadecimales)',
    alumnos.filter(function (f) { return !/^a[0-9a-f]{8}$/.test(a.id(f)); }).map(function (f) { return 'fila ' + f.numero + ': "' + a.id(f) + '" ' + nombreDe(f); }),
    'Revisar si es una fila cargada a mano; darle un id válido desde la app.');

  // --- Reglas (Horario) y bloques: vínculos con alumnos --------------------
  function revisarVinculos(tabla, etiqueta, esBloque) {
    const id = col(tabla, 'id');
    const titulo = col(tabla, 'título');
    const area = col(tabla, 'área');
    const ids = col(tabla, 'alumno_id');
    const archivado = col(tabla, 'archivado');
    const fecha = col(tabla, 'fecha');
    // Toda fila con id y no archivada cuenta (un bloque generado puede no
    // tener título ni alumnos, y justamente eso es lo que hay que ver).
    const vivas = tabla.filas.filter(function (f) { return archivado(f) !== 'TRUE' && (id(f) || titulo(f) || ids(f)); });
    const fractal = vivas.filter(function (f) { return area(f) === AREA_FRACTAL; });
    const describir = function (f) {
      return 'fila ' + f.numero + (esBloque ? ' (' + fecha(f) + ')' : '') + ': "' + (titulo(f) || id(f)) + '"';
    };

    hallazgo(etiqueta, (esBloque ? 'Bloques' : 'Reglas') + ' de Academia Fractal sin alumnos vinculados',
      fractal.filter(function (f) { return !ids(f); }).map(describir),
      esBloque
        ? 'Si vienen de una regla, copiarles los alumnos de su regla; si son sueltos, vincularlos con "Vincular alumnos en clases de Fractal".'
        : 'Vincularlas (vincularAlumnosEnHorario o desde el editor de reglas) y revisar las que queden pendientes.');

    hallazgo(etiqueta, (esBloque ? 'Bloques' : 'Reglas') + ' de otras áreas con alumnos vinculados',
      vivas.filter(function (f) { return area(f) !== AREA_FRACTAL && ids(f); }).map(function (f) { return describir(f) + ' (' + area(f) + ')'; }),
      'Quitarles los alumnos (solo Academia Fractal tiene alumnos).');

    hallazgo(etiqueta, 'Vinculados a un alumno que no existe',
      vivas.filter(function (f) { return ids(f) && ids(f).split(',').some(function (x) { return !alumnoPorId[x.trim()]; }); }).map(describir),
      'Volver a elegir el alumno correcto.');

    // Faltan alumnos: el título nombra más alumnos (que existen) de los vinculados.
    hallazgo(etiqueta, 'El título nombra más alumnos que los vinculados (ej. "Camila y Adriana" con uno solo)',
      fractal.filter(function (f) {
        if (!ids(f)) return false;
        const nombrados = extraerNombresDeTitulo(titulo(f)).nombres.filter(function (n) {
          return alumnos.some(function (x) { return normalizarTexto(a.nombre(x)) === normalizarTexto(n.nombre); });
        });
        return nombrados.length > ids(f).split(',').length;
      }).map(function (f) { return describir(f) + ' con ' + ids(f).split(',').length + ' alumno(s)'; }),
      'Agregar el alumno que falta a la regla (y regenerar).');

    // El nombre sigue en el título/tema aunque ya está vinculado.
    hallazgo(etiqueta, 'El nombre del alumno sigue escrito en el título o tema',
      vivas.filter(function (f) {
        if (!ids(f) || !titulo(f)) return false;
        const palabras = normalizarTexto(titulo(f)).split(/[^a-z0-9ñ]+/);
        return ids(f).split(',').some(function (x) {
          const alumno = alumnoPorId[x.trim()];
          return alumno && palabras.indexOf(normalizarTexto(a.nombre(alumno))) !== -1;
        });
      }).map(describir),
      'Dejar en el título solo el tema (ej. "Física") o vacío: el nombre ya sale del vínculo.');
  }
  revisarVinculos(tHorario, 'Horario', false);
  revisarVinculos(tBloques, 'Bloques', true);

  // --- Series: cada bloque generado apunta a una regla que existe --------
  const hId = col(tHorario, 'id');
  const hIds = col(tHorario, 'alumno_id');
  const reglaPorId = {};
  tHorario.filas.forEach(function (f) { if (hId(f)) reglaPorId[hId(f)] = f; });
  hallazgo('Horario', 'Id de regla con forma rara (no es "h" + 8 hexadecimales)',
    tHorario.filas.filter(function (f) { return filaDeHorarioConContenido(f.valores) && !esIdDeSerie(hId(f)); })
      .map(function (f) { return 'fila ' + f.numero + ': "' + hId(f) + '"'; }),
    'Tocar "Regenerar horario": el generador les pone un id válido.');

  const bId = col(tBloques, 'id');
  const bIds = col(tBloques, 'alumno_id');
  const bFecha = col(tBloques, 'fecha');
  const bTitulo = col(tBloques, 'título');
  const bArchivado = col(tBloques, 'archivado');
  const huerfanos = {};
  const seriesRaras = {};
  const divergentes = [];
  const idsRaros = [];
  const deEjemplo = [];
  tBloques.filas.forEach(function (f) {
    const id = bId(f);
    const partes = partirIdDeBloque(id);
    if (partes && !esIdDeSerie(partes.idSerie)) {
      (seriesRaras[partes.idSerie] = seriesRaras[partes.idSerie] || []).push(f);
    } else if (partes && !reglaPorId[partes.idSerie]) {
      (huerfanos[partes.idSerie] = huerfanos[partes.idSerie] || []).push(f);
    } else if (partes && bArchivado(f) !== 'TRUE' && bIds(f) !== hIds(reglaPorId[partes.idSerie])) {
      divergentes.push(f);
    } else if (!partes && !/^b[0-9a-f]{8}$/.test(id)) {
      idsRaros.push(f);
    }
    if (TITULOS_DE_EJEMPLO.indexOf(bTitulo(f)) !== -1) deEjemplo.push(f);
  });
  const resumenSeries = function (mapa) {
    return Object.keys(mapa).map(function (s) {
      return 'serie "' + s + '": ' + mapa[s].length + ' bloques (ej. fila ' + mapa[s][0].numero + ' "' + bTitulo(mapa[s][0]) + '")';
    });
  };
  const contar = function (mapa) { return Object.keys(mapa).reduce(function (n, k) { return n + mapa[k].length; }, 0); };

  if (contar(seriesRaras)) {
    hallazgos.push({ seccion: 'Bloques', titulo: 'Bloques con id de serie inválido (ej. "(vacío)-2026-09-22")',
      cantidad: contar(seriesRaras), ejemplos: resumenSeries(seriesRaras),
      propuesta: 'Borrarlos con "Limpiar bloques generados" en Configuración (son restos de pruebas).' });
  }
  if (contar(huerfanos)) {
    hallazgos.push({ seccion: 'Bloques', titulo: 'Bloques huérfanos: su regla ya no existe en Horario',
      cantidad: contar(huerfanos), ejemplos: resumenSeries(huerfanos),
      propuesta: 'Borrarlos con "Limpiar bloques generados" en Configuración.' });
  }
  const pasados = divergentes.filter(function (f) { return bFecha(f) < hoy; });
  const futuros = divergentes.filter(function (f) { return bFecha(f) >= hoy; });
  hallazgo('Bloques', 'Bloques FUTUROS generados con alumnos distintos a los de su regla',
    futuros.map(function (f) { return 'fila ' + f.numero + ' (' + bFecha(f) + '): "' + (bTitulo(f) || bId(f)) + '"'; }),
    'Tocar "Regenerar horario": el generador los iguala a la regla.');
  hallazgo('Bloques', 'Bloques PASADOS generados con alumnos distintos a los de su regla',
    pasados.map(function (f) { return 'fila ' + f.numero + ' (' + bFecha(f) + '): "' + (bTitulo(f) || bId(f)) + '"'; }),
    'El generador nunca toca el pasado: hace falta una corrección puntual que copie los alumnos de la regla a esos bloques.');
  hallazgo('Bloques', 'Bloques con id de forma rara (probablemente de prueba, cargados a mano)',
    idsRaros.map(function (f) { return 'fila ' + f.numero + ': "' + bId(f) + '" "' + bTitulo(f) + '" (' + bFecha(f) + ')'; }),
    'Confirmar cuáles son de prueba y archivarlos.');
  hallazgo('Bloques', 'Bloques con un título de ejemplo de la documentación',
    deEjemplo.map(function (f) { return 'fila ' + f.numero + ': "' + bId(f) + '" "' + bTitulo(f) + '" (' + bFecha(f) + ')'; }),
    'Confirmar si son de prueba y archivarlos.');

  // --- Informe -------------------------------------------------------------
  const total = hallazgos.reduce(function (n, h) { return n + h.cantidad; }, 0);
  registrar('AUDITORÍA DE DATOS (solo lectura, no se cambió nada). %s alumnos, %s reglas, %s bloques.',
    alumnos.length, tHorario.filas.length, tBloques.filas.length);
  if (!hallazgos.length) {
    registrar('Todo en orden: no se encontró ningún problema.');
  }
  hallazgos.forEach(function (h, i) {
    registrar('%s. [%s] %s — %s fila(s).', i + 1, h.seccion, h.titulo, h.cantidad);
    h.ejemplos.slice(0, MAX_EJEMPLOS_AUDITORIA).forEach(function (e) { registrar('     · %s', e); });
    if (h.ejemplos.length > MAX_EJEMPLOS_AUDITORIA) {
      registrar('     · … y %s más', h.ejemplos.length - MAX_EJEMPLOS_AUDITORIA);
    }
    registrar('     Propuesta: %s', h.propuesta);
  });
  if (hallazgos.length) registrar('Total: %s problemas en %s filas.', hallazgos.length, total);
  return { hallazgos: hallazgos, total: total };
}

function agrupar(filas, clave) {
  const grupos = {};
  filas.forEach(function (f) {
    const k = clave(f);
    (grupos[k] = grupos[k] || []).push(f);
  });
  return grupos;
}

function duplicados(grupos) {
  return Object.keys(grupos).map(function (k) { return grupos[k]; }).filter(function (g) { return g.length > 1; });
}
