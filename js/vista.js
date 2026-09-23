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

  return { MODOS: MODOS, leer: leer, guardar: guardar };
})();
