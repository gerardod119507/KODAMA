'use strict';

/**
 * Entorno falso de Google Apps Script para poder probar apps-script/*.gs
 * con Node, sin instalar nada y sin tocar un Sheet real.
 *
 * Imita a propósito las partes estrictas de la API de Sheets (rangos con
 * dimensiones inválidas, setValues con dimensiones que no coinciden), para
 * que un error que rompería en producción también rompa acá.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CARPETA_GS = path.join(__dirname, '..', 'apps-script');
const ARCHIVOS_GS = ['Code.gs', 'Bloques.gs', 'Horario.gs', 'Alumnos.gs', 'Importar.gs', 'Auditoria.gs', 'Setup.gs', 'Pagos.gs'];

const FILAS_POR_DEFECTO = 1000;

function texto(valor) {
  return valor == null ? '' : String(valor);
}

/**
 * Los objetos creados dentro del sandbox pertenecen a otro "realm" de
 * JavaScript: su prototipo no es el mismo que el del test, así que
 * assert.deepStrictEqual los rechaza aunque el contenido sea idéntico.
 * Clonarlos acá los devuelve al realm del test y evita que cada prueba
 * tenga que acordarse de este detalle.
 */
function clonar(valor) {
  return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
}

class FakeRango {
  constructor(hoja, fila, columna, numFilas, numColumnas) {
    if (numFilas < 1 || numColumnas < 1) {
      throw new Error(
        'Rango inválido: filas=' + numFilas + ', columnas=' + numColumnas +
        ' (Sheets exige al menos 1 de cada una)'
      );
    }
    this.hoja = hoja;
    this.fila = fila;
    this.columna = columna;
    this.numFilas = numFilas;
    this.numColumnas = numColumnas;
  }

  setValues(valores) {
    if (valores.length !== this.numFilas) {
      throw new Error('setValues: se esperaban ' + this.numFilas + ' filas, llegaron ' + valores.length);
    }
    valores.forEach((fila, i) => {
      if (fila.length !== this.numColumnas) {
        throw new Error(
          'setValues: se esperaban ' + this.numColumnas + ' columnas, llegaron ' +
          fila.length + ' en la fila ' + (i + 1)
        );
      }
      fila.forEach((valor, j) => {
        this.hoja._escribir(this.fila - 1 + i, this.columna - 1 + j, valor);
      });
    });
    return this;
  }

  setValue(valor) {
    this.hoja._escribir(this.fila - 1, this.columna - 1, valor);
    return this;
  }

  getDisplayValues() {
    // Contador para las pruebas de velocidad: cuántas celdas se leyeron.
    this.hoja.celdasLeidas += this.numFilas * this.numColumnas;
    const resultado = [];
    for (let i = 0; i < this.numFilas; i++) {
      const fila = [];
      for (let j = 0; j < this.numColumnas; j++) {
        const celda = (this.hoja.celdas[this.fila - 1 + i] || [])[this.columna - 1 + j];
        fila.push(texto(celda));
      }
      resultado.push(fila);
    }
    return resultado;
  }

  setNumberFormat(formato) {
    for (let i = 0; i < this.numFilas; i++) {
      for (let j = 0; j < this.numColumnas; j++) {
        this.hoja.formatos[(this.fila - 1 + i) + ',' + (this.columna - 1 + j)] = formato;
      }
    }
    return this;
  }

  /** Como Range.sort de Sheets con [{ column, ascending }] (columnas absolutas). */
  sort(criterios) {
    const filas = [];
    for (let i = 0; i < this.numFilas; i++) {
      const fila = [];
      for (let j = 0; j < this.numColumnas; j++) {
        fila.push((this.hoja.celdas[this.fila - 1 + i] || [])[this.columna - 1 + j]);
      }
      filas.push(fila);
    }
    filas.sort((a, b) => {
      for (const criterio of criterios) {
        const indice = criterio.column - this.columna;
        const comparacion = texto(a[indice]).localeCompare(texto(b[indice]));
        if (comparacion !== 0) return criterio.ascending === false ? -comparacion : comparacion;
      }
      return 0;
    });
    filas.forEach((fila, i) => fila.forEach((valor, j) => {
      this.hoja._escribir(this.fila - 1 + i, this.columna - 1 + j, valor);
    }));
    return this;
  }

  setDataValidation(regla) {
    this.hoja.validaciones.push({
      fila: this.fila, columna: this.columna,
      numFilas: this.numFilas, regla: clonar(regla)
    });
    return this;
  }
}

class FakeHoja {
  constructor(nombre) {
    this.nombre = nombre;
    this.celdas = [];
    this.formatos = {};
    this.validaciones = [];
    this.celdasLeidas = 0;
    this.filasCongeladas = 0;
    this.maxFilas = FILAS_POR_DEFECTO;
  }

  _escribir(fila, columna, valor) {
    if (fila >= this.maxFilas) {
      throw new Error('Escritura fuera de la hoja: fila ' + (fila + 1) + ' > maxRows ' + this.maxFilas);
    }
    while (this.celdas.length <= fila) {
      this.celdas.push([]);
    }
    this.celdas[fila][columna] = valor;
  }

  getName() { return this.nombre; }
  getMaxRows() { return this.maxFilas; }

  getLastRow() {
    let ultima = 0;
    this.celdas.forEach((fila, i) => {
      if ((fila || []).some((c) => texto(c) !== '')) {
        ultima = i + 1;
      }
    });
    return ultima;
  }

  getLastColumn() {
    let ultima = 0;
    this.celdas.forEach((fila) => {
      (fila || []).forEach((celda, j) => {
        if (texto(celda) !== '' && j + 1 > ultima) {
          ultima = j + 1;
        }
      });
    });
    return ultima;
  }

