/**
 * Cobros (Checkpoint 8): cuánto acumuló en el mes cada alumno que paga
 * mensual y si ya pagó. Lógica pura sobre bloques, alumnos y pagos; el
 * monto sale de KodamaEstadisticas (horas dictadas × tarifa del alumno).
 */
const KodamaCobros = (function () {
  /** "2026-09" → { desde: "2026-09-01", hasta: "2026-09-30" }. */
  function rangoDelMes(mes) {
    const partes = mes.split('-').map(Number);
    const ultimo = new Date(Date.UTC(partes[0], partes[1], 0)).getUTCDate();
    return { desde: mes + '-01', hasta: mes + '-' + String(ultimo).padStart(2, '0') };
  }

  /** Pagos no archivados cuyo periodo se cruza con [desde, hasta]. */
  function pagosDelPeriodo(pagos, desde, hasta, alumnoId) {
    return (pagos || []).filter(function (p) {
      return p.archivado !== 'TRUE' && p.desde <= hasta && p.hasta >= desde &&
        (!alumnoId || p.alumno_id === alumnoId);
    });
  }

  /**
   * Situación de pago de un alumno en un periodo: "pagado" si algún pago
   * del periodo está pagado; si no, "pendiente" si hay uno pendiente; si
   * no hay ninguno, "sin_registrar".
   */
  function situacion(pagos, alumnoId, desde, hasta) {
    const propios = pagosDelPeriodo(pagos, desde, hasta, alumnoId);
    const pagados = propios.filter(function (p) { return p.estado === 'pagado'; });
    if (pagados.length) {
      const pagado = pagados.reduce(function (s, p) { return s + Number(p.monto || 0); }, 0);
      const ultimo = pagados.map(function (p) { return p.fecha_pago; }).sort().pop();
      return { estado: 'pagado', monto: Math.round(pagado * 100) / 100, fecha_pago: ultimo };
    }
    const pendiente = propios.find(function (p) { return p.estado === 'pendiente'; });
    if (pendiente) return { estado: 'pendiente', monto: Number(pendiente.monto || 0), pago: pendiente };
    return { estado: 'sin_registrar' };
  }

  /**
   * Una fila por alumno activo con forma de pago mensual: clases y horas
   * dictadas del mes, monto acumulado y situación de pago.
   */
  function resumenMensual(bloques, alumnos, pagos, mes) {
    const rango = rangoDelMes(mes);
    const calculo = KodamaEstadisticas.calcular(bloques, alumnos, { desde: rango.desde, hasta: rango.hasta });
    const porId = {};
    calculo.porAlumno.forEach(function (f) { porId[f.id] = f; });
    return (alumnos || [])
      .filter(function (a) { return a.forma_pago === 'mensual' && a.archivado !== 'TRUE'; })
      .map(function (a) {
        const f = porId[a.id];
        return {
          alumno: a,
          nombre: (a.nombre + ' ' + (a.apellido || '')).trim(),
          dictadas: f ? f.dictadas : 0,
          horas: f ? f.horas : 0,
          monto: f ? f.monto : 0,
          sinTarifa: KodamaEstadisticas.tarifaDe(a) === null,
          situacion: situacion(pagos, a.id, rango.desde, rango.hasta)
        };
      })
      .sort(function (x, y) { return x.nombre.localeCompare(y.nombre); });
  }

  return {
    rangoDelMes: rangoDelMes,
    pagosDelPeriodo: pagosDelPeriodo,
    situacion: situacion,
    resumenMensual: resumenMensual
  };
})();
