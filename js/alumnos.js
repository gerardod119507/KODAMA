/**
 * Alumnos de Academia Fractal en el navegador: el "directorio" (alumnos +
 * catálogos de cursos y colegios), el buscador del autocompletado y cómo
 * se arma el nombre que se ve de un bloque o regla a partir de sus
 * alumnos vinculados.
 *
 * El directorio se guarda en el dispositivo (solo lectura, igual que los
 * bloques) y se refresca por detrás al abrir cada página.
 */
const KodamaAlumnos = (function () {
  const CLAVE_CACHE = 'kodama.cache.alumnos';
  const VACIO = { alumnos: [], cursos: [], colegios: [] };
  let directorio = leerGuardado() || VACIO;
  const oyentes = [];

  /** "  Agustín  ALIENDRE " → "agustin aliendre" (igual que normalizarTexto en el backend). */
  function normalizar(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function corto(lista, nombre) {
    const item = (lista || []).find(function (c) { return c.nombre === nombre; });
    return item ? item.corto : nombre;
  }

  function nombreCompleto(alumno) {
    return (alumno.nombre + ' ' + (alumno.apellido || '')).trim();
  }

  /** "Agustín Aliendre — 4to SA": curso y colegio con su código corto. */
  function etiqueta(alumno, dir) {
    const d = dir || directorio;
    const extra = [
      alumno.curso ? corto(d.cursos, alumno.curso) : '',
      alumno.colegio ? corto(d.colegios, alumno.colegio) : ''
    ].filter(Boolean).join(' ');
    return nombreCompleto(alumno) + (extra ? ' — ' + extra : '');
  }

  /**
   * Buscador estilo "mientras escribo": cada palabra de la consulta tiene
   * que aparecer en el nombre, el apellido o el colegio (nombre completo o
   * código), sin importar tildes ni mayúsculas. Primero los que tienen una
   * palabra que EMPIEZA con lo escrito ("ag" → Agustín), después los que
   * solo lo contienen. Sin consulta, todos en orden alfabético.
   *
   * opciones: { limite, incluirArchivados, excluir: [ids] }
   */
  function buscar(consulta, dir, opciones) {
    const d = dir || directorio;
    const o = opciones || {};
    const excluir = o.excluir || [];
    const partes = normalizar(consulta).split(' ').filter(Boolean);

    const resultados = [];
    d.alumnos.forEach(function (alumno) {
      if (!o.incluirArchivados && alumno.archivado === 'TRUE') return;
      if (excluir.indexOf(alumno.id) !== -1) return;
      const texto = normalizar([
        alumno.nombre, alumno.apellido, alumno.colegio, alumno.colegio ? corto(d.colegios, alumno.colegio) : ''
      ].join(' '));
      const palabras = texto.split(' ');
      let puntaje = 0;
      for (let i = 0; i < partes.length; i++) {
        const parte = partes[i];
        if (palabras.some(function (p) { return p.indexOf(parte) === 0; })) {
          puntaje += 2;
        } else if (texto.indexOf(parte) !== -1) {
          puntaje += 1;
        } else {
          return; // una palabra de la consulta no aparece: no coincide
        }
      }
      resultados.push({ alumno: alumno, puntaje: puntaje });
    });

    resultados.sort(function (a, b) {
      return b.puntaje - a.puntaje ||
        normalizar(nombreCompleto(a.alumno)).localeCompare(normalizar(nombreCompleto(b.alumno)));
    });
    const lista = resultados.map(function (r) { return r.alumno; });
    return o.limite ? lista.slice(0, o.limite) : lista;
  }

  function idsDe(texto) {
    return String(texto || '').split(',').map(function (id) { return id.trim(); }).filter(Boolean);
  }

  function porId(id, dir) {
    return (dir || directorio).alumnos.find(function (a) { return a.id === id; }) || null;
  }

  /**
   * El nombre que se ve de un bloque o regla. Con alumnos vinculados, sale
   * de ellos (el nombre del alumno ya no vive en el título): uno solo →
   * "Agustín Aliendre — 4to SA"; varios → "Camila Aliendre, Lucía Aliendre".
   * Si además tiene título (un tema), va después: "… · Física".
   */
  function tituloDeBloque(bloque, dir) {
    const d = dir || directorio;
    const alumnos = idsDe(bloque.alumno_id).map(function (id) { return porId(id, d); }).filter(Boolean);
    if (alumnos.length === 0) {
      return bloque.titulo || (bloque.alumno_id ? '(alumno)' : '');
    }
    const nombres = alumnos.length === 1
      ? etiqueta(alumnos[0], d)
      : alumnos.map(nombreCompleto).join(', ');
    return bloque.titulo ? nombres + ' · ' + bloque.titulo : nombres;
  }

  /**
   * Lugar habitual para una clase con estos alumnos: el del primero que
   * tenga uno cargado (vacío si ninguno). Se usa para completar solo el
   * campo "Lugar" de un bloque o regla nuevos.
   */
  function lugarDeAlumnos(texto, dir) {
    const d = dir || directorio;
    const ids = idsDe(texto);
    for (let i = 0; i < ids.length; i++) {
      const alumno = porId(ids[i], d);
      if (alumno && alumno.lugar) return alumno.lugar;
    }
    return '';
  }

  // --- Directorio guardado en el dispositivo --------------------------

  function leerGuardado() {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE_CACHE));
      return guardado && Array.isArray(guardado.alumnos) ? guardado : null;
    } catch (err) {
      return null;
    }
  }

  function fijar(nuevo) {
    directorio = { alumnos: nuevo.alumnos || [], cursos: nuevo.cursos || [], colegios: nuevo.colegios || [] };
    try {
      localStorage.setItem(CLAVE_CACHE, JSON.stringify(directorio));
    } catch (err) {
      // Sin caché no es grave: se vuelve a pedir la próxima vez.
    }
    oyentes.forEach(function (fn) { fn(directorio); });
  }

  /** Pide alumnos y catálogos al Web App (una sola llamada) y avisa a quien escuche. */
  async function cargar() {
    const config = KodamaApi.leerConfig();
    if (!config.url || !config.token) return directorio;
    const respuesta = await KodamaApi.llamar(config.url, config.token, 'listarAlumnos');
    if (!respuesta.ok) throw new Error(respuesta.error);
    fijar(respuesta.data);
    return directorio;
  }

  /** Un alumno recién creado o editado se ve al instante, sin esperar la recarga. */
  function aplicarAlumno(alumno) {
    const resto = directorio.alumnos.filter(function (a) { return a.id !== alumno.id; });
    fijar({ alumnos: resto.concat([alumno]), cursos: directorio.cursos, colegios: directorio.colegios });
  }

  return {
    normalizar: normalizar,
    etiqueta: etiqueta,
    nombreCompleto: nombreCompleto,
    buscar: buscar,
    tituloDeBloque: tituloDeBloque,
    lugarDeAlumnos: lugarDeAlumnos,
    idsDe: idsDe,
    porId: porId,
    corto: corto,
    actual: function () { return directorio; },
    alCambiar: function (fn) { oyentes.push(fn); },
    cargar: cargar,
    fijar: fijar,
    aplicarAlumno: aplicarAlumno
  };
})();
