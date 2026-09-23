'use strict';

/**
 * Checkpoint 6 — vista de semana: la acción listarBloquesRango del backend,
 * y la lógica pura del frontend (fechas de la semana, franja horaria,
 * reparto lado a lado, recordar día/semana).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { crearEntorno } = require('./fake-google');

// ---------------------------------------------------------------
// Backend: listarBloquesRango
// ---------------------------------------------------------------

function preparar() {
  const env = crearEntorno({ ahora: '2026-09-23T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  return env;
}

function crear(env, fecha, inicio, fin, titulo) {
  const respuesta = env.post({
    token: 'tk',
    action: 'crearBloque',
    bloque: {
      titulo: titulo || ('B ' + fecha + ' ' + inicio), area: 'Universidad', tipo: 'variable',
      fecha: fecha, inicio: inicio, fin: fin, etiqueta: '', notas: ''
    }
  });
  assert.ok(respuesta.ok, respuesta.error);
  return respuesta.data;
}

test('listarBloquesRango incluye ambos extremos y nada de afuera', () => {
  const env = preparar();
  crear(env, '2026-09-20', '09:00', '10:00'); // domingo anterior: afuera
  crear(env, '2026-09-21', '09:00', '10:00'); // lunes: desde
  crear(env, '2026-09-24', '09:00', '10:00');
  crear(env, '2026-09-27', '09:00', '10:00'); // domingo: hasta
  crear(env, '2026-09-28', '09:00', '10:00'); // lunes siguiente: afuera

  const respuesta = env.post({ token: 'tk', action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-09-27' });
  assert.ok(respuesta.ok, respuesta.error);
  assert.deepStrictEqual(respuesta.data.map((b) => b.fecha), ['2026-09-21', '2026-09-24', '2026-09-27']);
});

test('listarBloquesRango ordena por fecha y después por hora de inicio', () => {
  const env = preparar();
  crear(env, '2026-09-24', '15:00', '16:00');
  crear(env, '2026-09-22', '18:00', '19:00');
  crear(env, '2026-09-24', '07:00', '08:00');
  crear(env, '2026-09-22', '06:45', '08:00');

  const datos = env.post({ token: 'tk', action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-09-27' }).data;
  assert.deepStrictEqual(datos.map((b) => b.fecha + ' ' + b.inicio), [
    '2026-09-22 06:45', '2026-09-22 18:00', '2026-09-24 07:00', '2026-09-24 15:00'
  ]);
});

test('listarBloquesRango no devuelve bloques archivados', () => {
  const env = preparar();
  const archivado = crear(env, '2026-09-23', '09:00', '10:00', 'Cancelado');
  crear(env, '2026-09-23', '11:00', '12:00', 'Sigue');
  assert.ok(env.post({ token: 'tk', action: 'archivarBloque', id: archivado.id }).ok);

  const datos = env.post({ token: 'tk', action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-09-27' }).data;
  assert.deepStrictEqual(datos.map((b) => b.titulo), ['Sigue']);
});

test('listarBloquesRango incluye los bloques generados por el horario', () => {
  const env = preparar();
  const regla = env.post({
    token: 'tk',
    action: 'crearRegla',
    regla: {
      titulo: 'Cálculo II', area: 'Universidad', dias: 'Lun, Mié, Vie', inicio: '06:45', fin: '08:15',
      desde: '2026-09-01', hasta: '2026-12-15', etiqueta: '', notas: ''
    }
  });
  assert.ok(regla.ok, regla.error);
  env.llamar('generarHorario()');

  // Hoy (fijo en el entorno falso) es miércoles 23: el lunes 21 ya pasó y
  // nunca se generó; quedan el miércoles 23 y el viernes 25.
  const datos = env.post({ token: 'tk', action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-09-27' }).data;
  assert.deepStrictEqual(datos.map((b) => b.fecha), ['2026-09-23', '2026-09-25']);
  assert.ok(datos.every((b) => b.tipo === 'fijo' && b.inicio === '06:45'));
});

test('listarBloquesRango rechaza fechas mal escritas o un rango al revés', () => {
  const env = preparar();
  const sinHasta = env.post({ token: 'tk', action: 'listarBloquesRango', desde: '2026-09-21' });
  assert.strictEqual(sinHasta.ok, false);
  assert.match(sinHasta.error, /rango_invalido/);

  const formatoMalo = env.post({ token: 'tk', action: 'listarBloquesRango', desde: '21/09/2026', hasta: '2026-09-27' });
  assert.strictEqual(formatoMalo.ok, false);
  assert.match(formatoMalo.error, /21\/09\/2026/);

  const alReves = env.post({ token: 'tk', action: 'listarBloquesRango', desde: '2026-09-27', hasta: '2026-09-21' });
  assert.strictEqual(alReves.ok, false);
  assert.match(alReves.error, /posterior/);
});

test('listarBloquesRango exige token', () => {
  const env = preparar();
  const respuesta = env.post({ token: 'otro', action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-09-27' });
  assert.deepStrictEqual(respuesta, { ok: false, error: 'no_autorizado' });
});

// ---------------------------------------------------------------
// Frontend: lógica pura
// ---------------------------------------------------------------

function cargarModulos(archivos) {
  const almacen = {};
  const entorno = {
    console,
    Intl,
    localStorage: {
      getItem: (clave) => (clave in almacen ? almacen[clave] : null),
      setItem: (clave, valor) => { almacen[clave] = String(valor); },
      removeItem: (clave) => { delete almacen[clave]; }
    }
  };
  vm.createContext(entorno);
  archivos.forEach((archivo) => {
    const ruta = path.join(__dirname, '..', archivo);
    vm.runInContext(fs.readFileSync(ruta, 'utf8'), entorno, { filename: archivo });
  });
  return {
    ejecutar(expresion, argumento) {
      entorno.__arg = argumento === undefined ? undefined : JSON.parse(JSON.stringify(argumento));
      const resultado = vm.runInContext(expresion, entorno);
      return resultado === undefined ? undefined : JSON.parse(JSON.stringify(resultado));
    }
  };
}

const MODULOS_SEMANA = ['js/fecha.js', 'js/ui/iconos.js', 'js/ui/espiritu.js', 'js/ui/dia.js', 'js/ui/semana.js'];

test('la semana va de lunes a domingo, desde cualquier día de ella', () => {
  const env = cargarModulos(['js/fecha.js']);
  const esperada = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
  assert.deepStrictEqual(env.ejecutar('KodamaFecha.diasDeSemana("2026-09-21")'), esperada, 'desde el lunes');
  assert.deepStrictEqual(env.ejecutar('KodamaFecha.diasDeSemana("2026-09-23")'), esperada, 'desde el miércoles');
  assert.deepStrictEqual(env.ejecutar('KodamaFecha.diasDeSemana("2026-09-27")'), esperada, 'desde el domingo');
});

test('la semana cruza bien fin de mes y fin de año', () => {
  const env = cargarModulos(['js/fecha.js']);
  const dias = env.ejecutar('KodamaFecha.diasDeSemana("2026-10-01")');
  assert.strictEqual(dias[0], '2026-09-28');
  assert.strictEqual(dias[6], '2026-10-04');

  const finDeAnio = env.ejecutar('KodamaFecha.diasDeSemana("2026-12-31")');
  assert.strictEqual(finDeAnio[0], '2026-12-28');
  assert.strictEqual(finDeAnio[6], '2027-01-03');
});

test('anterior/siguiente mueven exactamente 7 días', () => {
  const env = cargarModulos(['js/fecha.js']);
  assert.strictEqual(env.ejecutar('KodamaFecha.sumarDias("2026-09-23", 7)'), '2026-09-30');
  assert.strictEqual(env.ejecutar('KodamaFecha.sumarDias("2026-09-23", -7)'), '2026-09-16');
  assert.strictEqual(env.ejecutar('KodamaFecha.sumarDias("2026-03-01", -1)'), '2026-02-28');
});

test('encabezados legibles de la semana', () => {
  const env = cargarModulos(['js/fecha.js']);
  assert.strictEqual(env.ejecutar('KodamaFecha.diaCorto("2026-09-23")'), 'mié 23');
  assert.strictEqual(env.ejecutar('KodamaFecha.rangoLegible("2026-09-21", "2026-09-27")'), '21 – 27 sep');
  assert.strictEqual(env.ejecutar('KodamaFecha.rangoLegible("2026-09-28", "2026-10-04")'), '28 sep – 4 oct');
  assert.strictEqual(env.ejecutar('KodamaFecha.rangoLegible("2026-12-28", "2027-01-03")'), '28 dic 2026 – 3 ene 2027');
});

test('la franja por defecto cubre el horario real (6:45 a 21:00)', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const franja = env.ejecutar('KodamaSemana.calcularFranja(__arg)', [
    { inicio: '06:45', fin: '08:15' },
    { inicio: '20:00', fin: '21:00' }
  ]);
  assert.ok(franja.desde <= 6 * 60 + 45, 'arranca a las 6:45 o antes');
  assert.ok(franja.hasta >= 21 * 60, 'termina a las 21:00 o después');
  assert.deepStrictEqual(franja, { desde: 6 * 60 + 30, hasta: 21 * 60 });
});

test('la franja se estira si un bloque cae fuera, y no se sale del día', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  assert.deepStrictEqual(
    env.ejecutar('KodamaSemana.calcularFranja(__arg)', [{ inicio: '05:10', fin: '06:00' }, { inicio: '21:00', fin: '22:15' }]),
    { desde: 5 * 60, hasta: 22 * 60 + 30 }
  );
  assert.deepStrictEqual(
    env.ejecutar('KodamaSemana.calcularFranja(__arg)', [{ inicio: '23:30', fin: '23:59' }]),
    { desde: 6 * 60 + 30, hasta: 24 * 60 }
  );
});

test('un bloque solo ocupa todo el ancho; su posición sale de la hora', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const [pos] = env.ejecutar('KodamaSemana.distribuir(__arg)', [{ titulo: 'A', inicio: '09:00', fin: '10:30' }]);
  assert.strictEqual(pos.inicio, 540);
  assert.strictEqual(pos.fin, 630);
  assert.strictEqual(pos.columna, 0);
  assert.strictEqual(pos.columnas, 1);
});

test('dos bloques que se pisan van lado a lado; los que no, a ancho completo', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const pos = env.ejecutar('KodamaSemana.distribuir(__arg)', [
    { titulo: 'A', inicio: '09:00', fin: '10:00' },
    { titulo: 'B', inicio: '09:30', fin: '10:30' },
    { titulo: 'C', inicio: '10:30', fin: '11:00' } // empieza justo cuando termina B: no se pisa
  ]);
  const porTitulo = Object.fromEntries(pos.map((p) => [p.bloque.titulo, p]));
  assert.deepStrictEqual([porTitulo.A.columna, porTitulo.A.columnas], [0, 2]);
  assert.deepStrictEqual([porTitulo.B.columna, porTitulo.B.columnas], [1, 2]);
  assert.deepStrictEqual([porTitulo.C.columna, porTitulo.C.columnas], [0, 1]);
});

test('en una cadena A–B–C, C reusa la columna de A si A ya terminó', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const pos = env.ejecutar('KodamaSemana.distribuir(__arg)', [
    { titulo: 'A', inicio: '09:00', fin: '10:00' },
    { titulo: 'B', inicio: '09:30', fin: '11:00' },
    { titulo: 'C', inicio: '10:00', fin: '10:45' }
  ]);
  const porTitulo = Object.fromEntries(pos.map((p) => [p.bloque.titulo, p]));
  assert.strictEqual(porTitulo.C.columna, 0, 'C va donde estaba A');
  assert.ok(pos.every((p) => p.columnas === 2), 'toda la cadena comparte el mismo ancho');
});

test('bloques con hora rota no rompen la vista', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const pos = env.ejecutar('KodamaSemana.distribuir(__arg)', [
    { titulo: 'Sin hora', inicio: '', fin: '' },
    { titulo: 'Fin antes que inicio', inicio: '10:00', fin: '09:00' }
  ]);
  assert.strictEqual(pos.length, 1, 'el que no tiene hora no se puede ubicar y se omite');
  assert.strictEqual(pos[0].fin - pos[0].inicio, 15, 'fin inválido: se dibuja con duración mínima');
});

test('la vista día/semana se recuerda; sin elección, decide el ancho de pantalla', () => {
  const env = cargarModulos(['js/vista.js']);
  assert.strictEqual(env.ejecutar('KodamaVista.leer(390)'), 'dia', 'celular arranca en día');
  assert.strictEqual(env.ejecutar('KodamaVista.leer(1440)'), 'semana', 'escritorio arranca en semana');

  env.ejecutar('KodamaVista.guardar("semana")');
  assert.strictEqual(env.ejecutar('KodamaVista.leer(390)'), 'semana', 'la elección gana sobre el ancho');
  env.ejecutar('KodamaVista.guardar("dia")');
  assert.strictEqual(env.ejecutar('KodamaVista.leer(1440)'), 'dia');
});
