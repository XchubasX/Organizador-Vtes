// =====================================================================
// mudanza.js — MUDANZA A eternalschedule.com (octubre 2026)
// Solo actúa cuando la página se abre desde la dirección vieja de GitHub
// (xchubasx.github.io/...). En eternalschedule.com no hace nada.
//  - Hasta el sábado 10 oct: la página principal muestra la franja
//    "Elysium se mudó a eternalschedule.com" (sin botón de cerrar).
//  - Desde el domingo 11 oct, 00:00 hora de México: la página salta sola
//    a la dirección nueva, conservando ciudad (/Zaragoza), enlace a mesa
//    (#mesa-…) y página (sorteo, estadísticas).
// Se carga primero en el <head> de las 3 páginas para saltar cuanto antes.
// Para dar más tiempo, basta con cambiar MUDANZA_REDIRIGE_DESDE.
// =====================================================================
var MUDANZA_DESTINOS = {
  'Organizador-Vtes': 'https://eternalschedule.com',
  'Vtes-UAT': 'https://uat.eternalschedule.com'
};
var MUDANZA_REDIRIGE_DESDE = Date.parse('2026-10-11T06:00:00Z'); // domingo 11 oct 2026, 00:00 en México

// Calcula la dirección nueva equivalente, o null si no es la dirección vieja de GitHub.
function mudanzaDestino(host, ruta, busqueda, ancla) {
  if (!/\.github\.io$/i.test(host || '')) return null;
  var partes = (ruta || '').split('/').filter(Boolean);
  var base = MUDANZA_DESTINOS[partes.shift()];
  if (!base) return null;
  var resto = partes.join('/');
  if (resto === 'index.html') resto = '';
  return base + '/' + resto + (busqueda || '') + (ancla || '');
}

function mudanzaDestinoActual() {
  return mudanzaDestino(location.hostname, location.pathname, location.search, location.hash);
}

function mudanzaDebeRedirigir(ahoraMs) {
  return ahoraMs >= MUDANZA_REDIRIGE_DESDE;
}

// Muestra la franja (solo página principal, la llama arranque.js). `destino` se puede forzar para pruebas.
function mostrarAvisoMudanza(destino) {
  var d = destino || mudanzaDestinoActual();
  var aviso = document.getElementById('avisoMudanza');
  if (!d || !aviso) return;
  var base = d.replace(/^(https:\/\/[^/]+).*$/, '$1');
  document.getElementById('avisoMudanzaDominio').textContent = base.replace('https://', '');
  var boton = document.getElementById('avisoMudanzaBoton');
  boton.textContent = 'Ir a ' + base.replace('https://', '');
  boton.href = d;
  // Al tocarlo se recalcula, por si la dirección cambió (otra mesa, filtro de ciudad).
  boton.onclick = function () { var ahora = destino || mudanzaDestinoActual(); if (ahora) boton.href = ahora; };
  aviso.classList.remove('hidden');
}

(function () {
  var destino = mudanzaDestinoActual();
  if (destino && mudanzaDebeRedirigir(Date.now())) window.location.replace(destino);
})();
