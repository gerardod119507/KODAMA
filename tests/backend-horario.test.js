'use strict';

/**
 * Backend nuevo (Checkpoint 13): el generador del horario fijo y las
 * series. Mismas pruebas que tests/horario.test.js tenía para el Apps
 * Script, ahora contra las tablas.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno, regla } = require('./entorno-backend');

// Días reales de referencia (verificados contra el calendario):
// 2026-09-21 lunes · 22 martes · 23 miércoles · 24 jueves · 25 viernes
// 26 sábado · 27 domingo.
const HOY = '2026-09-23'; // miércoles; el entorno arranca a las 10:30 de La Paz

let contadorReglas = 0;
/** Siembra una regla (formato de la app) con un id de serie propio y lo devuelve. */
function agregarRegla(env, extra) {
  const id = 'h' + String(++contadorReglas).padStart(8, '0').replace(/[^0-9a-f]/g, 'a');
  env.sembrar('horario', [regla(Object.assign({ id: id }, extra))]);
  return id;
}

function bloquesDe(env, prefijo) {
  return env.tabla('bloques').filter((b) => !prefijo || b.id.indexOf(prefijo) === 0);
}

function fechasActivasDe(env, prefijo) {
  return bloquesDe(env, prefijo).filter((b) => b.archivado !== 'TRUE').map((b) => b.fecha).sort();
}

async function generar(env) {
  const respuesta = await env.post({ action: 'generarHorario' });
  assert.strictEqual(respuesta.ok, true, respuesta.error);
  return respuesta.data;
}

// ---------------------------------------------------------------
// 1. Expansión de días a fechas
// ---------------------------------------------------------------

test('expande "Lun, Mié" a exactamente los lunes y miércoles del rango', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Lun, Mié', desde: '2026-09-23', hasta: '2026-10-07' });

  const resumen = await generar(env);

  assert.deepStrictEqual(fechasActivasDe(env), ['2026-09-23', '2026-09-28', '2026-09-30', '2026-10-05', '2026-10-07']);
  assert.strictEqual(resumen.creados, 5);
  assert.strictEqual(resumen.actualizados, 0);
});

test('cada bloque generado es tipo "fijo", programado, y su id apunta a la regla', async () => {
  const env = crearEntorno();
  const id = agregarRegla(env, { dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  await generar(env);

  const filas = bloquesDe(env);
  assert.strictEqual(filas.length, 2);
  filas.forEach((fila) => {
    assert.strictEqual(fila.tipo, 'fijo');
    assert.strictEqual(fila.estado, 'programada');
    assert.strictEqual(fila.id, id + '-' + fila.fecha);
    assert.strictEqual(fila.titulo, 'Cálculo II');
    assert.strictEqual(fila.area, 'Universidad');
    assert.strictEqual(fila.inicio, '09:00');
  });
  assert.deepStrictEqual(env.base.filas('bloques').map((f) => f.serie_id), [id, id], 'la base calcula la serie sola');
});

test('la etiqueta, el lugar y los alumnos de la regla se copian al bloque', async () => {
  const env = crearEntorno();
  env.sembrar('alumnos', [{ id: 'a00000a01', nombre: 'Agustín', apellido: 'Aliendre', forma_pago: 'hora' }]);
  agregarRegla(env, { titulo: '', area: 'Academia Fractal', dias: 'Jue', desde: '2026-09-24', hasta: '2026-09-24', etiqueta: 'Nerak', lugar: 'CAFESA', alumno_id: 'a00000a01' });
  await generar(env);

  const [b] = bloquesDe(env);
  assert.strictEqual(b.etiqueta, 'Nerak');
  assert.strictEqual(b.lugar, 'CAFESA');
  assert.strictEqual(b.alumno_id, 'a00000a01');
  assert.strictEqual(b.titulo, '');
});

test('generarHorario lee dos tablas y escribe todo en un solo envío', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Lun, Mié', desde: '2026-09-23', hasta: '2026-10-07' });
  agregarRegla(env, { titulo: 'Standup', area: 'Startup', dias: 'Vie', desde: '2026-09-23', hasta: '2026-10-07' });
  env.olvidarPeticiones();
  await generar(env);

  assert.deepStrictEqual(env.peticiones().map((p) => p.op + ' ' + p.tabla).sort(),
    ['guardar bloques', 'seleccionar bloques', 'seleccionar horario']);
});

// ---------------------------------------------------------------
// 2. Días con y sin tilde
// ---------------------------------------------------------------

test('acepta días con tilde y sin tilde, y da el mismo resultado', async () => {
  const conTilde = crearEntorno();
  agregarRegla(conTilde, { dias: 'Mié, Sáb', desde: '2026-09-23', hasta: '2026-09-30' });
  await generar(conTilde);

  const sinTilde = crearEntorno();
  agregarRegla(sinTilde, { dias: 'Mie, Sab', desde: '2026-09-23', hasta: '2026-09-30' });
  await generar(sinTilde);

  assert.deepStrictEqual(fechasActivasDe(conTilde), ['2026-09-23', '2026-09-26', '2026-09-30']);
  assert.deepStrictEqual(fechasActivasDe(sinTilde), fechasActivasDe(conTilde));
});

test('acepta los 7 días en cualquier caja (mayúsculas/minúsculas)', async () => {
  const env = crearEntorno();
  agregarRegla(env, { area: 'Personal', dias: 'lun, MAR, Mié, jue, VIE, sáb, Dom', desde: '2026-09-23', hasta: '2026-09-29' });
  await generar(env);

  assert.deepStrictEqual(fechasActivasDe(env), [
    '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'
  ]);
});

test('un día inválido falla con un mensaje que nombra el token y la regla, sin escribir nada', async () => {
  const env = crearEntorno();
  agregarRegla(env, { titulo: 'Mi clase', dias: 'Lun, Xyz', desde: '2026-09-23', hasta: '2026-09-30' });

  const respuesta = await env.post({ action: 'generarHorario' });

  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /Xyz/);
  assert.match(respuesta.error, /Mi clase/);
  assert.strictEqual(bloquesDe(env).length, 0);
});

