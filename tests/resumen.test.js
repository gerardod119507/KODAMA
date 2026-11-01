'use strict';

/**
 * El resumen del día (js/resumen.js): qué dice según la hora, sin
 * canceladas, el hueco libre, lo próximo y los días que siguen.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js/resumen.js'), 'utf8') + ';this.R = KodamaResumen;', ctx);
const R = ctx.R;

const F = '2026-11-02';
const b = (inicio, fin, titulo, extra) => Object.assign({ fecha: F, inicio, fin, titulo, archivado: '', estado: '' }, extra);

test('la hora como se dice', () => {
  assert.strictEqual(R.hora('08:00'), 'las 8');
  assert.strictEqual(R.hora('13:30'), 'las 13:30');
  assert.strictEqual(R.hora('01:15'), 'la 1:15');
});

test('día libre y día terminado', () => {
  assert.match(R.hoy([], F, '07:00'), /^Buenos días\. Hoy tienes el día libre\.$/);
  assert.match(R.hoy([b('08:00', '09:00', 'Cálculo')], F, '20:00'), /Buenas noches\. Por hoy ya terminaste/);
});

test('lo que queda, en orden, con lugar, hueco libre y sin canceladas', () => {
  const texto = R.hoy([
    b('15:00', '16:30', 'Clase con Ana'),
    b('08:00', '09:30', 'Cálculo', { lugar: 'Aula E511' }),
    b('11:00', '12:00', 'Reunión', { estado: 'cancelada' }),
    b('18:00', '19:00', 'Nerak')
  ], F, '07:30');
  assert.strictEqual(texto,
    'Buenos días. Hoy te quedan 3 cosas: a las 8, Cálculo en Aula E511; a las 15, Clase con Ana; y a las 18, Nerak. ' +
    'Lo próximo empieza en 30 minutos. Tienes 5 horas y 30 minutos libres entre las 9:30 y las 15.');
});

test('lo que está en curso', () => {
  const texto = R.hoy([b('14:00', '16:00', 'Física'), b('16:00', '17:00', 'Química')], F, '15:00');
  assert.match(texto, /Ahora mismo estás en Física, hasta las 16\. Después te queda 1 cosa: a las 16, Química\./);
});

test('usa el nombre que se ve (con los alumnos)', () => {
  const texto = R.hoy([b('10:00', '11:00', '', { alumno_id: 'a1' })], F, '09:00', () => 'Agustín Aliendre');
  assert.match(texto, /a las 10, Agustín Aliendre/);
});

test('próximos días', () => {
  const texto = R.proximosDias([
    { fecha: '2026-11-03', etiqueta: 'Mañana', bloques: [b('09:00', '10:00', 'Física', { fecha: '2026-11-03' }), b('07:00', '08:00', 'Cálculo', { fecha: '2026-11-03' })] },
    { fecha: '2026-11-04', etiqueta: 'El miércoles', bloques: [] }
  ]);
  assert.strictEqual(texto, 'Mañana tienes 2 cosas; la primera a las 7, Cálculo. El miércoles no tienes nada.');
});
