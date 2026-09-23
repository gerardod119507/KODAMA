(async function () {
  const config = KodamaApi.leerConfig();
  if (!config.url || !config.token) {
    location.href = 'config.html';
    return;
  }

  const encabezadoFecha = document.getElementById('fecha');
  const contenedor = document.getElementById('vista-dia');
  const avisoOffline = document.getElementById('aviso-offline');
  const selectorCapa = document.getElementById('capa');

  KodamaCapas.CAPAS.forEach(function (capa) {
    const opcion = document.createElement('option');
    opcion.value = capa;
    opcion.textContent = capa;
    selectorCapa.appendChild(opcion);
  });
  selectorCapa.value = KodamaCapas.leer();

  const fecha = KodamaFecha.hoy();
  encabezadoFecha.textContent = KodamaFecha.legible(fecha);

  let bloquesDelDia = [];

  function renderizar() {
    const filtrados = KodamaCapas.filtrar(bloquesDelDia, selectorCapa.value);
    // Los bocetos del espíritu solo se comparan mientras no haya una
    // elección — no depende de si hay o no bloques ese día en particular.
    KodamaDia.render(contenedor, filtrados, { compararBocetos: true });
  }

  selectorCapa.addEventListener('change', function () {
    KodamaCapas.guardar(selectorCapa.value);
    renderizar();
  });

  KodamaDia.renderCargando(contenedor);

  try {
    const resultado = await KodamaState.obtenerBloquesDelDia(fecha);
    avisoOffline.hidden = !resultado.desdeCache;
    bloquesDelDia = resultado.bloques;
    renderizar();
  } catch (err) {
    avisoOffline.hidden = true;
    const mensaje = err.codigo === 'sin_configuracion'
      ? 'Falta configurar la conexión.'
      : 'No se pudo cargar (' + err.message + ') y no hay nada guardado para hoy sin conexión.';
    KodamaDia.renderError(contenedor, mensaje);
  }
})();
