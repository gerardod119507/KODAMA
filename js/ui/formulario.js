/**
 * Diálogo para crear/editar un bloque. Un solo formulario con varios
 * modos: completo (crear, editar; el tipo —fijo, variable, reunión— se
 * elige adentro), mover (solo fecha y hora) y duplicar (solo la fecha
 * nueva: el resto se copia). Los modos ocultan campos por CSS en vez de
 * duplicar el formulario.
 *
 * Checkpoint 9: el fin se completa solo con la duración (KodamaHoras), la
 * fecha tiene "Hoy" y "Mañana", y un bloque nuevo puede salir de una
 * plantilla con un toque.
 *
 * Si guardar falla, el diálogo queda abierto con todo lo escrito: escribir
 * requiere conexión, pero perder lo tipeado no es aceptable.
 */
const KodamaFormulario = (function () {
  const AREAS = ['Universidad', 'Academia Fractal', 'Startup', 'Personal'];
  const TIPOS = ['fijo', 'variable', 'reunión'];
  const CAMPOS = ['titulo', 'area', 'tipo', 'fecha', 'inicio', 'fin', 'lugar', 'etiqueta', 'notas', 'alumno_id'];
  const AREA_FRACTAL = 'Academia Fractal';

  let dialogo;
  let campos;
  let alGuardar;
  let alArchivar;
  let idEnEdicion = null;
  let modoActual = null; // nuevo | edicion | mover | duplicar
  let horas = null;
  let alArchivarPlantilla = null;
  let selectorAlumnos = null;
  // En un bloque NUEVO, el lugar se completa con el lugar habitual del
  // alumno elegido mientras no lo hayas escrito tú (si lo tocas, manda lo tuyo).
  let lugarAutomatico = false;

  function iniciar(opciones) {
    dialogo = document.getElementById('dialogo-bloque');
    campos = {
      titulo: document.getElementById('campo-titulo'),
      area: document.getElementById('campo-area'),
      tipo: document.getElementById('campo-tipo'),
      fecha: document.getElementById('campo-fecha'),
      inicio: document.getElementById('campo-inicio'),
      fin: document.getElementById('campo-fin'),
      lugar: document.getElementById('campo-lugar'),
      etiqueta: document.getElementById('campo-etiqueta'),
      notas: document.getElementById('campo-notas')
    };
    alGuardar = opciones.alGuardar;
    alArchivar = opciones.alArchivar;
    alArchivarPlantilla = opciones.alArchivarPlantilla;

    horas = KodamaHoras.conectar({
      area: campos.area, tipo: campos.tipo, inicio: campos.inicio, fin: campos.fin,
      aviso: document.getElementById('aviso-horas')
    });
    document.getElementById('fecha-hoy').addEventListener('click', function () {
      campos.fecha.value = KodamaFecha.hoy();
    });
    document.getElementById('fecha-manana').addEventListener('click', function () {
      campos.fecha.value = KodamaFecha.sumarDias(KodamaFecha.hoy(), 1);
    });
    KodamaPlantillas.alCambiar(function () { if (modoActual === 'nuevo') pintarPlantillas(); });

    llenarOpciones(campos.area, AREAS);
    llenarOpciones(campos.tipo, TIPOS);

    // Alumnos (solo Academia Fractal): autocompletado + alta sin salir.
    selectorAlumnos = KodamaSelectorAlumnos.crear(document.getElementById('campo-alumnos'), {
      crearAlumno: opciones.crearAlumno,
      alCambiar: function (ids) {
        if (idEnEdicion || !lugarAutomatico) return;
        campos.lugar.value = KodamaAlumnos.lugarDeAlumnos(ids);
      }
    });
    campos.lugar.addEventListener('input', function () { lugarAutomatico = false; });
    campos.area.addEventListener('change', actualizarSegunArea);
    KodamaAlumnos.alCambiar(function () { selectorAlumnos.repintar(); });

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
    modoActual = modo;
    document.getElementById('titulo-dialogo').textContent = titulo;
    const sub = document.getElementById('subtitulo-dialogo');
    sub.textContent = subtitulo || '';
    sub.hidden = !subtitulo;
    document.getElementById('archivar-bloque').hidden = modo !== 'edicion';
    dialogo.classList.toggle('modo-mover', modo === 'mover' || modo === 'duplicar');
    dialogo.classList.toggle('modo-duplicar', modo === 'duplicar');
    document.getElementById('plantillas-nuevo').hidden = true;
    mostrarError('');
  }

  function abrirNuevo(valoresPorDefecto) {
    preparar('Nuevo bloque', '', 'nuevo', null);
    escribirCampos(valoresPorDefecto);
    horas.reiniciar(true);
    lugarAutomatico = !campos.lugar.value;
    pintarPlantillas();
    dialogo.showModal();
    if (esFractal()) selectorAlumnos.enfocar();
    else campos.titulo.focus();
  }

  function abrirEdicion(bloque) {
    preparar('Editar bloque', '', 'edicion', bloque.id);
    escribirCampos(bloque);
    horas.reiniciar(false);
    dialogo.showModal();
  }

  /** Solo fecha y hora; el resto del bloque viaja igual, sin cambios. */
  function abrirMover(bloque) {
    preparar('Mover bloque', bloque.tituloMostrado || bloque.titulo, 'mover', bloque.id);
    escribirCampos(bloque);
    horas.reiniciar(false);
    dialogo.showModal();
    campos.fecha.focus();
  }

  /** Un bloque nuevo igual (misma hora, mismos datos): solo se pide la fecha. */
  function abrirDuplicado(bloque) {
    preparar('Duplicar bloque', 'Copia de "' + (bloque.tituloMostrado || bloque.titulo || '') + '", ' +
      bloque.inicio + '–' + bloque.fin + '. Elige la fecha nueva.', 'duplicar', null);
    escribirCampos(valoresDuplicado(bloque));
    campos.fecha.value = ''; // vacía a propósito: que no se duplique sin querer en el mismo día
    horas.reiniciar(false);
    dialogo.showModal();
    campos.fecha.focus();
  }

  /** Botones de plantillas arriba del formulario (solo en un bloque nuevo). */
  function pintarPlantillas() {
    const lista = KodamaPlantillas.actual();
    const zona = document.getElementById('plantillas-nuevo');
    const contenedor = document.getElementById('lista-plantillas');
    contenedor.replaceChildren();
    zona.hidden = lista.length === 0;
    lista.forEach(function (plantilla) {
      const item = document.createElement('span');
      item.className = 'plantilla';
      const usar = document.createElement('button');
      usar.type = 'button';
      usar.className = 'plantilla__usar';
      usar.textContent = plantilla.nombre;
      usar.title = plantilla.area + ' · ' + plantilla.duracion + ' min' + (plantilla.lugar ? ' · ' + plantilla.lugar : '');
      usar.addEventListener('click', function () { usarPlantilla(plantilla); });
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'plantilla__quitar';
      quitar.textContent = '✕';
      quitar.setAttribute('aria-label', 'Quitar la plantilla ' + plantilla.nombre);
      quitar.addEventListener('click', async function () {
        if (!confirm('¿Quitar la plantilla "' + plantilla.nombre + '"? Los bloques ya creados no cambian.')) return;
        try {
          await alArchivarPlantilla(plantilla.id);
        } catch (error) {
          mostrarError('No se pudo quitar la plantilla: ' + error.message);
        }
      });
      item.append(usar, quitar);
      contenedor.appendChild(item);
    });
  }

  /** Un toque: todo lo de la plantilla, con la fecha y la hora de inicio que ya están. */
  function usarPlantilla(plantilla) {
    escribirCampos(KodamaPlantillas.valoresDesde(plantilla, campos.fecha.value, campos.inicio.value));
    horas.reiniciar(true, true);
    lugarAutomatico = false;
    mostrarError('');
    campos.inicio.focus();
  }

  function esFractal() {
    return campos.area.value === AREA_FRACTAL;
  }

  /**
   * En Academia Fractal aparece el campo de alumnos y el título pasa a ser
   * opcional (el nombre que se ve sale de los alumnos elegidos).
   */
  function actualizarSegunArea() {
    document.getElementById('campo-alumnos').hidden = !esFractal();
    document.getElementById('etiqueta-titulo').textContent = esFractal() ? 'Tema (opcional)' : 'Título';
  }

  function escribirCampos(valores) {
    Object.keys(campos).forEach(function (clave) {
      campos[clave].value = valores[clave] != null ? valores[clave] : '';
    });
    selectorAlumnos.fijar(valores.alumno_id || '');
    actualizarSegunArea();
  }

  function leerCampos() {
    const datos = {};
    Object.keys(campos).forEach(function (clave) { datos[clave] = campos[clave].value; });
    // Si se cambió el área a otra, la clase deja de tener alumnos.
    datos.alumno_id = esFractal() ? selectorAlumnos.valor() : '';
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
    if (!datos.fecha) {
      mostrarError('Elige la fecha.');
      campos.fecha.focus();
      return;
    }
    if (!horas.valido()) {
      mostrarError('El fin tiene que ser después del inicio.');
      campos.fin.focus();
      return;
    }
    if (!datos.titulo.trim() && !datos.alumno_id) {
      if (esFractal()) {
        mostrarError('Elige al menos un alumno (o escribe un tema).');
        selectorAlumnos.enfocar();
      } else {
        mostrarError('Falta el título.');
        campos.titulo.focus();
      }
      return;
    }

    mostrarError('');
    ocupado(true);
    try {
      await alGuardar(idEnEdicion, datos, modoActual);
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
