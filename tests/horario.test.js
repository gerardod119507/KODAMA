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

function idSerie(env, numeroFila) {
  return env.libro.getSheetByName('Horario').leerTodo()[numeroFila || 1][0];
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
  agregarRegla(conTilde, ['', 'Clase', 'Universidad', 'Mié, Sáb', '09:00', '10:00', '2026-09-23', '2026-09-30', '', '']);
  conTilde.llamar('generarHorario()');

  const sinTilde = prepararLibro();
  agregarRegla(sinTilde, ['', 'Clase', 'Universidad', 'Mie, Sab', '09:00', '10:00', '2026-09-23', '2026-09-30', '', '']);
  sinTilde.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(conTilde), ['2026-09-23', '2026-09-26', '2026-09-30']);
  assert.deepStrictEqual(fechasActivasDe(sinTilde), fechasActivasDe(conTilde));
});

test('acepta los 7 días en cualquier caja (mayúsculas/minúsculas)', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Todos', 'Personal', 'lun, MAR, Mié, jue, VIE, sáb, Dom', '08:00', '09:00', '2026-09-23', '2026-09-29', '', '']);
  env.llamar('generarHorario()');

  // 7 días seguidos desde el miércoles 23 → una fecha por día.
  assert.deepStrictEqual(fechasActivasDe(env), [
    '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
    '2026-09-27', '2026-09-28', '2026-09-29'
  ]);
});

test('un día inválido falla con un mensaje que nombra el token y la fila', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Mi clase', 'Universidad', 'Lun, Xyz', '09:00', '10:00', '2026-09-23', '2026-09-30', '', '']);

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
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(env), ['2026-09-24', '2026-10-01']);
});

test('no genera nada fuera del rango, ni un día antes ni un día después', () => {
  const env = prepararLibro();
  // Rango de un solo día (jueves 24). No debe aparecer el jueves 1 de octubre.
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-09-24', '', '']);
  env.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(env), ['2026-09-24']);
});

test('un rango que no contiene ningún día de la regla no genera nada', () => {
  const env = prepararLibro();
  // Jueves 24 a sábado 26, pidiendo solo lunes.
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Lun', '09:00', '10:00', '2026-09-24', '2026-09-26', '', '']);
  const resumen = env.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(env), []);
  assert.strictEqual(resumen.creados, 0);
});

test('"desde" posterior a "hasta" falla con un mensaje claro', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Al revés', 'Universidad', 'Lun', '09:00', '10:00', '2026-10-30', '2026-09-24', '', '']);

  const respuesta = env.post({ token: 'tk', action: 'generarHorario' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /rango_invertido/);
  assert.match(respuesta.error, /Al revés/);
});

test('una fecha mal escrita falla nombrando la fila y el campo', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Mal fechada', 'Universidad', 'Lun', '09:00', '10:00', '23/09/2026', '2026-10-30', '', '']);

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
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Lun', '09:00', '10:00', '2026-09-07', '2026-10-05', '', '']);
  env.llamar('generarHorario()');

  const fechas = fechasActivasDe(env);
  assert.deepStrictEqual(fechas, ['2026-09-28', '2026-10-05']);
  fechas.forEach((f) => assert.ok(f >= HOY, 'ninguna fecha puede ser anterior a hoy: ' + f));
});

test('genera el día de hoy (hoy cuenta como futuro, no como pasado)', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Clase de hoy', 'Universidad', 'Mié', '09:00', '10:00', '2026-09-01', '2026-09-23', '', '']);
  env.llamar('generarHorario()');

  assert.deepStrictEqual(fechasActivasDe(env), [HOY]);
});

