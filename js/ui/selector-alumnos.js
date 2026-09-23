/**
 * Campo "Alumnos" con autocompletado, para el formulario de bloques y el
 * de reglas del horario:
 * - sugerencias mientras se escribe (KodamaAlumnos.buscar), con teclado
 *   (flechas, Enter, Escape) o tocando;
 * - varios alumnos por clase (cada uno queda como una "ficha" con ✕);
 * - "Crear alumno nuevo" abre un mini formulario ADENTRO del mismo
 *   diálogo, sin salir ni perder lo escrito.
 *
 * Todo el texto que viene del Sheet se escribe con textContent.
 */
const KodamaSelectorAlumnos = (function () {
  let contador = 0;

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function campo(etiquetaTexto, control) {
    const envoltorio = el('div', 'selector-alumnos__campo');
    const etiqueta = el('label', null, etiquetaTexto);
    etiqueta.htmlFor = control.id;
    envoltorio.append(etiqueta, control);
    return envoltorio;
  }

  function opciones(selector, lista, textoVacio) {
    selector.replaceChildren();
    const vacia = el('option', null, textoVacio);
    vacia.value = '';
    selector.appendChild(vacia);
    lista.forEach(function (item) {
      const opcion = el('option', null, item.nombre + ' (' + item.corto + ')');
      opcion.value = item.nombre;
      selector.appendChild(opcion);
    });
  }

  /**
   * raiz: contenedor vacío donde se arma el campo.
   * crearAlumno(datos): promesa con el alumno creado (llama al backend).
   */
  function crear(raiz, config) {
    const n = ++contador;
    let elegidos = [];
    let sugerencias = [];
    let activo = -1;

    raiz.classList.add('selector-alumnos');
    raiz.replaceChildren();

    const etiqueta = el('label', null, 'Alumnos');
    const entrada = el('input');
    entrada.id = 'selector-alumnos-' + n;
    entrada.type = 'text';
    entrada.autocomplete = 'off';
    entrada.placeholder = 'Buscar por nombre, apellido o colegio';
    entrada.setAttribute('role', 'combobox');
    entrada.setAttribute('aria-autocomplete', 'list');
    entrada.setAttribute('aria-expanded', 'false');
    etiqueta.htmlFor = entrada.id;

    const fichas = el('ul', 'selector-alumnos__elegidos');
    fichas.setAttribute('aria-label', 'Alumnos elegidos');
    const lista = el('ul', 'selector-alumnos__sugerencias');
    lista.id = 'selector-alumnos-lista-' + n;
    lista.setAttribute('role', 'listbox');
    lista.hidden = true;
    entrada.setAttribute('aria-controls', lista.id);

    // Mini formulario de alumno nuevo (divs, no <form>: está dentro del
    // formulario del bloque y los formularios no se pueden anidar).
    const nuevo = el('div', 'selector-alumnos__nuevo');
    nuevo.hidden = true;
    const nNombre = el('input'); nNombre.id = 'nuevo-alumno-nombre-' + n; nNombre.autocapitalize = 'words';
    const nApellido = el('input'); nApellido.id = 'nuevo-alumno-apellido-' + n; nApellido.autocapitalize = 'words';
    const nCurso = el('select'); nCurso.id = 'nuevo-alumno-curso-' + n;
    const nColegio = el('select'); nColegio.id = 'nuevo-alumno-colegio-' + n;
    const nTarifa = el('input'); nTarifa.id = 'nuevo-alumno-tarifa-' + n; nTarifa.inputMode = 'decimal';
    const nPago = el('select'); nPago.id = 'nuevo-alumno-pago-' + n;
    [['hora', 'Por hora'], ['mensual', 'Mensual']].forEach(function (par) {
      const o = el('option', null, par[1]); o.value = par[0]; nPago.appendChild(o);
    });
    const nError = el('p', 'error');
    nError.setAttribute('role', 'alert');
    const nCrear = el('button', null, 'Crear y agregar'); nCrear.type = 'button';
    const nCancelar = el('button', 'secundario', 'Cancelar'); nCancelar.type = 'button';
    const nAcciones = el('div', 'acciones-dialogo');
    nAcciones.append(nCancelar, nCrear);
    nuevo.append(
      el('p', 'selector-alumnos__titulo-nuevo', 'Alumno nuevo'),
      campo('Nombre', nNombre), campo('Apellido', nApellido),
      campo('Curso', nCurso), campo('Colegio', nColegio),
      campo('Tarifa por hora (Bs)', nTarifa), campo('Forma de pago', nPago),
      nError, nAcciones
    );

    raiz.append(etiqueta, fichas, entrada, lista, nuevo);

    function pintarElegidos() {
      fichas.replaceChildren();
      elegidos.forEach(function (id) {
        const alumno = KodamaAlumnos.porId(id);
        const li = el('li', 'selector-alumnos__ficha');
        li.appendChild(el('span', null, alumno ? KodamaAlumnos.etiqueta(alumno) : id));
        const quitar = el('button', 'selector-alumnos__quitar', '✕');
        quitar.type = 'button';
        quitar.setAttribute('aria-label', 'Quitar ' + (alumno ? KodamaAlumnos.nombreCompleto(alumno) : id));
        quitar.addEventListener('click', function () {
          elegidos = elegidos.filter(function (x) { return x !== id; });
          pintarElegidos();
          entrada.focus();
        });
        li.appendChild(quitar);
        fichas.appendChild(li);
      });
    }

    function cerrarLista() {
      lista.hidden = true;
      entrada.setAttribute('aria-expanded', 'false');
      entrada.removeAttribute('aria-activedescendant');
      activo = -1;
    }

    function marcarActivo(indice) {
      activo = indice;
      Array.prototype.forEach.call(lista.children, function (li, i) {
        li.setAttribute('aria-selected', String(i === activo));
      });
      if (activo >= 0) entrada.setAttribute('aria-activedescendant', lista.children[activo].id);
    }

    function pintarSugerencias() {
      const texto = entrada.value.trim();
      lista.replaceChildren();
      if (!texto) {
        cerrarLista();
        return;
      }
      sugerencias = KodamaAlumnos.buscar(texto, null, { limite: 6, excluir: elegidos });
      sugerencias.forEach(function (alumno, i) {
        const li = el('li', 'selector-alumnos__sugerencia', KodamaAlumnos.etiqueta(alumno));
        li.id = lista.id + '-' + i;
        li.setAttribute('role', 'option');
        // mousedown (no click): se elige antes de que el campo pierda el foco.
        li.addEventListener('mousedown', function (e) { e.preventDefault(); elegir(alumno.id); });
        lista.appendChild(li);
      });
      const crearLi = el('li', 'selector-alumnos__sugerencia selector-alumnos__crear', '+ Crear alumno "' + texto + '"');
      crearLi.id = lista.id + '-nuevo';
      crearLi.setAttribute('role', 'option');
      crearLi.addEventListener('mousedown', function (e) { e.preventDefault(); abrirNuevo(texto); });
      lista.appendChild(crearLi);
      lista.hidden = false;
      entrada.setAttribute('aria-expanded', 'true');
      marcarActivo(sugerencias.length ? 0 : -1);
    }

    function elegir(id) {
      if (elegidos.indexOf(id) === -1) elegidos.push(id);
      entrada.value = '';
      cerrarLista();
      pintarElegidos();
      entrada.focus();
    }

    function abrirNuevo(texto) {
      cerrarLista();
      const palabras = texto.trim().split(/\s+/);
      nNombre.value = palabras[0] || '';
      nApellido.value = palabras.slice(1).join(' ');
      const dir = KodamaAlumnos.actual();
      opciones(nCurso, dir.cursos, '— Curso —');
      opciones(nColegio, dir.colegios, '— Colegio —');
      nTarifa.value = '';
      nPago.value = 'hora';
      nError.textContent = '';
      nuevo.hidden = false;
      nNombre.focus();
    }

    async function crearNuevo() {
      nError.textContent = '';
      if (!nNombre.value.trim()) {
        nError.textContent = 'Falta el nombre.';
        nNombre.focus();
        return;
      }
      nCrear.disabled = true;
      try {
        const alumno = await config.crearAlumno({
          nombre: nNombre.value, apellido: nApellido.value, curso: nCurso.value,
          colegio: nColegio.value, tarifa_hora: nTarifa.value, forma_pago: nPago.value, notas: ''
        });
        KodamaAlumnos.aplicarAlumno(alumno);
        nuevo.hidden = true;
        entrada.value = '';
        elegir(alumno.id);
      } catch (error) {
        // Queda abierto con lo escrito, para corregir.
        nError.textContent = 'No se pudo crear: ' + error.message;
      } finally {
        nCrear.disabled = false;
      }
    }

    entrada.addEventListener('input', pintarSugerencias);
    entrada.addEventListener('blur', function () { setTimeout(cerrarLista, 150); });
    entrada.addEventListener('keydown', function (e) {
      const total = lista.children.length;
      if (e.key === 'ArrowDown' && total) {
        e.preventDefault();
        if (lista.hidden) pintarSugerencias();
        marcarActivo((activo + 1) % total);
      } else if (e.key === 'ArrowUp' && total) {
        e.preventDefault();
        marcarActivo((activo - 1 + total) % total);
      } else if (e.key === 'Enter') {
        // Enter nunca envía el formulario del bloque desde este campo.
        e.preventDefault();
        if (lista.hidden || activo < 0) return;
        if (activo < sugerencias.length) elegir(sugerencias[activo].id);
        else abrirNuevo(entrada.value);
      } else if (e.key === 'Escape' && !lista.hidden) {
        e.preventDefault();
        e.stopPropagation(); // que Escape cierre la lista, no el diálogo
        cerrarLista();
      } else if (e.key === 'Backspace' && !entrada.value && elegidos.length) {
        elegidos.pop();
        pintarElegidos();
      }
    });

    [nNombre, nApellido, nTarifa].forEach(function (control) {
      control.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); crearNuevo(); }
      });
    });
    nCrear.addEventListener('click', crearNuevo);
    nCancelar.addEventListener('click', function () { nuevo.hidden = true; entrada.focus(); });

    return {
      /** "a1,a2" → muestra esos alumnos elegidos. */
      fijar: function (texto) {
        elegidos = KodamaAlumnos.idsDe(texto);
        entrada.value = '';
        nuevo.hidden = true;
        cerrarLista();
        pintarElegidos();
      },
      valor: function () { return elegidos.join(','); },
      repintar: pintarElegidos,
      enfocar: function () { entrada.focus(); }
    };
  }

  return { crear: crear };
})();
