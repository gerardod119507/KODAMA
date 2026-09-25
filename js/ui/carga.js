/**
 * Pantalla de arranque: la primera pantalla al abrir la app.
 *
 * Sobre el mismo marino de la pantalla de bienvenida de Android (el
 * background_color del manifest), así el paso se siente continuo:
 *
 * 1. El atractor de Lorenz se dibuja en tiempo real desde un punto al azar
 *    (nunca igual) y tres esferas lo recorren a distinta velocidad, con
 *    estela.
 * 2. Se asienta en el logo: el trazo se encoge sobre el atractor del
 *    símbolo (icons/simbolo.svg) mientras este aparece, y las tres esferas
 *    vuelan a los tres puntos del símbolo (la más grande, al centro).
 * 3. Se dibuja la circunferencia y después aparece la palabra KODAMA.
 *
 * - Nunca demora la app: la página llama a KodamaCarga.listo() apenas tiene
 *   algo que mostrar y la pantalla se desvanece en ese momento, esté en la
 *   fase que esté (con la semana guardada es casi enseguida). Por las
 *   dudas, se va sola a los 8 s.
 * - Solo en la primera pantalla de la sesión (js/tema.js lo decide en el
 *   <head> y pone html[data-arranque="si"]): moverse entre pantallas no la
 *   repite.
 * - Con "reducir movimiento" (prefers-reduced-motion): el logo quieto.
 */
