'use strict';

/**
 * Pruebas de la lógica pura del frontend (sin navegador): el filtro de
 * capas. El reparto lado a lado y los solapados están en semana.test.js y
 * huecos.test.js (la vista de día usa la misma grilla que la semana).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function cargarModulos(archivos) {
  const almacen = {};
  const entorno = {
    console,
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
    /**
     * Los módulos del navegador se declaran con `const`, que no queda como
     * propiedad del objeto global, así que hay que evaluarlos dentro del
     * sandbox. El resultado se clona para que quede en el realm del test y
     * assert.deepStrictEqual funcione.
     */
    ejecutar(expresion, argumento) {
      entorno.__arg = argumento === undefined ? undefined : JSON.parse(JSON.stringify(argumento));
      const resultado = vm.runInContext(expresion, entorno);
      return resultado === undefined ? undefined : JSON.parse(JSON.stringify(resultado));
    }
  };
}

const MODULOS_CAPAS = ['js/capas.js'];

function bloque(inicio, fin, area) {
  return { titulo: area + ' ' + inicio, area: area, tipo: 'fijo', inicio: inicio, fin: fin };
}

// ---------------------------------------------------------------
// Capas
// ---------------------------------------------------------------

test('la capa General no filtra nada', () => {
  const env = cargarModulos(MODULOS_CAPAS);
  const bloques = [bloque('09:00', '10:00', 'Universidad'), bloque('15:00', '16:00', 'Startup')];
  const resultado = env.ejecutar('KodamaCapas.filtrar(__arg, "General")', bloques);
  assert.strictEqual(resultado.length, 2);
});

test('una capa de área deja solo los bloques de esa área', () => {
  const env = cargarModulos(MODULOS_CAPAS);
  const bloques = [
    bloque('09:00', '10:00', 'Universidad'),
    bloque('11:00', '12:00', 'Academia Fractal'),
    bloque('15:00', '16:00', 'Startup')
  ];
  const resultado = env.ejecutar('KodamaCapas.filtrar(__arg, "Academia Fractal")', bloques);
  assert.strictEqual(resultado.length, 1);
  assert.strictEqual(resultado[0].area, 'Academia Fractal');
});

test('la capa se guarda y se recupera del dispositivo', () => {
  const env = cargarModulos(MODULOS_CAPAS);
  assert.strictEqual(env.ejecutar('KodamaCapas.leer()'), 'General', 'sin nada guardado, arranca en General');

  env.ejecutar('KodamaCapas.guardar("Startup")');
  assert.strictEqual(env.ejecutar('KodamaCapas.leer()'), 'Startup');
});

test('una capa guardada que ya no existe vuelve a General', () => {
  const env = cargarModulos(MODULOS_CAPAS);
  env.ejecutar('KodamaCapas.guardar("Area Inventada")');
  assert.strictEqual(env.ejecutar('KodamaCapas.leer()'), 'General');
});

test('las capas son General más las 4 áreas', () => {
  const env = cargarModulos(MODULOS_CAPAS);
  assert.deepStrictEqual(env.ejecutar('KodamaCapas.CAPAS'), [
    'General', 'Universidad', 'Academia Fractal', 'Startup', 'Personal'
  ]);
});

// ---------------------------------------------------------------
// Capa filtrada: los bloques de otras áreas se dibujan como "ocupado"
// ---------------------------------------------------------------

test('en General todos los bloques se muestran completos', () => {
  const env = cargarModulos(MODULOS_CAPAS);
  assert.strictEqual(env.ejecutar('KodamaCapas.esDeLaCapa(__arg, "General")', bloque('09:00', '10:00', 'Personal')), true);
});

test('en una capa, solo los de esa área se muestran completos; el resto es "ocupado"', () => {
  const env = cargarModulos(MODULOS_CAPAS);
  assert.strictEqual(env.ejecutar('KodamaCapas.esDeLaCapa(__arg, "Startup")', bloque('09:00', '10:00', 'Startup')), true);
  assert.strictEqual(env.ejecutar('KodamaCapas.esDeLaCapa(__arg, "Startup")', bloque('09:00', '10:00', 'Personal')), false);
});
