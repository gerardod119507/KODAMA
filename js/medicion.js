/**
 * Medición de rendimiento: cuánto tarda de verdad cada cosa en ESTE
 * dispositivo, separando el tiempo de red del tiempo de dibujo. Sin
 * mediciones, optimizar es adivinar.
 *
 * Dos tipos de registro, guardados en el dispositivo (localStorage
 * "kodama.medicion", como mucho MAX registros; los más viejos se borran):
 *
 * - Llamada al backend (los registra KodamaApi.llamar, todas): "red" es
 *   desde que sale el POST hasta tener la respuesta leída; "servidor" es
 *   lo que tardó el código de Apps Script (el campo "ms" de la respuesta).
 *   red − servidor = internet + el arranque de Google.
 * - Operación (apertura, guardar, generar, estadísticas): la página la
 *   abre con empezar() y la cierra con terminar().
 *     · red: el tiempo con al menos una llamada en curso (si hay dos en
 *       paralelo, cuenta el tramo una sola vez), de las llamadas que
 *       empezaron mientras la operación capturaba red (cerrarRed() corta:
 *       así "guardar" no se lleva la recarga de la semana que viene después).
 *     · render: armar la pantalla (render()) + hasta que el navegador la
 *       pintó (pintado()).
 *     · total: de principio a fin. Lo que no es red ni render ("resto") es
 *       cargar la página y sus scripts, o esperar.
 *     · vista (solo apertura): cuándo se vio algo por primera vez (con la
 *       semana guardada en el dispositivo, antes de que llegue la red).
 *   Con desdeNavegacion el reloj empieza cuando el navegador empezó a
 *   abrir la página (performance.now() cuenta desde ahí).
 */
