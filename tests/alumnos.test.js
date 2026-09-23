'use strict';

/**
 * Checkpoint 7 — alumnos de Academia Fractal: hoja y catálogos, alta/
 * edición/archivo, vínculo con bloques y reglas, y la migración de los
 * bloques que tenían el nombre del alumno en el título.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

function preparar() {
  const env = crearEntorno({ ahora: '2026-09-23T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  return env;
}

function post(env, cuerpo) {
  return env.post(Object.assign({ token: 'tk' }, cuerpo));
}

function ok(env, cuerpo) {
  const r = post(env, cuerpo);
  assert.ok(r.ok, r.error);
  return r.data;
}

function alumno(extra) {
  return Object.assign({
    nombre: 'Agustín', apellido: 'Aliendre', curso: '4to de secundaria',
    colegio: 'Unidad Educativa San Agustín', tarifa_hora: '80', forma_pago: 'mensual', notas: ''
  }, extra || {});
}

function filas(env, hoja) {
  return env.libro.getSheetByName(hoja).leerTodo();
}

// ---------------------------------------------------------------
// Estructura
// ---------------------------------------------------------------

test('se crean Alumnos, Cursos y Colegios con sus encabezados y catálogos iniciales', () => {
  const env = preparar();
  assert.deepStrictEqual(filas(env, 'Alumnos')[0], [
    'id', 'nombre', 'apellido', 'curso', 'colegio', 'tarifa_hora',
    'forma_calculo', 'forma_pago', 'notas', 'archivado', 'lugar'
  ]);
  const colegios = filas(env, 'Colegios');
  assert.deepStrictEqual(colegios[0], ['nombre', 'corto']);
  assert.deepStrictEqual(colegios.slice(1), [
    ['Unidad Educativa San Agustín', 'SA'],
    ['Colegio Poveda', 'Poveda'],
    ['Universidad Católica Boliviana', 'UCB']
  ]);
  const cursos = filas(env, 'Cursos').slice(1);
  assert.ok(cursos.some((c) => c[0] === '2do de secundaria' && c[1] === '2do'));
  assert.ok(cursos.some((c) => c[0] === '1er año universidad' && c[1] === '1er univ'));
});

test('a una hoja Horario vieja se le agrega alumno_id al final, sin mover nada', () => {
  const env = crearEntorno({});
  const horario = env.libro.insertSheet('Horario');
  horario.sembrar([
    ['id', 'título', 'área', 'días', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'archivado'],
    ['h12345678', 'Cálculo', 'Universidad', 'Lun', '09:00', '10:00', '2026-09-01', '2026-12-01', '', 'nota', '']
  ]);
  env.llamar('asegurarEstructura()');
  const todo = horario.leerTodo();
  assert.strictEqual(todo[0][11], 'alumno_id');
  assert.deepStrictEqual(todo[1].slice(0, 11),
    ['h12345678', 'Cálculo', 'Universidad', 'Lun', '09:00', '10:00', '2026-09-01', '2026-12-01', '', 'nota', '']);
});

// ---------------------------------------------------------------
// Alta, edición, archivo
// ---------------------------------------------------------------

test('crear un alumno: id propio, forma de cálculo siempre por hora', () => {
  const env = preparar();
  const creado = ok(env, { action: 'crearAlumno', alumno: alumno() });
  assert.match(creado.id, /^a[0-9a-f]{8}$/);
  assert.strictEqual(creado.forma_calculo, 'hora');
  assert.strictEqual(creado.forma_pago, 'mensual');
  assert.strictEqual(filas(env, 'Alumnos').length, 2);
});

test('curso y colegio aceptan el código corto pero se guarda el nombre completo', () => {
  const env = preparar();
  const creado = ok(env, { action: 'crearAlumno', alumno: alumno({ curso: '4TO', colegio: 'sa' }) });
  assert.strictEqual(creado.curso, '4to de secundaria');
  assert.strictEqual(creado.colegio, 'Unidad Educativa San Agustín');
});

test('validaciones: nombre, catálogo, tarifa, forma de pago y duplicados', () => {
  const env = preparar();
  ok(env, { action: 'crearAlumno', alumno: alumno() });

  const casos = [
    [alumno({ nombre: ' ', apellido: 'X' }), /falta_nombre/],
    [alumno({ apellido: 'Otro', colegio: 'Colegio Inventado' }), /colegio_desconocido/],
    [alumno({ apellido: 'Otro', tarifa_hora: 'ochenta' }), /tarifa_invalida/],
    [alumno({ apellido: 'Otro', forma_pago: 'anual' }), /forma_pago_invalida/],
    [alumno({ nombre: 'AGUSTIN', apellido: 'aliendre' }), /alumno_duplicado/]
  ];
  casos.forEach(([datos, error]) => {
    const r = post(env, { action: 'crearAlumno', alumno: datos });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, error);
  });
  assert.strictEqual(filas(env, 'Alumnos').length, 2, 'ningún error escribió en la hoja');
});

test('la tarifa acepta "Bs 80,50" y la guarda como 80.5', () => {
  const env = preparar();
  const creado = ok(env, { action: 'crearAlumno', alumno: alumno({ tarifa_hora: 'Bs 80,50' }) });
  assert.strictEqual(creado.tarifa_hora, '80.5');
});

test('editar solo cambia lo que viene; archivar marca TRUE y no borra', () => {
  const env = preparar();
  const creado = ok(env, { action: 'crearAlumno', alumno: alumno() });
  const editado = ok(env, { action: 'actualizarAlumno', id: creado.id, cambios: { tarifa_hora: '90' } });
  assert.strictEqual(editado.tarifa_hora, '90');
  assert.strictEqual(editado.nombre, 'Agustín');

  ok(env, { action: 'archivarAlumno', id: creado.id });
  const lista = ok(env, { action: 'listarAlumnos' });
  assert.strictEqual(lista.alumnos.length, 1);
  assert.strictEqual(lista.alumnos[0].archivado, 'TRUE');
});

test('listarAlumnos trae alumnos y los dos catálogos en una sola llamada', () => {
  const env = preparar();
  ok(env, { action: 'crearAlumno', alumno: alumno() });
  const lista = ok(env, { action: 'listarAlumnos' });
  assert.strictEqual(lista.alumnos.length, 1);
  assert.ok(lista.cursos.length > 5);
  assert.deepStrictEqual(lista.colegios[0], { nombre: 'Unidad Educativa San Agustín', corto: 'SA' });
});

test('catálogo: agregar, no duplicar y renombrar actualiza a los alumnos', () => {
  const env = preparar();
  const creado = ok(env, { action: 'crearAlumno', alumno: alumno({ colegio: 'Poveda' }) });

  ok(env, { action: 'guardarCatalogo', tipo: 'colegios', item: { nombre: 'Colegio Alemán', corto: 'Alemán' } });
  const repetido = post(env, { action: 'guardarCatalogo', tipo: 'colegios', item: { nombre: 'Otro', corto: 'sa' } });
  assert.match(repetido.error, /catalogo_duplicado/);

  ok(env, {
    action: 'guardarCatalogo', tipo: 'colegios', anterior: 'Colegio Poveda',
    item: { nombre: 'Colegio Pedro Poveda', corto: 'Poveda' }
  });
  const lista = ok(env, { action: 'listarAlumnos' });
  assert.strictEqual(lista.alumnos.find((a) => a.id === creado.id).colegio, 'Colegio Pedro Poveda');
  assert.ok(lista.colegios.some((c) => c.nombre === 'Colegio Alemán'));
});

// ---------------------------------------------------------------
// Vínculo con bloques y reglas
// ---------------------------------------------------------------

function bloqueFractal(extra) {
  return Object.assign({
    titulo: '', area: 'Academia Fractal', tipo: 'variable', fecha: '2026-09-24',
    inicio: '15:00', fin: '16:00', etiqueta: '', notas: ''
  }, extra || {});
}

test('un bloque con alumnos no necesita título; sin título ni alumnos, falla', () => {
  const env = preparar();
  const a = ok(env, { action: 'crearAlumno', alumno: alumno() });
  const b = ok(env, { action: 'crearAlumno', alumno: alumno({ nombre: 'Camila' }) });

  const bloque = ok(env, { action: 'crearBloque', bloque: bloqueFractal({ alumno_id: a.id + ', ' + b.id + ',' + a.id }) });
  assert.strictEqual(bloque.titulo, '');
  assert.strictEqual(bloque.alumno_id, a.id + ',' + b.id, 'sin repetidos ni espacios');

  const sinNada = post(env, { action: 'crearBloque', bloque: bloqueFractal() });
  assert.match(sinNada.error, /falta_titulo/);
});

test('un alumno que no existe no se puede vincular', () => {
  const env = preparar();
  const r = post(env, { action: 'crearBloque', bloque: bloqueFractal({ alumno_id: 'a00000000' }) });
  assert.match(r.error, /alumno_no_encontrado/);
});

test('el generador copia los alumnos de la regla a cada bloque, y los refresca', () => {
  const env = preparar();
  const a = ok(env, { action: 'crearAlumno', alumno: alumno() });
  const b = ok(env, { action: 'crearAlumno', alumno: alumno({ nombre: 'Camila' }) });
  const regla = ok(env, {
    action: 'crearRegla',
    regla: {
      titulo: '', area: 'Academia Fractal', dias: 'Jue', inicio: '15:00', fin: '16:00',
      desde: '2026-09-24', hasta: '2026-10-01', etiqueta: '', notas: '', alumno_id: a.id
    }
  });
  ok(env, { action: 'generarHorario' });
  let semana = ok(env, { action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-10-04' });
  assert.deepStrictEqual(semana.map((x) => x.alumno_id), [a.id, a.id]);

  ok(env, { action: 'actualizarRegla', id: regla.id, cambios: { alumno_id: a.id + ',' + b.id } });
  ok(env, { action: 'generarHorario' });
  semana = ok(env, { action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-10-04' });
  assert.deepStrictEqual(semana.map((x) => x.alumno_id), [a.id + ',' + b.id, a.id + ',' + b.id]);
});

// ---------------------------------------------------------------
// Migración: el nombre en el título pasa a ser un vínculo
// ---------------------------------------------------------------

function extraer(env, titulo) {
  return env.llamar('extraerNombresDeTitulo(__arg)', titulo);
}

test('extraer nombres de un título: prefijos, varios nombres, apellido compartido y tema', () => {
  const env = preparar();
  assert.deepStrictEqual(extraer(env, 'Clase con Valentina'), {
    nombres: [{ nombre: 'Valentina', apellido: '' }], resto: ''
  });
  assert.deepStrictEqual(extraer(env, 'Agustín Aliendre'), {
    nombres: [{ nombre: 'Agustín', apellido: 'Aliendre' }], resto: ''
  });
  assert.deepStrictEqual(extraer(env, 'Camila y Lucía Aliendre - Física'), {
    nombres: [{ nombre: 'Camila', apellido: 'Aliendre' }, { nombre: 'Lucía', apellido: 'Aliendre' }],
    resto: 'Física'
  });
  assert.deepStrictEqual(extraer(env, 'Clases de Tomás, Ana Pérez'), {
    nombres: [{ nombre: 'Tomás', apellido: 'Pérez' }, { nombre: 'Ana', apellido: 'Pérez' }], resto: ''
  });
});

function sembrarFractal(env) {
  const bloques = env.libro.getSheetByName('Bloques');
  const fila = (id, titulo, area, fecha) => [id, titulo, area, 'fijo', fecha, '15:00', '16:00', '', 'nota ' + id, 'c', 'a', '', ''];
  bloques.sembrar([
    ['id', 'título', 'área', 'tipo', 'fecha', 'inicio', 'fin', 'etiqueta', 'notas', 'creado', 'actualizado', 'archivado', 'alumno_id'],
    fila('b1', 'Clase con Valentina', 'Academia Fractal', '2026-09-10'),
    fila('b2', 'Clase con Valentina', 'Academia Fractal', '2026-09-17'),
    fila('b3', 'Camila y Lucía Aliendre - Física', 'Academia Fractal', '2026-09-18'),
    fila('b4', 'Cálculo II', 'Universidad', '2026-09-18'),
    fila('b5', 'Agustín Aliendre', 'Academia Fractal', '2026-09-19')
  ]);
  env.libro.getSheetByName('Horario').sembrar([
    ['id', 'título', 'área', 'días', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'archivado', 'alumno_id'],
    ['h11111111', 'Clase con Valentina', 'Academia Fractal', 'Jue', '15:00', '16:00', '2026-09-01', '2026-12-01', '', '', '', '']
  ]);
}

test('migración: la vista previa propone sin escribir nada', () => {
  const env = preparar();
  ok(env, { action: 'crearAlumno', alumno: alumno() }); // Agustín Aliendre ya existe
  sembrarFractal(env);
  const antes = JSON.stringify(filas(env, 'Bloques'));

  const plan = ok(env, { action: 'migrarAlumnosFractal' });
  assert.strictEqual(plan.aplicado, false);
  assert.deepStrictEqual(plan.alumnosNuevos.sort(), ['Camila Aliendre', 'Lucía Aliendre', 'Valentina']);
  assert.deepStrictEqual(plan.filas.map((f) => f.id), ['h11111111', 'b1', 'b2', 'b3', 'b5'], 'no incluye Universidad');
  const b5 = plan.filas.find((f) => f.id === 'b5');
  assert.deepStrictEqual(b5.alumnos, [{ nombre: 'Agustín Aliendre', nuevo: false }], 'reusa el alumno que ya existía');
  assert.strictEqual(JSON.stringify(filas(env, 'Bloques')), antes);
  assert.strictEqual(filas(env, 'Alumnos').length, 2);
});

test('migración: aplicar crea cada alumno una sola vez y vincula sin perder datos', () => {
  const env = preparar();
  sembrarFractal(env);
  ok(env, { action: 'migrarAlumnosFractal', aplicar: true });

  const alumnos = ok(env, { action: 'listarAlumnos' }).alumnos;
  assert.deepStrictEqual(alumnos.map((a) => (a.nombre + ' ' + a.apellido).trim()).sort(),
    ['Agustín Aliendre', 'Camila Aliendre', 'Lucía Aliendre', 'Valentina']);
  const id = (nombre) => alumnos.find((a) => a.nombre === nombre).id;

  const b = filas(env, 'Bloques');
  const porId = Object.fromEntries(b.slice(1).map((f) => [f[0], f]));
  assert.strictEqual(porId.b1[12], id('Valentina'));
  assert.strictEqual(porId.b2[12], id('Valentina'), 'la misma alumna en todas sus clases');
  assert.strictEqual(porId.b1[1], '', 'el nombre deja de vivir en el título');
  assert.strictEqual(porId.b3[12], id('Camila') + ',' + id('Lucía'));
  assert.strictEqual(porId.b3[1], 'Física', 'el tema queda como título');
  assert.strictEqual(porId.b3[8], 'nota b3', 'las notas no se tocan');
  assert.deepStrictEqual(porId.b4.slice(1, 13), ['Cálculo II', 'Universidad', 'fijo', '2026-09-18', '15:00', '16:00', '', 'nota b4', 'c', 'a', '', ''],
    'otras áreas no se tocan');
  assert.strictEqual(filas(env, 'Horario')[1][11], id('Valentina'), 'también la regla del horario');

  const otraVez = ok(env, { action: 'migrarAlumnosFractal' });
  assert.strictEqual(otraVez.filas.length, 0, 'correrla de nuevo no hace nada');
});

test('migración: se puede aplicar solo a las filas elegidas', () => {
  const env = preparar();
  sembrarFractal(env);
  ok(env, { action: 'migrarAlumnosFractal', aplicar: true, ids: ['b5'] });
  const alumnos = ok(env, { action: 'listarAlumnos' }).alumnos;
  assert.deepStrictEqual(alumnos.map((a) => a.nombre), ['Agustín'], 'solo crea lo que usa la fila elegida');
  const b = filas(env, 'Bloques');
  assert.strictEqual(b.find((f) => f[0] === 'b1')[1], 'Clase con Valentina', 'las no elegidas quedan igual');
});

test('las acciones de alumnos exigen token', () => {
  const env = preparar();
  ['listarAlumnos', 'crearAlumno', 'actualizarAlumno', 'archivarAlumno', 'guardarCatalogo', 'importar', 'migrarAlumnosFractal']
    .forEach((action) => {
      assert.deepStrictEqual(env.post({ token: 'otro', action }), { ok: false, error: 'no_autorizado' });
    });
});
