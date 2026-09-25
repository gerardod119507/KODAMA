'use strict';

/**
 * Checkpoint 10: el atractor de Lorenz de la pantalla de carga (js/lorenz.js).
 * Que las ecuaciones estén bien, que la trayectoria se quede en el atractor
 * (no se escapa ni se apaga), que cada carga arranque distinta y que la
 * figura quepa en la pantalla.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function cargar() {
  const entorno = { Math };
  vm.createContext(entorno);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'lorenz.js'), 'utf8'), entorno);
  return (expresion, arg) => {
    entorno.__arg = arg;
    return JSON.parse(JSON.stringify(vm.runInContext(expresion, entorno)));
  };
}

test('las ecuaciones de Lorenz (σ=10, ρ=28, β=8/3)', () => {
  const ej = cargar();
  // en (1, 1, 1): σ(y−x)=0, x(ρ−z)−y=26, xy−βz=1−8/3
  const d = ej('KodamaLorenz.derivada([1, 1, 1])');
  assert.strictEqual(d[0], 0);
  assert.strictEqual(d[1], 26);
  assert.ok(Math.abs(d[2] - (1 - 8 / 3)) < 1e-12);
});

test('Runge-Kutta: con paso chico coincide con muchos pasos más chicos', () => {
  const ej = cargar();
  const grueso = ej('(function(){ let p=[1,1,1]; for (let i=0;i<100;i++) p=KodamaLorenz.paso(p,0.001); return p; })()');
  const fino = ej('(function(){ let p=[1,1,1]; for (let i=0;i<1000;i++) p=KodamaLorenz.paso(p,0.0001); return p; })()');
  grueso.forEach((v, i) => assert.ok(Math.abs(v - fino[i]) < 1e-6, 'coordenada ' + i));
});

test('la trayectoria se queda en el atractor: ni se escapa ni se apaga', () => {
  const ej = cargar();
  const pts = ej('KodamaLorenz.trayectoria([-12, 15, 38], 6000, 0.008)');
  assert.strictEqual(pts.length, 6000);
  pts.forEach((p) => {
    assert.ok(Math.abs(p[0]) < 25 && Math.abs(p[1]) < 35 && p[2] > -1 && p[2] < 55, 'fuera: ' + p);
  });
  // pasa por las dos alas (x positivo y negativo) una vez asentada
  const asentada = pts.slice(2000);
  assert.ok(asentada.some((p) => p[0] > 5) && asentada.some((p) => p[0] < -5), 'recorre las dos alas');
});

test('cada carga arranca de un punto distinto (y dentro de la zona del atractor)', () => {
  const ej = cargar();
  const a = ej('KodamaLorenz.puntoInicial()');
  const b = ej('KodamaLorenz.puntoInicial()');
  assert.notDeepStrictEqual(a, b);
  // con un azar fijo es reproducible
  assert.deepStrictEqual(ej('KodamaLorenz.puntoInicial(() => 0.5)'), [0, 0, 22.5]);
  assert.deepStrictEqual(ej('KodamaLorenz.puntoInicial(() => 0)'), [-15, -20, 5]);
});

test('la figura proyectada entra en un cuadro de ±30 (la pantalla escala a eso)', () => {
  const ej = cargar();
  const q = ej('KodamaLorenz.trayectoria([1, 1, 1], 6000, 0.008).map(KodamaLorenz.proyectar)');
  q.forEach((p) => assert.ok(Math.abs(p[0]) <= 30 && Math.abs(p[1]) <= 30, 'afuera: ' + p));
});
