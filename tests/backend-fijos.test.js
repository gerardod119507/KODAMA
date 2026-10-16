'use strict';

/**
 * Backend nuevo (Checkpoint 13): alumnos fijos de Fractal y materias.
 * Borrar un horario fijo (solo sus clases de hoy en adelante, nunca las
 * pasadas ni las dictadas), borrar una clase suelta, listar las clases
 * sueltas de Fractal marcadas "fijo", y guardar un horario regenerando en
 * la misma llamada. Mismas pruebas que tests/fijos.test.js.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./entorno-backend');

// Jueves 1 de octubre de 2026 (10:30 en La Paz).
async function preparar() {
  const env = crearEntorno({ ahora: '2026-10-01T14:30:00Z' });
  const katy = await ok(env, { action: 'crearAlumno', alumno: { nombre: 'Katy', tarifa_hora: '70', forma_pago: 'mensual' } });
  return { env, katy };
}

async function ok(env, cuerpo) {
  const r = await env.post(cuerpo);
  assert.ok(r.ok, r.error);
  return r.data;
}

async function error(env, cuerpo) {
  const r = await env.post(cuerpo);
  assert.strictEqual(r.ok, false, 'debería fallar');
  return r.error;
}

const ids = (env) => env.tabla('bloques').map((b) => b.id);

function fijoDeKaty(env, katy, extra) {
  return ok(env, { action: 'crearRegla', regenerar: true, regla: Object.assign({
    titulo: '', area: 'Academia Fractal', dias: 'Mar, Jue', inicio: '15:00', fin: '16:30',
    desde: '2026-10-01', hasta: '2026-10-31', alumno_id: katy.id, lugar: 'Casa', etiqueta: '', notas: ''
  }, extra || {}) });
}

test('guardar con regenerar: en una sola llamada quedan la regla y sus clases', async () => {
  const { env, katy } = await preparar();
  const regla = await fijoDeKaty(env, katy);
  assert.deepStrictEqual(regla.generado, { creados: 9, actualizados: 0, archivados: 0 }, 'mar y jue de octubre desde hoy');
  assert.strictEqual(ids(env).filter((id) => id.startsWith(regla.id + '-')).length, 9);

  const editada = await ok(env, { action: 'actualizarRegla', id: regla.id, regenerar: true, cambios: { inicio: '17:00', fin: '18:30' } });
  assert.strictEqual(editada.generado.actualizados, 9);
  assert.ok(env.tabla('bloques').every((b) => b.inicio === '17:00'), 'las clases se movieron con la regla');
});

test('sin regenerar, guardar no toca los bloques (como antes)', async () => {
  const { env, katy } = await preparar();
  const regla = await ok(env, { action: 'crearRegla', regla: {
    titulo: '', area: 'Academia Fractal', dias: 'Mar', inicio: '15:00', fin: '16:00',
    desde: '2026-10-01', hasta: '2026-10-31', alumno_id: katy.id
  } });
  assert.strictEqual(regla.generado, undefined);
  assert.strictEqual(env.tabla('bloques').length, 0);
});

test('borrar un fijo: se va la regla y sus clases futuras; las pasadas y las dictadas quedan', async () => {
  const { env, katy } = await preparar();
  const regla = await fijoDeKaty(env, katy);
  // Una clase de antes (de cuando se generó el mes pasado) y la de hoy ya dictada.
  const vieja = Object.assign({}, env.tabla('bloques')[0], { id: regla.id + '-2026-09-29', fecha: '2026-09-29' });
  env.sembrar('bloques', [vieja]);
  await ok(env, { action: 'cambiarEstadoBloque', id: regla.id + '-2026-10-01', estado: 'dictada' });
  const otra = await ok(env, { action: 'crearBloque', bloque: { titulo: 'Física', area: 'Universidad', tipo: 'fijo', fecha: '2026-10-06', inicio: '08:00', fin: '09:30' } });

  const r = await ok(env, { action: 'borrarRegla', id: regla.id });
  assert.deepStrictEqual(r, { borradas: 8, quedan: 2 });
  assert.deepStrictEqual(ids(env).sort(), [otra.id, regla.id + '-2026-09-29', regla.id + '-2026-10-01'].sort());
  assert.strictEqual((await ok(env, { action: 'listarHorario' })).length, 0, 'la regla ya no está');
  assert.match(await error(env, { action: 'borrarRegla', id: regla.id }), /regla_no_encontrada/);

  // Regenerar después no revive nada.
  assert.deepStrictEqual(await ok(env, { action: 'generarHorario' }), { creados: 0, actualizados: 0, archivados: 0 });
});

test('borrar un fijo no toca los otros horarios fijos', async () => {
  const { env, katy } = await preparar();
  const a = await fijoDeKaty(env, katy);
  const b = await fijoDeKaty(env, katy, { dias: 'Vie' });
  await ok(env, { action: 'borrarRegla', id: a.id });
  assert.ok(ids(env).length > 0 && ids(env).every((id) => id.startsWith(b.id + '-')));
});

test('archivar una materia con regenerar archiva sus clases futuras en la misma llamada', async () => {
  const { env } = await preparar();
  const materia = await ok(env, { action: 'crearRegla', regenerar: true, regla: {
    titulo: 'Cálculo II', area: 'Universidad', dias: 'Lun, Mié', inicio: '09:00', fin: '10:30',
    desde: '2026-08-01', hasta: '2026-10-31', lugar: 'Aula E511'
  } });
  const r = await ok(env, { action: 'archivarRegla', id: materia.id, regenerar: true });
  assert.strictEqual(r.archivado, 'TRUE');
  assert.strictEqual(r.generado.archivados, materia.generado.creados);
});

test('clases sueltas de Fractal marcadas "fijo": solo esas, de hoy en adelante', async () => {
  const { env, katy } = await preparar();
  const crear = (extra) => ok(env, { action: 'crearBloque', bloque: Object.assign({
    titulo: '', area: 'Academia Fractal', tipo: 'fijo', fecha: '2026-10-08', inicio: '15:00', fin: '16:00', alumno_id: katy.id
  }, extra) });
  const buena = await crear({});
  const temprana = await crear({ fecha: '2026-10-02', inicio: '09:00', fin: '10:00' });
  await crear({ tipo: 'variable' });
  await crear({ fecha: '2026-09-30' }); // pasada
  await ok(env, { action: 'archivarBloque', id: (await crear({})).id });
  await ok(env, { action: 'crearBloque', bloque: { titulo: 'Física', area: 'Universidad', tipo: 'fijo', fecha: '2026-10-08', inicio: '08:00', fin: '09:00' } });
  await fijoDeKaty(env, katy); // de un horario fijo: no es suelta

  assert.deepStrictEqual((await ok(env, { action: 'listarFijosSueltos' })).map((b) => b.id), [temprana.id, buena.id]);

  // Pasarla a variable: "Editar" con tipo.
  await ok(env, { action: 'actualizarBloque', id: buena.id, cambios: { tipo: 'variable' } });
  assert.deepStrictEqual((await ok(env, { action: 'listarFijosSueltos' })).map((b) => b.id), [temprana.id]);
});

test('borrar una clase suelta; nunca una de un horario fijo ni una dictada', async () => {
  const { env, katy } = await preparar();
  const suelta = await ok(env, { action: 'crearBloque', bloque: {
    titulo: '', area: 'Academia Fractal', tipo: 'fijo', fecha: '2026-10-08', inicio: '15:00', fin: '16:00', alumno_id: katy.id
  } });
  const regla = await fijoDeKaty(env, katy);
  const deRegla = regla.id + '-2026-10-06';

  assert.match(await error(env, { action: 'borrarBloque', id: deRegla }), /^bloque_de_horario_fijo: .*bórrala desde Horario/);
  await ok(env, { action: 'cambiarEstadoBloque', id: suelta.id, estado: 'dictada' });
  assert.match(await error(env, { action: 'borrarBloque', id: suelta.id }), /^bloque_dictado: /);
  await ok(env, { action: 'cambiarEstadoBloque', id: suelta.id, estado: 'programada' });

  assert.deepStrictEqual(await ok(env, { action: 'borrarBloque', id: suelta.id }), { borrado: suelta.id });
  assert.ok(!ids(env).includes(suelta.id));
  assert.ok(ids(env).includes(deRegla));
  assert.match(await error(env, { action: 'borrarBloque', id: suelta.id }), /bloque_no_encontrado/);
});
