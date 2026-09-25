(async function () {
  const encabezadoFecha = document.getElementById('fecha');
  const contenedor = document.getElementById('vista-dia');
  const avisoOffline = document.getElementById('aviso-offline');
  const indicadorActualizando = document.getElementById('actualizando');
  const selectorCapa = document.getElementById('capa');
  const barraRango = document.getElementById('barra-rango');
  const rangoDesde = document.getElementById('rango-desde');
  const rangoHasta = document.getElementById('rango-hasta');
  // Celular: día y semana colapsan los huecos largos (en escritorio no).
  const pantallaCelular = window.matchMedia('(max-width: 699px)');

  const config = KodamaApi.leerConfig();
  if (!config.url || !config.token) {
    // Sin conexión configurada se avisa aquí mismo, con un enlace. Nunca se
    // salta solo a Configuración: la app no debe cambiar de página sin que
    // Gerardo lo pida.
    KodamaDia.renderSinConfiguracion(contenedor);
    KodamaCarga.listo();
    return;
  }

  // Medición: desde que el navegador empezó a abrir la página hasta que se
  // pintó la semana recién llegada (ver js/medicion.js).
  let apertura = KodamaMedicion.empezar('apertura', { desdeNavegacion: true });

  KodamaCapas.CAPAS.forEach(function (capa) {
    const opcion = document.createElement('option');
    opcion.value = capa;
    opcion.textContent = capa;
    selectorCapa.appendChild(opcion);
  });
  selectorCapa.value = KodamaCapas.leer();
  KodamaState.limpiarCachesViejas();

  // index.html#dia / #semana (desde la navegación de otra pantalla) manda;
  // si no, lo último elegido en este dispositivo.
  const pedido = KodamaVista.desdeHash(window.location.hash);
  let modo = pedido || KodamaVista.leer(window.innerWidth);
  if (pedido) {
    KodamaVista.guardar(modo);
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  // Días visibles en la semana (0 = lunes … 6 = domingo).
  let rango = KodamaVista.rangoCompleto();
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

  function diasVisibles() {
    return KodamaVista.diasVisibles(semana(fecha).dias, rango);
  }

  /** Fecha para un bloque nuevo: el día visto, o hoy si está entre los días visibles. */
  function fechaPorDefecto() {
    if (modo === 'dia') return fecha;
    const dias = diasVisibles();
    const hoy = KodamaFecha.hoy();
    return dias.indexOf(hoy) !== -1 ? hoy : dias[0];
  }

  /** Opciones "lun 21" … "dom 27" de la semana vista, en los dos selectores. */
  function pintarSelectorRango() {
    const dias = semana(fecha).dias;
    [rangoDesde, rangoHasta].forEach(function (selector) {
      selector.replaceChildren();
      dias.forEach(function (dia, indice) {
        const opcion = document.createElement('option');
        opcion.value = String(indice);
        opcion.textContent = KodamaFecha.diaCorto(dia);
        selector.appendChild(opcion);
      });
    });
    rangoDesde.value = String(rango.desde);
    rangoHasta.value = String(rango.hasta);
  }

  function pintarEncabezado() {
    document.body.classList.toggle('modo-semana', modo === 'semana');
    KodamaNavegacion.marcar(modo);
    barraRango.hidden = modo !== 'semana';
    if (modo === 'dia') {
      encabezadoFecha.textContent = KodamaFecha.legible(fecha);
    } else {
      const dias = diasVisibles();
      const completa = dias.length === 7;
      encabezadoFecha.textContent = (completa ? 'Semana del ' : '') +
        KodamaFecha.rangoLegible(dias[0], dias[dias.length - 1]);
      pintarSelectorRango();
    }
  }

  function renderizar() {
    // Apenas hay algo que mostrar (lo guardado o lo que llegó), la pantalla
    // de carga se va: nunca demora la app.
    KodamaCarga.listo();
    const capa = selectorCapa.value;
    // En una capa filtrada, los bloques de otras áreas se dibujan como
    // "ocupado" en su misma posición (por eso se pasan todos).
    const esDeLaCapa = function (bloque) { return KodamaCapas.esDeLaCapa(bloque, capa); };
    // El nombre que se ve de cada bloque: con alumnos vinculados sale de
    // ellos (Checkpoint 7). Se arma en copias, sin tocar lo guardado.
    const bloques = bloquesSemana.map(function (b) {
      return Object.assign({}, b, { tituloMostrado: KodamaAlumnos.tituloDeBloque(b) });
    });
    if (modo === 'dia') {
      KodamaDia.render(contenedor, bloques.filter(function (b) { return b.fecha === fecha; }), {
        fecha: fecha,
        hoy: KodamaFecha.hoy(),
        // Los bocetos del espíritu solo se comparan mientras no haya una
        // elección — no depende de si hay o no bloques ese día en particular.
        compararBocetos: true,
        esDeLaCapa: esDeLaCapa,
        alTocar: KodamaFicha.abrir,
        colapsarHuecos: pantallaCelular.matches
      });
    } else {
      const dias = diasVisibles();
      KodamaSemana.render(contenedor, {
        dias: dias,
        hoy: KodamaFecha.hoy(),
        bloques: bloques.filter(function (b) { return dias.indexOf(b.fecha) !== -1; }),
        esDeLaCapa: esDeLaCapa,
        alTocar: KodamaFicha.abrir,
        colapsarHuecos: pantallaCelular.matches
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
    // Solo la primera carga es "apertura"; las siguientes se miden como llamadas.
    const op = apertura;
    apertura = null;
    // Si otra carga la reemplaza antes de terminar, la apertura se cierra ahí.
    const dibujar = op ? function () { op.render(renderizar); } : renderizar;
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
      dibujar();
      if (op) op.marcarVista(); // lo guardado ya se ve, antes de la red
    } else {
      KodamaDia.renderCargando(contenedor);
    }
    mostrarActualizando(true);

    try {
      const datos = await KodamaState.pedirSemana(s.lunes, s.domingo);
      if (numero !== cargaActual) {
        if (op) op.terminar(true);
        return;
      }
      bloquesSemana = datos;
      semanaEnPantalla = s.lunes;
      avisoOffline.hidden = true;
      dibujar();
      if (op) {
        await op.pintado();
        op.terminar(true);
      }
    } catch (err) {
      if (op) op.terminar(false);
      if (numero !== cargaActual) return;
      if (semanaEnPantalla === s.lunes) {
        avisoOffline.hidden = false; // se ve lo guardado; no se pudo actualizar
      } else {
        avisoOffline.hidden = true;
        KodamaCarga.listo();
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
    alGuardar: async function (id, datos, modo) {
      // Medición: desde "Guardar" hasta ver el bloque en la grilla. La
      // recarga de la semana que viene después no cuenta (cerrarRed).
      const op = KodamaMedicion.empezar('guardar');
      let guardado;
      try {
        if (modo === 'mover') {
          // Mover guarda la fecha y hora originales (la ficha dice "movida del …").
          guardado = await pedir('moverBloque', { id: id, fecha: datos.fecha, inicio: datos.inicio, fin: datos.fin });
        } else if (id) {
          guardado = await pedir('actualizarBloque', { id: id, cambios: datos });
        } else {
          guardado = await pedir('crearBloque', { bloque: datos });
        }
      } catch (err) {
        op.terminar(false);
        throw err;
      }
      op.cerrarRed();
      op.render(function () { aplicarLocal(guardado); });
      op.pintado().then(function () { op.terminar(true); });
    },
    alArchivar: archivar,
    alArchivarPlantilla: function (id) { return KodamaPlantillas.archivar(pedir, id); },
    crearAlumno: function (datos) { return pedir('crearAlumno', { alumno: datos }); }
  });

  KodamaFicha.iniciar({
    alEditar: KodamaFormulario.abrirEdicion,
    alMover: KodamaFormulario.abrirMover,
    alDuplicar: KodamaFormulario.abrirDuplicado,
    alArchivar: archivar,
    alGuardarPlantilla: function (bloque, nombre) {
      return KodamaPlantillas.crear(pedir, KodamaPlantillas.desdeBloque(bloque, nombre));
    },
    alCambiarEstado: async function (id, estado, motivo) {
      aplicarLocal(await pedir('cambiarEstadoBloque', { id: id, estado: estado, motivo: motivo }));
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
    mostrarFecha();
  }

  function mover(sentido) {
    fecha = KodamaFecha.sumarDias(fecha, sentido * (modo === 'dia' ? 1 : 7));
    mostrarFecha();
  }

  // Día y Semana de la navegación cambian el modo aquí mismo, sin recargar.
  KodamaNavegacion.alElegirModo(cambiarModo);
  document.getElementById('anterior').addEventListener('click', function () { mover(-1); });
  document.getElementById('siguiente').addEventListener('click', function () { mover(1); });
  document.getElementById('ir-hoy').addEventListener('click', function () {
    fecha = KodamaFecha.hoy();
    rango = KodamaVista.rangoCompleto(); // "Hoy" vuelve a la semana completa
    cargar(); // y siempre refresca
  });

  // Elegir los días: solo cambia qué parte de la semana (ya en memoria) se
  // dibuja, así que no pide nada al Web App.
  rangoDesde.addEventListener('change', function () {
    rango = KodamaVista.ajustarRango(rango, 'desde', rangoDesde.value);
    pintarEncabezado();
    renderizar();
  });
  rangoHasta.addEventListener('change', function () {
    rango = KodamaVista.ajustarRango(rango, 'hasta', rangoHasta.value);
    pintarEncabezado();
    renderizar();
  });

  // Girar el celular o cambiar el ancho de la ventana: colapsar o no.
  pantallaCelular.addEventListener('change', renderizar);

  // Al volver a la app (desde otra app o pestaña), se refresca por detrás.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') cargar();
  });

  document.getElementById('nuevo-bloque').addEventListener('click', function () {
    const inicio = KodamaFecha.proximaMediaHora();
    const area = areaPorDefecto();
    const valores = KodamaFormas.porArea(area); // tipo y duración según el área
    KodamaFormulario.abrirNuevo({
      titulo: '',
      area: area,
      tipo: valores.tipo,
      fecha: fechaPorDefecto(),
      inicio: inicio,
      fin: KodamaFormas.finPara(inicio, valores.duracion),
      etiqueta: '',
      notas: ''
    });
  });

  // Alumnos y catálogos: lo guardado se usa al instante; se refresca por
  // detrás y, cuando llega, se vuelven a pintar los nombres.
  KodamaAlumnos.alCambiar(function () {
    if (semanaEnPantalla) renderizar(); // mientras dice "Cargando..." no hay nada que repintar
  });

  await cargar();
  KodamaAlumnos.cargar().catch(function () {
    // Sin conexión: quedan los alumnos guardados en el dispositivo.
  });
  KodamaPlantillas.cargar(pedir).catch(function () {
    // Sin conexión: quedan las plantillas guardadas en el dispositivo.
  });
})();
