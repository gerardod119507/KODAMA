/**
 * Gráfica de barras horizontales en SVG propio (sin librerías), para
 * Estadísticas: "horas por alumno" y "horas por área".
 *
 * - Una barra por fila, delgada (14px), que crece desde una línea base, con
 *   la punta redondeada y la base recta; el valor va escrito en la punta.
 * - El nombre va escrito al lado de cada barra: el color nunca es la única
 *   forma de saber qué es (las áreas usan su color, los alumnos uno solo).
 * - Al pasar el dedo o el mouse, <title> muestra el nombre completo y el
 *   valor. Los mismos números están en la tabla de arriba.
 *
 * Todo el texto se escribe con textContent (los nombres vienen del Sheet).
 */
const KodamaGraficas = (function () {
  const SVG = 'http://www.w3.org/2000/svg';
  const ANCHO = 360;
  const ANCHO_ETIQUETA = 120;
  const ANCHO_VALOR = 48;
  const ALTO_FILA = 30;
  const GROSOR = 14;
  const RADIO = 4;
  const MAX_LETRAS = 17;

  function nodo(etiqueta, atributos, texto) {
    const n = document.createElementNS(SVG, etiqueta);
    Object.keys(atributos || {}).forEach(function (clave) { n.setAttribute(clave, atributos[clave]); });
    if (texto != null) n.textContent = texto;
    return n;
  }

  /** Barra con la punta redondeada y la base recta (anclada al eje). */
  function caminoBarra(x, y, largo) {
    const r = Math.min(RADIO, largo / 2, GROSOR / 2);
    return 'M' + x + ',' + y +
      'H' + (x + largo - r) +
      'A' + r + ',' + r + ' 0 0 1 ' + (x + largo) + ',' + (y + r) +
      'V' + (y + GROSOR - r) +
      'A' + r + ',' + r + ' 0 0 1 ' + (x + largo - r) + ',' + (y + GROSOR) +
      'H' + x + 'Z';
  }

  function recortar(texto) {
    return texto.length > MAX_LETRAS ? texto.slice(0, MAX_LETRAS - 1) + '…' : texto;
  }

  /**
   * contenedor: donde se dibuja (se vacía antes).
   * filas: [{ etiqueta, valor, color }] — color es un valor CSS (var(--…)).
   * opciones: { descripcion (para lectores de pantalla), formato(valor) → texto, vacio }
   */
  function barras(contenedor, filas, opciones) {
    const o = opciones || {};
    const formato = o.formato || String;
    contenedor.replaceChildren();
    if (!filas.length) {
      const p = document.createElement('p');
      p.className = 'nota';
      p.textContent = o.vacio || 'Sin datos en este periodo.';
      contenedor.appendChild(p);
      return;
    }

    const maximo = Math.max.apply(null, filas.map(function (f) { return f.valor; })) || 1;
    const x0 = ANCHO_ETIQUETA;
    const largoMax = ANCHO - ANCHO_ETIQUETA - ANCHO_VALOR;
    const alto = filas.length * ALTO_FILA + 4;

    const svg = nodo('svg', {
      viewBox: '0 0 ' + ANCHO + ' ' + alto,
      class: 'grafica',
      role: 'img',
      'aria-label': o.descripcion || ''
    });

    filas.forEach(function (fila, i) {
      const y = i * ALTO_FILA + (ALTO_FILA - GROSOR) / 2;
      const largo = fila.valor > 0 ? Math.max(2, fila.valor / maximo * largoMax) : 0;
      const grupo = nodo('g', { class: 'grafica__fila' });
      grupo.appendChild(nodo('title', {}, fila.etiqueta + ': ' + formato(fila.valor)));
      // Zona de toque de toda la fila (más grande que la barra).
      grupo.appendChild(nodo('rect', { x: 0, y: i * ALTO_FILA, width: ANCHO, height: ALTO_FILA, class: 'grafica__zona' }));
      grupo.appendChild(nodo('text', {
        x: x0 - 8, y: y + GROSOR / 2, class: 'grafica__etiqueta', 'text-anchor': 'end', 'dominant-baseline': 'central'
      }, recortar(fila.etiqueta)));
      if (largo > 0) {
        const barra = nodo('path', { d: caminoBarra(x0, y, largo), class: 'grafica__barra' });
        barra.style.fill = fila.color || 'var(--fg)';
        grupo.appendChild(barra);
      }
      grupo.appendChild(nodo('text', {
        x: x0 + largo + 6, y: y + GROSOR / 2, class: 'grafica__valor', 'dominant-baseline': 'central'
      }, formato(fila.valor)));
      svg.appendChild(grupo);
    });

    // Línea base: fina y discreta.
    svg.appendChild(nodo('line', { x1: x0, x2: x0, y1: 0, y2: alto, class: 'grafica__eje' }));
    contenedor.appendChild(svg);
  }

  return { barras: barras };
})();
