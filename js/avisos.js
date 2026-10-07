// =====================================================================
// js/avisos.js — AVISOS DE MESA EN EL CELULAR (lado del navegador)
// Tablero 24 del lienzo de diseño (aprobado 6 oct 2026).
// · Ventana «¿Te avisamos?» una sola vez por aparato, al crear una mesa o unirse.
// · Menú «🔔 Avisos» junto al nombre de la cuenta: activar, 15/30 min,
//   desactivar y «Mandarme un aviso de prueba».
// · iPhone abierto en Safari (no desde el ícono): guía para instalar.
// Se guarda en avisos/{uid}/{aparato}: token del aparato, minutos y zona
// horaria. Nada de correo ni teléfono. Los manda worker.js cada 5 min.
// =====================================================================
const AVISOS_DISP_KEY = 'elysium_avisos_disp';
const AVISOS_MIN_KEY = 'elysium_avisos_min';
const AVISOS_PREGUNTADO_KEY = 'elysium_avisos_preguntado';
let avisosActivos = false;   // este aparato tiene avisos activos para la cuenta actual
let avisosUidActual = null;  // cuenta con la que se activaron aquí (para borrarlos al cerrar sesión)

function leerLocal(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function guardarLocal(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

function minutosElegidos() { return leerLocal(AVISOS_MIN_KEY) === '15' ? 15 : 30; }
function idAparato() {
  let id = leerLocal(AVISOS_DISP_KEY);
  if (!id) { id = 'd' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); guardarLocal(AVISOS_DISP_KEY, id); }
  return id;
}

function esIPhone() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function navegadorPermiteAvisos() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && !!(window.firebase && firebase.messaging);
}
function avisosConfigurados() { return !!(window.VTES_CONFIG && VTES_CONFIG.vapidKey); }

// ---------------------------------------------------------------------
// Ventanas (se crean una vez y se reutilizan)
// ---------------------------------------------------------------------
function ventanaAvisos(html) {
  let v = document.getElementById('avisosModal');
  if (!v) {
    v = document.createElement('div');
    v.id = 'avisosModal';
    v.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    v.addEventListener('click', e => { if (e.target === v) cerrarVentanaAvisos(); });
    document.body.appendChild(v);
  }
  v.innerHTML = '<div class="bg-zinc-800 border border-wine-600/50 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3 text-sm">' + html + '</div>';
  v.classList.remove('hidden');
}
function cerrarVentanaAvisos() { const v = document.getElementById('avisosModal'); if (v) v.classList.add('hidden'); }

function chipsMinutos(alCambiar) {
  const m = minutosElegidos();
  const chip = (n) => `<button type="button" data-minutos="${n}" onclick="elegirMinutos(${n}, ${alCambiar ? 'true' : 'false'})" class="${n === m
    ? 'bg-wine-600 text-white font-semibold border-wine-600' : 'text-zinc-400 border-zinc-600 hover:text-white'} border text-[13px] px-3 py-1.5 rounded-full transition">${n} minutos</button>`;
  return `<div class="text-xs text-zinc-400 font-semibold">${alCambiar ? 'Aviso antes de empezar' : '¿Cuánto antes?'}</div><div class="flex gap-2">${chip(15)}${chip(30)}</div>`;
}
const BOTON_AVISOS = 'block w-full text-center bg-wine-600 hover:bg-wine-500 text-white font-bold py-2.5 rounded-lg text-sm transition';
const BOTON_AVISOS_2 = 'block w-full text-center border border-zinc-600 hover:border-zinc-400 text-zinc-300 font-semibold py-2 rounded-lg text-sm transition';

// «¿Te avisamos?» — una sola vez por aparato, después de crear una mesa o unirse
function ofrecerAvisos() {
  if (!currentUser || avisosActivos || leerLocal(AVISOS_PREGUNTADO_KEY) === '1' || !avisosConfigurados()) return;
  if (!navegadorPermiteAvisos() && !esIPhone()) return;              // navegador sin avisos: no se ofrece
  if ('Notification' in window && Notification.permission === 'denied') return; // ya los bloqueó
  ventanaAvisos(`<div id="avisosOferta" class="space-y-3">
    <div class="text-base font-bold">🔔 ¿Te avisamos?</div>
    <div class="text-zinc-300">Te mandamos una notificación a este celular:</div>
    <div class="text-zinc-300">• cuando tu mesa se <b>llene</b> (una sola vez),<br>• si eras suplente y <b>entras a jugar</b>,<br>• y antes de empezar, si ya hay <b>al menos 4</b> jugadores.</div>
    ${chipsMinutos(false)}
    <button type="button" onclick="activarAvisos()" class="${BOTON_AVISOS}">Activar avisos</button>
    <button type="button" onclick="guardarLocal(AVISOS_PREGUNTADO_KEY, '1'); cerrarVentanaAvisos()" class="${BOTON_AVISOS_2}">Ahora no</button>
    <div class="text-xs text-zinc-500">El celular te pedirá permiso. No guardamos tu correo ni tu número.</div></div>`);
}

