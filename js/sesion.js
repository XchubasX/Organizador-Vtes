// =====================================================================
// js/sesion.js — SESIÓN Y PERMISOS: conexión a la base de datos, inicio de sesión con Google,
// jugadores de una mesa, quién puede gestionar qué y vetar cuentas.
// Parte del código de index.html (separado el 29 sep 2026, fase 2).
// =====================================================================

const db = firebase.database();
const recordsRef = db.ref('vtes_records');
let dataLoaded = false; // se vuelve true cuando llegan las mesas de Firebase

let currentGlobalData = [];

// ---------------------------------------------------------------------
// INICIO DE SESIÓN CON GOOGLE
// Ver mesas es libre. Para crear, unirse o gestionar hay que entrar con
// Google. Cada mesa guarda el identificador de la cuenta que la creó
// (ownerUid) y cada jugador el de la cuenta que lo anotó (uid); las
// reglas de Firebase usan eso para decidir quién puede cambiar qué.
// Nunca se guarda el correo ni el nombre en la base de datos.
//   - admins/{uid}: true  → administrador (se agrega desde la consola)
//   - banned/{uid}        → cuenta vetada: no puede escribir nada
// ---------------------------------------------------------------------
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let currentUser = null;
let isAdmin = false;
let isBanned = false;

function myUid() { return currentUser ? currentUser.uid : null; }
function isOwner(t) { return !!currentUser && !!t && t.ownerUid === currentUser.uid; }
function canManage(t) { return !!currentUser && !isBanned && (isAdmin || isOwner(t)); }
function isMine(entry) { return !!currentUser && !!entry && !!entry.uid && entry.uid === currentUser.uid; }

async function loadUserFlags(user) {
  if (!user) { isAdmin = false; isBanned = false; return; }
  const [a, b] = await Promise.all([
    db.ref(`admins/${user.uid}`).get().catch(() => null),
    db.ref(`banned/${user.uid}`).get().catch(() => null)
  ]);
  isAdmin = !!(a && a.val() === true);
  isBanned = !!(b && b.exists());
}

// Aviso de bienvenida: se muestra sin sesión hasta que la persona lo
// cierra con "Entendido" (se recuerda solo en su navegador).
const LOGIN_NOTICE_KEY = 'vtes_login_notice_dismissed';
function loginNoticeDismissed() {
  try { return localStorage.getItem(LOGIN_NOTICE_KEY) === '1'; } catch (e) { return false; }
}
function dismissLoginNotice() {
  try { localStorage.setItem(LOGIN_NOTICE_KEY, '1'); } catch (e) { /* sin almacenamiento: solo se oculta ahora */ }
  document.getElementById('loginNotice').classList.add('hidden');
}

function renderAuthBar() {
  const bar = document.getElementById('authBar');
  document.getElementById('loginNotice').classList.toggle('hidden', !!currentUser || loginNoticeDismissed());
  if (!currentUser) {
    bar.innerHTML = `<button type="button" onclick="requireLogin()" class="inline-flex items-center gap-2 bg-white hover:bg-zinc-200 text-zinc-900 font-bold px-4 py-2 rounded-lg text-sm transition shadow-md">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Entrar con Google
      </button>
      <p class="text-xs text-zinc-500 mt-1">Ver es libre · para crear o unirte necesitas entrar</p>`;
    return;
  }
  const name = currentUser.displayName ? escapeHtml(currentUser.displayName) : 'tu cuenta de Google';
  bar.innerHTML = `<p class="text-xs text-zinc-400">✅ Sesión iniciada: <span class="text-zinc-200">${name}</span>`
    + (isAdmin ? ' · <span class="text-amber-300 font-semibold">👑 Administrador</span>' : '')
    + (isBanned ? ' · <span class="text-red-400 font-semibold">🚫 Cuenta bloqueada</span>' : '')
    + ` · <button type="button" onclick="signOutUser()" class="text-zinc-400 hover:text-white underline">Cerrar sesión</button></p>`;
}

function signOutUser() {
  auth.signOut().then(() => showToast('Sesión cerrada')).catch(() => {});
}

// Navegadores "dentro de otra app" (WhatsApp, Instagram, Facebook...):
// Google no permite iniciar sesión ahí, así que se pide abrir el sitio
// en Chrome o Safari.
function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Snapchat|Twitter|Discord|MicroMessenger|; wv\)/i.test(ua)) return true;
  if (/iPhone|iPad|iPod/i.test(ua) && !/Safari\//i.test(ua)) return true;
  return false;
}

