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
    authDomain: "vtes-scheduler.firebaseapp.com",
    databaseURL: "https://vtes-scheduler-default-rtdb.firebaseio.com",
    projectId: "vtes-scheduler",
    storageBucket: "vtes-scheduler.firebasestorage.app",
    messagingSenderId: "897608138023",
    appId: "1:897608138023:web:3e12cd021b45f6c9a13d02"
  },

  // Site Key de reCAPTCHA Enterprise (App Check)
  recaptchaKey: '6Lc2QLYtAAAAAHI6pH3gABXBdG4m2X1rPKmegI0P'
};
