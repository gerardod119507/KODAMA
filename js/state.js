/**
 * Datos de la vista principal, siempre por SEMANA (lunes a domingo): una
 * sola llamada trae los 7 días, así cambiar de día dentro de la semana, o
 * pasar de Día a Semana, no vuelve a pedir nada.
 *
 * Caché local de SOLO LECTURA: lo último guardado se muestra al instante y
 * se actualiza por detrás. Crear o editar bloques siempre requiere red (no
 * hay cola offline en el MVP, ver CLAUDE.md).
 */
const KodamaState = (function () {
  const PREFIJO = 'kodama.cache.semana.';
  // Prefijos de cachés de versiones anteriores (por día y por rango): se
  // borran para no dejar basura en el dispositivo.
  const PREFIJOS_VIEJOS = ['kodama.cache.bloques.', 'kodama.cache.rango.'];
  const MAX_SEMANAS = 12;

  function claves() {
    const lista = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        lista.push(localStorage.key(i));
      }
    } catch (err) {
      // localStorage bloqueado: sin caché.
    }
    return lista;
  }

  function leerSemana(lunes) {
    try {
      const guardado = JSON.parse(localStorage.getItem(PREFIJO + lunes));
      return guardado && Array.isArray(guardado.bloques) ? guardado.bloques : null;
    } catch (err) {
      return null;
    }
  }

  /** Guarda la semana y deja solo las MAX_SEMANAS más recientes. */
  function guardarSemana(lunes, bloques) {
    try {
      localStorage.setItem(PREFIJO + lunes, JSON.stringify({ bloques: bloques, guardadoEn: Date.now() }));
      const todas = claves().filter(function (clave) { return clave && clave.indexOf(PREFIJO) === 0; });
      if (todas.length > MAX_SEMANAS) {
        todas
          .map(function (clave) {
            let guardadoEn = 0;
            try { guardadoEn = JSON.parse(localStorage.getItem(clave)).guardadoEn || 0; } catch (err) { /* vacío */ }
            return { clave: clave, guardadoEn: guardadoEn };
          })
          .sort(function (a, b) { return a.guardadoEn - b.guardadoEn; })
          .slice(0, todas.length - MAX_SEMANAS)
          .forEach(function (item) { localStorage.removeItem(item.clave); });
      }
    } catch (err) {
      // localStorage lleno o bloqueado: no es crítico, seguimos sin caché.
    }
  }

  function limpiarCachesViejas() {
    claves().forEach(function (clave) {
      if (clave && PREFIJOS_VIEJOS.some(function (p) { return clave.indexOf(p) === 0; })) {
        try { localStorage.removeItem(clave); } catch (err) { /* no crítico */ }
      }
    });
  }

  /** Pide la semana al Web App (una sola llamada) y la guarda. */
  async function pedirSemana(lunes, domingo) {
    const config = KodamaApi.leerConfig();
    if (!config.url || !config.token) {
      const error = new Error('sin_configuracion');
      error.codigo = 'sin_configuracion';
      throw error;
    }
    const respuesta = await KodamaApi.llamar(config.url, config.token, 'listarBloquesRango', { desde: lunes, hasta: domingo });
    if (!respuesta.ok) {
      throw new Error(respuesta.error);
    }
    guardarSemana(lunes, respuesta.data);
    return respuesta.data;
  }

  /**
   * Aplica en la lista local un bloque recién guardado (creado, editado,
   * movido o archivado), para verlo al instante sin esperar la recarga.
   * Devuelve una lista nueva ordenada como la del backend.
   */
  function aplicarCambio(bloques, bloque, lunes, domingo) {
    const resto = bloques.filter(function (b) { return b.id !== bloque.id; });
    const sigueEnLaSemana = bloque.archivado !== 'TRUE' && bloque.fecha >= lunes && bloque.fecha <= domingo;
    if (sigueEnLaSemana) {
      resto.push(bloque);
    }
    return resto.sort(function (a, b) {
      return a.fecha.localeCompare(b.fecha) || a.inicio.localeCompare(b.inicio);
    });
  }

  return {
    leerSemana: leerSemana,
    guardarSemana: guardarSemana,
    pedirSemana: pedirSemana,
    aplicarCambio: aplicarCambio,
    limpiarCachesViejas: limpiarCachesViejas
  };
})();
