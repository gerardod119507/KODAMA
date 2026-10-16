/**
 * KODAMA — las acciones que pide la app (antes ACCIONES en apps-script/Code.gs).
 *
 * ÚNICA fuente de verdad de qué acciones existen: el nombre aquí tiene que
 * ser IDÉNTICO, carácter por carácter, al que manda la app
 * (KodamaApi.llamar('nombreDeAccion', ...) en js/*.js). Agregar una acción
 * nueva es agregar una entrada aquí.
 *
 * Mismos nombres y mismos parámetros que en el Apps Script: las pantallas
 * siguen pidiendo exactamente lo mismo. "migrarAlumnosFractal" ya no está:
 * era la herramienta para pasar los nombres escritos en los títulos a
 * alumnos vinculados, y antes de la mudanza no quedaba ninguna clase sin
 * vincular.
 */
(function (B) {
  B.acciones = {
    ping: async function () {
      return { mensaje: 'pong', zonaHoraria: B.ZONA_HORARIA };
    },
    listarAreas: function () {
      return B.listarAreas();
    },
    listarBloquesDia: function (p) {
      return B.listarBloquesDia(p.fecha);
    },
    listarBloquesRango: function (p) {
      return B.listarBloquesRango(p.desde, p.hasta);
    },
    generarHorario: function () {
      return B.generarHorario();
    },
    crearBloque: function (p) {
      return B.crearBloque(p.bloque);
    },
    actualizarBloque: function (p) {
      return B.actualizarBloque(p.id, p.cambios);
    },
    archivarBloque: function (p) {
      return B.archivarBloque(p.id);
    },
    cambiarEstadoBloque: function (p) {
      return B.cambiarEstadoBloque(p.id, p.estado, p.motivo);
    },
    moverBloque: function (p) {
      return B.moverBloque(p.id, p.fecha, p.inicio, p.fin);
    },
    listarHorario: function () {
      return B.listarHorario();
    },
    // Con regenerar: true, después de guardar se regenera el horario en la
    // misma llamada: la grilla queda al día sin otro toque.
    crearRegla: function (p) {
      return B.conRegeneracion(B.crearRegla(p.regla), p.regenerar === true);
    },
    actualizarRegla: function (p) {
      return B.conRegeneracion(B.actualizarRegla(p.id, p.cambios), p.regenerar === true);
    },
    archivarRegla: function (p) {
      return B.conRegeneracion(B.archivarRegla(p.id), p.regenerar === true);
    },
    borrarRegla: function (p) {
      return B.borrarRegla(p.id);
    },
    borrarBloque: function (p) {
      return B.borrarBloque(p.id);
    },
    listarFijosSueltos: function () {
      return B.listarFijosSueltos();
    },
    listarSeries: function () {
      return B.listarSeries();
    },
    borrarSerie: function (p) {
      return B.borrarSerie(p.idSerie);
    },
    listarAlumnos: function () {
      return B.listarAlumnos();
    },
    crearAlumno: function (p) {
      return B.crearAlumno(p.alumno);
    },
    actualizarAlumno: function (p) {
      return B.actualizarAlumno(p.id, p.cambios);
    },
    archivarAlumno: function (p) {
      return B.archivarAlumno(p.id);
    },
    guardarCatalogo: function (p) {
      return B.guardarCatalogo(p.tipo, p.anterior, p.item);
    },
    importar: function (p) {
      return B.importar(p.modo, p.texto, p.aplicar === true);
    },
    listarPagos: function () {
      return B.listarPagos();
    },
    crearPago: function (p) {
      return B.crearPago(p.pago);
    },
    actualizarPago: function (p) {
      return B.actualizarPago(p.id, p.cambios);
    },
    archivarPago: function (p) {
      return B.archivarPago(p.id);
    },
    listarPlantillas: function () {
      return B.listarPlantillas();
    },
    crearPlantilla: function (p) {
      return B.crearPlantilla(p.plantilla);
    },
    archivarPlantilla: function (p) {
      return B.archivarPlantilla(p.id);
    }
  };

  /**
   * Corre una acción con la misma respuesta que daba el Web App:
   * { ok: true, data } o { ok: false, error }. Sin red, el error se deja
   * pasar (lo que hacía fetch con el Web App), así cada pantalla sigue
   * mostrando lo guardado con "Sin conexión".
   */
  B.ejecutar = async function (accion, parametros) {
    const manejador = B.acciones[accion];
    if (!manejador) {
      return {
        ok: false,
        error: 'accion_desconocida: recibida "' + accion + '", acciones válidas: ' + Object.keys(B.acciones).join(', ')
      };
    }
    try {
      return { ok: true, data: await manejador(parametros || {}) };
    } catch (error) {
      if (error && error.red) throw error;
      return { ok: false, error: String(error && error.message ? error.message : error) };
    }
  };
})(KodamaBackend);