// ---------------------------------------------------------------
// 3. Límites de "desde" y "hasta"
// ---------------------------------------------------------------

test('"desde" y "hasta" son inclusivos cuando caen en un día de la regla', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  await generar(env);
  assert.deepStrictEqual(fechasActivasDe(env), ['2026-09-24', '2026-10-01']);
});

test('no genera nada fuera del rango, ni un día antes ni un día después', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Jue', desde: '2026-09-24', hasta: '2026-09-24' });
  await generar(env);
  assert.deepStrictEqual(fechasActivasDe(env), ['2026-09-24']);
});

test('un rango que no contiene ningún día de la regla no genera nada', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Lun', desde: '2026-09-24', hasta: '2026-09-26' });
  const resumen = await generar(env);
  assert.deepStrictEqual(fechasActivasDe(env), []);
  assert.strictEqual(resumen.creados, 0);
});

test('"desde" posterior a "hasta" lo frena la base; al crear la regla, la app avisa', async () => {
  const env = crearEntorno();
  assert.throws(() => agregarRegla(env, { titulo: 'Al revés', dias: 'Lun', desde: '2026-10-30', hasta: '2026-09-24' }), /dato_invalido/);
  const respuesta = await env.post({ action: 'crearRegla', regla: regla({ titulo: 'Al revés', desde: '2026-10-30', hasta: '2026-09-24' }) });
  assert.match(respuesta.error, /rango_invertido/);
  assert.match(respuesta.error, /Al revés/);
});

test('una fecha mal escrita al crear la regla falla nombrando el campo', async () => {
  const env = crearEntorno();
  const respuesta = await env.post({ action: 'crearRegla', regla: regla({ titulo: 'Mal fechada', desde: '23/09/2026' }) });
  assert.strictEqual(respuesta.ok, false);
  assert.match(respuesta.error, /fecha_invalida/);
  assert.match(respuesta.error, /desde/);
});

// ---------------------------------------------------------------
// 4. Respeto del pasado
// ---------------------------------------------------------------

test('no genera fechas anteriores a hoy aunque "desde" sea del pasado', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Lun', desde: '2026-09-07', hasta: '2026-10-05' });
  await generar(env);

  const fechas = fechasActivasDe(env);
  assert.deepStrictEqual(fechas, ['2026-09-28', '2026-10-05']);
  fechas.forEach((f) => assert.ok(f >= HOY, 'ninguna fecha puede ser anterior a hoy: ' + f));
});

