/**
 * El espíritu del bosque de KODAMA, estado "dormido" (día libre / vista
 * vacía). Hasta el Checkpoint 13 había dos bocetos (A y B) para comparar;
 * quedó el A, el que ya se mostraba solo.
 *
 * SVG propio, formas simples, sin referencias a diseños de terceros.
 */
const KodamaEspiritu = (function () {
  const dormidoA =
    '<svg viewBox="0 0 160 140" width="120" height="105" role="img" ' +
    'aria-label="Espíritu del bosque durmiendo">' +
      '<ellipse cx="80" cy="122" rx="46" ry="8" fill="var(--fg)" opacity="0.12" />' +
      '<path d="M35 60 Q20 38 40 26 Q46 40 52 32 Q56 16 70 24 Q72 8 88 18 ' +
        'Q98 6 106 22 Q120 18 118 36 Q134 40 122 58 ' +
        'Q136 78 118 96 Q124 114 98 118 Q84 128 62 116 ' +
        'Q38 120 32 100 Q16 92 26 76 Q18 66 35 60 Z" ' +
        'fill="var(--fg)" />' +
      '<ellipse cx="78" cy="92" rx="30" ry="22" fill="var(--bg)" opacity="0.9" />' +
      '<path d="M58 26 Q50 10 38 14 Q42 28 52 34 Z" fill="var(--fg)" />' +
      '<path d="M100 20 Q112 6 122 12 Q114 26 104 30 Z" fill="var(--fg)" />' +
      '<path d="M62 84 Q68 79 74 84" stroke="var(--fg)" stroke-width="3" ' +
        'stroke-linecap="round" fill="none" />' +
      '<path d="M86 84 Q92 79 98 84" stroke="var(--fg)" stroke-width="3" ' +
        'stroke-linecap="round" fill="none" />' +
      '<path d="M74 98 Q80 102 86 98" stroke="var(--fg)" stroke-width="2.5" ' +
        'stroke-linecap="round" fill="none" />' +
      '<g fill="var(--bg)">' +
        '<circle cx="128" cy="24" r="2.5" />' +
        '<circle cx="140" cy="34" r="1.6" />' +
        '<path d="M120 40a10 10 0 1 0 10 -14a8 8 0 1 1 -10 14Z" />' +
      '</g>' +
    '</svg>';

  return { dormidoA: dormidoA };
})();