async function showOpenInBrowserDialog() {
  const isAndroid = /Android/i.test(navigator.userAgent || '');
  if (isAndroid) {
    const ok = await uiDialog({
      title: '🌐 Ábrelo en Chrome',
      message: 'Estás viendo el sitio dentro de otra app (por ejemplo WhatsApp), y ahí Google no permite iniciar sesión. Toca el botón para abrirlo en Chrome. También puedes usar el menú ⋮ → "Abrir en el navegador".',
      confirmLabel: 'Abrir en Chrome'
    });
    if (ok) {
      const l = window.location;
      window.location.href = `intent://${l.host}${l.pathname}${l.search}${l.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(l.href)};end`;
    }
    return;
  }
  const ok = await uiDialog({
    title: '🌐 Ábrelo en Safari',
    message: 'Estás viendo el sitio dentro de otra app (por ejemplo WhatsApp), y ahí Google no permite iniciar sesión. Copia el enlace y pégalo en Safari, o usa el botón de compartir / menú → "Abrir en Safari".',
    confirmLabel: '📋 Copiar enlace'
  });
  if (ok) {
    try { await navigator.clipboard.writeText(window.location.href); showToast('🔗 Enlace copiado: pégalo en Safari'); }
    catch (e) { uiDialog({ title: '🔗 Enlace', message: 'Copia este enlace y pégalo en Safari:', input: { type: 'text', value: window.location.href }, confirmLabel: 'Listo' }); }
  }
}

// Devuelve una promesa: true si hay sesión (ya había o se acaba de
// iniciar) y la cuenta no está bloqueada; false en cualquier otro caso.
let loginResolve = null;

function requireLogin() {
  if (currentUser) {
    if (isBanned) {
      showToast('🚫 Tu cuenta no puede crear ni unirse a mesas.', 'error');
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }
  if (isInAppBrowser()) {
    showOpenInBrowserDialog();
    return Promise.resolve(false);
  }
  if (loginResolve) loginResolve(false);
  document.getElementById('loginModalError').classList.add('hidden');
  document.getElementById('loginModalBtn').disabled = false;
  document.getElementById('loginModal').classList.remove('hidden');
  return new Promise(resolve => { loginResolve = resolve; });
}

function closeLoginModal(result) {
  document.getElementById('loginModal').classList.add('hidden');
  if (loginResolve) { const r = loginResolve; loginResolve = null; r(!!result); }
}

// Se llama directo desde el clic del botón (los navegadores solo permiten
// abrir la ventana de Google como respuesta inmediata a un clic).
function doGoogleLogin() {
  const btn = document.getElementById('loginModalBtn');
  const errorEl = document.getElementById('loginModalError');
  btn.disabled = true;
  errorEl.classList.add('hidden');
  auth.signInWithPopup(googleProvider).then(async (result) => {
    currentUser = result.user;
    await loadUserFlags(result.user);
    renderAuthBar();
    renderAll(currentGlobalData);
    if (isBanned) {
      closeLoginModal(false);
      showToast('🚫 Tu cuenta no puede crear ni unirse a mesas.', 'error');
      return;
    }
    closeLoginModal(true);
    showToast('✅ Sesión iniciada');
  }).catch((e) => {
    btn.disabled = false;
    const code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    if (code === 'auth/popup-blocked') {
      errorEl.textContent = 'Tu navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.';
    } else if (code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/web-storage-unsupported' || code === 'auth/internal-error') {
      closeLoginModal(false);
      showOpenInBrowserDialog();
      return;
    } else if (code === 'auth/network-request-failed') {
      errorEl.textContent = 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.';
    } else {
      errorEl.textContent = `No se pudo iniciar sesión (${code || 'error desconocido'}). Si abriste el enlace desde WhatsApp, ábrelo en Chrome o Safari.`;
    }
    errorEl.classList.remove('hidden');
  });
}

// ---------------------------------------------------------------------
// JUGADORES DE UNA MESA ("entradas")
// Formato nuevo: signups/{llave} = { uid, nick, arrival?, at }
//   - la llave es el uid de quien se anotó; si el organizador anota a
//     otra persona, la llave es un id aleatorio (y uid = el organizador)
//   - "at" es la hora de llegada al servidor: define el orden
// Formato anterior (mesas creadas antes del inicio de sesión): arreglos
// players / substitutes sin dueño. Se muestran primero, en su orden, y
// solo el administrador puede quitarlos.
// Cada entrada lleva "ref": s:<llave>, p:<índice> o u:<índice>.
// ---------------------------------------------------------------------
function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(x => x != null) : Object.keys(v).sort((a, b) => Number(a) - Number(b)).map(k => v[k]).filter(x => x != null);
}

