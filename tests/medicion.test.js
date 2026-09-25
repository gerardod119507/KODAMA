'use strict';

/**
 * Medición de rendimiento (js/medicion.js + js/api.js): qué es red, qué es
 * servidor, qué es render; llamadas en paralelo; que "guardar" no se lleve
 * la recarga posterior; el resumen (promedio, peor caso, sin contar las que
 * fallaron) y las últimas 20. Reloj falso: las pruebas no dependen de la
 * velocidad de la máquina. Además, que el backend mande "ms".
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { crearEntorno } = require('./fake-google');

function cargar() {
  const almacen = {};
  const reloj = { t: 1000 };
  const pendientes = [];
  const eventos = {};
  const entorno = {
    console, JSON, Math, Date, Promise,
    performance: { now: () => reloj.t },
    localStorage: {
      getItem: (k) => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: (k) => { delete almacen[k]; }
    },
    // Cuadros y timers a mano: pintar() avanza el reloj y los dispara.
    requestAnimationFrame: (fn) => pendientes.push(fn),
    setTimeout: (fn) => pendientes.push(fn),
    document: { visibilityState: 'visible' },
    addEventListener: (nombre, fn) => { eventos[nombre] = fn; }
  };
  vm.createContext(entorno);
  ['js/medicion.js', 'js/api.js'].forEach((archivo) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8'), entorno, { filename: archivo });
  });
  const M = vm.runInContext('KodamaMedicion', entorno);
  return {
    entorno, M, almacen, reloj, eventos,
    avanzar: (ms) => { reloj.t += ms; },
    /** Corre los cuadros/timers pendientes (y los que ellos agenden) avanzando el reloj. */
    pintar: async (ms) => {
      reloj.t += ms || 0;
      while (pendientes.length) {
        pendientes.shift()();
        await Promise.resolve();
      }
      await new Promise((r) => setImmediate(r));
    },
    leer: () => JSON.parse(JSON.stringify(M.leer()))
  };
}

test('una llamada: red de punta a punta y servidor aparte; todas quedan registradas', () => {
  const { M, avanzar, leer } = cargar();
  const fin = M.llamada();
  avanzar(1800);
  fin('listarBloquesRango', 400, true);
  const [m] = leer();
  assert.deepStrictEqual([m.tipo, m.accion, m.red, m.servidor, m.total, m.ok], ['llamada', 'listarBloquesRango', 1800, 400, 1800, true]);
});

test('operación: red, servidor, render y total; lo demás es "resto"', async () => {
  const { M, avanzar, pintar, leer } = cargar();
  const op = M.empezar('guardar');
  avanzar(10);
  const fin = M.llamada();
  avanzar(1500);
  fin('crearBloque', 300, true);
  op.cerrarRed();
  op.render(() => avanzar(30));
  const p = op.pintado();
  await pintar(20);
  await p;
  op.terminar(true);
  const g = leer().find((x) => x.tipo === 'guardar');
  assert.deepStrictEqual([g.red, g.servidor, g.render, g.total, g.ok], [1500, 300, 50, 1560, true]);
  const r = M.resumen(leer()).find((x) => x.tipo === 'guardar');
  assert.strictEqual(r.resto, 10);
});

test('cerrarRed: la recarga que sale después de guardar no se suma a "guardar"', () => {
  const { M, avanzar, leer } = cargar();
  const op = M.empezar('guardar');
  const a = M.llamada();
  avanzar(1000);
  a('crearBloque', 200, true);
  op.cerrarRed();
  const recarga = M.llamada();
  avanzar(2000);
  op.terminar(true);
  recarga('listarBloquesRango', 300, true);
  const g = leer().find((x) => x.tipo === 'guardar');
  assert.deepStrictEqual([g.red, g.servidor], [1000, 200]);
});

test('dos llamadas en paralelo: la red cuenta el tramo una sola vez', () => {
  const { M, avanzar, leer } = cargar();
  const op = M.empezar('estadisticas');
  const a = M.llamada();
  avanzar(100);
  const b = M.llamada();
  avanzar(900);
  a('listarAlumnos', 150, true); // 0–1000
  avanzar(500);
  b('listarBloquesRango', 700, true); // 100–1500
  op.terminar(true);
  const e = leer().find((x) => x.tipo === 'estadisticas');
  assert.strictEqual(e.red, 1500, 'de 0 a 1500, no 1000 + 1400');
  assert.ok(e.servidor <= e.red, 'el servidor nunca pasa a la red');
});

test('apertura: el reloj arranca con la página; "vista" es cuándo se vio algo (antes de la red)', async () => {
  const { M, avanzar, pintar, leer } = cargar(); // performance.now() = 1000: la página ya lleva 1 s
  const op = M.empezar('apertura', { desdeNavegacion: true });
  op.render(() => avanzar(20)); // lo guardado en el dispositivo
  op.marcarVista();
  await pintar(10); // se pintó a los 1030
  const fin = M.llamada();
  avanzar(2000);
  fin('listarBloquesRango', 500, true);
  op.render(() => avanzar(20));
  const p = op.pintado();
  await pintar(10);
  await p;
  op.terminar(true);
  const a = leer().find((x) => x.tipo === 'apertura');
  assert.deepStrictEqual([a.total, a.vista, a.red, a.render], [3060, 1030, 2000, 50]);
});

