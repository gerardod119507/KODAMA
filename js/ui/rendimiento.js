/**
 * Panel "Rendimiento" de Configuración: lo que midió js/medicion.js en este
 * dispositivo. Por operación: promedio, peor caso y en qué se fue el
 * tiempo (red, render, resto; y dentro de la red, el servidor). Debajo, las
 * últimas 20 mediciones. Todo con textContent.
 */
const KodamaRendimiento = (function () {
  const M = KodamaMedicion;

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function hora(en) {
    const fecha = new Date(en);
    const opciones = { timeZone: 'America/La_Paz' };
    const dia = fecha.toLocaleDateString('es', Object.assign({ day: 'numeric', month: 'short' }, opciones));
    const hoy = new Date().toLocaleDateString('es', Object.assign({ day: 'numeric', month: 'short' }, opciones));
    const hm = fecha.toLocaleTimeString('es', Object.assign({ hour: '2-digit', minute: '2-digit', hour12: false }, opciones));
    return dia === hoy ? hm : dia + ' ' + hm;
  }

  /** "Red 1,8 s (86 %)"; la parte más grande va resaltada: ahí está el cuello de botella. */
  function partes(linea, lista, total) {
    const mayor = Math.max.apply(null, lista.map(function (p) { return p.ms || 0; }));
    lista.forEach(function (p, i) {
      if (i) linea.appendChild(document.createTextNode(' · '));
      const pct = M.porcentaje(p.ms, total);
      const texto = p.nombre + ' ' + M.texto(p.ms) + (pct === null ? '' : ' (' + pct + ' %)');
      linea.appendChild(p.ms === mayor && mayor > 0 ? el('strong', null, texto) : document.createTextNode(texto));
    });
  }

  function tarjeta(r) {
    const t = el('article', 'rendimiento__tarjeta');
    const cabeza = el('p', 'rendimiento__nombre');
    cabeza.appendChild(el('span', null, r.nombre));
    cabeza.appendChild(el('span', 'rendimiento__n',
      r.n + (r.n === 1 ? ' medición' : ' mediciones') + (r.errores ? ' · ' + r.errores + ' fallaron' : '')));
    t.appendChild(cabeza);
    if (r.total === null) {
      t.appendChild(el('p', 'nota', 'Ninguna salió bien todavía (sin conexión).'));
      return t;
    }
    t.appendChild(el('p', 'rendimiento__totales', 'Promedio ' + M.texto(r.total) + ' · Peor ' + M.texto(r.peor)));

    const linea = el('p', 'rendimiento__partes');
    if (r.tipo === 'llamada') {
      if (r.servidor === null) {
        linea.textContent = 'Todo es red (esta respuesta no trae el tiempo del servidor).';
      } else {
        partes(linea, [
          { nombre: 'Servidor', ms: r.servidor },
          { nombre: 'Internet y Google', ms: Math.max(0, r.total - r.servidor) }
        ], r.total);
      }
    } else {
      partes(linea, [
        { nombre: 'Red', ms: r.red },
        { nombre: 'Render', ms: r.render },
        { nombre: 'Resto', ms: r.resto }
      ], r.total);
    }
    t.appendChild(linea);

    if (r.tipo !== 'llamada' && r.red && r.servidor !== null) {
      t.appendChild(el('p', 'rendimiento__detalle',
        'De la red, el servidor (Apps Script) es ' + M.texto(r.servidor) + '; lo demás es internet y el arranque de Google.'));
    }
    if (r.tipo === 'apertura' && r.vista !== null) {
      t.appendChild(el('p', 'rendimiento__detalle', 'Algo visible a los ' + M.texto(r.vista) + ' (en promedio).'));
    }
    return t;
  }

  function fila(m) {
    let texto = hora(m.en) + ' · ' + m.nombre + ' · ' + M.texto(m.total);
    if (m.ok === false) {
      texto += ' · falló';
    } else if (m.tipo === 'llamada') {
      if (m.servidor !== null && m.servidor !== undefined) texto += ' — servidor ' + M.texto(m.servidor);
    } else {
      texto += ' — red ' + M.texto(m.red) + ' · render ' + M.texto(m.render);
    }
    return el('li', null, texto);
  }

  function pintar() {
    const resumen = document.getElementById('rendimiento-resumen');
    const ultimas = document.getElementById('rendimiento-ultimas');
    if (!resumen || !ultimas) return;
    const lista = M.leer();
    resumen.replaceChildren();
    ultimas.replaceChildren();
    if (!lista.length) {
      resumen.appendChild(el('p', 'nota', 'Todavía no hay mediciones. Usa la app como siempre y vuelve aquí.'));
      return;
    }
    M.resumen(lista).forEach(function (r) { resumen.appendChild(tarjeta(r)); });
    M.ultimas(20, lista).forEach(function (m) { ultimas.appendChild(fila(m)); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const actualizar = document.getElementById('rendimiento-actualizar');
    const borrar = document.getElementById('rendimiento-borrar');
    if (actualizar) actualizar.addEventListener('click', pintar);
    if (borrar) {
      borrar.addEventListener('click', function () {
        if (!window.confirm('¿Borrar todas las mediciones de este dispositivo?')) return;
        M.borrar();
        pintar();
      });
    }
    pintar();
  });

  return { pintar: pintar };
})();
