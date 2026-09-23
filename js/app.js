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
  const botonDia = document.getElementById('modo-dia');
  const botonSemana = document.getElementById('modo-semana');

  KodamaCapas.CAPAS.forEach(function (capa) {
    const opcion = document.createElement('option');
    opcion.value = capa;
    opcion.textContent = capa;
    selectorCapa.appendChild(opcion);
  });
  selectorCapa.value = KodamaCapas.leer();

  let modo = KodamaVista.leer(window.innerWidth);
  // La fecha de referencia: el día que se ve (modo día) o cualquier día de
  // la semana que se ve (modo semana).
  let fecha = KodamaFecha.hoy();
  let bloques = [];
  // Cada carga lleva un número; si llega la respuesta de una carga vieja
  // (el usuario ya navegó a otra semana), se descarta.
  let cargaActual = 0;

  function areaPorDefecto() {
    const capa = selectorCapa.value;
    return capa === 'General' ? 'Universidad' : capa;
  }

  /** Fecha para un bloque nuevo: el día visto, o hoy si cae en la semana vista. */
  function fechaPorDefecto() {
    if (modo === 'dia') return fecha;
    const dias = KodamaFecha.diasDeSemana(fecha);
    const hoy = KodamaFecha.hoy();
    return dias.indexOf(hoy) !== -1 ? hoy : dias[0];
  }

  function pintarEncabezado() {
    document.body.classList.toggle('modo-semana', modo === 'semana');
    botonDia.setAttribute('aria-pressed', String(modo === 'dia'));
    botonSemana.setAttribute('aria-pressed', String(modo === 'semana'));
    if (modo === 'dia') {
      encabezadoFecha.textContent = KodamaFecha.legible(fecha);
    } else {
      const dias = KodamaFecha.diasDeSemana(fecha);
      encabezadoFecha.textContent = 'Semana del ' + KodamaFecha.rangoLegible(dias[0], dias[6]);
    }
  }

  function renderizar() {
    const filtrados = KodamaCapas.filtrar(bloques, selectorCapa.value);
    if (modo === 'dia') {
      KodamaDia.render(contenedor, filtrados, {
        // Los bocetos del espíritu solo se comparan mientras no haya una
        // elección — no depende de si hay o no bloques ese día en particular.
        compararBocetos: true,
        alTocar: KodamaFormulario.abrirEdicion
      });
    } else {
      KodamaSemana.render(contenedor, {
        dias: KodamaFecha.diasDeSemana(fecha),
        hoy: KodamaFecha.hoy(),
        bloques: filtrados,
        alTocar: KodamaFormulario.abrirEdicion
      });
    }
  }

  async function cargar() {
    const numero = ++cargaActual;
    pintarEncabezado();
    KodamaDia.renderCargando(contenedor);
    try {
      let resultado;
      if (modo === 'dia') {
        resultado = await KodamaState.obtenerBloquesDelDia(fecha);
      } else {
        const dias = KodamaFecha.diasDeSemana(fecha);
        resultado = await KodamaState.obtenerBloquesDeRango(dias[0], dias[6]);
      }
      if (numero !== cargaActual) return;
      avisoOffline.hidden = !resultado.desdeCache;
      bloques = resultado.bloques;
      renderizar();
    } catch (err) {
      if (numero !== cargaActual) return;
      avisoOffline.hidden = true;
      const mensaje = err.codigo === 'sin_configuracion'
        ? 'Falta configurar la conexión.'
        : 'No se pudo cargar (' + err.message + ') y no hay nada guardado de estas fechas sin conexión.';
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

  function cambiarModo(nuevo) {
    if (nuevo === modo) return;
    modo = nuevo;
    KodamaVista.guardar(modo);
    cargar();
  }

  function mover(sentido) {
    fecha = KodamaFecha.sumarDias(fecha, sentido * (modo === 'dia' ? 1 : 7));
    cargar();
  }

  botonDia.addEventListener('click', function () { cambiarModo('dia'); });
  botonSemana.addEventListener('click', function () { cambiarModo('semana'); });
  document.getElementById('anterior').addEventListener('click', function () { mover(-1); });
  document.getElementById('siguiente').addEventListener('click', function () { mover(1); });
  document.getElementById('ir-hoy').addEventListener('click', function () {
    fecha = KodamaFecha.hoy();
    cargar();
  });

  document.getElementById('nuevo-bloque').addEventListener('click', function () {
    const inicio = KodamaFecha.proximaMediaHora();
    KodamaFormulario.abrirNuevo({
      titulo: '',
      area: areaPorDefecto(),
      tipo: 'variable',
      fecha: fechaPorDefecto(),
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
      fecha: fechaPorDefecto(),
      inicio: inicio,
      fin: KodamaFecha.sumarMinutos(inicio, 30),
      etiqueta: '',
      notas: ''
    }, true);
  });

  await cargar();
})();
