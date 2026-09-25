const KodamaApi = (function () {
  const CLAVE_CONFIG = 'kodama.config';

  function leerConfig() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_CONFIG)) || { url: '', token: '' };
    } catch (err) {
      return { url: '', token: '' };
    }
  }

  function guardarConfig(url, token) {
    localStorage.setItem(CLAVE_CONFIG, JSON.stringify({ url: url, token: token }));
  }

  // Cada llamada se mide (js/medicion.js): tiempo de red y, si el backend
  // lo manda, tiempo del servidor. Si la página no cargó la medición, nada.
  const medir = typeof KodamaMedicion !== 'undefined'
    ? KodamaMedicion.llamada
    : function () { return function () {}; };

  async function llamar(url, token, action, parametros) {
    const cuerpo = Object.assign({ token: token, action: action }, parametros || {});
    const terminar = medir();
    let texto;
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        // text/plain es un valor "safelisted" de CORS: el navegador no manda
        // preflight OPTIONS, que Apps Script no sabe responder.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(cuerpo)
      });
      texto = await respuesta.text();
    } catch (err) {
      terminar(action, null, false); // sin red: también se anota (falló)
      throw err;
    }
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch (err) {
      terminar(action, null, false);
      throw new Error('La respuesta no es JSON. Revisa que la URL termine en /exec y que ' +
        'el despliegue tenga acceso "Cualquier usuario".');
    }
    // Un error del backend (ok: false) igual fue un viaje completo: su
    // tiempo cuenta. "Falló" es solo sin red o sin respuesta legible.
    terminar(action, datos && datos.ms, true);
    return datos;
  }

  return { leerConfig: leerConfig, guardarConfig: guardarConfig, llamar: llamar };
})();
