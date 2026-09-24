/**
 * Registra el service worker (sw.js) para que KODAMA se pueda instalar en
 * el celular y abrir sin conexión. Solo en https (GitHub Pages) o
 * localhost: en otro origen el navegador no lo permite y no pasa nada.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {
      // Sin service worker la app funciona igual, solo que no offline.
    });
  });
})();
