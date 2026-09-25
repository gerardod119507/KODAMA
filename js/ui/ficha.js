/**
 * Ficha de un bloque: solo lectura (título, área, horario, estado, lugar,
 * etiqueta, notas) con las acciones Editar, Mover, Duplicar y Archivar, y
 * el estado de la clase (Checkpoint 8): "Marcar dictada" es un solo toque
 * y solo aparece en Academia Fractal; "Cancelar clase" (en todas las
 * áreas) pide un motivo opcional antes de confirmar.
 *
 * Todo lo que viene del Sheet se escribe con textContent. Ninguna acción
 * navega a otra página: todo pasa en diálogos sobre la misma vista.
 */
const KodamaFicha = (function () {
  let dialogo;
  let acciones;
  let bloqueActual = null;

  function iniciar(opciones) {
    dialogo = document.getElementById('dialogo-ficha');
    acciones = opciones;

    document.getElementById('ficha-cerrar').addEventListener('click', cerrar);
    document.getElementById('ficha-editar').addEventListener('click', function () {
      const bloque = bloqueActual;
      cerrar();
      acciones.alEditar(bloque);
    });
    document.getElementById('ficha-mover').addEventListener('click', function () {
      const bloque = bloqueActual;
      cerrar();
      acciones.alMover(bloque);
    });
    document.getElementById('ficha-duplicar').addEventListener('click', function () {
      const bloque = bloqueActual;
      cerrar();
      acciones.alDuplicar(bloque);
    });
    document.getElementById('ficha-archivar').addEventListener('click', archivar);

    // Guardar como plantilla: pide solo un nombre (propone el que se ve).
    document.getElementById('ficha-plantilla-abrir').addEventListener('click', function () {
      document.getElementById('ficha-cancelacion').hidden = true;
      document.getElementById('ficha-plantilla').hidden = false;
      const nombre = document.getElementById('ficha-nombre-plantilla');
      nombre.value = (bloqueActual.tituloMostrado || bloqueActual.titulo || '').slice(0, 60);
      nombre.focus();
      nombre.select();
    });
    document.getElementById('ficha-plantilla-volver').addEventListener('click', function () {
      document.getElementById('ficha-plantilla').hidden = true;
    });
    document.getElementById('ficha-plantilla-guardar').addEventListener('click', guardarPlantilla);
    document.getElementById('ficha-nombre-plantilla').addEventListener('keydown', function (evento) {
      if (evento.key === 'Enter') { evento.preventDefault(); guardarPlantilla(); }
    });

    document.getElementById('ficha-dictada').addEventListener('click', function () {
      cambiarEstado('dictada', '', this);
    });
    document.getElementById('ficha-reactivar').addEventListener('click', function () {
      cambiarEstado('programada', '', this);
    });
    document.getElementById('ficha-cancelar').addEventListener('click', function () {
      document.getElementById('ficha-plantilla').hidden = true;
      document.getElementById('ficha-cancelacion').hidden = false;
      const motivo = document.getElementById('ficha-motivo');
      motivo.value = '';
      motivo.focus();
    });
    document.getElementById('ficha-cancelar-volver').addEventListener('click', function () {
      document.getElementById('ficha-cancelacion').hidden = true;
    });
    document.getElementById('ficha-cancelar-confirmar').addEventListener('click', function () {
      cambiarEstado('cancelada', document.getElementById('ficha-motivo').value, this);
    });
    document.getElementById('ficha-motivo').addEventListener('keydown', function (evento) {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        cambiarEstado('cancelada', this.value, document.getElementById('ficha-cancelar-confirmar'));
      }
    });

    // Tocar fuera de la ficha la cierra (es de solo lectura: no hay nada
    // escrito que se pueda perder).
    dialogo.addEventListener('click', function (evento) {
      if (evento.target === dialogo) cerrar();
    });
  }

  function escribir(id, texto) {
    document.getElementById(id).textContent = texto;
  }

  function mostrarFila(id, texto) {
    const fila = document.getElementById(id);
    fila.hidden = !texto;
    fila.querySelector('dd').textContent = texto || '';
  }

  function abrir(bloque) {
    bloqueActual = bloque;
    const tipo = KodamaDia.normalizarTipo(bloque.tipo);

    const icono = document.getElementById('ficha-icono');
    icono.innerHTML = KodamaIconos.svgTipo(tipo); // plantilla fija, sin datos
    dialogo.style.setProperty('--color-bloque', KodamaDia.colorDeBloque(bloque));

    escribir('ficha-tipo-area', (bloque.tipo || 'variable') + ' · ' + bloque.area);
    escribir('ficha-titulo', bloque.tituloMostrado || bloque.titulo || '(sin título)');
    escribir('ficha-horario', KodamaFecha.legible(bloque.fecha) + ' · ' + bloque.inicio + '–' + bloque.fin);
    pintarEstado(bloque);
    mostrarFila('ficha-fila-lugar', bloque.lugar);
    mostrarFila('ficha-fila-etiqueta', bloque.etiqueta);
    mostrarFila('ficha-fila-notas', bloque.notas);
    escribir('error-ficha', '');
    escribir('ficha-aviso', '');

    dialogo.showModal();
  }

  const SIMBOLO = { programada: '', dictada: '✓ ', movida: '↷ ', cancelada: '✕ ' };

  function pintarEstado(bloque) {
    const estado = KodamaClases.estado(bloque);
    const texto = document.getElementById('ficha-estado');
    texto.textContent = SIMBOLO[estado] + KodamaClases.textoEstado(bloque);
    texto.dataset.estado = estado;
    const movida = document.getElementById('ficha-movida');
    movida.textContent = KodamaClases.textoMovida(bloque);
    movida.hidden = !movida.textContent;

    // Programada o movida: se puede dictar o cancelar. Dictada o
    // cancelada: un solo botón para deshacerlo.
    const pendiente = estado === 'programada' || estado === 'movida';
    // "Dictada" es para cobrar: solo en Academia Fractal. Cancelar, en todas.
    document.getElementById('ficha-dictada').hidden = !pendiente || !KodamaClases.puedeDictarse(bloque);
    document.getElementById('ficha-cancelar').hidden = !pendiente;
    const reactivar = document.getElementById('ficha-reactivar');
    reactivar.hidden = pendiente;
    reactivar.textContent = estado === 'dictada' ? 'Desmarcar dictada' : 'Reactivar clase';
    document.getElementById('ficha-cancelacion').hidden = true;
    document.getElementById('ficha-plantilla').hidden = true;
  }

  async function guardarPlantilla() {
    const nombre = document.getElementById('ficha-nombre-plantilla').value.trim();
    if (!nombre) {
      escribir('error-ficha', 'Ponle un nombre a la plantilla.');
      return;
    }
    const boton = document.getElementById('ficha-plantilla-guardar');
    boton.disabled = true;
    try {
      await acciones.alGuardarPlantilla(bloqueActual, nombre);
      document.getElementById('ficha-plantilla').hidden = true;
      escribir('error-ficha', '');
      escribir('ficha-aviso', 'Plantilla "' + nombre + '" guardada: la vas a ver al tocar "+".');
    } catch (error) {
      escribir('error-ficha', 'No se pudo guardar la plantilla: ' + error.message);
    } finally {
      boton.disabled = false;
    }
  }

  async function cambiarEstado(estado, motivo, boton) {
    if (!bloqueActual) return;
    boton.disabled = true;
    escribir('error-ficha', '');
    try {
      await acciones.alCambiarEstado(bloqueActual.id, estado, motivo);
      cerrar(); // la grilla ya muestra el cambio (✓, tachada…)
    } catch (error) {
      escribir('error-ficha', 'No se pudo guardar: ' + error.message);
    } finally {
      boton.disabled = false;
    }
  }

  async function archivar() {
    if (!bloqueActual) return;
    if (!confirm('¿Archivar este bloque? Deja de aparecer, pero no se borra.')) return;
    const boton = document.getElementById('ficha-archivar');
    boton.disabled = true;
    try {
      await acciones.alArchivar(bloqueActual.id);
      cerrar();
    } catch (error) {
      escribir('error-ficha', 'No se pudo archivar: ' + error.message);
    } finally {
      boton.disabled = false;
    }
  }

  function cerrar() {
    dialogo.close();
  }

  return { iniciar: iniciar, abrir: abrir };
})();
