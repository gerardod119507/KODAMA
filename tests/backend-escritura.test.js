'use strict';

/**
 * Backend nuevo (Checkpoint 13): crear/editar/archivar bloques y reglas
 * desde la app. Mismas pruebas que tests/escritura.test.js tenía para el
 * Apps Script, ahora contra las tablas.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno, bloque, regla } = require('./entorno-backend');

// ---------------------------------------------------------------
// crearBloque
// ---------------------------------------------------------------

test('crearBloque agrega una fila y devuelve el bloque con su id', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'crearBloque', bloque: bloque() });

  assert.strictEqual(respuesta.ok, true);
  assert.match(respuesta.data.id, /^b[0-9a-f]{8}$/);

  const filas = env.tabla('bloques');
  assert.strictEqual(filas.length, 1);
  assert.strictEqual(filas[0].titulo, 'Reunión con Ana');
  assert.strictEqual(filas[0].tipo, 'reunión');
  assert.strictEqual(filas[0].fecha, '2026-09-24');
  assert.strictEqual(filas[0].archivado, '');
  assert.strictEqual(filas[0].estado, 'programada');
});

test('crearBloque sella creado y actualizado con la hora de La Paz', async () => {
  const env = crearEntorno({ ahora: '2026-09-23T14:30:00Z' });
  const respuesta = await env.post({ action: 'crearBloque', bloque: bloque() });

  assert.strictEqual(respuesta.data.creado, '2026-09-23 10:30');
  assert.strictEqual(respuesta.data.actualizado, '2026-09-23 10:30');
  assert.strictEqual(env.tabla('bloques')[0].creado, '2026-09-23 10:30', 'y así queda guardado');
});

test('cerca de medianoche, "hoy" es el día de La Paz y no el de Greenwich', async () => {
  const env = crearEntorno({ ahora: '2026-09-24T02:30:00Z' }); // 22:30 del 23 en La Paz
  assert.strictEqual(env.B.hoy(), '2026-09-23');
  assert.strictEqual(env.B.ahora(), '2026-09-23 22:30');
});

test('un bloque creado a mano no tiene id de serie: el generador no lo toca', async () => {
  const env = crearEntorno();
  const creado = (await env.post({ action: 'crearBloque', bloque: bloque() })).data;

  env.sembrar('horario', [regla({ id: 'h1a2b3c4d', titulo: 'Clase', dias: 'Jue', inicio: '09:00', fin: '10:00', desde: '2026-09-24', hasta: '2026-10-01' })]);
  await env.post({ action: 'generarHorario' });

  assert.strictEqual(env.fila('bloques', creado.id).titulo, 'Reunión con Ana', 'el bloque manual queda igual');
  const series = (await env.post({ action: 'listarSeries' })).data;
  assert.ok(series.every((s) => s.idSerie !== creado.id), 'no puede aparecer como serie');
});

test('crearBloque rechaza un área que no existe', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'crearBloque', bloque: bloque({ area: 'Inventada' }) });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /area_invalida/);
  assert.strictEqual(env.tabla('bloques').length, 0, 'no se escribe nada si falla');
});

test('crearBloque rechaza un tipo que no existe', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'crearBloque', bloque: bloque({ tipo: 'urgente' }) });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /tipo_invalido/);
});

test('crearBloque rechaza sin título, con hora o fecha mal escrita, o con fin antes que inicio', async () => {
  const env = crearEntorno();

  assert.match((await env.post({ action: 'crearBloque', bloque: bloque({ titulo: '  ' }) })).error, /falta_titulo/);
  assert.match((await env.post({ action: 'crearBloque', bloque: bloque({ inicio: '9am' }) })).error, /hora_invalida/);
  assert.match((await env.post({ action: 'crearBloque', bloque: bloque({ fecha: '24/09/2026' }) })).error, /fecha_invalida/);
  assert.match((await env.post({ action: 'crearBloque', bloque: bloque({ inicio: '16:00', fin: '15:00' }) })).error, /horario_invertido/);

  assert.strictEqual(env.tabla('bloques').length, 0);
});

test('una fecha que no existe (30 de febrero) la rechaza la base sin guardar nada', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'crearBloque', bloque: bloque({ fecha: '2026-02-30' }) });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /dato_invalido/);
  assert.strictEqual(env.tabla('bloques').length, 0);
});

test('crearBloque guarda etiqueta y notas tal como llegan', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({
    action: 'crearBloque', bloque: bloque({ etiqueta: 'Nerak', notas: 'Dictado por voz: traer el informe' })
  });

  assert.strictEqual(respuesta.data.etiqueta, 'Nerak');
  assert.strictEqual(respuesta.data.notas, 'Dictado por voz: traer el informe');
  assert.strictEqual(env.tabla('bloques')[0].notas, 'Dictado por voz: traer el informe');
});

test('crearBloque: si justo el id al azar ya existe, prueba con otro', async () => {
  const env = crearEntorno();
  env.sembrar('bloques', [bloque({ id: 'b00000001' })]); // el primer id que va a salir
  const respuesta = await env.post({ action: 'crearBloque', bloque: bloque({ titulo: 'Otra' }) });

  assert.strictEqual(respuesta.ok, true);
  assert.strictEqual(respuesta.data.id, 'b00000002');
  assert.strictEqual(env.tabla('bloques').length, 2);
});

test('crearBloque: las áreas se leen una vez por página, no en cada bloque', async () => {
  const env = crearEntorno();
  await env.post({ action: 'crearBloque', bloque: bloque() });
  env.olvidarPeticiones();
  await env.post({ action: 'crearBloque', bloque: bloque({ titulo: 'Otra' }) });

  assert.deepStrictEqual(env.peticiones().map((p) => p.op + ' ' + p.tabla), ['insertar bloques'],
    'el segundo bloque es una sola petición');
});

// ---------------------------------------------------------------
// actualizarBloque
// ---------------------------------------------------------------

test('actualizarBloque cambia solo los campos que se mandan', async () => {
  const env = crearEntorno();
  const creado = (await env.post({ action: 'crearBloque', bloque: bloque({ notas: 'nota original' }) })).data;

  const respuesta = await env.post({ action: 'actualizarBloque', id: creado.id, cambios: { titulo: 'Reunión con Ana y Luis' } });

  assert.strictEqual(respuesta.ok, true);
  assert.strictEqual(respuesta.data.titulo, 'Reunión con Ana y Luis');
  assert.strictEqual(respuesta.data.notas, 'nota original', 'lo que no se manda no se toca');
  assert.strictEqual(respuesta.data.inicio, '15:00');
  assert.strictEqual(env.tabla('bloques').length, 1, 'no crea una fila nueva');
  assert.strictEqual(env.tabla('bloques')[0].titulo, 'Reunión con Ana y Luis');
});

test('actualizarBloque no deja guardar datos inválidos ni pisa la fila', async () => {
  const env = crearEntorno();
  const creado = (await env.post({ action: 'crearBloque', bloque: bloque() })).data;

  const respuesta = await env.post({ action: 'actualizarBloque', id: creado.id, cambios: { fin: '14:00' } });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /horario_invertido/);
  assert.strictEqual(env.tabla('bloques')[0].fin, '16:00', 'la fila queda como estaba');
});

test('actualizarBloque falla claro si el id no existe', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'actualizarBloque', id: 'bdeadbeef', cambios: { titulo: 'X' } });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /bloque_no_encontrado/);
});

test('actualizarBloque refresca "actualizado" pero no "creado"', async () => {
  const env = crearEntorno({ ahora: '2026-09-23T14:30:00Z' });
  const creado = (await env.post({ action: 'crearBloque', bloque: bloque() })).data;

  env.fijarAhora('2026-09-23T16:45:00Z');
  const respuesta = await env.post({ action: 'actualizarBloque', id: creado.id, cambios: { titulo: 'Otro' } });

  assert.strictEqual(respuesta.data.creado, '2026-09-23 10:30');
  assert.strictEqual(respuesta.data.actualizado, '2026-09-23 12:45');
  assert.strictEqual(env.tabla('bloques')[0].creado, '2026-09-23 10:30');
  assert.strictEqual(env.tabla('bloques')[0].actualizado, '2026-09-23 12:45');
});

// ---------------------------------------------------------------
// archivarBloque y lectura
// ---------------------------------------------------------------

test('archivarBloque marca la fila y deja de mostrarla en el día y en la semana', async () => {
  const env = crearEntorno();
  const creado = (await env.post({ action: 'crearBloque', bloque: bloque() })).data;

  const respuesta = await env.post({ action: 'archivarBloque', id: creado.id });
  assert.strictEqual(respuesta.ok, true);
  assert.strictEqual(respuesta.data.archivado, 'TRUE');

  assert.strictEqual((await env.post({ action: 'listarBloquesDia', fecha: '2026-09-24' })).data.length, 0);
  assert.strictEqual((await env.post({ action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-09-27' })).data.length, 0);
});

test('archivarBloque no borra la fila', async () => {
  const env = crearEntorno();
  const creado = (await env.post({ action: 'crearBloque', bloque: bloque() })).data;
  await env.post({ action: 'archivarBloque', id: creado.id });

  assert.strictEqual(env.tabla('bloques').length, 1, 'la fila sigue existiendo, solo marcada');
  assert.strictEqual(env.tabla('bloques')[0].archivado, 'TRUE');
});

test('archivarBloque falla claro si el id no existe', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'archivarBloque', id: 'bnoexiste' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /bloque_no_encontrado/);
});

test('listarBloquesDia: los del día, sin archivados, ordenados por hora', async () => {
  const env = crearEntorno();
  env.sembrar('bloques', [
    bloque({ id: 'b00000a01', inicio: '17:00', fin: '18:00' }),
    bloque({ id: 'b00000a02', inicio: '08:00', fin: '09:00' }),
    bloque({ id: 'b00000a03', inicio: '10:00', fin: '11:00', archivado: 'TRUE' }),
    bloque({ id: 'b00000a04', fecha: '2026-09-25' })
  ]);
  const respuesta = await env.post({ action: 'listarBloquesDia', fecha: '2026-09-24' });

  assert.deepStrictEqual(respuesta.data.map((b) => b.id), ['b00000a02', 'b00000a01']);
  assert.match((await env.post({ action: 'listarBloquesDia' })).error, /falta_fecha/);
});

test('listarBloquesRango: extremos incluidos, ordenados por fecha y hora, sin archivados, en una sola consulta', async () => {
  const env = crearEntorno();
  env.sembrar('bloques', [
    bloque({ id: 'b00000b01', fecha: '2026-09-27', inicio: '08:00', fin: '09:00' }),
    bloque({ id: 'b00000b02', fecha: '2026-09-21', inicio: '18:00', fin: '19:00' }),
    bloque({ id: 'b00000b03', fecha: '2026-09-21', inicio: '07:00', fin: '08:00' }),
    bloque({ id: 'b00000b04', fecha: '2026-09-28' }),
    bloque({ id: 'b00000b05', fecha: '2026-09-20' }),
    bloque({ id: 'b00000b06', fecha: '2026-09-23', archivado: 'TRUE' })
  ]);
  env.olvidarPeticiones();
  const respuesta = await env.post({ action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-09-27' });

  assert.deepStrictEqual(respuesta.data.map((b) => b.id), ['b00000b03', 'b00000b02', 'b00000b01']);
  assert.strictEqual(env.peticiones().length, 1);
});

test('listarBloquesRango rechaza fechas mal escritas o un rango al revés', async () => {
  const env = crearEntorno();
  assert.match((await env.post({ action: 'listarBloquesRango', desde: '21/09', hasta: '2026-09-27' })).error, /rango_invalido/);
  assert.match((await env.post({ action: 'listarBloquesRango', desde: '2026-09-28', hasta: '2026-09-27' })).error, /rango_invalido/);
});

test('cada bloque llega con los mismos campos de texto que daba el Sheet', async () => {
  const env = crearEntorno();
  await env.post({ action: 'crearBloque', bloque: bloque() });
  const [leido] = (await env.post({ action: 'listarBloquesRango', desde: '2026-09-24', hasta: '2026-09-24' })).data;

  assert.deepStrictEqual(Object.keys(leido).sort(), [
    'actualizado', 'alumno_id', 'archivado', 'area', 'creado', 'estado', 'etiqueta', 'fecha', 'fecha_original',
    'fin', 'fin_original', 'id', 'inicio', 'inicio_original', 'lugar', 'motivo', 'notas', 'recordatorio', 'tipo', 'titulo'
  ]);
  Object.keys(leido).forEach((campo) => assert.strictEqual(typeof leido[campo], 'string', campo + ' es texto'));
  assert.strictEqual(leido.fecha_original, '', 'lo vacío es "" y no null');
});

// ---------------------------------------------------------------
// Reglas del horario
// ---------------------------------------------------------------

test('crearRegla agrega la regla con id de serie y la devuelve', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'crearRegla', regla: regla() });

  assert.strictEqual(respuesta.ok, true);
  assert.match(respuesta.data.id, /^h[0-9a-f]{8}$/);
  assert.strictEqual(respuesta.data.titulo, 'Cálculo II');
  assert.strictEqual(respuesta.data.archivado, '');
  assert.strictEqual(env.tabla('horario').length, 1);
});

test('listarHorario devuelve las reglas cargadas, en el orden en que se crearon', async () => {
  const env = crearEntorno();
  await env.post({ action: 'crearRegla', regla: regla() });
  await env.post({ action: 'crearRegla', regla: regla({ titulo: 'Standup', area: 'Startup', dias: 'Vie' }) });

  const respuesta = await env.post({ action: 'listarHorario' });
  assert.deepStrictEqual(respuesta.data.map((r) => r.titulo), ['Cálculo II', 'Standup']);
});

test('una regla creada desde la app genera bloques fijos de su serie', async () => {
  const env = crearEntorno();
  const creada = (await env.post({ action: 'crearRegla', regla: regla() })).data;

  const resumen = (await env.post({ action: 'generarHorario' })).data;
  assert.strictEqual(resumen.creados, 5);

  env.tabla('bloques').forEach((fila) => {
    assert.strictEqual(fila.id.indexOf(creada.id + '-'), 0);
    assert.strictEqual(fila.tipo, 'fijo');
  });
});

test('crearRegla rechaza días inválidos y no escribe la fila', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'crearRegla', regla: regla({ dias: 'Lun, Xyz' }) });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /dia_invalido/);
  assert.strictEqual((await env.post({ action: 'listarHorario' })).data.length, 0);
});

test('crearRegla rechaza un rango de fechas invertido', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'crearRegla', regla: regla({ desde: '2026-10-30', hasta: '2026-09-24' }) });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /rango_invertido/);
});

test('actualizarRegla cambia la regla y la regeneración toma los datos nuevos', async () => {
  const env = crearEntorno();
  const creada = (await env.post({ action: 'crearRegla', regla: regla() })).data;
  await env.post({ action: 'generarHorario' });

  await env.post({ action: 'actualizarRegla', id: creada.id, cambios: { inicio: '11:00', fin: '12:30' } });
  await env.post({ action: 'generarHorario' });

  env.tabla('bloques').forEach((fila) => {
    assert.strictEqual(fila.inicio, '11:00');
    assert.strictEqual(fila.fin, '12:30');
  });
});

test('actualizarRegla no deja guardar una regla inválida', async () => {
  const env = crearEntorno();
  const creada = (await env.post({ action: 'crearRegla', regla: regla() })).data;

  const respuesta = await env.post({ action: 'actualizarRegla', id: creada.id, cambios: { dias: 'Lunes y jueves' } });

  assert.strictEqual(respuesta.ok, false);
  assert.strictEqual((await env.post({ action: 'listarHorario' })).data[0].dias, 'Lun, Mié', 'la regla queda como estaba');
});

test('archivarRegla la marca y deja de generar bloques nuevos', async () => {
  const env = crearEntorno();
  const creada = (await env.post({ action: 'crearRegla', regla: regla() })).data;

  const respuesta = await env.post({ action: 'archivarRegla', id: creada.id });
  assert.strictEqual(respuesta.ok, true);
  assert.strictEqual(respuesta.data.archivado, 'TRUE');

  assert.strictEqual((await env.post({ action: 'generarHorario' })).data.creados, 0, 'una regla archivada no genera nada');
});

test('archivar una regla archiva sus bloques futuros al regenerar, sin borrarlos', async () => {
  const env = crearEntorno();
  const creada = (await env.post({ action: 'crearRegla', regla: regla() })).data;
  await env.post({ action: 'generarHorario' });
  const cuantos = env.tabla('bloques').length;

  await env.post({ action: 'archivarRegla', id: creada.id });
  const resumen = (await env.post({ action: 'generarHorario' })).data;

  assert.strictEqual(resumen.archivados, cuantos);
  assert.strictEqual(env.tabla('bloques').length, cuantos, 'no se borra ninguna fila');
  env.tabla('bloques').forEach((fila) => assert.strictEqual(fila.archivado, 'TRUE'));
});

test('la regla archivada sigue apareciendo en listarHorario, marcada', async () => {
  const env = crearEntorno();
  const creada = (await env.post({ action: 'crearRegla', regla: regla() })).data;
  await env.post({ action: 'archivarRegla', id: creada.id });

  const lista = (await env.post({ action: 'listarHorario' })).data;
  assert.strictEqual(lista.length, 1);
  assert.strictEqual(lista[0].archivado, 'TRUE');
});

test('archivarRegla falla claro si el id no existe', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'archivarRegla', id: 'hnoexiste' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /regla_no_encontrada/);
});

test('una acción que no existe responde con la lista de las válidas', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'listarBloquesDiaa' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /accion_desconocida: recibida "listarBloquesDiaa"/);
  assert.match(respuesta.error, /listarBloquesRango/);
});
