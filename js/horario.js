/**
 * Editor de la hoja Horario desde la app: ver, crear, editar y archivar
 * las reglas del semestre, y regenerar sin abrir el Sheet.
 */
(async function () {
  const config = KodamaApi.leerConfig();
  if (!config.url || !config.token) {
    // Igual que en la vista principal: se avisa aquí, nunca se salta solo a
    // Configuración.
    const lista = document.getElementById('lista-reglas');
    const aviso = document.createElement('p');
    aviso.className = 'estado';
    aviso.textContent = 'Falta configurar la conexión con tu hoja. ';
    const enlace = document.createElement('a');
    enlace.href = 'config.html';
    enlace.textContent = 'Configurar';
    aviso.appendChild(enlace);
    lista.appendChild(aviso);
    return;
  }

  const AREAS = ['Universidad', 'Academia Fractal', 'Startup', 'Personal'];
  const lista = document.getElementById('lista-reglas');
  const dialogo = document.getElementById('dialogo-regla');
  const resultadoRegenerar = document.getElementById('resultado-regenerar');

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

  let idEnEdicion = null;
  let reglas = [];

  // Días como botones Lun–Dom (Checkpoint 9) y el fin que se completa solo.
  const botonesDias = KodamaBotonesDias.crear(document.getElementById('regla-dias'));
  const horas = KodamaHoras.conectar({
    area: campos.area, inicio: campos.inicio, fin: campos.fin,
    aviso: document.getElementById('aviso-horas-regla')
  });

  AREAS.forEach(function (area) {
    const opcion = document.createElement('option');
    opcion.value = area;
    opcion.textContent = area;
    campos.area.appendChild(opcion);
  });

  async function pedir(accion, parametros) {
    const respuesta = await KodamaApi.llamar(config.url, config.token, accion, parametros);
    if (!respuesta.ok) {
      throw new Error(respuesta.error);
    }
    return respuesta.data;
  }

  // Alumnos (solo Academia Fractal), igual que en el formulario de bloques.
  // En una regla NUEVA, el lugar se completa con el lugar habitual del
  // alumno elegido mientras no lo hayas escrito tú.
  let lugarAutomatico = false;
  const selectorAlumnos = KodamaSelectorAlumnos.crear(document.getElementById('regla-alumnos'), {
    crearAlumno: function (datos) { return pedir('crearAlumno', { alumno: datos }); },
    alCambiar: function (ids) {
      if (idEnEdicion || !lugarAutomatico) return;
      campos.lugar.value = KodamaAlumnos.lugarDeAlumnos(ids);
    }
  });
  campos.lugar.addEventListener('input', function () { lugarAutomatico = false; });
  function esFractal() {
    return campos.area.value === 'Academia Fractal';
  }
  function actualizarSegunArea() {
    document.getElementById('regla-alumnos').hidden = !esFractal();
    document.getElementById('etiqueta-regla-titulo').textContent = esFractal() ? 'Tema (opcional)' : 'Título';
  }
  campos.area.addEventListener('change', actualizarSegunArea);
  KodamaAlumnos.alCambiar(function () {
    selectorAlumnos.repintar();
    if (reglas.length) pintarReglas();
  });

  function mostrarError(mensaje) {
    document.getElementById('error-regla').textContent = mensaje;
  }

  function ocupado(estado) {
    document.getElementById('guardar-regla').disabled = estado;
    document.getElementById('archivar-regla').disabled = estado;
  }

  function crearTarjetaRegla(regla) {
    const tarjeta = document.createElement('button');
    tarjeta.type = 'button';
    tarjeta.className = 'regla';
    if (regla.archivado === 'TRUE') {
      tarjeta.classList.add('regla--archivada');
    }
    tarjeta.addEventListener('click', function () { abrirEdicion(regla); });

    const titulo = document.createElement('p');
    titulo.className = 'regla__titulo';
    // Con alumnos vinculados, el nombre sale de ellos (no del título).
    titulo.textContent = KodamaAlumnos.tituloDeBloque(regla) + (regla.archivado === 'TRUE' ? ' (archivada)' : '');
    tarjeta.appendChild(titulo);

    const meta = document.createElement('p');
    meta.className = 'regla__meta';
    meta.textContent = regla.dias + ' · ' + regla.inicio + '–' + regla.fin +
      (regla.lugar ? ' · ' + regla.lugar : '') + ' · ' + regla.area;
    tarjeta.appendChild(meta);

    const rango = document.createElement('p');
    rango.className = 'regla__meta';
    rango.textContent = regla.desde + ' a ' + regla.hasta + (regla.etiqueta ? ' · ' + regla.etiqueta : '');
    tarjeta.appendChild(rango);

    return tarjeta;
  }

  function pintarReglas() {
    lista.replaceChildren();
    if (reglas.length === 0) {
      const vacio = document.createElement('p');
      vacio.className = 'estado';
      vacio.textContent = 'Todavía no hay reglas. Toca "+" para agregar la primera.';
      lista.appendChild(vacio);
      return;
    }
    reglas.forEach(function (regla) { lista.appendChild(crearTarjetaRegla(regla)); });
  }

  async function cargar() {
    lista.replaceChildren();
    const cargando = document.createElement('p');
    cargando.className = 'estado';
    cargando.textContent = 'Cargando...';
    lista.appendChild(cargando);
    try {
      reglas = await pedir('listarHorario');
      pintarReglas();
    } catch (error) {
      lista.replaceChildren();
      const fallo = document.createElement('p');
      fallo.className = 'estado estado--error';
      fallo.textContent = 'No se pudo cargar: ' + error.message;
      lista.appendChild(fallo);
    }
  }

  function escribirCampos(valores) {
    Object.keys(campos).forEach(function (clave) {
      campos[clave].value = valores[clave] != null ? valores[clave] : '';
    });
    selectorAlumnos.fijar(valores.alumno_id || '');
    botonesDias.fijar(valores.dias || '');
    actualizarSegunArea();
  }

  function abrirNueva() {
    idEnEdicion = null;
    document.getElementById('titulo-dialogo-regla').textContent = 'Nueva regla';
    document.getElementById('archivar-regla').hidden = true;
    escribirCampos({
      titulo: '', area: 'Universidad', dias: '', inicio: '09:00',
      fin: KodamaFormas.finPara('09:00', KodamaFormas.porArea('Universidad').duracion),
      desde: KodamaFecha.hoy(), hasta: '', lugar: '', etiqueta: '', notas: ''
    });
    horas.reiniciar(true);
    lugarAutomatico = true;
    mostrarError('');
    dialogo.showModal();
    campos.titulo.focus();
  }

  function abrirEdicion(regla) {
    idEnEdicion = regla.id;
    document.getElementById('titulo-dialogo-regla').textContent = 'Editar regla';
    document.getElementById('archivar-regla').hidden = regla.archivado === 'TRUE';
    escribirCampos(regla);
    horas.reiniciar(false);
    mostrarError('');
    dialogo.showModal();
  }

  document.getElementById('form-regla').addEventListener('submit', async function (evento) {
    evento.preventDefault();
    const datos = {};
    Object.keys(campos).forEach(function (clave) { datos[clave] = campos[clave].value; });
    datos.alumno_id = esFractal() ? selectorAlumnos.valor() : '';
    datos.dias = botonesDias.valor();

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

    if (!datos.titulo.trim() && !datos.alumno_id) {
      mostrarError(esFractal() ? 'Elige al menos un alumno (o escribe un tema).' : 'Falta el título.');
      if (esFractal()) selectorAlumnos.enfocar();
      else campos.titulo.focus();
      return;
    }

    mostrarError('');
    ocupado(true);
    try {
      if (idEnEdicion) {
        await pedir('actualizarRegla', { id: idEnEdicion, cambios: datos });
      } else {
        await pedir('crearRegla', { regla: datos });
      }
      dialogo.close();
      await cargar();
    } catch (error) {
      // Se deja el diálogo abierto con lo escrito, para poder corregir.
      mostrarError('No se pudo guardar: ' + error.message);
    } finally {
      ocupado(false);
    }
  });

  document.getElementById('cancelar-regla').addEventListener('click', function () {
    dialogo.close();
  });

  document.getElementById('archivar-regla').addEventListener('click', async function () {
    if (!idEnEdicion) return;
    if (!confirm('¿Archivar esta regla? Deja de generar bloques. Los futuros se archivan al regenerar.')) {
      return;
    }
    ocupado(true);
    try {
      await pedir('archivarRegla', { id: idEnEdicion });
      dialogo.close();
      await cargar();
    } catch (error) {
      mostrarError('No se pudo archivar: ' + error.message);
    } finally {
      ocupado(false);
    }
  });

  document.getElementById('nueva-regla').addEventListener('click', abrirNueva);

  document.getElementById('regenerar').addEventListener('click', async function () {
    resultadoRegenerar.textContent = 'Regenerando...';
    try {
      const datos = await pedir('generarHorario');
      resultadoRegenerar.textContent = 'Listo: ' + datos.creados + ' creados, ' +
        datos.actualizados + ' actualizados, ' + datos.archivados + ' archivados.';
    } catch (error) {
      resultadoRegenerar.textContent = 'Error: ' + error.message;
    }
  });

  KodamaAlumnos.cargar().catch(function () { /* sin conexión: quedan los guardados */ });
  await cargar();
})();
