// =====================================================================
// firebase-messaging-sw.js — recibe los avisos de mesa con Elysium cerrado
// y los muestra como notificación. Al tocarla se abre la mesa (#mesa-…).
// Toma los datos de Firebase de config.js (el mismo del sitio).
// =====================================================================

// Una versión nueva de este archivo entra en funciones de inmediato
// (sin esperar a que se cierren todas las pestañas de Elysium).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

// Al tocar el aviso: si Elysium ya está abierto (pestaña o app del iPhone)
// se trae al frente y se le pide abrir la mesa; si no, se abre en la mesa.
// Va ANTES de Firebase para que este sea el que atiende el toque.
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  const fcm = (event.notification.data && event.notification.data.FCM_MSG) || {};
  const link = (fcm.data && fcm.data.link) || (fcm.fcmOptions && fcm.fcmOptions.link) || self.registration.scope;
  const mesa = (fcm.data && fcm.data.mesa) || '';
  event.waitUntil((async () => {
    const abiertas = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const propia = abiertas.find(c => new URL(c.url).origin === self.location.origin);
    if (propia) {
      await propia.focus();
      propia.postMessage({ tipo: 'abrirMesa', mesa });
      return;
    }
    await clients.openWindow(link);
  })());
});

self.window = self; // config.js escribe en window.VTES_CONFIG
importScripts('config.js?v=20261006a');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
              'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');
firebase.initializeApp(self.VTES_CONFIG.firebase);
firebase.messaging(); // muestra sola la notificación cuando Elysium está cerrado o en segundo plano