const KodamaCarga = (function () {
  // Milisegundos desde que empieza: cuándo arranca cada fase.
  const TIEMPOS = { asentar: 1300, circulo: 2000, palabra: 2500, fin: 2900 };
  const DURACION_ASENTAR = 700;

  /** En qué fase está a los t ms (con el logo listo). */
  function fase(t) {
    if (t < TIEMPOS.asentar) return 'atractor';
    if (t < TIEMPOS.circulo) return 'asentar';
    if (t < TIEMPOS.palabra) return 'circulo';
    if (t < TIEMPOS.fin) return 'palabra';
    return 'quieto';
  }

  /** Suave al empezar y al terminar (0 → 1). */
  function suavizar(t) {
    const x = Math.max(0, Math.min(1, t));
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  /**
   * Escala y traslado que llevan el rectángulo del trazo en vivo sobre el
   * del atractor del logo (mismo centro; entra entero, sin deformarse).
   */
  function ajuste(trazo, logo) {
    const k = Math.min(logo.w / trazo.w, logo.h / trazo.h);
    return {
      k: k,
      tx: logo.x + logo.w / 2 - (trazo.x + trazo.w / 2) * k,
      ty: logo.y + logo.h / 2 - (trazo.y + trazo.h / 2) * k
    };
  }

  const puro = { fase: fase, suavizar: suavizar, ajuste: ajuste, TIEMPOS: TIEMPOS };
  const nada = Object.assign({ listo: function () {} }, puro);
  if (typeof document === 'undefined') return nada;

  const raiz = document.getElementById('carga');
  if (!raiz) return nada;
  const html = document.documentElement;
  if (html.dataset.arranque !== 'si') {
    raiz.hidden = true; // ya se abrió la app en esta sesión
    return nada;
  }

  const TINTA = '#F5F1E8'; // hueso sobre marino, en los dos temas
  const MARINO = '#071743';
  const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Capas: trazo (lienzo del HTML), esferas encima, y el logo ---
  const lienzo = raiz.querySelector('canvas');
  lienzo.classList.add('carga__trazo');
  const ctx = lienzo.getContext('2d');
  const lienzoEsferas = document.createElement('canvas');
  lienzoEsferas.className = 'carga__lienzo carga__esferas';
  raiz.appendChild(lienzoEsferas);
  const ectx = lienzoEsferas.getContext('2d');
  const logo = document.createElement('div');
  logo.className = 'carga__logo';
  const palabra = document.createElement('p');
  palabra.className = 'carga__palabra';
  palabra.textContent = 'KODAMA';
  logo.appendChild(palabra);
  raiz.appendChild(logo);

  const DT = 0.008;
  const PASOS_POR_CUADRO = 18;
  const MAX_PUNTOS = 6000;
  const LARGO_ESTELA = 70;

  let ancho = 0;
  let alto = 0;
  let escala = 1;
  let estado = KodamaLorenz.puntoInicial();
  const puntos = [];
  // La más grande irá al punto del centro del símbolo; las otras, a las puntas de la línea.
  const esferas = [
    { i: 0, velocidad: 6, radio: 4.5 },
    { i: 0, velocidad: 9.5, radio: 3.5 },
    { i: 0, velocidad: 14, radio: 2.8 }
  ];
  let svg = null; // el símbolo, cuando llegue
  let inicio = null;
  let asentarDesde = null;
  let cuadro = null;
  let terminado = false;
  const relojes = [];

  function medir() {
    const dpr = window.devicePixelRatio || 1;
    ancho = window.innerWidth;
    alto = window.innerHeight;
    [lienzo, lienzoEsferas].forEach(function (c) {
      c.width = Math.round(ancho * dpr);
      c.height = Math.round(alto * dpr);
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ctx.strokeStyle = TINTA;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.5;
    escala = Math.min(ancho, alto) * 0.44 / 30;
  }

  function aPantalla(p) {
    const q = KodamaLorenz.proyectar(p);
    return [ancho / 2 + q[0] * escala, alto / 2 + q[1] * escala];
  }

  /** La trayectoria se dibuja una sola vez, de a tramos (no se redibuja). */
  function avanzarTrazo(pasos) {
    ctx.beginPath();
    let anterior = puntos[puntos.length - 1];
    if (anterior) ctx.moveTo(anterior[0], anterior[1]);
    for (let k = 0; k < pasos && puntos.length < MAX_PUNTOS; k++) {
      estado = KodamaLorenz.paso(estado, DT);
      const s = aPantalla(estado);
      if (anterior) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]);
      puntos.push(s);
      anterior = s;
    }
    ctx.stroke();
  }

  function esfera(x, y, radio) {
    // Un brillo del marino hacia el hueso, para que se vea redonda.
    const g = ectx.createRadialGradient(x - radio / 3, y - radio / 3, radio / 5, x, y, radio);
    g.addColorStop(0, MARINO);
    g.addColorStop(0.35, TINTA);
    g.addColorStop(1, TINTA);
    ectx.globalAlpha = 1;
    ectx.fillStyle = g;
    ectx.beginPath();
    ectx.arc(x, y, radio, 0, 2 * Math.PI);
    ectx.fill();
  }

  function estela(e) {
    const i = Math.floor(e.i);
    ectx.strokeStyle = TINTA;
    ectx.lineCap = 'round';
    for (let k = 1; k < LARGO_ESTELA && i - k >= 0; k += 2) {
      const a = puntos[i - k + 1];
      const b = puntos[Math.max(0, i - k - 1)];
      ectx.globalAlpha = 0.55 * (1 - k / LARGO_ESTELA);
      ectx.lineWidth = e.radio * 0.9 * (1 - k / LARGO_ESTELA) + 0.4;
      ectx.beginPath();
      ectx.moveTo(a[0], a[1]);
      ectx.lineTo(b[0], b[1]);
      ectx.stroke();
    }
  }

  function rect(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /** Empieza a asentarse: el trazo hacia el atractor del logo, las esferas hacia sus puntos. */
  function asentar(ahora) {
    asentarDesde = ahora;
    raiz.classList.add('carga--logo');
    // Rectángulo del trazo en vivo y el del atractor del símbolo.
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    puntos.forEach(function (p) {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    });
    let lx0 = Infinity; let ly0 = Infinity; let lx1 = -Infinity; let ly1 = -Infinity;
    svg.querySelectorAll('[data-parte="atractor"]').forEach(function (p) {
      const r = rect(p);
      lx0 = Math.min(lx0, r.x); ly0 = Math.min(ly0, r.y); lx1 = Math.max(lx1, r.x + r.w); ly1 = Math.max(ly1, r.y + r.h);
    });
    if (puntos.length > 1 && isFinite(lx0)) {
      const a = ajuste({ x: x0, y: y0, w: x1 - x0 || 1, h: y1 - y0 || 1 }, { x: lx0, y: ly0, w: lx1 - lx0, h: ly1 - ly0 });
      lienzo.style.transform = 'translate(' + a.tx + 'px, ' + a.ty + 'px) scale(' + a.k + ')';
    }
    raiz.classList.add('carga--asentar');

    // Cada esfera, de donde está al punto que le toca (por tamaño).
    const destinos = Array.prototype.slice.call(svg.querySelectorAll('[data-parte="punto"]'))
      .map(function (c) { const r = rect(c); return { x: r.x + r.w / 2, y: r.y + r.h / 2, radio: r.w / 2 }; })
      .sort(function (a, b) { return b.radio - a.radio; });
    esferas.forEach(function (e, k) {
      const p = puntos[Math.min(Math.floor(e.i), puntos.length - 1)] || [ancho / 2, alto / 2];
      e.desde = { x: p[0], y: p[1], radio: e.radio };
      e.hasta = destinos[k] || e.desde;
    });

    relojes.push(setTimeout(function () {
      raiz.classList.add('carga--circulo'); // los puntos del símbolo reemplazan a las esferas
      ectx.clearRect(0, 0, ancho, alto);
    }, TIEMPOS.circulo - TIEMPOS.asentar));
    relojes.push(setTimeout(function () { raiz.classList.add('carga--palabra'); }, TIEMPOS.palabra - TIEMPOS.asentar));
  }

  function animar(ahora) {
    if (terminado) return;
    if (inicio === null) inicio = ahora;
    const t = ahora - inicio;

    if (asentarDesde === null) {
      avanzarTrazo(PASOS_POR_CUADRO);
      esferas.forEach(function (e) {
        e.i += e.velocidad;
        if (e.i >= puntos.length - 1) e.i = e.i % Math.max(1, puntos.length - 1);
      });
      ectx.clearRect(0, 0, ancho, alto);
      esferas.forEach(function (e) {
        estela(e);
        const p = puntos[Math.min(Math.floor(e.i), puntos.length - 1)];
        if (p) esfera(p[0], p[1], e.radio);
      });
      // Si el símbolo todavía no llegó, el atractor sigue hasta que llegue.
      if (t >= TIEMPOS.asentar && svg) asentar(ahora);
    } else {
      const avance = suavizar((ahora - asentarDesde) / DURACION_ASENTAR);
      if (ahora - asentarDesde <= TIEMPOS.circulo - TIEMPOS.asentar) {
        ectx.clearRect(0, 0, ancho, alto);
        esferas.forEach(function (e) {
          esfera(e.desde.x + (e.hasta.x - e.desde.x) * avance,
            e.desde.y + (e.hasta.y - e.desde.y) * avance,
            e.desde.radio + (e.hasta.radio - e.desde.radio) * avance);
        });
      }
      // Ya está el logo: no se anima más (ahorra batería mientras espera).
      if (ahora - asentarDesde > TIEMPOS.fin - TIEMPOS.asentar) return;
    }
    cuadro = requestAnimationFrame(animar);
  }

  /** El símbolo, del mismo archivo que usan el sello y los íconos (sin innerHTML). */
  function cargarSimbolo() {
    return fetch('icons/simbolo.svg')
      .then(function (r) { if (!r.ok) throw new Error('sin símbolo'); return r.text(); })
      .then(function (texto) {
        const doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
        const nodo = doc.documentElement;
        if (!nodo || nodo.nodeName.toLowerCase() !== 'svg') throw new Error('sin símbolo');
        const importado = document.importNode(nodo, true);
        importado.setAttribute('class', 'carga__simbolo');
        importado.setAttribute('aria-hidden', 'true');
        // Largo 1 en cada trazo: así se "dibujan" con stroke-dashoffset 1 → 0.
        importado.querySelectorAll('[data-parte="circulo"], [data-parte="linea"]').forEach(function (p) {
          p.setAttribute('pathLength', '1');
        });
        logo.insertBefore(importado, palabra);
        svg = importado;
      });
  }

  function listo() {
    if (terminado) return;
    terminado = true;
    if (cuadro) cancelAnimationFrame(cuadro);
    relojes.forEach(clearTimeout);
    // La página ya puede verse: vuelve el fondo del tema (tapado por la
    // pantalla de arranque mientras se desvanece).
    raiz.classList.add('carga--saliendo');
    delete html.dataset.arranque;
    if (typeof KodamaTema !== 'undefined') KodamaTema.aplicar();
    requestAnimationFrame(function () { raiz.classList.add('carga--fuera'); });
    setTimeout(function () { raiz.hidden = true; }, quieto ? 0 : 280);
  }

  medir();
  if (quieto) {
    // Logo quieto: todo a la vista de una vez, sin atractor en movimiento.
    raiz.classList.add('carga--quieta');
    cargarSimbolo().then(function () {
      raiz.classList.add('carga--logo', 'carga--asentar', 'carga--circulo', 'carga--palabra');
    }).catch(function () { raiz.classList.add('carga--palabra'); });
  } else {
    cargarSimbolo().catch(function () { /* sin el símbolo: queda el atractor hasta listo() */ });
    cuadro = requestAnimationFrame(animar);
  }
  setTimeout(listo, 8000);

  return Object.assign({ listo: listo }, puro);
})();
