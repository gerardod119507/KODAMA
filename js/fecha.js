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

  return { hoy: hoy, legible: legible };
})();
