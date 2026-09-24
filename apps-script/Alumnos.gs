/**
 * KODAMA — alumnos de Academia Fractal (Checkpoint 7).
 *
 * Hoja "Alumnos" (una fila por alumno) y dos catálogos editables, "Cursos"
 * y "Colegios", con nombre completo y código corto. En la hoja del alumno
 * se guarda SIEMPRE el nombre completo del curso y del colegio; el código
 * corto es solo para mostrar ("Agustín Aliendre — 4to SA").
 *
 * Los bloques y las reglas del horario se vinculan a los alumnos por la
 * columna alumno_id (ids separados por coma: una clase puede tener varios).
 */

const HOJA_ALUMNOS = 'Alumnos';
const HOJA_CURSOS = 'Cursos';
const HOJA_COLEGIOS = 'Colegios';
const HOJAS_CATALOGO = { cursos: HOJA_CURSOS, colegios: HOJA_COLEGIOS };
const AREA_FRACTAL = 'Academia Fractal';

// lugar: el lugar habitual de sus clases (al final: se agregó después).
const COLUMNAS_ALUMNOS = [
  'id', 'nombre', 'apellido', 'curso', 'colegio', 'tarifa_hora',
  'forma_calculo', 'forma_pago', 'notas', 'archivado', 'lugar'
];
const CAMPOS_EDITABLES_ALUMNO = ['nombre', 'apellido', 'curso', 'colegio', 'tarifa_hora', 'forma_pago', 'notas', 'lugar'];

// forma_calculo: cómo se calcula lo que se debe (siempre por hora).
// forma_pago: cuándo se cobra. Son cosas distintas: un alumno puede
// calcularse por hora y pagar por mes.
const FORMA_CALCULO = 'hora';
const FORMAS_PAGO = ['hora', 'mensual'];

const CURSOS_INICIALES = [
  ['1ro de secundaria', '1ro'], ['2do de secundaria', '2do'], ['3ro de secundaria', '3ro'],
  ['4to de secundaria', '4to'], ['5to de secundaria', '5to'], ['6to de secundaria', '6to'],
  ['1er año universidad', '1er univ'], ['2do año universidad', '2do univ'],
  ['3er año universidad', '3er univ'], ['4to año universidad', '4to univ'],
  ['5to año universidad', '5to univ']
];
const COLEGIOS_INICIALES = [
  ['Unidad Educativa San Agustín', 'SA'],
  ['Colegio Poveda', 'Poveda'],
  ['Universidad Católica Boliviana', 'UCB']
];

// ---------------------------------------------------------------------
// Estructura
// ---------------------------------------------------------------------

function asegurarHojaAlumnos(libro) {
  const hoja = libro.getSheetByName(HOJA_ALUMNOS) || libro.insertSheet(HOJA_ALUMNOS);
  if (hoja.getLastRow() === 0) {
    // Todo en texto: la tarifa "80" no debe convertirse en número con
    // formato de moneda, ni un apellido raro en fecha.
    hoja.getRange(1, 1, hoja.getMaxRows(), COLUMNAS_ALUMNOS.length).setNumberFormat('@');
    hoja.getRange(1, 1, 1, COLUMNAS_ALUMNOS.length).setValues([COLUMNAS_ALUMNOS]);
    hoja.setFrozenRows(1);
  } else {
    migrarColumnaAlFinal(hoja, COLUMNAS_ALUMNOS, 'lugar');
  }
  return hoja;
}

function asegurarCatalogo(libro, nombreHoja, iniciales) {
  const hoja = libro.getSheetByName(nombreHoja) || libro.insertSheet(nombreHoja);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, hoja.getMaxRows(), 2).setNumberFormat('@');
    hoja.getRange(1, 1, iniciales.length + 1, 2).setValues([['nombre', 'corto']].concat(iniciales));
    hoja.setFrozenRows(1);
  }
  return hoja;
}

// ---------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------

function hojaAlumnos() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_ALUMNOS);
}

function filaAAlumno(fila) {
  const alumno = {};
  COLUMNAS_ALUMNOS.forEach(function (clave, i) { alumno[clave] = fila[i] || ''; });
  return alumno;
}

function alumnoAFila(alumno) {
  return COLUMNAS_ALUMNOS.map(function (clave) { return alumno[clave] != null ? alumno[clave] : ''; });
}

