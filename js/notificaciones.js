/**
 * Integración de alarmas y recordatorios nativos para KODAMA.
 * Utiliza @capacitor/local-notifications en Android con canal de alta importancia (importance: 5, vibration: true)
 * y allowWhileIdle: true para asegurar que las alarmas suenen puntualmente incluso en suspensión.
 */
(function (global) {
  'use strict';

  var CANAL_ID = 'kodama_alarmas';
  var canalListo = false;

  function obtenerPlugin() {
    if (typeof global !== 'undefined' && global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.LocalNotifications) {
      return global.Capacitor.Plugins.LocalNotifications;
    }
    if (typeof global !== 'undefined' && global.LocalNotifications) {
      return global.LocalNotifications;
    }
    return null;
  }

  async function asegurarCanalYPermisos(plugin) {
    if (!plugin) return;
    try {
      if (plugin.checkPermissions && plugin.requestPermissions) {
        var perm = await plugin.checkPermissions();
        if (perm.display !== 'granted') {
          await plugin.requestPermissions();
        }
      }
    } catch (e) {
      console.warn('[KODAMA Notificaciones] Error verificando permisos:', e);
    }

    if (!canalListo && plugin.createChannel) {
      try {
        await plugin.createChannel({
          id: CANAL_ID,
          name: 'Alarmas KODAMA',
          description: 'Alarmas, temporizadores y recordatorios de clases de KODAMA',
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

  function sanitizarId(idNumero) {
    var num = Number(idNumero);
    if (!Number.isInteger(num) || isNaN(num) || num <= 0) {
      var str = String(idNumero || Math.random());
      var hash = 0;
      for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return (Math.abs(hash) % 2147483647) || 1;
    }
    return Math.abs(num) % 2147483647;
  }

  /**
   * Programa una alarma nativa o notificación local en KODAMA.
   * @param {number|string} idNumero Identificador numérico de la notificación
   * @param {string} titulo Título de la notificación
   * @param {string} mensaje Contenido o cuerpo de la notificación
   * @param {Date|string|number} fechaHoraDate Momento exacto en que debe sonar la alarma
   */
  async function programarAlarmaKodama(idNumero, titulo, mensaje, fechaHoraDate) {
    var plugin = obtenerPlugin();
    var id = sanitizarId(idNumero);
    var fecha = fechaHoraDate instanceof Date ? fechaHoraDate : new Date(fechaHoraDate);

    if (isNaN(fecha.getTime())) {
      console.warn('[KODAMA Notificaciones] Fecha inválida para alarma:', fechaHoraDate);
      return { ok: false, error: 'Fecha inválida' };
    }

    if (plugin && plugin.schedule) {
      try {
        await asegurarCanalYPermisos(plugin);
        await plugin.schedule({
          notifications: [
            {
              id: id,
              title: String(titulo || 'KODAMA'),
              body: String(mensaje || ''),
              channelId: CANAL_ID,
              schedule: {
                at: fecha,
                allowWhileIdle: true
              }
            }
          ]
        });
        return { ok: true, id: id };
      } catch (err) {
        console.error('[KODAMA Notificaciones] Error al programar notificación:', err);
        return { ok: false, error: err };
      }
    } else {
      // Respaldo en navegadores estándar de escritorio o PWA sin Capacitor nativo
      var retraso = fecha.getTime() - Date.now();
      if (retraso > 0 && retraso < 2147483647) {
        setTimeout(function () {
          if (typeof global.Notification !== 'undefined' && global.Notification.permission === 'granted') {
            new global.Notification(titulo || 'KODAMA', { body: mensaje });
          } else {
            console.log('[KODAMA Alarma]:', titulo, ' - ', mensaje);
          }
        }, retraso);
      }
      return { ok: true, id: id, simulado: true };
    }
  }

  async function cancelarAlarmaKodama(idNumero) {
    var plugin = obtenerPlugin();
    var id = sanitizarId(idNumero);
    if (plugin && plugin.cancel) {
      try {
        await plugin.cancel({
          notifications: [{ id: id }]
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err };
      }
    }
    return { ok: true };
  }

  function sincronizarAlarmaDeBloque(bloque) {
    if (!bloque || !bloque.id) return;
    var idAlarma = 'bloque_' + bloque.id;
    if (bloque.archivado || bloque.estado === 'cancelada') {
      cancelarAlarmaKodama(idAlarma);
      return;
    }
    if (!bloque.fecha || !bloque.inicio) return;
    var horaInicio = bloque.inicio.length === 5 ? bloque.inicio + ':00' : bloque.inicio;
    var fechaHora = new Date(bloque.fecha + 'T' + horaInicio);
    if (isNaN(fechaHora.getTime())) return;

    if (fechaHora.getTime() > Date.now()) {
      var titulo = bloque.tituloMostrado || bloque.titulo || 'Clase KODAMA';
      var mensaje = (bloque.lugar ? bloque.lugar + ' • ' : '') + bloque.inicio + ' - ' + (bloque.fin || '');
      programarAlarmaKodama(idAlarma, titulo, mensaje, fechaHora);
    }
  }

  function sincronizarAlarmasSemana(bloques) {
    if (!Array.isArray(bloques)) return;
    bloques.forEach(sincronizarAlarmaDeBloque);
  }

  global.programarAlarmaKodama = programarAlarmaKodama;
  global.cancelarAlarmaKodama = cancelarAlarmaKodama;
  global.KodamaAlarmas = {
    programar: programarAlarmaKodama,
    cancelar: cancelarAlarmaKodama,
    sincronizarBloque: sincronizarAlarmaDeBloque,
    sincronizarSemana: sincronizarAlarmasSemana
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var plugin = obtenerPlugin();
      if (plugin) {
        asegurarCanalYPermisos(plugin);
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