const KodamaMedicion = (function () {
  const CLAVE = 'kodama.medicion';
  const MAX = 300;
  const NOMBRES = {
    apertura: 'Apertura de la app',
    guardar: 'Guardar un bloque',
    generar: 'Generar horario',
    estadisticas: 'Abrir estadísticas',
    llamada: 'Llamada'
  };
  const ORDEN = ['apertura', 'guardar', 'generar', 'estadisticas'];

  const abiertas = [];
  // Al irse de la página, el navegador corta las llamadas en curso: eso no
  // es una falla de la red ni del servidor, así que no se anota.
  let saliendo = false;
  if (typeof addEventListener === 'function') {
    addEventListener('pagehide', function () { saliendo = true; });
    addEventListener('pageshow', function () { saliendo = false; });
  }

  function ahora() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function redondear(ms) {
    return Math.max(0, Math.round(ms));
  }

  function leer() {
    try {
      const lista = JSON.parse(localStorage.getItem(CLAVE));
      return Array.isArray(lista) ? lista : [];
    } catch (err) {
      return [];
    }
  }

  function registrar(entrada) {
    const lista = leer();
    lista.push(Object.assign({ en: Date.now() }, entrada));
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lista.slice(-MAX)));
    } catch (err) {
      // Sin almacenamiento: la medición se pierde, la app sigue igual.
    }
  }

  function borrar() {
    try { localStorage.removeItem(CLAVE); } catch (err) { /* nada que borrar */ }
  }

  /** Se resuelve cuando el navegador ya pintó lo último que se armó. */
  function trasPintar() {
    return new Promise(function (resolver) {
      const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
      if (visible && typeof requestAnimationFrame === 'function') {
        // El callback corre antes del próximo cuadro; el setTimeout, después de pintarlo.
        requestAnimationFrame(function () { setTimeout(resolver, 0); });
      } else {
        setTimeout(resolver, 0); // pestaña oculta: no hay cuadros
      }
    });
  }

  function empezar(tipo, opciones) {
    const o = opciones || {};
    const op = {
      tipo: tipo,
      inicio: o.desdeNavegacion ? 0 : ahora(),
      red: 0,
      servidor: 0,
      render: 0,
      vista: null,
      capturando: true,
      enVuelo: 0,
      redDesde: 0,
      terminada: false
    };
    abiertas.push(op);

    return {
      /** Desde acá, las llamadas nuevas ya no son parte de esta operación. */
      cerrarRed: function () { op.capturando = false; },
      /** Arma la pantalla (función sincrónica) y suma lo que tardó. */
      render: function (fn) {
        const t = ahora();
        try { return fn(); } finally { op.render += ahora() - t; }
      },
      /** Espera a que se pinte y suma esa espera al render. */
      pintado: function () {
        const t = ahora();
        return trasPintar().then(function () { op.render += ahora() - t; });
      },
      /** Anota cuándo se vio algo por primera vez (sin esperar: no demora nada). */
      marcarVista: function () {
        if (op.vista !== null || op.marcando) return;
        op.marcando = true;
        trasPintar().then(function () { if (op.vista === null) op.vista = ahora() - op.inicio; });
      },
      terminar: function (ok) {
        if (op.terminada) return;
        op.terminada = true;
        const fin = ahora();
        if (op.enVuelo > 0) op.red += fin - op.redDesde; // una llamada seguía en curso
        const i = abiertas.indexOf(op);
        if (i !== -1) abiertas.splice(i, 1);
        const total = fin - op.inicio;
        const entrada = {
          tipo: op.tipo,
          ok: ok !== false,
          red: redondear(op.red),
          servidor: redondear(Math.min(op.servidor, op.red)),
          render: redondear(op.render),
          total: redondear(total)
        };
        if (op.tipo === 'apertura') entrada.vista = redondear(op.vista === null ? total : op.vista);
        registrar(entrada);
        return entrada;
      }
    };
  }

  /**
   * KodamaApi.llamar avisa cuando sale un POST y cuando vuelve. Devuelve la
   * función que cierra la llamada: (accion, servidor, ok) → registro.
   */
  function llamada() {
    const t = ahora();
    const ops = abiertas.filter(function (op) { return op.capturando; });
    ops.forEach(function (op) {
      if (op.enVuelo === 0) op.redDesde = t;
      op.enVuelo++;
    });
    return function (accion, servidor, ok) {
      const fin = ahora();
      const tieneServidor = typeof servidor === 'number' && isFinite(servidor);
      ops.forEach(function (op) {
        if (op.terminada) return;
        op.enVuelo--;
        if (op.enVuelo === 0) op.red += fin - op.redDesde;
        if (tieneServidor) op.servidor += servidor;
      });
      if (ok === false && saliendo) return null;
      const entrada = {
        tipo: 'llamada',
        accion: String(accion || ''),
        ok: ok !== false,
        red: redondear(fin - t),
        servidor: tieneServidor ? redondear(servidor) : null
      };
      entrada.total = entrada.red;
      registrar(entrada);
      return entrada;
    };
  }

  function claveDe(m) {
    return m.tipo === 'llamada' ? 'llamada:' + m.accion : m.tipo;
  }

  function nombreDe(m) {
    return m.tipo === 'llamada' ? 'Llamada · ' + m.accion : (NOMBRES[m.tipo] || m.tipo);
  }

  function promedio(valores) {
    return valores.length ? Math.round(valores.reduce(function (a, b) { return a + b; }, 0) / valores.length) : null;
  }

  /**
   * Un resumen por operación (y por acción del backend): cuántas, cuántas
   * fallaron, promedio y peor caso del total, y el promedio de cada parte.
   * Solo las que salieron bien cuentan para los tiempos (una que falló sin
   * red dura lo que tarda en fallar, no lo que tarda en funcionar).
   */
  function resumen(lista) {
    const grupos = {};
    (lista || leer()).forEach(function (m) {
      const clave = claveDe(m);
      if (!grupos[clave]) grupos[clave] = { clave: clave, tipo: m.tipo, nombre: nombreDe(m), todas: [] };
      grupos[clave].todas.push(m);
    });
    return Object.keys(grupos).map(function (clave) {
      const g = grupos[clave];
      const buenas = g.todas.filter(function (m) { return m.ok !== false; });
      const campo = function (nombre) {
        return promedio(buenas.map(function (m) { return m[nombre]; }).filter(function (v) { return typeof v === 'number'; }));
      };
      const total = campo('total');
      const red = campo('red');
      const render = g.tipo === 'llamada' ? null : campo('render');
      return {
        clave: clave,
        tipo: g.tipo,
        nombre: g.nombre,
        n: g.todas.length,
        errores: g.todas.length - buenas.length,
        total: total,
        peor: buenas.length ? Math.max.apply(null, buenas.map(function (m) { return m.total; })) : null,
        red: red,
        servidor: campo('servidor'),
        render: render,
        vista: g.tipo === 'apertura' ? campo('vista') : null,
        // Lo que no es red ni render: cargar la página y sus scripts, o esperar.
        resto: total === null || g.tipo === 'llamada' ? null : Math.max(0, total - (red || 0) - (render || 0))
      };
    }).sort(function (a, b) {
      const ia = ORDEN.indexOf(a.tipo);
      const ib = ORDEN.indexOf(b.tipo);
      if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return b.n - a.n || a.nombre.localeCompare(b.nombre);
    });
  }

  /** Las últimas n mediciones, la más nueva primero. */
  function ultimas(n, lista) {
    return (lista || leer()).slice(-(n || 20)).reverse().map(function (m) {
      return Object.assign({ nombre: nombreDe(m) }, m);
    });
  }

  /** "340 ms", "1,8 s", "12 s". */
  function texto(ms) {
    if (ms === null || ms === undefined) return '—';
    if (ms < 1000) return Math.round(ms) + ' ms';
    const s = ms / 1000;
    return (s < 10 ? s.toFixed(1).replace('.', ',') : String(Math.round(s))) + ' s';
  }

  /** Qué parte del total es cada cosa, en %, para ver dónde se va el tiempo. */
  function porcentaje(parte, total) {
    return parte === null || !total ? null : Math.round(parte / total * 100);
  }

  return {
    empezar: empezar,
    llamada: llamada,
    leer: leer,
    registrar: registrar,
    borrar: borrar,
    resumen: resumen,
    ultimas: ultimas,
    texto: texto,
    porcentaje: porcentaje,
    trasPintar: trasPintar,
    MAX: MAX
  };
})();
