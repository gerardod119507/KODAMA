'use strict';

/**
 * Checkpoint 8: hoja Pagos (alumno, periodo, monto, fecha de pago,
 * estado, notas) y sus acciones.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

function preparar() {
  const env = crearEntorno({ ahora: '2026-09-30T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  const alumno = ok(env, { action: 'crearAlumno', alumno: { nombre: 'Katy', tarifa_hora: '80', forma_pago: 'mensual' } });
  return { env, alumno };
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

const pago = (alumno, extra) => Object.assign({
  alumno_id: alumno.id, desde: '2026-09-01', hasta: '2026-09-30', monto: '640', estado: 'pendiente', notas: ''
}, extra || {});

test('la hoja Pagos se crea con sus columnas', () => {
  const { env } = preparar();
  assert.deepStrictEqual(env.libro.getSheetByName('Pagos').leerTodo()[0],
    ['id', 'alumno_id', 'desde', 'hasta', 'monto', 'fecha_pago', 'estado', 'notas', 'creado', 'archivado']);
});

test('crear un pago: id propio, pendiente sin fecha de pago', () => {
  const { env, alumno } = preparar();
  const p = ok(env, { action: 'crearPago', pago: pago(alumno) });
  assert.match(p.id, /^p[0-9a-f]{8}$/);
  assert.deepStrictEqual([p.estado, p.fecha_pago, p.monto], ['pendiente', '', '640']);
  assert.strictEqual(ok(env, { action: 'listarPagos' }).length, 1);
});

test('pagado sin fecha toma la de hoy; el monto acepta "Bs 640,50"', () => {
  const { env, alumno } = preparar();
  const p = ok(env, { action: 'crearPago', pago: pago(alumno, { estado: 'pagado', monto: 'Bs 640,50' }) });
  assert.deepStrictEqual([p.estado, p.fecha_pago, p.monto], ['pagado', '2026-09-30', '640.5']);
});

test('validaciones: alumno, periodo, monto, estado y fechas; nada se escribe', () => {
  const { env, alumno } = preparar();
  assert.match(error(env, { action: 'crearPago', pago: pago(alumno, { alumno_id: '' }) }), /falta_alumno/);
  assert.match(error(env, { action: 'crearPago', pago: pago(alumno, { alumno_id: 'a99999999' }) }), /alumno_no_encontrado/);
  assert.match(error(env, { action: 'crearPago', pago: pago(alumno, { alumno_id: alumno.id + ',' + alumno.id }) }), /falta_alumno/);
  assert.match(error(env, { action: 'crearPago', pago: pago(alumno, { desde: '2026-10-01' }) }), /periodo_invalido/);
  assert.match(error(env, { action: 'crearPago', pago: pago(alumno, { hasta: '30/09/2026' }) }), /pago_fecha_invalida/);
  assert.match(error(env, { action: 'crearPago', pago: pago(alumno, { monto: 'mucho' }) }), /monto_invalido/);
  assert.match(error(env, { action: 'crearPago', pago: pago(alumno, { monto: '-5' }) }), /monto_invalido/);
  assert.match(error(env, { action: 'crearPago', pago: pago(alumno, { estado: 'debe' }) }), /estado_pago_invalido/);
  assert.strictEqual(ok(env, { action: 'listarPagos' }).length, 0);
});

test('editar solo cambia lo que viene; marcar pagado pone la fecha', () => {
  const { env, alumno } = preparar();
  const p = ok(env, { action: 'crearPago', pago: pago(alumno, { notas: 'efectivo' }) });
  const r = ok(env, { action: 'actualizarPago', id: p.id, cambios: { estado: 'pagado' } });
  assert.deepStrictEqual([r.estado, r.fecha_pago, r.monto, r.notas], ['pagado', '2026-09-30', '640', 'efectivo']);
  assert.match(error(env, { action: 'actualizarPago', id: 'p99999999', cambios: {} }), /pago_no_encontrado/);
});

test('archivar marca TRUE y no borra la fila', () => {
  const { env, alumno } = preparar();
  const p = ok(env, { action: 'crearPago', pago: pago(alumno) });
  ok(env, { action: 'archivarPago', id: p.id });
  const lista = ok(env, { action: 'listarPagos' });
  assert.deepStrictEqual(lista.map((x) => x.archivado), ['TRUE']);
});

test('las acciones de pagos exigen token', () => {
  const { env } = preparar();
  ['listarPagos', 'crearPago', 'actualizarPago', 'archivarPago'].forEach((action) => {
    assert.deepStrictEqual(env.post({ token: 'otro', action }), { ok: false, error: 'no_autorizado' });
  });
});
