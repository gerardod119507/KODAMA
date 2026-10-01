'use strict';

/**
 * Alumnos fijos de Fractal y materias: borrar un horario fijo (solo sus
 * clases de hoy en adelante, nunca las pasadas ni las dictadas), borrar
 * una clase suelta, listar las clases sueltas de Fractal marcadas "fijo",
 * y guardar un horario regenerando en la misma petición.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

// Jueves 1 de octubre de 2026.
function preparar() {
  const env = crearEntorno({ ahora: '2026-10-01T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  const katy = ok(env, { action: 'crearAlumno', alumno: { nombre: 'Katy', tarifa_hora: '70', forma_pago: 'mensual' } });
  return { env, katy };
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

const filas = (env) => env.libro.getSheetByName('Bloques').leerTodo().slice(1).filter((f) => f[0]);
const ids = (env) => filas(env).map((f) => f[0]);

function fijoDeKaty(env, katy, extra) {
  return ok(env, { action: 'crearRegla', regenerar: true, regla: Object.assign({
    titulo: '', area: 'Academia Fractal', dias: 'Mar, Jue', inicio: '15:00', fin: '16:30',
    desde: '2026-10-01', hasta: '2026-10-31', alumno_id: katy.id, lugar: 'Casa', etiqueta: '', notas: ''
  }, extra || {}) });
}

test('guardar con regenerar: en una sola petición queda la regla y sus clases', () => {
  const { env, katy } = preparar();
  const regla = fijoDeKaty(env, katy);
  assert.deepStrictEqual(regla.generado, { creados: 9, actualizados: 0, archivados: 0 }, 'mar y jue de octubre desde hoy');
  assert.strictEqual(ids(env).filter((id) => id.startsWith(regla.id + '-')).length, 9);

  const editada = ok(env, { action: 'actualizarRegla', id: regla.id, regenerar: true, cambios: { inicio: '17:00', fin: '18:30' } });
  assert.strictEqual(editada.generado.actualizados, 9);
  assert.ok(filas(env).every((f) => f[5] === '17:00'), 'las clases se movieron con la regla');
});

test('sin regenerar, guardar no toca Bloques (como antes)', () => {
  const { env, katy } = preparar();
  const regla = ok(env, { action: 'crearRegla', regla: {
    titulo: '', area: 'Academia Fractal', dias: 'Mar', inicio: '15:00', fin: '16:00',
    desde: '2026-10-01', hasta: '2026-10-31', alumno_id: katy.id
  } });
  assert.strictEqual(regla.generado, undefined);
  assert.strictEqual(filas(env).length, 0);
});

test('borrar un fijo: se va la regla y sus clases futuras; las pasadas y las dictadas quedan', () => {
  const { env, katy } = preparar();
  const regla = fijoDeKaty(env, katy);
  // Una clase de antes (de cuando se generó el mes pasado) y hoy ya dictada.
  const hoja = env.libro.getSheetByName('Bloques');
  const vieja = filas(env)[0].slice();
  vieja[0] = regla.id + '-2026-09-29';
  vieja[4] = '2026-09-29';
  hoja.appendRow(vieja);
  ok(env, { action: 'cambiarEstadoBloque', id: regla.id + '-2026-10-01', estado: 'dictada' });
  const otra = ok(env, { action: 'crearBloque', bloque: { titulo: 'Física', area: 'Universidad', tipo: 'fijo', fecha: '2026-10-06', inicio: '08:00', fin: '09:30' } });

  const r = ok(env, { action: 'borrarRegla', id: regla.id });
  assert.deepStrictEqual(r, { borradas: 8, quedan: 2 });
  assert.deepStrictEqual(ids(env).sort(), [otra.id, regla.id + '-2026-09-29', regla.id + '-2026-10-01'].sort());
  assert.strictEqual(ok(env, { action: 'listarHorario' }).length, 0, 'la regla ya no está en Horario');
  assert.match(error(env, { action: 'borrarRegla', id: regla.id }), /regla_no_encontrada/);

  // Regenerar después no revive nada.
  assert.deepStrictEqual(ok(env, { action: 'generarHorario' }), { creados: 0, actualizados: 0, archivados: 0 });
});

test('borrar un fijo no toca los de otros alumnos', () => {
  const { env, katy } = preparar();
  const a = fijoDeKaty(env, katy);
  const b = fijoDeKaty(env, katy, { dias: 'Vie' });
  ok(env, { action: 'borrarRegla', id: a.id });
  assert.ok(ids(env).length > 0 && ids(env).every((id) => id.startsWith(b.id + '-')));
});

test('archivar una materia con regenerar archiva sus clases futuras en la misma petición', () => {
  const { env } = preparar();
  const materia = ok(env, { action: 'crearRegla', regenerar: true, regla: {
    titulo: 'Cálculo II', area: 'Universidad', dias: 'Lun, Mié', inicio: '09:00', fin: '10:30',
    desde: '2026-08-01', hasta: '2026-10-31', lugar: 'Aula E511'
  } });
  const r = ok(env, { action: 'archivarRegla', id: materia.id, regenerar: true });
  assert.strictEqual(r.archivado, 'TRUE');
  assert.strictEqual(r.generado.archivados, materia.generado.creados);
});

test('clases sueltas de Fractal marcadas "fijo": solo esas, de hoy en adelante', () => {
  const { env, katy } = preparar();
  const crear = (extra) => ok(env, { action: 'crearBloque', bloque: Object.assign({
    titulo: '', area: 'Academia Fractal', tipo: 'fijo', fecha: '2026-10-08', inicio: '15:00', fin: '16:00', alumno_id: katy.id
  }, extra) });
  const buena = crear({});
  const temprana = crear({ fecha: '2026-10-02', inicio: '09:00', fin: '10:00' });
  crear({ tipo: 'variable' });
  crear({ fecha: '2026-09-30' }); // pasada
  ok(env, { action: 'archivarBloque', id: crear({}).id });
  ok(env, { action: 'crearBloque', bloque: { titulo: 'Física', area: 'Universidad', tipo: 'fijo', fecha: '2026-10-08', inicio: '08:00', fin: '09:00' } });
  fijoDeKaty(env, katy); // de un horario fijo: no es suelta

  assert.deepStrictEqual(ok(env, { action: 'listarFijosSueltos' }).map((b) => b.id), [temprana.id, buena.id]);

  // Pasarla a variable ya existe: "Editar" con tipo.
  ok(env, { action: 'actualizarBloque', id: buena.id, cambios: { tipo: 'variable' } });
  assert.deepStrictEqual(ok(env, { action: 'listarFijosSueltos' }).map((b) => b.id), [temprana.id]);
});

test('borrar una clase suelta; nunca una de un horario fijo ni una dictada', () => {
  const { env, katy } = preparar();
  const suelta = ok(env, { action: 'crearBloque', bloque: {
    titulo: '', area: 'Academia Fractal', tipo: 'fijo', fecha: '2026-10-08', inicio: '15:00', fin: '16:00', alumno_id: katy.id
  } });
  const regla = fijoDeKaty(env, katy);
  const deRegla = regla.id + '-2026-10-06';

  assert.match(error(env, { action: 'borrarBloque', id: deRegla }), /^bloque_de_horario_fijo: .*bórrala desde Horario/);
  ok(env, { action: 'cambiarEstadoBloque', id: suelta.id, estado: 'dictada' });
  assert.match(error(env, { action: 'borrarBloque', id: suelta.id }), /^bloque_dictado: /);
  ok(env, { action: 'cambiarEstadoBloque', id: suelta.id, estado: 'programada' });

  assert.deepStrictEqual(ok(env, { action: 'borrarBloque', id: suelta.id }), { borrado: suelta.id });
  assert.ok(!ids(env).includes(suelta.id));
  assert.ok(ids(env).includes(deRegla));
  assert.match(error(env, { action: 'borrarBloque', id: suelta.id }), /bloque_no_encontrado/);
});

test('las acciones nuevas exigen token', () => {
  const { env } = preparar();
  ['borrarRegla', 'borrarBloque', 'listarFijosSueltos'].forEach((action) => {
    assert.deepStrictEqual(env.post({ token: 'otro', action, id: 'x' }), { ok: false, error: 'no_autorizado' });
  });
});
