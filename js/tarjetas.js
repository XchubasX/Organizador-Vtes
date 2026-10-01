// =====================================================================
// js/tarjetas.js — TARJETAS: pestañas y filtros, dibujar la lista de mesas y sus etiquetas.
// Parte del código de index.html (separado el 29 sep 2026, fase 2).
// =====================================================================

let currentTableModalityFilter = 'virtual';

// Ciudad indicada por la URL (ej. .../Organizador-Vtes/Zaragoza), o null si no aplica.
// Tiene prioridad sobre el filtro manual de ciudad hasta que el usuario lo toque o
// le dé clic a "Limpiar filtros".
let urlCityFilter = null;

function clearUrlCityFilter() {
  if (!urlCityFilter) return;
  urlCityFilter = null;
  const basePath = window.location.pathname.replace(/[^/]+\/?$/, '');
  window.history.replaceState({}, '', basePath || '/');
}

function setTableModality(mode) {
  document.getElementById('tableModality').value = mode;
  const virtualGroup = document.getElementById('virtualFieldsGroup');
  const presencialGroup = document.getElementById('presencialFieldsGroup');
  const btnVirtual = document.getElementById('modeVirtualBtn');
  const btnPresencial = document.getElementById('modePresencialBtn');

  const isVirtual = mode === 'virtual';
  virtualGroup.style.display = isVirtual ? 'contents' : 'none';
  presencialGroup.style.display = isVirtual ? 'none' : 'contents';

  btnVirtual.classList.toggle('bg-wine-600', isVirtual);
  btnVirtual.classList.toggle('text-white', isVirtual);
  btnVirtual.classList.toggle('bg-zinc-800', !isVirtual);
  btnVirtual.classList.toggle('text-zinc-400', !isVirtual);

  btnPresencial.classList.toggle('bg-wine-600', !isVirtual);
  btnPresencial.classList.toggle('text-white', !isVirtual);
  btnPresencial.classList.toggle('bg-zinc-800', isVirtual);
  btnPresencial.classList.toggle('text-zinc-400', isVirtual);

  document.getElementById('tableSectionIcon').textContent = isVirtual ? '⚔️' : '📍';
  document.getElementById('tableSectionTitle').textContent = isVirtual ? 'Abrir Nueva Mesa de Juego' : 'Crear Nuevo Evento Presencial';
  document.getElementById('tableNameLabel').textContent = isVirtual ? 'Nombre de Mesa' : 'Nombre de Evento';
  document.getElementById('tableSectionSubtitle').textContent = isVirtual
    ? 'Crea una mesa en tu plataforma preferida con horario fijo para que otros se sumen.'
    : 'Organiza una quedada presencial para que otros confirmen asistencia.';
  document.getElementById('createTableBtnLabel').textContent = isVirtual ? 'Abrir Mesa' : 'Crear Evento';
  document.getElementById('openCreateFormLabel').textContent = isVirtual ? 'Crear mesa' : 'Crear evento presencial';
  document.getElementById('presencialFiltersBar').style.display = isVirtual ? 'none' : 'flex';
  updateNightUI('create'); // el resumen dice "Tu mesa" o "Tu evento"

  // La lista de abajo se filtra para mostrar solo lo que coincide con la modalidad seleccionada
  currentTableModalityFilter = mode;
  renderAll(currentGlobalData);
}

// Aviso de "cargando" y de error de conexión (antes la lista se veía vacía)
function showLoadProblem() {
  if (dataLoaded) return;
  document.getElementById('customTablesContainer').innerHTML = `<div class="col-span-2 text-center py-6 space-y-2 bg-zinc-900 border border-red-800/60 rounded-xl"><p class="text-red-300 font-semibold">No se pudo conectar.</p><p class="text-zinc-400 text-sm">Revisa tu internet y vuelve a cargar la página.</p><button type="button" onclick="location.reload()" class="mt-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-600 font-semibold py-1.5 px-4 rounded-lg text-sm transition">Volver a cargar</button></div>`;
}

