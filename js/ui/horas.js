/**
 * Conecta los campos de un formulario (área, tipo, inicio, fin) con las
 * reglas de KodamaFormas:
 * - al elegir el inicio, el fin se completa con la duración: la que ya
 *   tenía el bloque (al editar, o si cambiaste el fin a mano), o la del
 *   área (90 min en clases, 60 en el resto);
 * - si el fin queda antes o igual al inicio, se corrige solo y se avisa;
 * - en uno nuevo, cambiar el área pone su tipo y su duración, mientras no
 *   los hayas tocado tú.
 */
const KodamaHoras = (function () {
  function conectar(c) {
    let duracionElegida = null; // null = la del área
    let tipoTocado = false;
    let nuevo = true;

    function aviso(texto) {
      if (c.aviso) c.aviso.textContent = texto || '';
    }

    function duracionActual() {
      return duracionElegida || KodamaFormas.porArea(c.area.value).duracion;
    }

    c.inicio.addEventListener('change', function () {
      if (!c.inicio.value) return;
      c.fin.value = KodamaFormas.finPara(c.inicio.value, duracionActual());
      aviso('');
      revisar();
    });

    c.fin.addEventListener('change', function () {
      if (!c.inicio.value || !c.fin.value) return;
      const r = KodamaFormas.corregirFin(c.inicio.value, c.fin.value, duracionActual());
      if (r.corregido) {
        c.fin.value = r.fin;
        aviso('El fin no puede ser antes ni igual que el inicio: lo cambié a ' + r.fin + '.');
      } else {
        duracionElegida = KodamaFormas.duracion(c.inicio.value, c.fin.value);
        aviso('');
      }
      revisar();
    });

    if (c.tipo) c.tipo.addEventListener('change', function () { tipoTocado = true; });

    c.area.addEventListener('change', function () {
      if (!nuevo) return; // al editar, cambiar el área no toca nada más
      const valores = KodamaFormas.porArea(c.area.value);
      if (c.tipo && !tipoTocado) c.tipo.value = valores.tipo;
      if (duracionElegida === null && c.inicio.value) {
        c.fin.value = KodamaFormas.finPara(c.inicio.value, valores.duracion);
      }
    });

    /** Inicio a las 23:59 no deja lugar: se avisa (guardar lo va a rechazar). */
    function revisar() {
      if (c.inicio.value && c.fin.value && KodamaFormas.duracion(c.inicio.value, c.fin.value) <= 0) {
        aviso('El fin tiene que ser después del inicio (un bloque no cruza la medianoche).');
      }
    }

    return {
      /**
       * Al abrir el formulario. esNuevo: aplica los valores del área. Al
       * editar (o con plantilla), la duración que ya trae el bloque manda.
       */
      reiniciar: function (esNuevo, conservarDuracion) {
        nuevo = esNuevo;
        tipoTocado = !esNuevo;
        duracionElegida = (!esNuevo || conservarDuracion) && c.inicio.value && c.fin.value
          ? KodamaFormas.duracion(c.inicio.value, c.fin.value) || null
          : null;
        aviso('');
      },
      /** Una plantilla elegida trae su propia duración. */
      fijarDuracion: function (min) {
        duracionElegida = min || null;
      },
      /** true si inicio y fin son válidos (para no mandar algo que el backend rechaza). */
      valido: function () {
        return KodamaFormas.duracion(c.inicio.value, c.fin.value) > 0;
      }
    };
  }

  return { conectar: conectar };
})();
