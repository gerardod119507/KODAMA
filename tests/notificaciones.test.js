'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('js/notificaciones.js define window.programarAlarmaKodama y maneja Capacitor LocalNotifications', async () => {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'js', 'notificaciones.js'), 'utf8');

  let canalCreado = null;
  let notificacionProgramada = null;

  const mockLocalNotifications = {
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => ({ display: 'granted' }),
    createChannel: async (opts) => {
      canalCreado = opts;
    },
    schedule: async (opts) => {
      notificacionProgramada = opts;
      return { notifications: opts.notifications };
    },
    cancel: async () => ({})
  };

  const sandbox = {
    console: console,
    Date: Date,
    Math: Math,
    Number: Number,
    String: String,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Capacitor: {
      Plugins: {
        LocalNotifications: mockLocalNotifications
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox);

  assert.strictEqual(typeof sandbox.window.programarAlarmaKodama, 'function');
  assert.strictEqual(typeof sandbox.window.cancelarAlarmaKodama, 'function');

  const fechaAlarma = new Date(Date.now() + 60000);
  const resultado = await sandbox.window.programarAlarmaKodama(101, 'Clase de Álgebra', 'Aula E511', fechaAlarma);

  assert.strictEqual(resultado.ok, true);
  assert.strictEqual(resultado.id, 101);

  // Verificar canal con importance: 5 y vibration: true
  assert.ok(canalCreado, 'El canal debe haberse creado');
  assert.strictEqual(canalCreado.importance, 5, 'Canal debe tener importance: 5');
  assert.strictEqual(canalCreado.vibration, true, 'Canal debe tener vibration: true');

  // Verificar programación con allowWhileIdle: true
  assert.ok(notificacionProgramada, 'Debe haberse programado la notificación');
  assert.strictEqual(notificacionProgramada.notifications.length, 1);
  const notif = notificacionProgramada.notifications[0];
  assert.strictEqual(notif.id, 101);
  assert.strictEqual(notif.title, 'Clase de Álgebra');
  assert.strictEqual(notif.body, 'Aula E511');
  assert.strictEqual(notif.channelId, 'kodama_alarmas');
  assert.strictEqual(notif.schedule.allowWhileIdle, true, 'Debe programar con allowWhileIdle: true');
});

function cargarAlarmas(plugin) {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'js', 'notificaciones.js'), 'utf8');
  const guardado = {};
  const relojes = [];
  const sandbox = {
    console: console, Date: Date, Math: Math, Number: Number, String: String, JSON: JSON,
    setTimeout: function (fn, ms) { relojes.push({ fn: fn, ms: ms, vivo: true }); return relojes.length; },
    clearTimeout: function (id) { if (relojes[id - 1]) relojes[id - 1].vivo = false; },
    localStorage: { getItem: (k) => guardado[k] || null, setItem: (k, v) => { guardado[k] = v; } },
    Capacitor: plugin ? { Plugins: { LocalNotifications: plugin } } : undefined
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox);
  return { A: sandbox.KodamaAlarmas, relojes: relojes };
}

function bloqueFuturo(id) {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  const dos = (n) => String(n).padStart(2, '0');
  return {
    id: id, titulo: 'Clase', fecha: d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()),
    inicio: dos(d.getHours()) + ':' + dos(d.getMinutes()), fin: '23:59', archivado: '', estado: 'programada'
  };
}

test('alarmas: cargar la semana no llama al sistema por bloques sin recordatorio', async () => {
  let llamadas = 0;
  const plugin = { schedule: async () => { llamadas++; }, cancel: async () => { llamadas++; } };
  const { A } = cargarAlarmas(plugin);
  A.sincronizarSemana([bloqueFuturo('b1'), bloqueFuturo('b2')]);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(llamadas, 0);
});

test('alarmas: archivado "FALSE"/vacío no cancela; "TRUE" sí', async () => {
  const programadas = [];
  const canceladas = [];
  const plugin = { schedule: async (o) => { programadas.push(o); }, cancel: async (o) => { canceladas.push(o); } };
  const { A } = cargarAlarmas(plugin);
  const b = bloqueFuturo('b1');
  await A.configurarYProgramar(b, '10');
  assert.strictEqual(programadas.length, 1);
  await A.sincronizarBloque(Object.assign({}, b, { archivado: 'TRUE' }));
  assert.strictEqual(canceladas.length, 1);
  assert.strictEqual(A.obtenerConfig('b1'), null, 'archivado borra el recordatorio');
});

test('alarmas sin Capacitor (PWA): reprogramar no deja dos relojes vivos', async () => {
  const { A, relojes } = cargarAlarmas(null);
  const b = bloqueFuturo('b1');
  await A.configurarYProgramar(b, '5');
  A.sincronizarSemana([b]);
  A.sincronizarSemana([b]);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(relojes.filter((r) => r.vivo).length, 1);
  await A.configurarYProgramar(b, 'ninguna');
  assert.strictEqual(relojes.filter((r) => r.vivo).length, 0);
});
