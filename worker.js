// =====================================================================
// worker.js — lo corre Cloudflare antes de servir el sitio.
// 1) /__/auth/*  → se reenvía a Firebase («Entrar con Google» por nuestro dominio).
// 2) /api/aviso-prueba → «Mandarme un aviso de prueba».
// 3) Cada 5 minutos (cron) → avisos de mesa en el celular (avisos-servidor.js).
// Todo lo demás es el sitio tal cual (carpeta "publicado").
// =====================================================================
import { vuelta, avisoPrueba } from './avisos-servidor.js';

export function destinoAuth(urlTexto, hostFirebase) {
  const url = new URL(urlTexto);
  if (!url.pathname.startsWith('/__/auth/')) return null;
  return 'https://' + hostFirebase + url.pathname + url.search;
}

export default {
  async fetch(request, env) {
    const destino = destinoAuth(request.url, env.FIREBASE_AUTH_HOST);
    if (destino) return fetch(new Request(destino, request), { redirect: 'manual' });
    const url = new URL(request.url);
    if (url.pathname === '/api/aviso-prueba') {
      if (request.method !== 'POST') return new Response('Solo POST', { status: 405 });
      if (!env.FIREBASE_CUENTA_SERVICIO) return new Response('Falta la cuenta de servicio', { status: 503 });
      const idToken = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
      try {
        const r = await avisoPrueba(env, idToken);
        return new Response(r.texto, { status: r.estado });
      } catch (e) {
        return new Response('Error: ' + e.message, { status: 500 });
      }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(evento, env, ctx) {
    if (!env.FIREBASE_CUENTA_SERVICIO) { console.log('Avisos: falta el secreto FIREBASE_CUENTA_SERVICIO'); return; }
    ctx.waitUntil(vuelta(env).then(r => console.log('Avisos:', JSON.stringify(r))).catch(e => console.log('Avisos ERROR:', e.message)));
  }
};
