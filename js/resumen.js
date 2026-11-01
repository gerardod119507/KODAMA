/**
 * El resumen del día, en palabras (lógica pura, con pruebas). Lo lee en voz
 * alta js/ui/resumen.js. Sin IA: reglas fijas sobre los bloques que ya
 * tiene la app, para que sea gratis y funcione sin conexión.
 *
 * Escrito para ESCUCHARSE: los números van en palabras ("a la una de la
 * tarde", "una clase", "media hora"), nunca en cifras, porque la voz del
 * celular lee "1 cosa" como "uno cosa". Y en frases, no en lista:
 * "Empiezas a las ocho con Cálculo. Después, a las tres de la tarde…".
 *
 * - hoy(bloques, fecha, horaActual, nombre): lo que queda del día.
 * - proximosDias(porDia, nombre): una frase por día.
 *
 * `nombre(bloque)` da el nombre que se ve (con los alumnos); por defecto,
 * el título. Las clases canceladas no cuentan.
 */
const KodamaResumen = (function () {
  const HUECO_MINIMO = 120; // minutos: un hueco más corto no se menciona
  const PRONTO = 60; // "lo próximo empieza en…" solo si falta menos de esto

  const UNIDADES = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
    'diecinueve', 'veinte', 'veintiuna', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
    'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  const DECENAS = { 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta' };

  /** 0–59 en palabras, en femenino ("una", "veintiuna", "treinta y una"). */
  function palabras(n) {
    if (n < 30) return UNIDADES[n];
    const d = DECENAS[Math.floor(n / 10)];
    const u = n % 10;
    return u ? d + ' y ' + UNIDADES[u] : d;
  }

  function minutos(hora) {
    const [h, m] = String(hora || '0:0').split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function momento(h) {
    if (h < 12) return 'de la mañana';
    if (h === 12) return 'del mediodía';
    if (h < 20) return 'de la tarde';
    return 'de la noche';
  }

  /**
   * Como se dice una hora: "a las ocho de la mañana", "a la una y media de
   * la tarde", "a las cuatro menos cuarto". `conMomento` = false omite "de
   * la tarde" (cuando ya quedó claro en la frase anterior).
   */
  function hora(texto, conMomento) {
    const total = minutos(texto);
    let h = Math.floor(total / 60);
    let m = total % 60;
    let resto = '';
    if (m === 15) resto = ' y cuarto';
    else if (m === 30) resto = ' y media';
    else if (m === 45) { h += 1; resto = ' menos cuarto'; }
    else if (m) resto = ' y ' + palabras(m);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const base = (h12 === 1 ? 'la una' : 'las ' + palabras(h12)) + resto;
    if (h === 0 || h === 24) return 'la medianoche';
    return conMomento === false ? base : base + ' ' + momento(h % 24);
  }

  /** "a las ocho de la mañana" (la hora con su preposición). */
  function aLas(texto) {
    return 'a ' + hora(texto);
  }

  /** "media hora", "una hora", "dos horas y media", "cuarenta minutos". */
  function duracion(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return m === 30 ? 'media hora' : (m === 1 ? 'un minuto' : palabras(m) + ' minutos');
    const horas = h === 1 ? 'una hora' : palabras(h) + ' horas';
    if (!m) return horas;
    if (m === 30) return horas + ' y media';
    return horas + ' y ' + palabras(m) + ' minutos';
  }

  function cuantas(n, singular, plural) {
    return n === 1 ? 'una ' + singular : palabras(n) + ' ' + plural;
  }

  function saludo(horaActual) {
    const h = Math.floor(minutos(horaActual) / 60);
    if (h < 12) return 'Buenos días.';
    if (h < 19) return 'Buenas tardes.';
    return 'Buenas noches.';
  }

  function vigentes(bloques, fecha) {
    return bloques
      .filter(function (b) {
        return b.fecha === fecha && b.archivado !== 'TRUE' &&
          String(b.estado || '').trim() !== 'cancelada';
      })
      .sort(function (a, b) { return minutos(a.inicio) - minutos(b.inicio); });
  }

  function conLugar(b) {
    return b.lugar ? ', en ' + b.lugar : '';
  }

  function textoHora(m) {
    return String(Math.floor(m / 60)) + ':' + String(m % 60).padStart(2, '0');
  }

  /** Lo que queda de hoy, desde horaActual ("HH:mm"). */
  function hoy(bloques, fecha, horaActual, nombre) {
    const titulo = nombre || function (b) { return b.titulo || b.area || 'algo'; };
    const ahora = minutos(horaActual);
    const delDia = vigentes(bloques, fecha);
    const quedan = delDia.filter(function (b) { return minutos(b.fin) > ahora; });
    const frases = [saludo(horaActual)];

    if (!delDia.length) {
      frases.push('Hoy no tienes nada agendado. Día libre.');
      return frases.join(' ');
    }
    if (!quedan.length) {
      frases.push('Por hoy ya terminaste todo. Descansa.');
      return frases.join(' ');
    }

    const enCurso = quedan.filter(function (b) { return minutos(b.inicio) <= ahora; });
    const siguientes = quedan.filter(function (b) { return minutos(b.inicio) > ahora; });

    if (enCurso.length) {
      frases.push('Ahora estás en ' + titulo(enCurso[0]) + ', hasta ' + hora(enCurso[0].fin, false) + '.');
    }

    if (siguientes.length) {
      const primero = siguientes[0];
      const falta = minutos(primero.inicio) - ahora;
      if (!enCurso.length) {
        frases.push(siguientes.length === 1
          ? 'Hoy te queda una sola cosa.'
          : 'Hoy te quedan ' + cuantas(siguientes.length, 'cosa', 'cosas') + '.');
      }
      const inicio = enCurso.length ? 'Después, ' : (siguientes.length === 1 ? 'Es ' : 'Empiezas ');
      if (enCurso.length) {
        frases.push(inicio + aLas(primero.inicio) + ', tienes ' + titulo(primero) + conLugar(primero) + '.');
      } else if (siguientes.length === 1) {
        frases.push('Es ' + titulo(primero) + ', ' + aLas(primero.inicio) + conLugar(primero) + '.');
      } else {
        frases.push('Empiezas ' + aLas(primero.inicio) + ' con ' + titulo(primero) + conLugar(primero) + '.');
      }
      const medio = siguientes.slice(1, -1);
      medio.forEach(function (b, i) {
        frases.push((i === 0 ? 'Después, ' : 'Luego, ') + aLas(b.inicio) + ', ' + titulo(b) + conLugar(b) + '.');
      });
      if (siguientes.length > 1) {
        const ultimo = siguientes[siguientes.length - 1];
        frases.push('Y cierras el día ' + aLas(ultimo.inicio) + ' con ' + titulo(ultimo) + conLugar(ultimo) + '.');
      }
      if (!enCurso.length && falta <= PRONTO) {
        frases.push('Lo primero empieza en ' + duracion(falta) + '.');
      }
    } else {
      frases.push('Es lo último del día.');
    }

    // El hueco libre más largo entre lo que queda (desde ahora).
    let mejor = null;
    let libreDesde = ahora;
    quedan.forEach(function (b) {
      const ini = minutos(b.inicio);
      if (ini - libreDesde >= HUECO_MINIMO && (!mejor || ini - libreDesde > mejor.largo)) {
        mejor = { desde: libreDesde, hasta: ini, largo: ini - libreDesde };
      }
      libreDesde = Math.max(libreDesde, minutos(b.fin));
    });
    if (mejor && mejor.desde > ahora) {
      frases.push('Entre ' + hora(textoHora(mejor.desde), false) + ' y ' + hora(textoHora(mejor.hasta), false) +
        ' tienes ' + duracion(mejor.largo) + ' libres.');
    }
    return frases.join(' ');
  }

  /**
   * porDia: [{ fecha, etiqueta ("Mañana", "El lunes"), bloques }]. Una
   * frase por día.
   */
  function proximosDias(porDia, nombre) {
    const titulo = nombre || function (b) { return b.titulo || b.area || 'algo'; };
    return porDia.map(function (dia) {
      const lista = vigentes(dia.bloques || [], dia.fecha);
      if (!lista.length) return dia.etiqueta + ' lo tienes libre.';
      const primero = lista[0];
      if (lista.length === 1) {
        return dia.etiqueta + ' solo tienes ' + titulo(primero) + ', ' + aLas(primero.inicio) + '.';
      }
      return dia.etiqueta + ' tienes ' + cuantas(lista.length, 'cosa', 'cosas') + '; empiezas ' +
        aLas(primero.inicio) + ' con ' + titulo(primero) + '.';
    }).join(' ');
  }

  return { hoy: hoy, proximosDias: proximosDias, hora: hora, duracion: duracion };
})();
