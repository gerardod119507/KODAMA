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

  function crearBloque(posicion, franja, indice, alTocar) {
    const bloque = posicion.bloque;
    const tipo = KodamaDia.normalizarTipo(bloque.tipo);

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'bloque-semana bloque--' + tipo;
    if (posicion.fin - posicion.inicio < 45) {
      boton.classList.add('bloque-semana--corto');
    }
    boton.style.setProperty('--color-bloque', KodamaDia.colorDeBloque(bloque));
    boton.style.setProperty('--min-inicio', String(posicion.inicio - franja.desde));
    boton.style.setProperty('--min-duracion', String(posicion.fin - posicion.inicio));
    boton.style.setProperty('--columna', String(posicion.columna));
    boton.style.setProperty('--columnas', String(posicion.columnas));
    boton.style.setProperty('--indice', String(indice));
    // Texto completo al pasar el mouse (los bloques cortos lo recortan).
    boton.title = (bloque.titulo || '(sin título)') + ' · ' + bloque.inicio + '–' + bloque.fin + ' · ' + bloque.area;
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
    titulo.textContent = bloque.titulo || '(sin título)';
    cabeza.appendChild(titulo);
    boton.appendChild(cabeza);

    const hora = document.createElement('span');
    hora.className = 'bloque-semana__hora';
    hora.textContent = bloque.inicio + '–' + bloque.fin;
    boton.appendChild(hora);

    return boton;
  }

  /**
   * opciones: { dias: [7 fechas], hoy, bloques (los de la capa), todos
   * (sin filtrar: la franja horaria no cambia al cambiar de capa),
   * ocupados (franjas de otras áreas), alTocar }
   */
  function render(contenedor, opciones) {
    const franja = calcularFranja(opciones.todos || opciones.bloques);
    const porDia = {};
    const ocupadosPorDia = {};
    opciones.dias.forEach(function (fecha) { porDia[fecha] = []; ocupadosPorDia[fecha] = []; });
    opciones.bloques.forEach(function (bloque) {
      if (porDia[bloque.fecha]) porDia[bloque.fecha].push(bloque);
    });
    (opciones.ocupados || []).forEach(function (ocupado) {
      if (ocupadosPorDia[ocupado.fecha]) ocupadosPorDia[ocupado.fecha].push(ocupado);
    });

    contenedor.replaceChildren();

    if (opciones.bloques.length === 0 && (opciones.ocupados || []).length === 0) {
      const vacio = document.createElement('p');
      vacio.className = 'estado';
      vacio.textContent = 'Semana libre. No hay bloques en estos 7 días.';
      contenedor.appendChild(vacio);
    }

    const desplazable = document.createElement('div');
    desplazable.className = 'semana-desplazable';

    const grilla = document.createElement('div');
    grilla.className = 'semana';
    grilla.style.setProperty('--minutos-franja', String(franja.hasta - franja.desde));
    // Desfase de las líneas de hora cuando la franja no arranca en punto.
    grilla.style.setProperty('--desfase-hora', String((60 - (franja.desde % 60)) % 60));

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

    // Columna de horas: una etiqueta en cada hora en punto de la franja.
    const horas = document.createElement('div');
    horas.className = 'semana__horas';
    for (let m = Math.ceil(franja.desde / 60) * 60; m < franja.hasta; m += 60) {
      const etiqueta = document.createElement('span');
      etiqueta.className = 'semana__hora';
      etiqueta.style.setProperty('--min-inicio', String(m - franja.desde));
      // "07" + ":00": en el celular se oculta ":00" para ganar ancho.
      const texto = horaTexto(m).split(':');
      const hora = document.createElement('span');
      hora.textContent = texto[0];
      const minutos = document.createElement('span');
      minutos.className = 'semana__hora-min';
      minutos.textContent = ':' + texto[1];
      etiqueta.append(hora, minutos);
      horas.appendChild(etiqueta);
    }
    grilla.appendChild(horas);

    let indice = 0;
    opciones.dias.forEach(function (fecha) {
      const columna = document.createElement('div');
      columna.className = 'semana__columna';
      if (fecha === opciones.hoy) columna.classList.add('semana__columna--hoy');
      ocupadosPorDia[fecha].forEach(function (ocupado) {
        const t = tramo(ocupado);
        if (!t) return;
        const banda = document.createElement('div');
        banda.className = 'semana__ocupado';
        banda.setAttribute('aria-hidden', 'true');
        banda.style.setProperty('--min-inicio', String(t.inicio - franja.desde));
        banda.style.setProperty('--min-duracion', String(t.fin - t.inicio));
        columna.appendChild(banda);
      });
      distribuir(porDia[fecha]).forEach(function (posicion) {
        columna.appendChild(crearBloque(posicion, franja, indice++, opciones.alTocar));
      });
      grilla.appendChild(columna);
    });

    desplazable.appendChild(grilla);
    contenedor.appendChild(desplazable);

    // En pantallas angostas la semana se desplaza de costado: arrancar
    // mostrando el día de hoy, no siempre el lunes.
    const columnaHoy = grilla.querySelector('.semana__columna--hoy');
    if (columnaHoy && desplazable.scrollWidth > desplazable.clientWidth) {
      const distancia = columnaHoy.getBoundingClientRect().left - desplazable.getBoundingClientRect().left;
      desplazable.scrollLeft += distancia - horas.offsetWidth;
    }
  }

  return {
    render: render,
    // Expuestas solo para las pruebas (tests/semana.test.js): son la lógica
    // pura que decide dónde y de qué ancho se dibuja cada bloque.
    calcularFranja: calcularFranja,
    distribuir: distribuir
  };
})();
