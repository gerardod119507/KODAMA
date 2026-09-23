/**
 * Diálogo para crear/editar un bloque. Un solo formulario con tres modos:
 * completo, rápido (solo título y hora, para una reunión imprevista) y
 * mover (solo fecha y hora). Cada modo oculta campos por CSS en vez de
 * duplicar el formulario.
 *
 * Si guardar falla, el diálogo queda abierto con todo lo escrito: escribir
 * requiere conexión, pero perder lo tipeado no es aceptable.
 */
const KodamaFormulario = (function () {
  const AREAS = ['Universidad', 'Academia Fractal', 'Startup', 'Personal'];
  const TIPOS = ['fijo', 'variable', 'reunión'];
  const CAMPOS = ['titulo', 'area', 'tipo', 'fecha', 'inicio', 'fin', 'etiqueta', 'notas'];

  let dialogo;
  let campos;
  let alGuardar;
  let alArchivar;
  let idEnEdicion = null;

  function iniciar(opciones) {
    dialogo = document.getElementById('dialogo-bloque');
    campos = {
      titulo: document.getElementById('campo-titulo'),
      area: document.getElementById('campo-area'),
      tipo: document.getElementById('campo-tipo'),
      fecha: document.getElementById('campo-fecha'),
      inicio: document.getElementById('campo-inicio'),
      fin: document.getElementById('campo-fin'),
      etiqueta: document.getElementById('campo-etiqueta'),
      notas: document.getElementById('campo-notas')
    };
    alGuardar = opciones.alGuardar;
    alArchivar = opciones.alArchivar;

    llenarOpciones(campos.area, AREAS);
    llenarOpciones(campos.tipo, TIPOS);

    document.getElementById('form-bloque').addEventListener('submit', async function (evento) {
      evento.preventDefault();
      await guardar();
    });
    document.getElementById('cancelar-bloque').addEventListener('click', cerrar);
    document.getElementById('archivar-bloque').addEventListener('click', archivar);
  }

  function llenarOpciones(selector, valores) {
    valores.forEach(function (valor) {
      const opcion = document.createElement('option');
      opcion.value = valor;
      opcion.textContent = valor;
      selector.appendChild(opcion);
    });
  }

  function preparar(titulo, subtitulo, modo, id) {
    idEnEdicion = id;
    document.getElementById('titulo-dialogo').textContent = titulo;
    const sub = document.getElementById('subtitulo-dialogo');
    sub.textContent = subtitulo || '';
    sub.hidden = !subtitulo;
    document.getElementById('archivar-bloque').hidden = modo !== 'edicion';
    dialogo.classList.toggle('modo-rapido', modo === 'rapido');
    dialogo.classList.toggle('modo-mover', modo === 'mover');
    mostrarError('');
  }

  function abrirNuevo(valoresPorDefecto, modoRapido) {
    preparar(modoRapido ? 'Reunión rápida' : 'Nuevo bloque', '', modoRapido ? 'rapido' : 'nuevo', null);
    escribirCampos(valoresPorDefecto);
    dialogo.showModal();
    campos.titulo.focus();
  }

  function abrirEdicion(bloque) {
    preparar('Editar bloque', '', 'edicion', bloque.id);
    escribirCampos(bloque);
    dialogo.showModal();
  }

  /** Solo fecha y hora; el resto del bloque viaja igual, sin cambios. */
  function abrirMover(bloque) {
    preparar('Mover bloque', bloque.titulo, 'mover', bloque.id);
    escribirCampos(bloque);
    dialogo.showModal();
    campos.fecha.focus();
  }

  /** Un bloque nuevo con los mismos datos; se suele cambiar la fecha. */
  function abrirDuplicado(bloque) {
    preparar('Duplicar bloque', 'Copia de "' + (bloque.titulo || '') + '". Cambiá lo que haga falta y guardá.', 'nuevo', null);
    escribirCampos(valoresDuplicado(bloque));
    dialogo.showModal();
    campos.fecha.focus();
  }

  function escribirCampos(valores) {
    Object.keys(campos).forEach(function (clave) {
      campos[clave].value = valores[clave] != null ? valores[clave] : '';
    });
  }

  function leerCampos() {
    const datos = {};
    Object.keys(campos).forEach(function (clave) { datos[clave] = campos[clave].value; });
    return datos;
  }

  function mostrarError(mensaje) {
    document.getElementById('error-bloque').textContent = mensaje;
  }

  function ocupado(estado) {
    document.getElementById('guardar-bloque').disabled = estado;
    document.getElementById('archivar-bloque').disabled = estado;
  }

  async function guardar() {
    const datos = leerCampos();
    if (!datos.titulo.trim()) {
      mostrarError('Falta el título.');
      campos.titulo.focus();
      return;
    }

    mostrarError('');
    ocupado(true);
    try {
      await alGuardar(idEnEdicion, datos);
      cerrar();
    } catch (error) {
      // No se cierra ni se limpia: lo escrito sigue ahí para reintentar.
      mostrarError('No se pudo guardar: ' + error.message);
    } finally {
      ocupado(false);
    }
  }

  async function archivar() {
    if (!idEnEdicion) return;
    if (!confirm('¿Archivar este bloque? Deja de aparecer, pero no se borra.')) return;

    ocupado(true);
    try {
      await alArchivar(idEnEdicion);
      cerrar();
    } catch (error) {
      mostrarError('No se pudo archivar: ' + error.message);
    } finally {
      ocupado(false);
    }
  }

  function cerrar() {
    dialogo.close();
  }

  /**
   * Los datos de un bloque para crear uno igual: sin id ni fechas de
   * registro. Un duplicado de una clase del horario ("fijo") queda como
   * bloque suelto: su id nuevo no tiene sufijo de fecha, así que el
   * generador nunca lo toca.
   */
  function valoresDuplicado(bloque) {
    const copia = {};
    CAMPOS.forEach(function (campo) { copia[campo] = bloque[campo] != null ? bloque[campo] : ''; });
    return copia;
  }

  return {
    iniciar: iniciar,
    abrirNuevo: abrirNuevo,
    abrirEdicion: abrirEdicion,
    abrirMover: abrirMover,
    abrirDuplicado: abrirDuplicado,
    valoresDuplicado: valoresDuplicado
  };
})();
