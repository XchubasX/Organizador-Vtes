// =====================================================================
// js/compartir.js — COMPARTIR: invitación por WhatsApp, enlace directo a una mesa y
// agregar al calendario.
// Parte del código de index.html (separado el 29 sep 2026, fase 2).
// =====================================================================

// HELPER: Función para Compartir Invitación por WhatsApp (Mantiene los husos horarios específicos)
function shareTableInvitation(tableId) {
  const t = currentGlobalData.find(item => item.id === tableId);
  if (!t) return showToast('❌ Esta mesa ya no existe.', 'error');

  const date = new Date(t.utcTime);
  const modality = t.modality || 'virtual';
  const players = getRoster(t).players;
  const playersCount = players.length;

  let msg = `🦇 *¡INVITACIÓN A MESA DE VTES!* 🦇\n\n`;
  msg += `⚔️ *${modality === 'presencial' ? 'Evento' : 'Mesa'}:* ${t.name}\n`;

  if (modality === 'presencial') {
    // Mensaje para mesa PRESENCIAL: lugar, ciudad y hora local del evento
    // (huso de origen, sin conversión al huso de quien recibe el mensaje)
    const fPresencial = formatPresencialDateTime(t.utcTime, t.originTz, { weekday: 'long', month: 'short', day: 'numeric' }, { hour: '2-digit', minute: '2-digit' });
    const nightP = nightOfName(t.utcTime, t.originTz);
    const localWhen = `${fPresencial.date} - ${fPresencial.time} (hora local${nightP ? `, noche del ${nightP}` : ''})`;

    msg += `📍 *Lugar:* ${t.venue || ''}\n`;
    if (t.city || t.country) msg += `🌆 *Ciudad:* ${t.city || ''}${t.country ? ', ' + t.country : ''}\n`;
    if (t.recurrence === 'weekly') msg += `🔁 *Se repite:* cada ${weekdayInZone(t.utcTime, t.originTz)}\n`;
    msg += `👥 *Asistentes confirmados:* ${playersCount}\n`;
    msg += `📅 *Cuándo:* ${localWhen}\n`;
    if (t.mapsLink) msg += `🗺️ *Ubicación:* ${t.mapsLink}\n`;
    if (t.notes) msg += `📝 *Notas:* ${t.notes}\n`;

    // Agrupar asistentes por hora de llegada
    const withTime = players.filter(p => p.arrival);
    const withoutTime = players.filter(p => !p.arrival);

    if (withTime.length > 0) {
      msg += `\n🕒 *Horarios de llegada:*\n`;
      const groups = {};
      withTime.forEach(p => {
        if (!groups[p.arrival]) groups[p.arrival] = [];
        groups[p.arrival].push(p.nick);
      });
      Object.keys(groups)
        .sort((a, b) => arrivalToMinutes(a) - arrivalToMinutes(b))
        .forEach(time => {
          msg += `${time} — ${groups[time].join(', ')}\n`;
        });
    }
    if (withoutTime.length > 0) {
      msg += `${withTime.length > 0 ? '' : '\n'}Sin hora especificada: ${withoutTime.map(p => p.nick).join(', ')}\n`;
    }
  } else {
    // Mensaje para mesa VIRTUAL: husos horarios internacionales
    const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: false };
    const optionsDate = { weekday: 'short', month: 'short', day: 'numeric' };

    // Hora de cada país + "(noche del viernes)" si allí cae de madrugada
    const timeIn = (locale, tz) => {
      const night = nightOfName(t.utcTime, tz);
      return `${date.toLocaleTimeString(locale, { ...optionsTime, timeZone: tz })} (${date.toLocaleDateString(locale, { ...optionsDate, timeZone: tz })}${night ? `, noche del ${night}` : ''})`;
    };
    const timeMex = timeIn('es-MX', 'America/Mexico_City');
    const timeEsp = timeIn('es-ES', 'Europe/Madrid');
    const timeChi = timeIn('es-CL', 'America/Santiago');

    msg += `💻 *Plataforma:* ${t.platform || 'Lackey'}\n`;
    if (t.format) msg += `🃏 *Formato:* ${formatLabel(t.format)}\n`;
    msg += `👥 *Jugadores:* ${playersCount}/5\n`;
    if (t.discord) msg += `🎧 *Discord:* ${t.discord}\n`;
    if (t.notes) msg += `📝 *Notas:* ${t.notes}\n`;
    msg += `\n🌍 *HORARIOS INTERNACIONALES:*\n`;
    msg += `🇲🇽 ${timeMex}\n`;
    msg += `🇪🇸 ${timeEsp}\n`;
    msg += `🇨🇱 ${timeChi}\n`;
  }

  msg += `\n👉 *Únete a ${modality === 'presencial' ? 'este evento' : 'esta mesa'}:* ${getTableUrl(t.id)}\n\n`;
  msg += `¡Únete a la partida! 🩸`;

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(whatsappUrl, '_blank');
}

// ---------------------------------------------------------------------
// ENLACE DIRECTO A UNA MESA: https://.../Organizador-Vtes/#mesa-<id>
// Al abrirlo, la página cambia a la pestaña correcta, baja hasta la
// mesa y la resalta (ver openTableFromHash más abajo).
// ---------------------------------------------------------------------
function getSiteBaseUrl() {
  // Si la página se abrió con una ciudad en la URL (.../Organizador-Vtes/Zaragoza)
  // se quita esa parte para que el enlace funcione para cualquiera.
  let path = window.location.pathname;
  if (urlCityFilter) path = path.replace(/[^/]+\/?$/, '');
  if (!path.endsWith('/')) path = path.replace(/[^/]*$/, '');
  return window.location.origin + path;
}

