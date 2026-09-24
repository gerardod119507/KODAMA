/**
 * Vista de semana: días en columnas, horas en filas. Cada bloque se ubica
 * según su hora de inicio y su duración.
 *
 * Igual que en la vista de día: título, horario y área vienen de la hoja,
 * así que SIEMPRE se escriben con textContent. Solo el SVG del ícono (una
 * plantilla fija nuestra) usa innerHTML.
 */
const KodamaSemana = (function () {
  // Franja visible por defecto: cubre el horario real (6:45 a 21:00) con
  // un margen arriba. Si algún bloque cae fuera, la franja se estira sola.
  const FRANJA_BASE = { desde: 6 * 60 + 30, hasta: 21 * 60 };
  const DURACION_MINIMA = 15;

  function aMinutos(hora) {
    const partes = /^(\d{1,2}):(\d{2})$/.exec(String(hora || '').trim());
    if (!partes) return null;
    return Number(partes[1]) * 60 + Number(partes[2]);
  }

  /** Inicio y fin en minutos; un bloque sin fin válido dura lo mínimo. */
  function tramo(bloque) {
    const inicio = aMinutos(bloque.inicio);
    if (inicio === null) return null;
    let fin = aMinutos(bloque.fin);
    if (fin === null || fin <= inicio) {
      fin = inicio + DURACION_MINIMA;
    }
    return { inicio: inicio, fin: fin };
  }

  /**
   * Franja horaria a dibujar: la base, estirada a la media hora si algún
   * bloque empieza antes o termina después.
   */
  function calcularFranja(bloques) {
    let desde = FRANJA_BASE.desde;
    let hasta = FRANJA_BASE.hasta;
    bloques.forEach(function (bloque) {
      const t = tramo(bloque);
      if (!t) return;
      desde = Math.min(desde, Math.floor(t.inicio / 30) * 30);
      hasta = Math.max(hasta, Math.ceil(t.fin / 30) * 30);
    });
    return { desde: Math.max(0, desde), hasta: Math.min(24 * 60, hasta) };
  }

  /**
   * Bloques de UN día → posición de cada uno. Los que se pisan (por cadena,
   * igual que en la vista de día) se reparten el ancho lado a lado: cada
   * bloque toma la primera columna libre, y todos los de la cadena usan el
   * mismo total de columnas. Sin avisos de choque.
   */
  function distribuir(bloques) {
    const conTramo = bloques
      .map(function (bloque) { return { bloque: bloque, t: tramo(bloque) }; })
      .filter(function (item) { return item.t; })
      .sort(function (a, b) { return a.t.inicio - b.t.inicio || a.t.fin - b.t.fin; });

    const resultado = [];
    let cadena = [];
    let finCadena = -1;
    let finDeColumna = [];

    function cerrarCadena() {
      const total = finDeColumna.length;
      cadena.forEach(function (item) { item.columnas = total; resultado.push(item); });
      cadena = [];
      finDeColumna = [];
    }

    conTramo.forEach(function (item) {
      if (cadena.length && item.t.inicio >= finCadena) {
        cerrarCadena();
      }
      let columna = finDeColumna.findIndex(function (fin) { return fin <= item.t.inicio; });
      if (columna === -1) {
        columna = finDeColumna.length;
        finDeColumna.push(item.t.fin);
      } else {
        finDeColumna[columna] = item.t.fin;
      }
      cadena.push({
        bloque: item.bloque,
        inicio: item.t.inicio,
        fin: item.t.fin,
        columna: columna
      });
      finCadena = cadena.length === 1 ? item.t.fin : Math.max(finCadena, item.t.fin);
    });
    if (cadena.length) cerrarCadena();

    return resultado;
  }

  function horaTexto(minutos) {
    return String(Math.floor(minutos / 60)).padStart(2, '0') + ':' + String(minutos % 60).padStart(2, '0');
  }

  // --- Huecos colapsables (solo celular) ------------------------------

  // Un hueco se colapsa si está libre en TODOS los días visibles y dura
  // MÁS de 2 horas. Colapsado ocupa lo que ocuparían estos minutos.
  const HUECO_MINIMO = 120;
  const ALTO_HUECO = 50;
  // Se colapsa el hueco menos 30 min a cada lado: así un bloque corto
  // pegado a un hueco (una llamada de 15 min) nunca queda tapado por la
  // línea, y las horas de los bordes se leen.
  const MARGEN_HUECO = 30;

  /** La parte de un hueco que efectivamente se colapsa. */
  function tramoColapsado(hueco) {
    return { desde: hueco.desde + MARGEN_HUECO, hasta: hueco.hasta - MARGEN_HUECO, libre: hueco };
  }

  /**
   * Tramos de la franja sin ningún bloque en ninguno de los días visibles
   * (de cualquier área: las casillas "ocupado" también se dibujan) que
   * duran más de HUECO_MINIMO. Devuelve [{ desde, hasta }] en minutos.
   */
  function calcularHuecos(bloques, franja) {
    const tramos = bloques
      .map(tramo)
      .filter(Boolean)
      .sort(function (a, b) { return a.inicio - b.inicio; });

    const huecos = [];
    let cursor = franja.desde;
    tramos.forEach(function (t) {
      if (t.inicio > cursor) huecos.push({ desde: cursor, hasta: t.inicio });
      cursor = Math.max(cursor, t.fin);
    });
    if (franja.hasta > cursor) huecos.push({ desde: cursor, hasta: franja.hasta });

    return huecos.filter(function (h) { return h.hasta - h.desde > HUECO_MINIMO; });
  }

  /**
   * Pasa de minutos del día a "minutos de pantalla" (lo que después CSS
   * multiplica por --escala-semana). Fuera de los huecos colapsados cada
   * minuto mide lo mismo, así un bloque de 1 h mide la mitad que uno de
   * 2 h; cada hueco colapsado mide ALTO_HUECO, sin importar cuánto dure.
   */
  function crearEscala(franja, colapsados) {
    function y(minuto) {
      let posicion = minuto - franja.desde;
      colapsados.forEach(function (h) {
        const largo = h.hasta - h.desde;
        if (minuto >= h.hasta) {
          posicion -= largo - ALTO_HUECO;
        } else if (minuto > h.desde) {
          const recorrido = minuto - h.desde;
          posicion -= recorrido - ALTO_HUECO * recorrido / largo;
        }
      });
      return posicion;
    }
    return { y: y, total: y(franja.hasta) };
  }

  function textoDuracion(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return (h ? h + ' h' : '') + (h && m ? ' ' : '') + (m ? m + ' min' : '');
  }

  // Huecos que se tocaron para expandir: siguen expandidos mientras la app
  // esté abierta (la clave es el horario, así sirve para cualquier semana).
  const huecosExpandidos = {};

  // --- Dibujo -----------------------------------------------------------

  function ubicar(elemento, posicion, escala) {
    const arriba = escala.y(posicion.inicio);
    elemento.style.setProperty('--min-inicio', String(arriba));
    elemento.style.setProperty('--min-duracion', String(escala.y(posicion.fin) - arriba));
    elemento.style.setProperty('--columna', String(posicion.columna));
    elemento.style.setProperty('--columnas', String(posicion.columnas));
  }

  /** Con alumnos vinculados, el nombre sale de ellos (lo arma app.js). */
  function nombreVisible(bloque) {
    return bloque.tituloMostrado || bloque.titulo || '(sin título)';
  }

  function crearBloque(posicion, escala, indice, alTocar, solapado, conDetalle) {
    const bloque = posicion.bloque;
    const tipo = KodamaDia.normalizarTipo(bloque.tipo);

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'bloque-semana bloque--' + tipo;
    if (posicion.fin - posicion.inicio < 45) {
      boton.classList.add('bloque-semana--corto');
    }
    if (solapado) {
      boton.classList.add('bloque--solapado');
    }
    // Estado de la clase (Checkpoint 8): dictada lleva ✓; cancelada se ve
    // tenue y tachada. Nunca solo por color.
    const estado = String(bloque.estado || '').trim() || 'programada';
    if (estado === 'dictada' || estado === 'cancelada') {
      boton.classList.add('bloque--' + estado);
    }
    boton.style.setProperty('--color-bloque', KodamaDia.colorDeBloque(bloque));
    boton.style.setProperty('--indice', String(indice));
    ubicar(boton, posicion, escala);
    // Texto completo al pasar el mouse (los bloques cortos lo recortan).
    boton.title = nombreVisible(bloque) + ' · ' + bloque.inicio + '–' + bloque.fin +
      (bloque.lugar ? ' · ' + bloque.lugar : '') + ' · ' + bloque.area +
      (estado === 'dictada' || estado === 'cancelada' ? ' · ' + estado : '');
    if (alTocar) {
      boton.addEventListener('click', function () { alTocar(bloque); });
    }

    const cabeza = document.createElement('span');
    cabeza.className = 'bloque-semana__cabeza';

    const icono = document.createElement('span');
    icono.className = 'bloque__icono';
    icono.innerHTML = KodamaIconos.svgTipo(tipo);
    cabeza.appendChild(icono);

    const titulo = document.createElement('span');
    titulo.className = 'bloque-semana__titulo';
    titulo.textContent = nombreVisible(bloque);
    if (estado === 'dictada') {
      const marca = document.createElement('span');
      marca.className = 'bloque-semana__marca';
      marca.textContent = '✓';
      marca.setAttribute('aria-label', 'dictada');
      cabeza.appendChild(marca);
    }
    cabeza.appendChild(titulo);
    boton.appendChild(cabeza);

    const hora = document.createElement('span');
    hora.className = 'bloque-semana__hora';
    // Junto al horario, el lugar (si hay; si no, nada, ni un separador de
    // más). En la vista de día (una columna ancha) van también el área y la
    // etiqueta.
    hora.textContent = bloque.inicio + '–' + bloque.fin;
    if (bloque.lugar) {
      const lugar = document.createElement('span');
      lugar.className = 'bloque-semana__lugar';
      lugar.textContent = ' · ' + bloque.lugar;
      hora.appendChild(lugar);
    }
    if (conDetalle) {
      hora.appendChild(document.createTextNode(' · ' + bloque.area + (bloque.etiqueta ? ' · ' + bloque.etiqueta : '')));
    }
    boton.appendChild(hora);

    return boton;
  }

  /**
   * Bloque de otra área en una capa filtrada: misma caja, dice "ocupado" y
   * su horario — se ve CUÁNDO está ocupado, nunca QUÉ es (sin título, área
   * ni etiqueta).
   */
  function crearOcupado(posicion, escala) {
    const caja = document.createElement('div');
    caja.className = 'ocupado ocupado--semana';
    ubicar(caja, posicion, escala);
    const texto = document.createElement('span');
    texto.className = 'ocupado__texto';
    texto.textContent = 'ocupado';
    const hora = document.createElement('span');
    hora.className = 'ocupado__hora';
    hora.textContent = posicion.bloque.inicio + '–' + posicion.bloque.fin;
    caja.append(texto, hora);
    return caja;
  }

  function crearHueco(colapsado, escala, alExpandir) {
    const hueco = colapsado.libre; // el texto habla del tiempo libre completo
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'semana__hueco';
    boton.style.setProperty('--min-inicio', String(escala.y(colapsado.desde)));
    boton.style.setProperty('--min-duracion', String(ALTO_HUECO));
    boton.setAttribute('aria-expanded', 'false');
    const duracion = textoDuracion(hueco.hasta - hueco.desde);
    boton.setAttribute('aria-label', duracion + ' libres, de ' + horaTexto(hueco.desde) +
      ' a ' + horaTexto(hueco.hasta) + '. Tocar para expandir');

    const principal = document.createElement('span');
    principal.className = 'semana__hueco-texto';
    principal.textContent = duracion + ' libres';
    const rango = document.createElement('span');
    rango.className = 'semana__hueco-rango';
    rango.textContent = horaTexto(hueco.desde) + '–' + horaTexto(hueco.hasta);
    boton.append(principal, rango);

    boton.addEventListener('click', alExpandir);
    return boton;
  }

  /**
   * opciones:
   *   dias            fechas visibles (el rango elegido, por defecto lun–dom)
   *   hoy
   *   bloques         TODOS los bloques de esos días (todas las áreas)
   *   esDeLaCapa(b)   true si el bloque es de la capa que se ve; los demás
   *                   se dibujan como "ocupado" en la misma posición
   *   alTocar(b)
   *   colapsarHuecos  true en el celular
   *   unDia           true para la vista de día (una sola columna ancha,
   *                   sin encabezado de día y con más detalle por bloque)
   */
  function render(contenedor, opciones) {
    const esDeLaCapa = opciones.esDeLaCapa || function () { return true; };
    const franja = calcularFranja(opciones.bloques);
    const porDia = {};
    opciones.dias.forEach(function (fecha) { porDia[fecha] = []; });
    opciones.bloques.forEach(function (bloque) {
      if (porDia[bloque.fecha]) porDia[bloque.fecha].push(bloque);
    });
    const solapados = {};
    KodamaDia.idsSolapados(opciones.bloques.filter(esDeLaCapa)).forEach(function (id) { solapados[id] = true; });

    const colapsados = opciones.colapsarHuecos
      ? calcularHuecos(opciones.bloques, franja)
        .filter(function (h) { return !huecosExpandidos[h.desde + '-' + h.hasta]; })
        .map(tramoColapsado)
      : [];
    const escala = crearEscala(franja, colapsados);

    contenedor.replaceChildren();

    if (opciones.bloques.length === 0) {
      const vacio = document.createElement('p');
      vacio.className = 'estado';
      vacio.textContent = 'Días libres. No hay bloques en estas fechas.';
      contenedor.appendChild(vacio);
    }

    const desplazable = document.createElement('div');
    desplazable.className = 'semana-desplazable';

    const grilla = document.createElement('div');
    grilla.className = opciones.unDia ? 'semana semana--un-dia' : 'semana';
    grilla.style.setProperty('--dias', String(opciones.dias.length));
    grilla.style.setProperty('--minutos-franja', String(escala.total));

    // Fila de encabezados: esquina vacía + un encabezado por día.
    const esquina = document.createElement('div');
    esquina.className = 'semana__esquina';
    grilla.appendChild(esquina);
    opciones.dias.forEach(function (fecha) {
      const encabezado = document.createElement('div');
      encabezado.className = 'semana__dia';
      // "lun" y "22" por separado: en el celular van en dos líneas.
      const partes = KodamaFecha.diaCorto(fecha).split(' ');
      const nombre = document.createElement('span');
      nombre.className = 'semana__dia-nombre';
      nombre.textContent = partes[0];
      const numero = document.createElement('span');
      numero.className = 'semana__dia-numero';
      numero.textContent = partes[1];
      encabezado.append(nombre, ' ', numero);
      if (fecha === opciones.hoy) {
        encabezado.classList.add('semana__dia--hoy');
        encabezado.setAttribute('aria-current', 'date');
      }
      grilla.appendChild(encabezado);
    });

    // Sin etiqueta de hora dentro de un hueco colapsado ni pegada a sus
    // bordes (quedaría cortada por la línea del hueco).
    const dentroDeUnHueco = function (m) {
      return colapsados.some(function (h) { return m >= h.desde - 15 && m <= h.hasta + 15; });
    };

    // Columna de horas: una etiqueta en cada hora en punto visible.
    const horas = document.createElement('div');
    horas.className = 'semana__horas';
    // Líneas de hora, detrás de las columnas de los días.
    const lineas = document.createElement('div');
    lineas.className = 'semana__lineas';
    lineas.setAttribute('aria-hidden', 'true');
    for (let m = Math.ceil(franja.desde / 60) * 60; m < franja.hasta; m += 60) {
      if (dentroDeUnHueco(m)) continue;
      const etiqueta = document.createElement('span');
      etiqueta.className = 'semana__hora';
      etiqueta.style.setProperty('--min-inicio', String(escala.y(m)));
      // "07" + ":00": en el celular se oculta ":00" para ganar ancho.
      const texto = horaTexto(m).split(':');
      const hora = document.createElement('span');
      hora.textContent = texto[0];
      const minutos = document.createElement('span');
      minutos.className = 'semana__hora-min';
      minutos.textContent = ':' + texto[1];
      etiqueta.append(hora, minutos);
      horas.appendChild(etiqueta);

      const linea = document.createElement('div');
      linea.className = 'semana__linea';
      linea.style.setProperty('--min-inicio', String(escala.y(m)));
      lineas.appendChild(linea);
    }
    // Ubicación explícita en la fila 2: varias capas comparten celdas.
    horas.style.gridArea = '2 / 1';
    lineas.style.gridArea = '2 / 2 / 3 / -1';
    grilla.appendChild(horas);
    grilla.appendChild(lineas);

    let indice = 0;
    opciones.dias.forEach(function (fecha, i) {
      const columna = document.createElement('div');
      columna.className = 'semana__columna';
      columna.style.gridArea = '2 / ' + (i + 2);
      if (fecha === opciones.hoy) columna.classList.add('semana__columna--hoy');
      // Se reparte el ancho con TODOS los bloques del día, así cada casilla
      // "ocupado" queda justo donde está el bloque real en General.
      distribuir(porDia[fecha]).forEach(function (posicion) {
        if (esDeLaCapa(posicion.bloque)) {
          columna.appendChild(crearBloque(posicion, escala, indice++, opciones.alTocar,
            solapados[posicion.bloque.id], opciones.unDia));
        } else if (String(posicion.bloque.estado || '').trim() !== 'cancelada') {
          // De otra área: "ocupado". Si se canceló, ese horario quedó libre.
          columna.appendChild(crearOcupado(posicion, escala));
        }
      });
      grilla.appendChild(columna);
    });

    // Huecos colapsados: una línea a todo el ancho, encima de la grilla.
    if (colapsados.length) {
      const capaHuecos = document.createElement('div');
      capaHuecos.className = 'semana__capa-huecos';
      capaHuecos.style.gridArea = '2 / 1 / 3 / -1';
      colapsados.forEach(function (colapsado) {
        const hueco = colapsado.libre;
        capaHuecos.appendChild(crearHueco(colapsado, escala, function () {
          huecosExpandidos[hueco.desde + '-' + hueco.hasta] = true;
          render(contenedor, opciones);
        }));
      });
      grilla.appendChild(capaHuecos);
    }

    desplazable.appendChild(grilla);
    contenedor.appendChild(desplazable);

    // En pantallas medianas la semana se desplaza de costado: arrancar
    // mostrando el día de hoy, no siempre el primero.
    const columnaHoy = grilla.querySelector('.semana__columna--hoy');
    if (columnaHoy && desplazable.scrollWidth > desplazable.clientWidth) {
      const distancia = columnaHoy.getBoundingClientRect().left - desplazable.getBoundingClientRect().left;
      desplazable.scrollLeft += distancia - horas.offsetWidth;
    }
  }

  return {
    render: render,
    // Expuestas solo para las pruebas (tests/semana.test.js y
    // tests/huecos.test.js): son la lógica pura que decide dónde y de qué
    // tamaño se dibuja cada cosa.
    calcularFranja: calcularFranja,
    distribuir: distribuir,
    calcularHuecos: calcularHuecos,
    tramoColapsado: tramoColapsado,
    crearEscala: crearEscala,
    HUECO_MINIMO: HUECO_MINIMO,
    ALTO_HUECO: ALTO_HUECO
  };
})();
