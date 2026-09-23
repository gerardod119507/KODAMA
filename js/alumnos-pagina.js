/**
 * Pantalla de alumnos: ver, buscar, crear, editar y archivar (nunca
 * borrar), y editar los catálogos de cursos y colegios.
 */
(async function () {
  const config = KodamaApi.leerConfig();
  const estado = document.getElementById('estado-alumnos');
  if (!config.url || !config.token) {
    estado.textContent = 'Falta configurar la conexión con tu hoja. ';
    const enlace = document.createElement('a');
    enlace.href = 'config.html';
    enlace.textContent = 'Configurar';
    estado.appendChild(enlace);
    return;
  }

  const lista = document.getElementById('lista-alumnos');
  const buscador = document.getElementById('buscar-alumno');
  const verArchivados = document.getElementById('ver-archivados');
  const dialogo = document.getElementById('dialogo-alumno');
  const dialogoCatalogo = document.getElementById('dialogo-catalogo');
  const campos = {
    nombre: document.getElementById('alumno-nombre'),
    apellido: document.getElementById('alumno-apellido'),
    curso: document.getElementById('alumno-curso'),
    colegio: document.getElementById('alumno-colegio'),
    tarifa_hora: document.getElementById('alumno-tarifa'),
    forma_pago: document.getElementById('alumno-pago'),
    lugar: document.getElementById('alumno-lugar'),
    notas: document.getElementById('alumno-notas')
  };
  let idEnEdicion = null;
  let catalogoEnEdicion = null; // { tipo, anterior }

  async function pedir(accion, parametros) {
    const respuesta = await KodamaApi.llamar(config.url, config.token, accion, parametros);
    if (!respuesta.ok) throw new Error(respuesta.error);
    return respuesta.data;
  }

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function textoPago(alumno) {
    const tarifa = alumno.tarifa_hora ? 'Bs ' + alumno.tarifa_hora + '/h' : 'sin tarifa';
    return tarifa + ' · paga ' + (alumno.forma_pago === 'mensual' ? 'por mes' : 'por hora') +
      (alumno.lugar ? ' · ' + alumno.lugar : '');
  }

  function pintarLista() {
    const dir = KodamaAlumnos.actual();
    const encontrados = KodamaAlumnos.buscar(buscador.value, dir, { incluirArchivados: verArchivados.checked });
    lista.replaceChildren();
    if (dir.alumnos.length === 0) {
      estado.textContent = 'Todavía no hay alumnos. Tocá "+" para agregar el primero, o importalos desde Configuración.';
      return;
    }
    estado.textContent = encontrados.length === 1 ? '1 alumno' : encontrados.length + ' alumnos';
    encontrados.forEach(function (alumno) {
      const tarjeta = el('button', 'regla');
      tarjeta.type = 'button';
      if (alumno.archivado === 'TRUE') tarjeta.classList.add('regla--archivada');
      tarjeta.appendChild(el('p', 'regla__titulo',
        KodamaAlumnos.etiqueta(alumno, dir) + (alumno.archivado === 'TRUE' ? ' (archivado)' : '')));
      tarjeta.appendChild(el('p', 'regla__meta', textoPago(alumno)));
      tarjeta.addEventListener('click', function () { abrir(alumno); });
      lista.appendChild(tarjeta);
    });
  }

  function pintarCatalogo(tipo) {
    const contenedor = document.getElementById('lista-' + tipo);
    contenedor.replaceChildren();
    KodamaAlumnos.actual()[tipo].forEach(function (item) {
      const boton = el('button', 'catalogo-item');
      boton.type = 'button';
      boton.appendChild(el('span', 'catalogo-item__corto', item.corto));
      boton.appendChild(el('span', 'catalogo-item__nombre', item.nombre));
      boton.addEventListener('click', function () { abrirCatalogo(tipo, item); });
      contenedor.appendChild(boton);
    });
  }

  function pintarTodo() {
    pintarLista();
    pintarCatalogo('cursos');
    pintarCatalogo('colegios');
  }

  function llenarSelector(selector, items, vacio) {
    selector.replaceChildren();
    const opcion = el('option', null, vacio);
    opcion.value = '';
    selector.appendChild(opcion);
    items.forEach(function (item) {
      const o = el('option', null, item.nombre + ' (' + item.corto + ')');
      o.value = item.nombre;
      selector.appendChild(o);
    });
  }

  function abrir(alumno) {
    const dir = KodamaAlumnos.actual();
    llenarSelector(campos.curso, dir.cursos, '— Sin curso —');
    llenarSelector(campos.colegio, dir.colegios, '— Sin colegio —');
    idEnEdicion = alumno ? alumno.id : null;
    document.getElementById('titulo-dialogo-alumno').textContent = alumno ? 'Editar alumno' : 'Nuevo alumno';
    document.getElementById('archivar-alumno').hidden = !alumno || alumno.archivado === 'TRUE';
    const valores = alumno || { forma_pago: 'hora' };
    Object.keys(campos).forEach(function (clave) {
      campos[clave].value = valores[clave] != null ? valores[clave] : '';
    });
    if (!campos.forma_pago.value) campos.forma_pago.value = 'hora';
    document.getElementById('error-alumno').textContent = '';
    dialogo.showModal();
    if (!alumno) campos.nombre.focus();
  }

  function ocupado(estadoOcupado) {
    document.getElementById('guardar-alumno').disabled = estadoOcupado;
    document.getElementById('archivar-alumno').disabled = estadoOcupado;
  }

  document.getElementById('form-alumno').addEventListener('submit', async function (evento) {
    evento.preventDefault();
    const datos = {};
    Object.keys(campos).forEach(function (clave) { datos[clave] = campos[clave].value; });
    if (!datos.nombre.trim()) {
      document.getElementById('error-alumno').textContent = 'Falta el nombre.';
      campos.nombre.focus();
      return;
    }
    ocupado(true);
    try {
      const guardado = idEnEdicion
        ? await pedir('actualizarAlumno', { id: idEnEdicion, cambios: datos })
        : await pedir('crearAlumno', { alumno: datos });
      KodamaAlumnos.aplicarAlumno(guardado);
      dialogo.close();
    } catch (error) {
      // Queda abierto con lo escrito, para corregir y volver a intentar.
      document.getElementById('error-alumno').textContent = 'No se pudo guardar: ' + error.message;
    } finally {
      ocupado(false);
    }
  });

  document.getElementById('archivar-alumno').addEventListener('click', async function () {
    if (!idEnEdicion) return;
    if (!confirm('¿Archivar este alumno? Deja de aparecer en las sugerencias; sus clases pasadas lo siguen mostrando.')) return;
    ocupado(true);
    try {
      KodamaAlumnos.aplicarAlumno(await pedir('archivarAlumno', { id: idEnEdicion }));
      dialogo.close();
    } catch (error) {
      document.getElementById('error-alumno').textContent = 'No se pudo archivar: ' + error.message;
    } finally {
      ocupado(false);
    }
  });

  document.getElementById('cancelar-alumno').addEventListener('click', function () { dialogo.close(); });
  document.getElementById('nuevo-alumno').addEventListener('click', function () { abrir(null); });
  buscador.addEventListener('input', pintarLista);
  verArchivados.addEventListener('change', pintarLista);

  // --- Catálogos --------------------------------------------------------

  function abrirCatalogo(tipo, item) {
    catalogoEnEdicion = { tipo: tipo, anterior: item ? item.nombre : null };
    const nombreTipo = tipo === 'cursos' ? 'curso' : 'colegio';
    document.getElementById('titulo-dialogo-catalogo').textContent = (item ? 'Editar ' : 'Nuevo ') + nombreTipo;
    document.getElementById('catalogo-nombre').value = item ? item.nombre : '';
    document.getElementById('catalogo-corto').value = item ? item.corto : '';
    document.getElementById('error-catalogo').textContent = '';
    dialogoCatalogo.showModal();
    document.getElementById('catalogo-nombre').focus();
  }

  document.getElementById('form-catalogo').addEventListener('submit', async function (evento) {
    evento.preventDefault();
    const boton = document.getElementById('guardar-catalogo');
    boton.disabled = true;
    try {
      await pedir('guardarCatalogo', {
        tipo: catalogoEnEdicion.tipo,
        anterior: catalogoEnEdicion.anterior,
        item: {
          nombre: document.getElementById('catalogo-nombre').value,
          corto: document.getElementById('catalogo-corto').value
        }
      });
      // Un cambio de nombre toca también a los alumnos: se recarga todo.
      await KodamaAlumnos.cargar();
      dialogoCatalogo.close();
    } catch (error) {
      document.getElementById('error-catalogo').textContent = 'No se pudo guardar: ' + error.message;
    } finally {
      boton.disabled = false;
    }
  });
  document.getElementById('cancelar-catalogo').addEventListener('click', function () { dialogoCatalogo.close(); });
  document.getElementById('nuevo-curso').addEventListener('click', function () { abrirCatalogo('cursos', null); });
  document.getElementById('nuevo-colegio').addEventListener('click', function () { abrirCatalogo('colegios', null); });

  // Lo guardado en el dispositivo se ve al instante; después se actualiza.
  KodamaAlumnos.alCambiar(pintarTodo);
  pintarTodo();
  if (KodamaAlumnos.actual().alumnos.length === 0) estado.textContent = 'Cargando...';
  try {
    await KodamaAlumnos.cargar();
  } catch (error) {
    estado.textContent = 'No se pudo actualizar (' + error.message + '). Se muestra lo guardado en este dispositivo.';
  }
})();
