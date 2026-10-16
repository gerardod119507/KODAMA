'use strict';

/**
 * Backend nuevo (Checkpoint 13): el importador de filas pegadas (alumnos,
 * reglas del horario y clases pasadas ya dictadas). Mismas pruebas que
 * tests/importar.test.js y tests/historico.test.js.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./entorno-backend');

async function ok(env, cuerpo) {
  const r = await env.post(cuerpo);
  assert.ok(r.ok, r.error);
  return r.data;
}

function importar(env, modo, filas, aplicar) {
  const texto = Array.isArray(filas) ? filas.map((f) => f.join('\t')).join('\n') : filas;
  return ok(env, { action: 'importar', modo, texto, aplicar: Boolean(aplicar) });
}

const alumnos = async (env) => (await ok(env, { action: 'listarAlumnos' })).alumnos;

// ---------------------------------------------------------------
// Alumnos
// ---------------------------------------------------------------

const CON_ENCABEZADO = [
  ['Nombre', 'Apellido', 'Colegio', 'Curso', 'Tarifa', 'Forma de pago'], // otro orden: manda el encabezado
  ['Agustín', 'Aliendre', 'SA', '4to', '80', 'mensual'],
  ['Camila', 'Rojas', 'Colegio Poveda', '2do de secundaria', 'Bs 70', 'por hora']
];

test('alumnos: la vista previa dice qué crea y no escribe nada', async () => {
  const env = crearEntorno();
  env.olvidarPeticiones();
  const r = await importar(env, 'alumnos', CON_ENCABEZADO, false);
  assert.strictEqual(r.aplicado, false);
  assert.strictEqual(r.conEncabezado, true);
  assert.deepStrictEqual(r.resumen, { crear: 2, actualizar: 0, sin_cambios: 0, error: 0 });
  assert.deepStrictEqual(r.filas.map((f) => f.detalle), ['Agustín Aliendre — 4to SA', 'Camila Rojas — 2do Poveda']);
  assert.strictEqual((await alumnos(env)).length, 0);
  assert.ok(env.peticiones().every((p) => p.op === 'seleccionar'), 'solo lecturas');
});

test('alumnos: aplicar escribe lo que mostró la vista previa, con nombres completos del catálogo', async () => {
  const env = crearEntorno();
  await importar(env, 'alumnos', CON_ENCABEZADO, true);
  const lista = await alumnos(env);
  assert.strictEqual(lista.length, 2);
  const agustin = lista.find((a) => a.nombre === 'Agustín');
  assert.deepStrictEqual([agustin.colegio, agustin.curso, agustin.forma_pago, agustin.forma_calculo],
    ['Unidad Educativa San Agustín', '4to de secundaria', 'mensual', 'hora']);
  assert.strictEqual(lista.find((a) => a.nombre === 'Camila').tarifa_hora, '70');
});

test('alumnos: sin encabezado se usa el orden por defecto', async () => {
  const env = crearEntorno();
  const r = await importar(env, 'alumnos', [['Lucía', 'Aliendre', '1er univ', 'UCB', '100', 'hora', 'hermana de Camila']], true);
  assert.strictEqual(r.conEncabezado, false);
  const [lucia] = await alumnos(env);
  assert.deepStrictEqual([lucia.curso, lucia.colegio, lucia.notas],
    ['1er año universidad', 'Universidad Católica Boliviana', 'hermana de Camila']);
});

test('alumnos: una fila mala se señala y el resto se importa igual', async () => {
  const env = crearEntorno();
  const r = await importar(env, 'alumnos', [
    ['Nombre', 'Apellido', 'Tarifa', 'Pago'],
    ['Agustín', 'Aliendre', '80', 'mensual'],
    ['', 'SinNombre', '80', 'hora'],
    ['Camila', 'Rojas', 'ochenta', 'hora'],
    ['Tomás', 'Paz', '60', 'anual'],
    ['Ana', 'Vega', '75', '']
  ], true);
  assert.deepStrictEqual(r.filas.map((f) => f.estado), ['crear', 'error', 'error', 'error', 'crear']);
  assert.deepStrictEqual(r.filas.map((f) => f.numero), [2, 3, 4, 5, 6], 'el número de fila es el de lo pegado');
  assert.match(r.filas[1].detalle, /falta el nombre/);
  assert.match(r.filas[2].detalle, /tarifa_invalida/);
  assert.match(r.filas[3].detalle, /forma_pago_invalida/);
  assert.deepStrictEqual((await alumnos(env)).map((a) => a.nombre).sort(), ['Agustín', 'Ana']);
});

test('alumnos: mismo nombre y apellido actualiza (sin borrar lo que no vino) o no cambia nada', async () => {
  const env = crearEntorno();
  await importar(env, 'alumnos', [['Agustín', 'Aliendre', '4to', 'SA', '80', 'mensual']], true);

  const r = await importar(env, 'alumnos', [
    ['Nombre', 'Apellido', 'Tarifa'],
    ['AGUSTIN', 'aliendre', '90'], // mismo alumno: cambia la tarifa
    ['Agustín', 'Aliendre', '95'] // repetido dentro de lo pegado
  ], true);
  assert.deepStrictEqual(r.filas.map((f) => f.estado), ['actualizar', 'error']);
  assert.match(r.filas[1].detalle, /repetido: ya está en la fila 2/);

  const lista = await alumnos(env);
  assert.strictEqual(lista.length, 1);
  assert.strictEqual(lista[0].tarifa_hora, '90');
  assert.strictEqual(lista[0].colegio, 'Unidad Educativa San Agustín', 'lo que no vino no se borra');

  const igual = await importar(env, 'alumnos', [['Agustín', 'Aliendre', '', '', '90']], false);
  assert.strictEqual(igual.filas[0].estado, 'sin_cambios');
});

test('alumnos: un colegio o curso nuevo se propone para el catálogo y se agrega antes que el alumno', async () => {
  const env = crearEntorno();
  const previa = await importar(env, 'alumnos', [['Mateo', 'Luna', '3ro', 'Colegio Alemán', '80', 'hora']], false);
  assert.strictEqual(previa.filas[0].estado, 'crear');
  assert.deepStrictEqual(previa.catalogosNuevos.colegios, [{ nombre: 'Colegio Alemán', corto: 'Colegio Alemán' }]);
  assert.ok(!env.tabla('colegios').some((c) => c.nombre === 'Colegio Alemán'), 'la vista previa no lo agrega');

  await importar(env, 'alumnos', [['Mateo', 'Luna', '3ro', 'Colegio Alemán', '80', 'hora']], true);
  assert.ok(env.tabla('colegios').some((c) => c.nombre === 'Colegio Alemán'));
  assert.strictEqual((await alumnos(env))[0].colegio, 'Colegio Alemán');
});

// ---------------------------------------------------------------
// Reglas del horario
// ---------------------------------------------------------------

async function conAlumnos(env) {
  await importar(env, 'alumnos', [
    ['Agustín', 'Aliendre', '4to', 'SA', '80', 'mensual'],
    ['Camila', 'Aliendre', '2do', 'SA', '80', 'mensual']
  ], true);
  return alumnos(env);
}

test('reglas: con encabezado de la hoja Horario, alumnos por nombre y fechas/horas en otro formato', async () => {
  const env = crearEntorno();
  const lista = await conAlumnos(env);
  const r = await importar(env, 'horario', [
    ['id', 'título', 'área', 'días', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'archivado', 'alumnos'],
    ['h99999999', 'Cálculo II', 'Universidad', 'Lun, Mié', '9:00', '10:30', '01/09/2026', '15/12/2026', '', '', '', ''],
    ['', '', 'academia fractal', 'Mar', '15:00', '16:00', '2026-09-01', '2026-12-15', '', '', '', 'Agustín Aliendre — 4to SA, camila aliendre']
  ], true);
  assert.deepStrictEqual(r.resumen, { crear: 2, actualizar: 0, sin_cambios: 0, error: 0 });

  const reglas = await ok(env, { action: 'listarHorario' });
  assert.strictEqual(reglas.length, 2);
  assert.match(reglas[0].id, /^h[0-9a-f]{8}$/, 'el id siempre lo pone el backend');
  assert.notStrictEqual(reglas[0].id, 'h99999999');
  assert.deepStrictEqual([reglas[0].inicio, reglas[0].desde, reglas[0].hasta], ['09:00', '2026-09-01', '2026-12-15']);
  assert.strictEqual(reglas[1].area, 'Academia Fractal');
  assert.strictEqual(reglas[1].alumno_id, lista.map((a) => a.id).join(','));
});

test('reglas: filas malas se señalan (día, alumno, área, horario) y las buenas se importan', async () => {
  const env = crearEntorno();
  await conAlumnos(env);
  const r = await importar(env, 'horario', [
    ['Física', 'Universidad', 'Lun', '10:00', '11:00', '2026-09-01', '2026-12-15'],
    ['Química', 'Universidad', 'Lunes y Juevez', '10:00', '11:00', '2026-09-01', '2026-12-15'],
    ['', 'Academia Fractal', 'Mar', '15:00', '16:00', '2026-09-01', '2026-12-15', '', '', 'Pedro Nadie'],
    ['Gimnasio', 'Deportes', 'Mar', '18:00', '19:00', '2026-09-01', '2026-12-15'],
    ['Inglés', 'Personal', 'Vie', '19:00', '18:00', '2026-09-01', '2026-12-15']
  ], true);
  assert.deepStrictEqual(r.filas.map((f) => f.estado), ['crear', 'error', 'error', 'error', 'error']);
  assert.match(r.filas[1].detalle, /dia_invalido/);
  assert.match(r.filas[2].detalle, /alumno no encontrado: "Pedro Nadie"/);
  assert.match(r.filas[3].detalle, /área desconocida/);
  assert.match(r.filas[4].detalle, /invertido/);
  assert.strictEqual((await ok(env, { action: 'listarHorario' })).length, 1);
});

test('reglas: la misma regla dos veces no se duplica; si cambia el fin, se actualiza', async () => {
  const env = crearEntorno();
  const fila = ['Física', 'Universidad', 'Lun, Mié', '10:00', '11:00', '2026-09-01', '2026-12-15'];
  await importar(env, 'horario', [fila], true);

  assert.strictEqual((await importar(env, 'horario', [fila], true)).filas[0].estado, 'sin_cambios');
  const otroFin = await importar(env, 'horario', [['física', 'Universidad', 'Mié Lun', '10:00', '11:30', '2026-09-01', '2026-12-15']], true);
  assert.strictEqual(otroFin.filas[0].estado, 'actualizar', 'mismos días en otro orden: es la misma regla');

  const reglas = await ok(env, { action: 'listarHorario' });
  assert.strictEqual(reglas.length, 1);
  assert.strictEqual(reglas[0].fin, '11:30');
});

test('un modo desconocido falla con un mensaje claro', async () => {
  const env = crearEntorno();
  const r = await env.post({ action: 'importar', modo: 'pagos', texto: 'x' });
  assert.match(r.error, /modo_desconocido/);
});

// ---------------------------------------------------------------
// Histórico: clases pasadas ya dictadas
// ---------------------------------------------------------------

async function conTresAlumnos() {
  const env = crearEntorno({ ahora: '2026-09-24T14:30:00Z' });
  for (const n of ['Santiago Aliendre', 'Santiago Méndez', 'Katy']) {
    const [nombre, ...resto] = n.split(' ');
    await ok(env, { action: 'crearAlumno', alumno: { nombre, apellido: resto.join(' '), tarifa_hora: '80' } });
  }
  return env;
}

const TEXTO = [
  'Alumno\tFecha\tInicio\tFin\tTema',
  'Katy\t12/08/2026\t9:00\t10:30\tÁlgebra',
  'Pedro Rojas\t2026-08-13\t15:00\t16:00\t',
  'pedro rojas\t2026-08-20\t15:00\t16:00\t',
  'Santiago Aliendre, Katy\t2026-08-14\t17:00\t18:00\t'
].join('\n');

test('histórico: vista previa con alumnos nuevos una sola vez, sin escribir nada', async () => {
  const env = await conTresAlumnos();
  const r = await importar(env, 'historico', TEXTO);
  assert.deepStrictEqual(r.resumen, { crear: 4, actualizar: 0, sin_cambios: 0, error: 0 });
  assert.deepStrictEqual(r.alumnosNuevos, ['Pedro Rojas'], 'aparece en dos filas pero se crea una sola vez');
  assert.match(r.filas[1].detalle, /Pedro Rojas \(alumno nuevo\) · 2026-08-13 15:00–16:00/);
  assert.strictEqual(env.tabla('bloques').length, 0);
  assert.strictEqual((await alumnos(env)).length, 3);
});

test('histórico: bloques de Fractal "dictada", con alumnos y tema; crea el alumno que falta', async () => {
  const env = await conTresAlumnos();
  await importar(env, 'historico', TEXTO, true);
  const lista = await alumnos(env);
  assert.strictEqual(lista.length, 4);
  const id = (n) => lista.find((a) => a.nombre === n && (a.apellido === 'Aliendre' || n !== 'Santiago')).id;
  assert.strictEqual(lista.find((a) => a.nombre === 'Pedro').apellido, 'Rojas');

  const b = await ok(env, { action: 'listarBloquesRango', desde: '2026-08-01', hasta: '2026-08-31' });
  assert.strictEqual(b.length, 4);
  b.forEach((x) => {
    assert.deepStrictEqual([x.area, x.estado], ['Academia Fractal', 'dictada']);
    assert.match(x.id, /^b[0-9a-f]{8}$/, 'id suelto: el generador nunca lo toca');
    assert.strictEqual(x.creado, '2026-09-24 10:30');
  });
  assert.deepStrictEqual([b[0].fecha, b[0].inicio, b[0].fin, b[0].titulo, b[0].alumno_id],
    ['2026-08-12', '09:00', '10:30', 'Álgebra', id('Katy')]);
  assert.strictEqual(b[2].alumno_id.split(',').sort().join(','), [id('Santiago'), id('Katy')].sort().join(','));
  assert.deepStrictEqual(b.map((x) => x.fecha), ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-20']);
});

test('histórico: importar lo mismo otra vez deja todo "sin cambios"', async () => {
  const env = await conTresAlumnos();
  await importar(env, 'historico', TEXTO, true);
  const r = await importar(env, 'historico', TEXTO, true);
  assert.deepStrictEqual(r.resumen, { crear: 0, actualizar: 0, sin_cambios: 4, error: 0 });
  assert.strictEqual(env.tabla('bloques').length, 4);
  assert.strictEqual((await alumnos(env)).length, 4);
});

test('histórico: filas malas se señalan y las buenas se importan igual', async () => {
  const env = await conTresAlumnos();
  const r = await importar(env, 'historico', [
    'Santiago\t2026-08-12\t09:00\t10:00', // ambiguo
    'Katy\t2026-10-01\t09:00\t10:00', // futura
    'Katy\t2026-08-12\t11:00\t10:00', // al revés
    'Katy\tayer\t09:00\t10:00', // fecha mal escrita
    '\t2026-08-12\t09:00\t10:00', // sin alumno
    'Katy\t2026-08-12\t09:00\t10:00',
    'Katy\t2026-08-12\t09:00\t10:00' // repetida en lo pegado
  ].join('\n'), true);
  const detalles = r.filas.map((f) => f.estado + ': ' + f.detalle);
  assert.match(detalles[0], /^error: "Santiago" es ambiguo \(Santiago Aliendre \/ Santiago Méndez\)/);
  assert.match(detalles[1], /^error: .*futura/);
  assert.match(detalles[2], /^error: .*después del fin/);
  assert.match(detalles[3], /^error: .*fecha_invalida/);
  assert.match(detalles[4], /^error: falta el alumno/);
  assert.match(detalles[5], /^crear/);
  assert.match(detalles[6], /^error: repetida/);
  assert.strictEqual(env.tabla('bloques').length, 1);
  assert.strictEqual((await alumnos(env)).length, 3, 'una fila con error no crea alumnos');
});

test('histórico: hoy cuenta como pasado (una clase de hoy ya dictada se puede cargar)', async () => {
  const env = await conTresAlumnos();
  assert.strictEqual((await importar(env, 'historico', 'Katy\t2026-09-24\t09:00\t10:00')).resumen.crear, 1);
});
