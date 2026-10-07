// =====================================================================
// js/ventanas.js — VENTANAS Y AVISOS: formulario plegable, recordar nick/plataforma,
// ventana de "mesa creada", avisos breves (toasts), ventana genérica y links seguros.
// Parte del código de index.html (separado el 29 sep 2026, fase 2).
// =====================================================================

// ---------------------------------------------------------------------
// FORMULARIO PLEGABLE: la lista se ve primero; el formulario de
// creación solo se abre al pulsar "➕ Crear mesa / evento".
// ---------------------------------------------------------------------
async function openCreateForm() {
  if (!(await requireLogin())) return;
  document.getElementById('createFormPanel').classList.remove('hidden');
  document.getElementById('openCreateFormBtn').classList.add('hidden');
  prefillCreatorNick();
  document.getElementById('tableName').focus();
}

function closeCreateForm() {
  document.getElementById('createFormPanel').classList.add('hidden');
  document.getElementById('createCopyHint').classList.add('hidden');
  document.getElementById('openCreateFormBtn').classList.remove('hidden');
}

// ---------------------------------------------------------------------
// RECORDAR EL NICK
// El último nick usado se guarda solo en el navegador de cada persona
// (no se envía nada nuevo a Firebase) y se deja escrito al crear o
// unirse a una mesa. Siempre se puede cambiar.
// ---------------------------------------------------------------------
const LAST_NICK_KEY = 'vtes_last_nick';

function getSavedNick() {
  try { return localStorage.getItem(LAST_NICK_KEY) || ''; } catch (e) { return ''; }
}

function saveNick(nick) {
  try { if (nick) localStorage.setItem(LAST_NICK_KEY, nick); } catch (e) { /* sin almacenamiento: no pasa nada */ }
}

function prefillCreatorNick() {
  const input = document.getElementById('tableCreator');
  if (!input.value) input.value = getSavedNick();
  // También se deja elegida la última plataforma usada (LackeyCCG / Succubus Club)
  const platform = getSavedPlatform();
  const select = document.getElementById('tablePlatform');
  if (platform && [...select.options].some(o => o.value === platform)) select.value = platform;
  // Y el último formato usado (Standard (Legacy) / V5)
  const format = getSavedFormat();
  if (format === 'standard' || format === 'v5') document.getElementById('tableFormat').value = format;
}

// ---------------------------------------------------------------------
// RECORDAR LA ÚLTIMA PLATAFORMA (solo en el navegador de cada persona)
// ---------------------------------------------------------------------
const LAST_PLATFORM_KEY = 'vtes_last_platform';

function getSavedPlatform() {
  try { return localStorage.getItem(LAST_PLATFORM_KEY) || ''; } catch (e) { return ''; }
}

const LAST_FORMAT_KEY = 'vtes_last_format';
function getSavedFormat() {
  try { return localStorage.getItem(LAST_FORMAT_KEY) || ''; } catch (e) { return ''; }
}
function saveFormat(format) {
  try { if (format) localStorage.setItem(LAST_FORMAT_KEY, format); } catch (e) { /* sin almacenamiento: no pasa nada */ }
}

// Notas de la mesa: texto libre corto, visible para todos y editable por cualquiera
const NOTES_MAX = 150;
// Nick: máximo 24 caracteres (las reglas de Firebase lo revisan también)
const NICK_MAX = 24;

function savePlatform(platform) {
  try { if (platform) localStorage.setItem(LAST_PLATFORM_KEY, platform); } catch (e) { /* sin almacenamiento: no pasa nada */ }
}

// ---------------------------------------------------------------------
// VENTANA DE CONFIRMACIÓN: MESA / EVENTO CREADO CON ÉXITO
// Aparece solo cuando Firebase confirma que se guardó. Al cerrarla,
// la página baja hasta la tarjeta nueva y la resalta unos segundos.
// ---------------------------------------------------------------------
let lastCreatedId = null;

function showCreatedModal(newId, recordData) {
  lastCreatedId = newId;
  const isPresencial = recordData.modality === 'presencial';
  const f = formatPresencialDateTime(recordData.utcTime, recordData.originTz, { weekday: 'long', day: 'numeric', month: 'long' }, { hour: '2-digit', minute: '2-digit' });
  document.getElementById('createdModalTitle').textContent = isPresencial ? '¡Evento creado con éxito!' : '¡Mesa creada con éxito!';
  document.getElementById('createdModalName').textContent = recordData.name;
  const night = nightOfName(recordData.utcTime, recordData.originTz);
  const weekly = recordData.recurrence === 'weekly' ? ` · se repite cada ${weekdayInZone(recordData.utcTime, recordData.originTz)}` : '';
  document.getElementById('createdModalWhen').textContent = `${f.date} - ${f.time}${night ? ` (noche del ${night})` : ''}${isPresencial ? ` · ${recordData.venue}, ${recordData.city}` : ` · ${recordData.platform}`}${weekly}`;
  document.getElementById('createdModal').classList.remove('hidden');
}

function closeCreatedModal() {
  document.getElementById('createdModal').classList.add('hidden');
  if (lastCreatedId) highlightCard(lastCreatedId);
  ofrecerAvisos(); // «¿Te avisamos?» una sola vez por aparato (js/avisos.js)
  lastCreatedId = null;
}

