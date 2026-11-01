/**
 * El resumen del día, en palabras (lógica pura, con pruebas). Lo lee en voz
 * alta js/ui/resumen.js. Sin IA: reglas fijas sobre los bloques que ya
 * tiene la app, para que sea gratis y funcione sin conexión.
 *
 * - hoy(bloques, fecha, horaActual, nombre): lo que queda del día — cuántas
 *   cosas, cada una con su hora, el hueco libre más largo y cuánto falta
 *   para lo próximo si es pronto.
 * - proximosDias(porDia, nombre): una frase por día ("Mañana tienes 3
 *   cosas; la primera a las 7, Cálculo").
 *
 * `nombre(bloque)` da el nombre que se ve (con los alumnos); por defecto,
 * el título. Las clases canceladas no cuentan.
 */
const KodamaResumen = (function () {
  const HUECO_MINIMO = 120; // minutos: un hueco más corto no se menciona
  const PRONTO = 60; // "lo próximo empieza en 25 minutos" solo si falta menos de esto

  function minutos(hora) {
    const [h, m] = String(hora || '0:0').split(':').map(Number);
    return h * 60 + (m || 0);
  }

  /** "las 8", "las 8:30", "la 1", "la 1:15" — como se dice. */
  function hora(texto) {
    const total = minutos(texto);
    const h = Math.floor(total / 60);
    const m = total % 60;
    const numero = m ? h + ':' + String(m).padStart(2, '0') : String(h);
    return (h === 1 ? 'la ' : 'las ') + numero;
  }

  function cosas(n) {
    return n === 1 ? '1 cosa' : n + ' cosas';
  }

  function enLista(partes) {
    if (partes.length <= 1) return partes.join('');
    return partes.slice(0, -1).join('; ') + '; y ' + partes[partes.length - 1];
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

  function duracion(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!m) return h === 1 ? '1 hora' : h + ' horas';
    return h + ' horas y ' + m + ' minutos';
  }

  /** Lo que queda de hoy, desde horaActual ("HH:mm"). */
  function hoy(bloques, fecha, horaActual, nombre) {
    const titulo = nombre || function (b) { return b.titulo || b.area || 'algo'; };
    const ahora = minutos(horaActual);
    const delDia = vigentes(bloques, fecha);
    const quedan = delDia.filter(function (b) { return minutos(b.fin) > ahora; });
    const frases = [saludo(horaActual)];

    if (!delDia.length) {
      frases.push('Hoy tienes el día libre.');
      return frases.join(' ');
    }
    if (!quedan.length) {
      frases.push('Por hoy ya terminaste todo lo que tenías. Descansa.');
      return frases.join(' ');
    }

    const enCurso = quedan.filter(function (b) { return minutos(b.inicio) <= ahora; });
    const siguientes = quedan.filter(function (b) { return minutos(b.inicio) > ahora; });

    if (enCurso.length) {
      frases.push('Ahora mismo estás en ' + titulo(enCurso[0]) + ', hasta ' + hora(enCurso[0].fin) + '.');
    }
    if (siguientes.length) {
      const verbo = siguientes.length === 1 ? 'queda ' : 'quedan ';
      const inicio = (enCurso.length ? 'Después te ' : 'Hoy te ') + verbo;
      const lista = siguientes.map(function (b) {
        return 'a ' + hora(b.inicio) + ', ' + titulo(b) + (b.lugar ? ' en ' + b.lugar : '');
      });
      frases.push(inicio + cosas(siguientes.length) + ': ' + enLista(lista) + '.');
      const falta = minutos(siguientes[0].inicio) - ahora;
      if (!enCurso.length && falta <= PRONTO) {
        frases.push('Lo próximo empieza en ' + (falta === 1 ? '1 minuto' : falta + ' minutos') + '.');
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
      const texto = function (m) { return String(Math.floor(m / 60)) + ':' + String(m % 60).padStart(2, '0'); };
      frases.push('Tienes ' + duracion(mejor.largo) + ' libres entre ' + hora(texto(mejor.desde)) +
        ' y ' + hora(texto(mejor.hasta)) + '.');
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
      if (!lista.length) return dia.etiqueta + ' no tienes nada.';
      const primero = lista[0];
      return dia.etiqueta + ' tienes ' + cosas(lista.length) + '; ' +
        (lista.length === 1 ? 'a ' : 'la primera a ') + hora(primero.inicio) + ', ' + titulo(primero) + '.';
    }).join(' ');
  }

  return { hoy: hoy, proximosDias: proximosDias, hora: hora };
})();
