// =====================================================================
// js/fechas.js — FECHAS Y HORAS: zona horaria, "¿qué noche?", tiempo relativo,
// eventos semanales y formato de fechas de eventos presenciales.
// Parte del código de index.html (separado el 29 sep 2026, fase 2).
// =====================================================================

const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Nombre legible de una zona horaria, para "hora de Ciudad de México".
// Si no está en la lista se usa la última parte del nombre técnico
// (ej. "Europe/Oslo" → "Oslo").
const NOMBRES_ZONA = {
  'America/Mexico_City': 'Ciudad de México', 'America/Monterrey': 'Monterrey', 'America/Merida': 'Mérida',
  'America/Cancun': 'Cancún', 'America/Chihuahua': 'Chihuahua', 'America/Hermosillo': 'Hermosillo',
  'America/Mazatlan': 'Mazatlán', 'America/Tijuana': 'Tijuana', 'America/Bahia_Banderas': 'Bahía de Banderas',
  'Europe/Madrid': 'Madrid', 'Atlantic/Canary': 'Canarias', 'Europe/Lisbon': 'Lisboa', 'Europe/London': 'Londres',
  'Europe/Paris': 'París', 'Europe/Berlin': 'Berlín', 'Europe/Rome': 'Roma',
  'America/Santiago': 'Santiago de Chile', 'America/Bogota': 'Bogotá', 'America/Lima': 'Lima',
  'America/Argentina/Buenos_Aires': 'Buenos Aires', 'America/Caracas': 'Caracas', 'America/Montevideo': 'Montevideo',
  'America/Asuncion': 'Asunción', 'America/La_Paz': 'La Paz', 'America/Guayaquil': 'Guayaquil', 'America/Sao_Paulo': 'São Paulo',
  'America/Guatemala': 'Guatemala', 'America/El_Salvador': 'El Salvador', 'America/Tegucigalpa': 'Tegucigalpa',
  'America/Managua': 'Managua', 'America/Costa_Rica': 'Costa Rica', 'America/Panama': 'Panamá',
  'America/Havana': 'La Habana', 'America/Santo_Domingo': 'Santo Domingo', 'America/Puerto_Rico': 'Puerto Rico',
  'America/New_York': 'Nueva York', 'America/Chicago': 'Chicago', 'America/Denver': 'Denver', 'America/Los_Angeles': 'Los Ángeles'
};
function nombreZona(tz) {
  if (!tz) return '';
  return NOMBRES_ZONA[tz] || tz.split('/').pop().replace(/_/g, ' ');
}

const configFlatpickr = {
  enableTime: true,
  dateFormat: "Y-m-d H:i",
  time_24hr: true,
  locale: "es",
  minDate: "today"
};

// ---------------------------------------------------------------------
// ¿QUÉ NOCHE? — evita la confusión de la medianoche
// Mucha gente piensa en las 00:00 como el FINAL del día, cuando en
// realidad es el INICIO del día siguiente (caso real: "viernes 00:00"
// creado para jugar el viernes en la noche quedó en la noche del
// jueves). Si la hora elegida es de madrugada (00:00 a 05:59), se
// pregunta qué noche se quiso decir; no hay ninguna opción marcada y
// no se puede guardar sin elegir. Para cualquier otra hora no aparece
// nada. El calendario no se mueve: el día elegido se queda como está.
//   - "prev": la noche del día anterior al elegido → se guarda tal cual
//   - "this": la noche del día elegido al siguiente → se guarda +1 día
// En Firebase se sigue guardando la misma fecha/hora exacta (utcTime).
// ---------------------------------------------------------------------
const NIGHT_END_HOUR = 6; // de 00:00 a 05:59 se considera madrugada
const nightUiKey = { create: null, edit: null };

function parsePickerValue(value) {
  if (!value) return null;
  const d = new Date(value.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

function weekdayName(date) {
  return date.toLocaleDateString('es-ES', { weekday: 'long' });
}

function shortDayLabel(date) {
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }).replace(',', '');
}

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getNightChoice(prefix) {
  const checked = document.querySelector(`input[name="${prefix}Night"]:checked`);
  return checked ? checked.value : null;
}

// Devuelve { date, isNight, needsChoice } con la fecha/hora que se guardará
function resolveChosenDate(prefix) {
  const inputId = prefix === 'create' ? 'tableDateTime' : 'editScheduleDateTime';
  const picked = parsePickerValue(document.getElementById(inputId).value);
  if (!picked) return { date: null, isNight: false, needsChoice: false };
  const isNight = picked.getHours() < NIGHT_END_HOUR;
  if (!isNight) return { date: picked, isNight, needsChoice: false };
  const choice = getNightChoice(prefix);
  if (!choice) return { date: null, isNight, needsChoice: true };
  return { date: choice === 'this' ? addDays(picked, 1) : picked, isNight, needsChoice: false };
}

