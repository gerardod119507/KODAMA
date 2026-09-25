/**
 * Service worker de KODAMA (Checkpoint 9).
 *
 * - Guarda los archivos de la app (páginas, estilos, scripts, íconos) para
 *   que abra sin conexión. Los DATOS no pasan por acá: las llamadas al Web
 *   App son POST a otro dominio y se dejan pasar sin tocar; lo último
 *   cargado ya queda en el dispositivo (caché por semana, alumnos,
 *   plantillas) y se muestra con el aviso "Sin conexión".
 * - Estrategia "lo guardado primero, y se actualiza por detrás": abre al
 *   instante con lo que tiene y, si hay red, descarga la versión nueva para
 *   la próxima vez. Por eso, después de un despliegue, la app nueva se ve
 *   al abrirla por SEGUNDA vez.
 * - VERSION solo hay que cambiarla si cambia la LISTA de archivos (una
 *   pantalla o script nuevo); tests/pwa.test.js avisa si falta alguno.
 */
const VERSION = 'kodama-v3';
const ARCHIVOS = [
  './',
  './index.html',
  './horario.html',
  './alumnos.html',
  './config.html',
  './cobros.html',
  './estadisticas.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/tema.js',
  './js/lorenz.js',
  './js/ui/carga.js',
  './js/pwa.js',
  './js/fecha.js',
  './js/api.js',
  './js/state.js',
  './js/capas.js',
  './js/alumnos.js',
  './js/clases.js',
  './js/formas.js',
  './js/plantillas.js',
  './js/vista.js',
  './js/app.js',
  './js/horario.js',
  './js/config.js',
  './js/importar.js',
  './js/alumnos-pagina.js',
  './js/estadisticas.js',
  './js/estadisticas-pagina.js',
  './js/cobros.js',
  './js/cobros-pagina.js',
  './js/ui/iconos.js',
  './js/ui/espiritu.js',
  './js/ui/dia.js',
  './js/ui/semana.js',
  './js/ui/selector-alumnos.js',
  './js/ui/horas.js',
  './js/ui/dias.js',
  './js/ui/formulario.js',
  './js/ui/ficha.js',
  './js/ui/graficas.js',
  './icons/icono.svg',
  './icons/icono-grande.svg',
  './icons/simbolo.svg',
  './icons/simbolo-chico.svg',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/icono-48.png',
  './icons/icono-192.png',
  './icons/icono-512.png',
  './icons/icono-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(ARCHIVOS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (c) { return c !== VERSION; }).map(function (c) { return caches.delete(c); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (evento) {
  const pedido = evento.request;
  // Solo archivos de la app: nada de POST ni de otros dominios (el Web App).
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;

  evento.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(pedido, { ignoreSearch: true }).then(function (guardado) {
      const deRed = fetch(pedido).then(function (respuesta) {
        if (respuesta && respuesta.ok) cache.put(pedido, respuesta.clone());
        return respuesta;
      }).catch(function () {
        // Sin red: una página que no estaba guardada abre la vista principal.
        return guardado || (pedido.mode === 'navigate' ? cache.match('./index.html') : undefined);
      });
      return guardado || deRed;
    });
  }));
});
