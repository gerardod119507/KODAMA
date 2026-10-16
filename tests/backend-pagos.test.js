'use strict';

/**
 * Backend nuevo (Checkpoint 13): pagos y plantillas. Mismas pruebas que
 * tests/pagos.test.js y la parte de backend de tests/formas.test.js.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./entorno-backend');

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

async function preparar() {
  const env = crearEntorno({ ahora: '2026-09-30T14:30:00Z' });
  const alumno = await ok(env, { action: 'crearAlumno', alumno: { nombre: 'Katy', tarifa_hora: '80', forma_pago: 'mensual' } });
  return { env, alumno };
}

const pago = (alumno, extra) => Object.assign({
  alumno_id: alumno.id, desde: '2026-09-01', hasta: '2026-09-30', monto: '640', estado: 'pendiente', notas: ''
}, extra || {});

// ---------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------

test('crear un pago: id propio, pendiente sin fecha de pago', async () => {
  const { env, alumno } = await preparar();
  const p = await ok(env, { action: 'crearPago', pago: pago(alumno) });
  assert.match(p.id, /^p[0-9a-f]{8}$/);
  assert.deepStrictEqual([p.estado, p.fecha_pago, p.monto], ['pendiente', '', '640']);
  const lista = await ok(env, { action: 'listarPagos' });
  assert.deepStrictEqual(lista.map((x) => [x.alumno_id, x.monto, x.estado, x.fecha_pago, x.creado]),
    [[alumno.id, '640', 'pendiente', '', '2026-09-30 10:30']]);
});

test('pagado sin fecha toma la de hoy; el monto acepta "Bs 640,50"', async () => {
  const { env, alumno } = await preparar();
  const p = await ok(env, { action: 'crearPago', pago: pago(alumno, { estado: 'pagado', monto: 'Bs 640,50' }) });
  assert.deepStrictEqual([p.estado, p.fecha_pago, p.monto], ['pagado', '2026-09-30', '640.5']);
  assert.strictEqual(env.tabla('pagos')[0].monto, '640.5');
  assert.strictEqual(env.base.filas('pagos')[0].monto, 640.5, 'en la base el monto es un número');
});

test('validaciones: alumno, periodo, monto, estado y fechas; nada se escribe', async () => {
  const { env, alumno } = await preparar();
  assert.match(await error(env, { action: 'crearPago', pago: pago(alumno, { alumno_id: '' }) }), /falta_alumno/);
  assert.match(await error(env, { action: 'crearPago', pago: pago(alumno, { alumno_id: 'a99999999' }) }), /alumno_no_encontrado/);
  assert.match(await error(env, { action: 'crearPago', pago: pago(alumno, { alumno_id: alumno.id + ',' + alumno.id }) }), /falta_alumno/);
  assert.match(await error(env, { action: 'crearPago', pago: pago(alumno, { desde: '2026-10-01' }) }), /periodo_invalido/);
  assert.match(await error(env, { action: 'crearPago', pago: pago(alumno, { hasta: '30/09/2026' }) }), /pago_fecha_invalida/);
  assert.match(await error(env, { action: 'crearPago', pago: pago(alumno, { monto: 'mucho' }) }), /monto_invalido/);
  assert.match(await error(env, { action: 'crearPago', pago: pago(alumno, { monto: '-5' }) }), /monto_invalido/);
  assert.match(await error(env, { action: 'crearPago', pago: pago(alumno, { estado: 'debe' }) }), /estado_pago_invalido/);
  assert.strictEqual((await ok(env, { action: 'listarPagos' })).length, 0);
});

test('editar solo cambia lo que viene; marcar pagado pone la fecha', async () => {
  const { env, alumno } = await preparar();
  const p = await ok(env, { action: 'crearPago', pago: pago(alumno, { notas: 'efectivo' }) });
  const r = await ok(env, { action: 'actualizarPago', id: p.id, cambios: { estado: 'pagado' } });
  assert.deepStrictEqual([r.estado, r.fecha_pago, r.monto, r.notas], ['pagado', '2026-09-30', '640', 'efectivo']);
  const g = env.tabla('pagos')[0];
  assert.deepStrictEqual([g.estado, g.fecha_pago, g.monto, g.notas], ['pagado', '2026-09-30', '640', 'efectivo']);
  assert.match(await error(env, { action: 'actualizarPago', id: 'p99999999', cambios: {} }), /pago_no_encontrado/);
});

test('archivar marca TRUE y no borra el pago', async () => {
  const { env, alumno } = await preparar();
  const p = await ok(env, { action: 'crearPago', pago: pago(alumno) });
  await ok(env, { action: 'archivarPago', id: p.id });
  assert.deepStrictEqual((await ok(env, { action: 'listarPagos' })).map((x) => x.archivado), ['TRUE']);
});

// ---------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------

test('plantillas: crear, listar y archivar (sin borrar)', async () => {
  const env = crearEntorno({ ahora: '2026-09-24T14:30:00Z' });
  const alumno = await ok(env, { action: 'crearAlumno', alumno: { nombre: 'Katy' } });
  const p = await ok(env, { action: 'crearPlantilla', plantilla: {
    nombre: 'Katy 90', area: 'Academia Fractal', tipo: 'fijo', titulo: '', alumno_id: alumno.id, duracion: 90, lugar: 'Casa'
  } });
  assert.match(p.id, /^t[0-9a-f]{8}$/);
  assert.deepStrictEqual((await ok(env, { action: 'listarPlantillas' })).map((x) => [x.nombre, x.duracion, x.alumno_id, x.lugar]),
    [['Katy 90', '90', alumno.id, 'Casa']]);

  const archivada = await ok(env, { action: 'archivarPlantilla', id: p.id });
  assert.strictEqual(archivada.archivado, 'TRUE');
  assert.strictEqual((await ok(env, { action: 'listarPlantillas' })).length, 0, 'la archivada ya no se lista');
  assert.strictEqual(env.tabla('plantillas').length, 1, 'la fila sigue');
  assert.strictEqual(env.tabla('plantillas')[0].archivado, 'TRUE');
  assert.match(await error(env, { action: 'archivarPlantilla', id: 'tnoexiste' }), /plantilla_no_encontrada/);
});

test('plantillas: validaciones que fallan sin escribir', async () => {
  const env = crearEntorno();
  const base = { nombre: 'X', area: 'Universidad', tipo: 'fijo', titulo: 'Cálculo', duracion: 90 };
  const fallo = (extra) => error(env, { action: 'crearPlantilla', plantilla: Object.assign({}, base, extra) });
  assert.match(await fallo({ nombre: ' ' }), /falta_nombre/);
  assert.match(await fallo({ area: 'Otra' }), /area_invalida/);
  assert.match(await fallo({ tipo: 'clase' }), /tipo_invalido/);
  assert.match(await fallo({ duracion: 0 }), /duracion_invalida/);
  assert.match(await fallo({ duracion: '1h' }), /duracion_invalida/);
  assert.match(await fallo({ titulo: '' }), /falta_titulo/);
  assert.match(await fallo({ area: 'Academia Fractal', titulo: '', alumno_id: 'a99999999' }), /alumno_no_encontrado/);
  assert.strictEqual((await ok(env, { action: 'listarPlantillas' })).length, 0);
});

test('plantillas: fuera de Fractal no guardan alumnos', async () => {
  const env = crearEntorno();
  const alumno = await ok(env, { action: 'crearAlumno', alumno: { nombre: 'Katy' } });
  const p = await ok(env, { action: 'crearPlantilla', plantilla: { nombre: 'U', area: 'Universidad', tipo: 'fijo', titulo: 'Cálculo', duracion: 90, alumno_id: alumno.id } });
  assert.strictEqual(p.alumno_id, '');
  assert.strictEqual(env.tabla('plantillas')[0].alumno_id, '');
});
