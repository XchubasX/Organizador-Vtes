// =====================================================================
// avisos-servidor.js — AVISOS DE MESA EN EL CELULAR (lado del servidor)
// Lo usa worker.js cada 3 minutos (cron de Cloudflare). NO se publica
// como archivo del sitio.
//
// Reglas (tablero 24 del lienzo de diseño, aprobado 6 oct 2026):
// · Reciben avisos el creador de la mesa y los anotados con su propia
//   cuenta, solo en los celulares/computadoras donde los activaron.
// · «¡Mesa completa!»: mesas virtuales, una sola vez, cuando hay 5.
// · «¡Entraste a la mesa!»: a un suplente cuando sube a jugador.
// · Aviso previo (15 o 30 min, lo elige cada quien por aparato): solo si
//   en ese momento hay al menos 4 jugadores. Si hay menos, a nadie.
// · Los suplentes no reciben nada mientras sean suplentes.
// · SOLO mesas virtuales: los eventos presenciales no tienen avisos (decisión del 6 oct 2026).
// Lo ya enviado se guarda en avisosEnviados/{mesa} para no repetir.
// =====================================================================

export const MAX_JUGADORES = 5;
export const MIN_PARA_AVISO = 4;
export const MINUTOS_OPCIONES = [15, 30];

function aLista(v) {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(x => x != null)
    : Object.keys(v).sort((a, b) => Number(a) - Number(b)).map(k => v[k]).filter(x => x != null);
}

// Mismo orden que getEntries/getRoster de js/sesion.js
export function plantilla(t) {
  const entradas = [];
  aLista(t.players).forEach(p => entradas.push({ uid: null, nick: typeof p === 'string' ? p : ((p && p.nick) || '') }));
  if (t.modality !== 'presencial') aLista(t.substitutes).forEach(s => entradas.push({ uid: null, nick: String(s || '') }));
  const su = t.signups || {};
  Object.keys(su)
    .sort((a, b) => ((su[a] && su[a].at) || 0) - ((su[b] && su[b].at) || 0) || (a < b ? -1 : 1))
    .forEach(k => {
      const e = su[k] || {};
      // Solo cuenta como "con cuenta propia" si la llave es su uid (los que anota el organizador no)
      entradas.push({ uid: e.uid && k === e.uid ? e.uid : null, nick: e.nick || '' });
    });
  if (t.modality === 'presencial') return { jugadores: entradas, suplentes: [] };
  return { jugadores: entradas.slice(0, MAX_JUGADORES), suplentes: entradas.slice(MAX_JUGADORES) };
}

function unicos(lista) { return [...new Set(lista.filter(Boolean))]; }

// Decide qué avisos tocan ahora. Devuelve { eventos, estado } donde
// estado es el nuevo avisosEnviados completo (null = borrar esa mesa).
export function planear(mesas, enviados, ahora) {
  mesas = mesas || {}; enviados = enviados || {};
  const eventos = [], estado = {};
  for (const id of Object.keys(enviados)) if (!mesas[id] && !id.startsWith('_')) estado[id] = null;

  for (const [id, t] of Object.entries(mesas)) {
    if (!t || !t.utcTime || t.modality === 'presencial') continue; // presenciales: sin avisos
    const inicio = Date.parse(t.utcTime);
    if (!Number.isFinite(inicio)) continue;
    const previo = enviados[id] || {};
    const { jugadores, suplentes } = plantilla(t);
    const uidsJugadores = unicos(jugadores.map(j => j.uid));
    const destinatarios = unicos([t.ownerUid, ...uidsJugadores]);
    const virtual = t.modality !== 'presencial';
    const yaEmpezo = ahora >= inicio;

    const nuevo = {
      completa: previo.completa || null,
      suplentes: unicos(suplentes.map(s => s.uid)),
      nicks: jugadores.map(j => j.nick),
      previo: previo.previo && previo.previo.utc === t.utcTime ? { ...previo.previo } : { utc: t.utcTime }
    };

    if (!yaEmpezo) {
      // ¡Mesa completa! (una sola vez por mesa)
      if (virtual && jugadores.length >= MAX_JUGADORES && !previo.completa) {
        nuevo.completa = true;
        eventos.push({ tipo: 'completa', mesaId: id, mesa: t, uids: destinatarios });
      }
      // ¡Entraste a la mesa! (suplente que en la vuelta anterior era suplente y ahora juega)
      const antesSuplentes = previo.suplentes || [];
      const subieron = uidsJugadores.filter(u => antesSuplentes.includes(u));
      if (virtual && subieron.length && previo.nicks) {
        const salieron = previo.nicks.filter(n => !jugadores.some(j => j.nick === n));
        eventos.push({ tipo: 'entraste', mesaId: id, mesa: t, uids: subieron, reemplazo: salieron.length === 1 ? salieron[0] : null });
      }
      // Aviso previo, por cada opción de minutos
      if (jugadores.length >= MIN_PARA_AVISO) {
        for (const m of MINUTOS_OPCIONES) {
          if (inicio - ahora > m * 60000) continue;
          const ya = nuevo.previo['m' + m] || {};
          const faltan = destinatarios.filter(u => !ya[u]);
          if (!faltan.length) continue;
          nuevo.previo['m' + m] = { ...ya, ...Object.fromEntries(faltan.map(u => [u, true])) };
          eventos.push({ tipo: 'previo', mesaId: id, mesa: t, uids: faltan, minutos: m, jugadores: jugadores.length });
        }
      }
    }
    if (!nuevo.completa) delete nuevo.completa;
    if (!nuevo.suplentes.length) delete nuevo.suplentes;
    estado[id] = nuevo;
  }
  return { eventos, estado };
}

