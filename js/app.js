(async function () {
  const encabezadoFecha = document.getElementById('fecha');
  const contenedor = document.getElementById('vista-dia');
  const avisoOffline = document.getElementById('aviso-offline');
  const indicadorActualizando = document.getElementById('actualizando');
  const selectorCapa = document.getElementById('capa');
  const botonDia = document.getElementById('modo-dia');
  const botonSemana = document.getElementById('modo-semana');

  const config = KodamaApi.leerConfig();
  if (!config.url || !config.token) {
    // Sin conexión configurada se avisa acá mismo, con un enlace. Nunca se
    // salta solo a Configuración: la app no debe cambiar de página sin que
    // Gerardo lo pida.
    KodamaDia.renderSinConfiguracion(contenedor);
    return;
  }

  KodamaCapas.CAPAS.forEach(function (capa) {
    const opcion = document.createElement('option');
    opcion.value = capa;
    opcion.textContent = capa;
    selectorCapa.appendChild(opcion);
  });
  selectorCapa.value = KodamaCapas.leer();
  KodamaState.limpiarCachesViejas();

  let modo = KodamaVista.leer(window.innerWidth);
  // Día que se ve (modo día) o cualquier día de la semana que se ve.
  let fecha = KodamaFecha.hoy();
  // Siempre se tiene en memoria la semana completa (lunes a domingo) que
  // contiene "fecha": cambiar de día dentro de ella no pide nada.
  let semanaEnPantalla = null;
  let bloquesSemana = [];
  // Cada carga lleva un número; si llega la respuesta de una carga vieja
  // (ya se navegó a otra semana, o se guardó algo), se descarta.
  let cargaActual = 0;

  function semana(fechaIso) {
    const dias = KodamaFecha.diasDeSemana(fechaIso);
    return { dias: dias, lunes: dias[0], domingo: dias[6] };
  }

  function areaPorDefecto() {
    const capa = selectorCapa.value;
    return capa === 'General' ? 'Universidad' : capa;
  }

  /** Fecha para un bloque nuevo: el día visto, o hoy si cae en la semana vista. */
  function fechaPorDefecto() {
    if (modo === 'dia') return fecha;
    const dias = semana(fecha).dias;
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
      const s = semana(fecha);
      encabezadoFecha.textContent = 'Semana del ' + KodamaFecha.rangoLegible(s.lunes, s.domingo);
    }
  }

  function renderizar() {
    const capa = selectorCapa.value;
    if (modo === 'dia') {
      const delDia = bloquesSemana.filter(function (b) { return b.fecha === fecha; });
      KodamaDia.render(contenedor, KodamaCapas.filtrar(delDia, capa), {
        // Los bocetos del espíritu solo se comparan mientras no haya una
        // elección — no depende de si hay o no bloques ese día en particular.
        compararBocetos: true,
        ocupados: KodamaCapas.ocupadosPorOtras(delDia, capa),
        alTocar: KodamaFicha.abrir
      });
    } else {
      KodamaSemana.render(contenedor, {
        dias: semana(fecha).dias,
        hoy: KodamaFecha.hoy(),
        bloques: KodamaCapas.filtrar(bloquesSemana, capa),
        todos: bloquesSemana,
        ocupados: KodamaCapas.ocupadosPorOtras(bloquesSemana, capa),
        alTocar: KodamaFicha.abrir
      });
    }
  }

  function mostrarActualizando(activo) {
    indicadorActualizando.hidden = !activo;
  }

  /**
   * Muestra al instante lo que haya (en memoria o guardado en el
   * dispositivo) y pide la semana al Web App por detrás, en una sola
   * llamada. Solo muestra "Cargando..." si no hay nada guardado.
   */
  async function cargar() {
    const numero = ++cargaActual;
    const s = semana(fecha);
    pintarEncabezado();

    if (semanaEnPantalla !== s.lunes) {
      const guardados = KodamaState.leerSemana(s.lunes);
      if (guardados) {
        bloquesSemana = guardados;
        semanaEnPantalla = s.lunes;
      } else {
        bloquesSemana = [];
        semanaEnPantalla = null;
      }
    }
    if (semanaEnPantalla === s.lunes) {
      renderizar();
    } else {
      KodamaDia.renderCargando(contenedor);
    }
    mostrarActualizando(true);

    try {
      const datos = await KodamaState.pedirSemana(s.lunes, s.domingo);
      if (numero !== cargaActual) return;
      bloquesSemana = datos;
      semanaEnPantalla = s.lunes;
      avisoOffline.hidden = true;
      renderizar();
    } catch (err) {
      if (numero !== cargaActual) return;
      if (semanaEnPantalla === s.lunes) {
        avisoOffline.hidden = false; // se ve lo guardado; no se pudo actualizar
      } else {
        avisoOffline.hidden = true;
        KodamaDia.renderError(contenedor,
          'No se pudo cargar (' + err.message + ') y no hay nada guardado de estas fechas sin conexión.');
      }
    } finally {
      if (numero === cargaActual) mostrarActualizando(false);
    }
  }

  /** Cambió el día o el modo: si la semana ya está en memoria, no se pide nada. */
  function mostrarFecha() {
    if (semana(fecha).lunes === semanaEnPantalla) {
      pintarEncabezado();
      renderizar();
    } else {
      cargar();
    }
  }

  /**
   * Un bloque recién guardado se ve al instante (en la semana en pantalla y
   * en la caché de la semana a la que se movió, si existe); después se
   * vuelve a pedir la semana por detrás para confirmar.
   */
  function aplicarLocal(bloque) {
    const s = semana(fecha);
    bloquesSemana = KodamaState.aplicarCambio(bloquesSemana, bloque, s.lunes, s.domingo);
    KodamaState.guardarSemana(s.lunes, bloquesSemana);

    if (bloque.fecha) {
      const destino = semana(bloque.fecha);
      const guardadaDestino = destino.lunes !== s.lunes && KodamaState.leerSemana(destino.lunes);
      if (guardadaDestino) {
        KodamaState.guardarSemana(destino.lunes,
          KodamaState.aplicarCambio(guardadaDestino, bloque, destino.lunes, destino.domingo));
      }
    }
    cargar();
  }

  async function pedir(accion, parametros) {
    const respuesta = await KodamaApi.llamar(config.url, config.token, accion, parametros);
    if (!respuesta.ok) {
      throw new Error(respuesta.error);
    }
    return respuesta.data;
  }

  async function archivar(id) {
    aplicarLocal(await pedir('archivarBloque', { id: id }));
  }

  KodamaFormulario.iniciar({
    alGuardar: async function (id, datos) {
      const guardado = id
        ? await pedir('actualizarBloque', { id: id, cambios: datos })
        : await pedir('crearBloque', { bloque: datos });
      aplicarLocal(guardado);
    },
    alArchivar: archivar
  });

  KodamaFicha.iniciar({
    alEditar: KodamaFormulario.abrirEdicion,
    alMover: KodamaFormulario.abrirMover,
    alDuplicar: KodamaFormulario.abrirDuplicado,
    alArchivar: archivar
  });

  selectorCapa.addEventListener('change', function () {
    KodamaCapas.guardar(selectorCapa.value);
    renderizar();
  });

  function cambiarModo(nuevo) {
    if (nuevo === modo) return;
    modo = nuevo;
    KodamaVista.guardar(modo);
    mostrarFecha();
  }

  function mover(sentido) {
    fecha = KodamaFecha.sumarDias(fecha, sentido * (modo === 'dia' ? 1 : 7));
    mostrarFecha();
  }

  botonDia.addEventListener('click', function () { cambiarModo('dia'); });
  botonSemana.addEventListener('click', function () { cambiarModo('semana'); });
  document.getElementById('anterior').addEventListener('click', function () { mover(-1); });
  document.getElementById('siguiente').addEventListener('click', function () { mover(1); });
  document.getElementById('ir-hoy').addEventListener('click', function () {
    fecha = KodamaFecha.hoy();
    cargar(); // "Hoy" siempre refresca
  });

  // Al volver a la app (desde otra app o pestaña), se refresca por detrás.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') cargar();
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
