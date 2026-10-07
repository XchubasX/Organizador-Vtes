// =====================================================================
// config.js — DATOS QUE CAMBIAN ENTRE EL SITIO REAL Y EL DE PRUEBAS
// Es el ÚNICO archivo distinto entre Organizador-Vtes y Vtes-UAT.
// Al pasar cambios de pruebas al sitio real se copian todos los demás
// archivos tal cual, y este NO se toca.
// =====================================================================
window.VTES_CONFIG = {
  // true solo en el sitio de pruebas: muestra la franja naranja
  esPruebas: false,

  // Proyecto de Firebase
  firebase: {
    apiKey: "AIzaSyCDD_iUXTBpS89n4mtA4xbBeR6IxczRzEg",
    // En nuestras direcciones, "Entrar con Google" pasa por el mismo dominio (worker.js lo reenvía a Firebase).
    // Así funciona también con Elysium abierto como app (iPhone). En otras direcciones se usa la de Firebase.
    authDomain: /(^|\.)eternalschedule\.com$|\.workers\.dev$/.test(location.hostname) ? location.hostname : "vtes-scheduler.firebaseapp.com",
    databaseURL: "https://vtes-scheduler-default-rtdb.firebaseio.com",
    projectId: "vtes-scheduler",
    storageBucket: "vtes-scheduler.firebasestorage.app",
    messagingSenderId: "897608138023",
    appId: "1:897608138023:web:3e12cd021b45f6c9a13d02"
  },

  // Llave pública de avisos (Firebase → Configuración del proyecto → Cloud Messaging →
  // Certificados push web). Vacía = los avisos todavía no están configurados.
  vapidKey: 'BD3uE0I3bTchnglAKf02Bf-760emKNzaGw_exCni2Ll7uubRhqBNJugIegisB8AKUJ6IadkAZLjJPgEBsbX4a6g',

  // Site Key de reCAPTCHA Enterprise (App Check)
  recaptchaKey: '6Lc2QLYtAAAAAHI6pH3gABXBdG4m2X1rPKmegI0P'
};
