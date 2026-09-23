/**
 * Ficha de un bloque: solo lectura (título, área, horario, etiqueta, notas)
 * con las acciones Editar, Mover, Duplicar y Archivar.
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
    mostrarFila('ficha-fila-lugar', bloque.lugar);
    mostrarFila('ficha-fila-etiqueta', bloque.etiqueta);
    mostrarFila('ficha-fila-notas', bloque.notas);
    escribir('error-ficha', '');

    dialogo.showModal();
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
