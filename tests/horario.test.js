'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

const COL = {
  id: 0, titulo: 1, area: 2, tipo: 3, fecha: 4, inicio: 5, fin: 6,
  etiqueta: 7, notas: 8, creado: 9, actualizado: 10, archivado: 11
};

// Días reales de referencia (verificados contra el calendario):
// 2026-09-21 lunes · 22 martes · 23 miércoles · 24 jueves · 25 viernes
// 26 sábado · 27 domingo.
const HOY = '2026-09-23'; // miércoles
const AHORA = '2026-09-23T14:30:00Z';

function prepararLibro(opciones) {
  const env = crearEntorno({ ahora: (opciones && opciones.ahora) || AHORA, token: 'tk' });
  env.llamar('asegurarEstructura()');
  return env;
}

function agregarRegla(env, fila) {
  const horario = env.libro.getSheetByName('Horario');
  const siguiente = horario.getLastRow();
  horario.sembrar(Array(siguiente).fill([]).concat([fila]));
  return env;
}

function bloquesDe(env, prefijoId) {
  return env.libro.getSheetByName('Bloques').leerTodo()
    .slice(1)
    .filter((f) => f[COL.id] && (!prefijoId || f[COL.id].indexOf(prefijoId) === 0));
}

function fechasActivasDe(env, prefijoId) {
  return bloquesDe(env, prefijoId)
    .filter((f) => f[COL.archivado] !== 'TRUE')
    .map((f) => f[COL.fecha])
    .sort();
}

// ---------------------------------------------------------------
// 1. Expansión de días a fechas
// ---------------------------------------------------------------

test('expande "Lun, Mié" a exactamente los lunes y miércoles del rango', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Cálculo II', 'Universidad', 'Lun, Mié', '09:00', '10:30', '2026-09-23', '2026-10-07', '', '']);

  const resumen = env.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(env), [
    '2026-09-23', // miércoles
    '2026-09-28', // lunes
    '2026-09-30', // miércoles
    '2026-10-05', // lunes
    '2026-10-07'  // miércoles
  ]);
  assert.strictEqual(resumen.creados, 5);
  assert.strictEqual(resumen.actualizados, 0);
});

test('cada bloque generado es tipo "fijo" y su id apunta a la fila de Horario', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Cálculo II', 'Universidad', 'Jue', '09:00', '10:30', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  const idRegla = env.libro.getSheetByName('Horario').leerTodo()[1][0];
  assert.ok(idRegla, 'la regla debe recibir un id automático');

  const filas = bloquesDe(env);
  assert.strictEqual(filas.length, 2);
  filas.forEach((fila) => {
    assert.strictEqual(fila[COL.tipo], 'fijo');
    assert.strictEqual(fila[COL.id], idRegla + '-' + fila[COL.fecha]);
    assert.strictEqual(fila[COL.titulo], 'Cálculo II');
    assert.strictEqual(fila[COL.area], 'Universidad');
    assert.strictEqual(fila[COL.inicio], '09:00');
  });
});

test('la etiqueta de la regla se copia al bloque al crearlo', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Standup', 'Startup', 'Jue', '09:00', '09:15', '2026-09-24', '2026-09-24', 'Nerak', '']);
  env.llamar('generarHorario()');

  assert.strictEqual(bloquesDe(env)[0][COL.etiqueta], 'Nerak');
});

// ---------------------------------------------------------------
// 2. Días con y sin tilde
// ---------------------------------------------------------------

test('acepta días con tilde y sin tilde, y da el mismo resultado', () => {
  const conTilde = prepararLibro();
  agregarRegla(conTilde, ['r1', 'Clase', 'Universidad', 'Mié, Sáb', '09:00', '10:00', '2026-09-23', '2026-09-30', '', '']);
  conTilde.llamar('generarHorario()');

  const sinTilde = prepararLibro();
  agregarRegla(sinTilde, ['r1', 'Clase', 'Universidad', 'Mie, Sab', '09:00', '10:00', '2026-09-23', '2026-09-30', '', '']);
  sinTilde.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(conTilde), ['2026-09-23', '2026-09-26', '2026-09-30']);
  assert.deepStrictEqual(fechasActivasDe(sinTilde), fechasActivasDe(conTilde));
});

test('acepta los 7 días en cualquier caja (mayúsculas/minúsculas)', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Todos', 'Personal', 'lun, MAR, Mié, jue, VIE, sáb, Dom', '08:00', '09:00', '2026-09-23', '2026-09-29', '', '']);
  env.llamar('generarHorario()');

  // 7 días seguidos desde el miércoles 23 → una fecha por día.
  assert.deepStrictEqual(fechasActivasDe(env), [
    '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
    '2026-09-27', '2026-09-28', '2026-09-29'
  ]);
});

test('un día inválido falla con un mensaje que nombra el token y la fila', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Mi clase', 'Universidad', 'Lun, Xyz', '09:00', '10:00', '2026-09-23', '2026-09-30', '', '']);

  const respuesta = env.post({ token: 'tk', action: 'generarHorario' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /Xyz/);
  assert.match(respuesta.error, /Mi clase/);
});

