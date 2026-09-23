'use strict';

/**
 * Acciones de escritura del Checkpoint 5: crear/editar/archivar bloques y
 * reglas del horario desde la app.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

const COL = {
  id: 0, titulo: 1, area: 2, tipo: 3, fecha: 4, inicio: 5, fin: 6,
  etiqueta: 7, notas: 8, creado: 9, actualizado: 10, archivado: 11
};

const AHORA = '2026-09-23T14:30:00Z';

function preparar() {
  const env = crearEntorno({ ahora: AHORA, token: 'tk' });
  env.llamar('asegurarEstructura()');
  return env;
}

function bloqueValido(extra) {
  return Object.assign({
    titulo: 'Reunión con Ana',
    area: 'Startup',
    tipo: 'reunión',
    fecha: '2026-09-24',
    inicio: '15:00',
    fin: '16:00',
    etiqueta: '',
    notas: ''
  }, extra || {});
}

function reglaValida(extra) {
  return Object.assign({
    titulo: 'Cálculo II',
    area: 'Universidad',
    dias: 'Lun, Mié',
    inicio: '09:00',
    fin: '10:30',
    desde: '2026-09-23',
    hasta: '2026-10-07',
    etiqueta: '',
    notas: ''
  }, extra || {});
}

function filasBloques(env) {
  return env.libro.getSheetByName('Bloques').leerTodo().slice(1).filter((f) => f[COL.id]);
}

// ---------------------------------------------------------------
// crearBloque
// ---------------------------------------------------------------

test('crearBloque agrega una fila y devuelve el bloque con su id', () => {
  const env = preparar();
  const respuesta = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido() });

  assert.strictEqual(respuesta.ok, true);
  assert.match(respuesta.data.id, /^b[0-9a-f]{8}$/);

  const filas = filasBloques(env);
  assert.strictEqual(filas.length, 1);
  assert.strictEqual(filas[0][COL.titulo], 'Reunión con Ana');
  assert.strictEqual(filas[0][COL.tipo], 'reunión');
  assert.strictEqual(filas[0][COL.fecha], '2026-09-24');
  assert.strictEqual(filas[0][COL.archivado], '');
});

test('crearBloque sella creado y actualizado', () => {
  const env = preparar();
  const respuesta = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido() });

  assert.strictEqual(respuesta.data.creado, '2026-09-23 14:30');
  assert.strictEqual(respuesta.data.actualizado, '2026-09-23 14:30');
});

test('un bloque creado a mano no tiene id de serie: el generador no lo toca', () => {
  const env = preparar();
  const creado = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido() }).data;

  env.libro.getSheetByName('Horario').sembrar([[], ['', 'Clase', 'Universidad', 'Jue', '09:00', '10:00', '2026-09-24', '2026-10-01', '', '', '']]);
  env.llamar('generarHorario()');

  const fila = filasBloques(env).find((f) => f[COL.id] === creado.id);
  assert.strictEqual(fila[COL.titulo], 'Reunión con Ana', 'el bloque manual queda igual');

  const series = env.llamar('listarSeries()');
  assert.ok(series.every((s) => s.idSerie !== creado.id), 'no puede aparecer como serie');
});

test('crearBloque rechaza un área que no existe', () => {
  const env = preparar();
  const respuesta = env.post({
    token: 'tk', action: 'crearBloque', bloque: bloqueValido({ area: 'Inventada' })
  });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /area_invalida/);
  assert.strictEqual(filasBloques(env).length, 0, 'no se escribe nada si falla');
});

test('crearBloque rechaza un tipo que no existe', () => {
  const env = preparar();
  const respuesta = env.post({
    token: 'tk', action: 'crearBloque', bloque: bloqueValido({ tipo: 'urgente' })
  });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /tipo_invalido/);
});

test('crearBloque rechaza sin título, con hora mal escrita, o con fin antes que inicio', () => {
  const env = preparar();

  const sinTitulo = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido({ titulo: '  ' }) });
  assert.match(sinTitulo.error, /falta_titulo/);

  const horaMala = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido({ inicio: '9am' }) });
  assert.match(horaMala.error, /hora_invalida/);

  const fechaMala = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido({ fecha: '24/09/2026' }) });
  assert.match(fechaMala.error, /fecha_invalida/);

  const alReves = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido({ inicio: '16:00', fin: '15:00' }) });
  assert.match(alReves.error, /horario_invertido/);

  assert.strictEqual(filasBloques(env).length, 0);
});

test('crearBloque guarda etiqueta y notas tal como llegan', () => {
  const env = preparar();
  const respuesta = env.post({
    token: 'tk',
    action: 'crearBloque',
    bloque: bloqueValido({ etiqueta: 'Nerak', notas: 'Dictado por voz: traer el informe' })
  });

  assert.strictEqual(respuesta.data.etiqueta, 'Nerak');
  assert.strictEqual(respuesta.data.notas, 'Dictado por voz: traer el informe');
});

// ---------------------------------------------------------------
// actualizarBloque
// ---------------------------------------------------------------

test('actualizarBloque cambia solo los campos que se mandan', () => {
  const env = preparar();
  const creado = env.post({
    token: 'tk', action: 'crearBloque', bloque: bloqueValido({ notas: 'nota original' })
  }).data;

  const respuesta = env.post({
    token: 'tk', action: 'actualizarBloque', id: creado.id, cambios: { titulo: 'Reunión con Ana y Luis' }
  });

  assert.strictEqual(respuesta.ok, true);
  assert.strictEqual(respuesta.data.titulo, 'Reunión con Ana y Luis');
  assert.strictEqual(respuesta.data.notas, 'nota original', 'lo que no se manda no se toca');
  assert.strictEqual(respuesta.data.inicio, '15:00');
  assert.strictEqual(filasBloques(env).length, 1, 'no crea una fila nueva');
});

test('actualizarBloque no deja guardar datos inválidos ni pisa la fila', () => {
  const env = preparar();
  const creado = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido() }).data;

  const respuesta = env.post({
    token: 'tk', action: 'actualizarBloque', id: creado.id, cambios: { fin: '14:00' }
  });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /horario_invertido/);
  assert.strictEqual(filasBloques(env)[0][COL.fin], '16:00', 'la fila queda como estaba');
});

test('actualizarBloque falla claro si el id no existe', () => {
  const env = preparar();
  const respuesta = env.post({
    token: 'tk', action: 'actualizarBloque', id: 'bdeadbeef', cambios: { titulo: 'X' }
  });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /bloque_no_encontrado/);
});

test('actualizarBloque refresca "actualizado" pero no "creado"', () => {
  const env = preparar();
  const creado = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido() }).data;

  const env2 = creado; // referencia al creado original
  const respuesta = env.post({
    token: 'tk', action: 'actualizarBloque', id: creado.id, cambios: { titulo: 'Otro' }
  });

  assert.strictEqual(respuesta.data.creado, env2.creado);
  assert.strictEqual(respuesta.data.actualizado, '2026-09-23 14:30');
});

// ---------------------------------------------------------------
// archivarBloque
// ---------------------------------------------------------------

test('archivarBloque marca la fila y deja de mostrarla en el día', () => {
  const env = preparar();
  const creado = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido() }).data;

  const respuesta = env.post({ token: 'tk', action: 'archivarBloque', id: creado.id });
  assert.strictEqual(respuesta.ok, true);
  assert.strictEqual(respuesta.data.archivado, 'TRUE');

  const delDia = env.post({ token: 'tk', action: 'listarBloquesDia', fecha: '2026-09-24' });
  assert.strictEqual(delDia.data.length, 0, 'un bloque archivado no aparece en la vista de día');
});

test('archivarBloque no borra la fila', () => {
  const env = preparar();
  const creado = env.post({ token: 'tk', action: 'crearBloque', bloque: bloqueValido() }).data;
  env.post({ token: 'tk', action: 'archivarBloque', id: creado.id });

  assert.strictEqual(filasBloques(env).length, 1, 'la fila sigue existiendo, solo marcada');
});

test('archivarBloque falla claro si el id no existe', () => {
  const env = preparar();
  const respuesta = env.post({ token: 'tk', action: 'archivarBloque', id: 'bnoexiste' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /bloque_no_encontrado/);
});

// ---------------------------------------------------------------
// Editor de la hoja Horario
// ---------------------------------------------------------------

test('crearRegla agrega la regla con id de serie y la devuelve', () => {
  const env = preparar();
  const respuesta = env.post({ token: 'tk', action: 'crearRegla', regla: reglaValida() });

  assert.strictEqual(respuesta.ok, true);
  assert.match(respuesta.data.id, /^h[0-9a-f]{8}$/);
  assert.strictEqual(respuesta.data.titulo, 'Cálculo II');
  assert.strictEqual(respuesta.data.archivado, '');
});

test('listarHorario devuelve las reglas cargadas', () => {
  const env = preparar();
  env.post({ token: 'tk', action: 'crearRegla', regla: reglaValida() });
  env.post({ token: 'tk', action: 'crearRegla', regla: reglaValida({ titulo: 'Standup', area: 'Startup', dias: 'Vie' }) });

  const respuesta = env.post({ token: 'tk', action: 'listarHorario' });
  assert.strictEqual(respuesta.data.length, 2);
  assert.deepStrictEqual(respuesta.data.map((r) => r.titulo), ['Cálculo II', 'Standup']);
});

test('una regla creada desde la app genera bloques igual que una escrita a mano', () => {
  const env = preparar();
  const regla = env.post({ token: 'tk', action: 'crearRegla', regla: reglaValida() }).data;

  const resumen = env.post({ token: 'tk', action: 'generarHorario' }).data;
  assert.strictEqual(resumen.creados, 5);

  const generados = filasBloques(env);
  generados.forEach((fila) => {
    assert.strictEqual(fila[COL.id].indexOf(regla.id + '-'), 0);
    assert.strictEqual(fila[COL.tipo], 'fijo');
  });
});

test('crearRegla rechaza días inválidos y no escribe la fila', () => {
  const env = preparar();
  const respuesta = env.post({ token: 'tk', action: 'crearRegla', regla: reglaValida({ dias: 'Lun, Xyz' }) });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /dia_invalido/);
  assert.strictEqual(env.post({ token: 'tk', action: 'listarHorario' }).data.length, 0);
});

test('crearRegla rechaza un rango de fechas invertido', () => {
  const env = preparar();
  const respuesta = env.post({
    token: 'tk', action: 'crearRegla', regla: reglaValida({ desde: '2026-10-30', hasta: '2026-09-24' })
  });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /rango_invertido/);
});

test('actualizarRegla cambia la regla y la regeneración toma los datos nuevos', () => {
  const env = preparar();
  const regla = env.post({ token: 'tk', action: 'crearRegla', regla: reglaValida() }).data;
  env.post({ token: 'tk', action: 'generarHorario' });

  env.post({
    token: 'tk', action: 'actualizarRegla', id: regla.id, cambios: { inicio: '11:00', fin: '12:30' }
  });
  env.post({ token: 'tk', action: 'generarHorario' });

  filasBloques(env).forEach((fila) => {
    assert.strictEqual(fila[COL.inicio], '11:00');
    assert.strictEqual(fila[COL.fin], '12:30');
  });
});

test('actualizarRegla no deja guardar una regla inválida', () => {
  const env = preparar();
  const regla = env.post({ token: 'tk', action: 'crearRegla', regla: reglaValida() }).data;

  const respuesta = env.post({
    token: 'tk', action: 'actualizarRegla', id: regla.id, cambios: { dias: 'Lunes y jueves' }
  });

  assert.strictEqual(respuesta.ok, false);
  const guardada = env.post({ token: 'tk', action: 'listarHorario' }).data[0];
  assert.strictEqual(guardada.dias, 'Lun, Mié', 'la regla queda como estaba');
});

test('archivarRegla la marca y deja de generar bloques nuevos', () => {
  const env = preparar();
  const regla = env.post({ token: 'tk', action: 'crearRegla', regla: reglaValida() }).data;

  const respuesta = env.post({ token: 'tk', action: 'archivarRegla', id: regla.id });
  assert.strictEqual(respuesta.ok, true);
  assert.strictEqual(respuesta.data.archivado, 'TRUE');

  const resumen = env.post({ token: 'tk', action: 'generarHorario' }).data;
  assert.strictEqual(resumen.creados, 0, 'una regla archivada no genera nada');
});

test('archivar una regla archiva sus bloques futuros al regenerar, sin borrarlos', () => {
  const env = preparar();
  const regla = env.post({ token: 'tk', action: 'crearRegla', regla: reglaValida() }).data;
  env.post({ token: 'tk', action: 'generarHorario' });
  const cuantos = filasBloques(env).length;

  env.post({ token: 'tk', action: 'archivarRegla', id: regla.id });
  const resumen = env.post({ token: 'tk', action: 'generarHorario' }).data;

  assert.strictEqual(resumen.archivados, cuantos);
  assert.strictEqual(filasBloques(env).length, cuantos, 'no se borra ninguna fila');
  filasBloques(env).forEach((fila) => assert.strictEqual(fila[COL.archivado], 'TRUE'));
});

test('la regla archivada sigue apareciendo en listarHorario, marcada', () => {
  const env = preparar();
  const regla = env.post({ token: 'tk', action: 'crearRegla', regla: reglaValida() }).data;
  env.post({ token: 'tk', action: 'archivarRegla', id: regla.id });

  const lista = env.post({ token: 'tk', action: 'listarHorario' }).data;
  assert.strictEqual(lista.length, 1);
  assert.strictEqual(lista[0].archivado, 'TRUE');
});

test('archivarRegla falla claro si el id no existe', () => {
  const env = preparar();
  const respuesta = env.post({ token: 'tk', action: 'archivarRegla', id: 'hnoexiste' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /regla_no_encontrada/);
});

// ---------------------------------------------------------------
// Migración de la hoja Horario que ya existía sin "archivado"
// ---------------------------------------------------------------

test('a una hoja Horario vieja se le agrega "archivado" sin mover columnas', () => {
  const env = crearEntorno({ ahora: AHORA, token: 'tk' });
  const horario = env.libro.insertSheet('Horario');
  horario.sembrar([
    ['id', 'título', 'área', 'días', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas'],
    ['h1a2b3c4d', 'Cálculo II', 'Universidad', 'Lun', '09:00', '10:00', '2026-09-23', '2026-10-07', 'x', 'mi nota']
  ]);

  env.llamar('asegurarEstructura()');

  const filas = horario.leerTodo();
  assert.strictEqual(filas[0][10], 'archivado');
  assert.deepStrictEqual(
    filas[1].slice(0, 10),
    ['h1a2b3c4d', 'Cálculo II', 'Universidad', 'Lun', '09:00', '10:00', '2026-09-23', '2026-10-07', 'x', 'mi nota'],
    'ninguna columna existente se movió'
  );
});

test('todas las acciones de escritura exigen token', () => {
  const env = preparar();
  const acciones = [
    { action: 'crearBloque', bloque: bloqueValido() },
    { action: 'actualizarBloque', id: 'x', cambios: {} },
    { action: 'archivarBloque', id: 'x' },
    { action: 'crearRegla', regla: reglaValida() },
    { action: 'actualizarRegla', id: 'x', cambios: {} },
    { action: 'archivarRegla', id: 'x' }
  ];

  acciones.forEach((peticion) => {
    const respuesta = env.post(Object.assign({ token: 'token-malo' }, peticion));
    assert.strictEqual(respuesta.ok, false, peticion.action + ' debe rechazar token inválido');
    assert.strictEqual(respuesta.error, 'no_autorizado');
  });

  assert.strictEqual(filasBloques(env).length, 0);
});
