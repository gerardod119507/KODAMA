'use strict';

/**
 * Actualizador de la APK (js/actualizador.js) con un plugin falso: compara
 * la versión que corre (version.json del paquete) con la publicada, baja
 * solo si son distintas, reusa un paquete ya bajado y aplica con set() al
 * irse a segundo plano o al tocar "Actualizar".
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const codigo = fs.readFileSync(path.join(__dirname, '..', 'js/actualizador.js'), 'utf8');

async function correr({ local, publicada, bajados = [] }) {
  const llamadas = [];
  const oyentes = {};
  const ofrecido = [];
  const updater = {
    notifyAppReady: async () => llamadas.push('listo'),
    list: async () => ({ bundles: bajados }),
    download: async (o) => { llamadas.push('download ' + o.version); return { id: 'nuevo', version: o.version }; },
    next: async (o) => llamadas.push('next ' + o.id),
    set: async (o) => llamadas.push('set ' + o.id)
  };
  const documento = {
    visibilityState: 'visible',
    addEventListener: (ev, fn) => { oyentes[ev] = fn; }
  };
  const ctx = {
    console,
    navigator: { onLine: true },
    document: documento,
    setTimeout: (fn) => fn(),
    KodamaEspera: { ofrecer: (texto, boton, fn) => ofrecido.push({ texto, fn }) },
    fetch: async (url) => {
      const v = String(url).startsWith('http') ? publicada : local;
      return v === undefined ? { ok: false } : { ok: true, json: async () => ({ version: v }) };
    }
  };
  ctx.window = {
    CapacitorUpdater: updater,
    addEventListener: (ev, fn) => { oyentes['window:' + ev] = fn; }
  };
  vm.runInNewContext(codigo, ctx);
  oyentes['window:load']();
  await new Promise((r) => setTimeout(r, 20));
  return {
    llamadas,
    ofrecido,
    irseASegundoPlano: () => { documento.visibilityState = 'hidden'; oyentes.visibilitychange(); }
  };
}

test('al día: no baja nada', async () => {
  const r = await correr({ local: 'abc', publicada: 'abc' });
  assert.deepStrictEqual(r.llamadas, ['listo']);
  assert.strictEqual(r.ofrecido.length, 0);
});

test('la APK recién instalada (sin version.json) se actualiza', async () => {
  const r = await correr({ local: undefined, publicada: 'xyz' });
  assert.deepStrictEqual(r.llamadas, ['listo', 'download xyz', 'next nuevo']);
  assert.strictEqual(r.ofrecido[0].texto, 'Hay una versión nueva');
  r.irseASegundoPlano();
  assert.strictEqual(r.llamadas.at(-1), 'set nuevo', 'al irse a segundo plano se aplica');
});

test('"Actualizar" aplica enseguida, y solo una vez', async () => {
  const r = await correr({ local: 'viejo', publicada: 'nuevo1' });
  r.ofrecido[0].fn();
  r.irseASegundoPlano();
  assert.deepStrictEqual(r.llamadas.filter((l) => l.startsWith('set')), ['set nuevo']);
});

test('si ya estaba bajada, no la baja otra vez', async () => {
  const r = await correr({ local: 'viejo', publicada: 'v2', bajados: [{ id: 'b7', version: 'v2', status: 'success' }] });
  assert.deepStrictEqual(r.llamadas, ['listo', 'next b7']);
});