/**
 * Alumnos de la hoja. Una fila con nombre pero sin id (cargada a mano en
 * el Sheet) recibe un id nuevo en ese momento: si no, la app no la vería
 * nunca. Una fila sin nombre se ignora (no se convierte en alumno).
 *
 * soloLectura (vistas previas): el id nuevo se pone solo en memoria, para
 * que la vista previa muestre lo mismo que va a pasar; no se escribe nada.
 */
function leerAlumnos(soloLectura) {
  const hoja = hojaAlumnos();
  if (hoja.getLastRow() < 2) return [];
  const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, COLUMNAS_ALUMNOS.length).getDisplayValues();
  if (asignarIdsFaltantes(filas).length && !soloLectura) {
    // Solo la columna id.
    hoja.getRange(2, 1, filas.length, 1).setValues(filas.map(function (fila) { return [fila[0]]; }));
  }
  return filas
    .filter(function (fila) { return fila[0]; })
    .map(filaAAlumno);
}

/**
 * En memoria: pone un id nuevo a cada fila de Alumnos (sin encabezado,
 * columnas en el orden de COLUMNAS_ALUMNOS) que tiene nombre y no tiene
 * id. Devuelve los índices de las filas que cambió.
 */
function asignarIdsFaltantes(filas) {
  const usados = {};
  filas.forEach(function (fila) { if (fila[0]) usados[fila[0]] = true; });
  const cambiadas = [];
  filas.forEach(function (fila, i) {
    if (!String(fila[0]).trim() && String(fila[1]).trim()) {
      fila[0] = nuevoIdDeAlumno(usados);
      cambiadas.push(i);
    }
  });
  return cambiadas;
}

function leerCatalogo(tipo) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS_CATALOGO[tipo]);
  if (!hoja || hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getDisplayValues()
    .filter(function (fila) { return fila[0]; })
    .map(function (fila) { return { nombre: fila[0], corto: fila[1] || fila[0] }; });
}

function listarAlumnos() {
  return {
    alumnos: leerAlumnos(),
    cursos: leerCatalogo('cursos'),
    colegios: leerCatalogo('colegios')
  };
}

/**
 * Nombre completo del catálogo que corresponde a un texto: acepta el
 * nombre completo o el código corto ("SA" o "Unidad Educativa San
 * Agustín"), sin importar tildes ni mayúsculas. Vacío devuelve vacío; si
 * no está en el catálogo, null.
 */
