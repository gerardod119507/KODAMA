'use strict';

/**
 * vincularAlumnosEnHorario() — función manual (Setup.gs) que vincula las
 * reglas de Fractal de la hoja Horario con los alumnos, leyendo el título.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

const ENCABEZADO = ['id', 'título', 'área', 'días', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'archivado', 'alumno_id'];

function preparar(reglas, alumnos) {
  const env = crearEntorno({ ahora: '2026-09-23T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  const registro = [];
  // Como Logger.log de Apps Script: reemplaza cada %s por el siguiente valor.
  env.Logger = { log: (formato, ...valores) => registro.push(String(formato).replace(/%s/g, () => String(valores.shift()))) };
  alumnos.forEach(([nombre, apellido]) => {
    const r = env.post({ token: 'tk', action: 'crearAlumno', alumno: { nombre, apellido } });
    assert.ok(r.ok, r.error);
  });
  env.libro.getSheetByName('Horario').sembrar([ENCABEZADO].concat(reglas.map((r, i) => [
    'h0000000' + i, r[0], r[1], 'Lun', '15:00', '16:00', '2026-09-01', '2026-12-15', '', 'nota ' + i, '', r[2] || ''
  ])));
  const ids = {};
  env.post({ token: 'tk', action: 'listarAlumnos' }).data.alumnos.forEach((a) => { ids[a.nombre + ' ' + a.apellido] = a.id; });
  return { env, registro, ids };
}

const hoja = (env) => env.libro.getSheetByName('Horario').leerTodo();

test('vincula por nombre y apellido sin tildes ni mayúsculas, y a varios alumnos por regla', () => {
  const { env, ids } = preparar([
    ['Clase con agustin ALIENDRE', 'Academia Fractal'],
    ['Camila y Adriana', 'Academia Fractal'],
    ['Lucía Paz - Física', 'Academia Fractal']
  ], [['Agustín', 'Aliendre'], ['Camila', 'Rojas'], ['Adriana', 'Vega'], ['Lucía', 'Paz']]);

  const r = env.llamar('vincularAlumnosEnHorario()');
  assert.strictEqual(r.vinculadas.length, 3);
  assert.strictEqual(r.pendientes.length, 0);
  const filas = hoja(env);
  assert.strictEqual(filas[1][11], ids['Agustín Aliendre']);
  assert.strictEqual(filas[2][11], ids['Camila Rojas'] + ',' + ids['Adriana Vega']);
  assert.strictEqual(filas[3][11], ids['Lucía Paz']);
});

test('no encontrado o ambiguo: la fila queda sin tocar y queda registrada', () => {
  const { env, registro } = preparar([
    ['Clase con Valentina', 'Academia Fractal'], // no existe
    ['Clase con Camila', 'Academia Fractal'], // dos Camila: ambiguo
    ['Camila Rojas y Pedro', 'Academia Fractal'] // uno sí, otro no: la fila entera queda pendiente
  ], [['Camila', 'Rojas'], ['Camila', 'Vega']]);

  const r = env.llamar('vincularAlumnosEnHorario()');
  assert.strictEqual(r.vinculadas.length, 0);
  assert.deepStrictEqual(r.pendientes.map((p) => p.fila), [2, 3, 4]);
  assert.match(r.pendientes[0].motivo, /"Valentina" no está en Alumnos/);
  assert.match(r.pendientes[1].motivo, /"Camila" es ambiguo \(Camila Rojas \/ Camila Vega\)/);
  assert.match(r.pendientes[2].motivo, /"Pedro" no está en Alumnos/);
  assert.ok(hoja(env).slice(1).every((f) => f[11] === ''), 'ninguna fila pendiente se tocó');
  assert.strictEqual(registro[0], 'Reglas vinculadas: 0. Pendientes: 3.');
  assert.ok(registro.some((l) => l.includes('Clase con Camila') && l.includes('ambiguo')));
});

test('no toca otras áreas, reglas ya vinculadas, títulos ni ninguna otra columna', () => {
  const { env, ids } = preparar([
    ['Agustín Aliendre', 'Universidad'], // otra área
    ['Agustín Aliendre', 'Academia Fractal', 'a99999999'], // ya vinculada (aunque sea otro id)
    ['Agustín Aliendre', 'Academia Fractal']
  ], [['Agustín', 'Aliendre']]);
  const antes = hoja(env);

  env.llamar('vincularAlumnosEnHorario()');
  const despues = hoja(env);
  assert.deepStrictEqual(despues[1], antes[1], 'otra área: igual');
  assert.deepStrictEqual(despues[2], antes[2], 'ya vinculada: igual');
  assert.deepStrictEqual(despues[3].slice(0, 11), antes[3].slice(0, 11), 'título, notas y demás columnas: igual');
  assert.strictEqual(despues[3][11], ids['Agustín Aliendre']);
  assert.strictEqual(env.post({ token: 'tk', action: 'listarAlumnos' }).data.alumnos.length, 1, 'no crea alumnos');
});

test('correrla dos veces no cambia nada la segunda vez', () => {
  const { env } = preparar([['Clase con Agustín', 'Academia Fractal']], [['Agustín', 'Aliendre']]);
  env.llamar('vincularAlumnosEnHorario()');
  const despues = JSON.stringify(hoja(env));
  const r = env.llamar('vincularAlumnosEnHorario()');
  assert.strictEqual(r.vinculadas.length, 0);
  assert.strictEqual(JSON.stringify(hoja(env)), despues);
});
