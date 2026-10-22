/**
 * Integración de alarmas y recordatorios nativos para KODAMA.
 * Utiliza @capacitor/local-notifications en Android con canal de alta importancia (importance: 5, vibration: true)
 * y allowWhileIdle: true para asegurar que las alarmas suenen puntualmente incluso en suspensión.
 *
 * Silueta de estado: usa ic_stat_kodama monocromático en blanco con fondo #071743.
 * Configuración manual: las alarmas se guardan en localStorage bajo 'kodama_alarmas_config'
 * y solo se programan cuando el usuario así lo decide.
 */
(function (global) {
  'use strict';

  var CANAL_ID = 'kodama_alarmas';
  var canalListo = false;
  var CLAVE_CONFIG_ALARMAS = 'kodama_alarmas_config';

  function leerMapaAlarmas() {
    try {
      if (typeof global.localStorage !== 'undefined') {
        var str = global.localStorage.getItem(CLAVE_CONFIG_ALARMAS);
        return str ? JSON.parse(str) : {};
      }
    } catch (e) {}
    return {};
  }

  function escribirMapaAlarmas(mapa) {
    try {
      if (typeof global.localStorage !== 'undefined') {
        global.localStorage.setItem(CLAVE_CONFIG_ALARMAS, JSON.stringify(mapa || {}));
      }
    } catch (e) {}
  }

  function obtenerConfigAlarma(bloqueId) {
    if (!bloqueId) return null;
    var mapa = leerMapaAlarmas();
    return mapa[String(bloqueId)] || null;
  }

  function guardarConfigAlarma(bloqueId, minutos) {
    if (!bloqueId) return;
    var mapa = leerMapaAlarmas();
    if (minutos === 'ninguna' || minutos === null || minutos === undefined) {
      delete mapa[String(bloqueId)];
    } else {
      mapa[String(bloqueId)] = {
        activo: true,
        minutos: Number(minutos) || 0,
        actualizado: Date.now()
      };
    }
    escribirMapaAlarmas(mapa);
  }

  function eliminarConfigAlarma(bloqueId) {
    guardarConfigAlarma(bloqueId, 'ninguna');
  }

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
              smallIcon: 'ic_stat_kodama',
              iconColor: '#071743',
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
      eliminarConfigAlarma(bloque.id);
      return;
    }

    // Comprobar si el usuario configuró una alarma para este bloque
    var config = obtenerConfigAlarma(bloque.id);
    if (!config || !config.activo) {
      // Si el usuario no la programó manualmente, nos aseguramos de no sonar
      cancelarAlarmaKodama(idAlarma);
      return;
    }

    if (!bloque.fecha || !bloque.inicio) return;
    var horaInicio = bloque.inicio.length === 5 ? bloque.inicio + ':00' : bloque.inicio;
    var fechaHoraClase = new Date(bloque.fecha + 'T' + horaInicio);
    if (isNaN(fechaHoraClase.getTime())) return;

    var minutosAntes = Number(config.minutos) || 0;
    var fechaAlarma = new Date(fechaHoraClase.getTime() - (minutosAntes * 60 * 1000));

    if (fechaAlarma.getTime() > Date.now()) {
      var tituloBase = bloque.tituloMostrado || bloque.titulo || 'Clase KODAMA';
      var prefijo = minutosAntes > 0 ? ('En ' + minutosAntes + ' min: ') : '';
      var titulo = prefijo + tituloBase;
      var mensaje = (bloque.lugar ? bloque.lugar + ' • ' : '') + bloque.inicio + ' - ' + (bloque.fin || '');
      programarAlarmaKodama(idAlarma, titulo, mensaje, fechaAlarma);
    } else {
      cancelarAlarmaKodama(idAlarma);
    }
  }

  async function configurarYProgramarAlarma(bloque, minutos) {
    if (!bloque || !bloque.id) return { ok: false, error: 'Bloque inválido' };
    if (minutos === 'ninguna' || minutos === null || minutos === undefined) {
      eliminarConfigAlarma(bloque.id);
      return await cancelarAlarmaKodama('bloque_' + bloque.id);
    } else {
      guardarConfigAlarma(bloque.id, minutos);
      return sincronizarAlarmaDeBloque(bloque);
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
    sincronizarSemana: sincronizarAlarmasSemana,
    obtenerConfig: obtenerConfigAlarma,
    guardarConfig: guardarConfigAlarma,
    eliminarConfig: eliminarConfigAlarma,
    configurarYProgramar: configurarYProgramarAlarma
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