function resolverCatalogo(catalogo, texto) {
  const buscado = normalizarTexto(texto);
  if (!buscado) return '';
  for (let i = 0; i < catalogo.length; i++) {
    if (normalizarTexto(catalogo[i].nombre) === buscado || normalizarTexto(catalogo[i].corto) === buscado) {
      return catalogo[i].nombre;
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Normalización y validación
// ---------------------------------------------------------------------

/** "Bs 80", "80,50", " 80 " → "80", "80.5". Vacío queda vacío. */
function normalizarTarifa(texto) {
  const limpio = String(texto == null ? '' : texto).replace(/bs\.?/i, '').replace(/\s+/g, '').replace(',', '.');
  if (!limpio) return '';
  if (!/^\d+(\.\d+)?$/.test(limpio)) {
    throw new Error('tarifa_invalida: "' + texto + '" (usá un número, ej. 80)');
  }
  return String(Number(limpio));
}

/** "hora", "por hora", "mensual", "mes", "por mes"… → "hora" | "mensual". */
function normalizarFormaPago(texto) {
  const t = normalizarTexto(texto).replace(/^por /, '');
  if (!t || t === 'hora' || t === 'horas' || t === 'h') return 'hora';
  if (t === 'mensual' || t === 'mes' || t === 'mensualmente') return 'mensual';
  throw new Error('forma_pago_invalida: "' + texto + '" (usá hora o mensual)');
}

/** "a1, a2  a1" → "a1,a2": sin repetidos, en el orden en que llegaron. */
function normalizarIdsAlumnos(texto) {
  const vistos = {};
  return String(texto == null ? '' : texto).split(/[\s,;]+/)
    .filter(function (id) {
      if (!id || vistos[id]) return false;
      vistos[id] = true;
      return true;
    })
    .join(',');
}

function validarIdsAlumnos(texto) {
  if (!texto) return;
  const existentes = {};
  leerAlumnos().forEach(function (a) { existentes[a.id] = true; });
  texto.split(',').forEach(function (id) {
    if (!existentes[id]) {
      throw new Error('alumno_no_encontrado: ' + id);
    }
  });
}

function claveDeAlumno(nombre, apellido) {
  return normalizarTexto(nombre + ' ' + (apellido || ''));
}

function nuevoIdDeAlumno(usados) {
  let id;
  do {
    id = 'a' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase();
  } while (usados[id]);
  usados[id] = true;
  return id;
}

/**
 * Deja un alumno listo para guardar: recorta textos, pasa curso y colegio
 * al nombre completo del catálogo (acepta el código corto), normaliza
 * tarifa y forma de pago, y verifica que no haya otro alumno con el mismo
 * nombre y apellido. Tira un error con el motivo si algo está mal.
 */
function prepararAlumno(alumno, catalogos, existentes) {
  alumno.nombre = String(alumno.nombre || '').trim();
  alumno.apellido = String(alumno.apellido || '').trim();
  alumno.notas = String(alumno.notas || '');
  alumno.lugar = String(alumno.lugar || '').trim();
  if (!alumno.nombre) {
    throw new Error('falta_nombre');
  }

  const curso = resolverCatalogo(catalogos.cursos, alumno.curso);
  if (curso === null) throw new Error('curso_desconocido: "' + alumno.curso + '" (agregalo en Cursos)');
  alumno.curso = curso;
  const colegio = resolverCatalogo(catalogos.colegios, alumno.colegio);
  if (colegio === null) throw new Error('colegio_desconocido: "' + alumno.colegio + '" (agregalo en Colegios)');
  alumno.colegio = colegio;

  alumno.tarifa_hora = normalizarTarifa(alumno.tarifa_hora);
  alumno.forma_calculo = FORMA_CALCULO;
  alumno.forma_pago = normalizarFormaPago(alumno.forma_pago);

  const clave = claveDeAlumno(alumno.nombre, alumno.apellido);
  existentes.forEach(function (otro) {
    if (otro.id !== alumno.id && claveDeAlumno(otro.nombre, otro.apellido) === clave) {
      throw new Error('alumno_duplicado: ya existe "' + otro.nombre + ' ' + otro.apellido + '"');
    }
  });
  return alumno;
}

// ---------------------------------------------------------------------
// Alta, edición, archivo
// ---------------------------------------------------------------------

function catalogosActuales() {
  return { cursos: leerCatalogo('cursos'), colegios: leerCatalogo('colegios') };
}

function crearAlumno(datos) {
  const entrada = datos || {};
  const existentes = leerAlumnos();
  const usados = {};
  existentes.forEach(function (a) { usados[a.id] = true; });

  const alumno = { id: nuevoIdDeAlumno(usados), archivado: '' };
  CAMPOS_EDITABLES_ALUMNO.forEach(function (campo) { alumno[campo] = entrada[campo]; });
  prepararAlumno(alumno, catalogosActuales(), existentes);

  hojaAlumnos().appendRow(alumnoAFila(alumno));
  return alumno;
}

function buscarFilaDeAlumno(id) {
  const buscado = String(id || '').trim();
  if (!buscado) throw new Error('falta_id_alumno');
  const hoja = hojaAlumnos();
  const filas = hoja.getDataRange().getDisplayValues();
  for (let f = 1; f < filas.length; f++) {
    if (filas[f][0] === buscado) {
      return { hoja: hoja, fila: f + 1, alumno: filaAAlumno(filas[f]) };
    }
  }
  throw new Error('alumno_no_encontrado: ' + buscado);
}

function actualizarAlumno(id, cambios) {
  const ubicacion = buscarFilaDeAlumno(id);
  const alumno = ubicacion.alumno;
  CAMPOS_EDITABLES_ALUMNO.forEach(function (campo) {
    if (cambios && cambios[campo] !== undefined && cambios[campo] !== null) {
      alumno[campo] = cambios[campo];
    }
  });
  prepararAlumno(alumno, catalogosActuales(), leerAlumnos());
  ubicacion.hoja.getRange(ubicacion.fila, 1, 1, COLUMNAS_ALUMNOS.length).setValues([alumnoAFila(alumno)]);
  return alumno;
}

/** Archivar, nunca borrar: los bloques viejos siguen mostrando su nombre. */
function archivarAlumno(id) {
  const ubicacion = buscarFilaDeAlumno(id);
  ubicacion.alumno.archivado = 'TRUE';
  ubicacion.hoja.getRange(ubicacion.fila, 1, 1, COLUMNAS_ALUMNOS.length).setValues([alumnoAFila(ubicacion.alumno)]);
  return ubicacion.alumno;
}

/**
 * Crea o edita una entrada de un catálogo (tipo "cursos" o "colegios").
 * Con "anterior" (el nombre completo actual) la edita; si cambió el nombre
 * completo, también lo cambia en todos los alumnos que lo tenían, porque
 * el alumno guarda el nombre completo.
 */
function guardarCatalogo(tipo, anterior, item) {
  const nombreHoja = HOJAS_CATALOGO[tipo];
  if (!nombreHoja) throw new Error('catalogo_desconocido: "' + tipo + '" (usá cursos o colegios)');
  const nombre = String((item && item.nombre) || '').trim();
  const corto = String((item && item.corto) || '').trim();
  if (!nombre || !corto) throw new Error('catalogo_incompleto: hacen falta nombre completo y código corto');

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombreHoja);
  const filas = hoja.getDataRange().getDisplayValues();
  let filaEditada = -1;
  for (let f = 1; f < filas.length; f++) {
    if (anterior && filas[f][0] === anterior) {
      filaEditada = f;
      continue;
    }
    if (filas[f][0] && (normalizarTexto(filas[f][0]) === normalizarTexto(nombre) ||
        normalizarTexto(filas[f][1]) === normalizarTexto(corto))) {
      throw new Error('catalogo_duplicado: ya existe "' + filas[f][0] + '" (' + filas[f][1] + ')');
    }
  }

  if (anterior && filaEditada === -1) throw new Error('catalogo_no_encontrado: "' + anterior + '"');
  if (filaEditada === -1) {
    hoja.appendRow([nombre, corto]);
  } else {
    hoja.getRange(filaEditada + 1, 1, 1, 2).setValues([[nombre, corto]]);
    if (nombre !== anterior) {
      renombrarEnAlumnos(tipo === 'cursos' ? 'curso' : 'colegio', anterior, nombre);
    }
  }
  return leerCatalogo(tipo);
}

function renombrarEnAlumnos(campo, anterior, nuevo) {
  const hoja = hojaAlumnos();
  if (hoja.getLastRow() < 2) return;
  const columna = COLUMNAS_ALUMNOS.indexOf(campo) + 1;
  const rango = hoja.getRange(2, columna, hoja.getLastRow() - 1, 1);
  const valores = rango.getDisplayValues();
  let cambio = false;
  valores.forEach(function (fila) {
    if (fila[0] === anterior) {
      fila[0] = nuevo;
      cambio = true;
    }
  });
  if (cambio) rango.setValues(valores);
}

// ---------------------------------------------------------------------
// Migración: bloques y reglas de Fractal con el nombre en el título
// ---------------------------------------------------------------------

/**
 * "Clase con Valentina" → { nombres: [{nombre: 'Valentina', apellido: ''}], resto: '' }
 * "Camila y Lucía Aliendre - Física" → Camila Aliendre, Lucía Aliendre; resto "Física"
 *
 * - Se quita un prefijo tipo "Clase con", "Clases de", "Tutoría a".
 * - Lo que va después de " - " (o " – ", " : ") es el tema y queda como
 *   título; lo de antes son los nombres.
 * - Los nombres se separan por coma, "y", "/", "+" o "&".
 * - Si un nombre suelto va seguido de otro con apellido ("Camila y Lucía
 *   Aliendre"), se asume que son hermanas y comparten el apellido.
 */
function extraerNombresDeTitulo(titulo) {
  let texto = String(titulo || '').trim();
  let resto = '';
  const tema = texto.split(/\s+[-–—:]\s+/);
  if (tema.length > 1) {
    texto = tema[0];
    resto = tema.slice(1).join(' - ');
  }
  texto = texto.replace(/^(clases?|tutor[ií]as?|refuerzos?)(\s+(con|de|a|para))?\s*/i, '');
  const partes = texto.split(/\s*(?:,|\/|\+|&|\s+y\s+|\s+e\s+)\s*/i)
    .map(function (p) { return p.trim(); })
    .filter(Boolean);

  const nombres = partes.map(function (parte) {
    const palabras = parte.split(/\s+/);
    return { nombre: palabras[0], apellido: palabras.slice(1).join(' ') };
  });
  const ultimo = nombres[nombres.length - 1];
  if (ultimo && ultimo.apellido) {
    nombres.forEach(function (n) {
      if (!n.apellido) n.apellido = ultimo.apellido;
    });
  }
  return { nombres: nombres, resto: resto };
}

/**
 * Busca, para un nombre sacado de un título, el alumno que ya existe:
 * primero por nombre y apellido exactos (sin tildes/mayúsculas); si el
 * título solo tenía el nombre, por nombre, siempre que haya uno solo.
 */
function buscarAlumnoPorNombre(lista, nombre, apellido) {
  const clave = claveDeAlumno(nombre, apellido);
  const exacto = lista.filter(function (a) { return claveDeAlumno(a.nombre, a.apellido) === clave; });
  if (exacto.length) return exacto[0];
  if (!apellido) {
    const porNombre = lista.filter(function (a) { return normalizarTexto(a.nombre) === normalizarTexto(nombre); });
    if (porNombre.length === 1) return porNombre[0];
  }
  return null;
}

/**
 * Alumnos que corresponden a un nombre sacado de un título: por nombre y
 * apellido exactos (sin tildes/mayúsculas); si el título solo trae el
 * nombre, todos los que se llaman así (más de uno = ambiguo).
 */
function candidatosPorNombre(alumnos, nombre, apellido) {
  if (apellido) {
    const clave = claveDeAlumno(nombre, apellido);
    return alumnos.filter(function (a) { return claveDeAlumno(a.nombre, a.apellido) === clave; });
  }
  return alumnos.filter(function (a) { return normalizarTexto(a.nombre) === normalizarTexto(nombre); });
}

/**
 * Encuentra los bloques y reglas de Academia Fractal que todavía tienen el
 * nombre del alumno en el título (alumno_id vacío) y propone: qué alumnos
 * crear, a quién vincular cada fila y cómo queda el título.
 *
 * Con aplicar=false no escribe nada (vista previa). Con aplicar=true crea
 * los alumnos que falten y vincula las filas; "ids" (opcional) limita a las
 * filas elegidas en la vista previa.
 */
function migrarAlumnosFractal(aplicar, ids) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hojaB = libro.getSheetByName(HOJA_BLOQUES);
  const hojaH = libro.getSheetByName(HOJA_HORARIO);
  const datosB = hojaB.getDataRange().getDisplayValues();
  const datosH = hojaH.getDataRange().getDisplayValues();
  const existentes = leerAlumnos(!aplicar);
  const elegidos = Array.isArray(ids) ? ids.reduce(function (m, id) { m[id] = true; return m; }, {}) : null;

  const nuevos = []; // alumnos a crear, sin repetir
  const filas = [];
  const sinResolver = [];

  // El alumno para un nombre del título; null si no existe (se crea) o
  // { ambiguo: [...] } si solo trae el nombre y hay varios que se llaman
  // así: en ese caso NO se crea otro, la fila queda sin resolver.
  function alumnoPara(n) {
    const todos = existentes.concat(nuevos);
    const clave = claveDeAlumno(n.nombre, n.apellido);
    const exacto = todos.filter(function (a) { return claveDeAlumno(a.nombre, a.apellido) === clave; });
    if (exacto.length) return exacto[0];
    if (n.apellido) return null;
    const porNombre = candidatosPorNombre(todos, n.nombre, '');
    if (porNombre.length === 1) return porNombre[0];
    return porNombre.length ? { ambiguo: porNombre } : null;
  }

  function revisar(hoja, datos, columnas, etiquetaHoja) {
    const cTitulo = columnas.indexOf('titulo');
    const cArea = columnas.indexOf('area');
    const cAlumnos = columnas.indexOf('alumno_id');
    for (let f = 1; f < datos.length; f++) {
      const fila = datos[f];
      if (!fila[0] || fila[cArea] !== AREA_FRACTAL || fila[cAlumnos] || !fila[cTitulo]) continue;
      const extraido = extraerNombresDeTitulo(fila[cTitulo]);
      if (extraido.nombres.length === 0) {
        sinResolver.push({ hoja: etiquetaHoja, id: fila[0], titulo: fila[cTitulo], motivo: 'no se reconoce ningún nombre' });
        continue;
      }
      const encontrados = extraido.nombres.map(alumnoPara);
      const ambiguos = encontrados.filter(function (a) { return a && a.ambiguo; });
      if (ambiguos.length) {
        sinResolver.push({
          hoja: etiquetaHoja, id: fila[0], titulo: fila[cTitulo],
          motivo: 'hay varios alumnos con ese nombre (' + ambiguos.map(function (a) {
            return a.ambiguo.map(nombreCompleto).join(' / ');
          }).join('; ') + ')'
        });
        continue;
      }
      const vinculados = extraido.nombres.map(function (n, i) {
        let alumno = encontrados[i] || alumnoPara(n);
        let esNuevo = false;
        if (!alumno) {
          alumno = { id: '', nombre: n.nombre, apellido: n.apellido };
          nuevos.push(alumno);
          esNuevo = true;
        } else if (nuevos.indexOf(alumno) !== -1) {
          esNuevo = true;
        }
        return { alumno: alumno, nuevo: esNuevo };
      });
      filas.push({
        hoja: etiquetaHoja, id: fila[0], fila: f,
        fecha: columnas === COLUMNAS_BLOQUES ? fila[columnas.indexOf('fecha')] : '',
        tituloAntes: fila[cTitulo], tituloDespues: extraido.resto,
        vinculados: vinculados
      });
    }
  }
  revisar(hojaH, datosH, COLUMNAS_HORARIO, 'Horario');
  revisar(hojaB, datosB, COLUMNAS_BLOQUES, 'Bloques');

  const incluidas = filas.filter(function (f) { return !elegidos || elegidos[f.id]; });

  if (aplicar && incluidas.length) {
    // Solo se crean los alumnos que usa alguna fila elegida.
    const usados = {};
    existentes.forEach(function (a) { usados[a.id] = true; });
    const aCrear = [];
    incluidas.forEach(function (f) {
      f.vinculados.forEach(function (v) {
        if (v.nuevo && !v.alumno.id) {
          v.alumno.id = nuevoIdDeAlumno(usados);
          aCrear.push({
            id: v.alumno.id, nombre: v.alumno.nombre, apellido: v.alumno.apellido, curso: '', colegio: '',
            tarifa_hora: '', forma_calculo: FORMA_CALCULO, forma_pago: 'hora', notas: '', archivado: '', lugar: ''
          });
        }
      });
    });
    if (aCrear.length) {
      const hojaA = hojaAlumnos();
      hojaA.getRange(hojaA.getLastRow() + 1, 1, aCrear.length, COLUMNAS_ALUMNOS.length)
        .setValues(aCrear.map(alumnoAFila));
    }

    [[hojaH, datosH, COLUMNAS_HORARIO, 'Horario'], [hojaB, datosB, COLUMNAS_BLOQUES, 'Bloques']].forEach(function (t) {
      const propias = incluidas.filter(function (f) { return f.hoja === t[3]; });
      if (!propias.length) return;
      const columnas = t[2];
      const datos = t[1];
      propias.forEach(function (f) {
        datos[f.fila][columnas.indexOf('titulo')] = f.tituloDespues;
        datos[f.fila][columnas.indexOf('alumno_id')] = f.vinculados.map(function (v) { return v.alumno.id; }).join(',');
      });
      // Una sola escritura por hoja, con el ancho exacto de las columnas.
      const grilla = datos.map(function (fila) {
        return columnas.map(function (_, i) { return fila[i] != null ? fila[i] : ''; });
      });
      t[0].getRange(1, 1, grilla.length, columnas.length).setValues(grilla);
    });
  }

  function nombreCompleto(a) {
    return (a.nombre + ' ' + (a.apellido || '')).trim();
  }

  return {
    aplicado: Boolean(aplicar),
    alumnosNuevos: nuevos
      .filter(function (a) { return incluidas.some(function (f) { return f.vinculados.some(function (v) { return v.alumno === a; }); }); })
      .map(nombreCompleto),
    filas: filas.map(function (f) {
      return {
        hoja: f.hoja, id: f.id, fecha: f.fecha,
        tituloAntes: f.tituloAntes, tituloDespues: f.tituloDespues,
        alumnos: f.vinculados.map(function (v) { return { nombre: nombreCompleto(v.alumno), nuevo: v.nuevo }; }),
        incluida: !elegidos || Boolean(elegidos[f.id])
      };
    }),
    sinResolver: sinResolver
  };
}
