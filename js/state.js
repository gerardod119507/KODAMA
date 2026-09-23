/**
 * Caché local de SOLO LECTURA: permite ver el último día cargado sin
 * conexión. Crear o editar bloques siempre requiere red (no hay cola
 * offline en el MVP, ver CLAUDE.md).
 */
const KodamaState = (function () {
  function leerCache(clave) {
    try {
      return JSON.parse(localStorage.getItem(clave));
    } catch (err) {
      return null;
    }
  }

  function guardarCache(clave, bloques) {
    try {
      localStorage.setItem(clave, JSON.stringify({ bloques: bloques, guardadoEn: Date.now() }));
    } catch (err) {
      // localStorage lleno o bloqueado: no es crítico, seguimos sin caché.
    }
  }

  async function obtener(accion, parametros, claveCache) {
    const config = KodamaApi.leerConfig();
    if (!config.url || !config.token) {
      const error = new Error('sin_configuracion');
      error.codigo = 'sin_configuracion';
      throw error;
    }

    try {
      const respuesta = await KodamaApi.llamar(config.url, config.token, accion, parametros);
      if (!respuesta.ok) {
        throw new Error(respuesta.error);
      }
      guardarCache(claveCache, respuesta.data);
      return { bloques: respuesta.data, desdeCache: false };
    } catch (err) {
      const cache = leerCache(claveCache);
      if (cache) {
        return { bloques: cache.bloques, desdeCache: true };
      }
      throw err;
    }
  }

  function obtenerBloquesDelDia(fecha) {
    return obtener('listarBloquesDia', { fecha: fecha }, 'kodama.cache.bloques.' + fecha);
  }

  function obtenerBloquesDeRango(desde, hasta) {
    return obtener('listarBloquesRango', { desde: desde, hasta: hasta },
      'kodama.cache.rango.' + desde + '.' + hasta);
  }

  return {
    obtenerBloquesDelDia: obtenerBloquesDelDia,
    obtenerBloquesDeRango: obtenerBloquesDeRango
  };
})();
