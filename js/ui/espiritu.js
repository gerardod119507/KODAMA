/**
 * Bocetos del espíritu del bosque de KODAMA, estado "dormido" (día libre /
 * vista vacía). Dos alternativas para que Gerardo elija una en el
 * Checkpoint 3; los otros 3 estados (tranquilo, atento, contento) se
 * agregan recién cuando haya una elegida.
 *
 * SVG propio, formas simples, sin referencias a diseños de terceros.
 */
const KodamaEspiritu = (function () {
  const dormidoA =
    '<svg viewBox="0 0 160 140" width="120" height="105" role="img" ' +
    'aria-label="Espíritu del bosque durmiendo, boceto A">' +
      '<ellipse cx="80" cy="122" rx="46" ry="8" fill="var(--forest)" opacity="0.12" />' +
      '<path d="M35 60 Q20 38 40 26 Q46 40 52 32 Q56 16 70 24 Q72 8 88 18 ' +
        'Q98 6 106 22 Q120 18 118 36 Q134 40 122 58 ' +
        'Q136 78 118 96 Q124 114 98 118 Q84 128 62 116 ' +
        'Q38 120 32 100 Q16 92 26 76 Q18 66 35 60 Z" ' +
        'fill="var(--forest)" />' +
      '<ellipse cx="78" cy="92" rx="30" ry="22" fill="var(--bone)" opacity="0.9" />' +
      '<path d="M58 26 Q50 10 38 14 Q42 28 52 34 Z" fill="var(--forest)" />' +
      '<path d="M100 20 Q112 6 122 12 Q114 26 104 30 Z" fill="var(--forest)" />' +
      '<path d="M62 84 Q68 79 74 84" stroke="var(--forest)" stroke-width="3" ' +
        'stroke-linecap="round" fill="none" />' +
      '<path d="M86 84 Q92 79 98 84" stroke="var(--forest)" stroke-width="3" ' +
        'stroke-linecap="round" fill="none" />' +
      '<path d="M74 98 Q80 102 86 98" stroke="var(--forest)" stroke-width="2.5" ' +
        'stroke-linecap="round" fill="none" />' +
      '<g fill="var(--bone)">' +
        '<circle cx="128" cy="24" r="2.5" />' +
        '<circle cx="140" cy="34" r="1.6" />' +
        '<path d="M120 40a10 10 0 1 0 10 -14a8 8 0 1 1 -10 14Z" />' +
      '</g>' +
    '</svg>';

  const dormidoB =
    '<svg viewBox="0 0 160 140" width="120" height="105" role="img" ' +
    'aria-label="Espíritu del bosque durmiendo, boceto B">' +
      '<ellipse cx="76" cy="124" rx="48" ry="8" fill="var(--forest)" opacity="0.12" />' +
      '<path d="M52 118 Q28 112 30 88 Q14 78 26 60 Q22 40 44 34 ' +
        'Q52 16 74 22 Q90 8 104 24 Q120 22 118 42 ' +
        'Q128 56 114 68 L96 116 Q80 128 52 118 Z" ' +
        'fill="var(--forest)" />' +
      '<path d="M74 22 Q90 8 104 24 Q116 30 112 46 Q96 42 86 30 Q78 30 74 22 Z" ' +
        'fill="var(--bone)" opacity="0.85" />' +
      '<path d="M84 30 L90 20 M90 34 L98 26 M86 40 L94 34" ' +
        'stroke="var(--forest)" stroke-width="1.4" stroke-linecap="round" opacity="0.5" />' +
      '<path d="M56 86 Q62 81 68 86" stroke="var(--bone)" stroke-width="3" ' +
        'stroke-linecap="round" fill="none" />' +
      '<path d="M78 86 Q84 81 90 86" stroke="var(--bone)" stroke-width="3" ' +
        'stroke-linecap="round" fill="none" />' +
      '<ellipse cx="34" cy="112" rx="14" ry="10" fill="var(--forest)" opacity="0.5" />' +
      '<path d="M38 118 Q46 100 62 104" stroke="var(--forest)" stroke-width="4" ' +
        'stroke-linecap="round" fill="none" opacity="0.6" />' +
      '<g fill="var(--bone)">' +
        '<circle cx="132" cy="26" r="2.5" />' +
        '<circle cx="144" cy="38" r="1.6" />' +
        '<path d="M124 42a10 10 0 1 0 10 -14a8 8 0 1 1 -10 14Z" />' +
      '</g>' +
    '</svg>';

  return { dormidoA: dormidoA, dormidoB: dormidoB };
})();
