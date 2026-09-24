/**
 * Vista de día: grilla horaria de un solo día (la misma de la semana) o
 * estado vacío/carga/error.
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

  /**
   * Ids de los bloques que se pisan de verdad con otro del mismo día (A
   * empieza antes de que B termine y viceversa; tocarse no cuenta). Recibe
   * solo los bloques de la capa que se ve. No es un aviso: esos bloques
   * solo llevan el borde con el color de reunión (.bloque--solapado). Las
   * horas son texto HH:mm, que se compara bien como texto.
   */
  function idsSolapados(todos) {
    // Una clase cancelada no ocupa su horario: no se pisa con nada.
    const bloques = todos.filter(function (b) { return String(b.estado || '').trim() !== 'cancelada'; });
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
   * La vista de día usa la MISMA grilla horaria que la de semana, con una
   * sola columna: cada bloque en su hora, alto proporcional a su duración,
   * casillas "ocupado" de otras capas, huecos colapsados en el celular y el
   * borde de superposición. Si el día no tiene nada, el estado vacío con la
   * mascota.
   *
   * bloques: TODOS los del día (todas las áreas).
   * opciones: { fecha, hoy, esDeLaCapa, alTocar, colapsarHuecos, compararBocetos }
   */
  function render(contenedor, bloques, opciones) {
    const config = opciones || {};
    if (bloques.length === 0) {
      renderVacio(contenedor, config);
      return;
    }
    KodamaSemana.render(contenedor, {
      dias: [config.fecha],
      hoy: config.hoy,
      bloques: bloques,
      esDeLaCapa: config.esDeLaCapa,
      alTocar: config.alTocar,
      colapsarHuecos: config.colapsarHuecos,
      unDia: true
    });
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
    // Se expone también para las pruebas (tests/huecos.test.js).
    idsSolapados: idsSolapados
  };
})();
