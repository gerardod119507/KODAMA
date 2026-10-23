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

const MODULOS_SEMANA = ['js/fecha.js', 'js/clases.js', 'js/ui/iconos.js', 'js/ui/espiritu.js', 'js/ui/dia.js', 'js/ui/semana.js'];

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