// ---------------------------------------------------------------
// 3. Límites de "desde" y "hasta"
// ---------------------------------------------------------------

test('"desde" y "hasta" son inclusivos cuando caen en un día de la regla', () => {
  const env = prepararLibro();
  // 2026-09-24 es jueves y 2026-10-01 también: ambos extremos deben entrar.
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(env), ['2026-09-24', '2026-10-01']);
});

test('no genera nada fuera del rango, ni un día antes ni un día después', () => {
  const env = prepararLibro();
  // Rango de un solo día (jueves 24). No debe aparecer el jueves 1 de octubre.
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-09-24', '', '']);
  env.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(env), ['2026-09-24']);
});

test('un rango que no contiene ningún día de la regla no genera nada', () => {
  const env = prepararLibro();
  // Jueves 24 a sábado 26, pidiendo solo lunes.
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Lun', '09:00', '10:00', '2026-09-24', '2026-09-26', '', '']);
  const resumen = env.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(env), []);
  assert.strictEqual(resumen.creados, 0);
});

test('"desde" posterior a "hasta" falla con un mensaje claro', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Al revés', 'Universidad', 'Lun', '09:00', '10:00', '2026-10-30', '2026-09-24', '', '']);

  const respuesta = env.post({ token: 'tk', action: 'generarHorario' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /rango_invertido/);
  assert.match(respuesta.error, /Al revés/);
});

test('una fecha mal escrita falla nombrando la fila y el campo', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Mal fechada', 'Universidad', 'Lun', '09:00', '10:00', '23/09/2026', '2026-10-30', '', '']);

  const respuesta = env.post({ token: 'tk', action: 'generarHorario' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /fecha_invalida/);
  assert.match(respuesta.error, /desde/);
});

// ---------------------------------------------------------------
// 4. Respeto del pasado
// ---------------------------------------------------------------

test('no genera fechas anteriores a hoy aunque "desde" sea del pasado', () => {
  const env = prepararLibro();
  // El rango arranca el lunes 2026-09-07, dos semanas antes de "hoy".
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Lun', '09:00', '10:00', '2026-09-07', '2026-10-05', '', '']);
  env.llamar('generarHorario()');

  const fechas = fechasActivasDe(env);
  assert.deepStrictEqual(fechas, ['2026-09-28', '2026-10-05']);
  fechas.forEach((f) => assert.ok(f >= HOY, 'ninguna fecha puede ser anterior a hoy: ' + f));
});

test('genera el día de hoy (hoy cuenta como futuro, no como pasado)', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Clase de hoy', 'Universidad', 'Mié', '09:00', '10:00', '2026-09-01', '2026-09-23', '', '']);
  env.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(env), [HOY]);
});

test('al regenerar tras editar la regla, solo cambian las fechas futuras', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Mié', '09:00', '10:00', '2026-09-23', '2026-10-14', '', '']);
  env.llamar('generarHorario()');

  // Una ocurrencia pasada, como la habría dejado una corrida anterior.
  env.libro.getSheetByName('Bloques').sembrar(
    Array(env.libro.getSheetByName('Bloques').getLastRow()).fill([]).concat([
      ['r1-2026-09-16', 'Clase', 'Universidad', 'fijo', '2026-09-16', '09:00', '10:00', 'etiqueta vieja', 'nota vieja', '', '', '']
    ])
  );

  // Se edita la regla: cambia horario, título y área.
  const horario = env.libro.getSheetByName('Horario');
  horario.getRange(2, 2).setValue('Cálculo III');
  horario.getRange(2, 3).setValue('Personal');
  horario.getRange(2, 5).setValue('11:00');
  horario.getRange(2, 6).setValue('12:30');

  env.llamar('generarHorario()');

  const pasada = bloquesDe(env, 'r1-2026-09-16')[0];
  assert.deepStrictEqual(
    [pasada[COL.titulo], pasada[COL.area], pasada[COL.inicio], pasada[COL.fin], pasada[COL.notas]],
    ['Clase', 'Universidad', '09:00', '10:00', 'nota vieja'],
    'la ocurrencia pasada no se toca en absoluto'
  );

  bloquesDe(env).filter((f) => f[COL.fecha] >= HOY).forEach((fila) => {
    assert.strictEqual(fila[COL.titulo], 'Cálculo III');
    assert.strictEqual(fila[COL.area], 'Personal');
    assert.strictEqual(fila[COL.inicio], '11:00');
    assert.strictEqual(fila[COL.fin], '12:30');
  });
});

// ---------------------------------------------------------------
// 5. Idempotencia
// ---------------------------------------------------------------

