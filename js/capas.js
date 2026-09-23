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

  /**
   * Horas ocupadas por OTRAS áreas en una capa filtrada: se dibujan como
   * una franja gris tenue, sin título ni aviso. Las que se pisan o se tocan
   * dentro de un mismo día se funden en una sola franja. En General no hay
   * franjas (ya se ve todo).
   */
  function ocupadosPorOtras(bloques, capa) {
    if (capa === 'General') {
      return [];
    }
    const otros = bloques
      .filter(function (bloque) { return bloque.area !== capa && bloque.inicio && bloque.fin; })
      .map(function (bloque) { return { fecha: bloque.fecha, inicio: bloque.inicio, fin: bloque.fin }; })
      .sort(function (a, b) { return a.fecha.localeCompare(b.fecha) || a.inicio.localeCompare(b.inicio); });

    const franjas = [];
    otros.forEach(function (tramo) {
      const ultima = franjas[franjas.length - 1];
      if (ultima && ultima.fecha === tramo.fecha && tramo.inicio <= ultima.fin) {
        if (tramo.fin > ultima.fin) ultima.fin = tramo.fin;
      } else {
        franjas.push(tramo);
      }
    });
    return franjas;
  }

  return { CAPAS: CAPAS, leer: leer, guardar: guardar, filtrar: filtrar, ocupadosPorOtras: ocupadosPorOtras };
})();
