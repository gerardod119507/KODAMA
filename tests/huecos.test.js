'use strict';

/**
 * Ajustes de la vista de semana: rango de días elegible, huecos que se
 * colapsan en el celular (con alturas proporcionales) y el borde que marca
 * una superposición real.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function cargarModulos(archivos) {
  const almacen = {};
  const entorno = {
    console,
    Intl,
    localStorage: {
      getItem: (clave) => (clave in almacen ? almacen[clave] : null),
      setItem: (clave, valor) => { almacen[clave] = String(valor); },
      removeItem: (clave) => { delete almacen[clave]; }
    }
  };
  vm.createContext(entorno);
  archivos.forEach((archivo) => {
    const ruta = path.join(__dirname, '..', archivo);
    vm.runInContext(fs.readFileSync(ruta, 'utf8'), entorno, { filename: archivo });
  });
  return {
    ejecutar(expresion, argumento) {
      entorno.__arg = argumento === undefined ? undefined : JSON.parse(JSON.stringify(argumento));
      const resultado = vm.runInContext(expresion, entorno);
      return resultado === undefined ? undefined : JSON.parse(JSON.stringify(resultado));
    }
  };
}

const MODULOS_SEMANA = ['js/fecha.js', 'js/clases.js', 'js/ui/iconos.js', 'js/ui/espiritu.js', 'js/ui/dia.js', 'js/ui/semana.js'];
const SEMANA = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
const FRANJA = { desde: 6 * 60 + 30, hasta: 21 * 60 };
const min = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function b(fecha, inicio, fin, extra) {
  return Object.assign({ id: fecha + inicio, fecha, inicio, fin, titulo: 'x', area: 'Universidad', tipo: 'fijo' }, extra || {});
}

// ---------------------------------------------------------------
// Rango de días
// ---------------------------------------------------------------

test('por defecto se ven los 7 días, de lunes a domingo', () => {
  const env = cargarModulos(['js/vista.js']);
  const dias = env.ejecutar('KodamaVista.diasVisibles(__arg, KodamaVista.rangoCompleto())', SEMANA);
  assert.deepStrictEqual(dias, SEMANA);
});

test('elegir del jueves al sábado deja solo esos 3 días', () => {
  const env = cargarModulos(['js/vista.js']);
  const dias = env.ejecutar('KodamaVista.diasVisibles(__arg, { desde: 3, hasta: 5 })', SEMANA);
  assert.deepStrictEqual(dias, ['2026-09-24', '2026-09-25', '2026-09-26']);
});

test('si un extremo cruza al otro, el otro lo acompaña (nunca un rango vacío)', () => {
  const env = cargarModulos(['js/vista.js']);
  assert.deepStrictEqual(env.ejecutar('KodamaVista.ajustarRango({ desde: 0, hasta: 3 }, "desde", 5)'), { desde: 5, hasta: 5 });
  assert.deepStrictEqual(env.ejecutar('KodamaVista.ajustarRango({ desde: 4, hasta: 6 }, "hasta", 1)'), { desde: 1, hasta: 1 });
  assert.deepStrictEqual(env.ejecutar('KodamaVista.ajustarRango({ desde: 0, hasta: 6 }, "desde", "3")'), { desde: 3, hasta: 6 });
});

// ---------------------------------------------------------------
// Huecos que se colapsan (celular)
// ---------------------------------------------------------------

test('un hueco de más de 2 h libre en todos los días se colapsa; uno de 2 h justas no', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const bloques = [
    b(SEMANA[0], '06:45', '08:15'),
    b(SEMANA[0], '10:15', '12:00'), // 08:15–10:15: 2 h justas → no se colapsa
    b(SEMANA[1], '19:30', '21:00') // 12:00–19:30 libre en ambos días → sí
  ];
  const huecos = env.ejecutar('KodamaSemana.calcularHuecos(__arg.bloques, __arg.franja)', { bloques, franja: FRANJA });
  assert.deepStrictEqual(huecos, [{ desde: min('12:00'), hasta: min('19:30') }]);
});

test('una franja no se colapsa si en algún día visible hay algo', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const bloques = [
    b(SEMANA[0], '06:45', '08:00'),
    b(SEMANA[3], '14:00', '15:00'), // solo el jueves tiene algo a la tarde
    b(SEMANA[5], '20:00', '21:00')
  ];
  const huecos = env.ejecutar('KodamaSemana.calcularHuecos(__arg.bloques, __arg.franja)', { bloques, franja: FRANJA });
  assert.deepStrictEqual(huecos, [
    { desde: min('08:00'), hasta: min('14:00') },
    { desde: min('15:00'), hasta: min('20:00') }
  ]);
});

test('una semana vacía es un solo hueco grande', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const huecos = env.ejecutar('KodamaSemana.calcularHuecos([], __arg)', FRANJA);
  assert.deepStrictEqual(huecos, [{ desde: FRANJA.desde, hasta: FRANJA.hasta }]);
});

test('se colapsa el hueco menos 30 min a cada lado, para no tapar bloques cortos', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const tramo = env.ejecutar('KodamaSemana.tramoColapsado(__arg)', { desde: min('12:00'), hasta: min('15:00') });
  assert.deepStrictEqual(tramo, {
    desde: min('12:30'), hasta: min('14:30'), libre: { desde: min('12:00'), hasta: min('15:00') }
  });
});

test('con huecos colapsados, las alturas siguen siendo proporcionales a la duración', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const medidas = env.ejecutar(`(function () {
    const e = KodamaSemana.crearEscala(__arg.franja, __arg.colapsados);
    const alto = (i, f) => e.y(f) - e.y(i);
    return {
      claseDe1h: alto(${min('07:00')}, ${min('08:00')}),
      claseDe2h: alto(${min('19:00')}, ${min('21:00')}),
      hueco: alto(${min('08:00')}, ${min('19:00')}),
      total: e.total
    };
  })()`, { franja: FRANJA, colapsados: [{ desde: min('08:00'), hasta: min('19:00') }] });

  assert.strictEqual(medidas.claseDe1h, 60, 'antes del hueco, 1 h mide 60 minutos de pantalla');
  assert.strictEqual(medidas.claseDe2h, 120, 'después del hueco, 2 h miden el doble');
  assert.strictEqual(medidas.hueco, env.ejecutar('KodamaSemana.ALTO_HUECO'), 'el hueco mide lo mismo sin importar cuánto dure');
  assert.strictEqual(medidas.total, (FRANJA.hasta - FRANJA.desde) - 11 * 60 + env.ejecutar('KodamaSemana.ALTO_HUECO'));
});

test('sin huecos colapsados (escritorio), la escala es la de siempre', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const r = env.ejecutar(`(function () {
    const e = KodamaSemana.crearEscala(__arg, []);
    return [e.y(${min('06:30')}), e.y(${min('09:00')}), e.total];
  })()`, FRANJA);
  assert.deepStrictEqual(r, [0, 150, FRANJA.hasta - FRANJA.desde]);
});

// ---------------------------------------------------------------
// Superposición real → borde con el color de reunión
// ---------------------------------------------------------------

test('solo se marcan los bloques que se pisan de verdad, el mismo día', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const ids = env.ejecutar('KodamaDia.idsSolapados(__arg).sort()', [
    b(SEMANA[0], '09:00', '10:00', { id: 'A' }),
    b(SEMANA[0], '09:30', '10:30', { id: 'B' }), // se pisa con A
    b(SEMANA[0], '10:30', '11:00', { id: 'C' }), // empieza justo cuando termina B: no
    b(SEMANA[1], '09:15', '09:45', { id: 'D' }) // misma hora que A, otro día: no
  ]);
  assert.deepStrictEqual(ids, ['A', 'B']);
});

test('una clase cancelada no se pisa con nada (su horario quedó libre)', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const ids = env.ejecutar('KodamaDia.idsSolapados(__arg).sort()', [
    b(SEMANA[0], '09:00', '10:00', { id: 'A' }),
    b(SEMANA[0], '09:30', '10:30', { id: 'B', estado: 'cancelada' }),
    b(SEMANA[0], '09:45', '10:15', { id: 'C', estado: 'dictada' })
  ]);
  assert.deepStrictEqual(ids, ['A', 'C']);
});

test('una cadena A–B–C marca a los tres solo si se pisan de a pares', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const ids = env.ejecutar('KodamaDia.idsSolapados(__arg).sort()', [
    b(SEMANA[0], '09:00', '10:00', { id: 'A' }),
    b(SEMANA[0], '09:30', '11:00', { id: 'B' }),
    b(SEMANA[0], '10:30', '12:00', { id: 'C' })
  ]);
  assert.deepStrictEqual(ids, ['A', 'B', 'C']);
});

test('la vista de día (un solo día) colapsa sus propios huecos de más de 2 h', () => {
  const env = cargarModulos(MODULOS_SEMANA);
  const huecos = env.ejecutar('KodamaSemana.calcularHuecos(__arg.bloques, __arg.franja)', {
    franja: FRANJA,
    bloques: [b(SEMANA[2], '06:45', '08:15'), b(SEMANA[2], '09:00', '12:00'), b(SEMANA[2], '19:30', '21:00')]
  });
  assert.deepStrictEqual(huecos, [{ desde: min('12:00'), hasta: min('19:30') }]);
});
