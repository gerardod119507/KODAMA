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

  function renderSinConfiguracion(contenedor) {
    contenedor.replaceChildren();
    const p = document.createElement('p');
    p.className = 'estado';
    p.textContent = 'Falta configurar la conexión con tu hoja. ';
    const enlace = document.createElement('a');
    enlace.href = 'config.html';
    enlace.textContent = 'Configurar';
    p.appendChild(enlace);
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
    texto.textContent = 'Día libre. No hay bloques este día.';
    vacio.appendChild(texto);

    contenedor.appendChild(vacio);
  }

  function crearTarjeta(bloque, indice, alTocar, solapado) {
    const tarjeta = document.createElement('button');
    tarjeta.type = 'button';
    tarjeta.className = 'bloque bloque--' + normalizarTipo(bloque.tipo);
    if (solapado) {
      tarjeta.classList.add('bloque--solapado');
    }
    if (alTocar) {
      tarjeta.addEventListener('click', function () { alTocar(bloque); });
    }
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

  /**
   * Ids de los bloques que se pisan de verdad con otro del mismo día (A
   * empieza antes de que B termine y viceversa; tocarse no cuenta). Recibe
   * solo los bloques de la capa que se ve. No es un aviso: esos bloques
   * solo llevan el borde con el color de reunión (.bloque--solapado). Las
   * horas son texto HH:mm, que se compara bien como texto.
   */
  function idsSolapados(bloques) {
    const ids = {};
    for (let i = 0; i < bloques.length; i++) {
      for (let j = i + 1; j < bloques.length; j++) {
        const a = bloques[i];
        const b = bloques[j];
        if (a.fecha === b.fecha && a.inicio < b.fin && b.inicio < a.fin) {
          ids[a.id] = true;
          ids[b.id] = true;
        }
      }
    }
    return Object.keys(ids);
  }

  /**
   * Bloque de otra área en una capa filtrada: una tarjeta del mismo tamaño,
   * en el mismo lugar, que solo dice "ocupado" (sin título ni horario).
   */
  function crearOcupado() {
    const caja = document.createElement('div');
    caja.className = 'ocupado ocupado--dia';
    const texto = document.createElement('span');
    texto.className = 'ocupado__texto';
    texto.textContent = 'ocupado';
    caja.appendChild(texto);
    return caja;
  }

  function renderLista(contenedor, bloques, alTocar, esDeLaCapa) {
    contenedor.replaceChildren();
    const lista = document.createElement('ul');
    lista.className = 'lista-bloques';
    let indice = 0;
    const solapados = {};
    idsSolapados(bloques.filter(esDeLaCapa)).forEach(function (id) { solapados[id] = true; });

    function pieza(bloque) {
      return esDeLaCapa(bloque)
        ? crearTarjeta(bloque, indice++, alTocar, solapados[bloque.id])
        : crearOcupado();
    }

    // Se agrupa con TODOS los bloques del día, así cada "ocupado" queda en
    // el mismo lugar que tendría el bloque real en General.
    agruparPorSolapamiento(bloques).forEach(function (grupo) {
      const li = document.createElement('li');
      if (grupo.length === 1) {
        li.appendChild(pieza(grupo[0]));
      } else {
        li.className = 'fila-simultanea';
        grupo.forEach(function (bloque) { li.appendChild(pieza(bloque)); });
      }
      lista.appendChild(li);
    });

    contenedor.appendChild(lista);
  }

  /**
   * bloques: TODOS los del día (todas las áreas), ordenados por inicio.
   * opciones.esDeLaCapa(b): true si se muestra completo; si no, "ocupado".
   */
  function render(contenedor, bloques, opciones) {
    const config = opciones || {};
    const esDeLaCapa = config.esDeLaCapa || function () { return true; };
    if (bloques.length === 0) {
      renderVacio(contenedor, config);
    } else {
      renderLista(contenedor, bloques, config.alTocar, esDeLaCapa);
    }
  }

  return {
    render: render,
    renderCargando: renderCargando,
    renderSinConfiguracion: renderSinConfiguracion,
    renderError: renderError,
    // Compartidas con la vista de semana (js/ui/semana.js), para que ambas
    // pinten un bloque con el mismo color y la misma forma.
    normalizarTipo: normalizarTipo,
    colorDeBloque: colorDeBloque,
    // Se expone solo para poder probarla: es lógica pura y es la regla que
    // decide qué bloques se dibujan lado a lado (ver tests/frontend.test.js).
    agruparPorSolapamiento: agruparPorSolapamiento,
    idsSolapados: idsSolapados
  };
})();
