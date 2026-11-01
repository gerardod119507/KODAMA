/**
 * Pantalla de arranque: la primera pantalla al abrir la app.
 *
 * Sobre el mismo marino de la pantalla de bienvenida de Android (el
 * background_color del manifest), así el paso se siente continuo:
 *
 * 1. El atractor de Lorenz se dibuja en tiempo real desde un punto al azar
 *    (nunca igual) y tres esferas lo recorren a distinta velocidad, con
 *    estela.
 * 2. Se asienta en el logo: el MISMO trazo se transforma en el atractor
 *    del símbolo (icons/simbolo.svg) — cada punto de la trayectoria viaja a
 *    un punto de los trazos del logo —, la línea se dibuja y las tres
 *    esferas vuelan a los tres puntos del símbolo (la más grande, al centro).
 * 3. Se dibuja la circunferencia y aparece "Fractal" y, debajo, KODAMA.
 *
 * - Se ve entera una vez (~4,3 s + una pausa corta): la página llama a
 *   KodamaCarga.listo() cuando tiene algo que mostrar, y la pantalla se
 *   desvanece recién al terminar la secuencia. Un toque la salta. Por las
 *   dudas, se va sola a los 8 s.
 * - El trazo avanza según el tiempo, no por cuadro: en una pantalla de
 *   120 Hz no corre al doble de velocidad.
 * - Solo en la primera pantalla de la sesión (js/tema.js lo decide en el
 *   <head> y pone html[data-arranque="si"]): moverse entre pantallas no la
 *   repite.
 * - Con "reducir movimiento" (prefers-reduced-motion): el logo quieto.
 */
