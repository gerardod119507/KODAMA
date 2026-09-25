'use strict';

/**
 * Checkpoint 9: contraste WCAG AA de la paleta, en tema claro Y oscuro,
 * leído de css/styles.css (si alguien cambia un color, esto lo frena).
 * - Texto: al menos 4.5:1.
 * - Elementos gráficos (barras de área, íconos, bordes de "ocupado"): 3:1.
 * - Texto atenuado con opacity: ninguna por debajo de 0.75 (con 0.7 ya no
 *   llega a 4.5:1 en claro).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

function bloque(selector) {
  const inicio = css.indexOf(selector + ' {');
  assert.ok(inicio !== -1, 'no encuentro ' + selector);
  return css.slice(inicio, css.indexOf('\n}', inicio));
}

function variables(texto) {
  const v = {};
  for (const m of texto.matchAll(/--([\w-]+):\s*([^;]+);/g)) v[m[1]] = m[2].trim();
  return v;
}

const CLARO = variables(bloque(':root'));
const OSCURO = Object.assign({}, CLARO, variables(bloque('[data-theme="dark"]')));

function color(tema, nombre) {
  let valor = tema[nombre];
  for (let i = 0; i < 5 && /^var\(/.test(valor); i++) valor = tema[/var\(--([\w-]+)\)/.exec(valor)[1]];
  assert.match(valor, /^#[0-9A-Fa-f]{6}$/, nombre + ' debería ser un color #RRGGBB, es ' + valor);
  return [1, 3, 5].map((i) => parseInt(valor.slice(i, i + 2), 16));
}

function luminancia(c) {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function mezclar(frente, fondo, alfa) {
  return frente.map((v, i) => Math.round(v * alfa + fondo[i] * (1 - alfa)));
}

const TEMAS = [['claro', CLARO], ['oscuro', OSCURO]];

test('texto principal sobre el fondo y sobre los diálogos: 4.5:1 o más', () => {
  TEMAS.forEach(([nombre, t]) => {
    assert.ok(contraste(color(t, 'fg'), color(t, 'bg')) >= 4.5, nombre + ': fg/bg');
    assert.ok(contraste(color(t, 'fg'), color(t, 'fondo-dialogo')) >= 4.5, nombre + ': fg/diálogo');
    assert.ok(contraste(color(t, 'acento-texto'), color(t, 'acento-fondo')) >= 4.5, nombre + ': botón principal');
  });
});

test('los errores (color de reunión) se leen: 4.5:1 sobre el fondo y sobre los diálogos', () => {
  TEMAS.forEach(([nombre, t]) => {
    assert.ok(contraste(color(t, 'tipo-reunion'), color(t, 'bg')) >= 4.5, nombre + ': tipo-reunion/bg');
    assert.ok(contraste(color(t, 'tipo-reunion'), color(t, 'fondo-dialogo')) >= 4.5, nombre + ': tipo-reunion/diálogo');
  });
});

test('colores de área y la barra de "ocupado": 3:1 o más como elemento gráfico', () => {
  TEMAS.forEach(([nombre, t]) => {
    ['area-universidad', 'area-fractal', 'area-startup', 'area-personal', 'ocupado-barra'].forEach((c) => {
      const r = contraste(color(t, c), color(t, 'bg'));
      assert.ok(r >= 3, nombre + ': ' + c + ' da ' + r.toFixed(2));
    });
  });
});

test('ningún texto atenuado baja de opacity 0.75 (y con 0.75 sigue en 4.5:1)', () => {
  const sinAnimaciones = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const opacidades = [...sinAnimaciones.matchAll(/opacity:\s*(0?\.\d+)/g)].map((m) => Number(m[1])).filter((o) => o > 0);
  const minima = Math.min.apply(null, opacidades);
  assert.ok(minima >= 0.75, 'hay una opacity de ' + minima);
  TEMAS.forEach(([nombre, t]) => {
    const atenuado = mezclar(color(t, 'fg'), color(t, 'bg'), minima);
    assert.ok(contraste(atenuado, color(t, 'bg')) >= 4.5, nombre + ': texto a ' + minima);
  });
});

test('el sello de agua es tan tenue que el texto encima sigue en 4.5:1 (y nunca más de 8 %)', () => {
  TEMAS.forEach(([nombre, t]) => {
    const opacidad = Number(t['sello-opacidad']);
    assert.ok(opacidad > 0 && opacidad <= 0.08, nombre + ': sello a ' + opacidad);
    const fondoConSello = mezclar(color(t, 'fg'), color(t, 'bg'), opacidad);
    ['fg', 'tipo-reunion'].forEach((c) => {
      const r = contraste(color(t, c), fondoConSello);
      assert.ok(r >= 4.5, nombre + ': ' + c + ' sobre el sello da ' + r.toFixed(2));
    });
  });
});