// ---------------------------------------------------------------------
// Textos (por aparato: cada uno guarda su zona horaria)
// ---------------------------------------------------------------------
const PAIS_ZONA = [['America/Mexico_City', 'Méx'], ['Europe/Madrid', 'Esp'], ['America/Santiago', 'Chile']];

export function cuando(utcISO, zona, ahora) {
  const tz = zona || 'America/Mexico_City';
  const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const hora = new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(utcISO));
  const dia = ymd(new Date(utcISO));
  let que;
  if (dia === ymd(new Date(ahora))) que = 'hoy';
  else if (dia === ymd(new Date(ahora + 86400000))) que = 'mañana';
  else que = new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(utcISO)).replace(/\./g, '');
  const etiqueta = (PAIS_ZONA.find(([z]) => z === tz) || [])[1];
  return que + ' ' + hora + (etiqueta ? ' (' + etiqueta + ')' : '');
}

export function mensaje(ev, aparato, ahora) {
  const t = ev.mesa;
  const zona = aparato.zona;
  const nombre = (t.name || 'Tu mesa').slice(0, 60);
  const fecha = cuando(t.utcTime, zona, ahora);
  if (ev.tipo === 'completa') return { titulo: '¡Mesa completa! 🦇', texto: nombre + ' · ' + fecha + '. Ya están los 5.' };
  if (ev.tipo === 'entraste') return { titulo: '¡Entraste a la mesa! 🦇', texto: nombre + ' · ' + fecha + '.' + (ev.reemplazo ? ' Ocupas el lugar de ' + ev.reemplazo + ' (eras suplente).' : ' Eras suplente y ya juegas.') };
  const faltan = Math.max(1, Math.round((Date.parse(t.utcTime) - ahora) / 60000));
  const min = faltan >= ev.minutos - 5 ? ev.minutos : faltan;
  const donde = t.platform || '';
  const cupo = ev.jugadores + ' de ' + MAX_JUGADORES + ' jugadores';
  return { titulo: 'En ' + min + ' minutos empieza tu mesa', texto: [nombre, fecha.replace(/^hoy /, ''), donde, cupo].filter(Boolean).join(' · ') + '. Toca para ver la mesa.' };
}

// A qué aparatos va cada evento: los del uid; en el previo, solo los que eligieron esos minutos
export function aparatosDe(ev, uid, avisos) {
  const lista = Object.entries((avisos || {})[uid] || {}).filter(([, a]) => a && a.token);
  return lista.filter(([, a]) => ev.tipo !== 'previo' || Number(a.minutos) === ev.minutos);
}

// ---------------------------------------------------------------------
// Google: cuenta de servicio → token de acceso (RS256 con WebCrypto)
// ---------------------------------------------------------------------
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64urlTexto = s => b64url(new TextEncoder().encode(s));

