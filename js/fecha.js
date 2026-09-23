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

  return {
    hoy: hoy,
    legible: legible,
    proximaMediaHora: proximaMediaHora,
    sumarMinutos: sumarMinutos
  };
})();
