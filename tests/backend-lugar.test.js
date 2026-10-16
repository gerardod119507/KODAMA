'use strict';

/**
 * Backend nuevo (Checkpoint 13): el campo "lugar" en bloques, reglas y
 * alumnos, y que el generador lo lleve de la regla a los bloques. Mismas
 * pruebas que tests/lugar.test.js (moverAulasALugar ya no hace falta: era
 * una corrección de una sola vez sobre el Sheet).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./entorno-backend');

async function ok(env, cuerpo) {
  const r = await env.post(cuerpo);
  assert.ok(r.ok, r.error);
  return r.data;
}

test('bloques, reglas y alumnos guardan y editan el lugar', async () => {
  const env = crearEntorno();
  const bloque = await ok(env, { action: 'crearBloque', bloque: {
    titulo: 'Cálculo', area: 'Universidad', tipo: 'fijo', fecha: '2026-09-24', inicio: '09:00', fin: '10:00', lugar: '  Aula E511 '
  } });
  assert.strictEqual(bloque.lugar, 'Aula E511');
  assert.strictEqual((await ok(env, { action: 'actualizarBloque', id: bloque.id, cambios: { lugar: 'Aula E103' } })).lugar, 'Aula E103');
  assert.strictEqual((await ok(env, { action: 'listarBloquesDia', fecha: '2026-09-24' }))[0].lugar, 'Aula E103');

  const alumno = await ok(env, { action: 'crearAlumno', alumno: { nombre: 'Camila', apellido: 'Rojas', lugar: 'Su casa (Av. América)' } });
  assert.strictEqual(alumno.lugar, 'Su casa (Av. América)');
  assert.strictEqual((await ok(env, { action: 'actualizarAlumno', id: alumno.id, cambios: { lugar: 'Fractal' } })).lugar, 'Fractal');
  assert.strictEqual(env.tabla('alumnos')[0].lugar, 'Fractal');
});

test('el generador copia el lugar de la regla a cada bloque y lo refresca si cambia', async () => {
  const env = crearEntorno();
  const regla = await ok(env, { action: 'crearRegla', regla: {
    titulo: 'Cálculo II', area: 'Universidad', dias: 'Jue', inicio: '09:00', fin: '10:30',
    desde: '2026-09-24', hasta: '2026-10-01', lugar: 'Aula E511'
  } });
  await ok(env, { action: 'generarHorario' });
  let bloques = await ok(env, { action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-10-04' });
  assert.deepStrictEqual(bloques.map((b) => b.lugar), ['Aula E511', 'Aula E511']);

  await ok(env, { action: 'actualizarRegla', id: regla.id, cambios: { lugar: 'Aula E522' } });
  await ok(env, { action: 'generarHorario' });
  bloques = await ok(env, { action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-10-04' });
  assert.deepStrictEqual(bloques.map((b) => b.lugar), ['Aula E522', 'Aula E522']);
});

test('un lugar vacío queda vacío ("") en la app y null en la base', async () => {
  const env = crearEntorno();
  await ok(env, { action: 'crearBloque', bloque: { titulo: 'X', area: 'Personal', tipo: 'variable', fecha: '2026-09-24', inicio: '09:00', fin: '10:00' } });
  assert.strictEqual(env.tabla('bloques')[0].lugar, '');
  assert.strictEqual(env.base.filas('bloques')[0].lugar, null);
});
