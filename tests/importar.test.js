'use strict';

/**
 * Checkpoint 7 — importador de filas pegadas (separadas por tabulación):
 * alumnos y reglas de la hoja Horario. Vista previa sin escribir, filas
 * malas señaladas sin frenar el resto, y sin duplicar.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

function preparar() {
  const env = crearEntorno({ ahora: '2026-09-23T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  return env;
}

function importar(env, modo, filas, aplicar) {
  const texto = filas.map((f) => f.join('\t')).join('\n');
  const r = env.post({ token: 'tk', action: 'importar', modo, texto, aplicar: Boolean(aplicar) });
  assert.ok(r.ok, r.error);
  return r.data;
}

function alumnos(env) {
  return env.post({ token: 'tk', action: 'listarAlumnos' }).data.alumnos;
}

// ---------------------------------------------------------------
// Alumnos
// ---------------------------------------------------------------

const CON_ENCABEZADO = [
  ['Nombre', 'Apellido', 'Colegio', 'Curso', 'Tarifa', 'Forma de pago'], // otro orden: manda el encabezado
  ['Agustín', 'Aliendre', 'SA', '4to', '80', 'mensual'],
  ['Camila', 'Rojas', 'Colegio Poveda', '2do de secundaria', 'Bs 70', 'por hora']
];

test('la vista previa dice qué crea y no escribe nada', () => {
  const env = preparar();
  const r = importar(env, 'alumnos', CON_ENCABEZADO, false);
  assert.strictEqual(r.aplicado, false);
  assert.strictEqual(r.conEncabezado, true);
  assert.deepStrictEqual(r.resumen, { crear: 2, actualizar: 0, sin_cambios: 0, error: 0 });
  assert.deepStrictEqual(r.filas.map((f) => f.detalle), ['Agustín Aliendre — 4to SA', 'Camila Rojas — 2do Poveda']);
  assert.strictEqual(alumnos(env).length, 0);
});

test('aplicar escribe lo que mostró la vista previa, con nombres completos del catálogo', () => {
  const env = preparar();
  importar(env, 'alumnos', CON_ENCABEZADO, true);
  const lista = alumnos(env);
  assert.strictEqual(lista.length, 2);
  const agustin = lista.find((a) => a.nombre === 'Agustín');
  assert.strictEqual(agustin.colegio, 'Unidad Educativa San Agustín');
  assert.strictEqual(agustin.curso, '4to de secundaria');
  assert.strictEqual(agustin.forma_pago, 'mensual');
  assert.strictEqual(agustin.forma_calculo, 'hora');
  assert.strictEqual(lista.find((a) => a.nombre === 'Camila').tarifa_hora, '70');
});

test('sin encabezado se usa el orden por defecto (nombre, apellido, curso, colegio, tarifa, pago, notas)', () => {
  const env = preparar();
  const r = importar(env, 'alumnos', [['Lucía', 'Aliendre', '1er univ', 'UCB', '100', 'hora', 'hermana de Camila']], true);
  assert.strictEqual(r.conEncabezado, false);
  const lucia = alumnos(env)[0];
  assert.deepStrictEqual([lucia.curso, lucia.colegio, lucia.notas],
    ['1er año universidad', 'Universidad Católica Boliviana', 'hermana de Camila']);
});

test('una fila mala se señala y el resto se importa igual', () => {
  const env = preparar();
  const r = importar(env, 'alumnos', [
    ['Nombre', 'Apellido', 'Tarifa', 'Pago'],
    ['Agustín', 'Aliendre', '80', 'mensual'],
    ['', 'SinNombre', '80', 'hora'],
    ['Camila', 'Rojas', 'ochenta', 'hora'],
    ['Tomás', 'Paz', '60', 'anual'],
    ['Ana', 'Vega', '75', '']
  ], true);
  assert.deepStrictEqual(r.filas.map((f) => f.estado), ['crear', 'error', 'error', 'error', 'crear']);
  assert.deepStrictEqual(r.filas.map((f) => f.numero), [2, 3, 4, 5, 6], 'el número de fila es el de lo pegado');
  assert.match(r.filas[1].detalle, /falta el nombre/);
  assert.match(r.filas[2].detalle, /tarifa_invalida/);
  assert.match(r.filas[3].detalle, /forma_pago_invalida/);
  assert.deepStrictEqual(alumnos(env).map((a) => a.nombre).sort(), ['Agustín', 'Ana']);
});

test('no duplica: mismo nombre y apellido (sin importar tildes ni mayúsculas) actualiza o no cambia nada', () => {
  const env = preparar();
  importar(env, 'alumnos', [['Agustín', 'Aliendre', '4to', 'SA', '80', 'mensual']], true);

  const r = importar(env, 'alumnos', [
    ['Nombre', 'Apellido', 'Tarifa'],
    ['AGUSTIN', 'aliendre', '90'], // mismo alumno: cambia la tarifa
    ['Agustín', 'Aliendre', '95'] // repetido dentro de lo pegado
  ], true);
  assert.deepStrictEqual(r.filas.map((f) => f.estado), ['actualizar', 'error']);
  assert.match(r.filas[1].detalle, /repetido: ya está en la fila 2/);

  const lista = alumnos(env);
  assert.strictEqual(lista.length, 1);
  assert.strictEqual(lista[0].tarifa_hora, '90');
  assert.strictEqual(lista[0].colegio, 'Unidad Educativa San Agustín', 'lo que no vino no se borra');

  const igual = importar(env, 'alumnos', [['Agustín', 'Aliendre', '', '', '90']], false);
  assert.strictEqual(igual.filas[0].estado, 'sin_cambios');
});

test('un colegio o curso nuevo se propone para el catálogo en vez de frenar', () => {
  const env = preparar();
  const previa = importar(env, 'alumnos', [['Mateo', 'Luna', '3ro', 'Colegio Alemán', '80', 'hora']], false);
  assert.strictEqual(previa.filas[0].estado, 'crear');
  assert.deepStrictEqual(previa.catalogosNuevos.colegios, [{ nombre: 'Colegio Alemán', corto: 'Colegio Alemán' }]);
  assert.ok(!env.libro.getSheetByName('Colegios').leerTodo().some((f) => f[0] === 'Colegio Alemán'), 'la vista previa no lo agrega');

  importar(env, 'alumnos', [['Mateo', 'Luna', '3ro', 'Colegio Alemán', '80', 'hora']], true);
  assert.ok(env.libro.getSheetByName('Colegios').leerTodo().some((f) => f[0] === 'Colegio Alemán'));
  assert.strictEqual(alumnos(env)[0].colegio, 'Colegio Alemán');
});

// ---------------------------------------------------------------
// Reglas de la hoja Horario
// ---------------------------------------------------------------

function conAlumnos(env) {
  importar(env, 'alumnos', [
    ['Agustín', 'Aliendre', '4to', 'SA', '80', 'mensual'],
    ['Camila', 'Aliendre', '2do', 'SA', '80', 'mensual']
  ], true);
  return alumnos(env);
}

test('reglas: con encabezado de la hoja Horario, alumnos por nombre y fechas/horas en otro formato', () => {
  const env = preparar();
  const lista = conAlumnos(env);
  const r = importar(env, 'horario', [
    ['id', 'título', 'área', 'días', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'archivado', 'alumnos'],
    ['h99999999', 'Cálculo II', 'Universidad', 'Lun, Mié', '9:00', '10:30', '01/09/2026', '15/12/2026', '', '', '', ''],
    ['', '', 'academia fractal', 'Mar', '15:00', '16:00', '2026-09-01', '2026-12-15', '', '', '', 'Agustín Aliendre — 4to SA, camila aliendre']
  ], true);
  assert.deepStrictEqual(r.resumen, { crear: 2, actualizar: 0, sin_cambios: 0, error: 0 });

  const reglas = env.post({ token: 'tk', action: 'listarHorario' }).data;
  assert.strictEqual(reglas.length, 2);
  assert.match(reglas[0].id, /^h[0-9a-f]{8}$/, 'el id siempre lo pone el backend');
  assert.notStrictEqual(reglas[0].id, 'h99999999');
  assert.deepStrictEqual([reglas[0].inicio, reglas[0].desde, reglas[0].hasta], ['09:00', '2026-09-01', '2026-12-15']);
  assert.strictEqual(reglas[1].area, 'Academia Fractal');
  assert.strictEqual(reglas[1].alumno_id, lista.map((a) => a.id).join(','));
});

test('reglas: filas malas se señalan (día, alumno, área) y las buenas se importan', () => {
  const env = preparar();
  conAlumnos(env);
  const r = importar(env, 'horario', [
    ['Física', 'Universidad', 'Lun', '10:00', '11:00', '2026-09-01', '2026-12-15'],
    ['Química', 'Universidad', 'Lunes y Juevez', '10:00', '11:00', '2026-09-01', '2026-12-15'],
    ['', 'Academia Fractal', 'Mar', '15:00', '16:00', '2026-09-01', '2026-12-15', '', '', 'Pedro Nadie'],
    ['Gimnasio', 'Deportes', 'Mar', '18:00', '19:00', '2026-09-01', '2026-12-15'],
    ['Inglés', 'Personal', 'Vie', '19:00', '18:00', '2026-09-01', '2026-12-15']
  ], true);
  assert.deepStrictEqual(r.filas.map((f) => f.estado), ['crear', 'error', 'error', 'error', 'error']);
  assert.match(r.filas[1].detalle, /dia_invalido/);
  assert.match(r.filas[2].detalle, /alumno no encontrado: "Pedro Nadie"/);
  assert.match(r.filas[3].detalle, /área desconocida/);
  assert.match(r.filas[4].detalle, /invertido/);
  assert.strictEqual(env.post({ token: 'tk', action: 'listarHorario' }).data.length, 1);
});

test('reglas: la misma regla dos veces no se duplica; si cambia el fin, se actualiza', () => {
  const env = preparar();
  const fila = ['Física', 'Universidad', 'Lun, Mié', '10:00', '11:00', '2026-09-01', '2026-12-15'];
  importar(env, 'horario', [fila], true);

  const igual = importar(env, 'horario', [fila], true);
  assert.strictEqual(igual.filas[0].estado, 'sin_cambios');

  const otroFin = importar(env, 'horario', [['física', 'Universidad', 'Mié Lun', '10:00', '11:30', '2026-09-01', '2026-12-15']], true);
  assert.strictEqual(otroFin.filas[0].estado, 'actualizar', 'mismos días en otro orden: es la misma regla');

  const reglas = env.post({ token: 'tk', action: 'listarHorario' }).data;
  assert.strictEqual(reglas.length, 1);
  assert.strictEqual(reglas[0].fin, '11:30');
});

test('un modo desconocido falla con un mensaje claro', () => {
  const env = preparar();
  const r = env.post({ token: 'tk', action: 'importar', modo: 'pagos', texto: 'x' });
  assert.match(r.error, /modo_desconocido/);
});