test('correr el generador dos veces no duplica ninguna fila', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Lun, Mié', '09:00', '10:00', '2026-09-23', '2026-10-21', '', '']);

  const primera = env.llamar('generarHorario()');
  const filasTrasPrimera = bloquesDe(env).map((f) => f[COL.id]).sort();

  const segunda = env.llamar('generarHorario()');
  const filasTrasSegunda = bloquesDe(env).map((f) => f[COL.id]).sort();

  assert.deepStrictEqual(filasTrasSegunda, filasTrasPrimera, 'los ids deben ser exactamente los mismos');
  assert.strictEqual(segunda.creados, 0, 'la segunda corrida no crea nada');
  assert.strictEqual(segunda.actualizados, primera.creados);
  const idsUnicos = new Set(filasTrasSegunda);
  assert.strictEqual(idsUnicos.size, filasTrasSegunda.length, 'no puede haber ids repetidos');
});

test('correr el generador tres veces sigue sin duplicar', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Vie', '09:00', '10:00', '2026-09-25', '2026-10-30', '', '']);

  env.llamar('generarHorario()');
  env.llamar('generarHorario()');
  env.llamar('generarHorario()');

  assert.strictEqual(bloquesDe(env).length, 6, 'seis viernes entre el 25/09 y el 30/10');
});

test('dos reglas distintas no se pisan entre sí', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Cálculo', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  agregarRegla(env, ['r2', 'Clase Fractal', 'Academia Fractal', 'Jue', '15:00', '16:00', '2026-09-24', '2026-10-01', '', '']);

  env.llamar('generarHorario()');

  assert.strictEqual(bloquesDe(env, 'r1-').length, 2);
  assert.strictEqual(bloquesDe(env, 'r2-').length, 2);
  assert.strictEqual(bloquesDe(env, 'r1-')[0][COL.area], 'Universidad');
  assert.strictEqual(bloquesDe(env, 'r2-')[0][COL.area], 'Academia Fractal');
});

// ---------------------------------------------------------------
// Convivencia con lo que edita Gerardo a mano
// ---------------------------------------------------------------

test('no pisa notas ni etiqueta escritas a mano en un bloque ya generado', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Clase', 'Startup', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', 'Nerak', '']);
  env.llamar('generarHorario()');

  const bloques = env.libro.getSheetByName('Bloques');
  const indiceFila = bloques.leerTodo().findIndex((f) => f[COL.id] === 'r1-2026-09-24');
  bloques.getRange(indiceFila + 1, COL.etiqueta + 1).setValue('Data cocha');
  bloques.getRange(indiceFila + 1, COL.notas + 1).setValue('esta semana en otra sala');

  env.llamar('generarHorario()');

  const fila = bloquesDe(env, 'r1-2026-09-24')[0];
  assert.strictEqual(fila[COL.etiqueta], 'Data cocha');
  assert.strictEqual(fila[COL.notas], 'esta semana en otra sala');
});

test('un bloque archivado a mano no revive al regenerar', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  const bloques = env.libro.getSheetByName('Bloques');
  const indiceFila = bloques.leerTodo().findIndex((f) => f[COL.id] === 'r1-2026-09-24');
  bloques.getRange(indiceFila + 1, COL.archivado + 1).setValue('TRUE');

  env.llamar('generarHorario()');

  const fila = bloquesDe(env, 'r1-2026-09-24')[0];
  assert.strictEqual(fila[COL.archivado], 'TRUE', 'debe seguir archivado');
});

test('acortar "hasta" archiva las fechas futuras que sobran, sin borrarlas', () => {
  const env = prepararLibro();
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-22', '', '']);
  env.llamar('generarHorario()');
  const totalInicial = bloquesDe(env, 'r1-').length;

  env.libro.getSheetByName('Horario').getRange(2, 8).setValue('2026-10-01');
  const resumen = env.llamar('generarHorario()');

  assert.strictEqual(bloquesDe(env, 'r1-').length, totalInicial, 'no se borra ninguna fila');
  assert.deepStrictEqual(fechasActivasDe(env, 'r1-'), ['2026-09-24', '2026-10-01']);
  assert.strictEqual(resumen.archivados, totalInicial - 2);
});

test('no toca bloques que no vienen del generador', () => {
  const env = prepararLibro();
  const bloques = env.libro.getSheetByName('Bloques');
  bloques.sembrar([[], ['manual-1', 'Reunión imprevista', 'Startup', 'reunión', '2026-09-24', '11:00', '11:30', '', 'mi nota', '', '', '']]);
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);

  env.llamar('generarHorario()');

  const manual = bloquesDe(env, 'manual-1')[0];
  assert.deepStrictEqual(manual, [
    'manual-1', 'Reunión imprevista', 'Startup', 'reunión', '2026-09-24',
    '11:00', '11:30', '', 'mi nota', '', '', ''
  ]);
});

test('una fila de Horario sin título se ignora sin romper', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', '', '', '', '', '', '', '', '', '']);
  agregarRegla(env, ['r1', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-09-24', '', '']);

  const resumen = env.llamar('generarHorario()');
  assert.strictEqual(resumen.creados, 1);
});