// Menú «🔔 Avisos» (junto al nombre de la cuenta)
function abrirMenuAvisos() {
  if (!currentUser) return requireLogin();
  ventanaAvisos(`<div id="avisosMenu" class="space-y-3">
    <div class="flex justify-between items-center"><span class="font-bold">🔔 Avisos en este celular</span>
      <span class="text-xs font-extrabold ${avisosActivos ? 'text-emerald-300' : 'text-zinc-500'}">${avisosActivos ? 'ACTIVADOS' : 'DESACTIVADOS'}</span></div>
    ${avisosActivos ? '' : '<div class="text-zinc-300">Te avisamos cuando tu mesa se llene, si eras suplente y entras a jugar, y antes de empezar (si ya hay al menos 4).</div>'}
    ${chipsMinutos(avisosActivos)}
    ${avisosActivos
      ? `<button type="button" onclick="desactivarAvisos()" class="${BOTON_AVISOS_2}">Desactivar</button>
         <button type="button" onclick="mandarAvisoPrueba(this)" class="block w-full text-xs text-zinc-400 underline hover:text-white">Mandarme un aviso de prueba</button>`
      : `<button type="button" onclick="activarAvisos()" class="${BOTON_AVISOS}">Activar avisos</button>`}
    <button type="button" onclick="cerrarVentanaAvisos()" class="block w-full text-xs text-zinc-500 hover:text-white">Cerrar</button></div>`);
}

function elegirMinutos(n, guardarYa) {
  guardarLocal(AVISOS_MIN_KEY, String(n));
  document.querySelectorAll('#avisosModal [data-minutos]').forEach(b => {
    const on = Number(b.dataset.minutos) === n;
    b.className = (on ? 'bg-wine-600 text-white font-semibold border-wine-600' : 'text-zinc-400 border-zinc-600 hover:text-white') + ' border text-[13px] px-3 py-1.5 rounded-full transition';
  });
  if (guardarYa && avisosActivos && currentUser) {
    db.ref(`avisos/${currentUser.uid}/${idAparato()}/minutos`).set(n)
      .then(() => showToast(`✅ Te avisaremos ${n} minutos antes`))
      .catch(() => showToast('❌ No se pudo guardar. Intenta de nuevo.', 'error'));
  }
}

function guiaIPhone() {
  const paso = (n, t, d) => `<div class="flex gap-3"><span class="w-6 h-6 rounded-full bg-wine-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0">${n}</span><span class="text-zinc-300"><b class="text-white">${t}</b><br>${d}</span></div>`;
  ventanaAvisos(`<div id="avisosGuiaIPhone" class="space-y-3">
    <div class="text-base font-bold">📱 En iPhone, primero instala Elysium</div>
    <div class="text-zinc-300">El iPhone solo deja mandar avisos si abres Elysium desde su ícono.</div>
    ${paso(1, 'Toca Compartir', 'el cuadrito con la flecha hacia arriba, abajo en Safari.')}
    ${paso(2, '«Agregar a pantalla de inicio»', 'y luego «Agregar».')}
    ${paso(3, 'Abre Elysium desde el ícono', 'y entra con Google.')}
    ${paso(4, 'Toca «Activar avisos»', 'y acepta el permiso del iPhone.')}
    <div class="text-xs text-zinc-400">¿Ya tenías el ícono de antes? Quítalo y vuelve a agregarlo. Necesitas iOS 16.4 o más nuevo.</div>
    <button type="button" onclick="guardarLocal(AVISOS_PREGUNTADO_KEY, '1'); cerrarVentanaAvisos()" class="${BOTON_AVISOS_2}">Entendido</button></div>`);
}

function avisoNoDisponible(texto) {
  ventanaAvisos(`<div id="avisosNoDisponible" class="space-y-3"><div class="font-bold">🔔 Avisos</div>
    <div class="text-zinc-300">${texto}</div>
    <button type="button" onclick="guardarLocal(AVISOS_PREGUNTADO_KEY, '1'); cerrarVentanaAvisos()" class="${BOTON_AVISOS_2}">Entendido</button></div>`);
}

