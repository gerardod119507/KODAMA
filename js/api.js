/**
 * KODAMA — la puerta por la que las pantallas piden y guardan datos.
 *
 * Hasta el Checkpoint 12 cada llamada era un POST al Web App de Apps
 * Script. Desde el Checkpoint 13 la acción corre aquí mismo
 * (js/backend/) y lee y escribe Supabase. La respuesta tiene la misma
 * forma de siempre: { ok: true, data } o { ok: false, error }; sin red,
 * la llamada falla (como fallaba fetch), y cada pantalla muestra lo
 * guardado en el dispositivo con "Sin conexión".
 */
const KodamaApi = (function () {
  // La URL y el token del Web App viejo (hasta el Checkpoint 12) ya no
  // sirven, y el token todavía abre el Apps Script: se borran del
  // dispositivo la primera vez que abre la app nueva.
  try {
    localStorage.removeItem('kodama.config');
  } catch (error) {
    // sin almacenamiento: no hay nada que borrar
  }

  // Cada llamada se mide (js/medicion.js): el tiempo de la acción completa,
  // con todas sus consultas a la base. Si la página no cargó la medición, nada.
  const medir = typeof KodamaMedicion !== 'undefined'
    ? KodamaMedicion.llamada
    : function () { return function () {}; };
  // Cada acción que escribe muestra su espera (js/ui/espera.js): el
  // cargador en el botón tocado y el aviso "Guardando…" → "Guardado".
  const esperar = typeof KodamaEspera !== 'undefined'
    ? KodamaEspera.empezar
    : function () { return function () {}; };

  /** ¿Hay una sesión iniciada en este dispositivo? */
  function haySesion() {
    return KodamaSupabase.haySesion();
  }

  async function llamar(accion, parametros) {
    const terminar = medir();
    const fin = esperar(accion, parametros);
    let respuesta;
    try {
      respuesta = await KodamaBackend.ejecutar(accion, parametros);
    } catch (error) {
      terminar(accion, null, false); // sin red: también se anota (falló)
      fin(false, true);
      throw error;
    }
    fin(Boolean(respuesta && respuesta.ok), false);
    // Un error de la acción (ok: false) igual fue un viaje completo: su
    // tiempo cuenta. "Falló" es solo sin red.
    terminar(accion, null, true);
    return respuesta;
  }

  return { haySesion: haySesion, llamar: llamar };
})();
