/**
 * Reglas prácticas de los formularios (Checkpoint 9). Lógica pura, con
 * pruebas: duración por defecto, fin que nunca queda antes del inicio,
 * valores según el área y días de la semana como botones.
 */
const KodamaFormas = (function () {
  // Universidad y Academia Fractal son clases: 90 min y tipo "fijo".
  // Startup y Personal: 60 min y "variable".
  const POR_AREA = {
    Universidad: { tipo: 'fijo', duracion: 90 },
    'Academia Fractal': { tipo: 'fijo', duracion: 90 },
    Startup: { tipo: 'variable', duracion: 60 },
    Personal: { tipo: 'variable', duracion: 60 }
  };
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const CLAVES_DIA = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];

  function porArea(area) {
    const v = POR_AREA[area] || { tipo: 'variable', duracion: 60 };
    return { tipo: v.tipo, duracion: v.duracion };
  }

  function minutos(hora) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function texto(total) {
    const t = Math.max(0, Math.min(total, 23 * 60 + 59));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  /** Minutos entre inicio y fin (0 o negativo si el fin no es posterior). */
  function duracion(inicio, fin) {
    const a = minutos(inicio);
    const b = minutos(fin);
    return a === null || b === null ? 0 : b - a;
  }

  /** inicio + duración, sin pasar de 23:59 (una clase no cruza la medianoche). */
  function finPara(inicio, duracionMin) {
    const a = minutos(inicio);
    return a === null ? '' : texto(a + duracionMin);
  }

  /**
   * Si el fin no es posterior al inicio, lo corrige a inicio + duración
   * por defecto. Devuelve { fin, corregido }. Si ni así queda después del
   * inicio (inicio a las 23:59), corregido es true y el fin queda 23:59:
   * el formulario lo avisa y no deja guardar.
   */
  function corregirFin(inicio, fin, duracionPorDefecto) {
    if (duracion(inicio, fin) > 0) return { fin: fin, corregido: false };
    return { fin: finPara(inicio, duracionPorDefecto), corregido: true };
  }

  /** "lun, MIE, vie" → [0, 2, 4]; ignora lo que no reconoce. */
  function diasDeTexto(textoDias) {
    const vistos = {};
    String(textoDias || '').split(/[^a-záéíóúñA-ZÁÉÍÓÚÑ]+/).forEach(function (token) {
      const clave = token.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().slice(0, 3);
      const i = CLAVES_DIA.indexOf(clave);
      if (i !== -1) vistos[i] = true;
    });
    return Object.keys(vistos).map(Number).sort();
  }

  /** [0, 2, 4] → "Lun, Mié, Vie" (siempre en orden de la semana). */
  function textoDeDias(indices) {
    return indices.slice().sort().map(function (i) { return DIAS[i]; }).join(', ');
  }

  return {
    DIAS: DIAS,
    porArea: porArea,
    duracion: duracion,
    finPara: finPara,
    corregirFin: corregirFin,
    diasDeTexto: diasDeTexto,
    textoDeDias: textoDeDias
  };
})();