function getEntries(t) {
  const out = [];
  toArray(t.players).forEach((p, i) => {
    const n = normalizePlayer(p);
    out.push({ ref: `p:${i}`, legacy: true, uid: null, nick: n.nick, arrival: n.arrival, at: i });
  });
  if (t.modality !== 'presencial') {
    toArray(t.substitutes).forEach((s, i) => {
      out.push({ ref: `u:${i}`, legacy: true, uid: null, nick: String(s || ''), arrival: null, at: 1000 + i });
    });
  }
  const su = t.signups || {};
  Object.keys(su)
    .sort((a, b) => ((su[a] && su[a].at) || 0) - ((su[b] && su[b].at) || 0) || (a < b ? -1 : 1))
    .forEach(k => {
      const e = su[k] || {};
      out.push({ ref: `s:${k}`, key: k, legacy: false, uid: e.uid || null, nick: e.nick || '', arrival: e.arrival || null, at: e.at || 0 });
    });
  return out;
}

// Mesa virtual: los primeros 5 juegan, los siguientes son suplentes.
// Evento presencial: todos son asistentes.
function getRoster(t) {
  const entries = getEntries(t);
  if (t.modality === 'presencial') return { entries, players: entries, subs: [] };
  return { entries, players: entries.slice(0, MAX_PLAYERS), subs: entries.slice(MAX_PLAYERS) };
}

// ---------------------------------------------------------------------
// AUTORIZACIÓN: solo el organizador (su cuenta) o el administrador
// pueden gestionar una mesa. Las reglas de Firebase lo vuelven a
// revisar en el servidor; aquí solo se evita mostrar botones inútiles.
// Devuelve true si puede y confirmó (si se pidió confirmación).
// ---------------------------------------------------------------------
async function authorizeTableAction(table, { confirmTitle = null, confirmMessage = '', confirmLabel = 'Aceptar', danger = false } = {}) {
  if (!(await requireLogin())) return false;
  if (!canManage(table)) {
    showToast('🔒 Solo el organizador de esta mesa puede hacer eso.', 'error');
    return false;
  }
  if (!confirmTitle) return true;
  return !!(await uiDialog({ title: confirmTitle, message: confirmMessage, confirmLabel, danger }));
}

// ---------------------------------------------------------------------
// VETAR UNA CUENTA (solo el administrador)
// Guarda banned/{uid} y quita esa entrada de la mesa en un solo paso.
// La cuenta vetada ya no puede crear, unirse ni editar nada. Para
// quitar el veto: consola de Firebase → banned → borrar ese uid.
// ---------------------------------------------------------------------
async function banEntry(tableId, ref) {
  if (!isAdmin) return;
  const t = currentGlobalData.find(item => item.id === tableId);
  if (!t) return showToast('❌ Esta mesa ya no existe.', 'error');
  const entry = getEntries(t).find(e => e.ref === ref);
  if (!entry || !entry.uid) return showToast('Este registro no tiene cuenta asociada: solo se puede quitar con ×.', 'error');
  if (entry.uid === myUid()) return showToast('No puedes vetar tu propia cuenta.', 'error');
  const ok = await uiDialog({
    title: '🚫 Vetar cuenta',
    message: `¿Vetar la cuenta que anotó a "${entry.nick}"? Se quita de esta mesa y ya no podrá crear ni unirse a mesas. Si esa cuenta creó otras mesas, ciérralas tú.`,
    confirmLabel: 'Vetar',
    danger: true
  });
  if (!ok) return;
  const updates = {};
  updates[`banned/${entry.uid}`] = { nick: entry.nick, tableId: tableId, at: firebase.database.ServerValue.TIMESTAMP };
  updates[`vtes_records/${tableId}/signups/${entry.key}`] = null;
  db.ref().update(updates)
    .then(() => showToast(`🚫 Cuenta vetada ("${entry.nick}")`))
    .catch(() => showToast('❌ No se pudo vetar. Revisa tu conexión.', 'error'));
}
