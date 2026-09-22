/**
 * Caché local de SOLO LECTURA: permite ver el último día cargado sin
 * conexión. Crear o editar bloques siempre requiere red (no hay cola
 * offline en el MVP, ver CLAUDE.md).
 */
const KodamaState = (function () {
  function claveCache(fecha) {
    return 'kodama.cache.bloques.' + fecha;
  }

  function leerCache(fecha) {
    try {
      return JSON.parse(localStorage.getItem(claveCache(fecha)));
    } catch (err) {
      return null;
    }
  }

  function guardarCache(fecha, bloques) {
    try {
      localStorage.setItem(claveCache(fecha), JSON.stringify({ bloques: bloques, guardadoEn: Date.now() }));
    } catch (err) {
      // localStorage lleno o bloqueado: no es crítico, seguimos sin caché.
    }
  }

  async function obtenerBloquesDelDia(fecha) {
    const config = KodamaApi.leerConfig();
    if (!config.url || !config.token) {
      const error = new Error('sin_configuracion');
      error.codigo = 'sin_configuracion';
      throw error;
    }

    try {
      const respuesta = await KodamaApi.llamar(config.url, config.token, 'listarBloquesDia', { fecha: fecha });
      if (!respuesta.ok) {
        throw new Error(respuesta.error);
      }
      guardarCache(fecha, respuesta.data);
      return { bloques: respuesta.data, desdeCache: false };
    } catch (err) {
      const cache = leerCache(fecha);
      if (cache) {
        return { bloques: cache.bloques, desdeCache: true };
      }
      throw err;
    }
  }

  return { obtenerBloquesDelDia: obtenerBloquesDelDia };
})();