test('al regenerar tras editar la regla, solo cambian las fechas futuras', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Mié', '09:00', '10:00', '2026-09-23', '2026-10-14', '', '']);
  env.llamar('generarHorario()');

  // Una ocurrencia pasada de ESTA misma serie, como la habría dejado una
  // corrida anterior hecha antes de que esa fecha quedara en el pasado.
  const serie = idSerie(env);
  env.libro.getSheetByName('Bloques').sembrar(
    Array(env.libro.getSheetByName('Bloques').getLastRow()).fill([]).concat([
      [serie + '-2026-09-16', 'Clase', 'Universidad', 'fijo', '2026-09-16', '09:00', '10:00', 'etiqueta vieja', 'nota vieja', '', '', '']
    ])
  );

  // Se edita la regla: cambia horario, título y área.
  const horario = env.libro.getSheetByName('Horario');
  horario.getRange(2, 2).setValue('Cálculo III');
  horario.getRange(2, 3).setValue('Personal');
  horario.getRange(2, 5).setValue('11:00');
  horario.getRange(2, 6).setValue('12:30');

  env.llamar('generarHorario()');

  const pasada = bloquesDe(env, serie + '-2026-09-16')[0];
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
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Lun, Mié', '09:00', '10:00', '2026-09-23', '2026-10-21', '', '']);

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
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Vie', '09:00', '10:00', '2026-09-25', '2026-10-30', '', '']);

  env.llamar('generarHorario()');
  env.llamar('generarHorario()');
  env.llamar('generarHorario()');

  assert.strictEqual(bloquesDe(env).length, 6, 'seis viernes entre el 25/09 y el 30/10');
});

test('dos reglas distintas no se pisan entre sí', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Cálculo', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  agregarRegla(env, ['', 'Clase Fractal', 'Academia Fractal', 'Jue', '15:00', '16:00', '2026-09-24', '2026-10-01', '', '']);

  env.llamar('generarHorario()');

  const serieA = idSerie(env, 1);
  const serieB = idSerie(env, 2);
  assert.notStrictEqual(serieA, serieB, 'cada regla debe tener su propio id de serie');
  assert.strictEqual(bloquesDe(env, serieA + '-').length, 2);
  assert.strictEqual(bloquesDe(env, serieB + '-').length, 2);
  assert.strictEqual(bloquesDe(env, serieA + '-')[0][COL.area], 'Universidad');
  assert.strictEqual(bloquesDe(env, serieB + '-')[0][COL.area], 'Academia Fractal');
});

// ---------------------------------------------------------------
// Convivencia con lo que edita Gerardo a mano
// ---------------------------------------------------------------

test('no pisa notas ni etiqueta escritas a mano en un bloque ya generado', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Clase', 'Startup', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', 'Nerak', '']);
  env.llamar('generarHorario()');

  const serie = idSerie(env);
  const bloques = env.libro.getSheetByName('Bloques');
  const indiceFila = bloques.leerTodo().findIndex((f) => f[COL.id] === serie + '-2026-09-24');
  bloques.getRange(indiceFila + 1, COL.etiqueta + 1).setValue('Data cocha');
  bloques.getRange(indiceFila + 1, COL.notas + 1).setValue('esta semana en otra sala');

  env.llamar('generarHorario()');

  const fila = bloquesDe(env, serie + '-2026-09-24')[0];
  assert.strictEqual(fila[COL.etiqueta], 'Data cocha');
  assert.strictEqual(fila[COL.notas], 'esta semana en otra sala');
});

test('un bloque archivado a mano no revive al regenerar', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  const serie = idSerie(env);
  const bloques = env.libro.getSheetByName('Bloques');
  const indiceFila = bloques.leerTodo().findIndex((f) => f[COL.id] === serie + '-2026-09-24');
  bloques.getRange(indiceFila + 1, COL.archivado + 1).setValue('TRUE');

  env.llamar('generarHorario()');

  const fila = bloquesDe(env, serie + '-2026-09-24')[0];
  assert.strictEqual(fila[COL.archivado], 'TRUE', 'debe seguir archivado');
});

