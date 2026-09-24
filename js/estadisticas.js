/**
 * Cálculos de Estadísticas y Cobros (Checkpoint 8). Lógica pura: recibe
 * bloques y alumnos, devuelve números; no toca el DOM ni pide nada.
 *
 * Reglas:
 * - Solo las clases DICTADAS suman clases, horas y monto.
 * - Monto = horas dictadas × tarifa_hora de CADA alumno: una clase
 *   compartida suma la tarifa de cada uno.
 * - Canceladas: se cuentan, no suman horas ni monto.
 * - Movidas: las que tienen fecha original (se movieron alguna vez) y no
 *   se cancelaron; una movida que después se dictó cuenta en las dos.
 * - Horas por área: todas las clases no canceladas (el tiempo que ocupó
 *   cada área), porque Universidad o Startup no se marcan como dictadas.
 */
const KodamaEstadisticas = (function () {
  function minutos(hora) {
    const partes = String(hora || '').split(':').map(Number);
    return partes[0] * 60 + partes[1];
  }

  function duracion(bloque) {
    const d = minutos(bloque.fin) - minutos(bloque.inicio);
    return d > 0 ? d : 0;
  }

  function estado(bloque) {
    return String(bloque.estado || '').trim() || 'programada';
  }

  function fueMovida(bloque) {
    return Boolean(bloque.fecha_original) && estado(bloque) !== 'cancelada';
  }

  /** Tarifa por hora como número, o null si no está cargada o no es un número. */
  function tarifaDe(alumno) {
    const texto = String((alumno && alumno.tarifa_hora) || '').replace(',', '.').trim();
    if (!/^\d+(\.\d+)?$/.test(texto)) return null;
    return Number(texto);
  }

  function redondear(n) {
    return Math.round(n * 100) / 100;
  }

  function ids(texto) {
    return String(texto || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function nombreDe(alumno, id) {
    return alumno ? (alumno.nombre + ' ' + (alumno.apellido || '')).trim() : '(alumno ' + id + ')';
  }

  const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

  function rangoValido(desde, hasta) {
    return FORMATO_FECHA.test(desde || '') && FORMATO_FECHA.test(hasta || '') && desde <= hasta;
  }

  /** Cantidad de días entre dos fechas, ambas incluidas. */
  function diasEntre(desde, hasta) {
    let n = 1;
    let fecha = desde;
    // Rangos cortos (días o meses): un bucle simple evita errores de husos.
    while (fecha < hasta) {
      fecha = KodamaFecha.sumarDias(fecha, 1);
      n++;
    }
    return n;
  }

  /** El periodo del mismo largo justo antes: 1–30 sep → 2–31 ago. */
  function periodoAnterior(desde, hasta) {
    const n = diasEntre(desde, hasta);
    return { desde: KodamaFecha.sumarDias(desde, -n), hasta: KodamaFecha.sumarDias(desde, -1) };
  }

  /**
   * opciones: { desde, hasta, area ('' = todas), areas: [nombres en orden] }
   * Devuelve { porAlumno, totales, porArea }.
   */
  function calcular(bloques, alumnos, opciones) {
    const o = opciones || {};
    const porId = {};
    (alumnos || []).forEach(function (a) { porId[a.id] = a; });
    const filas = {};
    const totales = { dictadas: 0, minutos: 0, monto: 0, movidas: 0, canceladas: 0 };
    const minutosPorArea = {};

    (bloques || []).forEach(function (b) {
      if (b.archivado === 'TRUE' || b.fecha < o.desde || b.fecha > o.hasta) return;
      if (o.area && b.area !== o.area) return;
      const e = estado(b);
      const dur = duracion(b);
      const movida = fueMovida(b);
      if (e === 'dictada') {
        totales.dictadas++;
        totales.minutos += dur;
      }
      if (e === 'cancelada') {
        totales.canceladas++;
      } else {
        minutosPorArea[b.area] = (minutosPorArea[b.area] || 0) + dur;
      }
      if (movida) totales.movidas++;

      ids(b.alumno_id).forEach(function (id) {
        const alumno = porId[id];
        const tarifa = tarifaDe(alumno);
        const fila = filas[id] || (filas[id] = {
          id: id, nombre: nombreDe(alumno, id), dictadas: 0, minutos: 0, monto: 0,
          movidas: 0, canceladas: 0, tarifa: tarifa, sinTarifa: tarifa === null
        });
        if (e === 'dictada') {
          fila.dictadas++;
          fila.minutos += dur;
          if (tarifa !== null) fila.monto += dur * tarifa / 60;
        }
        if (e === 'cancelada') fila.canceladas++;
        if (movida) fila.movidas++;
      });
    });

    const porAlumno = Object.keys(filas).map(function (id) {
      const f = filas[id];
      f.monto = redondear(f.monto);
      f.horas = redondear(f.minutos / 60);
      return f;
    }).sort(function (a, b) {
      return b.minutos - a.minutos || a.nombre.localeCompare(b.nombre);
    });
    totales.monto = redondear(porAlumno.reduce(function (s, f) { return s + f.monto; }, 0));
    totales.horas = redondear(totales.minutos / 60);

    // Orden fijo de las áreas (el color sigue al área, no a su puesto).
    const orden = (o.areas || []).concat(Object.keys(minutosPorArea).filter(function (a) {
      return (o.areas || []).indexOf(a) === -1;
    }));
    const porArea = orden
      .filter(function (a) { return minutosPorArea[a]; })
      .map(function (a) { return { area: a, minutos: minutosPorArea[a], horas: redondear(minutosPorArea[a] / 60) }; });

    return { porAlumno: porAlumno, totales: totales, porArea: porArea };
  }

  const CLAVES_TOTALES = ['dictadas', 'horas', 'monto', 'movidas', 'canceladas'];

  /** Cada total del periodo junto al del periodo anterior y la diferencia. */
  function comparar(actual, anterior) {
    return CLAVES_TOTALES.map(function (clave) {
      return {
        clave: clave,
        actual: actual[clave],
        anterior: anterior[clave],
        diferencia: redondear(actual[clave] - anterior[clave])
      };
    });
  }

  // "3,5 h" y "Bs 1.240,50": formato boliviano, sin decimales de más.
  const numero = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });

  function textoHoras(horas) {
    return numero.format(horas) + ' h';
  }

  function textoMonto(monto) {
    return 'Bs ' + numero.format(monto);
  }

  /** "+1", "−0,5", "0": la diferencia con signo, para la comparación. */
  function textoDiferencia(diferencia, formato) {
    if (!diferencia) return '0';
    const texto = (formato || numero.format)(Math.abs(diferencia));
    return (diferencia > 0 ? '+' : '−') + texto;
  }

  return {
    textoHoras: textoHoras,
    textoMonto: textoMonto,
    textoDiferencia: textoDiferencia,
    calcular: calcular,
    comparar: comparar,
    periodoAnterior: periodoAnterior,
    diasEntre: diasEntre,
    rangoValido: rangoValido,
    tarifaDe: tarifaDe,
    duracion: duracion
  };
})();
