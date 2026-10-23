'use strict';

/**
 * Checkpoint 6.5 — velocidad y ficha:
 * - el backend lee solo el tramo de filas de las fechas pedidas, y mantiene
 *   Bloques ordenada por fecha para que ese tramo sea corto;
 * - la verificación de estructura corre una vez, no en cada petición;
 * - la caché por semana del navegador y la ficha (duplicar).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------
// Frontend: caché por semana
// ---------------------------------------------------------------

function cargarModulos(archivos) {
  const almacen = new Map();
  const entorno = {
    console,
    Intl,
    localStorage: {
      get length() { return almacen.size; },
      key: (i) => Array.from(almacen.keys())[i] || null,
      getItem: (clave) => (almacen.has(clave) ? almacen.get(clave) : null),
      setItem: (clave, valor) => { almacen.set(clave, String(valor)); },
      removeItem: (clave) => { almacen.delete(clave); }
    }
  };
  vm.createContext(entorno);
  archivos.forEach((archivo) => {
    const ruta = path.join(__dirname, '..', archivo);
    vm.runInContext(fs.readFileSync(ruta, 'utf8'), entorno, { filename: archivo });
  });
  return {
    almacen,
    ejecutar(expresion, argumento) {
      entorno.__arg = argumento === undefined ? undefined : JSON.parse(JSON.stringify(argumento));
      const resultado = vm.runInContext(expresion, entorno);
      return resultado === undefined ? undefined : JSON.parse(JSON.stringify(resultado));
    }
  };
}

const MODULOS_STATE = ['js/api.js', 'js/state.js'];

test('la semana guardada se lee al instante, sin red', () => {
  const env = cargarModulos(MODULOS_STATE);
  assert.strictEqual(env.ejecutar('KodamaState.leerSemana("2026-09-21")'), null);
  env.ejecutar('KodamaState.guardarSemana("2026-09-21", __arg)', [{ id: 'b1', fecha: '2026-09-23', inicio: '09:00' }]);
  assert.deepStrictEqual(env.ejecutar('KodamaState.leerSemana("2026-09-21")').map((b) => b.id), ['b1']);
});

test('se guardan como mucho 12 semanas: las más viejas se borran', () => {
  const env = cargarModulos(MODULOS_STATE);
  for (let i = 0; i < 15; i++) {
    const lunes = '2026-' + String(1 + Math.floor(i / 4)).padStart(2, '0') + '-' + String(1 + (i % 4) * 7).padStart(2, '0');
    env.ejecutar('KodamaState.guardarSemana(__arg, [])', lunes);
  }
  const semanas = Array.from(env.almacen.keys()).filter((k) => k.startsWith('kodama.cache.semana.'));
  assert.strictEqual(semanas.length, 12);
  assert.ok(!semanas.includes('kodama.cache.semana.2026-01-01'), 'la primera guardada se borró');
});

test('las cachés de versiones anteriores se limpian; la configuración no', () => {
  const env = cargarModulos(MODULOS_STATE);
  env.almacen.set('kodama.cache.bloques.2026-09-23', '{}');
  env.almacen.set('kodama.cache.rango.2026-09-21.2026-09-27', '{}');
  env.almacen.set('kodama.config', '{"url":"x","token":"y"}');
  env.almacen.set('kodama.capa', 'Startup');
  env.ejecutar('KodamaState.limpiarCachesViejas()');
  assert.deepStrictEqual(Array.from(env.almacen.keys()).sort(), ['kodama.capa', 'kodama.config']);
});

test('un cambio guardado se aplica al instante en la semana en pantalla', () => {
  const env = cargarModulos(MODULOS_STATE);
  const semana = [
    { id: 'b1', fecha: '2026-09-22', inicio: '09:00', archivado: '' },
    { id: 'b2', fecha: '2026-09-24', inicio: '10:00', archivado: '' }
  ];
  const aplicar = (bloque) => env.ejecutar(
    'KodamaState.aplicarCambio(__arg.semana, __arg.bloque, "2026-09-21", "2026-09-27")',
    { semana, bloque }
  ).map((b) => b.id + '@' + b.fecha + ' ' + b.inicio);

  assert.deepStrictEqual(aplicar({ id: 'b3', fecha: '2026-09-23', inicio: '08:00', archivado: '' }),
    ['b1@2026-09-22 09:00', 'b3@2026-09-23 08:00', 'b2@2026-09-24 10:00'], 'nuevo: entra en orden');
  assert.deepStrictEqual(aplicar({ id: 'b2', fecha: '2026-09-21', inicio: '07:00', archivado: '' }),
    ['b2@2026-09-21 07:00', 'b1@2026-09-22 09:00'], 'movido dentro de la semana: se reubica');
  assert.deepStrictEqual(aplicar({ id: 'b2', fecha: '2026-10-05', inicio: '10:00', archivado: '' }),
    ['b1@2026-09-22 09:00'], 'movido a otra semana: sale');
  assert.deepStrictEqual(aplicar({ id: 'b1', fecha: '2026-09-22', inicio: '09:00', archivado: 'TRUE' }),
    ['b2@2026-09-24 10:00'], 'archivado: sale');
});

// ---------------------------------------------------------------
// Frontend: duplicar desde la ficha
// ---------------------------------------------------------------

test('duplicar copia los datos del bloque (alumnos incluidos) pero no su id ni sus fechas de registro', () => {
  const env = cargarModulos(['js/ui/formulario.js']);
  const copia = env.ejecutar('KodamaFormulario.valoresDuplicado(__arg)', {
    id: 'h1234abcd-2026-09-23', titulo: 'Cálculo II', area: 'Universidad', tipo: 'fijo',
    fecha: '2026-09-23', inicio: '06:45', fin: '08:15', etiqueta: 'aula 4', notas: 'traer calculadora',
    creado: '2026-09-01 10:00', actualizado: '2026-09-02 10:00', archivado: ''
  });
  assert.deepStrictEqual(copia, {
    titulo: 'Cálculo II', area: 'Universidad', tipo: 'fijo', fecha: '2026-09-23',
    inicio: '06:45', fin: '08:15', lugar: '', etiqueta: 'aula 4', notas: 'traer calculadora', alumno_id: ''
  });
});
