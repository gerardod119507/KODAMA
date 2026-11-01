/**
 * Actualizador de la APK (@capgo/capacitor-updater, modo manual).
 *
 * Problema que arregla (noviembre 2026): antes se anotaba en localStorage
 * "ya bajé la versión X" apenas se PEDÍA aplicarla (updater.next), aunque
 * nunca llegara a aplicarse. Como la APK siempre tiene el mismo número de
 * versión nativo, al reinstalarla el plugin seguía cargando un paquete
 * viejo, y la app creía estar al día: los cambios no llegaban nunca.
 *
 * Ahora:
 * - La versión que de verdad está corriendo se lee del propio paquete
 *   (version.json, que pages.yml pone dentro del bundle.zip). La de la APK
 *   recién instalada no lo trae: cuenta como "desconocida" y se actualiza.
 * - Si la publicada es otra, se baja (o se reusa si ya estaba bajada) y se
 *   aplica con set(), que recarga la app con la versión nueva:
 *     · al irse a segundo plano (cambias de app o la cierras), o
 *     · si tocas "Actualizar" en el aviso de abajo.
 *   Nunca en medio de la animación de arranque.
 * - Solo corre en la APK; en el navegador actualiza el service worker.
 */
(function () {
  const BASE = 'https://gerardod119507.github.io/KODAMA/';

  function plugin() {
    return window.CapacitorUpdater ||
      (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorUpdater) || null;
  }

  const updater = plugin();
  if (!updater) return;
  if (updater.notifyAppReady) updater.notifyAppReady().catch(function () {});

  async function versionDe(url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      const datos = await r.json();
      return datos && datos.version ? String(datos.version) : null;
    } catch (err) {
      return null;
    }
  }

  /** Un paquete ya bajado con esa versión (para no bajarlo dos veces). */
  async function yaBajado(version) {
    if (!updater.list) return null;
    try {
      const r = await updater.list();
      const lista = (r && r.bundles) || [];
      return lista.find(function (b) { return b.version === version && b.status !== 'error'; }) || null;
    } catch (err) {
      return null;
    }
  }

  let pendiente = null;

  function aplicar() {
    if (!pendiente) return;
    const id = pendiente.id;
    pendiente = null;
    updater.set({ id: id }).catch(function () {});
  }

  async function revisar() {
    if (!navigator.onLine || !updater.download || !updater.set) return;
    const [actual, publicada] = await Promise.all([
      versionDe('version.json'),
      versionDe(BASE + 'version.json?t=' + Date.now())
    ]);
    if (!publicada || publicada === actual) return;
    let bundle = await yaBajado(publicada);
    if (!bundle) {
      bundle = await updater.download({ url: BASE + 'bundle.zip?t=' + Date.now(), version: publicada });
    }
    if (!bundle || !bundle.id) return;
    pendiente = bundle;
    if (updater.next) updater.next({ id: bundle.id }).catch(function () {}); // por si se cierra de golpe
    if (typeof KodamaEspera !== 'undefined') {
      KodamaEspera.ofrecer('Hay una versión nueva', 'Actualizar', aplicar, 12000);
    }
  }

  // Al irse a segundo plano se aplica sola: al volver, ya está la nueva.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') aplicar();
  });

  // Después de la animación de arranque (dura ~5 s), para no cortarla.
  window.addEventListener('load', function () {
    setTimeout(function () {
      revisar().catch(function (err) { console.warn('[KODAMA] actualizador:', err); });
    }, 6000);
  });
})();
