/**
 * KODAMA — alumnos de Academia Fractal y sus catálogos (antes
 * apps-script/Alumnos.gs).
 *
 * Tabla alumnos (una fila por alumno) y dos catálogos editables, cursos y
 * colegios, con nombre completo y código corto. El alumno guarda SIEMPRE
 * el nombre completo del curso y del colegio; el código corto es solo para
 * mostrar ("Agustín Aliendre — 4to SA").
 *
 * Los bloques y las reglas del horario se vinculan a los alumnos por
 * alumno_id (ids separados por coma: una clase puede tener varios).
 */
(function (B) {
  const CAMPOS_EDITABLES_ALUMNO = ['nombre', 'apellido', 'curso', 'colegio', 'tarifa_hora', 'forma_pago', 'notas', 'lugar',
    'materias', 'tutor_nombre', 'tutor_parentesco', 'tutor_telefono', 'fecha_inicio'];
  var PARENTESCOS_VALIDOS = ['madre', 'padre', 'tía', 'tío', 'abuela', 'abuelo', 'hermana', 'hermano', 'otro'];
  const CATALOGOS = { cursos: 'cursos', colegios: 'colegios' };

  // forma_calculo: cómo se calcula lo que se debe (siempre por hora).
  // forma_pago: cuándo se cobra. Son cosas distintas: un alumno puede
  // calcularse por hora y pagar por mes.
  B.FORMA_CALCULO = 'hora';
  B.PARENTESCOS_VALIDOS = PARENTESCOS_VALIDOS;

  // --- Lectura -------------------------------------------------------

  B.leerAlumnos = function () {
    return KodamaDB.leer('alumnos');
  };

  B.leerCatalogo = async function (tipo) {
    const filas = await KodamaDB.leer(CATALOGOS[tipo]);
    return filas.map(function (fila) { return { nombre: fila.nombre, corto: fila.corto || fila.nombre }; });
  };

  B.catalogosActuales = async function () {
    const leidos = await Promise.all([B.leerCatalogo('cursos'), B.leerCatalogo('colegios')]);
    return { cursos: leidos[0], colegios: leidos[1] };
  };

  B.listarAlumnos = async function () {
    const leidos = await Promise.all([B.leerAlumnos(), B.leerCatalogo('cursos'), B.leerCatalogo('colegios')]);
    return { alumnos: leidos[0], cursos: leidos[1], colegios: leidos[2] };
  };

  /**
   * Nombre completo del catálogo que corresponde a un texto: acepta el
   * nombre completo o el código corto ("SA" o "Unidad Educativa San
   * Agustín"), sin importar tildes ni mayúsculas. Vacío devuelve vacío; si
   * no está en el catálogo, null.
   */
  B.resolverCatalogo = function (catalogo, texto) {
    const buscado = B.normalizarTexto(texto);
    if (!buscado) return '';
    for (let i = 0; i < catalogo.length; i++) {
      if (B.normalizarTexto(catalogo[i].nombre) === buscado || B.normalizarTexto(catalogo[i].corto) === buscado) {
        return catalogo[i].nombre;
      }
    }
    return null;
  };

  // --- Normalización y validación ------------------------------------

  /** "Bs 80", "80,50", " 80 " → "80", "80.5". Vacío queda vacío. */
  B.normalizarTarifa = function (texto) {
    const limpio = String(texto == null ? '' : texto).replace(/bs\.?/i, '').replace(/\s+/g, '').replace(',', '.');
    if (!limpio) return '';
    if (!/^\d+(\.\d+)?$/.test(limpio)) {
      throw new Error('tarifa_invalida: "' + texto + '" (usa un número, ej. 80)');
    }
    return String(Number(limpio));
  };

  /** "hora", "por hora", "mensual", "mes", "por mes"… → "hora" | "mensual". */
  B.normalizarFormaPago = function (texto) {
    const t = B.normalizarTexto(texto).replace(/^por /, '');
    if (!t || t === 'hora' || t === 'horas' || t === 'h') return 'hora';
    if (t === 'mensual' || t === 'mes' || t === 'mensualmente') return 'mensual';
    throw new Error('forma_pago_invalida: "' + texto + '" (usa hora o mensual)');
  };

  B.claveDeAlumno = function (nombre, apellido) {
    return B.normalizarTexto(nombre + ' ' + (apellido || ''));
  };

  /** Un id que no está en "usados" (y lo marca como usado). */
  B.nuevoIdDeAlumno = function (usados) {
    let id;
    do {
      id = B.nuevoId('a');
    } while (usados[id]);
    usados[id] = true;
    return id;
  };

  /**
   * Deja un alumno listo para guardar: recorta textos, pasa curso y colegio
   * al nombre completo del catálogo (acepta el código corto), normaliza
   * tarifa y forma de pago, y verifica que no haya otro alumno con el mismo
   * nombre y apellido. Tira un error con el motivo si algo está mal.
   */
  B.prepararAlumno = function (alumno, catalogos, existentes) {
    alumno.nombre = String(alumno.nombre || '').trim();
    alumno.apellido = String(alumno.apellido || '').trim();
    alumno.notas = String(alumno.notas || '');
    alumno.lugar = String(alumno.lugar || '').trim();
    if (!alumno.nombre) {
      throw new Error('falta_nombre');
    }

    const curso = B.resolverCatalogo(catalogos.cursos, alumno.curso);
    if (curso === null) throw new Error('curso_desconocido: "' + alumno.curso + '" (agrégalo en Cursos)');
    alumno.curso = curso;
    const colegio = B.resolverCatalogo(catalogos.colegios, alumno.colegio);
    if (colegio === null) throw new Error('colegio_desconocido: "' + alumno.colegio + '" (agrégalo en Colegios)');
    alumno.colegio = colegio;

    alumno.tarifa_hora = B.normalizarTarifa(alumno.tarifa_hora);
    alumno.forma_calculo = B.FORMA_CALCULO;
    alumno.forma_pago = B.normalizarFormaPago(alumno.forma_pago);

    // --- Campos de la ficha (tutor, materias, fecha de inicio) ---
    alumno.materias = String(alumno.materias || '').trim();
    alumno.tutor_nombre = String(alumno.tutor_nombre || '').trim();
    alumno.tutor_telefono = String(alumno.tutor_telefono || '').trim();
    alumno.fecha_inicio = String(alumno.fecha_inicio || '').trim();

    var parentesco = String(alumno.tutor_parentesco || '').trim().toLowerCase();
    if (parentesco && PARENTESCOS_VALIDOS.indexOf(parentesco) === -1) {
      throw new Error('parentesco_invalido: "' + alumno.tutor_parentesco + '" (usa ' + PARENTESCOS_VALIDOS.join(', ') + ')');
    }
    alumno.tutor_parentesco = parentesco;

    const clave = B.claveDeAlumno(alumno.nombre, alumno.apellido);
    existentes.forEach(function (otro) {
      if (otro.id !== alumno.id && B.claveDeAlumno(otro.nombre, otro.apellido) === clave) {
        throw new Error('alumno_duplicado: ya existe "' + otro.nombre + ' ' + otro.apellido + '"');
      }
    });
    return alumno;
  };

  /**
   * Busca, para un nombre escrito, el alumno que ya existe: primero por
   * nombre y apellido exactos (sin tildes/mayúsculas); si solo vino el
   * nombre, por nombre, siempre que haya uno solo.
   */
  B.buscarAlumnoPorNombre = function (lista, nombre, apellido) {
    const clave = B.claveDeAlumno(nombre, apellido);
    const exacto = lista.filter(function (a) { return B.claveDeAlumno(a.nombre, a.apellido) === clave; });
    if (exacto.length) return exacto[0];
    if (!apellido) {
      const porNombre = lista.filter(function (a) { return B.normalizarTexto(a.nombre) === B.normalizarTexto(nombre); });
      if (porNombre.length === 1) return porNombre[0];
    }
    return null;
  };

  /**
   * Alumnos que corresponden a un nombre escrito: por nombre y apellido
   * exactos (sin tildes/mayúsculas); si solo vino el nombre, todos los que
   * se llaman así (más de uno = ambiguo).
   */
  B.candidatosPorNombre = function (alumnos, nombre, apellido) {
    if (apellido) {
      const clave = B.claveDeAlumno(nombre, apellido);
      return alumnos.filter(function (a) { return B.claveDeAlumno(a.nombre, a.apellido) === clave; });
    }
    return alumnos.filter(function (a) { return B.normalizarTexto(a.nombre) === B.normalizarTexto(nombre); });
  };

  // --- Alta, edición, archivo ----------------------------------------

  B.crearAlumno = async function (datos) {
    const entrada = datos || {};
    const leidos = await Promise.all([B.leerAlumnos(), B.catalogosActuales()]);
    const existentes = leidos[0];
    const usados = {};
    existentes.forEach(function (a) { usados[a.id] = true; });

    const alumno = { id: B.nuevoIdDeAlumno(usados), archivado: '' };
    CAMPOS_EDITABLES_ALUMNO.forEach(function (campo) { alumno[campo] = entrada[campo]; });
    B.prepararAlumno(alumno, leidos[1], existentes);

    await B.insertarConIdNuevo('alumnos', alumno, 'a');
    return alumno;
  };

  async function buscarAlumno(id, todos) {
    const buscado = String(id || '').trim();
    if (!buscado) throw new Error('falta_id_alumno');
    const encontrado = todos.find(function (a) { return a.id === buscado; });
    if (!encontrado) throw new Error('alumno_no_encontrado: ' + buscado);
    return encontrado;
  }

  function todosLosCampos(alumno) {
    // Lo que se escribe al editar: todos los campos del alumno, incluidos
    // los de la ficha (tutor, materias, fecha de inicio).
    const fila = {};
    ['nombre', 'apellido', 'curso', 'colegio', 'tarifa_hora', 'forma_calculo', 'forma_pago', 'notas', 'archivado', 'lugar',
     'materias', 'tutor_nombre', 'tutor_parentesco', 'tutor_telefono', 'fecha_inicio']
      .forEach(function (campo) { fila[campo] = alumno[campo]; });
    return fila;
  }

  B.actualizarAlumno = async function (id, cambios) {
    const leidos = await Promise.all([B.leerAlumnos(), B.catalogosActuales()]);
    const alumno = await buscarAlumno(id, leidos[0]);
    CAMPOS_EDITABLES_ALUMNO.forEach(function (campo) {
      if (cambios && cambios[campo] !== undefined && cambios[campo] !== null) {
        alumno[campo] = cambios[campo];
      }
    });
    B.prepararAlumno(alumno, leidos[1], leidos[0]);
    await KodamaDB.actualizar('alumnos', [['id', 'eq', alumno.id]], todosLosCampos(alumno));
    return alumno;
  };

  /** Archivar, nunca borrar: los bloques viejos siguen mostrando su nombre. */
  B.archivarAlumno = async function (id) {
    const alumno = await buscarAlumno(id, await B.leerAlumnos());
    alumno.archivado = 'TRUE';
    await KodamaDB.actualizar('alumnos', [['id', 'eq', alumno.id]], { archivado: 'TRUE' });
    return alumno;
  };

  /**
   * Crea o edita una entrada de un catálogo (tipo "cursos" o "colegios").
   * Con "anterior" (el nombre completo actual) la edita. Si cambió el nombre
   * completo, la base lo cambia sola en todos los alumnos que lo tenían
   * (el alumno guarda el nombre completo y está enlazado al catálogo).
   */
  B.guardarCatalogo = async function (tipo, anterior, item) {
    const tabla = CATALOGOS[tipo];
    if (!tabla) throw new Error('catalogo_desconocido: "' + tipo + '" (usa cursos o colegios)');
    const nombre = String((item && item.nombre) || '').trim();
    const corto = String((item && item.corto) || '').trim();
    if (!nombre || !corto) throw new Error('catalogo_incompleto: hacen falta nombre completo y código corto');

    const filas = await KodamaDB.leer(tabla);
    let editada = null;
    filas.forEach(function (fila) {
      if (anterior && fila.nombre === anterior) {
        editada = fila;
        return;
      }
      if (fila.nombre && (B.normalizarTexto(fila.nombre) === B.normalizarTexto(nombre) ||
          B.normalizarTexto(fila.corto) === B.normalizarTexto(corto))) {
        throw new Error('catalogo_duplicado: ya existe "' + fila.nombre + '" (' + fila.corto + ')');
      }
    });

    if (anterior && !editada) throw new Error('catalogo_no_encontrado: "' + anterior + '"');
    if (!editada) {
      await KodamaDB.insertar(tabla, [{ nombre: nombre, corto: corto }]);
    } else {
      await KodamaDB.actualizar(tabla, [['nombre', 'eq', anterior]], { nombre: nombre, corto: corto });
    }
    return B.leerCatalogo(tipo);
  };
})(KodamaBackend);