const SUMMARY_BASE = 'text-xs rounded-lg px-3 py-2 border';

function updateNightUI(prefix, { preselect = null } = {}) {
  const inputId = prefix === 'create' ? 'tableDateTime' : 'editScheduleDateTime';
  const picked = parsePickerValue(document.getElementById(inputId).value);
  const question = document.getElementById(`${prefix}NightQ`);
  const summary = document.getElementById(`${prefix}Summary`);
  const saveBtn = document.getElementById(prefix === 'create' ? 'createTableBtn' : 'editScheduleSaveBtn');
  const container = prefix === 'create' ? document.getElementById('createNightBlock') : summary;

  if (!picked) {
    container.classList.add('hidden');
    question.classList.add('hidden');
    nightUiKey[prefix] = null;
    saveBtn.disabled = false; // el campo vacío lo sigue validando el formulario
    return;
  }
  container.classList.remove('hidden');
  summary.classList.remove('hidden');

  const isNight = picked.getHours() < NIGHT_END_HOUR;
  // Si cambia el día o se entra/sale de la madrugada, se borra la elección previa
  const key = `${picked.toDateString()}|${isNight}`;
  if (nightUiKey[prefix] !== key) {
    document.querySelectorAll(`input[name="${prefix}Night"]`).forEach(r => { r.checked = false; });
    nightUiKey[prefix] = key;
  }
  if (preselect) {
    const r = document.getElementById(`${prefix}Night${preselect === 'prev' ? 'Prev' : 'This'}`);
    if (r) r.checked = true;
  }

  question.classList.toggle('hidden', !isNight);
  if (isNight) {
    const prevDay = addDays(picked, -1), nextDay = addDays(picked, 1);
    document.getElementById(`${prefix}NightPrevText`).innerHTML = `La noche del <b>${weekdayName(prevDay)} al ${weekdayName(picked)}</b>`;
    document.getElementById(`${prefix}NightPrevSub`).textContent = `se guarda: ${shortDayLabel(picked)}, ${hhmm(picked)}`;
    document.getElementById(`${prefix}NightThisText`).innerHTML = `La noche del <b>${weekdayName(picked)} al ${weekdayName(nextDay)}</b>`;
    document.getElementById(`${prefix}NightThisSub`).textContent = `se guarda: ${shortDayLabel(nextDay)}, ${hhmm(picked)}`;
  }

  const isPresencial = prefix === 'create'
    ? document.getElementById('tableModality').value === 'presencial'
    : (currentGlobalData.find(t => t.id === currentEditTableId) || {}).modality === 'presencial';
  const noun = isPresencial ? 'Tu evento' : 'Tu mesa';
  const resolved = resolveChosenDate(prefix);

  if (resolved.needsChoice) {
    summary.className = `${SUMMARY_BASE} border-dashed border-indigo-500 text-indigo-200`;
    summary.textContent = `🌙 Elige qué noche para poder ${prefix === 'create' ? 'crear' : 'guardar'}.`;
    saveBtn.disabled = true;
  } else if (resolved.date.getTime() < Date.now()) {
    summary.className = `${SUMMARY_BASE} border-red-800 text-red-300`;
    summary.textContent = isNight
      ? '❌ Esa noche ya pasó. Elige la otra noche u otro día.'
      : '❌ Esa fecha y hora ya pasaron. Elige una futura.';
    saveBtn.disabled = true;
  } else {
    const d = resolved.date;
    const dateText = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const nightText = isNight ? ` · la noche del ${weekdayName(addDays(d, -1))} al ${weekdayName(d)}` : '';
    summary.className = `${SUMMARY_BASE} border-zinc-700 bg-zinc-900 text-zinc-300`;
    summary.innerHTML = `📅 ${noun}: <b class="text-white">${escapeHtml(dateText)} a las ${hhmm(d)}</b>${escapeHtml(nightText)} · tu hora`;
    saveBtn.disabled = false;
  }
}

