'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

const ENCABEZADOS_BLOQUES = [
  'id', 'título', 'área', 'tipo', 'fecha', 'inicio', 'fin',
  'etiqueta', 'notas', 'creado', 'actualizado', 'archivado', 'alumno_id', 'lugar',
  'estado', 'fecha_original', 'inicio_original', 'fin_original', 'motivo'
];
const ENCABEZADOS_HORARIO = [
  'id', 'título', 'área', 'días', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'archivado', 'alumno_id', 'lugar'
];
const HOJAS = ['Alumnos', 'Areas', 'Bloques', 'Colegios', 'Cursos', 'Horario', 'Pagos', 'Plantillas'];

// Esta es la prueba de regresión del fallo del Checkpoint 4: la hoja
// Horario no se creaba en el Sheet real.
test('asegurarEstructura crea todas las hojas en un libro vacío', () => {
  const env = crearEntorno({});
  env.llamar('asegurarEstructura()');

  const nombres = env.libro.nombresDeHojas().sort();
  assert.deepStrictEqual(nombres, HOJAS);
});

test('cada hoja se crea con sus encabezados exactos', () => {
  const env = crearEntorno({});
  env.llamar('asegurarEstructura()');

  assert.deepStrictEqual(
    env.libro.getSheetByName('Bloques').leerTodo()[0],
    ENCABEZADOS_BLOQUES
  );
  assert.deepStrictEqual(
    env.libro.getSheetByName('Horario').leerTodo()[0],
    ENCABEZADOS_HORARIO
  );
  assert.deepStrictEqual(
    env.libro.getSheetByName('Areas').leerTodo()[0],
    ['nombre', 'color']
  );
});

test('Areas arranca con las 4 áreas y sus colores', () => {
  const env = crearEntorno({});
  env.llamar('asegurarEstructura()');

  const filas = env.libro.getSheetByName('Areas').leerTodo().slice(1);
  assert.deepStrictEqual(filas, [
    ['Universidad', '#245A8D'],
    ['Academia Fractal', '#8A5A00'],
    ['Startup', '#6650A4'],
    ['Personal', '#476A54']
  ]);
});

test('las columnas de fecha y hora quedan en formato TEXTO', () => {
  const env = crearEntorno({});
  env.llamar('asegurarEstructura()');

  const bloques = env.libro.getSheetByName('Bloques');
  // fila 2 (índice 1), columnas fecha/inicio/fin de Bloques.
  ['fecha', 'inicio', 'fin'].forEach((columna) => {
    const indice = ENCABEZADOS_BLOQUES.indexOf(columna);
    assert.strictEqual(
      bloques.formatos['1,' + indice], '@',
      'Bloques.' + columna + ' debe estar en formato texto'
    );
  });

  const horario = env.libro.getSheetByName('Horario');
  ['inicio', 'fin', 'desde', 'hasta'].forEach((columna) => {
    const indice = ENCABEZADOS_HORARIO.indexOf(columna);
    assert.strictEqual(
      horario.formatos['1,' + indice], '@',
      'Horario.' + columna + ' debe estar en formato texto'
    );
  });
});

test('la estructura se asegura en CUALQUIER POST autorizado, no en una acción especial', () => {
  const env = crearEntorno({ token: 'token-bueno' });
  assert.deepStrictEqual(env.libro.nombresDeHojas(), []);

  const respuesta = env.post({ token: 'token-bueno', action: 'ping' });

  assert.strictEqual(respuesta.ok, true);
  assert.deepStrictEqual(env.libro.nombresDeHojas().sort(), HOJAS);
});

test('un POST sin token válido no crea ninguna hoja', () => {
  const env = crearEntorno({ token: 'token-bueno' });
  const respuesta = env.post({ token: 'token-malo', action: 'ping' });

  assert.strictEqual(respuesta.ok, false);
  assert.strictEqual(respuesta.error, 'no_autorizado');
  assert.deepStrictEqual(env.libro.nombresDeHojas(), []);
});