test('genera el día de hoy (hoy cuenta como futuro, no como pasado)', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Mié', desde: '2026-09-01', hasta: '2026-09-23' });
  await generar(env);
  assert.deepStrictEqual(fechasActivasDe(env), [HOY]);
});

test('"hoy" es el de La Paz: a las 22:30 del martes, el martes todavía se genera', async () => {
  const env = crearEntorno({ ahora: '2026-09-23T02:30:00Z' }); // martes 22, 22:30 en La Paz
  agregarRegla(env, { dias: 'Mar', desde: '2026-09-22', hasta: '2026-09-29' });
  await generar(env);
  assert.deepStrictEqual(fechasActivasDe(env), ['2026-09-22', '2026-09-29']);
});

test('al regenerar tras editar la regla, solo cambian las fechas futuras', async () => {
  const env = crearEntorno();
  const serie = agregarRegla(env, { titulo: 'Clase', dias: 'Mié', inicio: '09:00', fin: '10:00', desde: '2026-09-23', hasta: '2026-10-14' });
  await generar(env);

  // Una ocurrencia pasada de ESTA serie, como la habría dejado una corrida anterior.
  env.sembrar('bloques', [{
    id: serie + '-2026-09-16', titulo: 'Clase', area: 'Universidad', tipo: 'fijo', fecha: '2026-09-16',
    inicio: '09:00', fin: '10:00', etiqueta: 'etiqueta vieja', notas: 'nota vieja'
  }]);

  await env.post({ action: 'actualizarRegla', id: serie, cambios: { titulo: 'Cálculo III', area: 'Personal', inicio: '11:00', fin: '12:30' } });
  await generar(env);

  const pasada = env.fila('bloques', serie + '-2026-09-16');
  assert.deepStrictEqual([pasada.titulo, pasada.area, pasada.inicio, pasada.fin, pasada.notas],
    ['Clase', 'Universidad', '09:00', '10:00', 'nota vieja'], 'la ocurrencia pasada no se toca en absoluto');

  bloquesDe(env).filter((b) => b.fecha >= HOY).forEach((b) => {
    assert.deepStrictEqual([b.titulo, b.area, b.inicio, b.fin], ['Cálculo III', 'Personal', '11:00', '12:30']);
  });
});

// ---------------------------------------------------------------
// 5. Idempotencia
// ---------------------------------------------------------------

test('correr el generador dos veces no duplica ninguna fila', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Lun, Mié', desde: '2026-09-23', hasta: '2026-10-21' });

  const primera = await generar(env);
  const idsPrimera = bloquesDe(env).map((b) => b.id).sort();
  const segunda = await generar(env);
  const idsSegunda = bloquesDe(env).map((b) => b.id).sort();

  assert.deepStrictEqual(idsSegunda, idsPrimera);
  assert.strictEqual(segunda.creados, 0, 'la segunda corrida no crea nada');
  assert.strictEqual(segunda.actualizados, primera.creados);
  assert.strictEqual(new Set(idsSegunda).size, idsSegunda.length);
});

test('regenerar sin cambios no reescribe nada (la cuenta de actualizados es la misma)', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Vie', desde: '2026-09-25', hasta: '2026-10-30' });
  await generar(env);
  const antes = env.base.filas('bloques');
  env.olvidarPeticiones();
  const resumen = await generar(env);

  assert.strictEqual(resumen.actualizados, 6);
  assert.deepStrictEqual(env.base.filas('bloques'), antes, 'nada cambió en la tabla');
});

test('correr el generador tres veces sigue sin duplicar', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Vie', desde: '2026-09-25', hasta: '2026-10-30' });
  await generar(env);
  await generar(env);
  await generar(env);
  assert.strictEqual(bloquesDe(env).length, 6, 'seis viernes entre el 25/09 y el 30/10');
});

