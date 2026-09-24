'use strict';

/**
 * Checkpoint 8: importador de clases pasadas ya dictadas (modo "historico").
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

function preparar() {
  const env = crearEntorno({ ahora: '2026-09-24T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  ['Santiago Aliendre', 'Santiago Méndez', 'Katy'].forEach((n) => {
    const [nombre, ...resto] = n.split(' ');
    ok(env, { action: 'crearAlumno', alumno: { nombre, apellido: resto.join(' '), tarifa_hora: '80' } });
  });
  return env;
}

function ok(env, cuerpo) {
  const r = env.post(Object.assign({ token: 'tk' }, cuerpo));
  assert.ok(r.ok, r.error);
  return r.data;
}

const importar = (env, texto, aplicar) => ok(env, { action: 'importar', modo: 'historico', texto, aplicar: Boolean(aplicar) });
const bloques = (env) => env.libro.getSheetByName('Bloques').leerTodo().slice(1).filter((f) => f[0]);
const alumnos = (env) => ok(env, { action: 'listarAlumnos' }).alumnos;

const TEXTO = [
  'Alumno\tFecha\tInicio\tFin\tTema',
  'Katy\t12/08/2026\t9:00\t10:30\tÁlgebra',
  'Pedro Rojas\t2026-08-13\t15:00\t16:00\t',
  'pedro rojas\t2026-08-20\t15:00\t16:00\t',
  'Santiago Aliendre, Katy\t2026-08-14\t17:00\t18:00\t'
].join('\n');

test('vista previa: qué crea, alumnos nuevos una vez, y no escribe nada', () => {
  const env = preparar();
  const r = importar(env, TEXTO);
  assert.deepStrictEqual(r.resumen, { crear: 4, actualizar: 0, sin_cambios: 0, error: 0 });
  assert.deepStrictEqual(r.alumnosNuevos, ['Pedro Rojas'], 'aparece en dos filas pero se crea una sola vez');
  assert.match(r.filas[1].detalle, /Pedro Rojas \(alumno nuevo\) · 2026-08-13 15:00–16:00/);
  assert.strictEqual(bloques(env).length, 0);
  assert.strictEqual(alumnos(env).length, 3);
});

test('aplicar: bloques de Fractal "dictada", con alumnos y tema; crea el alumno que falta', () => {
  const env = preparar();
  importar(env, TEXTO, true);
  const lista = alumnos(env);
  assert.strictEqual(lista.length, 4);
  const id = (n) => lista.find((a) => a.nombre === n && (a.apellido === 'Aliendre' || n !== 'Santiago')).id;
  const pedro = lista.find((a) => a.nombre === 'Pedro');
  assert.strictEqual(pedro.apellido, 'Rojas');

  const b = ok(env, { action: 'listarBloquesRango', desde: '2026-08-01', hasta: '2026-08-31' });
  assert.strictEqual(b.length, 4);
  b.forEach((x) => {
    assert.deepStrictEqual([x.area, x.estado], ['Academia Fractal', 'dictada']);
    assert.match(x.id, /^b[0-9a-f]{8}$/, 'id suelto: el generador nunca lo toca');
  });
  assert.deepStrictEqual([b[0].fecha, b[0].inicio, b[0].fin, b[0].titulo, b[0].alumno_id],
    ['2026-08-12', '09:00', '10:30', 'Álgebra', id('Katy')]);
  assert.strictEqual(b[2].alumno_id.split(',').sort().join(','), [id('Santiago'), id('Katy')].sort().join(','));
  assert.deepStrictEqual(b.map((x) => x.fecha), ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-20'], 'hoja ordenada');
});

test('sin duplicar: importar lo mismo otra vez deja todo "sin cambios"', () => {
  const env = preparar();
  importar(env, TEXTO, true);
  const r = importar(env, TEXTO, true);
  assert.deepStrictEqual(r.resumen, { crear: 0, actualizar: 0, sin_cambios: 4, error: 0 });
  assert.strictEqual(bloques(env).length, 4);
  assert.strictEqual(alumnos(env).length, 4);
});

test('filas malas se señalan y las buenas se importan igual', () => {
  const env = preparar();
  const r = importar(env, [
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
  assert.strictEqual(bloques(env).length, 1);
  assert.strictEqual(alumnos(env).length, 3, 'una fila con error no crea alumnos');
});

test('hoy cuenta como pasado (una clase de hoy ya dictada se puede cargar)', () => {
  const env = preparar();
  assert.strictEqual(importar(env, 'Katy\t2026-09-24\t09:00\t10:00').resumen.crear, 1);
});
