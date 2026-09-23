/**
 * KODAMA siempre razona en America/La_Paz, sin importar la zona horaria del
 * dispositivo (Gerardo puede estar viajando). 'en-CA' da como resultado
 * directamente el formato ISO YYYY-MM-DD, sin tener que armar el string a
 * mano con getMonth()/getDate().
 */
const ZONA_HORARIA = 'America/La_Paz';

const KodamaFecha = (function () {
  const formateadorFecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA });
  const formateadorLegible = new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA_HORARIA,
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  function hoy() {
    return formateadorFecha.format(new Date());
  }

  function legible(fechaIso) {
    const [anio, mes, dia] = fechaIso.split('-').map(Number);
    // Mediodía UTC evita que, en fechas límite, la conversión de zona
    // horaria empuje la fecha al día anterior o siguiente.
    const fecha = new Date(Date.UTC(anio, mes - 1, dia, 12));
    return formateadorLegible.format(fecha);
  }

  const formateadorHora = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  /** Hora actual en La Paz, redondeada hacia arriba a la media hora. */
  function proximaMediaHora() {
    const [horas, minutos] = formateadorHora.format(new Date()).split(':').map(Number);
    const totalMinutos = horas * 60 + minutos;
    const redondeado = Math.ceil(totalMinutos / 30) * 30;
    return minutosATexto(Math.min(redondeado, 23 * 60 + 30));
  }

  function sumarMinutos(hora, minutos) {
    const [h, m] = hora.split(':').map(Number);
    return minutosATexto(Math.min(h * 60 + m + minutos, 23 * 60 + 59));
  }

  function minutosATexto(total) {
    const h = String(Math.floor(total / 60)).padStart(2, '0');
    const m = String(total % 60).padStart(2, '0');
    return h + ':' + m;
  }

  // --- Aritmética de calendario (vista de semana) -------------------
  // Todo en UTC puro: una fecha YYYY-MM-DD es un día de calendario, no un
  // instante, así que no debe pasar por la zona horaria del dispositivo.

  function aUTC(fechaIso) {
    const [anio, mes, dia] = fechaIso.split('-').map(Number);
    return new Date(Date.UTC(anio, mes - 1, dia));
  }

  function desdeUTC(fecha) {
    return fecha.toISOString().slice(0, 10);
  }

  function sumarDias(fechaIso, dias) {
    const fecha = aUTC(fechaIso);
    fecha.setUTCDate(fecha.getUTCDate() + dias);
    return desdeUTC(fecha);
  }

  /** Lunes de la semana de esa fecha (la semana va de lunes a domingo). */
  function inicioDeSemana(fechaIso) {
    const diaSemana = aUTC(fechaIso).getUTCDay(); // 0 = domingo
    return sumarDias(fechaIso, -((diaSemana + 6) % 7));
  }

  /** Las 7 fechas (lunes a domingo) de la semana de esa fecha. */
  function diasDeSemana(fechaIso) {
    const lunes = inicioDeSemana(fechaIso);
    const dias = [];
    for (let i = 0; i < 7; i++) {
      dias.push(sumarDias(lunes, i));
    }
    return dias;
  }

  const NOMBRES_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const NOMBRES_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /** "lun 22" — encabezado de columna en la vista de semana. */
  function diaCorto(fechaIso) {
    const fecha = aUTC(fechaIso);
    return NOMBRES_DIA[fecha.getUTCDay()] + ' ' + fecha.getUTCDate();
  }

  /** "22 – 28 sep" o "29 sep – 5 oct" (y el año si cambia). */
  function rangoLegible(desde, hasta) {
    const a = aUTC(desde);
    const b = aUTC(hasta);
    const mesA = NOMBRES_MES[a.getUTCMonth()];
    const mesB = NOMBRES_MES[b.getUTCMonth()];
    if (a.getUTCFullYear() !== b.getUTCFullYear()) {
      return a.getUTCDate() + ' ' + mesA + ' ' + a.getUTCFullYear() + ' – ' +
        b.getUTCDate() + ' ' + mesB + ' ' + b.getUTCFullYear();
    }
    if (mesA === mesB) {
      return a.getUTCDate() + ' – ' + b.getUTCDate() + ' ' + mesB;
    }
    return a.getUTCDate() + ' ' + mesA + ' – ' + b.getUTCDate() + ' ' + mesB;
  }

  return {
    hoy: hoy,
    legible: legible,
    proximaMediaHora: proximaMediaHora,
    sumarMinutos: sumarMinutos,
    sumarDias: sumarDias,
    inicioDeSemana: inicioDeSemana,
    diasDeSemana: diasDeSemana,
    diaCorto: diaCorto,
    rangoLegible: rangoLegible
  };
})();
