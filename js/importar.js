/**
 * Configuración → importar filas pegadas y vincular alumnos en las clases
 * de Fractal. Las dos cosas funcionan igual: primero una vista previa (el
 * backend no escribe nada), después se confirma.
 */
(function () {
  const AYUDA = {
    alumnos: 'Columnas (en este orden si no pegas encabezados): nombre, apellido, curso, colegio, ' +
      'tarifa por hora, forma de pago (hora o mensual), notas. Curso y colegio aceptan el código corto (4to, SA).',
    horario: 'Columnas (en este orden si no pegas encabezados): título, área, días, inicio, fin, desde, hasta, ' +
      'etiqueta, notas, alumnos (nombres separados por coma; tienen que existir). También sirve copiar la hoja Horario entera.',
    historico: 'Clases de Academia Fractal que ya pasaron. Columnas (en este orden si no pegas encabezados): alumno ' +
      '(varios separados por coma), fecha, inicio, fin, y opcionales tema, lugar, notas. Se cargan como "dictadas". ' +
      'Un alumno que no existe se crea (nombre y apellido); si hay dos con el mismo nombre, escribe el apellido.'
  };
  const NOMBRE_ESTADO = { crear: 'Crear', actualizar: 'Actualizar', sin_cambios: 'Sin cambios', error: 'Error' };

  const modo = document.getElementById('modo-importar');
  const texto = document.getElementById('texto-importar');
  const zonaPrevia = document.getElementById('zona-previa');
  const resultado = document.getElementById('resultado-importar');
  const botonAplicar = document.getElementById('aplicar-importar');
  let previaActual = null; // { modo, texto } de la última vista previa

  function el(etiqueta, clase, contenido) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (contenido != null) nodo.textContent = contenido;
    return nodo;
  }

  async function pedir(accion, parametros) {
    const config = KodamaApi.leerConfig();
    if (!config.url || !config.token) throw new Error('falta configurar la conexión (arriba)');
    const respuesta = await KodamaApi.llamar(config.url, config.token, accion, parametros);
    if (!respuesta.ok) throw new Error(respuesta.error);
    return respuesta.data;
  }

  function pintarAyuda() {
    document.getElementById('ayuda-importar').textContent = AYUDA[modo.value];
  }
  modo.addEventListener('change', function () {
    pintarAyuda();
    zonaPrevia.hidden = true;
  });
  texto.addEventListener('input', function () { zonaPrevia.hidden = true; });
  pintarAyuda();

  function pintarPrevia(datos) {
    const r = datos.resumen;
    const partes = [r.crear + ' para crear', r.actualizar + ' para actualizar', r.sin_cambios + ' sin cambios'];
    if (r.error) partes.push(r.error + ' con errores (no se importan)');
    let resumen = partes.join(' · ') + '.';
    if (datos.alumnosNuevos && datos.alumnosNuevos.length) {
      resumen += ' Alumnos nuevos: ' + datos.alumnosNuevos.join(', ') + ' (después completa su tarifa en Alumnos).';
    }
    const nuevos = datos.catalogosNuevos.cursos.concat(datos.catalogosNuevos.colegios);
    if (nuevos.length) {
      resumen += ' Se agregan al catálogo: ' + nuevos.map(function (c) { return c.nombre; }).join(', ') +
        ' (después puedes editar su código corto en Alumnos).';
    }
    document.getElementById('resumen-importar').textContent = resumen;

    const lista = document.getElementById('filas-importar');
    lista.replaceChildren();
    datos.filas.forEach(function (fila) {
      const li = el('li', 'fila-importar fila-importar--' + fila.estado);
      li.appendChild(el('span', 'fila-importar__estado', NOMBRE_ESTADO[fila.estado] || fila.estado));
      li.appendChild(el('span', 'fila-importar__numero', 'Fila ' + fila.numero));
      li.appendChild(el('span', 'fila-importar__detalle', fila.detalle));
      lista.appendChild(li);
    });

    const aEscribir = r.crear + r.actualizar;
    botonAplicar.hidden = aEscribir === 0;
    botonAplicar.textContent = 'Importar ' + aEscribir + (aEscribir === 1 ? ' fila' : ' filas');
    zonaPrevia.hidden = false;
  }

  document.getElementById('previa-importar').addEventListener('click', async function () {
    resultado.textContent = '';
    if (!texto.value.trim()) {
      resultado.textContent = 'Pega al menos una fila.';
      return;
    }
    this.disabled = true;
    resultado.textContent = 'Revisando...';
    try {
      previaActual = { modo: modo.value, texto: texto.value };
      pintarPrevia(await pedir('importar', { modo: previaActual.modo, texto: previaActual.texto, aplicar: false }));
      resultado.textContent = '';
    } catch (error) {
      resultado.textContent = 'Error: ' + error.message;
    } finally {
      this.disabled = false;
    }
  });

  botonAplicar.addEventListener('click', async function () {
    if (!previaActual) return;
    botonAplicar.disabled = true;
    resultado.textContent = 'Importando...';
    try {
      const datos = await pedir('importar', { modo: previaActual.modo, texto: previaActual.texto, aplicar: true });
      const r = datos.resumen;
      resultado.textContent = 'Listo: ' + r.crear + ' creados, ' + r.actualizar + ' actualizados' +
        (r.error ? ', ' + r.error + ' filas con errores quedaron afuera' : '') + '.' +
        (datos.modo === 'horario' ? ' Toca "Generar horario del semestre" para crear los bloques.' : '');
      zonaPrevia.hidden = true;
      texto.value = '';
      previaActual = null;
    } catch (error) {
      resultado.textContent = 'No se pudo importar: ' + error.message;
    } finally {
      botonAplicar.disabled = false;
    }
  });

  document.getElementById('cancelar-importar').addEventListener('click', function () {
    zonaPrevia.hidden = true;
    previaActual = null;
  });

  // --- Vincular alumnos en clases de Fractal -------------------------------

  const zonaMigrar = document.getElementById('zona-migrar');
  const resultadoMigrar = document.getElementById('resultado-migrar');

  function pintarMigracion(datos) {
    const lista = document.getElementById('filas-migrar');
    lista.replaceChildren();
    if (datos.filas.length === 0 && datos.sinResolver.length === 0) {
      document.getElementById('resumen-migrar').textContent =
        'No hay clases de Fractal con el nombre en el título: todo está vinculado.';
      document.getElementById('aplicar-migrar').hidden = true;
      zonaMigrar.hidden = false;
      return;
    }
    let resumen = datos.filas.length + ' clases para vincular.';
    if (datos.alumnosNuevos.length) resumen += ' Alumnos nuevos: ' + datos.alumnosNuevos.join(', ') + '.';
    if (datos.sinResolver.length) resumen += ' ' + datos.sinResolver.length + ' sin resolver (quedan igual, ver abajo).';
    document.getElementById('resumen-migrar').textContent = resumen;

    datos.filas.forEach(function (fila) {
      const li = el('li', 'fila-importar');
      const etiqueta = el('label', 'fila-migrar');
      const casilla = el('input');
      casilla.type = 'checkbox';
      casilla.checked = true;
      casilla.value = fila.id;
      etiqueta.appendChild(casilla);
      const donde = fila.hoja === 'Horario' ? 'Regla del horario' : 'Clase del ' + fila.fecha;
      const alumnos = fila.alumnos.map(function (a) { return a.nombre + (a.nuevo ? ' (nuevo)' : ''); }).join(', ');
      const texto = el('span', 'fila-importar__detalle',
        donde + ': "' + fila.tituloAntes + '" → ' + alumnos +
        (fila.tituloDespues ? ' · tema: ' + fila.tituloDespues : ''));
      etiqueta.appendChild(texto);
      li.appendChild(etiqueta);
      lista.appendChild(li);
    });
    // Sin casilla: no se pueden aplicar (nombre no reconocible o de varios alumnos).
    datos.sinResolver.forEach(function (fila) {
      const li = el('li', 'fila-importar fila-importar--error');
      li.appendChild(el('span', 'fila-importar__detalle',
        (fila.hoja === 'Horario' ? 'Regla del horario' : 'Clase') + ': "' + fila.titulo + '" — ' + fila.motivo));
      lista.appendChild(li);
    });
    document.getElementById('aplicar-migrar').hidden = datos.filas.length === 0;
    zonaMigrar.hidden = false;
  }

  document.getElementById('previa-migrar').addEventListener('click', async function () {
    this.disabled = true;
    resultadoMigrar.textContent = 'Buscando...';
    try {
      pintarMigracion(await pedir('migrarAlumnosFractal', { aplicar: false }));
      resultadoMigrar.textContent = '';
    } catch (error) {
      resultadoMigrar.textContent = 'Error: ' + error.message;
    } finally {
      this.disabled = false;
    }
  });

  document.getElementById('aplicar-migrar').addEventListener('click', async function () {
    const ids = Array.prototype.map.call(
      document.querySelectorAll('#filas-migrar input:checked'), function (c) { return c.value; });
    if (ids.length === 0) {
      resultadoMigrar.textContent = 'No marcaste ninguna clase.';
      return;
    }
    this.disabled = true;
    resultadoMigrar.textContent = 'Vinculando...';
    try {
      const datos = await pedir('migrarAlumnosFractal', { aplicar: true, ids: ids });
      resultadoMigrar.textContent = 'Listo: ' + ids.length + ' clases vinculadas' +
        (datos.alumnosNuevos.length ? ', ' + datos.alumnosNuevos.length + ' alumnos creados' : '') +
        '. Completa curso, colegio y tarifa en Alumnos.';
      zonaMigrar.hidden = true;
    } catch (error) {
      resultadoMigrar.textContent = 'No se pudo vincular: ' + error.message;
    } finally {
      this.disabled = false;
    }
  });
})();
