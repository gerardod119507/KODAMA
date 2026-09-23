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

  function areaPorDefecto() {
    const capa = selectorCapa.value;
    return capa === 'General' ? 'Universidad' : capa;
  }

  function renderizar() {
    const filtrados = KodamaCapas.filtrar(bloquesDelDia, selectorCapa.value);
    KodamaDia.render(contenedor, filtrados, {
      // Los bocetos del espíritu solo se comparan mientras no haya una
      // elección — no depende de si hay o no bloques ese día en particular.
      compararBocetos: true,
      alTocar: KodamaFormulario.abrirEdicion
    });
  }

  async function cargar() {
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
  }

  async function pedir(accion, parametros) {
    const respuesta = await KodamaApi.llamar(config.url, config.token, accion, parametros);
    if (!respuesta.ok) {
      throw new Error(respuesta.error);
    }
    return respuesta.data;
  }

  KodamaFormulario.iniciar({
    alGuardar: async function (id, datos) {
      if (id) {
        await pedir('actualizarBloque', { id: id, cambios: datos });
      } else {
        await pedir('crearBloque', { bloque: datos });
      }
      await cargar();
    },
    alArchivar: async function (id) {
      await pedir('archivarBloque', { id: id });
      await cargar();
    }
  });

  selectorCapa.addEventListener('change', function () {
    KodamaCapas.guardar(selectorCapa.value);
    renderizar();
  });

  document.getElementById('nuevo-bloque').addEventListener('click', function () {
    const inicio = KodamaFecha.proximaMediaHora();
    KodamaFormulario.abrirNuevo({
      titulo: '',
      area: areaPorDefecto(),
      tipo: 'variable',
      fecha: fecha,
      inicio: inicio,
      fin: KodamaFecha.sumarMinutos(inicio, 60),
      etiqueta: '',
      notas: ''
    }, false);
  });

  document.getElementById('nueva-reunion').addEventListener('click', function () {
    const inicio = KodamaFecha.proximaMediaHora();
    KodamaFormulario.abrirNuevo({
      titulo: '',
      area: areaPorDefecto(),
      tipo: 'reunión',
      fecha: fecha,
      inicio: inicio,
      fin: KodamaFecha.sumarMinutos(inicio, 30),
      etiqueta: '',
      notas: ''
    }, true);
  });

  await cargar();
})();