test('resumen: promedio y peor sin las que fallaron; orden apertura, guardar, generar, estadísticas, llamadas', () => {
  const { M } = cargar();
  const lista = [
    { tipo: 'llamada', accion: 'ping', ok: true, red: 900, servidor: 20, total: 900 },
    { tipo: 'guardar', ok: true, red: 1000, servidor: 200, render: 40, total: 1100 },
    { tipo: 'guardar', ok: true, red: 3000, servidor: 400, render: 60, total: 3100 },
    { tipo: 'guardar', ok: false, red: 30000, servidor: 0, render: 0, total: 30000 },
    { tipo: 'apertura', ok: true, red: 1500, servidor: 300, render: 50, total: 2000, vista: 400 }
  ];
  const r = JSON.parse(JSON.stringify(M.resumen(lista)));
  assert.deepStrictEqual(r.map((x) => x.clave), ['apertura', 'guardar', 'llamada:ping']);
  const g = r[1];
  assert.deepStrictEqual([g.n, g.errores, g.total, g.peor, g.red, g.servidor, g.render, g.resto], [3, 1, 2100, 3100, 2000, 300, 50, 50]);
  assert.strictEqual(r[0].vista, 400);
  assert.strictEqual(r[2].render, null, 'una llamada no tiene render');
});

test('se guardan como mucho 300 (las más viejas se van); "últimas 20" empieza por la más nueva', () => {
  const { M } = cargar();
  for (let i = 0; i < 310; i++) M.registrar({ tipo: 'llamada', accion: 'a' + i, ok: true, red: i, total: i });
  const lista = M.leer();
  assert.strictEqual(lista.length, 300);
  assert.strictEqual(lista[0].accion, 'a10');
  const u = JSON.parse(JSON.stringify(M.ultimas(20)));
  assert.strictEqual(u.length, 20);
  assert.deepStrictEqual([u[0].accion, u[19].accion, u[0].nombre], ['a309', 'a290', 'Llamada · a309']);
});

test('textos: ms, segundos con coma, porcentaje', () => {
  const { M } = cargar();
  assert.deepStrictEqual([M.texto(340), M.texto(1840), M.texto(12400), M.texto(null)], ['340 ms', '1,8 s', '12 s', '—']);
  assert.deepStrictEqual([M.porcentaje(450, 1800), M.porcentaje(null, 10), M.porcentaje(5, 0)], [25, null, null]);
});

test('sin almacenamiento en el dispositivo, medir no rompe nada', () => {
  const { entorno, M } = cargar();
  entorno.localStorage.setItem = () => { throw new Error('lleno'); };
  entorno.localStorage.getItem = () => { throw new Error('bloqueado'); };
  assert.doesNotThrow(() => M.llamada()('ping', 5, true));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(M.leer())), []);
});

test('al irse de la página, una llamada cortada no se anota como falla', () => {
  const { M, eventos, leer } = cargar();
  const fin = M.llamada();
  eventos.pagehide();
  fin('listarAlumnos', null, false);
  assert.strictEqual(leer().length, 0);
  eventos.pageshow(); // volvió (atrás/adelante): las fallas vuelven a contar
  M.llamada()('ping', null, false);
  assert.strictEqual(leer().length, 1);
});

test('KodamaApi.llamar mide cada llamada: servidor desde "ms"; sin red se anota como fallida', async () => {
  const { entorno, avanzar, leer } = cargar();
  entorno.fetch = async () => {
    avanzar(1200);
    return { text: async () => JSON.stringify({ ok: false, error: 'bloque_no_encontrado', ms: 80 }) };
  };
  const r = await vm.runInContext('KodamaApi.llamar("u", "t", "archivarBloque", {})', entorno);
  assert.strictEqual(r.error, 'bloque_no_encontrado');
  entorno.fetch = async () => { avanzar(300); throw new Error('Failed to fetch'); };
  await assert.rejects(vm.runInContext('KodamaApi.llamar("u", "t", "ping")', entorno));
  const [a, b] = leer();
  assert.deepStrictEqual([a.accion, a.red, a.servidor, a.ok], ['archivarBloque', 1200, 80, true], 'un error del backend igual es un viaje completo');
  assert.deepStrictEqual([b.accion, b.red, b.servidor, b.ok], ['ping', 300, null, false]);
});

test('el backend manda "ms" (lo que tardó su código) con token válido, y no sin token', () => {
  const env = crearEntorno({ ahora: '2026-09-25T14:30:00Z', token: 'tk' });
  const bien = env.post({ token: 'tk', action: 'ping' });
  assert.ok(bien.ok);
  assert.strictEqual(typeof bien.ms, 'number');
  assert.ok(bien.ms >= 0);
  const mal = env.post({ token: 'tk', action: 'noExiste' });
  assert.strictEqual(typeof mal.ms, 'number', 'también en un error del backend');
  assert.deepStrictEqual(env.post({ token: 'otro', action: 'ping' }), { ok: false, error: 'no_autorizado' });
});
