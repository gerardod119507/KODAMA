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

  function crearTarjeta(bloque, indice) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'bloque bloque--' + normalizarTipo(bloque.tipo);
    tarjeta.style.setProperty('--color-bloque', colorDeBloque(bloque));
    tarjeta.style.setProperty('--indice', String(indice));

    const icono = document.createElement('span');
    icono.className = 'bloque__icono';
    icono.innerHTML = KodamaIconos.svgTipo(normalizarTipo(bloque.tipo));
    tarjeta.appendChild(icono);

    const info = document.createElement('div');
    info.className = 'bloque__info';

    const titulo = document.createElement('p');
    titulo.className = 'bloque__titulo';
    titulo.textContent = bloque.titulo || '(sin título)';
    info.appendChild(titulo);

    const meta = document.createElement('p');
    meta.className = 'bloque__meta';
    let textoMeta = bloque.inicio + '–' + bloque.fin + ' · ' + bloque.area;
    if (bloque.etiqueta) {
      textoMeta += ' · ' + bloque.etiqueta;
    }
    meta.textContent = textoMeta;
    info.appendChild(meta);

    tarjeta.appendChild(info);
    return tarjeta;
  }

  // No hay aviso de choques ni solapamientos: si dos bloques comparten
  // horario, simplemente se agrupan en la misma fila visual y se muestran
  // lado a lado (ver css .fila-simultanea). Agrupa por cadena de
  // solapamiento (A se pisa con B, B con C => los 3 van juntos), no solo
  // pares — así una fila nunca queda a medias.
  function agruparPorSolapamiento(bloques) {
    const grupos = [];
    let grupoActual = null;
    let finMaximo = null;

    bloques.forEach(function (bloque) {
      if (grupoActual && bloque.inicio < finMaximo) {
        grupoActual.push(bloque);
        if (bloque.fin > finMaximo) {
          finMaximo = bloque.fin;
        }
      } else {
        grupoActual = [bloque];
        grupos.push(grupoActual);
        finMaximo = bloque.fin;
      }
    });

    return grupos;
  }

  function renderLista(contenedor, bloques) {
    contenedor.replaceChildren();
    const lista = document.createElement('ul');
    lista.className = 'lista-bloques';
    let indice = 0;

    agruparPorSolapamiento(bloques).forEach(function (grupo) {
      const li = document.createElement('li');
      if (grupo.length === 1) {
        li.appendChild(crearTarjeta(grupo[0], indice++));
      } else {
        li.className = 'fila-simultanea';
        grupo.forEach(function (bloque) {
          li.appendChild(crearTarjeta(bloque, indice++));
        });
      }
      lista.appendChild(li);
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