// Mostrar u ocultar la contraseña de la partida (la de "Ver").
// Mientras está oculta se ven puntitos; el botón cambia entre "Ver" y "Ocultar".
function togglePasswordView(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.classList.toggle('hidden');
  const oculta = el.classList.contains('hidden');
  const puntos = document.getElementById(elementId + '-puntos');
  if (puntos) puntos.classList.toggle('hidden', !oculta);
  const boton = document.getElementById(elementId + '-boton');
  if (boton) boton.textContent = oculta ? 'Ver' : 'Ocultar';
}

// Menú del botón "Invitar": WhatsApp o copiar enlace.
// Se cierra al elegir una opción, al tocar fuera o con Escape.
function closeInviteMenus() {
  document.querySelectorAll('.invite-menu').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('[id^="invitar-boton-"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function toggleInviteMenu(tableId) {
  const menu = document.getElementById('invitar-' + tableId);
  if (!menu) return;
  const abrir = menu.classList.contains('hidden');
  closeInviteMenus();
  if (abrir) {
    menu.classList.remove('hidden');
    const boton = document.getElementById('invitar-boton-' + tableId);
    if (boton) boton.setAttribute('aria-expanded', 'true');
  }
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.invite-menu') && !e.target.closest('[id^="invitar-boton-"]')) closeInviteMenus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeInviteMenus(); });

// MESAS PRIVADAS (solo virtuales): plegadas al final de la lista.
// mesasDesplegadas guarda las que la persona abrió en esta visita.
const mesasDesplegadas = new Set();
const esPrivada = t => t.privada === true && (t.modality || 'virtual') === 'virtual';
function toggleMesaPrivada(tableId) {
  if (mesasDesplegadas.has(tableId)) mesasDesplegadas.delete(tableId);
  else mesasDesplegadas.add(tableId);
  renderAll(currentGlobalData);
  const card = document.getElementById(`card-custom-${tableId}`);
  if (card && mesasDesplegadas.has(tableId)) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function platformLabel(platform) {
  return (platform || '').toLowerCase().includes('lackey') ? 'LackeyCCG' : 'Succubus Club';
}

// Formato de mesa virtual: Standard (Legacy) o V5
function formatLabel(format) {
  return format === 'v5' ? 'V5' : 'Standard (Legacy)';
}

// Fecha de la tarjeta: "martes 30 sep" (se muestra en mayúsculas).
// Presenciales en la zona del lugar; virtuales en la de quien mira.
function fechaTarjeta(utcISO, tz) {
  const partes = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: tz || undefined })
    .formatToParts(new Date(utcISO));
  const parte = tipo => (partes.find(x => x.type === tipo) || {}).value || '';
  return `${parte('weekday')} ${parte('day')} ${parte('month').replace('.', '')}`;
}

function matchesPresencialFilters(t) {
  const countryVal = document.getElementById('filterCountry').value || '';
  const cityVal = document.getElementById('filterCity').value || '';
  const dateVal = document.getElementById('filterDate').value || '';

  // Si la ciudad viene de la URL (ej. .../Organizador-Vtes/Zaragoza), manda sobre el
  // dropdown manual, y compara sin importar mayúsculas/acentos-caja.
  if (urlCityFilter) {
    if ((t.city || '').toLowerCase() !== urlCityFilter.toLowerCase()) return false;
  } else if (cityVal && (t.city || '').toLowerCase() !== cityVal.toLowerCase()) {
    return false;
  }

  if (countryVal && (t.country || '') !== countryVal) return false;
  if (dateVal) {
    // Se compara con la fecha DEL LUGAR del evento (su huso de origen),
    // que es la misma que se muestra en la tarjeta, no con la fecha de
    // quien consulta. Formato YYYY-MM-DD.
    const eventDateStr = new Date(t.utcTime).toLocaleDateString('en-CA', { timeZone: t.originTz || undefined });
    if (eventDateStr !== dateVal) return false;
  }
  return true;
}

// Filtro de País: lista con los países que tienen eventos abiertos
function updateCountryFilterOptions(presencialTables) {
  const countrySelect = document.getElementById('filterCountry');
  const currentValue = countrySelect.value;
  const countries = Array.from(new Set(presencialTables.map(t => t.country).filter(Boolean))).sort();
  countrySelect.innerHTML = '<option value="">Todos</option>' + countries.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (countries.includes(currentValue)) countrySelect.value = currentValue;
}

// Filtro de Ciudad: solo las ciudades del país elegido (o todas)
function updateCityFilterOptions(presencialTables) {
  const citySelect = document.getElementById('filterCity');
  const currentValue = citySelect.value;
  const countryVal = document.getElementById('filterCountry').value || '';
  const inCountry = countryVal ? presencialTables.filter(t => (t.country || '') === countryVal) : presencialTables;
  const cities = Array.from(new Set(inCountry.map(t => t.city).filter(Boolean))).sort();
  citySelect.innerHTML = '<option value="">Todas</option>' + cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  if (urlCityFilter) {
    // Refleja en el dropdown la ciudad de la URL si ya existe algún evento con ese
    // nombre (comparación sin distinguir mayúsculas). Si no hay coincidencia todavía,
    // el dropdown se queda en "Todas" pero el filtro de la URL sigue aplicando igual
    // (mostrará la lista vacía, no todos los eventos).
    const match = cities.find(c => c.toLowerCase() === urlCityFilter.toLowerCase());
    if (match) citySelect.value = match;
  } else if (cities.includes(currentValue)) {
    citySelect.value = currentValue;
  }
}

function clearPresencialFilters() {
  document.getElementById('filterCountry').value = '';
  document.getElementById('filterCity').value = '';
  pickerFilterDate.clear();
  clearUrlCityFilter();
  renderAll(currentGlobalData);
}

function renderAll(allData) {
  const customTablesContainer = document.getElementById('customTablesContainer');

  // Contadores de las pestañas (total de cada modalidad, sin filtros)
  const allTables = allData.filter(d => d.type === 'custom_table');
  document.getElementById('countVirtual').textContent = allTables.filter(d => (d.modality || 'virtual') === 'virtual').length;
  document.getElementById('countPresencial').textContent = allTables.filter(d => d.modality === 'presencial').length;

  const rawCustomTables = allTables.filter(d => (d.modality || 'virtual') === currentTableModalityFilter);

  let customTables = rawCustomTables;
  if (currentTableModalityFilter === 'presencial') {
    updateCountryFilterOptions(rawCustomTables);
    updateCityFilterOptions(rawCustomTables);
    customTables = rawCustomTables.filter(matchesPresencialFilters);
  }

  renderCustomTables(customTables, customTablesContainer);
}

function renderCustomTables(tables, container) {
  if (!dataLoaded) {
    container.innerHTML = '<p class="col-span-2 text-center text-zinc-400 py-4">Cargando mesas…</p>';
    return;
  }
  if (tables.length === 0) {
    container.innerHTML = `<p class="col-span-2 text-center text-zinc-400 py-4">${currentTableModalityFilter === 'presencial' ? 'No hay eventos presenciales creados. ¡Crea uno!' : 'No hay mesas abiertas creadas. ¡Abre una!'}</p>`;
    return;
  }

  // Primero las públicas por hora; al final las privadas por hora
  tables.sort((a, b) => (esPrivada(a) - esPrivada(b)) || (new Date(a.utcTime) - new Date(b.utcTime)));

  container.innerHTML = tables.map(t => {
    const roster = getRoster(t);
    const count = roster.players.length;
    const isPresencial = t.modality === 'presencial';
    const isFull = !isPresencial && count >= 5;
    const isReady = !isPresencial && count >= 4;
    const iOwn = isOwner(t);
    const manage = canManage(t);
    const alreadyIn = roster.entries.some(isMine);
    const id = escapeJsAttr(t.id);
    const privada = esPrivada(t);

    // Mesa privada plegada: una sola línea que se despliega al tocarla
    if (privada && !mesasDesplegadas.has(t.id)) {
      const d = new Date(t.utcTime);
      const fechaCorta = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
      const horaCorta = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return `
      <button type="button" id="card-custom-${escapeHtml(t.id)}" onclick="toggleMesaPrivada('${id}')" aria-expanded="false" data-privada-plegada
        class="w-full flex items-center gap-2.5 text-left bg-zinc-900 border border-zinc-700 hover:border-zinc-500 rounded-xl px-3.5 py-3 text-sm transition md:col-span-2"
        aria-label="Mesa privada: ${escapeHtml(t.name)}, ${escapeHtml(fechaCorta)} ${escapeHtml(horaCorta)}. Toca para verla.">
        <span class="shrink-0 text-xs font-bold text-zinc-300 bg-zinc-700 px-2 py-0.5 rounded-md">Privada</span>
        <span class="flex-1 min-w-0">
          <span class="block truncate text-wine-300 font-semibold">${escapeHtml(t.name)}</span>
          <span class="block text-[13px] text-zinc-400">${escapeHtml(fechaCorta)} · <strong class="text-zinc-200">${escapeHtml(horaCorta)}</strong> · ${Math.min(count, 5)}/5</span>
        </span>
        <span class="shrink-0 text-zinc-500" aria-hidden="true">▸</span>
      </button>`;
    }

    const zonaTarjeta = isPresencial ? t.originTz : undefined;
    const formattedDate = fechaTarjeta(t.utcTime, zonaTarjeta);
    const formattedTime = isPresencial
      ? formatPresencialDateTime(t.utcTime, t.originTz, {}, { hour: '2-digit', minute: '2-digit' }).time
      : new Date(t.utcTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const nocheDe = nightOfName(t.utcTime, zonaTarjeta);
    const relativo = relativeTimeLabel(t.utcTime);

    // Jugadores en orden de llegada y, si es presencial, ordenados por hora de llegada
    let displayPlayers = roster.players;
    if (isPresencial) {
      displayPlayers = displayPlayers.slice().sort((a, b) => arrivalToMinutes(a.arrival) - arrivalToMinutes(b.arrival));
    }
    // Entradas anotadas con MI cuenta (el organizador puede tener varias)
    const myPlayers = displayPlayers.filter(isMine);
    // Suplentes (solo mesas virtuales), en orden de llegada
    const subs = roster.subs;
    const mySubs = subs.filter(isMine);
    // Botoncito de vetar (solo el administrador, solo entradas con cuenta)
    const banBtn = (e) => (isAdmin && e.uid && e.uid !== myUid())
      ? `<button onclick="banEntry('${id}', '${escapeJsAttr(e.ref)}')" class="text-amber-500/80 hover:text-amber-300 text-sm leading-none px-2 py-1.5 -my-1.5 rounded" title="Vetar esta cuenta" aria-label="Vetar la cuenta de ${escapeHtml(e.nick)}">🚫</button>`
      : '';

    // Cupo, junto a la hora
    const statusBadge = isPresencial
      ? `<span class="bg-emerald-900/60 text-emerald-300 border border-emerald-700/70 text-[13px] px-3 py-1.5 rounded-full font-bold whitespace-nowrap">${count} confirmado${count === 1 ? '' : 's'}</span>`
      : isReady
        ? `<span class="bg-green-900/70 text-green-300 border border-green-600 text-[13px] px-3 py-1.5 rounded-full font-bold whitespace-nowrap">${count >= 5 ? 'Mesa llena' : 'Lista para jugar'} (${count}/5)</span>`
        : `<span class="bg-wine-900/60 text-wine-200 border border-wine-600/70 text-[13px] px-3 py-1.5 rounded-full font-bold whitespace-nowrap">Faltan ${5 - count} · ${count}/5</span>`;

    // Línea de datos: "LackeyCCG · V5 · Organizas tú" / "Presencial · cada jueves"
    const datos = isPresencial
      ? ['Presencial', t.recurrence === 'weekly' ? `cada ${escapeHtml(weekdayInZone(t.utcTime, t.originTz))}` : '']
      : [platformLabel(t.platform || 'Lackey'), t.format ? formatLabel(t.format) : ''];
    const datosHtml = datos.filter(Boolean).join(' · ')
      + (iOwn ? ' · <span class="text-purple-300 font-semibold">Organizas tú</span>' : '');

    // Discord y contraseña: siempre visibles (también para espectadores)
    const pwdId = `gamepwd-${escapeHtml(t.id)}`;
    const partidaHtml = `
      <div class="bg-zinc-800 rounded-lg px-3 py-2.5 space-y-2 text-sm">
        <div class="flex items-center justify-between gap-2">
          <span class="min-w-0"><span class="text-zinc-400">Discord</span>&nbsp; ${t.discord ? `<span class="text-zinc-100 font-semibold break-all">${escapeHtml(t.discord)}</span>` : `<span class="text-zinc-500 italic">No especificado</span>`}</span>
          ${manage ? `<button onclick="editCustomTableDiscord('${id}')" class="text-zinc-400 hover:text-white text-[13px] shrink-0 py-1">${t.discord ? 'Editar' : 'Definir'}</button>` : ''}
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="min-w-0"><span class="text-zinc-400">Contraseña</span>&nbsp; ${t.gamePassword
            ? `<span id="${pwdId}-puntos" class="text-zinc-100 font-mono font-semibold">••••••</span><span id="${pwdId}" class="hidden text-zinc-100 font-mono font-semibold select-all break-all">${escapeHtml(t.gamePassword)}</span> <button id="${pwdId}-boton" onclick="togglePasswordView('gamepwd-${id}')" class="text-wine-300 hover:text-wine-100 font-semibold underline py-1 ml-1">Ver</button>`
            : `<span class="text-zinc-500 italic">Sin contraseña</span>`}</span>
          ${manage ? `<button onclick="editCustomTableGamePassword('${id}')" class="text-zinc-400 hover:text-white text-[13px] shrink-0 py-1">${t.gamePassword ? 'Editar' : 'Definir'}</button>` : ''}
        </div>
      </div>
    `;

    // Solo se muestra el enlace de mapa si el link es un link real (http/https)
    const hasValidMap = t.mapsLink && isValidHttpUrl(t.mapsLink);
    const venueHtml = `
      <div class="bg-zinc-800 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3 text-sm">
        <span class="min-w-0">
          <span class="block text-zinc-100 font-semibold break-words">${escapeHtml(t.venue || '')}</span>
          <span class="block text-zinc-400">${escapeHtml(t.city || '')}${t.country ? ', ' + escapeHtml(t.country) : ''}</span>
        </span>
        <span class="flex flex-col items-end gap-1 shrink-0">
          ${hasValidMap
            ? `<a href="${escapeHtml(t.mapsLink)}" target="_blank" rel="noopener" class="text-emerald-300 hover:text-emerald-100 font-semibold underline py-1">Ver mapa</a>`
            : `<span class="text-zinc-500 italic text-[13px]">${t.mapsLink ? 'Link de mapa no válido' : 'Sin mapa'}</span>`}
          ${manage ? `<button onclick="editCustomTableMapsLink('${id}')" class="text-zinc-400 hover:text-white text-[13px] py-1">${t.mapsLink ? 'Editar' : 'Agregar'} link</button>` : ''}
        </span>
      </div>
    `;

    const playersHtml = displayPlayers.map(p => {
      const mine = isMine(p);
      const refArg = escapeJsAttr(p.ref);
      // Los registros anteriores al inicio de sesión solo los toca el administrador
      const canEditThis = (mine || manage) && (!p.legacy || isAdmin);
      return `
        <span class="inline-flex items-center gap-1.5 ${mine ? 'bg-purple-950/70 border-purple-600/80 text-purple-100' : 'bg-wine-950/50 border-wine-800/60 text-wine-100'} border text-sm px-2.5 py-1 rounded-lg font-medium">
          ${escapeHtml(p.nick)}${mine ? '<span class="text-purple-300 text-xs font-semibold">· tú</span>' : ''}${p.arrival ? `<span class="${mine ? 'text-purple-200' : 'text-wine-200'} font-mono text-xs">· ${escapeHtml(p.arrival)}</span>` : ''}
          ${isPresencial && canEditThis ? `<button onclick="editPlayerArrival('${id}', '${refArg}')" class="${mine ? 'text-purple-200 hover:text-purple-100' : 'text-wine-300 hover:text-wine-100'} font-bold text-sm leading-none px-2 py-1.5 -my-1.5 rounded" title="Editar hora de llegada" aria-label="Editar hora de llegada de ${escapeHtml(p.nick)}">✏️</button>` : ''}
          ${!mine && canEditThis ? `<button onclick="leaveTable('${id}', '${refArg}')" class="text-wine-300 hover:text-red-400 font-bold text-base leading-none px-2 py-1.5 -my-1.5 rounded" title="Remover jugador" aria-label="Quitar a ${escapeHtml(p.nick)}">×</button>` : ''}
          ${banBtn(p)}
        </span>
      `;
    }).join('') + (isPresencial ? '' : Array.from({ length: Math.max(0, 5 - count) }, () =>
      '<span class="inline-flex items-center border border-dashed border-zinc-600 text-zinc-500 text-sm px-2.5 py-1 rounded-lg">libre</span>').join(''));

    const subsHtml = subs.length === 0 ? '' : `
      <div class="space-y-2 bg-zinc-800/50 border border-dashed border-zinc-600 rounded-lg p-2.5">
        <p class="text-xs font-semibold text-zinc-400">⏳ Suplentes (${subs.length}/${SUBS_MAX}) · entran en este orden si alguien sale:</p>
        <ol class="space-y-1.5">
          ${subs.map((s, i) => {
            const mine = isMine(s);
            const canRemove = !mine && manage && (!s.legacy || isAdmin);
            return `
            <li class="flex items-center justify-between gap-2 text-sm">
              <span class="flex items-center gap-2 min-w-0">
                <span class="w-5 h-5 shrink-0 rounded-full bg-zinc-800 border border-zinc-600 text-xs text-zinc-300 font-bold flex items-center justify-center">${i + 1}</span>
                <span class="${mine ? 'text-purple-100' : 'text-zinc-200'} truncate">${escapeHtml(s.nick)}</span>${mine ? '<span class="text-purple-300 text-xs font-semibold shrink-0">· tú</span>' : ''}
              </span>
              <span class="flex items-center gap-1 shrink-0">
                ${banBtn(s)}
                ${canRemove ? `<button onclick="leaveTable('${id}', '${escapeJsAttr(s.ref)}')" class="text-zinc-400 hover:text-red-400 font-bold text-base leading-none px-2 py-1.5 -my-1.5 rounded" title="Quitar suplente" aria-label="Quitar a ${escapeHtml(s.nick)} de suplentes">×</button>` : ''}
              </span>
            </li>`;
          }).join('')}
        </ol>
      </div>
    `;

    // Si ya estoy anotado (y no organizo), no hay botón para anotarme otra vez.
    // El organizador que ya está anotado ve "Anotar a otra persona".
    const joinLabel = alreadyIn
      ? 'Anotar a otra persona'
      : (isPresencial ? '¡Confirmar asistencia!' : '¡Unirme a esta Mesa!');
    const botonPrincipal = 'w-full bg-wine-600 hover:bg-wine-500 text-white font-bold h-11 rounded-lg text-[15px] transition duration-150';
    const botonSecundario = 'flex-1 min-w-[6rem] bg-transparent hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 font-semibold h-10 px-2 rounded-lg text-[13px] transition';
    const openSimilarHtml = `<button onclick="openSimilarTable('${id}')" class="${botonSecundario} w-full">Abrir otra mesa a esta hora</button>`;
    const mainActionHtml = (alreadyIn && !manage) ? ((isFull && subs.length >= SUBS_MAX) ? openSimilarHtml : '')
      : !isFull ? `<button onclick="joinTable('${id}')" class="${botonPrincipal}">${joinLabel}</button>`
      : subs.length < SUBS_MAX ? `<button onclick="joinTable('${id}', true)" class="w-full bg-amber-700 hover:bg-amber-600 text-white font-bold h-11 rounded-lg text-[15px] transition duration-150">Apuntarme como suplente</button>`
      : openSimilarHtml;

    const botonSalir = 'flex-1 min-w-[8rem] bg-transparent hover:bg-red-900/60 text-zinc-300 hover:text-white border border-zinc-700 font-semibold h-10 px-2 rounded-lg text-[13px] transition';
    const leaveSubButtons = mySubs.map(s => `
      <button onclick="leaveTable('${id}', '${escapeJsAttr(s.ref)}')" class="${botonSalir}">Salir de suplentes${mySubs.length > 1 ? ` (${escapeHtml(s.nick)})` : ''}</button>
    `).join('');

    const leaveButtons = myPlayers.map(p => `
      <button onclick="leaveTable('${id}', '${escapeJsAttr(p.ref)}')" class="${botonSalir}">Salir${myPlayers.length > 1 ? ` (${escapeHtml(p.nick)})` : isPresencial ? ' del evento' : ' de la mesa'}</button>
    `).join('');

    const cardId = `card-custom-${escapeHtml(t.id)}`;
    const zonaTexto = isPresencial ? `<span class="text-emerald-400">${t.city ? 'hora de ' + escapeHtml(t.city) : 'hora local'}</span>` : (userTimezone ? `hora de ${escapeHtml(nombreZona(userTimezone))}` : 'tu hora');

    return `
      <div id="${cardId}" class="bg-zinc-900 border ${isPresencial ? 'border-emerald-600/50' : privada ? 'border-zinc-600' : (isReady ? 'border-green-600/60' : 'border-wine-600/40')} rounded-xl p-4 shadow-md space-y-3.5 transition-shadow">
        ${privada ? `<div class="flex justify-end -mb-2"><button type="button" onclick="toggleMesaPrivada('${id}')" aria-expanded="true" class="text-[13px] text-zinc-400 hover:text-white py-1">Ocultar ▴</button></div>` : ''}
        <!-- 1) Cuándo: fecha y hora grandes, con el cupo al lado -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-3">
            <span class="text-[17px] font-extrabold tracking-wide uppercase text-wine-300">${escapeHtml(formattedDate)}</span>
            <span class="shrink-0">${statusBadge}</span>
          </div>
          <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span class="text-[24px] leading-none font-extrabold tracking-tight text-white tabular-nums">${escapeHtml(formattedTime)}</span>
            <span class="text-sm text-zinc-400">${zonaTexto}${nocheDe ? ` · <span class="text-indigo-300">noche del ${escapeHtml(nocheDe)}</span>` : ''} · <span class="rel-time ${relativo.soon ? 'text-amber-300 font-semibold' : ''}" data-time="${escapeHtml(t.utcTime)}">${relativo.text}</span></span>
          </div>
        </div>

        <!-- 2) Qué: nombre y datos en una línea -->
        <div class="space-y-1">
          <h3 class="font-bold text-wine-300 text-lg leading-snug break-words">${privada ? '<span class="align-middle mr-1.5 text-xs font-bold text-zinc-300 bg-zinc-700 px-2 py-0.5 rounded-md">Privada</span>' : ''}${escapeHtml(t.name)}</h3>
          <p class="text-sm text-zinc-300">${datosHtml}</p>
        </div>

        ${t.notes ? `
        <div class="bg-zinc-800/70 border border-zinc-700 rounded-lg p-2 flex items-start justify-between gap-2 text-sm">
          <p class="text-zinc-200 break-words min-w-0">${escapeHtml(t.notes)}</p>
          ${manage ? `<button onclick="editCustomTableNotes('${id}')" class="text-zinc-400 hover:text-white text-[13px] shrink-0 py-1">Editar</button>` : ''}
        </div>` : ''}

        ${isPresencial ? venueHtml : ''}

        <!-- 3) Quién -->
        <div class="flex flex-wrap gap-2">
          ${playersHtml}
        </div>

        ${subsHtml}

        ${isPresencial ? '' : partidaHtml}

        <!-- 4) Acciones -->
        <div class="space-y-2 pt-0.5">
          ${mainActionHtml}
          <div class="flex flex-wrap gap-2">
            <button id="invitar-boton-${escapeHtml(t.id)}" onclick="toggleInviteMenu('${id}')" class="${botonSecundario}" aria-haspopup="true" aria-expanded="false" aria-controls="invitar-${escapeHtml(t.id)}">Invitar</button>
            <button onclick="openCalendarModal('${id}')" class="${botonSecundario}" title="Agregar a mi calendario">Calendario</button>
          </div>
          <div id="invitar-${escapeHtml(t.id)}" class="invite-menu hidden bg-zinc-800 border border-zinc-700 rounded-lg p-1.5 shadow-xl shadow-black/50">
            <button onclick="closeInviteMenus(); shareTableInvitation('${id}')" class="w-full text-left px-3 py-2.5 rounded-md hover:bg-zinc-700 transition">
              <span class="block text-[15px] font-semibold text-zinc-100">Mensaje por WhatsApp</span>
              <span class="block text-[13px] text-zinc-400">Invitación completa con horarios de México, España y Chile</span>
            </button>
            <div class="h-px bg-zinc-700 mx-2 my-0.5"></div>
            <button onclick="closeInviteMenus(); shareTableLink('${id}')" class="w-full text-left px-3 py-2.5 rounded-md hover:bg-zinc-700 transition">
              <span class="block text-[15px] font-semibold text-zinc-100">Copiar enlace</span>
              <span class="block text-[13px] text-zinc-400">Para pegarlo en Discord, Telegram o donde quieras</span>
            </button>
          </div>
          ${leaveButtons || leaveSubButtons ? `<div class="flex flex-wrap gap-2">${leaveButtons}${leaveSubButtons}</div>` : ''}
        </div>

        <!-- 5) Gestión, pequeña y al final -->
        ${manage || isPresencial ? `
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-800 pt-2 text-[13px]">
          ${manage ? `<button onclick="editTableSchedule('${id}')" class="text-zinc-400 hover:text-wine-300 transition py-1">Editar horario</button>` : ''}
          ${manage && !t.notes ? `<button onclick="editCustomTableNotes('${id}')" class="text-zinc-400 hover:text-white transition py-1">Agregar nota</button>` : ''}
          ${isPresencial ? `<button onclick="window.open('sorteo.html?tableId=${encodeURIComponent(t.id)}', '_blank')" class="text-zinc-400 hover:text-white transition py-1">Orden de Asientos</button>` : ''}
          ${manage && isPresencial && t.recurrence === 'weekly' ? `<button onclick="skipWeek('${id}')" class="text-zinc-400 hover:text-emerald-300 transition py-1">Saltar esta semana</button>` : ''}
          ${manage && !isPresencial ? `<button onclick="cambiarPrivacidad('${id}', ${privada ? 'false' : 'true'})" class="text-zinc-400 hover:text-white transition py-1">${privada ? 'Hacer pública' : 'Hacer privada'}</button>` : ''}
          ${manage ? `<button onclick="deleteEntry('${id}')" class="ml-auto text-zinc-400 hover:text-red-400 transition py-1">${isPresencial ? 'Cerrar Evento' : 'Cerrar Mesa'}</button>` : ''}
        </div>` : ''}
      </div>
    `;
  }).join('');
}
