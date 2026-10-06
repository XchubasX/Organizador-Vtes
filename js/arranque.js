// =====================================================================
// js/arranque.js — ARRANQUE: todo lo que se ejecuta al abrir la página (calendarios,
// formularios, conexión en vivo con las mesas, sesión). Se carga al final,
// cuando ya existen todas las funciones de los demás archivos.
// Parte del código de index.html (separado el 29 sep 2026, fase 2).
// =====================================================================

googleProvider.setCustomParameters({ prompt: 'select_account' });

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  await loadUserFlags(user);
  renderAuthBar();
  renderAll(currentGlobalData);
});
mostrarAvisoMudanza(); // franja de mudanza (solo en la dirección vieja de GitHub, ver mudanza.js)
mostrarAvisoIcono(); // aviso temporal del ícono nuevo (hasta el 8 oct 2026)
document.getElementById('userTimezone').innerText = `Tu zona horaria: ${nombreZona(userTimezone) || userTimezone}${nombreZona(userTimezone) && nombreZona(userTimezone) !== userTimezone ? ` (${userTimezone})` : ''}`;

let pickerCustomTable = flatpickr("#tableDateTime", { ...configFlatpickr, onChange: () => updateNightUI('create') });
let pickerEditSchedule = flatpickr("#editScheduleDateTime", { ...configFlatpickr, onChange: () => updateNightUI('edit') });

['create', 'edit'].forEach(prefix => {
  document.querySelectorAll(`input[name="${prefix}Night"]`).forEach(r => r.addEventListener('change', () => updateNightUI(prefix)));
  const inputId = prefix === 'create' ? 'tableDateTime' : 'editScheduleDateTime';
  document.getElementById(inputId).addEventListener('change', () => updateNightUI(prefix));
  document.getElementById(inputId).addEventListener('input', () => updateNightUI(prefix));
});
let pickerFilterDate = flatpickr("#filterDate", {
  dateFormat: "Y-m-d",
  locale: "es",
  onChange: () => renderAll(currentGlobalData)
});

// Selector de solo-hora para la llegada estimada en el modal de Unirse (eventos presenciales)
let pickerJoinArrival = flatpickr("#joinArrival", {
  enableTime: true,
  noCalendar: true,
  dateFormat: "H:i",
  time_24hr: true,
  locale: "es"
});

// Selector de solo-hora para la llegada estimada del organizador al crear un evento presencial
let pickerCreatorArrival = flatpickr("#tableCreatorArrival", {
  enableTime: true,
  noCalendar: true,
  dateFormat: "H:i",
  time_24hr: true,
  locale: "es"
});

document.getElementById('uiDialogForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!uiDialogResolve) return;
  const hasInput = !document.getElementById('uiDialogInputGroup').classList.contains('hidden');
  const value = hasInput ? document.getElementById('uiDialogInput').value.trim() : true;
  if (uiDialogValidate) {
    const problem = uiDialogValidate(value);
    if (problem) {
      const errorEl = document.getElementById('uiDialogError');
      errorEl.textContent = problem;
      errorEl.classList.remove('hidden');
      document.getElementById('uiDialogInput').select();
      return;
    }
  }
  uiDialogResolve(value);
});
document.getElementById('uiDialogCancel').addEventListener('click', () => uiDialogResolve && uiDialogResolve(null));

// Tecla Escape: cierra la ventana que esté abierta
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (uiDialogResolve) return uiDialogResolve(null);
  ['joinModal', 'calendarModal', 'editScheduleModal', 'loginModal', 'feedbackModal', 'aboutModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) {
      if (id === 'joinModal') closeJoinModal();
      else if (id === 'loginModal') closeLoginModal(false);
      else if (id === 'editScheduleModal') closeEditScheduleModal();
      else if (id === 'feedbackModal') closeFeedbackModal();
      else el.classList.add('hidden');
    }
  });
  if (!document.getElementById('createdModal').classList.contains('hidden')) closeCreatedModal();
});

setInterval(() => {
  document.querySelectorAll('.rel-time').forEach(el => {
    const r = relativeTimeLabel(el.dataset.time);
    el.textContent = r.text;
  });
}, 60000);
document.getElementById('editScheduleForm').addEventListener('submit', guardarHorario);
document.getElementById('joinForm').addEventListener('submit', enviarUnirse);

// ---------------------------------------------------------------------
// URL POR CIUDAD (ej. https://.../Zaragoza)
// Ni GitHub Pages ni Cloudflare tienen la página /Zaragoza; el archivo
// 404.html se encarga de redirigir aquí pasando la ciudad como
// parámetro (?city=...). Esta función la lee, activa el modo
// Presencial con esa ciudad filtrada, y deja la URL bonita de nuevo
// en la barra del navegador (sin el ?city=...).
// ---------------------------------------------------------------------
(function initCityFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const cityParam = params.get('city');
  if (!cityParam) return;

  urlCityFilter = cityParam;

  const basePath = window.location.pathname.replace(/\/?$/, '/');
  window.history.replaceState({}, '', basePath + encodeURIComponent(cityParam));

  setTableModality('presencial');
})();
const loadTimeout = setTimeout(showLoadProblem, 12000);

recordsRef.on('value', (snapshot) => {
  dataLoaded = true;
  clearTimeout(loadTimeout);
  const dataObj = snapshot.val() || {};
  const rawData = Object.keys(dataObj).map(key => ({ id: key, ...dataObj[key] }));
  currentGlobalData = sweepExpiredTables(rawData);
  renderAll(currentGlobalData);
  openTableFromHash(); // si se llegó con un enlace directo a una mesa
}, (err) => {
  console.warn('No se pudieron leer las mesas:', err && err.message);
  clearTimeout(loadTimeout);
  showLoadProblem();
});

// Si se pega otro enlace de mesa con la página ya abierta
window.addEventListener('hashchange', () => {
  tableFromHashHandled = false;
  openTableFromHash();
});

// Al corregir el link de Maps se quita el aviso rojo
document.getElementById('tableMapsLink').addEventListener('input', () => {
  document.getElementById('tableMapsLinkError').classList.add('hidden');
});
document.getElementById('customTableForm').addEventListener('submit', crearMesa);

document.getElementById('filterCountry').addEventListener('change', () => {
  // Al cambiar de país se reinicia la ciudad (la anterior podría no pertenecer a ese país)
  document.getElementById('filterCity').value = '';
  clearUrlCityFilter();
  renderAll(currentGlobalData);
});
document.getElementById('filterCity').addEventListener('change', () => {
  // Si el usuario toca el dropdown manualmente, la ciudad de la URL deja de mandar.
  clearUrlCityFilter();
  renderAll(currentGlobalData);
});
