/**
 * Navegación de todas las pantallas. Se carga justo después del
 * encabezado (sin esperar al resto de la página) y arma:
 *
 * - En el celular: una barra fija abajo con Día, Semana, Alumnos y Más.
 *   "Más" abre una hoja que sube desde abajo con Horario, Cobros,
 *   Estadísticas y Configuración (se cierra tocando afuera, con ✕, con
 *   Escape o deslizándola hacia abajo).
 * - En pantallas anchas (700px o más): la misma lista arriba, en el
 *   encabezado, en dos grupos (lo diario | lo demás).
 *
 * El destino activo se marca con aria-current="page" y, a la vista, con
 * relleno + letra más gruesa (nunca solo con color). Los íconos son SVG
 * propios, trazos simples con el color del texto.
 *
 * Cada página dice cuál es con <body data-pagina="...">. En index.html,
 * Día y Semana cambian el modo sin recargar (app.js registra
 * alElegirModo); desde otra pantalla van a index.html#dia / #semana.
 */
const KodamaNavegacion = (function () {
  const SVG = 'http://www.w3.org/2000/svg';

  // Trazos en una grilla de 24×24. [d, grosor opcional].
  const ICONOS = {
    dia: [['M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'], ['M4 9.5h16'], ['M8 3v4M16 3v4'],
      ['M10 13h4v4h-4z']],
    semana: [['M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'], ['M4 9.5h16'], ['M8 3v4M16 3v4'],
      ['M9.3 9.5V20M14.7 9.5V20']],
    alumnos: [['M12 11a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z'], ['M4.5 20.5a7.5 7.5 0 0 1 15 0']],
    mas: [['M5 12h.01M12 12h.01M19 12h.01', 3.2]],
    horario: [['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'], ['M12 7v5l3.2 2']],
    cobros: [['M4 7.5h15a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V7.5z'],
      ['M4 7.5 15.5 4l1 3.5'], ['M16 14h1.5']],
    estadisticas: [['M3.5 20h17'], ['M6.5 20v-7M12 20V5.5M17.5 20v-10']],
    config: [['M4 7h9M17 7h3M15 4.8v4.4'], ['M4 17h3M11 17h9M9 14.8v4.4']]
  };

  const PRINCIPALES = [
    { id: 'dia', nombre: 'Día', href: 'index.html#dia' },
    { id: 'semana', nombre: 'Semana', href: 'index.html#semana' },
    { id: 'alumnos', nombre: 'Alumnos', href: 'alumnos.html' }
  ];
  const MAS = [
    { id: 'horario', nombre: 'Horario', href: 'horario.html' },
    { id: 'cobros', nombre: 'Cobros', href: 'cobros.html' },
    { id: 'estadisticas', nombre: 'Estadísticas', href: 'estadisticas.html' },
    { id: 'config', nombre: 'Configuración', href: 'config.html' }
  ];

  /** Qué destino está activo: en la pantalla principal, el modo; si no, la página. */
  function activo(pagina, modo) {
    if (pagina === 'inicio') return modo === 'semana' ? 'semana' : 'dia';
    return pagina;
  }

  function estaEnMas(id) {
    return MAS.some(function (d) { return d.id === id; });
  }

  // --- Lógica pura arriba; DOM abajo (las pruebas cargan este archivo sin página) ---
  if (typeof document === 'undefined' || !document.body) {
    return { activo: activo, estaEnMas: estaEnMas, PRINCIPALES: PRINCIPALES, MAS: MAS, ICONOS: ICONOS };
  }

  const pagina = document.body.dataset.pagina || '';
  let alElegirModo = null;
  const enlaces = []; // { id, nodo } de todas las navegaciones, para marcar el activo

  function icono(nombre) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'nav__icono');
    ICONOS[nombre].forEach(function (trazo) {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', trazo[0]);
      if (trazo[1]) p.setAttribute('stroke-width', String(trazo[1]));
      svg.appendChild(p);
    });
    return svg;
  }

  function item(destino, clase) {
    const a = document.createElement('a');
    a.className = clase;
    a.href = destino.href;
    a.appendChild(icono(destino.id));
    const texto = document.createElement('span');
    texto.className = 'nav__texto';
    texto.textContent = destino.nombre;
    a.appendChild(texto);
    if (destino.id === 'dia' || destino.id === 'semana') {
      a.addEventListener('click', function (evento) {
        if (!alElegirModo) return; // en otra pantalla: navega a index.html#…
        evento.preventDefault();
        cerrarHoja();
        alElegirModo(destino.id);
      });
    }
    enlaces.push({ id: destino.id, nodo: a });
    return a;
  }

  // --- Arriba (pantallas anchas) ---
  const cabecera = document.querySelector('.cabecera');
  const arriba = document.createElement('nav');
  arriba.className = 'nav-arriba';
  arriba.setAttribute('aria-label', 'Secciones');
  [PRINCIPALES, MAS].forEach(function (grupo) {
    const g = document.createElement('div');
    g.className = 'nav-arriba__grupo';
    grupo.forEach(function (d) { g.appendChild(item(d, 'nav-arriba__item')); });
    arriba.appendChild(g);
  });
  if (cabecera) cabecera.insertBefore(arriba, cabecera.querySelector('.boton-tema'));

  // --- Abajo (celular) ---
  const abajo = document.createElement('nav');
  abajo.className = 'barra-inferior';
  abajo.setAttribute('aria-label', 'Secciones');
  PRINCIPALES.forEach(function (d) { abajo.appendChild(item(d, 'barra-inferior__item')); });
  const botonMas = document.createElement('button');
  botonMas.type = 'button';
  botonMas.className = 'barra-inferior__item';
  botonMas.setAttribute('aria-haspopup', 'dialog');
  botonMas.appendChild(icono('mas'));
  const textoMas = document.createElement('span');
  textoMas.className = 'nav__texto';
  textoMas.textContent = 'Más';
  botonMas.appendChild(textoMas);
  abajo.appendChild(botonMas);
  document.body.appendChild(abajo);
  document.body.classList.add('con-barra-inferior');

  // --- Hoja "Más" ---
  // El <dialog> no tiene relleno: todo va en .hoja__contenido, así un toque
  // cuyo destino es el <dialog> mismo es un toque afuera (en el fondo).
  const hoja = document.createElement('dialog');
  hoja.className = 'hoja';
  hoja.setAttribute('aria-label', 'Más secciones');
  const contenido = document.createElement('div');
  contenido.className = 'hoja__contenido';
  const agarradera = document.createElement('div');
  agarradera.className = 'hoja__agarradera';
  agarradera.setAttribute('aria-hidden', 'true');
  contenido.appendChild(agarradera);
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'hoja__cerrar fantasma';
  cerrar.setAttribute('aria-label', 'Cerrar');
  cerrar.textContent = '✕';
  contenido.appendChild(cerrar);
  const lista = document.createElement('div');
  lista.className = 'hoja__lista';
  MAS.forEach(function (d) { lista.appendChild(item(d, 'hoja__item')); });
  contenido.appendChild(lista);
  hoja.appendChild(contenido);
  document.body.appendChild(hoja);

  const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function abrirHoja() {
    hoja.classList.remove('hoja--cerrando');
    hoja.style.transform = '';
    if (!hoja.open) hoja.showModal();
  }

  function cerrarHoja() {
    if (!hoja.open) return;
    if (quieto) { hoja.close(); return; }
    hoja.classList.add('hoja--cerrando');
    setTimeout(function () {
      hoja.close();
      hoja.classList.remove('hoja--cerrando');
      hoja.style.transform = '';
    }, 200);
  }

  botonMas.addEventListener('click', abrirHoja);
  cerrar.addEventListener('click', cerrarHoja);
  // Tocar afuera (el fondo oscurecido es el propio <dialog>) la cierra.
  hoja.addEventListener('click', function (evento) {
    if (evento.target === hoja) cerrarHoja();
  });
  hoja.addEventListener('cancel', function (evento) { // Escape
    evento.preventDefault();
    cerrarHoja();
  });

  // Deslizar hacia abajo para cerrar. Un toque (menos de 8px) sigue siendo
  // un toque: los enlaces funcionan igual.
  let desdeY = null;
  let bajada = 0;
  hoja.addEventListener('pointerdown', function (evento) {
    if (evento.target === hoja) return;
    desdeY = evento.clientY;
    bajada = 0;
  });
  hoja.addEventListener('pointermove', function (evento) {
    if (desdeY === null) return;
    bajada = Math.max(0, evento.clientY - desdeY);
    if (bajada > 8) {
      hoja.classList.add('hoja--arrastrando');
      hoja.style.transform = 'translateY(' + bajada + 'px)';
    }
  });
  function soltar() {
    if (desdeY === null) return;
    desdeY = null;
    hoja.classList.remove('hoja--arrastrando');
    if (bajada > 70) {
      cerrarHoja();
    } else {
      hoja.style.transform = '';
    }
  }
  hoja.addEventListener('pointerup', soltar);
  hoja.addEventListener('pointercancel', soltar);

  function marcar(modo) {
    const actual = activo(pagina, modo);
    enlaces.forEach(function (e) {
      if (e.id === actual) e.nodo.setAttribute('aria-current', 'page');
      else e.nodo.removeAttribute('aria-current');
    });
    if (estaEnMas(actual)) botonMas.setAttribute('aria-current', 'page');
    else botonMas.removeAttribute('aria-current');
  }

  // Fecha de hoy en el encabezado de las pantallas que no son la principal
  // (en la principal, app.js pone el día o la semana que se está viendo).
  const fecha = document.querySelector('[data-fecha-hoy]');
  if (fecha) {
    fecha.textContent = new Intl.DateTimeFormat('es-BO', {
      timeZone: 'America/La_Paz', weekday: 'long', day: 'numeric', month: 'long'
    }).format(new Date());
  }

  marcar(null); // en la principal, app.js lo corrige con el modo apenas lo sabe

  return {
    activo: activo,
    estaEnMas: estaEnMas,
    PRINCIPALES: PRINCIPALES,
    MAS: MAS,
    ICONOS: ICONOS,
    marcar: marcar,
    /** La pantalla principal cambia de modo sin recargar. */
    alElegirModo: function (fn) { alElegirModo = fn; }
  };
})();
