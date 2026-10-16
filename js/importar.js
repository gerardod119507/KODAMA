/**
 * Configuración → importar filas pegadas. Primero una vista previa (no se
 * escribe nada), después se confirma.
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
    if (!KodamaApi.haySesion()) throw new Error('falta iniciar sesión (arriba)');
    const respuesta = await KodamaApi.llamar(accion, parametros);
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
})();
