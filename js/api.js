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

  async function llamar(url, token, action, parametros) {
    const cuerpo = Object.assign({ token: token, action: action }, parametros || {});
    const respuesta = await fetch(url, {
      method: 'POST',
      // text/plain es un valor "safelisted" de CORS: el navegador no manda
      // preflight OPTIONS, que Apps Script no sabe responder.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo)
    });
    const texto = await respuesta.text();
    try {
      return JSON.parse(texto);
    } catch (err) {
      throw new Error('La respuesta no es JSON. Revisa que la URL termine en /exec y que ' +
        'el despliegue tenga acceso "Cualquier usuario".');
    }
  }

  return { leerConfig: leerConfig, guardarConfig: guardarConfig, llamar: llamar };
})();
