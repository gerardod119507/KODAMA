'use strict';

/**
 * Pruebas de la lógica pura del frontend (sin navegador): el filtro de
 * capas y la regla que decide qué bloques se dibujan lado a lado.
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
const MODULOS_DIA = ['js/ui/iconos.js', 'js/ui/espiritu.js', 'js/ui/dia.js'];

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
// Bloques simultáneos (sin avisos de choque: solo lado a lado)
// ---------------------------------------------------------------

function agrupar(env, bloques) {
  const grupos = env.ejecutar('KodamaDia.agruparPorSolapamiento(__arg)', bloques);
  return grupos.map((grupo) => grupo.map((b) => b.inicio));
}

test('bloques que no se pisan quedan cada uno en su fila', () => {
  const env = cargarModulos(MODULOS_DIA);
  const bloques = [bloque('09:00', '10:00', 'Universidad'), bloque('11:00', '12:00', 'Startup')];
  assert.deepStrictEqual(agrupar(env, bloques), [['09:00'], ['11:00']]);
});

test('dos bloques que se pisan van juntos en una fila', () => {
  const env = cargarModulos(MODULOS_DIA);
  const bloques = [bloque('09:00', '10:00', 'Universidad'), bloque('09:30', '10:30', 'Startup')];
  assert.deepStrictEqual(agrupar(env, bloques), [['09:00', '09:30']]);
});

test('una cadena de solapamientos (A-B, B-C) queda toda en la misma fila', () => {
  const env = cargarModulos(MODULOS_DIA);
  const bloques = [
    bloque('09:00', '10:00', 'Universidad'),
    bloque('09:45', '11:00', 'Startup'),
    bloque('10:30', '12:00', 'Personal')
  ];
  assert.deepStrictEqual(agrupar(env, bloques), [['09:00', '09:45', '10:30']]);
});

test('un bloque que termina justo cuando arranca el siguiente NO se considera solapado', () => {
  const env = cargarModulos(MODULOS_DIA);
  const bloques = [bloque('09:00', '10:00', 'Universidad'), bloque('10:00', '11:00', 'Startup')];
  assert.deepStrictEqual(agrupar(env, bloques), [['09:00'], ['10:00']]);
});

test('un bloque contenido dentro de otro va en la misma fila', () => {
  const env = cargarModulos(MODULOS_DIA);
  const bloques = [bloque('09:00', '13:00', 'Universidad'), bloque('10:00', '10:30', 'Startup')];
  assert.deepStrictEqual(agrupar(env, bloques), [['09:00', '10:00']]);
});

test('una lista vacía no produce filas', () => {
  const env = cargarModulos(MODULOS_DIA);
  assert.deepStrictEqual(agrupar(env, []), []);
});