function highlightCard(tableId, { desplegar = false } = {}) {
  // Enlace directo a una mesa privada: se despliega. Al crearla se queda plegada
  // (como la ven todos) y solo se resalta.
  const t = currentGlobalData.find(item => item.id === tableId);
  if (desplegar && t && t.privada === true && !mesasDesplegadas.has(tableId)) {
    mesasDesplegadas.add(tableId);
    renderAll(currentGlobalData);
  }
  const card = document.getElementById(`card-custom-${tableId}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('ring-2', 'ring-green-400');
  setTimeout(() => card.classList.remove('ring-2', 'ring-green-400'), 4000);
}

// ---------------------------------------------------------------------
// AVISOS BREVES (toasts)
// showToast('✅ Te uniste a la mesa')           → verde
// showToast('❌ PIN incorrecto', 'error')        → rojo
// ---------------------------------------------------------------------
function showToast(message, kind = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const styles = kind === 'error'
    ? 'bg-red-950 border-red-600 text-red-200'
    : 'bg-green-950 border-green-600 text-green-200';
  toast.className = `pointer-events-auto border ${styles} text-sm font-semibold px-4 py-2.5 rounded-xl shadow-2xl text-center transition-opacity duration-300`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; }, kind === 'error' ? 4500 : 2800);
  setTimeout(() => toast.remove(), kind === 'error' ? 4900 : 3200);
}

// ---------------------------------------------------------------------
// VENTANA GENÉRICA (reemplaza prompt / confirm / alert del navegador)
// Devuelve una promesa:
//   - con campo de texto: el texto escrito, o null si canceló
//   - sin campo:          true si aceptó, o null si canceló
// "validate" (opcional) revisa lo escrito ANTES de cerrar: si regresa un
// mensaje, se muestra en rojo y la ventana sigue abierta para corregir.
// ---------------------------------------------------------------------
let uiDialogResolve = null;
let uiDialogValidate = null;

function uiDialog({ title, message = '', input = null, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', danger = false, validate = null }) {
  if (uiDialogResolve) uiDialogResolve(null); // cierra cualquier ventana anterior
  const dlg = document.getElementById('uiDialog');
  const group = document.getElementById('uiDialogInputGroup');
  const field = document.getElementById('uiDialogInput');
  const errorEl = document.getElementById('uiDialogError');
  const confirmBtn = document.getElementById('uiDialogConfirm');

  document.getElementById('uiDialogTitle').textContent = title;
  const msgEl = document.getElementById('uiDialogMessage');
  msgEl.textContent = message;
  msgEl.classList.toggle('hidden', !message);
  errorEl.classList.add('hidden');

  if (input) {
    group.classList.remove('hidden');
    document.getElementById('uiDialogLabel').textContent = input.label || '';
    field.type = input.type === 'pin' ? 'password' : (input.type || 'text');
    field.inputMode = input.type === 'pin' ? 'numeric' : (input.type === 'url' ? 'url' : 'text');
    field.maxLength = input.type === 'pin' ? 4 : (input.maxLength || 500);
    field.placeholder = input.placeholder || '';
    field.value = input.value || '';
    field.classList.toggle('font-mono', input.type === 'pin');
  } else {
    group.classList.add('hidden');
  }

  confirmBtn.textContent = confirmLabel;
  document.getElementById('uiDialogCancel').textContent = cancelLabel;
  confirmBtn.classList.toggle('bg-red-700', danger);
  confirmBtn.classList.toggle('hover:bg-red-600', danger);
  confirmBtn.classList.toggle('bg-wine-600', !danger);
  confirmBtn.classList.toggle('hover:bg-wine-500', !danger);

  uiDialogValidate = validate;
  dlg.classList.remove('hidden');
  setTimeout(() => (input ? field : confirmBtn).focus(), 50);

  return new Promise(resolve => {
    uiDialogResolve = (value) => {
      uiDialogResolve = null;
      uiDialogValidate = null;
      dlg.classList.add('hidden');
      resolve(value);
    };
  });
}

// ---------------------------------------------------------------------
// LINKS SEGUROS: solo se aceptan links que empiezan con http:// o https://
// ---------------------------------------------------------------------
function isValidHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

// Texto seguro para usar dentro de onclick="miFuncion('...')"
// (evita que un nick con apóstrofe, como D'Artagnan, rompa el botón)
function escapeJsAttr(str) {
  return escapeHtml(String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

// ---------------------------------------------------------------------
// AVISO TEMPORAL DEL ÍCONO NUEVO (1 oct 2026)
// Pide a quien tiene el sitio en la pantalla del celular con la letra
// genérica ("G" en Android, "V" en iPhone) que lo borre y lo vuelva a
// agregar. Solo en pantallas de celular, hasta el 8 oct 2026 (hora de
// México) y hasta que la persona toque "Entendido". Se puede borrar
// este bloque, el <div id="avisoIcono"> y su llamada en arranque.js
// después de esa fecha.
// ---------------------------------------------------------------------
const AVISO_ICONO_KEY = 'vtes_aviso_icono_visto';
const AVISO_ICONO_HASTA = Date.parse('2026-10-09T06:00:00Z'); // fin del 8 oct en México

function mostrarAvisoIcono() {
  const aviso = document.getElementById('avisoIcono');
  if (!aviso) return;
  let visto = false;
  try { visto = localStorage.getItem(AVISO_ICONO_KEY) === '1'; } catch (e) { /* sin almacenamiento */ }
  const esCelular = window.matchMedia('(max-width: 767px)').matches;
  aviso.classList.toggle('hidden', visto || !esCelular || Date.now() >= AVISO_ICONO_HASTA);
}

function cerrarAvisoIcono() {
  try { localStorage.setItem(AVISO_ICONO_KEY, '1'); } catch (e) { /* sin almacenamiento: solo se oculta ahora */ }
  document.getElementById('avisoIcono').classList.add('hidden');
}

