/**
 * Recordatorios de clases (KodamaAlarmas).
 *
 * El recordatorio vive en el bloque (columna `recordatorio` de Supabase,
 * migración 004: minutos antes de empezar, "" = ninguno), así lo comparten
 * el celular y la computadora. Este archivo solo lo PROGRAMA en el
 * dispositivo cada vez que la app carga una semana o cambia un bloque:
 *
 * - En la APK: @capacitor/local-notifications, canal de alta importancia
 *   y allowWhileIdle, para que suene aunque el celular esté en reposo.
 *   Se recuerda qué se programó (localStorage) para no reprogramar lo
 *   mismo en cada carga y para cancelar lo que ya no corresponde.
 * - En el navegador (PWA): un reloj por recordatorio mientras la página
 *   esté abierta (es lo único que permite la web sin servidor de push).
 *
 * Hasta octubre de 2026 la elección vivía solo en el dispositivo
 * (kodama_alarmas_config). migrarDelDispositivo() la sube a Supabase la
 * primera vez que ve cada bloque, y después la borra del dispositivo.
 *
 * El permiso de notificaciones se pide recién al programar el primer
 * recordatorio (si no, el diálogo de Android tapaba la animación de
 * arranque).
 */
(function (global) {
  'use strict';

  var CANAL_ID = 'kodama_alarmas';
  var CLAVE_VIEJA = 'kodama_alarmas_config';
  var CLAVE_PROGRAMADAS = 'kodama.alarmas.programadas';
  var canalListo = false;
  // Navegador: un reloj por alarma, así reprogramar no la hace sonar dos veces.
  var relojesWeb = {};
  var programadasEnMemoria = {};

  function obtenerPlugin() {
    if (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.LocalNotifications) {
      return global.Capacitor.Plugins.LocalNotifications;
    }
    return global.LocalNotifications || null;
  }

  function leerJSON(clave) {
    try {
      var texto = global.localStorage && global.localStorage.getItem(clave);
      return texto ? JSON.parse(texto) : {};
    } catch (e) {
      return {};
    }
  }

  function escribirJSON(clave, valor) {
    try {
      if (global.localStorage) global.localStorage.setItem(clave, JSON.stringify(valor));
    } catch (e) { /* sin almacenamiento: solo se reprograma de más */ }
  }

  // Lo programado en el dispositivo: id → instante (ms). En la APK se
  // guarda (las notificaciones nativas sobreviven a cerrar la app); en el
  // navegador no (los relojes mueren con la página).
  function programadas() {
    return obtenerPlugin() ? leerJSON(CLAVE_PROGRAMADAS) : programadasEnMemoria;
  }

  function guardarProgramadas(mapa) {
    if (obtenerPlugin()) escribirJSON(CLAVE_PROGRAMADAS, mapa);
    else programadasEnMemoria = mapa;
  }

  async function asegurarCanalYPermisos(plugin) {
    try {
      if (plugin.checkPermissions && plugin.requestPermissions) {
        var permiso = await plugin.checkPermissions();
        if (permiso.display !== 'granted') await plugin.requestPermissions();
      }
    } catch (e) {
      console.warn('[KODAMA Notificaciones] Error verificando permisos:', e);
    }
    if (!canalListo && plugin.createChannel) {
      try {
        await plugin.createChannel({
          id: CANAL_ID,
          name: 'Alarmas KODAMA',
          description: 'Recordatorios de clases de KODAMA',
          importance: 5,
          vibration: true,
          visibility: 1,
          lights: true,
          lightColor: '#071743'
        });
        canalListo = true;
      } catch (e) {
        console.warn('[KODAMA Notificaciones] Error creando canal:', e);
      }
    }
  }

  /** Id numérico para Android a partir de cualquier texto ("bloque_b1a2…"). */
  function sanitizarId(idNumero) {
    var num = Number(idNumero);
    if (Number.isInteger(num) && num > 0) return num % 2147483647;
    var texto = String(idNumero);
    var hash = 0;
    for (var i = 0; i < texto.length; i++) {
      hash = ((hash << 5) - hash) + texto.charCodeAt(i);
      hash |= 0;
    }
    return (Math.abs(hash) % 2147483647) || 1;
  }

  /** Programa una notificación en el momento `fechaHora`. */
  async function programarAlarmaKodama(idNumero, titulo, mensaje, fechaHora) {
    var plugin = obtenerPlugin();
    var id = sanitizarId(idNumero);
    var fecha = fechaHora instanceof Date ? fechaHora : new Date(fechaHora);
    if (isNaN(fecha.getTime())) return { ok: false, error: 'Fecha inválida' };

    if (plugin && plugin.schedule) {
      try {
        await asegurarCanalYPermisos(plugin);
        await plugin.schedule({
          notifications: [{
            id: id,
            title: String(titulo || 'KODAMA'),
            body: String(mensaje || ''),
            channelId: CANAL_ID,
            smallIcon: 'ic_stat_kodama',
            iconColor: '#071743',
            schedule: { at: fecha, allowWhileIdle: true }
          }]
        });
        return { ok: true, id: id };
      } catch (err) {
        console.error('[KODAMA Notificaciones] Error al programar:', err);
        return { ok: false, error: err };
      }
    }

    // Navegador: solo mientras la página esté abierta.
    if (relojesWeb[id]) clearTimeout(relojesWeb[id]);
    delete relojesWeb[id];
    var retraso = fecha.getTime() - Date.now();
    if (retraso > 0 && retraso < 2147483647) {
      if (global.Notification && global.Notification.permission === 'default' && global.Notification.requestPermission) {
        global.Notification.requestPermission();
      }
      relojesWeb[id] = setTimeout(function () {
        delete relojesWeb[id];
        if (global.Notification && global.Notification.permission === 'granted') {
          new global.Notification(titulo || 'KODAMA', { body: mensaje });
        }
      }, retraso);
    }
    return { ok: true, id: id, simulado: true };
  }

  async function cancelarAlarmaKodama(idNumero) {
    var plugin = obtenerPlugin();
    var id = sanitizarId(idNumero);
    if (relojesWeb[id]) clearTimeout(relojesWeb[id]);
    delete relojesWeb[id];
    if (plugin && plugin.cancel) {
      try {
        await plugin.cancel({ notifications: [{ id: id }] });
      } catch (err) {
        return { ok: false, error: err };
      }
    }
    return { ok: true };
  }

  /** Cuándo debe sonar el recordatorio de un bloque (ms), o null si no corresponde. */
  function momentoDelRecordatorio(bloque, ahora) {
    if (!bloque || bloque.archivado === 'TRUE' || bloque.archivado === true) return null;
    if (bloque.estado === 'cancelada') return null;
    var texto = String(bloque.recordatorio === undefined || bloque.recordatorio === null ? '' : bloque.recordatorio).trim();
    if (texto === '' || !bloque.fecha || !bloque.inicio) return null;
    var minutos = Number(texto);
    if (!Number.isInteger(minutos) || minutos < 0) return null;
    // Hora del dispositivo (en Bolivia, la de La Paz).
    var clase = new Date(bloque.fecha + 'T' + bloque.inicio + ':00');
    if (isNaN(clase.getTime())) return null;
    var momento = clase.getTime() - minutos * 60000;
    return momento > (ahora === undefined ? Date.now() : ahora) ? momento : null;
  }

  /** Deja el dispositivo de acuerdo con el bloque: programa, reprograma o cancela. */
  function sincronizarAlarmaDeBloque(bloque) {
    if (!bloque || !bloque.id) return Promise.resolve();
    var clave = 'bloque_' + bloque.id;
    var mapa = programadas();
    var momento = momentoDelRecordatorio(bloque);

    if (momento === null) {
      if (!(clave in mapa)) return Promise.resolve(); // nunca se programó: nada que hacer
      delete mapa[clave];
      guardarProgramadas(mapa);
      return cancelarAlarmaKodama(clave);
    }
    if (mapa[clave] === momento) return Promise.resolve(); // ya está programada así

    mapa[clave] = momento;
    guardarProgramadas(mapa);
    var minutos = Number(bloque.recordatorio);
    var titulo = (minutos > 0 ? 'En ' + minutos + ' min: ' : '') + (bloque.tituloMostrado || bloque.titulo || 'Clase');
    var mensaje = (bloque.lugar ? bloque.lugar + ' · ' : '') + bloque.inicio + '–' + (bloque.fin || '');
    return programarAlarmaKodama(clave, titulo, mensaje, new Date(momento));
  }

  function sincronizarAlarmasSemana(bloques) {
    if (Array.isArray(bloques)) bloques.forEach(sincronizarAlarmaDeBloque);
  }

  /**
   * Sube a Supabase lo elegido cuando el recordatorio vivía solo en el
   * dispositivo. `subir(id, minutos)` guarda en el bloque; si sale bien,
   * se borra del dispositivo. Un bloque que ya tiene recordatorio en la
   * base manda: lo del dispositivo se descarta.
   */
  function migrarDelDispositivo(bloques, subir) {
    var viejo = leerJSON(CLAVE_VIEJA);
    if (!Array.isArray(bloques) || !Object.keys(viejo).length) return;
    bloques.forEach(function (bloque) {
      var cfg = viejo[bloque.id];
      if (!cfg) return;
      delete viejo[bloque.id];
      escribirJSON(CLAVE_VIEJA, viejo);
      if (String(bloque.recordatorio || '') !== '' || !cfg.activo) return;
      Promise.resolve(subir(bloque.id, String(Number(cfg.minutos) || 0))).catch(function () {
        // Sin conexión: se devuelve al dispositivo para intentarlo la próxima vez.
        var deNuevo = leerJSON(CLAVE_VIEJA);
        deNuevo[bloque.id] = cfg;
        escribirJSON(CLAVE_VIEJA, deNuevo);
      });
    });
  }

  global.programarAlarmaKodama = programarAlarmaKodama;
  global.cancelarAlarmaKodama = cancelarAlarmaKodama;
  global.KodamaAlarmas = {
    programar: programarAlarmaKodama,
    cancelar: cancelarAlarmaKodama,
    momento: momentoDelRecordatorio,
    sincronizarBloque: sincronizarAlarmaDeBloque,
    sincronizarSemana: sincronizarAlarmasSemana,
    migrarDelDispositivo: migrarDelDispositivo
  };
})(typeof window !== 'undefined' ? window : globalThis);
