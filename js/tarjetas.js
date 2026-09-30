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

function togglePasswordView(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.classList.toggle('hidden');
}

function getPlatformBadge(platform) {
  const isLackey = (platform || '').toLowerCase().includes('lackey');
  return isLackey
    ? `<span class="bg-blue-950 text-blue-300 border border-blue-700/60 text-xs px-2 py-0.5 rounded font-semibold">LackeyCCG</span>`
    : `<span class="bg-purple-950 text-purple-300 border border-purple-700/60 text-xs px-2 py-0.5 rounded font-semibold">Succubus Club</span>`;
}

// Formato de mesa virtual: Standard (Legacy) o V5
function formatLabel(format) {
  return format === 'v5' ? 'V5' : 'Standard (Legacy)';
}
function getFormatBadge(format) {
  if (!format) return ''; // mesas creadas antes de que existiera el campo
  return format === 'v5'
    ? `<span class="bg-orange-950 text-orange-300 border border-orange-600/70 text-xs px-2 py-0.5 rounded font-bold whitespace-nowrap">V5</span>`
    : `<span class="bg-zinc-800 text-zinc-300 border border-zinc-600 text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap">Standard (Legacy)</span>`;
}

function getLocationBadge() {
  return `<span class="bg-emerald-950 text-emerald-300 border border-emerald-700/60 text-xs px-2 py-0.5 rounded font-semibold">📍 Presencial</span>`;
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

  tables.sort((a, b) => new Date(a.utcTime) - new Date(b.utcTime));

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

    let formattedDate, formattedTime;
    if (isPresencial) {
      // Hora local del lugar del evento (huso de origen), sin convertir
      const fCard = formatPresencialDateTime(t.utcTime, t.originTz, { weekday: 'short', month: 'short', day: 'numeric' }, { hour: '2-digit', minute: '2-digit' });
      formattedDate = fCard.date;
      formattedTime = fCard.time;
    } else {
      const dateObj = new Date(t.utcTime);
      formattedDate = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      formattedTime = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

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

    let statusBadge = isPresencial
      ? `<span class="bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 text-xs px-2.5 py-1 rounded-full font-bold whitespace-nowrap">👥 ${count} confirmado${count === 1 ? '' : 's'}</span>`
      : isReady
        ? `<span class="bg-green-900/80 text-green-300 text-xs px-2.5 py-1 rounded-full font-bold whitespace-nowrap border border-green-600">✅ ${count >= 5 ? 'Mesa llena' : 'Lista para jugar'} (${count}/5)</span>`
        : `<span class="bg-wine-900/60 text-wine-300 border border-wine-700/60 text-xs px-2.5 py-1 rounded-full font-bold whitespace-nowrap">🪑 Faltan ${5 - count} jugador(es)</span>`;

    const discordHtml = `
      <div class="bg-indigo-950/40 border border-indigo-700/50 rounded-lg p-2 flex items-center justify-between text-xs text-indigo-300">
        <span class="font-medium flex items-center gap-1 min-w-0">
          <span>🎧</span> <strong>Discord:</strong>
          ${t.discord ? `<span class="text-indigo-200 font-normal break-all">${escapeHtml(t.discord)}</span>` : `<span class="text-zinc-500 italic">No especificado</span>`}
        </span>
        ${manage ? `<button onclick="editCustomTableDiscord('${id}')" class="text-indigo-400 hover:text-indigo-200 bg-indigo-900/60 border border-indigo-700/50 px-2 py-0.5 rounded transition text-xs font-semibold ml-2 shrink-0">
          ✏️ ${t.discord ? 'Editar' : 'Definir'}
        </button>` : ''}
      </div>
    `;

    const gamePwdHtml = `
      <div class="bg-blue-950/40 border border-blue-700/50 rounded-lg p-2 flex items-center justify-between text-xs text-blue-300">
        <span class="font-medium flex items-center gap-1">
          <span>🔑</span> <strong>Pass Partida:</strong>
          ${t.gamePassword ? `<span id="gamepwd-${escapeHtml(t.id)}" class="hidden font-mono font-bold text-blue-200 bg-zinc-900 px-2 py-0.5 rounded border border-blue-500/30 select-all">${escapeHtml(t.gamePassword)}</span><button onclick="togglePasswordView('gamepwd-${id}')" class="text-blue-400 hover:text-white bg-zinc-700 hover:bg-zinc-600 px-2 py-0.5 rounded transition text-xs ml-1">👁️ Ver</button>` : `<span class="text-zinc-500 italic">Sin contraseña</span>`}
        </span>
        ${manage ? `<button onclick="editCustomTableGamePassword('${id}')" class="text-blue-400 hover:text-blue-200 bg-blue-900/60 border border-blue-700/50 px-2 py-0.5 rounded transition text-xs font-semibold ml-2 shrink-0">
          ✏️ ${t.gamePassword ? 'Editar' : 'Definir'}
        </button>` : ''}
      </div>
    `;

    // Solo se muestra el botón de mapa si el link es un link real (http/https)
    const hasValidMap = t.mapsLink && isValidHttpUrl(t.mapsLink);
    const venueHtml = `
      <div class="bg-emerald-950/40 border border-emerald-700/50 rounded-lg p-2.5 text-xs text-emerald-300 space-y-1.5">
        <div class="flex items-center gap-1.5">
          <span>📍</span> <strong>${escapeHtml(t.venue || '')}</strong>
        </div>
        <div class="text-emerald-400/70 pl-4">${escapeHtml(t.city || '')}${t.country ? ', ' + escapeHtml(t.country) : ''}</div>
        <div class="flex items-center justify-between pt-1">
          ${hasValidMap
            ? `<a href="${escapeHtml(t.mapsLink)}" target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-200 bg-emerald-900/60 border border-emerald-700/50 px-2 py-0.5 rounded transition text-xs font-semibold">🗺️ Ver ubicación</a>`
            : `<span class="text-zinc-500 italic">${t.mapsLink ? 'Link de mapa no válido' : 'Sin link de mapa'}</span>`}
          ${manage ? `<button onclick="editCustomTableMapsLink('${id}')" class="text-emerald-400 hover:text-emerald-200 bg-emerald-900/60 border border-emerald-700/50 px-2 py-0.5 rounded transition text-xs font-semibold ml-2">
            ✏️ ${t.mapsLink ? 'Editar' : 'Agregar'} link
          </button>` : ''}
        </div>
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
    }).join('');

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
      ? '➕ Anotar a otra persona'
      : `➕ ${isPresencial ? '¡Confirmar asistencia!' : '¡Unirme a esta Mesa!'}`;
    const openSimilarHtml = `
              <button onclick="openSimilarTable('${id}')" class="w-full bg-wine-600/20 hover:bg-wine-600 text-wine-300 hover:text-white border border-wine-600/50 font-bold py-1.5 rounded-lg text-xs transition duration-150">
                ➕ Abrir otra mesa a esta hora
              </button>
            `;
    const mainActionHtml = (alreadyIn && !manage) ? ((isFull && subs.length >= SUBS_MAX) ? openSimilarHtml : '') : !isFull ? `
              <button onclick="joinTable('${id}')" class="w-full bg-wine-600/20 hover:bg-wine-600 text-wine-300 hover:text-white border border-wine-600/50 font-bold py-1.5 rounded-lg text-xs transition duration-150">
                ${joinLabel}
              </button>
            ` : subs.length < SUBS_MAX ? `
              <button onclick="joinTable('${id}', true)" class="w-full bg-zinc-800 hover:bg-amber-900/60 text-amber-300 hover:text-white border border-amber-700/60 font-bold py-1.5 rounded-lg text-xs transition duration-150">
                ⏳ Apuntarme como suplente
              </button>
            ` : `
              <button onclick="openSimilarTable('${id}')" class="w-full bg-wine-600/20 hover:bg-wine-600 text-wine-300 hover:text-white border border-wine-600/50 font-bold py-1.5 rounded-lg text-xs transition duration-150">
                ➕ Abrir otra mesa a esta hora
              </button>
            `;

    const leaveSubButtons = mySubs.map(s => `
      <button onclick="leaveTable('${id}', '${escapeJsAttr(s.ref)}')" class="flex-1 min-w-[8rem] bg-zinc-800 hover:bg-red-900/60 text-zinc-300 hover:text-white border border-zinc-600 font-semibold py-1.5 px-2 rounded-lg text-xs transition">
        🚪 Salir de suplentes${mySubs.length > 1 ? ` (${escapeHtml(s.nick)})` : ''}
      </button>
    `).join('');

    const leaveButtons = myPlayers.map(p => `
      <button onclick="leaveTable('${id}', '${escapeJsAttr(p.ref)}')" class="flex-1 min-w-[8rem] bg-zinc-800 hover:bg-red-900/60 text-zinc-300 hover:text-white border border-zinc-600 font-semibold py-1.5 px-2 rounded-lg text-xs transition">
        🚪 Salir${myPlayers.length > 1 ? ` (${escapeHtml(p.nick)})` : isPresencial ? ' del evento' : ' de la mesa'}
      </button>
    `).join('');

    const cardId = `card-custom-${escapeHtml(t.id)}`;

    return `
      <div id="${cardId}" class="bg-zinc-900 border ${isPresencial ? 'border-emerald-600/50' : (isReady ? 'border-green-600/60' : 'border-wine-600/40')} rounded-xl p-4 shadow-md space-y-4 transition-shadow">
        <!-- Encabezado con renglones fijos: 1) etiquetas + estado, 2) nombre, 3) fecha -->
        <div class="space-y-1.5 border-b border-zinc-800 pb-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5 min-w-0">
              ${isPresencial ? getLocationBadge() : getPlatformBadge(t.platform || 'Lackey')}
              ${isPresencial ? '' : getFormatBadge(t.format)}
              ${isPresencial && t.recurrence === 'weekly' ? `<span class="bg-emerald-950 text-emerald-200 border border-emerald-600/70 text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap">🔁 Cada ${escapeHtml(weekdayInZone(t.utcTime, t.originTz))}</span>` : ''}
              ${iOwn ? `<span class="bg-purple-950 text-purple-200 border border-purple-600/70 text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap">👑 Organizas tú</span>` : ''}
            </div>
            <div class="shrink-0">${statusBadge}</div>
          </div>
          <h3 class="font-bold text-wine-300 text-base leading-snug break-words">${escapeHtml(t.name)}</h3>
          <p class="text-xs text-zinc-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>${formattedDate} - <span class="font-mono text-white font-semibold">${formattedTime}</span> ${isPresencial ? '<span class="text-emerald-400">(hora local)</span>' : '<span class="text-zinc-400">(tu hora)</span>'}</span>
            ${nightBadgeHtml(t)}
            ${relativeBadgeHtml(t.utcTime)}
          </p>
        </div>

        ${t.notes ? `
        <div class="bg-zinc-800/70 border border-zinc-700 rounded-lg p-2 flex items-start justify-between gap-2 text-xs">
          <p class="text-zinc-200 break-words min-w-0"><span class="mr-1">📝</span>${escapeHtml(t.notes)}</p>
          ${manage ? `<button onclick="editCustomTableNotes('${id}')" class="text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-600 px-2 py-0.5 rounded transition text-xs font-semibold shrink-0">✏️ Editar</button>` : ''}
        </div>` : ''}

        <div class="space-y-2">
          ${isPresencial ? venueHtml : discordHtml + gamePwdHtml}
        </div>

        <div class="space-y-2">
          <p class="text-xs font-semibold text-zinc-400">${isPresencial ? `Asistentes confirmados (${count})` : `Jugadores confirmados (${count}/5)`}:</p>
          <div class="flex flex-wrap gap-2">
            ${playersHtml}
          </div>
        </div>

        ${subsHtml}

        <div class="space-y-2 pt-1">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            ${mainActionHtml}
            <button onclick="shareTableInvitation('${id}')" class="w-full bg-green-700/30 hover:bg-green-600 text-green-300 hover:text-white border border-green-600/50 font-bold py-1.5 rounded-lg text-xs transition duration-150 flex items-center justify-center gap-1.5">
              📲 Invitar por WhatsApp
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button onclick="shareTableLink('${id}')" class="flex-1 min-w-[8rem] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-600 font-semibold py-1.5 px-2 rounded-lg text-xs transition">🔗 Compartir</button>
            <button onclick="openCalendarModal('${id}')" class="flex-1 min-w-[8rem] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-600 font-semibold py-1.5 px-2 rounded-lg text-xs transition">📅 Agregar a mi calendario</button>
            ${leaveButtons}
            ${leaveSubButtons}
          </div>
        </div>

        <!-- Fila fija de acciones pequeñas -->
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-zinc-800 pt-2 text-xs">
          <span class="flex items-center gap-3">
            ${isPresencial ? `<button onclick="window.open('sorteo.html?tableId=${encodeURIComponent(t.id)}', '_blank')" class="text-zinc-400 hover:text-red-400 transition py-1">🎲 Orden de Asientos</button>` : ''}
            ${manage && isPresencial && t.recurrence === 'weekly' ? `<button onclick="skipWeek('${id}')" class="text-zinc-400 hover:text-emerald-300 transition py-1">⏭️ Saltar esta semana</button>` : ''}
            ${manage && !t.notes ? `<button onclick="editCustomTableNotes('${id}')" class="text-zinc-400 hover:text-white transition py-1">📝 Agregar nota</button>` : ''}
          </span>
          ${manage ? `<span class="flex items-center gap-3">
            <button onclick="editTableSchedule('${id}')" class="text-zinc-400 hover:text-wine-400 transition py-1">✏️ Editar horario</button>
            <button onclick="deleteEntry('${id}')" class="text-zinc-400 hover:text-red-400 transition py-1">${isPresencial ? 'Cerrar Evento' : 'Cerrar Mesa'}</button>
          </span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}
