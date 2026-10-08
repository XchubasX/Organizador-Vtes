// =====================================================================
// mudanza.js — MUDANZA A eternalschedule.com (octubre 2026)
// Solo actúa cuando la página se abre desde la dirección vieja de GitHub
// (xchubasx.github.io/...). En eternalschedule.com no hace nada.
//  - Antes de la fecha del salto: la página principal muestra la franja
//    "Elysium se mudó a eternalschedule.com" (sin botón de cerrar).
//  - Desde el jueves 8 oct 2026, 15:00 hora de México (se adelantó del
//    domingo 11 oct): la página salta sola
//    a la dirección nueva, conservando ciudad (/Zaragoza), enlace a mesa
//    (#mesa-…) y página (sorteo, estadísticas).
// Se carga primero en el <head> de las 3 páginas para saltar cuanto antes.
// Para dar más tiempo, basta con cambiar MUDANZA_REDIRIGE_DESDE.
// En la dirección vieja también cuenta visitas (Cloudflare Web Analytics, «xchubasx.github.io»).
// Al saltar agrega la marca ?desde=github; en la dirección nueva se borra de la barra
// y deja pendiente el aviso «¿Despertando del Torpor?» (js/ventanas.js, solo página principal).
// =====================================================================
var MUDANZA_DESTINOS = {
  'Organizador-Vtes': 'https://eternalschedule.com',
  'Vtes-UAT': 'https://uat.eternalschedule.com'
};
var MUDANZA_REDIRIGE_DESDE = Date.parse('2026-10-08T21:00:00Z'); // jueves 8 oct 2026, 15:00 en México (adelantado; antes domingo 11 oct)

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

// Marca que dice "llegó desde la dirección vieja". Va antes del #mesa-… (si lo hay).
var MUDANZA_MARCA = 'desde=github';
var MUDANZA_TORPOR_PENDIENTE_KEY = 'elysium_torpor_pendiente';
var MUDANZA_TORPOR_VISTO_KEY = 'elysium_torpor_visto';
var mudanzaLlegoDeGithub = false; // por si el navegador no deja guardar
function mudanzaConMarca(url) {
  var i = url.indexOf('#');
  var base = i < 0 ? url : url.slice(0, i);
  var ancla = i < 0 ? '' : url.slice(i);
  return base + (base.indexOf('?') < 0 ? '?' : '&') + MUDANZA_MARCA + ancla;
}

// En la dirección nueva: si trae la marca, la quita de la barra (para que el favorito
// y los enlaces salgan limpios) y deja pendiente el aviso, salvo que ya lo haya visto.
function mudanzaRecibirMarca() {
  var q = location.search || '';
  if (!/(^|[?&])desde=github(&|$)/.test(q)) return false;
  var limpio = q.replace(/^\?/, '').split('&').filter(function (x) { return x && x !== MUDANZA_MARCA; }).join('&');
  try { history.replaceState(history.state, '', location.pathname + (limpio ? '?' + limpio : '') + location.hash); } catch (e) { /* sin historial */ }
  mudanzaLlegoDeGithub = true;
  try { if (localStorage.getItem(MUDANZA_TORPOR_VISTO_KEY) !== '1') localStorage.setItem(MUDANZA_TORPOR_PENDIENTE_KEY, '1'); } catch (e) { /* sin almacenamiento */ }
  return true;
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

// Contador de visitas a la dirección VIEJA (Cloudflare Web Analytics, sin cookies ni datos personales).
// Solo en xchubasx.github.io; sirve para saber cuándo ya nadie la usa y se puede apagar.
var MUDANZA_CONTADOR_TOKEN = 'ad00e9d4434c4fb195d0bfbcd033696a';
function mudanzaPonerContador(alCargar) {
  var s = document.createElement('script');
  s.defer = true;
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon', JSON.stringify({ token: MUDANZA_CONTADOR_TOKEN }));
  s.onload = s.onerror = function () { if (alCargar) alCargar(); };
  (document.head || document.documentElement).appendChild(s);
  return s;
}

(function () {
  var destino = mudanzaDestinoActual();
  if (!destino) { mudanzaRecibirMarca(); return; } // eternalschedule.com: solo recibe la marca
  destino = mudanzaConMarca(destino);
  if (!mudanzaDebeRedirigir(Date.now())) { mudanzaPonerContador(); return; }
  // Desde la fecha del salto: se cuenta la visita y luego se salta (a lo mucho 1.5 s de espera)
  var listo = false;
  var saltar = function () { if (listo) return; listo = true; window.location.replace(destino); };
  mudanzaPonerContador(function () { setTimeout(saltar, 300); });
  setTimeout(saltar, 1500);
})();