// ---------------------------------------------------------------------
// Activar / desactivar
// ---------------------------------------------------------------------
async function registrarAparato() {
  const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
  const token = await firebase.messaging().getToken({ vapidKey: VTES_CONFIG.vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error('sin token');
  await db.ref(`avisos/${currentUser.uid}/${idAparato()}`).set({
    token, minutos: minutosElegidos(), zona: userTimezone, at: firebase.database.ServerValue.TIMESTAMP
  });
  avisosActivos = true;
  avisosUidActual = currentUser.uid;
}

function activarAvisos() {
  if (!currentUser) { requireLogin(); return; }
  if (esIPhone() && !abiertoComoApp()) return guiaIPhone();
  if (!navegadorPermiteAvisos()) {
    return avisoNoDisponible(esIPhone()
      ? 'Tu iPhone tiene una versión que no permite avisos (antes de iOS 16.4). Usa «Calendario» en la mesa para que tu celular te lo recuerde.'
      : 'Este navegador no permite avisos. Prueba con Chrome, o usa «Calendario» en la mesa para que tu celular te lo recuerde.');
  }
  if (!avisosConfigurados()) return showToast('❌ Los avisos todavía no están configurados en este sitio.', 'error');
  guardarLocal(AVISOS_PREGUNTADO_KEY, '1');
  // El permiso se pide de inmediato, dentro del toque (el iPhone lo exige)
  Notification.requestPermission().then(async permiso => {
    if (permiso !== 'granted') {
      return avisoNoDisponible(esIPhone()
        ? 'No diste permiso. Para activarlos: Ajustes del iPhone → Notificaciones → Elysium → Permitir notificaciones. Luego vuelve a tocar «Activar avisos».'
        : 'No diste permiso. Para activarlos, toca el candado junto a la dirección del sitio → Notificaciones → Permitir, y vuelve a tocar «Activar avisos».');
    }
    try {
      await registrarAparato();
      cerrarVentanaAvisos();
      showToast(`🔔 Avisos activados (${minutosElegidos()} min antes)`);
      renderAuthBar();
    } catch (e) {
      console.warn('Avisos:', e && e.message);
      showToast('❌ No se pudieron activar los avisos. Intenta de nuevo.', 'error');
    }
  });
}

async function desactivarAvisos() {
  try {
    await db.ref(`avisos/${currentUser.uid}/${idAparato()}`).remove();
    try { await firebase.messaging().deleteToken(); } catch (e) { /* ya no existía */ }
    avisosActivos = false;
    cerrarVentanaAvisos();
    showToast('🔕 Avisos desactivados en este celular');
    renderAuthBar();
  } catch (e) {
    showToast('❌ No se pudo desactivar. Intenta de nuevo.', 'error');
  }
}

async function mandarAvisoPrueba(boton) {
  if (boton) boton.disabled = true;
  try {
    const idToken = await currentUser.getIdToken();
    const r = await fetch('/api/aviso-prueba', { method: 'POST', headers: { Authorization: 'Bearer ' + idToken } });
    if (r.status === 429) showToast('Espera un minuto antes de pedir otro aviso de prueba.', 'error');
    else if (!r.ok) {
      const detalle = await r.text().catch(() => '');
      showToast(`❌ No se pudo mandar el aviso de prueba (${r.status}${detalle ? ': ' + detalle.slice(0, 160) : ''})`, 'error');
    }
    else showToast('✅ Aviso de prueba enviado: debe llegarte en unos segundos');
  } catch (e) {
    showToast('❌ No se pudo mandar el aviso de prueba.', 'error');
  }
  if (boton) setTimeout(() => { boton.disabled = false; }, 60000);
}

// ---------------------------------------------------------------------
// Al iniciar sesión: ¿este aparato ya tiene avisos? (y renueva el token si cambió)
// Al cerrar sesión: se borran los de esta cuenta en este aparato.
// ---------------------------------------------------------------------
async function revisarAvisos(user) {
  avisosActivos = false;
  if (!user || !leerLocal(AVISOS_DISP_KEY) || !navegadorPermiteAvisos() || !avisosConfigurados()) return;
  if (Notification.permission !== 'granted') return;
  try {
    const snap = await db.ref(`avisos/${user.uid}/${idAparato()}`).get();
    if (!snap.exists()) return;
    avisosActivos = true;
    avisosUidActual = user.uid;
    const guardado = snap.val();
    if (guardado.minutos === 15 || guardado.minutos === 30) guardarLocal(AVISOS_MIN_KEY, String(guardado.minutos));
    const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    const token = await firebase.messaging().getToken({ vapidKey: VTES_CONFIG.vapidKey, serviceWorkerRegistration: reg });
    if (token && (token !== guardado.token || guardado.zona !== userTimezone)) {
      await db.ref(`avisos/${user.uid}/${idAparato()}`).update({ token, zona: userTimezone, at: firebase.database.ServerValue.TIMESTAMP });
    }
  } catch (e) { console.warn('Avisos:', e && e.message); }
}

function quitarAvisosAlSalir() {
  if (!avisosActivos || !avisosUidActual) return Promise.resolve();
  return db.ref(`avisos/${avisosUidActual}/${idAparato()}`).remove().catch(() => {}).then(() => { avisosActivos = false; });
}

// Al tocar un aviso con Elysium ya abierto, el service worker pide abrir la mesa
function abrirMesaDeAviso(mesa) {
  if (!mesa) return;
  if (window.location.hash === '#mesa-' + mesa) { tableFromHashHandled = false; openTableFromHash(); }
  else window.location.hash = 'mesa-' + mesa; // el aviso de hashchange (arranque.js) la abre
}

// Con Elysium abierto, el aviso llega como mensaje en la página
function escucharAvisosEnPagina() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.addEventListener) {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.tipo === 'abrirMesa') abrirMesaDeAviso(e.data.mesa);
    });
  }
  if (!navegadorPermiteAvisos() || !avisosConfigurados()) return;
  try {
    firebase.messaging().onMessage(p => {
      const n = (p && p.notification) || {};
      showToast('🔔 ' + (n.title || 'Aviso') + (n.body ? ' — ' + n.body : ''));
    });
  } catch (e) { /* navegador sin soporte */ }
}