export async function tokenGoogle(cuenta) {
  const der = Uint8Array.from(atob(cuenta.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), c => c.charCodeAt(0));
  const llave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const iat = Math.floor(Date.now() / 1000);
  const cuerpo = b64urlTexto(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64urlTexto(JSON.stringify({
    iss: cuenta.client_email, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.messaging'
  }));
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', llave, new TextEncoder().encode(cuerpo));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + cuerpo + '.' + b64url(firma)
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google no dio token: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

// ---------------------------------------------------------------------
// Conexión con Firebase (base de datos y FCM)
// ---------------------------------------------------------------------
export function conexion(env, token) {
  const cuenta = JSON.parse(env.FIREBASE_CUENTA_SERVICIO);
  const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
  const db = async (metodo, ruta, datos) => {
    const r = await fetch(base + '/' + ruta + '.json?access_token=' + encodeURIComponent(token), {
      method: metodo, headers: { 'Content-Type': 'application/json' }, body: datos === undefined ? undefined : JSON.stringify(datos)
    });
    if (!r.ok) throw new Error('Base de datos ' + metodo + ' ' + ruta + ': ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r.json();
  };
  // Devuelve 'ok', 'borrar' (token que ya no sirve) o 'error'
  const enviar = async (tokenAparato, msj, enlace) => {
    const r = await fetch('https://fcm.googleapis.com/v1/projects/' + cuenta.project_id + '/messages:send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ message: {
        token: tokenAparato,
        notification: { title: msj.titulo, body: msj.texto },
        data: { link: enlace, mesa: (enlace.match(/#mesa-(.+)$/) || [])[1] || '' },
        webpush: { notification: { icon: '/iconos/icono-192.png' }, fcm_options: { link: enlace } }
      } })
    });
    if (r.ok) return 'ok';
    const txt = await r.text();
    return r.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(txt) ? 'borrar' : 'error';
  };
  return { db, enviar, cuenta };
}

// Manda los eventos a todos sus aparatos. Devuelve los aparatos a borrar.
export async function mandar(eventos, avisos, enviar, sitio, ahora) {
  const borrar = {}; let enviados = 0;
  for (const ev of eventos) {
    for (const uid of ev.uids) {
      for (const [disp, ap] of aparatosDe(ev, uid, avisos)) {
        const res = await enviar(ap.token, mensaje(ev, ap, ahora), sitio.replace(/\/$/, '') + '/#mesa-' + ev.mesaId);
        if (res === 'ok') enviados++;
        if (res === 'borrar') borrar['avisos/' + uid + '/' + disp] = null;
      }
    }
  }
  return { borrar, enviados };
}

// Texto comparable sin importar el orden de las llaves (para no reescribir lo que no cambió)
export function estable(v) {
  if (v == null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(estable).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + estable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

function stripFecha(v) { if (!v) return v; const { actualizado, ...resto } = v; return resto; }

// Totales para la página de Estadísticas (tablero 25): solo números, nunca quién ni sus códigos
export function resumenAvisos(avisos) {
  const r = { personas: 0, aparatos: 0, tipos: { iphone: 0, android: 0, pc: 0, sinDato: 0 }, minutos: { m15: 0, m30: 0 } };
  for (const aparatos of Object.values(avisos || {})) {
    const lista = Object.values(aparatos || {}).filter(a => a && a.token);
    if (!lista.length) continue;
    r.personas++;
    for (const a of lista) {
      r.aparatos++;
      r.tipos[['iphone', 'android', 'pc'].includes(a.tipo) ? a.tipo : 'sinDato']++;
      if (Number(a.minutos) === 15) r.minutos.m15++; else r.minutos.m30++;
    }
  }
  return r;
}

// Una vuelta del cron
export async function vuelta(env, ahora = Date.now()) {
  const token = await tokenGoogle(JSON.parse(env.FIREBASE_CUENTA_SERVICIO));
  const { db, enviar } = conexion(env, token);
  const [mesas, avisos, enviados, statsAvisos] = await Promise.all([db('GET', 'vtes_records'), db('GET', 'avisos'), db('GET', 'avisosEnviados'), db('GET', 'stats/avisos')]);
  const { eventos, estado } = planear(mesas, enviados, ahora);
  // Primero se guarda lo enviado (si algo falla después, no se repite en la siguiente vuelta)
  const cambios = {};
  for (const [id, v] of Object.entries(estado)) if (estable(v) !== estable((enviados || {})[id])) cambios['avisosEnviados/' + id] = v;
  const resumen = resumenAvisos(avisos);
  if (estable(resumen) !== estable(stripFecha(statsAvisos))) cambios['stats/avisos'] = { ...resumen, actualizado: ahora };
  if (Object.keys(cambios).length) await db('PATCH', '', cambios);
  const { borrar, enviados: n } = await mandar(eventos, avisos, enviar, env.SITIO, ahora);
  if (Object.keys(borrar).length) await db('PATCH', '', borrar);
  return { eventos: eventos.length, enviados: n, borrados: Object.keys(borrar).length };
}

// «Mandarme un aviso de prueba»: comprueba quién es con su token de Google/Firebase
export async function avisoPrueba(env, idToken, ahora = Date.now()) {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + env.FIREBASE_API_KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Referer: env.SITIO.replace(/\/?$/, '/') }, body: JSON.stringify({ idToken })
  });
  const j = await r.json().catch(() => ({}));
  const uid = j.users && j.users[0] && j.users[0].localId;
  if (!uid) return { estado: 401, texto: 'Sesión no válida' };
  const token = await tokenGoogle(JSON.parse(env.FIREBASE_CUENTA_SERVICIO));
  const { db, enviar } = conexion(env, token);
  const ultima = await db('GET', 'avisosEnviados/_prueba/' + uid);
  if (ultima && ahora - ultima < 60000) return { estado: 429, texto: 'Espera un minuto' };
  await db('PUT', 'avisosEnviados/_prueba/' + uid, ahora);
  const aparatos = Object.entries((await db('GET', 'avisos/' + uid)) || {}).filter(([, a]) => a && a.token);
  let ok = 0; const borrar = {};
  for (const [disp, ap] of aparatos) {
    const res = await enviar(ap.token, { titulo: 'Aviso de prueba 🦇', texto: 'Así te llegarán los avisos de tus mesas.' }, env.SITIO);
    if (res === 'ok') ok++;
    if (res === 'borrar') borrar['avisos/' + uid + '/' + disp] = null;
  }
  if (Object.keys(borrar).length) await db('PATCH', '', borrar);
  return { estado: 200, texto: JSON.stringify({ aparatos: aparatos.length, enviados: ok }) };
}