test('acortar "hasta" archiva las fechas futuras que sobran, sin borrarlas', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-22', '', '']);
  env.llamar('generarHorario()');
  const serie = idSerie(env);
  const totalInicial = bloquesDe(env, serie + '-').length;

  env.libro.getSheetByName('Horario').getRange(2, 8).setValue('2026-10-01');
  const resumen = env.llamar('generarHorario()');

  assert.strictEqual(bloquesDe(env, serie + '-').length, totalInicial, 'no se borra ninguna fila');
  assert.deepStrictEqual(fechasActivasDe(env, serie + '-'), ['2026-09-24', '2026-10-01']);
  assert.strictEqual(resumen.archivados, totalInicial - 2);
});

test('no toca bloques que no vienen del generador', () => {
  const env = prepararLibro();
  const bloques = env.libro.getSheetByName('Bloques');
  bloques.sembrar([[], ['manual-1', 'Reunión imprevista', 'Startup', 'reunión', '2026-09-24', '11:00', '11:30', '', 'mi nota', '', '', '']]);
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);

  env.llamar('generarHorario()');

  const manual = bloquesDe(env, 'manual-1')[0];
  assert.deepStrictEqual(manual, [
    'manual-1', 'Reunión imprevista', 'Startup', 'reunión', '2026-09-24',
    '11:00', '11:30', '', 'mi nota', '', '', '', '', ''
  ]);
});

test('una fila de Horario sin título se ignora sin romper', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', '', '', '', '', '', '', '', '', '']);
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-09-24', '', '']);

  const resumen = env.llamar('generarHorario()');
  assert.strictEqual(resumen.creados, 1);
});

// ---------------------------------------------------------------
// Bug 1: id de serie automático y estable
// ---------------------------------------------------------------

test('una fila de Horario sin id recibe uno automático con forma de id de serie', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  assert.match(idSerie(env), /^h[0-9a-f]{8}$/);
});

test('un id basura en la columna id se reemplaza por uno válido', () => {
  const env = prepararLibro();
  // Exactamente lo que pasó: quedó el texto del ejemplo de la doc en la celda.
  agregarRegla(env, ['(vacío)', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  const serie = idSerie(env);
  assert.match(serie, /^h[0-9a-f]{8}$/, 'el id basura debe reemplazarse');

  const ids = bloquesDe(env).map((f) => f[COL.id]);
  assert.strictEqual(ids.length, 2);
  ids.forEach((id) => {
    assert.ok(id.indexOf('(vacío)') === -1, 'ningún bloque puede tener el id basura: ' + id);
    assert.strictEqual(id.indexOf(serie + '-'), 0);
  });
});

test('el id de serie es estable: no cambia al regenerar', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);

  env.llamar('generarHorario()');
  const primero = idSerie(env);

  env.llamar('generarHorario()');
  env.llamar('generarHorario()');

  assert.strictEqual(idSerie(env), primero, 'el id no puede regenerarse en cada corrida');
  assert.strictEqual(bloquesDe(env).length, 2, 'tampoco puede duplicar bloques con ids nuevos');
});

test('dos reglas nunca reciben el mismo id de serie', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'A', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  agregarRegla(env, ['', 'B', 'Startup', 'Vie', '09:00', '10:00', '2026-09-25', '2026-10-02', '', '']);
  agregarRegla(env, ['', 'C', 'Personal', 'Lun', '09:00', '10:00', '2026-09-28', '2026-10-05', '', '']);
  env.llamar('generarHorario()');

  const ids = [idSerie(env, 1), idSerie(env, 2), idSerie(env, 3)];
  assert.strictEqual(new Set(ids).size, 3);
});

// ---------------------------------------------------------------
// Bug 2: limpiar los bloques de una serie
// ---------------------------------------------------------------

test('listarSeries muestra las series con su título y cuántos bloques tienen', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Cálculo II', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  const series = env.llamar('listarSeries()');
  assert.strictEqual(series.length, 1);
  assert.strictEqual(series[0].idSerie, idSerie(env));
  assert.strictEqual(series[0].titulo, 'Cálculo II');
  assert.strictEqual(series[0].cantidad, 2);
});