function getTableUrl(tableId) {
  return `${getSiteBaseUrl()}#mesa-${tableId}`;
}

// Botón "🔗 Compartir": en el celular abre el menú de compartir del
// teléfono (Telegram, Discord, etc.); en computadora copia el enlace.
async function shareTableLink(tableId) {
  const t = currentGlobalData.find(item => item.id === tableId);
  if (!t) return showToast('❌ Esta mesa ya no existe.', 'error');
  const url = getTableUrl(tableId);
  const text = `🦇 ${t.modality === 'presencial' ? 'Evento' : 'Mesa'} de VTES: ${t.name}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: t.name, text, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // el usuario cerró el menú
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('🔗 Enlace copiado');
  } catch (e) {
    uiDialog({ title: '🔗 Enlace de la mesa', message: 'Copia este enlace:', input: { type: 'text', value: url }, confirmLabel: 'Listo' });
  }
}

let tableFromHashHandled = false;

function openTableFromHash() {
  if (tableFromHashHandled) return;
  const match = window.location.hash.match(/^#mesa-(.+)$/);
  if (!match) { tableFromHashHandled = true; return; }
  tableFromHashHandled = true;

  const tableId = decodeURIComponent(match[1]);
  const t = currentGlobalData.find(item => item.id === tableId);
  if (!t) {
    showToast('Esa mesa ya terminó o fue cerrada. Aquí están las mesas abiertas.', 'error');
    return;
  }
  const modality = t.modality || 'virtual';
  if (currentTableModalityFilter !== modality) setTableModality(modality);
  if (modality === 'presencial' && !matchesPresencialFilters(t)) clearPresencialFilters();
  setTimeout(() => highlightCard(tableId), 150);
}

// ---------------------------------------------------------------------
// AGREGAR A MI CALENDARIO
// Google Calendar (link) o archivo .ics (iPhone, Outlook y otros).
// Duración de referencia: 3 h las mesas virtuales, 4 h los presenciales.
// No se incluye la contraseña de la partida.
// ---------------------------------------------------------------------
let currentCalendarEvent = null;

function buildCalendarEvent(t) {
  const isPresencial = t.modality === 'presencial';
  const start = new Date(t.utcTime);
  const end = new Date(start.getTime() + (isPresencial ? 4 : 3) * 60 * 60 * 1000);
  const details = [];
  if (isPresencial) {
    if (t.mapsLink && isValidHttpUrl(t.mapsLink)) details.push(`Ubicación: ${t.mapsLink}`);
  } else {
    details.push(`Plataforma: ${t.platform || 'Lackey'}`);
    if (t.discord) details.push(`Discord: ${t.discord}`);
  }
  if (t.format) details.push(`Formato: ${formatLabel(t.format)}`);
  if (t.notes) details.push(`Notas: ${t.notes}`);
  details.push(`Mesa en VTES Scheduler: ${getTableUrl(t.id)}`);
  return {
    id: t.id,
    title: `VTES: ${t.name}`,
    start, end,
    location: isPresencial ? [t.venue, t.city, t.country].filter(Boolean).join(', ') : (t.platform || 'Lackey'),
    details: details.join('\n'),
    weekly: t.recurrence === 'weekly'
  };
}

function toCalendarStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20260927T020000Z
}

function openCalendarModal(tableId) {
  const t = currentGlobalData.find(item => item.id === tableId);
  if (!t) return showToast('❌ Esta mesa ya no existe.', 'error');
  currentCalendarEvent = buildCalendarEvent(t);
  const ev = currentCalendarEvent;
  const googleUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + `&text=${encodeURIComponent(ev.title)}`
    + `&dates=${toCalendarStamp(ev.start)}/${toCalendarStamp(ev.end)}`
    + `&details=${encodeURIComponent(ev.details)}`
    + `&location=${encodeURIComponent(ev.location)}`
    + (ev.weekly ? `&recur=${encodeURIComponent('RRULE:FREQ=WEEKLY')}` : '');
  document.getElementById('calendarGoogleLink').href = googleUrl;
  document.getElementById('calendarModalName').textContent = `"${t.name}"`;
  document.getElementById('calendarModal').classList.remove('hidden');
}

function closeCalendarModal() {
  document.getElementById('calendarModal').classList.add('hidden');
}

function downloadCalendarFile() {
  const ev = currentCalendarEvent;
  if (!ev) return;
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VTES Scheduler//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@vtes-scheduler`,
    `DTSTAMP:${toCalendarStamp(new Date())}`,
    `DTSTART:${toCalendarStamp(ev.start)}`,
    `DTEND:${toCalendarStamp(ev.end)}`,
    `SUMMARY:${esc(ev.title)}`,
    `LOCATION:${esc(ev.location)}`,
    `DESCRIPTION:${esc(ev.details)}`,
    ...(ev.weekly ? ['RRULE:FREQ=WEEKLY'] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vtes-mesa.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  closeCalendarModal();
  showToast('📅 Archivo de calendario descargado');
}
