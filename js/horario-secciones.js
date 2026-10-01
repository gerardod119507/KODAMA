/**
 * Las reglas de la hoja Horario, separadas por lo que son (lógica pura,
 * con pruebas):
 *
 * - Materias: las de Universidad. Se repiten todo el semestre.
 * - Alumnos fijos: las de Academia Fractal. Se programan por mes.
 * - Otros: Startup y Personal.
 *
 * Cada sección tiene su formulario y sus palabras (materia, aula,
 * semestre; alumno, mes), aunque en la hoja todas son filas de Horario.
 */
const KodamaSeccionesHorario = (function () {
  const AREA_DE = { materias: 'Universidad', fijos: 'Academia Fractal' };

  function seccionDe(regla) {
    if (regla.area === AREA_DE.materias) return 'materias';
    if (regla.area === AREA_DE.fijos) return 'fijos';
    return 'otros';
  }

  /** "2026-10" → { desde: "2026-10-01", hasta: "2026-10-31" } (bisiestos incluidos). */
  function limitesDelMes(mes) {
    const partes = String(mes || '').split('-').map(Number);
    const ultimo = new Date(Date.UTC(partes[0], partes[1], 0)).getUTCDate();
    return { desde: mes + '-01', hasta: mes + '-' + String(ultimo).padStart(2, '0') };
  }

  /** Las reglas de una sección; archivadas al final, y por hora de inicio. */
  function deSeccion(reglas, seccion) {
    return reglas
      .filter(function (r) { return seccionDe(r) === seccion; })
      .sort(function (a, b) {
        const archA = a.archivado === 'TRUE' ? 1 : 0;
        const archB = b.archivado === 'TRUE' ? 1 : 0;
        return archA - archB || a.inicio.localeCompare(b.inicio) || String(a.titulo).localeCompare(String(b.titulo));
      });
  }

  /** Alumnos fijos que tienen clases en ese mes (su desde–hasta se cruza con el mes). */
  function fijosDelMes(reglas, mes) {
    const m = limitesDelMes(mes);
    return deSeccion(reglas, 'fijos').filter(function (r) {
      return r.desde <= m.hasta && r.hasta >= m.desde;
    });
  }

  return { AREA_DE: AREA_DE, seccionDe: seccionDe, limitesDelMes: limitesDelMes, deSeccion: deSeccion, fijosDelMes: fijosDelMes };
})();
