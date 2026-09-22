/**
 * Íconos de tipo de bloque. La forma distingue el tipo (fijo/variable/
 * reunión); el color lo pone quien los usa (currentColor), normalmente el
 * color del área. Así área y tipo quedan codificados por dos canales
 * distintos, nunca solo por color.
 */
const KodamaIconos = (function () {
  const FORMAS = {
    fijo: '<rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" />',
    variable: '<circle cx="10" cy="10" r="6" fill="currentColor" />',
    reunion: '<path d="M10 3 L17 16 L3 16 Z" fill="currentColor" />'
  };

  function svgTipo(tipo) {
    const forma = FORMAS[tipo] || FORMAS.variable;
    return '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">' + forma + '</svg>';
  }

  return { svgTipo: svgTipo };
})();
