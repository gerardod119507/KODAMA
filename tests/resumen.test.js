'use strict';

/**
 * El resumen del día (js/resumen.js): escrito para escucharse — números en
 * palabras, horas como se dicen, frases y no listas — sin canceladas, con
 * el hueco libre, lo próximo y los días que siguen.
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
  assert.strictEqual(R.hora('08:00'), 'las ocho de la mañana');
  assert.strictEqual(R.hora('13:30'), 'la una y media de la tarde');
  assert.strictEqual(R.hora('12:00'), 'las doce del mediodía');
  assert.strictEqual(R.hora('15:45'), 'las cuatro menos cuarto de la tarde');
  assert.strictEqual(R.hora('21:10'), 'las nueve y diez de la noche');
  assert.strictEqual(R.hora('16:15', false), 'las cuatro y cuarto');
});

test('duraciones en palabras', () => {
  assert.strictEqual(R.duracion(30), 'media hora');
  assert.strictEqual(R.duracion(25), 'veinticinco minutos');
  assert.strictEqual(R.duracion(60), 'una hora');
  assert.strictEqual(R.duracion(330), 'cinco horas y media');
});

test('nunca cifras: la voz leería "uno cosa"', () => {
  const texto = R.hoy([b('13:00', '14:00', 'Física'), b('21:00', '22:00', 'Repaso')], F, '07:00');
  assert.doesNotMatch(texto, /\d/);
});

test('día libre y día terminado', () => {
  assert.strictEqual(R.hoy([], F, '07:00'), 'Buenos días. Hoy no tienes nada agendado. Día libre.');
  assert.match(R.hoy([b('08:00', '09:00', 'Cálculo')], F, '20:00'), /Buenas noches\. Por hoy ya terminaste todo/);
});

test('el día en frases, con lugar, hueco libre y sin canceladas', () => {
  const texto = R.hoy([
    b('15:00', '16:30', 'Clase con Ana'),
    b('08:00', '09:30', 'Cálculo', { lugar: 'Aula E511' }),
    b('11:00', '12:00', 'Reunión', { estado: 'cancelada' }),
    b('18:00', '19:00', 'Nerak')
  ], F, '07:30');
  assert.strictEqual(texto,
    'Buenos días. Hoy te quedan tres cosas. Empiezas a las ocho de la mañana con Cálculo, en Aula E511. ' +
    'Después, a las tres de la tarde, Clase con Ana. Y cierras el día a las seis de la tarde con Nerak. ' +
    'Lo primero empieza en media hora. Entre las nueve y media y las tres tienes cinco horas y media libres.');
});

test('una sola cosa', () => {
  const texto = R.hoy([b('23:00', '23:30', 'Repaso de macro', { lugar: 'casa' })], F, '22:32');
  assert.strictEqual(texto,
    'Buenas noches. Hoy te queda una sola cosa. Es Repaso de macro, a las once de la noche, en casa. ' +
    'Lo primero empieza en veintiocho minutos.');
});

test('lo que está en curso', () => {
  const texto = R.hoy([b('14:00', '16:00', 'Física'), b('16:00', '17:00', 'Química')], F, '15:00');
  assert.match(texto, /Ahora estás en Física, hasta las cuatro\. Después, a las cuatro de la tarde, tienes Química\./);
});

test('usa el nombre que se ve (con los alumnos)', () => {
  const texto = R.hoy([b('10:00', '11:00', '', { alumno_id: 'a1' })], F, '09:00', () => 'Agustín Aliendre');
  assert.match(texto, /Es Agustín Aliendre, a las diez de la mañana\./);
});

test('próximos días', () => {
  const texto = R.proximosDias([
    { fecha: '2026-11-03', etiqueta: 'Mañana', bloques: [b('09:00', '10:00', 'Física', { fecha: '2026-11-03' }), b('07:00', '08:00', 'Cálculo', { fecha: '2026-11-03' })] },
    { fecha: '2026-11-04', etiqueta: 'El miércoles', bloques: [] },
    { fecha: '2026-11-05', etiqueta: 'El jueves', bloques: [b('13:00', '14:00', 'Nerak', { fecha: '2026-11-05' })] }
  ]);
  assert.strictEqual(texto,
    'Mañana tienes dos cosas; empiezas a las siete de la mañana con Cálculo. El miércoles lo tienes libre. ' +
    'El jueves solo tienes Nerak, a la una de la tarde.');
});
