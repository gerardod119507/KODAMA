'use strict';

/**
 * Recordatorio de un bloque (migración 004): se guarda en Supabase para
 * que el celular y la computadora lo compartan. El generador del horario
 * nunca lo pisa.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno, bloque, regla } = require('./entorno-backend');

test('crearBloque guarda el recordatorio; sin elegir queda vacío', async () => {
  const env = crearEntorno();
  const con = await env.post({ action: 'crearBloque', bloque: bloque({ recordatorio: '15' }) });
  const sin = await env.post({ action: 'crearBloque', bloque: bloque() });
  assert.strictEqual(con.data.recordatorio, '15');
  assert.strictEqual(sin.data.recordatorio, '');
  const filas = env.tabla('bloques');
  assert.deepStrictEqual(filas.map((f) => f.recordatorio).sort(), ['', '15']);
});

test('actualizarBloque cambia y quita el recordatorio sin tocar lo demás', async () => {
  const env = crearEntorno();
  const creado = (await env.post({ action: 'crearBloque', bloque: bloque() })).data;
  await env.post({ action: 'actualizarBloque', id: creado.id, cambios: { recordatorio: '0' } });
  assert.strictEqual(env.tabla('bloques')[0].recordatorio, '0', '0 = al comenzar, no es "sin recordatorio"');
  assert.strictEqual(env.tabla('bloques')[0].titulo, creado.titulo);
  await env.post({ action: 'actualizarBloque', id: creado.id, cambios: { recordatorio: '' } });
  assert.strictEqual(env.tabla('bloques')[0].recordatorio, '');
});

test('un recordatorio que no es un número de minutos válido falla sin escribir', async () => {
  const env = crearEntorno();
  for (const malo of ['-5', 'diez', '2000', '7.5']) {
    const r = await env.post({ action: 'crearBloque', bloque: bloque({ recordatorio: malo }) });
    assert.strictEqual(r.ok, false, malo);
    assert.match(r.error, /^recordatorio_invalido/);
  }
  assert.strictEqual(env.tabla('bloques').length, 0);
});

test('regenerar el horario conserva el recordatorio de cada clase', async () => {
  const env = crearEntorno();
  await env.post({ action: 'crearRegla', regla: regla(), regenerar: true });
  const primera = env.tabla('bloques')[0];
  await env.post({ action: 'actualizarBloque', id: primera.id, cambios: { recordatorio: '30' } });
  await env.post({ action: 'actualizarRegla', id: env.tabla('horario')[0].id, cambios: { inicio: '07:00', fin: '08:30' }, regenerar: true });
  const despues = env.tabla('bloques').find((f) => f.id === primera.id);
  assert.strictEqual(despues.inicio, '07:00', 'la regla sí cambió la hora');
  assert.strictEqual(despues.recordatorio, '30', 'y el recordatorio quedó');
});
