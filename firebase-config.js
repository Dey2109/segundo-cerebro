// firebase-config.js
// Este archivo se encarga UNICAMENTE de conectar con Firebase.
// Lo separamos del resto del código para mantener todo ordenado:
// si algún día cambias de proyecto de Firebase, solo tocas este archivo.

// Importamos las funciones que necesitamos del SDK de Firebase (versión 10, modular).
// "Modular" significa que solo traemos las piezas que usamos, no el paquete completo.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Tus credenciales (las que copiaste de la consola de Firebase).
// Estas NO son secretas, son públicas y seguras de compartir en el frontend.
const firebaseConfig = {
  apiKey: "AIzaSyDLsLiTAb4d4wrK_EDFQQnJUpcIZIyExyU",
  authDomain: "segundo-cerebro-d4653.firebaseapp.com",
  projectId: "segundo-cerebro-d4653",
  storageBucket: "segundo-cerebro-d4653.firebasestorage.app",
  messagingSenderId: "241244024967",
  appId: "1:241244024967:web:0f1466394e8c082d730822"
};

// Inicializamos la conexión con Firebase usando esas credenciales.
const app = initializeApp(firebaseConfig);

// Creamos la conexión específica a Firestore (la base de datos).
// Exportamos "db" para poder usarlo en app.js
export const db = getFirestore(app);
export const auth = getAuth(app);