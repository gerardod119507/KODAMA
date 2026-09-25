/**
 * Días de la semana como 7 botones (Lun a Dom) que se marcan tocando, en
 * vez de escribirlos. El valor sigue siendo el texto que entiende el
 * backend ("Lun, Mié, Vie").
 */
const KodamaBotonesDias = (function () {
  function crear(contenedor) {
    let elegidos = [];
    contenedor.classList.add('botones-dias');
    contenedor.setAttribute('role', 'group');
    const botones = KodamaFormas.DIAS.map(function (nombre, i) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'boton-dia';
      b.textContent = nombre;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        const pos = elegidos.indexOf(i);
        if (pos === -1) elegidos.push(i); else elegidos.splice(pos, 1);
        pintar();
      });
      contenedor.appendChild(b);
      return b;
    });

    function pintar() {
      botones.forEach(function (b, i) { b.setAttribute('aria-pressed', String(elegidos.indexOf(i) !== -1)); });
    }

    return {
      fijar: function (texto) {
        elegidos = KodamaFormas.diasDeTexto(texto);
        pintar();
      },
      valor: function () {
        return KodamaFormas.textoDeDias(elegidos);
      },
      enfocar: function () { botones[0].focus(); }
    };
  }

  return { crear: crear };
})();
