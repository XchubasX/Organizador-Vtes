// =====================================================================
// js/mesas.js — MESAS: crear, unirse, salir, editar, estadísticas de cada mesa,
// limpieza de mesas vencidas, eventos semanales y cerrar.
// Parte del código de index.html (separado el 29 sep 2026, fase 2).
// =====================================================================

// ---------------------------------------------------------------------
// FICHA POR MESA PARA ESTADÍSTICAS (stats/tablesLog/{id})
// Se guarda una ficha por cada mesa/evento que NO se borra cuando la
// mesa se cierra o vence (estadisticas.html la usa para las gráficas y
// borra sola las fichas de más de 12 meses). Contiene solo: tipo, fecha
// de juego, fecha de creación, zona horaria, ciudad/país, nicks que se
// unieron y si una mesa virtual llegó a 4+ jugadores.
// Los datos base (tipo, fecha, zona, ciudad) se reescriben en cada
// escritura: así las mesas creadas antes de que existiera la ficha
// también quedan registradas en cuanto alguien se une o edita.
// ---------------------------------------------------------------------

// Convierte un texto (nombre de ciudad o nick de jugador) en una llave
// válida para Firebase (no permite . # $ [ ] / en las llaves). Usada
// para las estadísticas agregadas por ciudad y por jugador; el texto
// original se guarda aparte para mostrar.
function sanitizeStatsKey(str) {
  const clean = (str || '').trim().replace(/[.#$\[\]\/]/g, '_');
  return clean || 'Desconocido';
}

// Llave de la ficha: los eventos semanales tienen UNA FICHA POR SEMANA
// (id_AAAAMMDD), para que cada jueves cuente como un evento distinto.
function tableLogKey(tableId, t) {
  return t.recurrence === 'weekly' ? `${tableId}_${localYMD(t.utcTime, t.originTz)}` : tableId;
}

// Guarda primero la mesa y después, por separado, las estadísticas.
// Así, si las reglas rechazan algo de las estadísticas (por ejemplo, en
// una ficha antigua), crear, unirse, salir o editar sigue funcionando.
function updateWithStats(updates) {
  const main = {}, stats = {};
  Object.entries(updates).forEach(([k, v]) => { (k.startsWith('stats/') ? stats : main)[k] = v; });
  return db.ref().update(main).then(() => {
    if (Object.keys(stats).length) db.ref().update(stats).catch(e => console.warn('Estadísticas no guardadas:', e && e.message));
  });
}

// Escribe los datos base de la ficha y devuelve su llave
function addTableLogBase(updates, tableId, t) {
  const key = tableLogKey(tableId, t);
  const base = `stats/tablesLog/${key}`;
  const isPresencial = t.modality === 'presencial';
  updates[`${base}/modality`] = isPresencial ? 'presencial' : 'virtual';
  updates[`${base}/startAt`] = t.utcTime;
  updates[`${base}/originTz`] = t.originTz || '';
  // Cuenta del organizador (desde el 29 sep 2026, para contar personas que organizan)
  if (t.ownerUid) updates[`${base}/owner`] = t.ownerUid;
  if (isPresencial) {
    updates[`${base}/city`] = t.city || '';
    updates[`${base}/country`] = t.country || '';
  } else if (t.format === 'standard' || t.format === 'v5') {
    // Formato de la mesa virtual (requiere la regla "format" en stats/tablesLog)
    updates[`${base}/format`] = t.format;
  }
  return key;
}

// Cuenta de un jugador para la ficha de estadísticas: solo si se anotó con
// su propia cuenta (llave = uid). Los que anota el organizador llevan la
// cuenta del organizador y se cuentan solo por nick, para no inflarlo.
function entryUidForStats(entry) {
  return entry && !entry.legacy && entry.uid && entry.key === entry.uid ? entry.uid : null;
}

// Llave del nick en la ficha: sin distinguir mayúsculas ("Ana" = "ana")
function tableLogNickKey(nick) {
  return sanitizeStatsKey((nick || '').toLowerCase());
}

// EDITAR HORARIO (solo el organizador o el administrador)
let currentEditTableId = null;

function editTableSchedule(tableId) {
  const tableRef = db.ref(`vtes_records/${tableId}`);

  tableRef.get().then(async snapshot => {
    if (!snapshot.exists()) return showToast('❌ Esta mesa ya no existe.', 'error');
    const table = snapshot.val();

    const ok = await authorizeTableAction(table);
    if (ok) openEditScheduleModal(tableId, table.name, table.utcTime);
  });
}

function openEditScheduleModal(tableId, tableName, currentUtcTime) {
  currentEditTableId = tableId;
  document.getElementById('editScheduleTableName').textContent = `"${tableName}" — horario actual: ${new Date(currentUtcTime).toLocaleString()}`;
  const current = new Date(currentUtcTime);
  pickerEditSchedule.setDate(current);
  // Si la mesa es de madrugada, la pregunta ya viene con su noche marcada
  nightUiKey.edit = null;
  updateNightUI('edit', { preselect: current.getHours() < NIGHT_END_HOUR ? 'prev' : null });
  document.getElementById('editScheduleModal').classList.remove('hidden');
}

function closeEditScheduleModal() {
  document.getElementById('editScheduleModal').classList.add('hidden');
  currentEditTableId = null;
}

function guardarHorario(e) {
  e.preventDefault();
  const newLocalInput = document.getElementById('editScheduleDateTime').value;
  if (!newLocalInput || !currentEditTableId) return;

  const resolved = resolveChosenDate('edit');
  if (resolved.needsChoice) {
    return showToast('🌙 Elige qué noche antes de guardar.', 'error');
  }
  const newDate = resolved.date;
  if (newDate.getTime() < Date.now()) {
    return showToast('❌ No puedes mover el horario al pasado. Elige una fecha y hora futura.', 'error');
  }

  // Se actualiza la mesa y su ficha de estadísticas en un solo paso
  const updates = {};
  updates[`vtes_records/${currentEditTableId}/utcTime`] = newDate.toISOString();
  updates[`vtes_records/${currentEditTableId}/utcMs`] = newDate.getTime();
  const editedTable = currentGlobalData.find(t => t.id === currentEditTableId);
  if (editedTable) {
    const newKey = addTableLogBase(updates, currentEditTableId, { ...editedTable, utcTime: newDate.toISOString() });
    const oldKey = tableLogKey(currentEditTableId, editedTable);
    if (oldKey !== newKey) {
      // Evento semanal movido a otro día: la ficha de esta semana se
      // mueve también (con sus asistentes) en lugar de quedar duplicada
      updates[`stats/tablesLog/${oldKey}`] = null;
      getRoster(editedTable).players.forEach(pl => {
        if (pl.nick) updates[`stats/tablesLog/${newKey}/players/${tableLogNickKey(pl.nick)}`] = pl.nick;
        const u = entryUidForStats(pl);
        if (u) updates[`stats/tablesLog/${newKey}/uids/${u}`] = true;
      });
    }
  }
  updateWithStats(updates)
    .then(() => showToast('✅ Horario actualizado'))
    .catch(() => showToast('❌ No se pudo guardar. Revisa tu conexión.', 'error'));
  closeEditScheduleModal();
}

// ---------------------------------------------------------------------
// UNIRSE A UNA MESA / CONFIRMAR ASISTENCIA
// En modalidad virtual se conserva el flujo simple de siempre (prompt).
// En modalidad presencial se abre un modal para capturar Nick + hora
// estimada de llegada (opcional).
// ---------------------------------------------------------------------
let currentJoinTableId = null;
let currentJoinAsSub = false; // true = apuntarse como suplente de una mesa virtual llena

// Suplentes: solo mesas virtuales llenas, máximo 3, en orden de llegada.
// Si un jugador sale (o lo remueven), el primer suplente entra solo.
const MAX_PLAYERS = 5;
const SUBS_MAX = 3;

async function joinTable(tableId, asSub = false) {
  if (!(await requireLogin())) return;
  const tableRef = db.ref(`vtes_records/${tableId}`);

  tableRef.get().then(snapshot => {
    if (!snapshot.exists()) return showToast('❌ Esta mesa ya no existe.', 'error');
    const table = snapshot.val();
    // Cada cuenta se anota una sola vez; solo el organizador (o el
    // administrador) puede anotar a más personas.
    const alreadyIn = getEntries(table).some(isMine);
    if (alreadyIn && !canManage(table)) {
      return showToast('Ya estás anotado en esta mesa. Solo el organizador puede anotar a más personas.', 'error');
    }
    openJoinModal(tableId, table, asSub, alreadyIn);
  });
}

// Misma ventana para mesas virtuales y eventos presenciales; en las
// virtuales se oculta el campo de hora de llegada.
function openJoinModal(tableId, table, asSub = false, addingOther = false) {
  const isPresencial = table.modality === 'presencial';
  currentJoinTableId = tableId;
  currentJoinAsSub = !isPresencial && asSub;
  document.getElementById('joinModalTitle').textContent = addingOther
    ? 'Anotar a otra persona'
    : (isPresencial ? 'Confirmar Asistencia' : (currentJoinAsSub ? 'Apuntarte como suplente' : 'Unirte a la Mesa'));
  document.getElementById('joinSubmitBtn').textContent = addingOther ? 'Anotar' : (isPresencial ? 'Confirmar' : (currentJoinAsSub ? 'Apuntarme' : 'Unirme'));
  document.getElementById('joinArrivalGroup').classList.toggle('hidden', !isPresencial);
  document.getElementById('joinModalEventName').textContent = `"${table.name}"`;
  document.getElementById('joinNickError').classList.add('hidden');
  document.getElementById('joinNick').value = addingOther ? '' : getSavedNick();
  pickerJoinArrival.clear();
  if (isPresencial && table.utcTime) {
    pickerJoinArrival.setDate(new Date(table.utcTime));
  }
  document.getElementById('joinModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('joinNick').focus(), 50);
}

function closeJoinModal() {
  document.getElementById('joinModal').classList.add('hidden');
  document.getElementById('joinForm').reset();
  document.getElementById('joinNickError').classList.add('hidden');
  currentJoinTableId = null;
  currentJoinAsSub = false;
}

async function enviarUnirse(e) {
  e.preventDefault();
  const nick = document.getElementById('joinNick').value.trim();
  const arrival = document.getElementById('joinArrival').value.trim();
  if (!nick || !currentJoinTableId) return;

  const btn = document.getElementById('joinSubmitBtn');
  btn.disabled = true;
  const askedAsSub = currentJoinAsSub;
  const result = await addPlayerToTable(currentJoinTableId, nick, arrival || null, askedAsSub);
  btn.disabled = false;

  if (result.error) {
    // El error se muestra dentro de la ventana, para corregir sin volver a empezar
    const errorEl = document.getElementById('joinNickError');
    errorEl.textContent = result.error;
    errorEl.classList.remove('hidden');
    return;
  }
  closeJoinModal();
  if (result.substitute) showToast('✅ Te apuntaste como suplente');
  else if (result.presencial) showToast('✅ Asistencia confirmada');
  else showToast(askedAsSub ? '✅ Se liberó una plaza: te uniste a la mesa' : '✅ Te uniste a la mesa');
}

// Devuelve una promesa con { error } si algo impide unirse, o
// { presencial } / { substitute } cuando Firebase confirma que se guardó.
// La entrada se guarda en signups/{uid}; si la cuenta ya está anotada y
// es el organizador (o el administrador), anota a otra persona con una
// llave aleatoria.
function addPlayerToTable(tableId, nick, arrival, asSub = false) {
  const tableRef = db.ref(`vtes_records/${tableId}`);
  const uid = myUid();
  if (!uid) return Promise.resolve({ error: 'Necesitas entrar con Google para unirte.' });
  if (nick.length > NICK_MAX) return Promise.resolve({ error: `El nick puede tener máximo ${NICK_MAX} caracteres.` });

  return tableRef.get().then(snapshot => {
    if (!snapshot.exists()) return { error: 'Esta mesa ya no existe.' };
    const table = snapshot.val();
    const isPresencial = table.modality === 'presencial';
    const { entries, subs } = getRoster(table);

    if (entries.some(e => e.nick.toLowerCase() === nick.toLowerCase())) {
      return { error: `"${nick}" ya está anotado en esta mesa. Usa otro nick.` };
    }

    let key = uid;
    if (table.signups && table.signups[uid]) {
      if (!canManage(table)) return { error: 'Ya estás anotado en esta mesa. Solo el organizador puede anotar a más personas.' };
      key = tableRef.child('signups').push().key;
    }

    const isSub = !isPresencial && entries.length >= MAX_PLAYERS;
    if (isSub) {
      if (!asSub) return { error: 'La mesa se acaba de llenar. Cierra esta ventana y apúntate como suplente.' };
      if (subs.length >= SUBS_MAX) return { error: `Ya hay ${SUBS_MAX} suplentes. Puedes abrir otra mesa a la misma hora.` };
    }

    const entry = { uid: uid, nick: nick, at: firebase.database.ServerValue.TIMESTAMP };
    if (isPresencial && arrival) entry.arrival = arrival;

    const updates = {};
    updates[`vtes_records/${tableId}/signups/${key}`] = entry;

    // Estadísticas: se agrupan en la misma llamada que guarda al jugador,
    // para no duplicar el número de escrituras a Firebase. Estos
    // contadores son históricos (no se borran aunque la mesa expire).
    const logKey = addTableLogBase(updates, tableId, table);
    if (isSub) {
      // Suplente: no cuenta como jugador hasta que entre a la mesa, pero
      // queda anotado en la ficha (subs) para medir el uso.
      updates[`stats/tablesLog/${logKey}/subs/${tableLogNickKey(nick)}`] = nick;
    } else if (isPresencial) {
      const cityKey = sanitizeStatsKey(table.city);
      updates['stats/presencialJoins'] = firebase.database.ServerValue.increment(1);
      updates[`stats/presencialByCity/${cityKey}/joins`] = firebase.database.ServerValue.increment(1);
      updates[`stats/presencialByCity/${cityKey}/name`] = table.city || 'Desconocido';
      updates[`stats/presencialByCity/${cityKey}/country`] = table.country || '';
      // Registro de nicks por evento presencial (para estadisticas.html)
      updates[`stats/presencialEventsLog/${tableId}/players/${sanitizeStatsKey(nick)}`] = nick;
      updates[`stats/presencialEventsLog/${tableId}/city`] = table.city || 'Desconocido';
      updates[`stats/presencialEventsLog/${tableId}/country`] = table.country || '';
      updates[`stats/tablesLog/${logKey}/players/${tableLogNickKey(nick)}`] = nick;
      if (key === uid) updates[`stats/tablesLog/${logKey}/uids/${uid}`] = true;
    } else {
      updates['stats/virtualJoins'] = firebase.database.ServerValue.increment(1);
      updates[`stats/tablesLog/${logKey}/players/${tableLogNickKey(nick)}`] = nick;
      if (key === uid) updates[`stats/tablesLog/${logKey}/uids/${uid}`] = true;
      if (entries.length + 1 >= 4) updates[`stats/tablesLog/${logKey}/filled`] = true;
    }

    if (key === uid) saveNick(nick);

    return updateWithStats(updates)
      .then(() => (isSub ? { substitute: true } : { presencial: isPresencial }))
      .catch(() => ({ error: 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.' }));
  }).catch(() => ({ error: 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.' }));
}

// ---------------------------------------------------------------------
// EDITAR HORA DE LLEGADA (solo eventos presenciales)
// La puede cambiar el propio jugador, el organizador o el administrador.
// ---------------------------------------------------------------------
async function editPlayerArrival(tableId, ref) {
  const t = currentGlobalData.find(item => item.id === tableId);
  if (!t) return showToast('❌ Esta mesa ya no existe.', 'error');
  const entry = getEntries(t).find(e => e.ref === ref);
  if (!entry) return showToast('❌ Ese jugador ya no está en la lista.', 'error');
  if (!(await requireLogin())) return;
  if (!isMine(entry) && !canManage(t)) return showToast('🔒 Solo el jugador o el organizador pueden cambiar esa hora.', 'error');
  if (entry.legacy && !isAdmin) return showToast('🔒 Este registro es anterior al inicio de sesión: solo el administrador puede cambiarlo.', 'error');

  const TIME_RE = /^(\d{1,2}):(\d{2})$/;
  const input = await uiDialog({
    title: '🕒 Hora de llegada',
    message: `Hora de llegada de "${entry.nick}". Déjala vacía para quitarla.`,
    input: { type: 'time', label: 'Hora (24 horas)', value: entry.arrival || '' },
    confirmLabel: 'Guardar',
    validate: (value) => (value === '' || TIME_RE.test(value)) ? null : 'Usa el formato HH:MM, por ejemplo 18:30.'
  });
  if (input === null) return; // Canceló

  let newArrival = null;
  if (input !== '') {
    const match = input.match(TIME_RE);
    newArrival = `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  let write;
  if (entry.legacy) {
    // Registro anterior (arreglo players): lo reescribe el administrador
    const players = toArray(t.players).map((p, i) => (`p:${i}` === ref ? { nick: normalizePlayer(p).nick, arrival: newArrival } : p));
    write = db.ref(`vtes_records/${tableId}/players`).set(players);
  } else {
    write = db.ref(`vtes_records/${tableId}/signups/${entry.key}`).update({ arrival: newArrival });
  }
  write.then(() => showToast('✅ Hora de llegada actualizada'))
    .catch(() => showToast('❌ No se pudo guardar. Revisa tu conexión.', 'error'));
}

const PRESENCIAL_WINDOW_MS = 24 * 60 * 60 * 1000;

// BARREDORA SILENCIOSA
// Mesas virtuales: se limpian 3 horas después de su horario (suficiente
// para cubrir una sesión de juego completa).
// Eventos presenciales: la asistencia llega escalonada durante todo el
// día (la hora guardada es solo una referencia, no el fin del evento),
// así que se les da una ventana de 24 horas desde su horario registrado
// en vez de 3. Esto garantiza que el evento se mantenga visible durante
// toda la jornada sin importar a qué hora del día se haya programado.
// Las escrituras de limpieza solo las intenta quien tiene sesión (las
// reglas de Firebase permiten a cualquier cuenta borrar una mesa vencida
// o mover un evento semanal vencido, y nada más). Sin sesión, la mesa
// vencida simplemente no se muestra. Cada mesa se intenta una sola vez
// por visita para no repetir escrituras.
const sweepTried = new Set();

function sweepExpiredTables(dataArray) {
  const now = new Date().getTime();
  const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
  const validData = [];
  const canSweep = !!currentUser && !isBanned;

  dataArray.forEach(item => {
    if (!item.utcTime) return;
    const itemTime = new Date(item.utcTime).getTime();
    const windowMs = item.modality === 'presencial' ? PRESENCIAL_WINDOW_MS : THREE_HOURS_MS;
    if (now > (itemTime + windowMs)) {
      if (item.modality === 'presencial' && item.recurrence === 'weekly') {
        // Evento semanal: salta a la semana siguiente en lugar de borrarse
        if (canSweep) rollWeeklyEvent(item);
        validData.push({ ...item, utcTime: nextWeeklyOccurrence(item, now), players: [], signups: null });
      } else if (canSweep && !sweepTried.has(item.id)) {
        sweepTried.add(item.id);
        recordsRef.child(item.id).remove().catch(() => {});
      }
    } else {
      validData.push(item);
    }
  });
  return validData;
}

// Mueve un evento semanal vencido a su próxima fecha y vacía la lista.
// Se calcula desde la fecha guardada: si dos navegadores lo hacen a la
// vez llegan al mismo resultado, y las reglas rechazan al segundo
// (el evento ya no está vencido).
function rollWeeklyEvent(item) {
  if (sweepTried.has(item.id)) return;
  sweepTried.add(item.id);
  const next = nextWeeklyOccurrence(item, Date.now());
  const updates = {};
  updates[`vtes_records/${item.id}/utcTime`] = next;
  updates[`vtes_records/${item.id}/utcMs`] = Date.parse(next);
  updates[`vtes_records/${item.id}/signups`] = null;
  updates[`vtes_records/${item.id}/players`] = null;
  db.ref().update(updates).catch(() => {});
}

// Abrir una Mesa de Juego
async function crearMesa(e) {
  e.preventDefault();
  const name = document.getElementById('tableName').value.trim();
  const localInput = document.getElementById('tableDateTime').value;
  const creator = document.getElementById('tableCreator').value.trim();
  const modality = document.getElementById('tableModality').value;

  if (!localInput) return showToast('❌ Selecciona una fecha y hora.', 'error');
  if (!creator) return showToast('❌ Escribe tu nick.', 'error');
  if (creator.length > NICK_MAX) return showToast(`❌ El nick puede tener máximo ${NICK_MAX} caracteres.`, 'error');

  // Fecha/hora final, ya con la noche elegida si la hora es de madrugada
  const resolved = resolveChosenDate('create');
  if (resolved.needsChoice) {
    document.getElementById('createNightQ').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return showToast('🌙 Elige qué noche antes de crear la mesa.', 'error');
  }
  const selectedDate = resolved.date;
  if (selectedDate.getTime() < Date.now()) {
    return showToast('❌ No puedes crear una mesa en el pasado. Elige una fecha y hora futura.', 'error');
  }

  // La sesión se revisa aquí también (pudo cerrarse con el formulario abierto)
  if (!(await requireLogin())) return;
  const uid = myUid();

  const recordData = {
    type: 'custom_table',
    name: name,
    utcTime: selectedDate.toISOString(),
    utcMs: selectedDate.getTime(),
    modality: modality,
    ownerUid: uid,
    originTz: userTimezone
  };
  // El organizador queda anotado como el primer jugador / asistente
  const creatorEntry = { uid: uid, nick: creator, at: firebase.database.ServerValue.TIMESTAMP };

  if (modality === 'presencial') {
    const venue = document.getElementById('tableVenue').value.trim();
    const country = document.getElementById('tableCountry').value;
    const city = document.getElementById('tableCity').value.trim();
    const mapsLink = document.getElementById('tableMapsLink').value.trim();
    const creatorArrival = document.getElementById('tableCreatorArrival').value.trim();

    if (!venue) return showToast('❌ Ingresa el Lugar.', 'error');
    if (!city) return showToast('❌ Ingresa la Ciudad.', 'error');

    // El link de Maps es opcional, pero si se escribe debe ser un link real
    const mapsError = document.getElementById('tableMapsLinkError');
    if (mapsLink && !isValidHttpUrl(mapsLink)) {
      mapsError.classList.remove('hidden');
      document.getElementById('tableMapsLink').focus();
      return;
    }
    mapsError.classList.add('hidden');

    recordData.venue = venue;
    recordData.country = country;
    recordData.city = city;
    recordData.mapsLink = mapsLink || '';
    // Evento semanal: el mismo evento salta a la semana siguiente al vencer
    if (document.getElementById('tableRecurring').checked) recordData.recurrence = 'weekly';
    // Hora de llegada del organizador (opcional), igual que cualquier invitado
    if (creatorArrival) creatorEntry.arrival = creatorArrival;
  } else {
    recordData.platform = document.getElementById('tablePlatform').value;
    savePlatform(recordData.platform);
    recordData.format = document.getElementById('tableFormat').value === 'v5' ? 'v5' : 'standard';
    saveFormat(recordData.format);
    recordData.discord = document.getElementById('tableDiscord').value.trim() || '';
    recordData.gamePassword = document.getElementById('tableGamePassword').value.trim() || '';
  }
  recordData.signups = { [uid]: creatorEntry };

  // Notas (opcional, todas las mesas): texto corto, máximo 150 caracteres
  const notes = document.getElementById('tableNotes').value.trim().slice(0, NOTES_MAX);
  if (notes) recordData.notes = notes;

  const newRef = recordsRef.push();
  const newId = newRef.key;

  // Estadísticas: se agrupan en la misma llamada que crea el registro,
  // para no duplicar el número de escrituras a Firebase. Estos
  // contadores son históricos (no se borran aunque la mesa expire o se cierre).
  const updates = {};
  updates[`vtes_records/${newId}`] = recordData;

  if (modality === 'presencial') {
    const cityKey = sanitizeStatsKey(recordData.city);
    updates['stats/presencialEventsCreated'] = firebase.database.ServerValue.increment(1);
    updates['stats/presencialJoins'] = firebase.database.ServerValue.increment(1);
    updates[`stats/presencialByCity/${cityKey}/name`] = recordData.city;
    updates[`stats/presencialByCity/${cityKey}/country`] = recordData.country || '';
    updates[`stats/presencialByCity/${cityKey}/eventsCreated`] = firebase.database.ServerValue.increment(1);
    updates[`stats/presencialByCity/${cityKey}/joins`] = firebase.database.ServerValue.increment(1);

    // Registro detallado de este evento (ciudad, país, fecha y nicks
    // de quienes participan) para el listado en estadisticas.html.
    // Se conserva aunque el evento se borre o expire; estadisticas.html
    // se encarga de podar los registros más antiguos si se acumulan
    // demasiados (ver loadStats -> pruneOldEventsLog).
    const creatorNickKey = sanitizeStatsKey(creator);
    updates[`stats/presencialEventsLog/${newId}/city`] = recordData.city;
    updates[`stats/presencialEventsLog/${newId}/country`] = recordData.country || '';
    updates[`stats/presencialEventsLog/${newId}/createdAt`] = firebase.database.ServerValue.TIMESTAMP;
    updates[`stats/presencialEventsLog/${newId}/players/${creatorNickKey}`] = creator;
  } else {
    updates['stats/virtualTablesCreated'] = firebase.database.ServerValue.increment(1);
    updates['stats/virtualJoins'] = firebase.database.ServerValue.increment(1);
  }

  // Ficha para estadísticas
  const newLogKey = addTableLogBase(updates, newId, recordData);
  updates[`stats/tablesLog/${newLogKey}/createdAt`] = firebase.database.ServerValue.TIMESTAMP;
  updates[`stats/tablesLog/${newLogKey}/players/${tableLogNickKey(creator)}`] = creator;
  updates[`stats/tablesLog/${newLogKey}/uids/${uid}`] = true;

  saveNick(creator);

  const submitBtn = document.getElementById('createTableBtn');
  submitBtn.disabled = true;

  updateWithStats(updates).then(() => {
    // Limpia el formulario pero SE QUEDA en la misma pestaña (Virtual o
    // Presencial) donde se creó, para que la mesa nueva se vea en la lista.
    document.getElementById('customTableForm').reset();
    pickerCustomTable.clear();
    pickerCreatorArrival.clear();
    setTableModality(modality); // también oculta la pregunta "¿Qué noche?" (campo vacío)
    closeCreateForm();

    // Si hay filtros activos que esconderían el evento nuevo, se limpian.
    if (modality === 'presencial' && !matchesPresencialFilters(recordData)) {
      clearPresencialFilters();
    }

    showCreatedModal(newId, recordData);
  }).catch((error) => {
    console.error(error);
    showToast('❌ No se pudo crear. Revisa tu conexión a internet e inténtalo de nuevo.', 'error');
  }).finally(() => {
    submitBtn.disabled = false;
  });
}

// ---------------------------------------------------------------------
// EDITAR DISCORD / CONTRASEÑA DE PARTIDA / LINK DE MAPS
// Acceso libre (dato informativo), ahora en la ventana propia del sitio.
// Se lee el valor actual de la mesa en vez de pasarlo en el botón.
// ---------------------------------------------------------------------
async function editTableField(tableId, field, { title, label, placeholder = '', type = 'text', validate = null, doneText, maxLength = null }) {
  const t = currentGlobalData.find(item => item.id === tableId);
  if (!t) return showToast('❌ Esta mesa ya no existe.', 'error');
  if (!(await authorizeTableAction(t))) return;
  const value = await uiDialog({
    title,
    input: { type, label, placeholder, value: t[field] || '', maxLength },
    confirmLabel: 'Guardar',
    validate
  });
  if (value === null) return;
  db.ref(`vtes_records/${tableId}`).update({ [field]: value })
    .then(() => showToast(doneText))
    .catch(() => showToast('❌ No se pudo guardar. Revisa tu conexión.', 'error'));
}

function editCustomTableDiscord(tableId) {
  editTableField(tableId, 'discord', { title: '🎧 Discord', label: 'Servidor / Canal de Discord', placeholder: 'ej. VTES Español', doneText: '✅ Discord actualizado' });
}

function editCustomTableGamePassword(tableId) {
  editTableField(tableId, 'gamePassword', { title: '🔑 Contraseña de la partida', label: 'Contraseña', placeholder: 'ej. vtes123', doneText: '✅ Contraseña actualizada' });
}

function editCustomTableNotes(tableId) {
  editTableField(tableId, 'notes', {
    title: '📝 Notas de la mesa',
    label: `Notas (máximo ${NOTES_MAX} caracteres; déjalo vacío para quitarlas)`,
    placeholder: 'ej. Principiantes bienvenidos',
    maxLength: NOTES_MAX,
    validate: (value) => value.length <= NOTES_MAX ? null : `Máximo ${NOTES_MAX} caracteres.`,
    doneText: '✅ Notas actualizadas'
  });
}

function editCustomTableMapsLink(tableId) {
  editTableField(tableId, 'mapsLink', {
    title: '🗺️ Link de Google Maps',
    label: 'Link (déjalo vacío para quitarlo)',
    placeholder: 'https://maps.app.goo.gl/...',
    type: 'url',
    validate: (value) => (value === '' || isValidHttpUrl(value)) ? null : 'Pega un link que empiece con https:// (por ejemplo, de Google Maps).',
    doneText: '✅ Link de ubicación actualizado'
  });
}

// ---------------------------------------------------------------------
// SALIR DE UNA MESA / QUITAR A UN JUGADOR O SUPLENTE
// - Tu propia entrada (anotada con tu cuenta): solo confirma.
// - La de otra persona: solo el organizador o el administrador.
// - Registros anteriores al inicio de sesión: solo el administrador.
// En mesas virtuales, si sale alguien de los 5 y hay suplentes, el
// primero entra solo (el orden de llegada decide quién juega).
// ---------------------------------------------------------------------
function leaveTable(tableId, ref) {
  const tableRef = db.ref(`vtes_records/${tableId}`);

  tableRef.get().then(async snapshot => {
    if (!snapshot.exists()) return showToast('❌ Esta mesa ya no existe.', 'error');
    const table = snapshot.val();
    const { entries, players: before, subs } = getRoster(table);
    const entry = entries.find(e => e.ref === ref);
    if (!entry) return showToast('❌ Ese jugador ya no está en la lista.', 'error');
    if (!(await requireLogin())) return;

    const isSelf = isMine(entry);
    const isPresencial = table.modality === 'presencial';
    const wasSub = subs.some(s => s.ref === ref);
    const fromPlace = isPresencial ? 'del evento' : 'de la mesa';

    if (!isSelf && !canManage(table)) return showToast('🔒 Solo el organizador puede quitar a otros jugadores.', 'error');
    if (entry.legacy && !isAdmin) return showToast('🔒 Este registro es anterior al inicio de sesión: solo el administrador puede quitarlo.', 'error');

    const confirmed = isSelf
      ? await uiDialog({
          title: wasSub ? '🚪 Salir de suplentes' : '🚪 Salir',
          message: wasSub
            ? `¿Quieres dejar de ser suplente en "${table.name}" (como ${entry.nick})?`
            : `¿Quieres salir ${fromPlace} "${table.name}" (como ${entry.nick})?`,
          confirmLabel: 'Salir',
          danger: true
        })
      : await uiDialog({
          title: wasSub ? '❌ Quitar suplente' : '❌ Remover jugador',
          message: wasSub
            ? `¿Quieres quitar a "${entry.nick}" de los suplentes?`
            : `¿Quieres remover a "${entry.nick}" ${fromPlace}?`,
          confirmLabel: wasSub ? 'Quitar' : 'Remover',
          danger: true
        });
    if (!confirmed) return;

    // La mesa/evento NO se borra al quedar vacía: solo se cierra por
    // acción del organizador/administrador o al vencer su horario.
    const updates = {};
    if (entry.legacy) {
      const [kind, idxStr] = ref.split(':');
      const idx = Number(idxStr);
      if (kind === 'p') {
        const arr = toArray(table.players).filter((_, i) => i !== idx);
        updates[`vtes_records/${tableId}/players`] = arr.length ? arr : null;
      } else {
        const arr = toArray(table.substitutes).filter((_, i) => i !== idx);
        updates[`vtes_records/${tableId}/substitutes`] = arr.length ? arr : null;
      }
    } else {
      updates[`vtes_records/${tableId}/signups/${entry.key}`] = null;
    }

    // Mesa virtual con suplentes: el primero ocupa la plaza que se libera
    // y ahí empieza a contar en estadísticas como un jugador más.
    let promoted = null;
    if (!isPresencial && !wasSub && subs.length > 0) {
      promoted = subs[0];
      updates['stats/virtualJoins'] = firebase.database.ServerValue.increment(1);
      const logKey = addTableLogBase(updates, tableId, table);
      updates[`stats/tablesLog/${logKey}/players/${tableLogNickKey(promoted.nick)}`] = promoted.nick;
      updates[`stats/tablesLog/${logKey}/promoted/${tableLogNickKey(promoted.nick)}`] = promoted.nick;
      const promotedUid = entryUidForStats(promoted);
      if (promotedUid) updates[`stats/tablesLog/${logKey}/uids/${promotedUid}`] = true;
      if (before.length >= 4) updates[`stats/tablesLog/${logKey}/filled`] = true;
    }

    updateWithStats(updates).then(() => {
      if (promoted) offerSubstituteNotice(tableId, table, entry.nick, promoted.nick, isSelf);
      else if (wasSub) showToast(isSelf ? '✅ Ya no eres suplente' : `✅ Se quitó a "${entry.nick}" de los suplentes`);
      else showToast(isSelf ? `✅ Saliste ${fromPlace}` : `✅ Se removió a "${entry.nick}"`);
    }).catch(() => showToast('❌ No se pudo guardar. Revisa tu conexión.', 'error'));
  });
}

// Tras subir a un suplente: ofrece avisar en WhatsApp con el mensaje ya escrito
async function offerSubstituteNotice(tableId, table, leftNick, promoted, isSelf) {
  const ok = await uiDialog({
    title: isSelf ? '🚪 Saliste de la mesa' : `✅ Se removió a "${leftNick}"`,
    message: `${promoted} (primer suplente) ocupa ${isSelf ? 'tu' : 'su'} plaza. ¿Quieres avisar en el grupo?`,
    confirmLabel: '📲 Avisar en WhatsApp',
    cancelLabel: 'Ahora no'
  });
  if (!ok) return;
  const who = isSelf ? 'Me bajo' : `*${leftNick}* se baja`;
  const msg = `🚪 ${who} de la mesa *${table.name}*. Entra *${promoted}* como suplente. 🩸\n\n👉 ${getTableUrl(tableId)}`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
}

// "Abrir otra mesa a esta hora": formulario con hora, plataforma y formato
// de la mesa llena. Discord y contraseña los pone el nuevo organizador.
function nextTableName(name) {
  const m = (name || '').match(/^(.*) \(Mesa (\d+)\)$/);
  return (m ? `${m[1]} (Mesa ${Number(m[2]) + 1})` : `${name} (Mesa 2)`).slice(0, 60);
}

async function openSimilarTable(tableId) {
  const t = currentGlobalData.find(item => item.id === tableId);
  if (!t) return showToast('❌ Esta mesa ya no existe.', 'error');
  if (!(await requireLogin())) return;
  setTableModality('virtual');
  await openCreateForm();
  document.getElementById('tableName').value = nextTableName(t.name);
  const start = new Date(t.utcTime);
  pickerCustomTable.setDate(start);
  nightUiKey.create = null;
  updateNightUI('create', { preselect: start.getHours() < NIGHT_END_HOUR ? 'prev' : null });
  const platformSelect = document.getElementById('tablePlatform');
  if (t.platform && [...platformSelect.options].some(o => o.value === t.platform)) platformSelect.value = t.platform;
  if (t.format === 'standard' || t.format === 'v5') document.getElementById('tableFormat').value = t.format;
  document.getElementById('tableDiscord').value = '';
  document.getElementById('tableGamePassword').value = '';
  document.getElementById('tableNotes').value = '';
  const hint = document.getElementById('createCopyHint');
  hint.textContent = `Copiamos hora, plataforma y formato de "${t.name}". Pon tu Discord y tu contraseña.`;
  hint.classList.remove('hidden');
  document.getElementById('createFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------
// SALTAR ESTA SEMANA (eventos semanales)
// Mueve el evento una semana adelante sin detener la serie (por
// ejemplo, un jueves festivo). Misma autorización que Editar horario.
// La ficha de estadísticas de la semana saltada se borra: no se jugó.
// ---------------------------------------------------------------------
function skipWeek(id) {
  const tableRef = db.ref(`vtes_records/${id}`);
  tableRef.get().then(async snapshot => {
    if (!snapshot.exists()) return showToast('❌ Este evento ya no existe.', 'error');
    const table = snapshot.val();
    if (table.recurrence !== 'weekly') return;
    const nextIso = addWeeksInZone(table.utcTime, table.originTz, 1);
    const f = formatPresencialDateTime(nextIso, table.originTz, { weekday: 'long', day: 'numeric', month: 'long' }, { hour: '2-digit', minute: '2-digit' });

    const ok = await authorizeTableAction(table, {
      confirmTitle: '⏭️ Saltar esta semana',
      confirmMessage: `"${table.name}" pasará al ${f.date} a las ${f.time}. La lista de asistentes de esta semana se vaciará.`,
      confirmLabel: 'Saltar'
    });
    if (!ok) return;

    const skippedKey = tableLogKey(id, table);
    tableRef.transaction(cur => {
      if (!cur || cur.utcTime !== table.utcTime) return; // alguien lo cambió mientras tanto
      cur.utcTime = nextIso;
      cur.utcMs = Date.parse(nextIso);
      delete cur.players;
      delete cur.signups;
      return cur;
    }).then(result => {
      if (!result || !result.committed) return showToast('❌ El evento cambió mientras tanto. Revisa la fecha y vuelve a intentar.', 'error');
      db.ref(`stats/tablesLog/${skippedKey}`).remove().catch(() => {});
      showToast(`✅ Movido al ${f.date}`);
    }).catch(() => showToast('❌ No se pudo guardar. Revisa tu conexión.', 'error'));
  });
}

// ELIMINAR O CERRAR MESA / EVENTO (organizador o administrador + confirmación)
function deleteEntry(id) {
  const tableRef = db.ref(`vtes_records/${id}`);

  tableRef.get().then(async snapshot => {
    if (!snapshot.exists()) return showToast('❌ Esta mesa ya no existe.', 'error');
    const table = snapshot.val();
    const itemLabel = table.modality === 'presencial' ? `el evento "${table.name}"` : `la mesa "${table.name}"`;

    const ok = await authorizeTableAction(table, {
      confirmTitle: '🗑️ Cerrar',
      confirmMessage: table.recurrence === 'weekly'
        ? `¿Seguro que quieres cerrar ${itemLabel}? Se eliminará para todos y dejará de repetirse cada semana. No se puede deshacer. (Si solo quieres saltar una semana, usa "⏭️ Saltar esta semana".)`
        : `¿Seguro que quieres cerrar ${itemLabel}? Se eliminará para todos y no se puede deshacer.`,
      confirmLabel: 'Cerrar definitivamente',
      danger: true
    });
    if (!ok) return;

    tableRef.remove().then(() => {
      showToast(table.modality === 'presencial' ? '✅ Evento cerrado' : '✅ Mesa cerrada');
    }).catch(() => showToast('❌ No se pudo cerrar. Revisa tu conexión.', 'error'));
  });
}