  getRange(fila, columna, numFilas, numColumnas) {
    return new FakeRango(
      this, fila, columna,
      numFilas === undefined ? 1 : numFilas,
      numColumnas === undefined ? 1 : numColumnas
    );
  }

  // Igual que Sheets: si la hoja está vacía devuelve igual un rango 1x1.
  getDataRange() {
    return new FakeRango(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }

  insertColumnBefore(columna) {
    this.celdas.forEach((fila) => {
      if (fila) fila.splice(columna - 1, 0, '');
    });
    return this;
  }

  deleteRow(fila) {
    if (fila < 1 || fila > this.celdas.length) {
      throw new Error('deleteRow fuera de rango: ' + fila);
    }
    this.celdas.splice(fila - 1, 1);
    return this;
  }

  setFrozenRows(n) { this.filasCongeladas = n; return this; }

  appendRow(valores) {
    const fila = this.getLastRow(); // 0-indexado para la fila nueva
    valores.forEach((valor, j) => this._escribir(fila, j, valor));
    return this;
  }

  /** Atajo para las pruebas: cargar filas de golpe. */
  sembrar(filas) {
    filas.forEach((fila, i) => {
      fila.forEach((valor, j) => this._escribir(i, j, valor));
    });
    return this;
  }

  /** Atajo para las pruebas: leer todo como matriz de texto. */
  leerTodo() {
    if (this.getLastRow() === 0) return [];
    return this.getDataRange().getDisplayValues();
  }
}

class FakeLibro {
  constructor() {
    this.hojas = new Map();
    this.zonaHoraria = 'Etc/GMT';
  }
  getSpreadsheetTimeZone() { return this.zonaHoraria; }
  setSpreadsheetTimeZone(zona) { this.zonaHoraria = zona; }
  getSheetByName(nombre) { return this.hojas.get(nombre) || null; }
  insertSheet(nombre) {
    const hoja = new FakeHoja(nombre);
    this.hojas.set(nombre, hoja);
    return hoja;
  }
  nombresDeHojas() { return Array.from(this.hojas.keys()); }
}

/**
 * Crea un entorno completo y evalúa los .gs adentro.
 *
 * @param {object} opciones
 * @param {string} opciones.ahora  Instante fijo ISO (UTC) que devuelve
 *   Utilities.formatDate, para que las pruebas sean deterministas.
 * @param {string} opciones.token  Token a dejar en Script Properties.
 */
function crearEntorno(opciones) {
  const config = opciones || {};
  const libro = new FakeLibro();
  const propiedades = {};
  let contadorUuid = 0;

  const entorno = {
    console,
    libro,

    SpreadsheetApp: {
      getActiveSpreadsheet: () => libro,
      newDataValidation: () => {
        const regla = { lista: null, permitirInvalido: null, mostrarDesplegable: null };
        const constructor = {
          requireValueInList(lista, mostrar) {
            regla.lista = lista;
            regla.mostrarDesplegable = mostrar;
            return constructor;
          },
          setAllowInvalid(valor) {
            regla.permitirInvalido = valor;
            return constructor;
          },
          build() { return regla; }
        };
        return constructor;
      }
    },

    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (clave) => (clave in propiedades ? propiedades[clave] : null),
        setProperty: (clave, valor) => { propiedades[clave] = valor; },
        deleteProperty: (clave) => { delete propiedades[clave]; }
      })
    },

    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (cuerpo) => ({
        cuerpo,
        setMimeType() { return this; }
      })
    },

    Utilities: {
      // Hexadecimal como el de verdad: el generador valida que el id de
      // serie sea "h" + 8 hex, así que un uuid falso no-hex rompería.
      getUuid: () => {
        const hex = String(++contadorUuid).padStart(8, '0');
        return hex + '-0000-4000-8000-000000000000';
      },
      formatDate: (fecha, zona, patron) => {
        // Las pruebas fijan "ahora"; el código solo usa estos 2 patrones.
        const instante = new Date(config.ahora || '2026-09-23T12:00:00Z');
        const dosDigitos = (n) => String(n).padStart(2, '0');
        const ymd = instante.getUTCFullYear() + '-' +
          dosDigitos(instante.getUTCMonth() + 1) + '-' +
          dosDigitos(instante.getUTCDate());
        if (patron === 'yyyy-MM-dd') return ymd;
        if (patron === 'yyyy-MM-dd HH:mm') {
          return ymd + ' ' + dosDigitos(instante.getUTCHours()) + ':' + dosDigitos(instante.getUTCMinutes());
        }
        throw new Error('patrón no contemplado en el entorno de prueba: ' + patron);
      }
    },

    Logger: { log: () => {} }
  };

  vm.createContext(entorno);
  ARCHIVOS_GS.forEach((archivo) => {
    const codigo = fs.readFileSync(path.join(CARPETA_GS, archivo), 'utf8');
    vm.runInContext(codigo, entorno, { filename: archivo });
  });

  if (config.token) {
    propiedades.KODAMA_TOKEN = config.token;
  }

  entorno.llamar = function (expresion, argumento) {
    entorno.__arg = argumento === undefined ? undefined : JSON.parse(JSON.stringify(argumento));
    return clonar(vm.runInContext(expresion, entorno));
  };

  entorno.post = function (cuerpo) {
    entorno.__evento = { postData: { contents: JSON.stringify(cuerpo) } };
    const salida = vm.runInContext('doPost(__evento)', entorno);
    return JSON.parse(salida.cuerpo);
  };

  return entorno;
}

module.exports = { crearEntorno, FakeHoja, FakeLibro };
