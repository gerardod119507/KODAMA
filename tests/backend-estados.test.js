'use strict';

/**
 * Backend nuevo (Checkpoint 13): estado de cada clase (programada |
 * dictada | movida | cancelada), mover guardando la fecha y hora
 * originales, y que el generador respete una clase movida. Mismas pruebas
 * que tests/estados.test.js tenía para el Apps Script.
 *
 * "Dictada" solo existe en Academia Fractal (sirve para cobrar); cancelar
 * y mover valen en todas las áreas.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno, regla } = require('./entorno-backend');

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

function crear(env, extra) {
  return ok(env, { action: 'crearBloque', bloque: Object.assign({
    titulo: 'Física', area: 'Academia Fractal', tipo: 'variable', fecha: '2026-09-24', inicio: '15:00', fin: '16:00'
  }, extra || {}) });
}

const leer = (env, id) => env.fila('bloques', id);

test('un bloque nuevo empieza programado y sin historia de movida', async () => {
  const env = crearEntorno();
  const b = await crear(env);
  assert.strictEqual(b.estado, 'programada');
  assert.deepStrictEqual([b.fecha_original, b.inicio_original, b.fin_original, b.motivo], ['', '', '', '']);
});

test('marcar dictada, cancelada con motivo y volver a programada', async () => {
  const env = crearEntorno();
  const b = await crear(env);

  let r = await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada' });
  assert.strictEqual(r.estado, 'dictada');
  assert.strictEqual(leer(env, b.id).estado, 'dictada', 'queda guardado');

  r = await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'cancelada', motivo: '  feriado  ' });
  assert.deepStrictEqual([r.estado, r.motivo], ['cancelada', 'feriado']);
  assert.strictEqual(leer(env, b.id).motivo, 'feriado');

  r = await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'programada' });
  assert.deepStrictEqual([r.estado, r.motivo], ['programada', ''], 'al dejar de estar cancelada se va el motivo');
  assert.strictEqual(leer(env, b.id).motivo, '');
});

test('el motivo es opcional, solo se guarda si está cancelada, y se corta en 200 letras', async () => {
  const env = crearEntorno();
  const b = await crear(env);
  assert.strictEqual((await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'cancelada' })).motivo, '');
  assert.strictEqual((await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada', motivo: 'x' })).motivo, '');
  const largo = await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'cancelada', motivo: 'a'.repeat(250) });
  assert.strictEqual(largo.motivo.length, 200);
});

test('"movida" no se elige a mano, y un estado desconocido falla sin tocar nada', async () => {
  const env = crearEntorno();
  const b = await crear(env);
  assert.match(await error(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'movida' }), /estado_invalido/);
  assert.match(await error(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'hecha' }), /estado_invalido/);
  assert.match(await error(env, { action: 'cambiarEstadoBloque', id: 'b99999999', estado: 'dictada' }), /bloque_no_encontrado/);
  assert.strictEqual(leer(env, b.id).estado, 'programada');
});

test('mover guarda fecha y hora originales y marca "movida"', async () => {
  const env = crearEntorno();
  const b = await crear(env, { fecha: '2026-09-24', inicio: '15:00', fin: '16:00' });
  const r = await ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-26', inicio: '10:00', fin: '11:00' });
  const esperado = ['movida', '2026-09-26', '10:00', '11:00', '2026-09-24', '15:00', '16:00'];
  assert.deepStrictEqual([r.estado, r.fecha, r.inicio, r.fin, r.fecha_original, r.inicio_original, r.fin_original], esperado);
  const g = leer(env, b.id);
  assert.deepStrictEqual([g.estado, g.fecha, g.inicio, g.fin, g.fecha_original, g.inicio_original, g.fin_original], esperado);
});

test('moverla otra vez no pisa el original; volver al original deja de ser movida', async () => {
  const env = crearEntorno();
  const b = await crear(env, { fecha: '2026-09-24', inicio: '15:00', fin: '16:00' });
  await ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-26', inicio: '15:00', fin: '16:00' });
  let r = await ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-27', inicio: '15:00', fin: '16:00' });
  assert.strictEqual(r.fecha_original, '2026-09-24', 'sigue siendo el día real');

  r = await ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-24', inicio: '15:00', fin: '16:00' });
  assert.deepStrictEqual([r.estado, r.fecha_original, r.inicio_original, r.fin_original], ['programada', '', '', '']);
  assert.deepStrictEqual([leer(env, b.id).estado, leer(env, b.id).fecha_original], ['programada', '']);
});

test('mover a la misma fecha y hora no cambia nada (ni escribe)', async () => {
  const env = crearEntorno();
  const b = await crear(env);
  env.olvidarPeticiones();
  const r = await ok(env, { action: 'moverBloque', id: b.id, fecha: b.fecha, inicio: b.inicio, fin: b.fin });
  assert.deepStrictEqual([r.estado, r.fecha_original], ['programada', '']);
  assert.ok(env.peticiones().every((p) => p.op === 'seleccionar'));
});

test('mover una clase dictada o cancelada guarda el original pero no cambia su estado', async () => {
  const env = crearEntorno();
  const b = await crear(env);
  await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada' });
  const r = await ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-25', inicio: '15:00', fin: '16:00' });
  assert.deepStrictEqual([r.estado, r.fecha_original], ['dictada', '2026-09-24']);
});

test('una clase movida vuelve a "movida" (no a programada) al desmarcarla', async () => {
  const env = crearEntorno();
  const b = await crear(env);
  await ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-25', inicio: '15:00', fin: '16:00' });
  await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada' });
  const r = await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'programada' });
  assert.strictEqual(r.estado, 'movida');
});

test('mover valida fecha y hora, y la semana sigue saliendo ordenada', async () => {
  const env = crearEntorno();
  const a = await crear(env, { fecha: '2026-09-24', titulo: 'A' });
  await crear(env, { fecha: '2026-09-25', titulo: 'B' });
  assert.match(await error(env, { action: 'moverBloque', id: a.id, fecha: '26/09/2026', inicio: '15:00', fin: '16:00' }), /fecha_invalida/);
  assert.match(await error(env, { action: 'moverBloque', id: a.id, fecha: '2026-09-26', inicio: '17:00', fin: '16:00' }), /horario_invertido/);
  await ok(env, { action: 'moverBloque', id: a.id, fecha: '2026-09-30', inicio: '15:00', fin: '16:00' });
  const semana = await ok(env, { action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-10-04' });
  assert.deepStrictEqual(semana.map((b) => b.titulo), ['B', 'A']);
});

test('editar la fecha desde "Editar" corrige sin marcarla movida; el estado no se toca', async () => {
  const env = crearEntorno();
  const b = await crear(env);
  await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada' });
  const r = await ok(env, { action: 'actualizarBloque', id: b.id, cambios: { fecha: '2026-09-25', estado: 'cancelada' } });
  assert.deepStrictEqual([r.fecha, r.estado, r.fecha_original], ['2026-09-25', 'dictada', '']);
});

test('el generador no toca una clase movida al regenerar', async () => {
  const env = crearEntorno();
  const r0 = await ok(env, { action: 'crearRegla', regla: regla({ titulo: 'Cálculo', dias: 'Jue', inicio: '09:00', fin: '10:00', desde: '2026-09-24', hasta: '2026-10-01' }) });
  await ok(env, { action: 'generarHorario' });
  const id = r0.id + '-2026-09-24';
  await ok(env, { action: 'moverBloque', id: id, fecha: '2026-09-26', inicio: '11:00', fin: '12:00' });
  await ok(env, { action: 'actualizarRegla', id: r0.id, cambios: { titulo: 'Cálculo II' } });

  const r = await ok(env, { action: 'generarHorario' });
  const movida = leer(env, id);
  assert.deepStrictEqual([movida.fecha, movida.inicio, movida.titulo, movida.estado], ['2026-09-26', '11:00', 'Cálculo', 'movida']);
  assert.strictEqual(leer(env, r0.id + '-2026-10-01').titulo, 'Cálculo II', 'las otras sí se refrescan');
  assert.strictEqual(r.creados, 0, 'no crea otra clase en el día original');
});

// ---------------------------------------------------------------
// "Dictada" solo en Academia Fractal
// ---------------------------------------------------------------

test('fuera de Academia Fractal no se puede marcar dictada, y nada cambia', async () => {
  const env = crearEntorno();
  for (const area of ['Universidad', 'Startup', 'Personal']) {
    const b = await crear(env, { area });
    const e = await error(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada' });
    assert.match(e, /^dictada_solo_fractal: .*este bloque es de /);
    assert.match(e, /Puedes cancelarlo o moverlo/, 'de tú, nunca de vos');
    assert.strictEqual(leer(env, b.id).estado, 'programada');
  }
});

test('cancelar, reactivar y mover siguen valiendo en todas las áreas', async () => {
  const env = crearEntorno();
  const b = await crear(env, { area: 'Universidad' });
  let r = await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'cancelada', motivo: 'paro docente' });
  assert.deepStrictEqual([r.estado, r.motivo], ['cancelada', 'paro docente']);
  r = await ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'programada' });
  assert.strictEqual(r.estado, 'programada');
  r = await ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-26', inicio: '15:00', fin: '16:00' });
  assert.deepStrictEqual([r.estado, r.fecha_original], ['movida', '2026-09-24']);
});

test('una dictada que pasa a otra área con "Editar" vuelve a programada (o movida)', async () => {
  const env = crearEntorno();
  const quieta = await crear(env);
  await ok(env, { action: 'cambiarEstadoBloque', id: quieta.id, estado: 'dictada' });
  assert.strictEqual((await ok(env, { action: 'actualizarBloque', id: quieta.id, cambios: { area: 'Startup' } })).estado, 'programada');

  const movida = await crear(env);
  await ok(env, { action: 'moverBloque', id: movida.id, fecha: '2026-09-25', inicio: '15:00', fin: '16:00' });
  await ok(env, { action: 'cambiarEstadoBloque', id: movida.id, estado: 'dictada' });
  const r = await ok(env, { action: 'actualizarBloque', id: movida.id, cambios: { area: 'Personal' } });
  assert.deepStrictEqual([r.estado, r.fecha_original], ['movida', '2026-09-24']);
});

test('el generador: si la regla deja de ser de Fractal, sus clases dictadas vuelven a programada', async () => {
  const env = crearEntorno();
  const r0 = await ok(env, { action: 'crearRegla', regla: regla({ titulo: 'Repaso', area: 'Academia Fractal', dias: 'Jue', inicio: '09:00', fin: '10:00', desde: '2026-09-24', hasta: '2026-09-24' }) });
  await ok(env, { action: 'generarHorario' });
  const id = r0.id + '-2026-09-24';
  await ok(env, { action: 'cambiarEstadoBloque', id, estado: 'dictada' });
  await ok(env, { action: 'actualizarRegla', id: r0.id, cambios: { area: 'Universidad' } });
  await ok(env, { action: 'generarHorario' });
  assert.deepStrictEqual([leer(env, id).area, leer(env, id).estado], ['Universidad', 'programada']);
});
