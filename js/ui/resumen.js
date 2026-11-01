/**
 * El ícono de resumen (solo en la vista principal): el símbolo en chico,
 * junto al botón de tema. Al tocarlo, KODAMA te dice lo que queda del día
 * (js/resumen.js) en voz alta y en texto; "Próximos días" sigue con lo que
 * viene. Mientras habla, el punto recorre la mariposa.
 *
 * - Sin texto a la vista: la etiqueta "Resumen" aparece recién después de
 *   5 s con el mouse encima (o el dedo apoyado). Para lectores de
 *   pantalla, siempre se llama "Resumen".
 * - Voz: en la APK, el plugin nativo de texto a voz (la voz de Google del
 *   celular); en el navegador, speechSynthesis. Se prefiere español
 *   latino (es-US, es-MX, es-419) antes que el de España. Sin voz, queda
 *   el texto.
 */
const KodamaResumenUI = (function () {
  const ESPERA_ETIQUETA = 5000;
  const IDIOMAS = ['es-US', 'es-MX', 'es-419', 'es-BO', 'es'];

  let fuente = null; // { bloquesDe(fecha), nombre(bloque) }
  let boton = null;
  let icono = null;
  let dialogo = null;
  let parrafo = null;
  let hablando = false;

  // ---------- voz ----------

  function pluginNativo() {
    const c = typeof window !== 'undefined' ? window.Capacitor : null;
    return c && c.Plugins && c.Plugins.TextToSpeech && c.isNativePlatform && c.isNativePlatform()
      ? c.Plugins.TextToSpeech : null;
  }

  function vozDelNavegador() {
    if (typeof speechSynthesis === 'undefined') return null;
    const voces = speechSynthesis.getVoices() || [];
    for (let i = 0; i < IDIOMAS.length; i++) {
      const v = voces.find(function (x) { return String(x.lang).replace('_', '-').indexOf(IDIOMAS[i]) === 0; });
      if (v) return v;
    }
    return null;
  }

  function animarIcono(si) {
    hablando = si;
    boton.classList.toggle('resumen-boton--hablando', si);
    try {
      if (si) icono.unpauseAnimations(); else icono.pauseAnimations();
    } catch (err) { /* sin SMIL: queda quieto */ }
  }

  /** Lee el texto en voz alta, frase por frase (Android corta las largas). */
  async function decir(texto) {
    callar();
    const nativo = pluginNativo();
    if (nativo) {
      animarIcono(true);
      try {
        await nativo.speak({ text: texto, lang: 'es-US', rate: 0.95, pitch: 0.8, volume: 1.0, category: 'playback' });
      } catch (err) { /* sin voz: queda el texto */ }
      animarIcono(false);
      return;
    }
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    const frases = texto.match(/[^.;]+[.;]?/g) || [texto];
    const voz = vozDelNavegador();
    animarIcono(true);
    frases.forEach(function (frase, i) {
      const u = new SpeechSynthesisUtterance(frase.trim());
      u.lang = voz ? voz.lang : 'es-US';
      if (voz) u.voice = voz;
      u.rate = 0.95;
      u.pitch = 0.8; // un poco más grave
      if (i === frases.length - 1) {
        u.onend = function () { animarIcono(false); };
        u.onerror = function () { animarIcono(false); };
      }
      speechSynthesis.speak(u);
    });
  }

  function callar() {
    const nativo = pluginNativo();
    if (nativo) nativo.stop().catch(function () {});
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    if (boton) animarIcono(false);
  }

  // ---------- textos ----------

  function horaAhora() {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
  }

  const nombreDelDia = new Intl.DateTimeFormat('es', { weekday: 'long', timeZone: 'UTC' });

  function textoDeHoy() {
    const hoy = KodamaFecha.hoy();
    return KodamaResumen.hoy(fuente.bloquesDe(hoy), hoy, horaAhora(), fuente.nombre);
  }

  function textoDeProximos() {
    const hoy = KodamaFecha.hoy();
    const dias = [1, 2, 3].map(function (n) {
      const fecha = KodamaFecha.sumarDias(hoy, n);
      const etiqueta = n === 1 ? 'Mañana' : 'El ' + nombreDelDia.format(new Date(fecha + 'T12:00:00Z'));
      return { fecha: fecha, etiqueta: etiqueta, bloques: fuente.bloquesDe(fecha) };
    });
    const sinDatos = dias.filter(function (d) { return d.bloques === null; });
    const conocidos = dias.filter(function (d) { return d.bloques !== null; });
    let texto = KodamaResumen.proximosDias(conocidos, fuente.nombre);
    if (sinDatos.length) texto += (texto ? ' ' : '') + 'De los demás días todavía no tengo datos.';
    return texto;
  }

  // ---------- pantalla ----------

  function el(etiqueta, clase, texto) {
    const n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto) n.textContent = texto;
    return n;
  }

  function armarDialogo() {
    dialogo = el('dialog', 'resumen');
    dialogo.setAttribute('aria-labelledby', 'resumen-titulo');
    const cabeza = el('div', 'resumen__cabeza');
    const titulo = el('h2', 'resumen__titulo', 'Resumen');
    titulo.id = 'resumen-titulo';
    const cerrar = el('button', 'fantasma resumen__cerrar', '✕');
    cerrar.type = 'button';
    cerrar.setAttribute('aria-label', 'Cerrar');
    cerrar.addEventListener('click', function () { dialogo.close(); });
    cabeza.appendChild(titulo);
    cabeza.appendChild(cerrar);
    parrafo = el('p', 'resumen__texto');
    parrafo.setAttribute('aria-live', 'polite');
    const acciones = el('div', 'resumen__acciones');
    const proximos = el('button', 'resumen__accion', 'Próximos días');
    proximos.type = 'button';
    proximos.addEventListener('click', function () {
      const texto = textoDeProximos();
      parrafo.textContent = texto;
      decir(texto);
    });
    const otraVez = el('button', 'fantasma resumen__accion', 'Hoy otra vez');
    otraVez.type = 'button';
    otraVez.addEventListener('click', abrir);
    const silencio = el('button', 'fantasma resumen__accion', 'Callar');
    silencio.type = 'button';
    silencio.addEventListener('click', callar);
    acciones.appendChild(proximos);
    acciones.appendChild(otraVez);
    acciones.appendChild(silencio);
    dialogo.appendChild(cabeza);
    dialogo.appendChild(parrafo);
    dialogo.appendChild(acciones);
    dialogo.addEventListener('close', callar);
    dialogo.addEventListener('click', function (e) { if (e.target === dialogo) dialogo.close(); });
    document.body.appendChild(dialogo);
  }

  function abrir() {
    if (!dialogo) armarDialogo();
    const texto = textoDeHoy();
    parrafo.textContent = texto;
    if (!dialogo.open) dialogo.showModal();
    decir(texto);
  }

  /** La etiqueta "Resumen" solo tras 5 s encima (mouse o dedo apoyado). */
  function etiquetaDemorada(etiqueta) {
    let reloj = null;
    let mostrada = false;
    function empezar() {
      clearTimeout(reloj);
      reloj = setTimeout(function () { etiqueta.hidden = false; mostrada = true; }, ESPERA_ETIQUETA);
    }
    function terminar() {
      clearTimeout(reloj);
      etiqueta.hidden = true;
    }
    boton.addEventListener('mouseenter', empezar);
    boton.addEventListener('mouseleave', terminar);
    boton.addEventListener('touchstart', empezar, { passive: true });
    boton.addEventListener('touchend', function () { clearTimeout(reloj); setTimeout(terminar, 1500); });
    boton.addEventListener('contextmenu', function (e) { e.preventDefault(); }); // sin menú al mantener
    // Si el dedo se quedó 5 s para ver la etiqueta, soltarlo no abre el resumen.
    boton.addEventListener('click', function (e) {
      if (mostrada) {
        mostrada = false;
        e.stopImmediatePropagation();
      }
    }, true);
  }

  /** opciones: { bloquesDe(fecha) → array o null si no hay datos, nombre(bloque) }. */
  function iniciar(opciones) {
    fuente = opciones;
    const tema = document.querySelector('.cabecera .boton-tema');
    if (!tema) return;
    const grupo = el('span', 'cabecera__acciones');
    tema.parentNode.insertBefore(grupo, tema);
    boton = el('button', 'fantasma resumen-boton');
    boton.type = 'button';
    boton.setAttribute('aria-label', 'Resumen');
    icono = KodamaEspera.cargador();
    icono.setAttribute('class', 'resumen-boton__icono');
    try { icono.pauseAnimations(); } catch (err) { /* sin SMIL */ }
    const etiqueta = el('span', 'resumen-boton__etiqueta', 'Resumen');
    etiqueta.hidden = true;
    etiqueta.setAttribute('aria-hidden', 'true');
    boton.appendChild(icono);
    boton.appendChild(etiqueta);
    boton.addEventListener('click', abrir);
    grupo.appendChild(boton);
    grupo.appendChild(tema);
    etiquetaDemorada(etiqueta);
    // Las voces del navegador llegan tarde la primera vez.
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
  }

  return { iniciar: iniciar, abrir: abrir };
})();
