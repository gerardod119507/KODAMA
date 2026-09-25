/**
 * Estado de una clase (Checkpoint 8): programada | dictada | movida |
 * cancelada. Un bloque de antes, sin estado, cuenta como programado.
 * "Movida" la pone el backend al mover el bloque (moverBloque), que además
 * recuerda la fecha y hora originales.
 *
 * "Dictada" sirve para cobrar, así que solo existe en Academia Fractal. En
 * las otras áreas un bloque "dictada" (de antes de esta regla, o de una
 * copia vieja guardada en el dispositivo) se lee como programada — o
 * movida, si está en otro día u hora que el original. Cancelar y mover sí
 * valen en todas las áreas.
 */
const KodamaClases = (function () {
  const NOMBRES = { programada: 'Programada', dictada: 'Dictada', movida: 'Movida', cancelada: 'Cancelada' };
  const AREA_QUE_SE_DICTA = 'Academia Fractal';

  function puedeDictarse(bloque) {
    return Boolean(bloque) && String(bloque.area || '').trim() === AREA_QUE_SE_DICTA;
  }

  function estado(bloque) {
    const e = String((bloque && bloque.estado) || '').trim() || 'programada';
    if (e === 'dictada' && !puedeDictarse(bloque)) {
      return bloque.fecha_original ? 'movida' : 'programada';
    }
    return e;
  }

  function esCancelada(bloque) {
    return estado(bloque) === 'cancelada';
  }

  /**
   * "Movida del jue 24 al sáb 26"; si solo cambió la hora, "Movida de
   * 15:00 a 17:00 (jue 24)". Vacío si nunca se movió.
   */
  function textoMovida(bloque) {
    if (!bloque || !bloque.fecha_original) return '';
    if (bloque.fecha_original !== bloque.fecha) {
      return 'Movida del ' + KodamaFecha.diaCorto(bloque.fecha_original) + ' al ' + KodamaFecha.diaCorto(bloque.fecha);
    }
    return 'Movida de ' + bloque.inicio_original + ' a ' + bloque.inicio + ' (' + KodamaFecha.diaCorto(bloque.fecha) + ')';
  }

  /** Lo que dice la ficha: "Dictada", "Cancelada · feriado", "Programada"… */
  function textoEstado(bloque) {
    const e = estado(bloque);
    return NOMBRES[e] + (e === 'cancelada' && bloque.motivo ? ' · ' + bloque.motivo : '');
  }

  return {
    estado: estado, puedeDictarse: puedeDictarse, esCancelada: esCancelada,
    textoMovida: textoMovida, textoEstado: textoEstado, NOMBRES: NOMBRES
  };
})();
