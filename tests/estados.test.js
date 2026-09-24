'use strict';

/**
 * Checkpoint 8: estado de cada clase (programada | dictada | movida |
 * cancelada), mover guardando la fecha y hora originales, y que el
 * generador del horario respete una clase movida.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

function preparar() {
  const env = crearEntorno({ ahora: '2026-09-23T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  return env;
}

function ok(env, cuerpo) {
  const r = env.post(Object.assign({ token: 'tk' }, cuerpo));
  assert.ok(r.ok, r.error);
  return r.data;
}

function error(env, cuerpo) {
  const r = env.post(Object.assign({ token: 'tk' }, cuerpo));
  assert.strictEqual(r.ok, false, 'debería fallar');
  return r.error;
}

function crear(env, extra) {
  return ok(env, { action: 'crearBloque', bloque: Object.assign({
    titulo: 'Física', area: 'Universidad', tipo: 'variable', fecha: '2026-09-24', inicio: '15:00', fin: '16:00'
  }, extra || {}) });
}

const leer = (env, id) => ok(env, { action: 'listarBloquesRango', desde: '2026-09-01', hasta: '2026-12-31' })
  .find((b) => b.id === id);

test('un bloque nuevo empieza programado y sin historia de movida', () => {
  const env = preparar();
  const b = crear(env);
  assert.strictEqual(b.estado, 'programada');
  assert.deepStrictEqual([b.fecha_original, b.inicio_original, b.fin_original, b.motivo], ['', '', '', '']);
});

test('marcar dictada, cancelada con motivo y volver a programada', () => {
  const env = preparar();
  const b = crear(env);

  let r = ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada' });
  assert.strictEqual(r.estado, 'dictada');
  assert.strictEqual(leer(env, b.id).estado, 'dictada', 'queda guardado en la hoja');

  r = ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'cancelada', motivo: '  feriado  ' });
  assert.deepStrictEqual([r.estado, r.motivo], ['cancelada', 'feriado']);

  r = ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'programada' });
  assert.deepStrictEqual([r.estado, r.motivo], ['programada', ''], 'al dejar de estar cancelada se va el motivo');
});

test('el motivo es opcional y solo se guarda si está cancelada', () => {
  const env = preparar();
  const b = crear(env);
  assert.strictEqual(ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'cancelada' }).motivo, '');
  assert.strictEqual(ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada', motivo: 'x' }).motivo, '');
});

test('"movida" no se elige a mano, y un estado desconocido falla sin tocar la hoja', () => {
  const env = preparar();
  const b = crear(env);
  assert.match(error(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'movida' }), /estado_invalido/);
  assert.match(error(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'hecha' }), /estado_invalido/);
  assert.match(error(env, { action: 'cambiarEstadoBloque', id: 'b99999999', estado: 'dictada' }), /bloque_no_encontrado/);
  assert.strictEqual(leer(env, b.id).estado, 'programada');
});

test('un bloque de antes (estado vacío) cuenta como programado', () => {
  const env = preparar();
  const b = crear(env);
  const hoja = env.libro.getSheetByName('Bloques');
  hoja.getRange(2, 15).setValue(''); // columna estado vacía, como en una hoja vieja
  const r = ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-26', inicio: '15:00', fin: '16:00' });
  assert.strictEqual(r.estado, 'movida');
});

test('mover guarda fecha y hora originales y marca "movida"', () => {
  const env = preparar();
  const b = crear(env, { fecha: '2026-09-24', inicio: '15:00', fin: '16:00' });
  const r = ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-26', inicio: '10:00', fin: '11:00' });
  assert.deepStrictEqual(
    [r.estado, r.fecha, r.inicio, r.fin, r.fecha_original, r.inicio_original, r.fin_original],
    ['movida', '2026-09-26', '10:00', '11:00', '2026-09-24', '15:00', '16:00']);
  assert.strictEqual(leer(env, b.id).fecha_original, '2026-09-24');
});

test('moverla otra vez no pisa el original; volver al original deja de ser movida', () => {
  const env = preparar();
  const b = crear(env, { fecha: '2026-09-24', inicio: '15:00', fin: '16:00' });
  ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-26', inicio: '15:00', fin: '16:00' });
  let r = ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-27', inicio: '15:00', fin: '16:00' });
  assert.strictEqual(r.fecha_original, '2026-09-24', 'sigue siendo el día real');

  r = ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-24', inicio: '15:00', fin: '16:00' });
  assert.deepStrictEqual([r.estado, r.fecha_original, r.inicio_original, r.fin_original], ['programada', '', '', '']);
});

test('mover a la misma fecha y hora no cambia nada', () => {
  const env = preparar();
  const b = crear(env);
  const r = ok(env, { action: 'moverBloque', id: b.id, fecha: b.fecha, inicio: b.inicio, fin: b.fin });
  assert.deepStrictEqual([r.estado, r.fecha_original], ['programada', '']);
});

test('mover una clase dictada o cancelada guarda el original pero no cambia su estado', () => {
  const env = preparar();
  const b = crear(env);
  ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada' });
  const r = ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-25', inicio: '15:00', fin: '16:00' });
  assert.deepStrictEqual([r.estado, r.fecha_original], ['dictada', '2026-09-24']);
});

test('una clase movida vuelve a "movida" (no a programada) al desmarcarla', () => {
  const env = preparar();
  const b = crear(env);
  ok(env, { action: 'moverBloque', id: b.id, fecha: '2026-09-25', inicio: '15:00', fin: '16:00' });
  ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada' });
  const r = ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'programada' });
  assert.strictEqual(r.estado, 'movida');
});

test('mover valida fecha y hora, y mantiene la hoja ordenada', () => {
  const env = preparar();
  const a = crear(env, { fecha: '2026-09-24', titulo: 'A' });
  crear(env, { fecha: '2026-09-25', titulo: 'B' });
  assert.match(error(env, { action: 'moverBloque', id: a.id, fecha: '26/09/2026', inicio: '15:00', fin: '16:00' }), /fecha_invalida/);
  assert.match(error(env, { action: 'moverBloque', id: a.id, fecha: '2026-09-26', inicio: '17:00', fin: '16:00' }), /horario_invertido/);
  ok(env, { action: 'moverBloque', id: a.id, fecha: '2026-09-30', inicio: '15:00', fin: '16:00' });
  const titulos = env.libro.getSheetByName('Bloques').leerTodo().slice(1).map((f) => f[1]);
  assert.deepStrictEqual(titulos, ['B', 'A']);
});

test('editar la fecha desde "Editar" corrige sin marcarla movida; el estado no se toca', () => {
  const env = preparar();
  const b = crear(env);
  ok(env, { action: 'cambiarEstadoBloque', id: b.id, estado: 'dictada' });
  const r = ok(env, { action: 'actualizarBloque', id: b.id, cambios: { fecha: '2026-09-25', estado: 'cancelada' } });
  assert.deepStrictEqual([r.fecha, r.estado, r.fecha_original], ['2026-09-25', 'dictada', '']);
});

test('el generador no toca una clase movida al regenerar', () => {
  const env = preparar();
  const regla = ok(env, { action: 'crearRegla', regla: {
    titulo: 'Cálculo', area: 'Universidad', dias: 'Jue', inicio: '09:00', fin: '10:00',
    desde: '2026-09-24', hasta: '2026-10-01', etiqueta: '', notas: ''
  } });
  ok(env, { action: 'generarHorario' });
  const id = regla.id + '-2026-09-24';
  ok(env, { action: 'moverBloque', id: id, fecha: '2026-09-26', inicio: '11:00', fin: '12:00' });
  ok(env, { action: 'actualizarRegla', id: regla.id, cambios: { titulo: 'Cálculo II' } });

  const r = ok(env, { action: 'generarHorario' });
  const movida = leer(env, id);
  assert.deepStrictEqual([movida.fecha, movida.inicio, movida.titulo, movida.estado], ['2026-09-26', '11:00', 'Cálculo', 'movida']);
  assert.strictEqual(leer(env, regla.id + '-2026-10-01').titulo, 'Cálculo II', 'las otras sí se refrescan');
  assert.strictEqual(r.creados, 0, 'no crea otra clase en el día original');
});

test('las acciones de estado exigen token', () => {
  const env = preparar();
  ['cambiarEstadoBloque', 'moverBloque'].forEach((action) => {
    const r = env.post({ token: 'otro', action, id: 'b1' });
    assert.deepStrictEqual(r, { ok: false, error: 'no_autorizado' });
  });
});
