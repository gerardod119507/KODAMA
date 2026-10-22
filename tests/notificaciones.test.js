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
