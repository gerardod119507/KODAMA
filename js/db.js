/**
 * KODAMA — las tablas de Supabase, vistas como la app las conoce
 * (Checkpoint 13).
 *
 * La app (y todo el código que venía del Apps Script) trabaja con objetos
 * de texto, como eran las filas del Sheet: archivado es "TRUE" o "",
 * alumno_id es "a1,a2", un campo vacío es "". La base de datos guarda tipos
 * de verdad (sí/no, listas, fechas, números, null). Este archivo traduce en
 * los dos sentidos, en un solo lugar, así el resto del código conserva la
 * misma forma de los datos y las pantallas no cambian.
 *
 * El "transporte" (cómo se llega a los datos) es intercambiable: en la app
 * es la API REST de Supabase; en las pruebas, una base falsa en memoria
 * (tests/fake-supabase.js) que entiende los mismos filtros.
 *
 * Filtros: lista de [columna, operador, valor] con nombres y valores de la
 * BASE (alumno_ids, archivado = false). Operadores: eq, neq, gt, gte, lt,
 * lte, in (lista), is (null / true / false), not_null, like ("b*").
 */
const KodamaDB = (function () {
  const TEXTO = 'texto';
  const FECHA = 'fecha';
  const SI_NO = 'si_no';
  const NUMERO = 'numero';
  const LISTA = 'lista';
  const MOMENTO = 'momento';
  const ZONA = 'America/La_Paz';
  // La Paz no tiene horario de verano: siempre UTC-4.
  const DESFASE = '-04:00';

  // clave: columna única para "guardar" (upsert). orden: cómo se leen (el
  // número "orden" crece con cada fila nueva: es el orden de las filas que
  // tenía el Sheet). En columnas, [tipo, nombre en la base] cuando el
  // nombre cambia: en la app sigue siendo "alumno_id" con ids separados por
  // coma; en la base es la lista "alumno_ids".
  const TABLAS = {
    areas: {
      clave: 'nombre', orden: 'posicion.asc,orden.asc',
      columnas: { nombre: TEXTO, color: TEXTO, posicion: NUMERO }
    },
    cursos: { clave: 'nombre', orden: 'orden.asc', columnas: { nombre: TEXTO, corto: TEXTO } },
    colegios: { clave: 'nombre', orden: 'orden.asc', columnas: { nombre: TEXTO, corto: TEXTO } },
    alumnos: {
      clave: 'id', orden: 'orden.asc',
      columnas: {
        id: TEXTO, nombre: TEXTO, apellido: TEXTO, curso: TEXTO, colegio: TEXTO, tarifa_hora: NUMERO,
        forma_calculo: TEXTO, forma_pago: TEXTO, notas: TEXTO, archivado: SI_NO, lugar: TEXTO,
        materias: TEXTO, tutor_nombre: TEXTO, tutor_parentesco: TEXTO, tutor_telefono: TEXTO, fecha_inicio: FECHA
      }
    },
    horario: {
      clave: 'id', orden: 'orden.asc',
      columnas: {
        id: TEXTO, titulo: TEXTO, area: TEXTO, dias: TEXTO, inicio: TEXTO, fin: TEXTO, desde: FECHA, hasta: FECHA,
        etiqueta: TEXTO, notas: TEXTO, archivado: SI_NO, alumno_id: [LISTA, 'alumno_ids'], lugar: TEXTO
      }
    },
    bloques: {
      clave: 'id', orden: 'fecha.asc,inicio.asc,orden.asc',
      // En el Sheet, un estado vacío era "programada"; la base no acepta vacío.
      siVacio: { estado: 'programada' },
      columnas: {
        id: TEXTO, titulo: TEXTO, area: TEXTO, tipo: TEXTO, fecha: FECHA, inicio: TEXTO, fin: TEXTO,
        etiqueta: TEXTO, notas: TEXTO, creado: MOMENTO, actualizado: MOMENTO, archivado: SI_NO,
        alumno_id: [LISTA, 'alumno_ids'], lugar: TEXTO, estado: TEXTO, fecha_original: FECHA,
        inicio_original: TEXTO, fin_original: TEXTO, motivo: TEXTO
      }
    },
    pagos: {
      clave: 'id', orden: 'orden.asc',
      columnas: {
        id: TEXTO, alumno_id: TEXTO, desde: FECHA, hasta: FECHA, monto: NUMERO, fecha_pago: FECHA,
        estado: TEXTO, notas: TEXTO, creado: MOMENTO, archivado: SI_NO
      }
    },
    plantillas: {
      clave: 'id', orden: 'orden.asc',
      columnas: {
        id: TEXTO, nombre: TEXTO, area: TEXTO, tipo: TEXTO, titulo: TEXTO, alumno_id: [LISTA, 'alumno_ids'],
        duracion: NUMERO, lugar: TEXTO, etiqueta: TEXTO, creado: MOMENTO, archivado: SI_NO
      }
    }
  };

  function definicion(tabla) {
    const def = TABLAS[tabla];
    if (!def) throw new Error('tabla_desconocida: ' + tabla);
    return def;
  }

  function columnas(tabla) {
    const def = definicion(tabla);
    return Object.keys(def.columnas).map(function (campo) {
      const c = def.columnas[campo];
      return Array.isArray(c) ? { campo: campo, tipo: c[0], base: c[1] } : { campo: campo, tipo: c, base: campo };
    });
  }

  // --- Fechas y horas ---------------------------------------------------

  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });

  /** Un instante → "2026-09-25 16:32" en La Paz (como lo escribía el Apps Script). */
  function momentoATexto(instante) {
    const fecha = instante instanceof Date ? instante : new Date(instante);
    if (isNaN(fecha.getTime())) return '';
    const p = {};
    formato.formatToParts(fecha).forEach(function (parte) { p[parte.type] = parte.value; });
    return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute;
  }

  /** "2026-09-25 16:32" (La Paz) → instante ISO para la base. */
  function textoAMomento(texto) {
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(texto || ''));
    return m ? m[1] + 'T' + m[2] + ':00' + DESFASE : new Date().toISOString();
  }

  // --- Conversión app ↔ base -------------------------------------------

  /** Fila de la base → objeto de la app (todo texto). */
  function aApp(tabla, fila) {
    const objeto = {};
    columnas(tabla).forEach(function (c) {
      const valor = fila[c.base];
      if (c.tipo === SI_NO) {
        objeto[c.campo] = valor === true ? 'TRUE' : '';
      } else if (c.tipo === LISTA) {
        objeto[c.campo] = Array.isArray(valor) ? valor.join(',') : '';
      } else if (c.tipo === NUMERO) {
        objeto[c.campo] = valor === null || valor === undefined || valor === '' ? '' : String(Number(valor));
      } else if (c.tipo === MOMENTO) {
        objeto[c.campo] = valor ? momentoATexto(valor) : '';
      } else {
        objeto[c.campo] = valor === null || valor === undefined ? '' : String(valor);
      }
    });
    return objeto;
  }

  /**
   * Objeto de la app → fila de la base. Completo (para crear o guardar):
   * todas las columnas, así todas las filas de un mismo envío tienen las
   * mismas claves (la API REST lo exige al insertar varias juntas).
   * Parcial: solo los campos que trae el objeto (para editar).
   */
  function aBase(tabla, objeto, parcial) {
    const siVacio = definicion(tabla).siVacio || {};
    const fila = {};
    columnas(tabla).forEach(function (c) {
      if (parcial && !(c.campo in objeto)) return;
      const valor = objeto[c.campo];
      let texto = valor === null || valor === undefined ? '' : String(valor);
      if (texto === '' && siVacio[c.campo]) texto = siVacio[c.campo];
      if (c.tipo === SI_NO) {
        fila[c.base] = texto.trim().toUpperCase() === 'TRUE';
      } else if (c.tipo === LISTA) {
        fila[c.base] = texto.split(',').map(function (id) { return id.trim(); }).filter(Boolean);
      } else if (c.tipo === NUMERO) {
        fila[c.base] = texto.trim() === '' ? null : Number(texto);
      } else if (c.tipo === MOMENTO) {
        fila[c.base] = textoAMomento(texto);
      } else {
        fila[c.base] = texto === '' ? null : texto;
      }
    });
    return fila;
  }

  // --- Transporte: la API REST de Supabase ------------------------------

  function valorDeFiltro(operador, valor) {
    if (operador === 'is') return 'is.' + (valor === null ? 'null' : valor ? 'true' : 'false');
    if (operador === 'not_null') return 'not.is.null';
    if (operador === 'in') {
      // Entre comillas: un valor con coma o paréntesis no rompe la lista.
      const lista = valor.map(function (v) {
        return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      });
      return 'in.' + encodeURIComponent('(' + lista.join(',') + ')');
    }
    return operador + '.' + encodeURIComponent(String(valor));
  }

  function consulta(filtros, extra) {
    const partes = (filtros || []).map(function (f) {
      return encodeURIComponent(f[0]) + '=' + valorDeFiltro(f[1], f[2]);
    });
    Object.keys(extra || {}).forEach(function (clave) {
      if (extra[clave] !== undefined) partes.push(clave + '=' + extra[clave]);
    });
    return partes.join('&');
  }

  const PAGINA = 1000; // Supabase devuelve como mucho 1000 filas por petición
  const LOTE = 500;    // filas por envío al escribir muchas juntas

  function enLotes(filas, enviar) {
    const envios = [];
    for (let i = 0; i < filas.length; i += LOTE) envios.push(enviar(filas.slice(i, i + LOTE)));
    return Promise.all(envios);
  }

  function exigirFiltros(filtros, accion) {
    // Nunca editar ni borrar una tabla entera por un filtro olvidado.
    if (!filtros || !filtros.length) throw new Error('falta_filtro: ' + accion + ' necesita un filtro');
  }

  const transporteRest = {
    async seleccionar(tabla, filtros, orden) {
      const filas = [];
      for (let desde = 0; ; desde += PAGINA) {
        const ruta = tabla + '?' + consulta(filtros, { select: '*', order: orden, limit: PAGINA, offset: desde || undefined });
        const lote = await KodamaSupabase.rest('GET', ruta);
        filas.push.apply(filas, lote || []);
        if (!lote || lote.length < PAGINA) return filas;
      }
    },
    async insertar(tabla, filas) {
      await enLotes(filas, function (lote) {
        return KodamaSupabase.rest('POST', tabla, { cuerpo: lote, prefer: 'return=minimal' });
      });
    },
    async guardar(tabla, filas, clave) {
      await enLotes(filas, function (lote) {
        return KodamaSupabase.rest('POST', tabla + '?on_conflict=' + clave, {
          cuerpo: lote, prefer: 'resolution=merge-duplicates,return=minimal'
        });
      });
    },
    async actualizar(tabla, filtros, cambios) {
      exigirFiltros(filtros, 'actualizar');
      await KodamaSupabase.rest('PATCH', tabla + '?' + consulta(filtros), { cuerpo: cambios, prefer: 'return=minimal' });
    },
    async borrar(tabla, filtros) {
      exigirFiltros(filtros, 'borrar');
      const borradas = await KodamaSupabase.rest('DELETE', tabla + '?' + consulta(filtros), { prefer: 'return=representation' });
      return borradas || [];
    }
  };

  let transporte = transporteRest;

  // --- Lo que usa el backend -------------------------------------------

  return {
    /** Filas (objetos de la app) que cumplen los filtros, en el orden de la tabla. */
    async leer(tabla, filtros) {
      const filas = await transporte.seleccionar(tabla, filtros || [], definicion(tabla).orden);
      return filas.map(function (fila) { return aApp(tabla, fila); });
    },
    /** Crea filas nuevas (objetos de la app). */
    async insertar(tabla, objetos) {
      if (!objetos.length) return;
      await transporte.insertar(tabla, objetos.map(function (o) { return aBase(tabla, o); }));
    },
    /** Crea o reemplaza filas completas por su clave, todas en un solo envío. */
    async guardar(tabla, objetos) {
      if (!objetos.length) return;
      const def = definicion(tabla);
      await transporte.guardar(tabla, objetos.map(function (o) { return aBase(tabla, o); }), def.clave);
    },
    /** Cambia solo los campos que trae "cambios" en las filas que cumplen los filtros. */
    async actualizar(tabla, filtros, cambios) {
      await transporte.actualizar(tabla, filtros, aBase(tabla, cambios, true));
    },
    /** Borra de verdad. Devuelve cuántas filas borró. */
    async borrar(tabla, filtros) {
      const borradas = await transporte.borrar(tabla, filtros);
      return borradas.length;
    },
    usarTransporte(otro) {
      transporte = otro || transporteRest;
    },
    // Para las pruebas y para el backend.
    aApp: aApp,
    aBase: aBase,
    consulta: consulta,
    momentoATexto: momentoATexto,
    textoAMomento: textoAMomento,
    tablas: function () { return Object.keys(TABLAS); },
    clave: function (tabla) { return definicion(tabla).clave; }
  };
})();
