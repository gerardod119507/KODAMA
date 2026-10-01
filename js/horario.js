/**
 * Horario (horario.html): las reglas de la hoja Horario en tres secciones,
 * cada una con sus palabras y su formulario:
 *
 * - Materias (Universidad): materia, aula, días y horario, semestre.
 *   Se archivan (dejan de repetirse), no se borran.
 * - Alumnos fijos (Academia Fractal), por mes: alumnos, días y horario,
 *   del … al …. Se BORRAN de verdad (con sus clases de hoy en adelante; las
 *   pasadas quedan para el cobro). Abajo, las clases sueltas de Fractal
 *   marcadas "fijo" con el +: pasar a variable o borrar.
 * - Otros (Startup y Personal): como antes.
 *
 * Guardar, archivar o borrar regenera el horario en la misma petición: la
 * grilla y el Sheet quedan al día sin otro toque.
 */
(async function () {
  const S = KodamaSeccionesHorario;
  const estado = document.getElementById('estado-horario');

  const config = KodamaApi.leerConfig();
  if (!config.url || !config.token) {
    // Igual que en la vista principal: se avisa aquí, nunca se salta solo a
    // Configuración.
    estado.textContent = 'Falta configurar la conexión con tu hoja. ';
    const enlace = document.createElement('a');
    enlace.href = 'config.html';
    enlace.textContent = 'Configurar';
    estado.appendChild(enlace);
    KodamaCarga.listo();
    return;
  }

  const SECCIONES = ['materias', 'fijos', 'otros'];
  const MODO_DE_SECCION = { materias: 'materia', fijos: 'fijo', otros: 'otro' };
  const AREAS_OTROS = ['Startup', 'Personal'];
  const TEXTOS = {
    materia: {
      nuevo: 'Nueva materia', editar: 'Editar materia', titulo: 'Materia', desde: 'Inicio del semestre',
      hasta: 'Fin del semestre', lugar: 'Aula', notas: 'Notas (docente, paralelo…)', lugarEjemplo: 'Aula E511'
    },
    fijo: {
      nuevo: 'Nuevo alumno fijo', editar: 'Editar alumno fijo', titulo: 'Tema (opcional)', desde: 'Del',
      hasta: 'Al', lugar: 'Lugar', notas: 'Notas', lugarEjemplo: ''
    },
    otro: {
      nuevo: 'Nuevo horario', editar: 'Editar horario', titulo: 'Título', desde: 'Desde',
      hasta: 'Hasta', lugar: 'Lugar', notas: 'Notas', lugarEjemplo: ''
    }
  };

  const dialogo = document.getElementById('dialogo-regla');
  const resultadoRegenerar = document.getElementById('resultado-regenerar');
  const campoMes = document.getElementById('mes-fijos');
  const campos = {
    titulo: document.getElementById('regla-titulo'),
    area: document.getElementById('regla-area'),
    inicio: document.getElementById('regla-inicio'),
    fin: document.getElementById('regla-fin'),
    desde: document.getElementById('regla-desde'),
    hasta: document.getElementById('regla-hasta'),
    lugar: document.getElementById('regla-lugar'),
    etiqueta: document.getElementById('regla-etiqueta'),
    notas: document.getElementById('regla-notas')
  };

  let reglas = [];
  let sueltos = [];
  let cargado = false;
  let seccion = SECCIONES.indexOf(window.location.hash.slice(1)) !== -1 ? window.location.hash.slice(1) : 'materias';
  let modo = 'materia';
  let idEnEdicion = null;
  campoMes.value = KodamaFecha.hoy().slice(0, 7);

  // Días como botones Lun–Dom y el fin que se completa solo.
  const botonesDias = KodamaBotonesDias.crear(document.getElementById('regla-dias'));
  const horas = KodamaHoras.conectar({
    area: campos.area, inicio: campos.inicio, fin: campos.fin,
    aviso: document.getElementById('aviso-horas-regla')
  });

  // Las 4 áreas en la lista (la duración del fin sale del área elegida),
  // pero en "Otros" solo se ven Startup y Personal.
  ['Universidad', 'Academia Fractal'].concat(AREAS_OTROS).forEach(function (area) {
    const opcion = document.createElement('option');
    opcion.value = area;
    opcion.textContent = area;
    opcion.hidden = AREAS_OTROS.indexOf(area) === -1;
    campos.area.appendChild(opcion);
  });

  async function pedir(accion, parametros) {
    const respuesta = await KodamaApi.llamar(config.url, config.token, accion, parametros);
    if (!respuesta.ok) {
      throw new Error(respuesta.error);
    }
    return respuesta.data;
  }

  // Alumnos (solo en los fijos de Fractal). En uno NUEVO, el lugar se
  // completa con el lugar habitual del alumno mientras no lo escribas tú.
  let lugarAutomatico = false;
  const selectorAlumnos = KodamaSelectorAlumnos.crear(document.getElementById('regla-alumnos'), {
    crearAlumno: function (datos) { return pedir('crearAlumno', { alumno: datos }); },
    alCambiar: function (ids) {
      if (idEnEdicion || !lugarAutomatico) return;
      campos.lugar.value = KodamaAlumnos.lugarDeAlumnos(ids);
    }
  });
  campos.lugar.addEventListener('input', function () { lugarAutomatico = false; });
  KodamaAlumnos.alCambiar(function () {
    selectorAlumnos.repintar();
    if (cargado) pintar();
  });

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function avisar(texto) {
    estado.textContent = texto || '';
  }

  // --- Secciones -----------------------------------------------------------

  function mostrarSeccion(nombre) {
    if (nombre !== seccion && cargado) avisar('');
    seccion = nombre;
    SECCIONES.forEach(function (s) {
      document.getElementById('seccion-' + s).hidden = s !== nombre;
    });
    document.querySelectorAll('.pestanas [data-seccion]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.seccion === nombre));
    });
    history.replaceState(null, '', '#' + nombre);
  }

  document.querySelectorAll('.pestanas [data-seccion]').forEach(function (b) {
    b.addEventListener('click', function () { mostrarSeccion(b.dataset.seccion); });
  });

  // --- Tarjetas --------------------------------------------------------------

  function tarjeta(regla, lineas) {
    const t = el('button', 'regla');
    t.type = 'button';
    if (regla.archivado === 'TRUE') t.classList.add('regla--archivada');
    t.addEventListener('click', function () { abrirEdicion(regla); });
    t.appendChild(el('p', 'regla__titulo', lineas[0] + (regla.archivado === 'TRUE' ? ' (archivada)' : '')));
    lineas.slice(1).filter(Boolean).forEach(function (linea) { t.appendChild(el('p', 'regla__meta', linea)); });
    return t;
  }

  const horario = function (r) { return r.dias + ' · ' + r.inicio + '–' + r.fin; };
  const rango = function (r) {
    return r.desde && r.hasta ? KodamaFecha.rangoLegible(r.desde, r.hasta) : (r.desde || '?') + ' a ' + (r.hasta || '?');
  };

  function pintarLista(contenedor, lista, vacio, lineasDe) {
    contenedor.replaceChildren();
    if (!lista.length) {
      contenedor.appendChild(el('p', 'nota', vacio));
      return;
    }
    lista.forEach(function (r) { contenedor.appendChild(tarjeta(r, lineasDe(r))); });
  }

  function pintarSueltos() {
    const contenedor = document.getElementById('lista-sueltos');
    contenedor.replaceChildren();
    document.getElementById('sueltos-todas').hidden = sueltos.length < 2;
    if (!sueltos.length) {
      contenedor.appendChild(el('p', 'nota', 'No hay: ninguna clase suelta de Fractal está marcada como fijo.'));
      return;
    }
    sueltos.forEach(function (b) {
      const fila = el('div', 'suelta');
      fila.appendChild(el('p', 'suelta__texto',
        KodamaFecha.legible(b.fecha) + ' · ' + b.inicio + '–' + b.fin + ' · ' + KodamaAlumnos.tituloDeBloque(b)));
      const botones = el('div', 'suelta__botones');
      const variable = el('button', 'secundario', 'Pasar a variable');
      variable.type = 'button';
      variable.addEventListener('click', function () { pasarAVariable([b], variable); });
      const borrar = el('button', 'fantasma', 'Borrar');
      borrar.type = 'button';
      borrar.addEventListener('click', function () { borrarSuelta(b, borrar); });
      botones.appendChild(variable);
      botones.appendChild(borrar);
      fila.appendChild(botones);
      contenedor.appendChild(fila);
    });
  }

  function pintar() {
    pintarLista(document.getElementById('lista-materias'), S.deSeccion(reglas, 'materias'),
      'Todavía no hay materias. Toca "+ Nueva materia".',
      function (r) { return [r.titulo, horario(r) + (r.lugar ? ' · ' + r.lugar : ''), 'Semestre: ' + rango(r)]; });
    pintarLista(document.getElementById('lista-fijos'), S.fijosDelMes(reglas, campoMes.value),
      'Ningún alumno fijo en este mes. Toca "+ Alumno fijo".',
      function (r) {
        return [KodamaAlumnos.tituloDeBloque(r), horario(r) + (r.lugar ? ' · ' + r.lugar : ''), rango(r)];
      });
    pintarLista(document.getElementById('lista-otros'), S.deSeccion(reglas, 'otros'),
      'Nada por aquí. Toca "+ Nuevo horario".',
      function (r) { return [r.titulo, horario(r) + ' · ' + r.area, rango(r) + (r.etiqueta ? ' · ' + r.etiqueta : '')]; });
    pintarSueltos();
  }

  campoMes.addEventListener('change', function () { if (cargado) pintar(); });

  async function cargar() {
    avisar('Cargando…');
    try {
      const datos = await Promise.all([pedir('listarHorario'), pedir('listarFijosSueltos')]);
      reglas = datos[0];
      sueltos = datos[1];
      cargado = true;
      avisar('');
      pintar();
    } catch (error) {
      avisar('No se pudo cargar: ' + error.message);
    }
  }

  // --- Formulario --------------------------------------------------------------

  function aplicarModo(nuevoModo) {
    modo = nuevoModo;
    const t = TEXTOS[modo];
    ['materia', 'fijo', 'otro'].forEach(function (m) { dialogo.classList.toggle('modo-' + m, m === modo); });
    document.getElementById('regla-alumnos').hidden = modo !== 'fijo';
    document.getElementById('etiqueta-regla-titulo').textContent = t.titulo;
    document.getElementById('etiqueta-regla-desde').textContent = t.desde;
    document.getElementById('etiqueta-regla-hasta').textContent = t.hasta;
    document.getElementById('etiqueta-regla-lugar').textContent = t.lugar;
    document.getElementById('etiqueta-regla-notas').textContent = t.notas;
    campos.lugar.placeholder = t.lugarEjemplo;
  }

  function escribirCampos(valores) {
    Object.keys(campos).forEach(function (clave) {
      campos[clave].value = valores[clave] != null ? valores[clave] : '';
    });
    selectorAlumnos.fijar(valores.alumno_id || '');
    botonesDias.fijar(valores.dias || '');
  }

  function mostrarError(mensaje) {
    document.getElementById('error-regla').textContent = mensaje;
  }

  function ocupado(si) {
    ['guardar-regla', 'archivar-regla', 'borrar-regla'].forEach(function (id) {
      document.getElementById(id).disabled = si;
    });
  }

  function areaDelModo() {
    return modo === 'materia' ? S.AREA_DE.materias : modo === 'fijo' ? S.AREA_DE.fijos : campos.area.value;
  }

  function abrirNueva(nuevoModo) {
    idEnEdicion = null;
    aplicarModo(nuevoModo);
    document.getElementById('titulo-dialogo-regla').textContent = TEXTOS[modo].nuevo;
    document.getElementById('archivar-regla').hidden = true;
    document.getElementById('borrar-regla').hidden = true;
    const mes = S.limitesDelMes(campoMes.value);
    const area = modo === 'otro' ? AREAS_OTROS[0] : areaDelModo();
    escribirCampos({
      titulo: '', area: area, dias: '', inicio: '09:00',
      fin: KodamaFormas.finPara('09:00', KodamaFormas.porArea(area).duracion),
      desde: modo === 'fijo' ? mes.desde : KodamaFecha.hoy(),
      hasta: modo === 'fijo' ? mes.hasta : '',
      lugar: '', etiqueta: '', notas: ''
    });
    campos.area.value = area;
    horas.reiniciar(true);
    lugarAutomatico = true;
    mostrarError('');
    dialogo.showModal();
    if (modo === 'fijo') selectorAlumnos.enfocar();
    else campos.titulo.focus();
  }

  function abrirEdicion(regla) {
    idEnEdicion = regla.id;
    aplicarModo(MODO_DE_SECCION[S.seccionDe(regla)]);
    document.getElementById('titulo-dialogo-regla').textContent = TEXTOS[modo].editar;
    // Materias y otros se archivan; los fijos de Fractal se borran.
    document.getElementById('archivar-regla').hidden = modo === 'fijo' || regla.archivado === 'TRUE';
    document.getElementById('borrar-regla').hidden = modo !== 'fijo';
    escribirCampos(regla);
    campos.area.value = areaDelModo() || regla.area;
    horas.reiniciar(false);
    mostrarError('');
    dialogo.showModal();
  }

  /** Solo lo que cambió en cantidad (regenerar actualiza todo el horario, eso no se cuenta). */
  function resumenClases(generado) {
    if (!generado) return '';
    const partes = [];
    if (generado.creados) partes.push(generado.creados + (generado.creados === 1 ? ' clase nueva' : ' clases nuevas'));
    if (generado.archivados) partes.push(generado.archivados + (generado.archivados === 1 ? ' clase quitada' : ' clases quitadas'));
    return partes.length ? ' ' + partes.join(', ') + '.' : '';
  }

  function reemplazarRegla(regla) {
    const limpia = Object.assign({}, regla);
    delete limpia.generado;
    const i = reglas.findIndex(function (r) { return r.id === limpia.id; });
    if (i === -1) reglas.push(limpia); else reglas[i] = limpia;
  }

  document.getElementById('form-regla').addEventListener('submit', async function (evento) {
    evento.preventDefault();
    const datos = {};
    Object.keys(campos).forEach(function (clave) { datos[clave] = campos[clave].value; });
    datos.area = areaDelModo();
    datos.alumno_id = modo === 'fijo' ? selectorAlumnos.valor() : '';
    if (modo !== 'otro') datos.etiqueta = '';
    datos.dias = botonesDias.valor();

    if (modo === 'fijo' && !datos.alumno_id) {
      mostrarError('Elige al menos un alumno.');
      selectorAlumnos.enfocar();
      return;
    }
    if (modo !== 'fijo' && !datos.titulo.trim()) {
      mostrarError(modo === 'materia' ? 'Falta el nombre de la materia.' : 'Falta el título.');
      campos.titulo.focus();
      return;
    }
    if (!datos.dias) {
      mostrarError('Marca al menos un día.');
      botonesDias.enfocar();
      return;
    }
    if (!horas.valido()) {
      mostrarError('El fin tiene que ser después del inicio.');
      campos.fin.focus();
      return;
    }
    if (!datos.desde || !datos.hasta) {
      mostrarError('Faltan las fechas: ' + TEXTOS[modo].desde.toLowerCase() + ' y ' + TEXTOS[modo].hasta.toLowerCase() + '.');
      (datos.desde ? campos.hasta : campos.desde).focus();
      return;
    }

    mostrarError('');
    ocupado(true);
    try {
      const guardada = idEnEdicion
        ? await pedir('actualizarRegla', { id: idEnEdicion, cambios: datos, regenerar: true })
        : await pedir('crearRegla', { regla: datos, regenerar: true });
      reemplazarRegla(guardada);
      dialogo.close();
      pintar();
      avisar('Guardado.' + resumenClases(guardada.generado));
    } catch (error) {
      // Se deja el diálogo abierto con lo escrito, para poder corregir.
      mostrarError('No se pudo guardar: ' + error.message);
    } finally {
      ocupado(false);
    }
  });

  document.getElementById('cancelar-regla').addEventListener('click', function () { dialogo.close(); });

  document.getElementById('archivar-regla').addEventListener('click', async function () {
    if (!idEnEdicion) return;
    const texto = modo === 'materia'
      ? '¿Archivar esta materia? Deja de repetirse y sus clases de hoy en adelante se quitan de la grilla.'
      : '¿Archivar este horario? Deja de repetirse y sus clases de hoy en adelante se quitan de la grilla.';
    if (!confirm(texto)) return;
    ocupado(true);
    try {
      const archivada = await pedir('archivarRegla', { id: idEnEdicion, regenerar: true });
      reemplazarRegla(archivada);
      dialogo.close();
      pintar();
      avisar('Archivada.' + resumenClases(archivada.generado));
    } catch (error) {
      mostrarError('No se pudo archivar: ' + error.message);
    } finally {
      ocupado(false);
    }
  });

  document.getElementById('borrar-regla').addEventListener('click', async function () {
    if (!idEnEdicion) return;
    if (!confirm('¿Borrar este alumno fijo? Se borran sus clases de hoy en adelante; las pasadas quedan para el cobro.')) return;
    ocupado(true);
    try {
      const r = await pedir('borrarRegla', { id: idEnEdicion });
      const id = idEnEdicion;
      reglas = reglas.filter(function (x) { return x.id !== id; });
      dialogo.close();
      pintar();
      avisar('Borrado. Se quitaron ' + r.borradas + (r.borradas === 1 ? ' clase' : ' clases') + ' de hoy en adelante.');
    } catch (error) {
      mostrarError('No se pudo borrar: ' + error.message);
    } finally {
      ocupado(false);
    }
  });

  // --- Clases sueltas marcadas "fijo" ------------------------------------------

  async function pasarAVariable(lista, boton) {
    if (boton) boton.disabled = true;
    try {
      for (const b of lista) {
        await pedir('actualizarBloque', { id: b.id, cambios: { tipo: 'variable' } });
        sueltos = sueltos.filter(function (x) { return x.id !== b.id; });
      }
      avisar(lista.length === 1 ? 'Pasada a variable.' : 'Pasadas a variable.');
    } catch (error) {
      avisar('No se pudo cambiar: ' + error.message);
    } finally {
      if (boton) boton.disabled = false;
      pintarSueltos();
    }
  }

  async function borrarSuelta(b, boton) {
    if (!confirm('¿Borrar la clase del ' + KodamaFecha.diaCorto(b.fecha) + ' ' + b.inicio + '? No se puede deshacer.')) return;
    boton.disabled = true;
    try {
      await pedir('borrarBloque', { id: b.id });
      sueltos = sueltos.filter(function (x) { return x.id !== b.id; });
      avisar('Clase borrada.');
    } catch (error) {
      avisar('No se pudo borrar: ' + error.message);
    } finally {
      boton.disabled = false;
      pintarSueltos();
    }
  }

  document.getElementById('sueltos-todas').addEventListener('click', function () {
    pasarAVariable(sueltos.slice(), this);
  });

  document.getElementById('nueva-materia').addEventListener('click', function () { abrirNueva('materia'); });
  document.getElementById('nuevo-fijo').addEventListener('click', function () { abrirNueva('fijo'); });
  document.getElementById('nuevo-otro').addEventListener('click', function () { abrirNueva('otro'); });

  document.getElementById('regenerar').addEventListener('click', async function () {
    resultadoRegenerar.textContent = 'Regenerando...';
    const op = KodamaMedicion.empezar('generar');
    try {
      const datos = await pedir('generarHorario');
      op.cerrarRed();
      op.render(function () {
        resultadoRegenerar.textContent = 'Listo: ' + datos.creados + ' creados, ' +
          datos.actualizados + ' actualizados, ' + datos.archivados + ' archivados.';
      });
      op.pintado().then(function () { op.terminar(true); });
    } catch (error) {
      op.terminar(false);
      resultadoRegenerar.textContent = 'Error: ' + error.message;
    }
  });

  mostrarSeccion(seccion);
  KodamaAlumnos.cargar().catch(function () { /* sin conexión: quedan los guardados */ });
  await cargar();
  KodamaCarga.listo();
})();