test('asegurarEstructura es idempotente: correrla de nuevo no duplica ni pisa', () => {
  const env = crearEntorno({});
  env.llamar('asegurarEstructura()');

  const bloques = env.libro.getSheetByName('Bloques');
  bloques.sembrar([[], ['b1', 'Clase mía', 'Universidad', 'fijo', '2026-10-01', '09:00', '10:00', '', 'nota', '', '', '']]);

  env.llamar('asegurarEstructura()');
  env.llamar('asegurarEstructura()');

  assert.strictEqual(env.libro.getSheetByName('Areas').getLastRow(), 5);
  assert.deepStrictEqual(
    bloques.leerTodo()[1],
    ['b1', 'Clase mía', 'Universidad', 'fijo', '2026-10-01', '09:00', '10:00', '', 'nota', '', '', '', '', '',
      '', '', '', '', '']
  );
});

test('fija la zona horaria del libro en America/La_Paz', () => {
  const env = crearEntorno({});
  env.llamar('asegurarEstructura()');
  assert.strictEqual(env.libro.getSpreadsheetTimeZone(), 'America/La_Paz');
});

test('migra una hoja Bloques vieja (sin "etiqueta") sin corromper los datos', () => {
  const env = crearEntorno({});
  const bloques = env.libro.insertSheet('Bloques');
  // Esquema anterior al Checkpoint 4: 11 columnas, sin "etiqueta".
  bloques.sembrar([
    ['id', 'título', 'área', 'tipo', 'fecha', 'inicio', 'fin', 'notas', 'creado', 'actualizado', 'archivado'],
    ['b1', 'Cálculo II', 'Universidad', 'fijo', '2026-09-22', '09:00', '10:30', 'mi nota', '2026-09-01 08:00', '2026-09-01 08:00', ''],
    ['b2', 'Gimnasio', 'Personal', 'variable', '2026-09-22', '18:00', '19:00', '', '2026-09-01 08:00', '2026-09-01 08:00', 'TRUE']
  ]);

  env.llamar('asegurarEstructura()');

  const filas = bloques.leerTodo();
  assert.deepStrictEqual(filas[0], ENCABEZADOS_BLOQUES, 'el encabezado debe quedar con etiqueta antes de notas');
  assert.deepStrictEqual(
    filas[1],
    ['b1', 'Cálculo II', 'Universidad', 'fijo', '2026-09-22', '09:00', '10:30', '', 'mi nota', '2026-09-01 08:00', '2026-09-01 08:00', '', '', '',
      '', '', '', '', ''],
    'la fila existente debe conservar todos sus valores, corridos una columna'
  );
  assert.strictEqual(filas[2][11], 'TRUE', 'el estado archivado debe conservarse');
});

test('migrar dos veces no agrega una segunda columna "etiqueta"', () => {
  const env = crearEntorno({});
  const bloques = env.libro.insertSheet('Bloques');
  bloques.sembrar([
    ['id', 'título', 'área', 'tipo', 'fecha', 'inicio', 'fin', 'notas', 'creado', 'actualizado', 'archivado'],
    ['b1', 'Cálculo II', 'Universidad', 'fijo', '2026-09-22', '09:00', '10:30', '', '', '', '']
  ]);

  env.llamar('asegurarEstructura()');
  env.llamar('asegurarEstructura()');

  const encabezados = bloques.leerTodo()[0];
  const cuantas = encabezados.filter((c) => c === 'etiqueta').length;
  assert.strictEqual(cuantas, 1);
  assert.deepStrictEqual(encabezados, ENCABEZADOS_BLOQUES);
});

test('las sugerencias de etiqueta no restringen lo que se puede escribir', () => {
  const env = crearEntorno({});
  env.llamar('asegurarEstructura()');

  const validaciones = env.libro.getSheetByName('Horario').validaciones;
  assert.strictEqual(validaciones.length, 1);
  assert.deepStrictEqual(validaciones[0].regla.lista, ['Nerak', 'Data cocha', 'otro']);
  assert.strictEqual(validaciones[0].regla.permitirInvalido, true,
    'permitirInvalido debe ser true: sugiere, no obliga');
});

test('una acción desconocida dice qué recibió y qué acepta', () => {
  const env = crearEntorno({ token: 'token-bueno' });
  const respuesta = env.post({ token: 'token-bueno', action: 'generarHorarioo' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /generarHorarioo/);
  assert.match(respuesta.error, /generarHorario/);
});