const KodamaCarga = (function () {
  // Milisegundos desde que empieza: cuándo arranca cada fase.
  const TIEMPOS = { asentar: 2000, circulo: 3100, palabra: 3700, fin: 4300 };
  const DURACION_ASENTAR = 1100;
  // El logo completo queda a la vista un momento antes de desvanecerse.
  const PAUSA_FINAL = 400;

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

  const puro = { fase: fase, suavizar: suavizar, ajuste: ajuste, TIEMPOS: TIEMPOS, PAUSA_FINAL: PAUSA_FINAL };
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
  // Quieto: con "reducir movimiento", o si la animación completa ya se vio
  // hoy (js/tema.js): el logo entero, que se va apenas la pantalla está lista.
  const quieto = html.dataset.arranqueCorto === 'si' ||
    Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
  // Fractal (la identidad) grande, y KODAMA (esta app) debajo.
  const palabra = document.createElement('div');
  palabra.className = 'carga__palabra';
  const marca = document.createElement('p');
  marca.className = 'carga__marca';
  marca.textContent = 'Fractal';
  const app = document.createElement('p');
  app.className = 'carga__app';
  app.textContent = 'KODAMA';
  palabra.appendChild(marca);
  palabra.appendChild(app);
  logo.appendChild(palabra);
  raiz.appendChild(logo);

  const DT = 0.008;
  const PASOS_POR_MS = 0.7; // ~12 pasos por cuadro a 60 Hz
  const MAX_PUNTOS = 6000;
  const LARGO_ESTELA = 70;

  let ancho = 0;
  let alto = 0;
  let escala = 1;
  let estado = KodamaLorenz.puntoInicial();
  const puntos = [];
  // La más grande irá al punto del centro del símbolo; las otras, a las puntas de la línea.
  // Velocidad en puntos por ms: siempre detrás de la punta del trazo, así
  // nunca saltan de vuelta al comienzo.
  const esferas = [
    { i: 0, velocidad: 0.23, radio: 4.5 },
    { i: 0, velocidad: 0.37, radio: 3.5 },
    { i: 0, velocidad: 0.55, radio: 2.8 }
  ];
  let svg = null; // el símbolo, cuando llegue
  let inicio = null;
  let anteriorCuadro = null;
  let restoPasos = 0;
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

  // --- Morfo: del trazo en vivo a los trazos del símbolo ---------------
  const PUNTOS_MORFO = 1400;
  let morfo = null;

  /** Puntos a lo largo de un polilínea, a distancias iguales (n puntos). */
  function remuestrear(lista, n) {
    if (lista.length < 2) return Array.from({ length: n }, function () { return lista[0] || [ancho / 2, alto / 2]; });
    const acum = [0];
    for (let i = 1; i < lista.length; i++) {
      acum.push(acum[i - 1] + Math.hypot(lista[i][0] - lista[i - 1][0], lista[i][1] - lista[i - 1][1]));
    }
    const total = acum[acum.length - 1] || 1;
    const salida = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
      const d = total * k / (n - 1);
      while (j < acum.length - 1 && acum[j] < d) j++;
      const tramo = acum[j] - acum[j - 1] || 1;
      const f = Math.max(0, Math.min(1, (d - acum[j - 1]) / tramo));
      const a = lista[j - 1];
      const b = lista[j];
      salida.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    return salida;
  }

  /** Los trazos del atractor del símbolo, en píxeles de pantalla. */
  function trazosDelLogo() {
    const caminos = Array.prototype.slice.call(svg.querySelectorAll('[data-parte="atractor"]'))
      .filter(function (p) { return typeof p.getTotalLength === 'function'; });
    const largos = caminos.map(function (p) { return p.getTotalLength(); });
    const total = largos.reduce(function (a, b) { return a + b; }, 0) || 1;
    const caja = svg.getBoundingClientRect();
    const vista = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal.width : 635;
    const aPx = caja.width / vista;
    return caminos.map(function (p, i) {
      const n = Math.max(8, Math.round(PUNTOS_MORFO * largos[i] / total));
      const m = p.getScreenCTM();
      const pts = [];
      for (let k = 0; k < n; k++) {
        const q = p.getPointAtLength(largos[i] * k / (n - 1));
        pts.push(m ? [m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f] : [q.x, q.y]);
      }
      const grosor = parseFloat(p.getAttribute('stroke-width') || p.parentNode.getAttribute('stroke-width') || '2');
      return { puntos: pts, grosor: grosor * aPx };
    });
  }

  /** Reparte la trayectoria (los últimos puntos dibujados) entre los trazos del logo. */
  function prepararMorfo() {
    if (puntos.length < 2) return null;
    const destino = trazosDelLogo();
    if (!destino.length) return null;
    const total = destino.reduce(function (a, t) { return a + t.puntos.length; }, 0);
    const origen = remuestrear(puntos, total);
    let i = 0;
    const tramos = destino.map(function (t) {
      const desde = origen.slice(i, i + t.puntos.length);
      i += t.puntos.length;
      return { desde: desde, hasta: t.puntos, grosor: t.grosor };
    });
    return { tramos: tramos, listo: false };
  }

  /** Un cuadro del morfo: avance 0 = el trazo en vivo, 1 = el símbolo. */
  function dibujarMorfo(avance) {
    ctx.save();
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    ctx.strokeStyle = TINTA;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.5 + 0.5 * avance;
    morfo.tramos.forEach(function (t) {
      ctx.lineWidth = 0.8 + (t.grosor - 0.8) * avance;
      ctx.beginPath();
      for (let k = 0; k < t.hasta.length; k++) {
        const a = t.desde[k];
        const b = t.hasta[k];
        const x = a[0] + (b[0] - a[0]) * avance;
        const y = a[1] + (b[1] - a[1]) * avance;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    });
    ctx.restore();
    if (avance >= 1) {
      // Llegó: el símbolo de verdad toma su lugar (están en el mismo sitio).
      morfo.listo = true;
      raiz.classList.add('carga--atractor-listo');
      ctx.clearRect(0, 0, ancho, alto);
    }
  }

  /** Empieza a asentarse: el trazo hacia el atractor del logo, las esferas hacia sus puntos. */
  function asentar(ahora) {
    asentarDesde = ahora;
    raiz.classList.add('carga--logo');
    // El trazo en vivo se TRANSFORMA en el atractor del logo: cada punto de
    // la trayectoria viaja a un punto de los trazos del símbolo. Así el logo
    // sale de la misma animación, sin un corte entre uno y otro.
    morfo = prepararMorfo();
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
    // Tiempo desde el cuadro anterior (con tope: una pausa del navegador no
    // hace saltar el trazo).
    const dt = anteriorCuadro === null ? 16 : Math.min(50, ahora - anteriorCuadro);
    anteriorCuadro = ahora;

    if (asentarDesde === null) {
      restoPasos += dt * PASOS_POR_MS;
      const pasos = Math.floor(restoPasos);
      restoPasos -= pasos;
      avanzarTrazo(pasos);
      esferas.forEach(function (e) {
        e.i += e.velocidad * dt;
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
      if (morfo && !morfo.listo) dibujarMorfo(avance);
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

  let pendienteListo = false;
  let saltar = false;

  function ocultar() {
    if (terminado) return;
    terminado = true;
    if (cuadro) cancelAnimationFrame(cuadro);
    relojes.forEach(clearTimeout);
    // La página ya puede verse: vuelve el fondo del tema (tapado por la
    // pantalla de arranque mientras se desvanece).
    raiz.classList.add('carga--saliendo');
    delete html.dataset.arranque;
    delete html.dataset.arranqueCorto;
    if (typeof KodamaTema !== 'undefined') KodamaTema.aplicar();
    requestAnimationFrame(function () { raiz.classList.add('carga--fuera'); });
    setTimeout(function () { raiz.hidden = true; }, quieto ? 0 : 500);
  }

  function listo() {
    if (terminado || pendienteListo) return;
    pendienteListo = true;
    const ahora = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const transcurrido = inicio !== null ? (ahora - inicio) : 0;
    // La secuencia se ve entera una vez (salvo que la hayan saltado).
    const duracionMinima = quieto || saltar ? 0 : TIEMPOS.fin + PAUSA_FINAL;
    const restante = Math.max(0, duracionMinima - transcurrido);
    if (restante > 0) {
      setTimeout(ocultar, restante);
    } else {
      ocultar();
    }
  }

  // Un toque la salta (si la página todavía no está lista, se va apenas lo esté).
  raiz.addEventListener('click', function () {
    saltar = true;
    if (pendienteListo) ocultar();
  });

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