// Etiqueta "🌙 noche del viernes": si en la zona horaria indicada la hora
// cae de madrugada, devuelve el nombre del día anterior; si no, ''.
function nightOfName(utcISO, timeZone) {
  const d = new Date(utcISO);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timeZone || undefined }).format(d));
  if (!(hour < NIGHT_END_HOUR)) return '';
  // 7 horas antes siempre cae en la tarde/noche del día anterior
  return new Date(d.getTime() - 7 * 3600 * 1000).toLocaleDateString('es-ES', { weekday: 'long', timeZone: timeZone || undefined });
}

// ---------------------------------------------------------------------
// TIEMPO RELATIVO: "en 2 h", "¡Empezando!", "En curso"
// Se recalcula cada minuto sin volver a dibujar las tarjetas.
// ---------------------------------------------------------------------
function relativeTimeLabel(utcISO) {
  const diffMin = Math.round((new Date(utcISO).getTime() - Date.now()) / 60000);
  if (diffMin > 0) {
    if (diffMin < 60) return { text: `en ${diffMin} min`, soon: true };
    const hours = Math.round(diffMin / 60);
    if (hours < 24) return { text: `en ${hours} h`, soon: hours <= 3 };
    const days = Math.round(diffMin / 1440);
    return { text: `en ${days} día${days === 1 ? '' : 's'}`, soon: false };
  }
  if (diffMin > -30) return { text: '¡Empezando!', soon: true };
  return { text: 'En curso', soon: true };
}

// ---------------------------------------------------------------------
// HORA DE LLEGADA EN MINUTOS (para ordenar asistentes). La lectura de
// jugadores en formato viejo o nuevo (normalizePlayer) está en comun.js.
// ---------------------------------------------------------------------

function arrivalToMinutes(arrival) {
  if (!arrival) return Infinity;
  const parts = arrival.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return Infinity;
  return parts[0] * 60 + parts[1];
}

// ---------------------------------------------------------------------
// FECHA LOCAL (AAAAMMDD) de un instante en una zona horaria
// ---------------------------------------------------------------------
function localYMD(utcISO, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(utcISO)).replace(/-/g, '');
}

// ---------------------------------------------------------------------
// EVENTOS SEMANALES (recurrence: "weekly", solo presenciales)
// Cuando pasa la semana, el MISMO evento salta al mismo día y hora
// local de la semana siguiente (el enlace no cambia) y la lista de
// asistentes empieza vacía. La semana se suma en el calendario DEL
// LUGAR (originTz), no en horas: así un evento de los jueves 19:00 en
// Zaragoza sigue siendo a las 19:00 aunque cambie el horario de verano.
// ---------------------------------------------------------------------
function tzOffsetMinutes(tz, date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// Mismo día de la semana y hora local, n semanas después
function addWeeksInZone(utcISO, tz, n) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(utcISO)).map(x => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day + 7 * n, +p.hour, +p.minute);
  let guess = wall;
  for (let k = 0; k < 3; k++) guess = wall - tzOffsetMinutes(tz, new Date(guess)) * 60000;
  return new Date(guess).toISOString();
}

// Próxima fecha de un evento semanal que todavía no haya vencido.
// Se calcula siempre desde la fecha guardada: si dos navegadores lo
// hacen al mismo tiempo, llegan al mismo resultado (no salta dos veces).
function nextWeeklyOccurrence(t, nowMs) {
  let n = 0, iso = t.utcTime;
  while (Date.parse(iso) + PRESENCIAL_WINDOW_MS <= nowMs && n < 520) {
    n++;
    iso = addWeeksInZone(t.utcTime, t.originTz, n);
  }
  return iso;
}

function weekdayInZone(utcISO, tz) {
  return new Date(utcISO).toLocaleDateString('es-ES', { weekday: 'long', timeZone: tz || undefined });
}

// ---------------------------------------------------------------------
// FORMATO DE FECHA/HORA "SIN CONVERTIR" PARA EVENTOS PRESENCIALES
// Un evento presencial ocurre en un lugar físico real, así que su hora
// debe verse igual para todos sin importar desde qué huso horario lo
// consulten (a diferencia de las mesas virtuales, donde sí interesa
// convertir). Usamos el huso horario "originTz" guardado al crear el
// evento para formatear la fecha/hora tal como la vive el lugar.
// ---------------------------------------------------------------------
function formatPresencialDateTime(utcISO, originTz, dateOpts, timeOpts) {
  const d = new Date(utcISO);
  const tz = originTz || undefined;
  return {
    date: d.toLocaleDateString('es-ES', { ...dateOpts, timeZone: tz }),
    time: d.toLocaleTimeString('es-ES', { ...timeOpts, hour12: false, timeZone: tz })
  };
}
