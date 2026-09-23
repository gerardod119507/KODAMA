const KodamaCapas = (function () {
  const CLAVE = 'kodama.capa';
  const CAPAS = ['General', 'Universidad', 'Academia Fractal', 'Startup', 'Personal'];

  function leer() {
    try {
      const guardada = localStorage.getItem(CLAVE);
      return CAPAS.indexOf(guardada) !== -1 ? guardada : 'General';
    } catch (err) {
      return 'General';
    }
  }

  function guardar(capa) {
    try {
      localStorage.setItem(CLAVE, capa);
    } catch (err) {
      // localStorage bloqueado: no es crítico, la capa vuelve a General.
    }
  }

  /** true si el bloque se muestra completo en esa capa (en General, todos). */
  function esDeLaCapa(bloque, capa) {
    return capa === 'General' || bloque.area === capa;
  }

  function filtrar(bloques, capa) {
    return bloques.filter(function (bloque) { return esDeLaCapa(bloque, capa); });
  }

  return { CAPAS: CAPAS, leer: leer, guardar: guardar, filtrar: filtrar, esDeLaCapa: esDeLaCapa };
})();
