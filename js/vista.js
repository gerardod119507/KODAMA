/**
 * Modo de la vista principal: 'dia' o 'semana'. Se recuerda en el
 * dispositivo. Si nunca se eligió, pantallas anchas (escritorio) arrancan
 * en semana y el celular en día.
 */
const KodamaVista = (function () {
  const CLAVE = 'kodama.vista';
  const MODOS = ['dia', 'semana'];
  const ANCHO_ESCRITORIO = 900;

  function leer(anchoPantalla) {
    try {
      const guardada = localStorage.getItem(CLAVE);
      if (MODOS.indexOf(guardada) !== -1) {
        return guardada;
      }
    } catch (err) {
      // localStorage bloqueado: se decide por el ancho.
    }
    return anchoPantalla >= ANCHO_ESCRITORIO ? 'semana' : 'dia';
  }

  function guardar(modo) {
    try {
      localStorage.setItem(CLAVE, modo);
    } catch (err) {
      // No es crítico: la próxima vez vuelve a decidir por el ancho.
    }
  }

  // --- Rango de días en la vista de semana -----------------------------
  // Índices dentro de la semana: 0 = lunes … 6 = domingo. Por defecto la
  // semana completa. No se guarda en el dispositivo: al abrir la app, o al
  // tocar "Hoy", vuelve a lunes–domingo.
  function rangoCompleto() {
    return { desde: 0, hasta: 6 };
  }

  /**
   * Nuevo rango después de cambiar uno de los extremos. Si el cambio deja
   * "desde" después de "hasta", el otro extremo se mueve para acompañarlo
   * (elegir "del sábado" con "al jueves" pasa a "del sábado al sábado").
   */
  function ajustarRango(rango, extremo, valor) {
    const nuevo = { desde: rango.desde, hasta: rango.hasta };
    nuevo[extremo] = Math.max(0, Math.min(6, Number(valor)));
    if (nuevo.desde > nuevo.hasta) {
      if (extremo === 'desde') nuevo.hasta = nuevo.desde;
      else nuevo.desde = nuevo.hasta;
    }
    return nuevo;
  }

  /** Las fechas visibles: la parte del rango dentro de los 7 días. */
  function diasVisibles(diasSemana, rango) {
    return diasSemana.slice(rango.desde, rango.hasta + 1);
  }

  return {
    MODOS: MODOS,
    leer: leer,
    guardar: guardar,
    rangoCompleto: rangoCompleto,
    ajustarRango: ajustarRango,
    diasVisibles: diasVisibles
  };
})();
