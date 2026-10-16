'use strict';

/**
 * Backend nuevo (Checkpoint 13): alumnos de Academia Fractal y sus
 * catálogos, alta/edición/archivo y vínculo con bloques y reglas. Mismas
 * pruebas que tests/alumnos.test.js (sin la migración de títulos, que ya
 * no hace falta: no quedaba ninguna clase sin vincular).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./entorno-backend');

async function ok(env, cuerpo) {
  const r = await env.post(cuerpo);
  assert.ok(r.ok, r.error);
  return r.data;
}

function alumno(extra) {
  return Object.assign({
    nombre: 'Agustín', apellido: 'Aliendre', curso: '4to de secundaria',
    colegio: 'Unidad Educativa San Agustín', tarifa_hora: '80', forma_pago: 'mensual', notas: ''
  }, extra || {});
}

// ---------------------------------------------------------------
// Alta, edición, archivo
// ---------------------------------------------------------------

test('crear un alumno: id propio, forma de cálculo siempre por hora', async () => {
  const env = crearEntorno();
  const creado = await ok(env, { action: 'crearAlumno', alumno: alumno() });
  assert.match(creado.id, /^a[0-9a-f]{8}$/);
  assert.strictEqual(creado.forma_calculo, 'hora');
  assert.strictEqual(creado.forma_pago, 'mensual');
  const [guardado] = env.tabla('alumnos');
  assert.deepStrictEqual([guardado.nombre, guardado.apellido, guardado.tarifa_hora, guardado.archivado], ['Agustín', 'Aliendre', '80', '']);
  assert.strictEqual(env.base.filas('alumnos')[0].tarifa_hora, 80, 'en la base la tarifa es un número');
});

test('curso y colegio aceptan el código corto pero se guarda el nombre completo', async () => {
  const env = crearEntorno();
  const creado = await ok(env, { action: 'crearAlumno', alumno: alumno({ curso: '4TO', colegio: 'sa' }) });
  assert.strictEqual(creado.curso, '4to de secundaria');
  assert.strictEqual(creado.colegio, 'Unidad Educativa San Agustín');
  assert.strictEqual(env.tabla('alumnos')[0].colegio, 'Unidad Educativa San Agustín');
});

test('validaciones: nombre, catálogo, tarifa, forma de pago y duplicados', async () => {
  const env = crearEntorno();
  await ok(env, { action: 'crearAlumno', alumno: alumno() });

  const casos = [
    [alumno({ nombre: ' ', apellido: 'X' }), /falta_nombre/],
    [alumno({ apellido: 'Otro', colegio: 'Colegio Inventado' }), /colegio_desconocido/],
    [alumno({ apellido: 'Otro', tarifa_hora: 'ochenta' }), /tarifa_invalida/],
    [alumno({ apellido: 'Otro', forma_pago: 'anual' }), /forma_pago_invalida/],
    [alumno({ nombre: 'AGUSTIN', apellido: 'aliendre' }), /alumno_duplicado/]
  ];
  for (const [datos, error] of casos) {
    const r = await env.post({ action: 'crearAlumno', alumno: datos });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, error);
  }
  assert.strictEqual(env.tabla('alumnos').length, 1, 'ningún error escribió');
});

test('la tarifa acepta "Bs 80,50" y la guarda como 80.5; sin tarifa queda vacía', async () => {
  const env = crearEntorno();
  assert.strictEqual((await ok(env, { action: 'crearAlumno', alumno: alumno({ tarifa_hora: 'Bs 80,50' }) })).tarifa_hora, '80.5');
  assert.strictEqual(env.tabla('alumnos')[0].tarifa_hora, '80.5');
  await ok(env, { action: 'crearAlumno', alumno: alumno({ nombre: 'Katy', apellido: '', tarifa_hora: '' }) });
  assert.strictEqual(env.tabla('alumnos')[1].tarifa_hora, '');
});

test('editar solo cambia lo que viene; archivar marca TRUE y no borra', async () => {
  const env = crearEntorno();
  const creado = await ok(env, { action: 'crearAlumno', alumno: alumno() });
  const editado = await ok(env, { action: 'actualizarAlumno', id: creado.id, cambios: { tarifa_hora: '90' } });
  assert.strictEqual(editado.tarifa_hora, '90');
  assert.strictEqual(editado.nombre, 'Agustín');
  assert.strictEqual(env.tabla('alumnos')[0].tarifa_hora, '90');

  await ok(env, { action: 'archivarAlumno', id: creado.id });
  const lista = await ok(env, { action: 'listarAlumnos' });
  assert.strictEqual(lista.alumnos.length, 1);
  assert.strictEqual(lista.alumnos[0].archivado, 'TRUE');
});

test('editar un alumno no borra los datos nuevos de su ficha (tutor, teléfono)', async () => {
  const env = crearEntorno();
  env.sembrar('alumnos', [Object.assign(alumno(), { id: 'a0000aaaa', forma_calculo: 'hora', tutor_nombre: 'Rosa', tutor_telefono: '70000000' })]);
  await ok(env, { action: 'actualizarAlumno', id: 'a0000aaaa', cambios: { notas: 'nueva nota' } });
  const guardado = env.fila('alumnos', 'a0000aaaa');
  assert.deepStrictEqual([guardado.notas, guardado.tutor_nombre, guardado.tutor_telefono], ['nueva nota', 'Rosa', '70000000']);
});

test('editar o archivar un alumno que no existe falla claro', async () => {
  const env = crearEntorno();
  assert.match((await env.post({ action: 'actualizarAlumno', id: 'a12345678', cambios: {} })).error, /alumno_no_encontrado/);
  assert.match((await env.post({ action: 'archivarAlumno', id: '' })).error, /falta_id_alumno/);
});

test('listarAlumnos trae alumnos y los dos catálogos, en el orden de siempre', async () => {
  const env = crearEntorno();
  await ok(env, { action: 'crearAlumno', alumno: alumno() });
  const lista = await ok(env, { action: 'listarAlumnos' });
  assert.strictEqual(lista.alumnos.length, 1);
  assert.deepStrictEqual(lista.cursos.slice(0, 2).map((c) => c.nombre), ['1ro de secundaria', '2do de secundaria']);
  assert.deepStrictEqual(lista.colegios[0], { nombre: 'Unidad Educativa San Agustín', corto: 'SA' });
});

test('catálogo: agregar, no duplicar y renombrar actualiza a los alumnos', async () => {
  const env = crearEntorno();
  const creado = await ok(env, { action: 'crearAlumno', alumno: alumno({ colegio: 'Poveda' }) });

  await ok(env, { action: 'guardarCatalogo', tipo: 'colegios', item: { nombre: 'Colegio Alemán', corto: 'Alemán' } });
  const repetido = await env.post({ action: 'guardarCatalogo', tipo: 'colegios', item: { nombre: 'Otro', corto: 'sa' } });
  assert.match(repetido.error, /catalogo_duplicado/);

  const catalogo = await ok(env, {
    action: 'guardarCatalogo', tipo: 'colegios', anterior: 'Colegio Poveda',
    item: { nombre: 'Colegio Pedro Poveda', corto: 'Poveda' }
  });
  assert.deepStrictEqual(catalogo.map((c) => c.nombre),
    ['Unidad Educativa San Agustín', 'Colegio Pedro Poveda', 'Universidad Católica Boliviana', 'Colegio Alemán'],
    'el renombrado conserva su lugar');
  const lista = await ok(env, { action: 'listarAlumnos' });
  assert.strictEqual(lista.alumnos.find((a) => a.id === creado.id).colegio, 'Colegio Pedro Poveda');
});

test('catálogo: errores claros (tipo, incompleto, el que se edita no existe)', async () => {
  const env = crearEntorno();
  assert.match((await env.post({ action: 'guardarCatalogo', tipo: 'materias', item: { nombre: 'x', corto: 'x' } })).error, /catalogo_desconocido/);
  assert.match((await env.post({ action: 'guardarCatalogo', tipo: 'cursos', item: { nombre: 'x' } })).error, /catalogo_incompleto/);
  assert.match((await env.post({ action: 'guardarCatalogo', tipo: 'cursos', anterior: 'No está', item: { nombre: 'x', corto: 'y' } })).error, /catalogo_no_encontrado/);
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

test('un bloque con alumnos no necesita título; sin título ni alumnos, falla', async () => {
  const env = crearEntorno();
  const a = await ok(env, { action: 'crearAlumno', alumno: alumno() });
  const b = await ok(env, { action: 'crearAlumno', alumno: alumno({ nombre: 'Camila' }) });

  const creado = await ok(env, { action: 'crearBloque', bloque: bloqueFractal({ alumno_id: a.id + ', ' + b.id + ',' + a.id }) });
  assert.strictEqual(creado.titulo, '');
  assert.strictEqual(creado.alumno_id, a.id + ',' + b.id, 'sin repetidos ni espacios');
  assert.deepStrictEqual(env.base.filas('bloques')[0].alumno_ids, [a.id, b.id], 'en la base es una lista');

  assert.match((await env.post({ action: 'crearBloque', bloque: bloqueFractal() })).error, /falta_titulo/);
});

test('un alumno que no existe no se puede vincular; uno archivado sí', async () => {
  const env = crearEntorno();
  assert.match((await env.post({ action: 'crearBloque', bloque: bloqueFractal({ alumno_id: 'a00000000' }) })).error, /alumno_no_encontrado: a00000000/);
  const a = await ok(env, { action: 'crearAlumno', alumno: alumno() });
  await ok(env, { action: 'archivarAlumno', id: a.id });
  assert.strictEqual((await env.post({ action: 'crearBloque', bloque: bloqueFractal({ alumno_id: a.id }) })).ok, true);
});

test('el generador copia los alumnos de la regla a cada bloque, y los refresca', async () => {
  const env = crearEntorno();
  const a = await ok(env, { action: 'crearAlumno', alumno: alumno() });
  const b = await ok(env, { action: 'crearAlumno', alumno: alumno({ nombre: 'Camila' }) });
  const regla = await ok(env, { action: 'crearRegla', regla: {
    titulo: '', area: 'Academia Fractal', dias: 'Jue', inicio: '15:00', fin: '16:00',
    desde: '2026-09-24', hasta: '2026-10-01', etiqueta: '', notas: '', alumno_id: a.id
  } });
  await ok(env, { action: 'generarHorario' });
  let semana = await ok(env, { action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-10-04' });
  assert.deepStrictEqual(semana.map((x) => x.alumno_id), [a.id, a.id]);

  await ok(env, { action: 'actualizarRegla', id: regla.id, cambios: { alumno_id: a.id + ',' + b.id } });
  await ok(env, { action: 'generarHorario' });
  semana = await ok(env, { action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-10-04' });
  assert.deepStrictEqual(semana.map((x) => x.alumno_id), [a.id + ',' + b.id, a.id + ',' + b.id]);
});

test('una regla con alumnos que no existen no se guarda', async () => {
  const env = crearEntorno();
  const r = await env.post({ action: 'crearRegla', regla: {
    titulo: '', area: 'Academia Fractal', dias: 'Jue', inicio: '15:00', fin: '16:00',
    desde: '2026-09-24', hasta: '2026-10-01', alumno_id: 'a0badbad0'
  } });
  assert.match(r.error, /alumno_no_encontrado/);
  assert.strictEqual(env.tabla('horario').length, 0);
});