test('dos reglas distintas no se pisan entre sí', async () => {
  const env = crearEntorno();
  const a = agregarRegla(env, { titulo: 'Cálculo', dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  const b = agregarRegla(env, { titulo: 'Clase Fractal', area: 'Academia Fractal', dias: 'Jue', inicio: '15:00', fin: '16:00', desde: '2026-09-24', hasta: '2026-10-01' });
  await generar(env);

  assert.strictEqual(bloquesDe(env, a + '-').length, 2);
  assert.strictEqual(bloquesDe(env, b + '-').length, 2);
  assert.strictEqual(bloquesDe(env, a + '-')[0].area, 'Universidad');
  assert.strictEqual(bloquesDe(env, b + '-')[0].area, 'Academia Fractal');
});

// ---------------------------------------------------------------
// Convivencia con lo que edita Gerardo
// ---------------------------------------------------------------

test('no pisa notas ni etiqueta escritas en un bloque ya generado', async () => {
  const env = crearEntorno();
  const serie = agregarRegla(env, { area: 'Startup', dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01', etiqueta: 'Nerak' });
  await generar(env);

  await env.post({ action: 'actualizarBloque', id: serie + '-2026-09-24', cambios: { etiqueta: 'Data cocha', notas: 'esta semana en otra sala' } });
  await generar(env);

  const b = env.fila('bloques', serie + '-2026-09-24');
  assert.strictEqual(b.etiqueta, 'Data cocha');
  assert.strictEqual(b.notas, 'esta semana en otra sala');
});

test('un bloque archivado no revive al regenerar', async () => {
  const env = crearEntorno();
  const serie = agregarRegla(env, { dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  await generar(env);
  await env.post({ action: 'archivarBloque', id: serie + '-2026-09-24' });
  await generar(env);
  assert.strictEqual(env.fila('bloques', serie + '-2026-09-24').archivado, 'TRUE');
});

test('acortar "hasta" archiva las fechas futuras que sobran, sin borrarlas', async () => {
  const env = crearEntorno();
  const serie = agregarRegla(env, { dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-22' });
  await generar(env);
  const total = bloquesDe(env, serie + '-').length;

  await env.post({ action: 'actualizarRegla', id: serie, cambios: { hasta: '2026-10-01' } });
  const resumen = await generar(env);

  assert.strictEqual(bloquesDe(env, serie + '-').length, total, 'no se borra ninguna fila');
  assert.deepStrictEqual(fechasActivasDe(env, serie + '-'), ['2026-09-24', '2026-10-01']);
  assert.strictEqual(resumen.archivados, total - 2);
});

test('no toca bloques que no vienen del generador', async () => {
  const env = crearEntorno();
  env.sembrar('bloques', [{ id: 'b0000abcd', titulo: 'Reunión imprevista', area: 'Startup', tipo: 'reunión', fecha: '2026-09-24', inicio: '11:00', fin: '11:30', notas: 'mi nota' }]);
  const antes = env.fila('bloques', 'b0000abcd');
  agregarRegla(env, { dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  await generar(env);

  assert.deepStrictEqual(env.fila('bloques', 'b0000abcd'), antes);
});

test('una regla sin título ni alumnos se ignora sin romper', async () => {
  const env = crearEntorno();
  agregarRegla(env, { titulo: '', dias: 'Jue', desde: '2026-09-24', hasta: '2026-09-24' });
  agregarRegla(env, { titulo: 'Clase', dias: 'Jue', desde: '2026-09-24', hasta: '2026-09-24' });

  const resumen = await generar(env);
  assert.strictEqual(resumen.creados, 1);
  assert.strictEqual((await env.post({ action: 'listarHorario' })).data.length, 1, 'tampoco aparece en el editor');
});

// ---------------------------------------------------------------
// Ids de serie
// ---------------------------------------------------------------

test('crearRegla pone un id de serie con su forma fija, distinto en cada regla', async () => {
  const env = crearEntorno();
  const ids = [];
  for (const titulo of ['A', 'B', 'C']) {
    ids.push((await env.post({ action: 'crearRegla', regla: regla({ titulo: titulo }) })).data.id);
  }
  ids.forEach((id) => assert.match(id, /^h[0-9a-f]{8}$/));
  assert.strictEqual(new Set(ids).size, 3);
});

test('la base no acepta un id de regla con otra forma (lo que pasó con "(vacío)")', () => {
  const env = crearEntorno();
  assert.throws(() => env.sembrar('horario', [regla({ id: '(vacío)' })]), /dato_invalido/);
});

test('el id de serie es estable: regenerar no duplica bloques', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  await generar(env);
  await generar(env);
  await generar(env);
  assert.strictEqual(bloquesDe(env).length, 2);
});

// ---------------------------------------------------------------
// Limpiar los bloques de una serie
// ---------------------------------------------------------------

test('listarSeries muestra las series con su título y cuántos bloques tienen', async () => {
  const env = crearEntorno();
  const serie = agregarRegla(env, { titulo: 'Cálculo II', dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  await generar(env);

  const series = (await env.post({ action: 'listarSeries' })).data;
  assert.deepStrictEqual(series, [{ idSerie: serie, titulo: 'Cálculo II', cantidad: 2 }]);
});

test('listarSeries también muestra series huérfanas (su regla ya no existe)', async () => {
  const env = crearEntorno();
  env.sembrar('bloques', [
    { id: 'hdeadbeef-2026-09-24', titulo: 'Vieja', area: 'Universidad', tipo: 'fijo', fecha: '2026-09-24', inicio: '09:00', fin: '10:00' },
    { id: 'hdeadbeef-2026-10-01', titulo: 'Vieja', area: 'Universidad', tipo: 'fijo', fecha: '2026-10-01', inicio: '09:00', fin: '10:00' }
  ]);

  const series = (await env.post({ action: 'listarSeries' })).data;
  assert.deepStrictEqual(series, [{ idSerie: 'hdeadbeef', titulo: '', cantidad: 2 }]);
});

test('borrarSerie elimina solo los bloques de esa serie', async () => {
  const env = crearEntorno();
  const queda = agregarRegla(env, { titulo: 'Se queda', dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  const borra = agregarRegla(env, { titulo: 'Se borra', area: 'Startup', dias: 'Vie', desde: '2026-09-25', hasta: '2026-10-02' });
  await generar(env);

  const resultado = (await env.post({ action: 'borrarSerie', idSerie: borra })).data;

  assert.strictEqual(resultado.borrados, 2);
  assert.strictEqual(bloquesDe(env, borra + '-').length, 0);
  assert.strictEqual(bloquesDe(env, queda + '-').length, 2, 'la otra serie queda intacta');
});

test('borrarSerie no toca bloques que no son de una serie, y sí borra los archivados de la serie', async () => {
  const env = crearEntorno();
  env.sembrar('bloques', [{ id: 'b0000abcd', titulo: 'Reunión suelta', area: 'Startup', tipo: 'reunión', fecha: '2026-09-24', inicio: '11:00', fin: '11:30' }]);
  const serie = agregarRegla(env, { dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  await generar(env);
  await env.post({ action: 'archivarBloque', id: serie + '-2026-09-24' });

  const resultado = (await env.post({ action: 'borrarSerie', idSerie: serie })).data;
  assert.strictEqual(resultado.borrados, 2);
  assert.deepStrictEqual(bloquesDe(env).map((b) => b.id), ['b0000abcd']);
});

test('borrarSerie con una serie que no existe no borra nada; sin id, falla', async () => {
  const env = crearEntorno();
  agregarRegla(env, { dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  await generar(env);

  assert.strictEqual((await env.post({ action: 'borrarSerie', idSerie: 'hdeadbeef' })).data.borrados, 0);
  const sinId = await env.post({ action: 'borrarSerie' });
  assert.strictEqual(sinId.ok, false);
  assert.match(sinId.error, /falta_id_serie/);
  assert.strictEqual(bloquesDe(env).length, 2, 'no puede haber borrado nada');
});

test('tras borrar una serie, regenerar la vuelve a crear con el mismo id', async () => {
  const env = crearEntorno();
  const serie = agregarRegla(env, { dias: 'Jue', desde: '2026-09-24', hasta: '2026-10-01' });
  await generar(env);
  await env.post({ action: 'borrarSerie', idSerie: serie });
  assert.strictEqual(bloquesDe(env).length, 0);

  const resumen = await generar(env);
  assert.strictEqual(resumen.creados, 2);
  bloquesDe(env).forEach((b) => assert.strictEqual(b.id.indexOf(serie + '-'), 0));
});

// ---------------------------------------------------------------
// Lógica pura (igual que en Horario.gs)
// ---------------------------------------------------------------

test('calcularOcurrencias y parseDias, como en Horario.gs', async () => {
  const env = crearEntorno();
  const dias = await env.llamar('parseDias', 'Lun - mié/VIE', 'x');
  assert.deepStrictEqual(dias, [1, 3, 5]);
  const fechas = await env.llamar('calcularOcurrencias', { desde: '2026-02-26', hasta: '2026-03-02', dias: [0, 6] }, '2026-01-01');
  assert.deepStrictEqual(fechas, ['2026-02-28', '2026-03-01']);
});
