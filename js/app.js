(async function () {
  const config = KodamaApi.leerConfig();
  if (!config.url || !config.token) {
    location.href = 'config.html';
    return;
  }

  const encabezadoFecha = document.getElementById('fecha');
  const contenedor = document.getElementById('vista-dia');
  const avisoOffline = document.getElementById('aviso-offline');

  const fecha = KodamaFecha.hoy();
  encabezadoFecha.textContent = KodamaFecha.legible(fecha);

  KodamaDia.renderCargando(contenedor);

  try {
    const resultado = await KodamaState.obtenerBloquesDelDia(fecha);
    avisoOffline.hidden = !resultado.desdeCache;
    // Los bocetos del espíritu solo se comparan mientras no haya una
    // elección — no depende de si hay o no bloques ese día en particular.
    KodamaDia.render(contenedor, resultado.bloques, { compararBocetos: true });
  } catch (err) {
    avisoOffline.hidden = true;
    const mensaje = err.codigo === 'sin_configuracion'
      ? 'Falta configurar la conexión.'
      : 'No se pudo cargar (' + err.message + ') y no hay nada guardado para hoy sin conexión.';
    KodamaDia.renderError(contenedor, mensaje);
  }
})();
