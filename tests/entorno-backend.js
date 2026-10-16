'use strict';

/**
 * Entorno para probar el backend de la app (js/backend/) con Node
 * (Checkpoint 13): carga los archivos reales en un sandbox, con la base
 * falsa de tests/fake-supabase.js en lugar de Supabase, un reloj fijo e
 * ids previsibles.
 *
 * Es el reemplazo de tests/fake-google.js para el backend nuevo: en vez de
 * leer filas de hojas, las pruebas miran las tablas.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { crearBaseFalsa, clonar } = require('./fake-supabase');

const ARCHIVOS = [
  'js/db.js',
  'js/backend/comun.js',
  'js/backend/bloques.js',
  'js/backend/horario.js',
  'js/backend/alumnos.js',
  'js/backend/importar.js',
  'js/backend/pagos.js',
  'js/backend/acciones.js'
];

// Lo que creaba asegurarEstructura() en un Sheet nuevo.
const AREAS = [
  { nombre: 'Universidad', color: '#245A8D', posicion: 0 },
  { nombre: 'Academia Fractal', color: '#8A5A00', posicion: 1 },
  { nombre: 'Startup', color: '#6650A4', posicion: 2 },
  { nombre: 'Personal', color: '#476A54', posicion: 3 }
];
const CURSOS = [
  ['1ro de secundaria', '1ro'], ['2do de secundaria', '2do'], ['3ro de secundaria', '3ro'],
  ['4to de secundaria', '4to'], ['5to de secundaria', '5to'], ['6to de secundaria', '6to'],
  ['1er año universidad', '1er univ'], ['2do año universidad', '2do univ'],
  ['3er año universidad', '3er univ'], ['4to año universidad', '4to univ'],
  ['5to año universidad', '5to univ']
];
const COLEGIOS = [
  ['Unidad Educativa San Agustín', 'SA'],
  ['Colegio Poveda', 'Poveda'],
  ['Universidad Católica Boliviana', 'UCB']
];

/**
 * opciones:
 *   ahora: instante fijo (ISO); por defecto 2026-09-23 10:30 en La Paz.
 *   vacia: true para no sembrar áreas ni catálogos.
 *   idsAlAzar: true para ids al azar (por defecto: 00000001, 00000002…).
 */
function crearEntorno(opciones) {
  const o = opciones || {};
  let instante = new Date(o.ahora || '2026-09-23T14:30:00Z').getTime();
  const base = crearBaseFalsa({ ahora: () => new Date(instante).toISOString() });

  const contexto = { console, crypto: webcrypto, Intl, __base: base.transporte };
  vm.createContext(contexto);
  ARCHIVOS.forEach((archivo) => {
    const codigo = fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
    vm.runInContext(codigo, contexto, { filename: archivo });
  });
  contexto.__instante = () => instante;
  vm.runInContext(
    'KodamaDB.usarTransporte(__base);' +
    'KodamaBackend.reloj = function () { return new Date(__instante()); };',
    contexto
  );
  if (!o.idsAlAzar) {
    let contador = 0;
    contexto.__siguienteHex = () => (++contador).toString(16).padStart(8, '0');
    vm.runInContext('KodamaBackend.aleatorioHex = function () { return __siguienteHex(); };', contexto);
  }

  const KodamaDB = vm.runInContext('KodamaDB', contexto);
  const B = vm.runInContext('KodamaBackend', contexto);

  const entorno = {
    contexto,
    base,
    B,
    /** Una acción como la pide la app: { action, ...parámetros } → { ok, data | error }. */
    async post(cuerpo) {
      return clonar(await B.ejecutar(cuerpo.action, cuerpo));
    },
    /** Llama a una función del backend (KodamaBackend.x) y devuelve su resultado. */
    async llamar(funcion, ...argumentos) {
      return clonar(await B[funcion](...argumentos));
    },
    /** Filas de una tabla como las ve la app (objetos de texto), en su orden. */
    tabla(nombre) {
      const orden = {
        areas: ['posicion', 'orden'], bloques: ['fecha', 'inicio', 'orden']
      }[nombre] || ['orden'];
      const filas = base.filas(nombre).sort((a, b) => {
        for (const c of orden) {
          if (a[c] < b[c]) return -1;
          if (a[c] > b[c]) return 1;
        }
        return 0;
      });
      return clonar(filas.map((f) => KodamaDB.aApp(nombre, f)));
    },
    /** Una fila (formato de la app) por su id. */
    fila(nombre, id) {
      return entorno.tabla(nombre).find((f) => f.id === id);
    },
    /** Mete filas escritas como las ve la app, sin pasar por el backend. */
    sembrar(nombre, objetos) {
      base.sembrar(nombre, objetos.map((objeto) => clonar(KodamaDB.aBase(nombre, objeto))));
    },
    /** Cambia el reloj (ISO). */
    fijarAhora(iso) {
      instante = new Date(iso).getTime();
    },
    peticiones: () => base.peticiones(),
    olvidarPeticiones: () => base.olvidarPeticiones()
  };

  if (!o.vacia) {
    base.sembrar('areas', AREAS);
    base.sembrar('cursos', CURSOS.map(([nombre, corto]) => ({ nombre, corto })));
    base.sembrar('colegios', COLEGIOS.map(([nombre, corto]) => ({ nombre, corto })));
  }
  return entorno;
}

/** Un bloque válido de ejemplo (formato de la app), con lo que se pase encima. */
function bloque(extra) {
  return Object.assign({
    titulo: 'Reunión con Ana', area: 'Startup', tipo: 'reunión', fecha: '2026-09-24',
    inicio: '15:00', fin: '16:00', etiqueta: '', notas: ''
  }, extra || {});
}

/** Una regla válida de ejemplo. */
function regla(extra) {
  return Object.assign({
    titulo: 'Cálculo II', area: 'Universidad', dias: 'Lun, Mié', inicio: '09:00', fin: '10:30',
    desde: '2026-09-23', hasta: '2026-10-07', etiqueta: '', notas: ''
  }, extra || {});
}

module.exports = { crearEntorno, bloque, regla };