test('listarSeries también muestra series huérfanas, como las de prueba con id basura', () => {
  const env = prepararLibro();
  env.libro.getSheetByName('Bloques').sembrar([[],
    ['(vacío)-2026-09-24', 'Vieja', 'Universidad', 'fijo', '2026-09-24', '09:00', '10:00', '', '', '', '', ''],
    ['(vacío)-2026-10-01', 'Vieja', 'Universidad', 'fijo', '2026-10-01', '09:00', '10:00', '', '', '', '', '']
  ]);

  const series = env.llamar('listarSeries()');
  assert.strictEqual(series.length, 1);
  assert.strictEqual(series[0].idSerie, '(vacío)');
  assert.strictEqual(series[0].cantidad, 2);
  assert.strictEqual(series[0].titulo, '', 'no hay fila de Horario que le corresponda');
});

test('borrarSerie elimina solo los bloques de esa serie', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Se queda', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  agregarRegla(env, ['', 'Se borra', 'Startup', 'Vie', '09:00', '10:00', '2026-09-25', '2026-10-02', '', '']);
  env.llamar('generarHorario()');

  const serieQueda = idSerie(env, 1);
  const serieBorra = idSerie(env, 2);
  env.__idSerie = serieBorra;
  const resultado = env.llamar('borrarSerie(__arg)', serieBorra);

  assert.strictEqual(resultado.borrados, 2);
  assert.strictEqual(bloquesDe(env, serieBorra + '-').length, 0, 'no debe quedar ninguna');
  assert.strictEqual(bloquesDe(env, serieQueda + '-').length, 2, 'la otra serie queda intacta');
});

test('borrarSerie no toca bloques que no son de una serie', () => {
  const env = prepararLibro();
  env.libro.getSheetByName('Bloques').sembrar([[],
    ['manual-1', 'Reunión suelta', 'Startup', 'reunión', '2026-09-24', '11:00', '11:30', '', 'mi nota', '', '', '']
  ]);
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  env.llamar('borrarSerie(__arg)', idSerie(env));

  assert.strictEqual(bloquesDe(env, 'manual-1').length, 1, 'la reunión suelta no se toca');
  assert.strictEqual(bloquesDe(env).length, 1, 'solo queda la reunión suelta');
});

test('borrarSerie borra también los bloques archivados de esa serie', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  const serie = idSerie(env);
  const bloques = env.libro.getSheetByName('Bloques');
  const indiceFila = bloques.leerTodo().findIndex((f) => f[COL.id] === serie + '-2026-09-24');
  bloques.getRange(indiceFila + 1, COL.archivado + 1).setValue('TRUE');

  const resultado = env.llamar('borrarSerie(__arg)', serie);
  assert.strictEqual(resultado.borrados, 2);
  assert.strictEqual(bloquesDe(env).length, 0);
});

test('borrarSerie con una serie que no existe no borra nada', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  const resultado = env.llamar('borrarSerie(__arg)', 'hdeadbeef');
  assert.strictEqual(resultado.borrados, 0);
  assert.strictEqual(bloquesDe(env).length, 2);
});

test('borrarSerie sin id falla en vez de borrar todo', () => {
  const env = prepararLibro({});
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');

  const respuesta = env.post({ token: 'tk', action: 'borrarSerie' });
  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /falta_id_serie/);
  assert.strictEqual(bloquesDe(env).length, 2, 'no puede haber borrado nada');
});

test('tras borrar una serie, regenerar la vuelve a crear con el mismo id', () => {
  const env = prepararLibro();
  agregarRegla(env, ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '']);
  env.llamar('generarHorario()');
  const serie = idSerie(env);

  env.llamar('borrarSerie(__arg)', serie);
  assert.strictEqual(bloquesDe(env).length, 0);

  const resumen = env.llamar('generarHorario()');
  assert.strictEqual(resumen.creados, 2);
  assert.strictEqual(idSerie(env), serie, 'la regla conserva su id');
});
