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

  function filtrar(bloques, capa) {
    if (capa === 'General') {
      return bloques;
    }
    return bloques.filter(function (bloque) { return bloque.area === capa; });
  }

  return { CAPAS: CAPAS, leer: leer, guardar: guardar, filtrar: filtrar };
})();
