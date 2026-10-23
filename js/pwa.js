/**
 * Registra el service worker (sw.js) para que KODAMA se pueda instalar en
 * el celular y abrir sin conexión. Solo en https (GitHub Pages) o
 * localhost: en otro origen el navegador no lo permite y no pasa nada.
 *
 * En la APK (Capacitor) no se usa: los archivos ya están dentro de la app
 * y las versiones nuevas llegan con el actualizador (index.html). Un
 * service worker ahí guardaba la versión vieja y la seguía sirviendo
 * después de actualizar; si quedó uno de antes, se quita.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;
  const nativo = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (nativo) {
    navigator.serviceWorker.getRegistrations().then(function (registros) {
      registros.forEach(function (r) { r.unregister(); });
    }).catch(function () {});
    return;
  }
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      if (reg && reg.update) reg.update();
    }).catch(function () {
      // Sin service worker la app funciona igual, solo que no offline.
    });
  });
})();
