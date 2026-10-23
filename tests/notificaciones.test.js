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

function cargarAlarmas(plugin, guardado) {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'js', 'notificaciones.js'), 'utf8');
  const almacen = guardado || {};
  const relojes = [];
  const sandbox = {
    console: console, Date: Date, Math: Math, Number: Number, String: String, JSON: JSON, Promise: Promise,
    setTimeout: function (fn, ms) { relojes.push({ fn: fn, ms: ms, vivo: true }); return relojes.length; },
    clearTimeout: function (id) { if (relojes[id - 1]) relojes[id - 1].vivo = false; },
    localStorage: { getItem: (k) => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = v; } },
    Capacitor: plugin ? { Plugins: { LocalNotifications: plugin } } : undefined
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox);
  return { A: sandbox.KodamaAlarmas, relojes: relojes, almacen: almacen };
}

function pluginFalso() {
  const p = { programadas: [], canceladas: [] };
  p.schedule = async (o) => { p.programadas.push(o.notifications[0]); };
  p.cancel = async (o) => { p.canceladas.push(o.notifications[0].id); };
  return p;
}

const dos = (n) => String(n).padStart(2, '0');
function bloqueEn(horas, extra) {
  const d = new Date(Date.now() + horas * 3600 * 1000);
  return Object.assign({
    id: 'b1', titulo: 'Clase', fecha: d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()),
    inicio: dos(d.getHours()) + ':' + dos(d.getMinutes()), fin: '23:59', archivado: '', estado: 'programada', recordatorio: ''
  }, extra);
}
const esperar = () => new Promise((r) => setImmediate(r));

test('recordatorio: cuándo suena (minutos antes, 0 = al comenzar, nunca en el pasado)', () => {
  const { A } = cargarAlarmas(null);
  const b = bloqueEn(3, { recordatorio: '10' });
  const inicio = new Date(b.fecha + 'T' + b.inicio + ':00').getTime();
  assert.strictEqual(A.momento(b), inicio - 10 * 60000);
  assert.strictEqual(A.momento(Object.assign({}, b, { recordatorio: '0' })), inicio);
  assert.strictEqual(A.momento(Object.assign({}, b, { recordatorio: '' })), null, 'sin recordatorio');
  assert.strictEqual(A.momento(Object.assign({}, b, { estado: 'cancelada' })), null, 'cancelada');
  assert.strictEqual(A.momento(Object.assign({}, b, { archivado: 'TRUE' })), null, 'archivada');
  assert.strictEqual(A.momento(bloqueEn(-1, { recordatorio: '10' })), null, 'ya pasó');
});

test('cargar la semana no llama al sistema por bloques sin recordatorio, ni reprograma lo mismo', async () => {
  const p = pluginFalso();
  const { A } = cargarAlarmas(p);
  A.sincronizarSemana([bloqueEn(3, { id: 'b1' }), bloqueEn(4, { id: 'b2' })]);
  await esperar();
  assert.strictEqual(p.programadas.length + p.canceladas.length, 0);
  const con = bloqueEn(3, { id: 'b3', recordatorio: '15' });
  A.sincronizarSemana([con]);
  A.sincronizarSemana([con]);
  await esperar();
  assert.strictEqual(p.programadas.length, 1, 'una sola vez');
  assert.match(p.programadas[0].title, /^En 15 min: /);
});

test('mover, quitar o cancelar la clase reprograma o cancela su recordatorio', async () => {
  const p = pluginFalso();
  const { A } = cargarAlarmas(p);
  const b = bloqueEn(3, { recordatorio: '5' });
  await A.sincronizarBloque(b);
  await A.sincronizarBloque(bloqueEn(5, { recordatorio: '5' }));
  assert.strictEqual(p.programadas.length, 2, 'movida: se programa en la hora nueva');
  await A.sincronizarBloque(Object.assign({}, b, { recordatorio: '' }));
  assert.strictEqual(p.canceladas.length, 1, 'sin recordatorio: se cancela');
  await A.sincronizarBloque(Object.assign({}, b, { recordatorio: '' }));
  assert.strictEqual(p.canceladas.length, 1, 'lo que no está programado no se vuelve a cancelar');
});

test('sin Capacitor (PWA): reprogramar no deja dos relojes vivos', async () => {
  const { A, relojes } = cargarAlarmas(null);
  const b = bloqueEn(3, { recordatorio: '5' });
  A.sincronizarSemana([b]);
  A.sincronizarSemana([bloqueEn(4, { recordatorio: '5' })]);
  await esperar();
  assert.strictEqual(relojes.filter((r) => r.vivo).length, 1);
  await A.sincronizarBloque(Object.assign({}, b, { recordatorio: '' }));
  assert.strictEqual(relojes.filter((r) => r.vivo).length, 0);
});

test('lo elegido antes en el dispositivo se sube a Supabase una vez; lo de la base manda', async () => {
  const viejo = { b1: { activo: true, minutos: 10 }, b2: { activo: true, minutos: 30 }, b9: { activo: true, minutos: 5 } };
  const { A, almacen } = cargarAlarmas(null, { kodama_alarmas_config: JSON.stringify(viejo) });
  const subidos = [];
  const subir = async (id, minutos) => { subidos.push([id, minutos]); };
  A.migrarDelDispositivo([bloqueEn(3, { id: 'b1' }), bloqueEn(3, { id: 'b2', recordatorio: '60' })], subir);
  await esperar();
  assert.deepStrictEqual(subidos, [['b1', '10']], 'b2 ya tenía uno en la base');
  assert.deepStrictEqual(Object.keys(JSON.parse(almacen.kodama_alarmas_config)), ['b9'], 'b9 espera a que se vea su semana');
  A.migrarDelDispositivo([bloqueEn(3, { id: 'b1' })], subir);
  await esperar();
  assert.strictEqual(subidos.length, 1, 'nunca dos veces');
});

test('si subir falla (sin conexión), queda en el dispositivo para la próxima', async () => {
  const { A, almacen } = cargarAlarmas(null, { kodama_alarmas_config: JSON.stringify({ b1: { activo: true, minutos: 10 } }) });
  A.migrarDelDispositivo([bloqueEn(3, { id: 'b1' })], async () => { throw new Error('sin red'); });
  await esperar();
  assert.ok(JSON.parse(almacen.kodama_alarmas_config).b1);
});
