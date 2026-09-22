/**
 * Vista de día: lista de bloques o estado vacío/carga/error.
 *
 * Los SVG de íconos y mascota son plantillas fijas escritas por nosotros
 * (nunca contienen datos del usuario), por eso es seguro insertarlas con
 * innerHTML. El título, horario y área de cada bloque SIEMPRE se escriben
 * con textContent porque vienen de la hoja de cálculo.
 */
const KodamaDia = (function () {
  const COLOR_POR_AREA = {
    'Universidad': 'var(--area-universidad)',
    'Academia Fractal': 'var(--area-fractal)',
    'Startup': 'var(--area-startup)',
    'Personal': 'var(--area-personal)'
  };

  function normalizarTipo(tipo) {
    const mapa = { fijo: 'fijo', variable: 'variable', 'reunión': 'reunion', reunion: 'reunion' };
    return mapa[tipo] || 'variable';
  }

  function colorDeBloque(bloque) {
    if (normalizarTipo(bloque.tipo) === 'reunion') {
      return 'var(--tipo-reunion)';
    }
    return COLOR_POR_AREA[bloque.area] || 'var(--fg)';
  }

  function renderCargando(contenedor) {
    contenedor.replaceChildren();
    const p = document.createElement('p');
    p.className = 'estado estado--carga';
    p.textContent = 'Cargando...';
    contenedor.appendChild(p);
  }

  function renderError(contenedor, mensaje) {
    contenedor.replaceChildren();
    const p = document.createElement('p');
    p.className = 'estado estado--error';
    p.textContent = mensaje;
    contenedor.appendChild(p);
  }

  function renderVacio(contenedor, opciones) {
    contenedor.replaceChildren();
    const vacio = document.createElement('div');
    vacio.className = 'estado-vacio';

    if (opciones && opciones.compararBocetos) {
      const grupo = document.createElement('div');
      grupo.className = 'bocetos';
      grupo.innerHTML =
        '<div class="boceto">' + KodamaEspiritu.dormidoA + '<p>Boceto A</p></div>' +
        '<div class="boceto">' + KodamaEspiritu.dormidoB + '<p>Boceto B</p></div>';
      vacio.appendChild(grupo);

      const nota = document.createElement('p');
      nota.className = 'nota';
      nota.textContent = 'Elegí uno (A o B) y contámelo para integrarlo en el próximo checkpoint.';
      vacio.appendChild(nota);
    } else {
      const mascota = document.createElement('div');
      mascota.className = 'mascota';
      mascota.innerHTML = KodamaEspiritu.dormidoA;
      vacio.appendChild(mascota);
    }

    const texto = document.createElement('p');
    texto.className = 'estado-vacio__texto';
    texto.textContent = 'Día libre. No hay bloques para hoy.';
    vacio.appendChild(texto);

    contenedor.appendChild(vacio);
  }

  function crearItem(bloque, indice) {
    const li = document.createElement('li');
    li.className = 'bloque bloque--' + normalizarTipo(bloque.tipo);
    li.style.setProperty('--color-bloque', colorDeBloque(bloque));
    li.style.setProperty('--indice', String(indice));

    const icono = document.createElement('span');
    icono.className = 'bloque__icono';
    icono.innerHTML = KodamaIconos.svgTipo(normalizarTipo(bloque.tipo));
    li.appendChild(icono);

    const info = document.createElement('div');
    info.className = 'bloque__info';

    const titulo = document.createElement('p');
    titulo.className = 'bloque__titulo';
    titulo.textContent = bloque.titulo || '(sin título)';
    info.appendChild(titulo);

    const meta = document.createElement('p');
    meta.className = 'bloque__meta';
    meta.textContent = bloque.inicio + '–' + bloque.fin + ' · ' + bloque.area;
    info.appendChild(meta);

    li.appendChild(info);
    return li;
  }

  function renderLista(contenedor, bloques) {
    contenedor.replaceChildren();
    const lista = document.createElement('ul');
    lista.className = 'lista-bloques';
    bloques.forEach(function (bloque, indice) {
      lista.appendChild(crearItem(bloque, indice));
    });
    contenedor.appendChild(lista);
  }

  function render(contenedor, bloques, opcionesVacio) {
    if (bloques.length === 0) {
      renderVacio(contenedor, opcionesVacio);
    } else {
      renderLista(contenedor, bloques);
    }
  }

  return {
    render: render,
    renderCargando: renderCargando,
    renderError: renderError
  };
})();
