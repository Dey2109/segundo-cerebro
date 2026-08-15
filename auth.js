// auth.js
// Maneja el inicio/cierre de sesión con Google, y muestra u oculta
// el resto de la app dependiendo de si hay alguien logueado o no.

import { auth } from "./firebase-config.js";
import { estadoAuth } from "./auth-state.js";
import { mostrarToast } from "./toast.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const proveedorGoogle = new GoogleAuthProvider();

const btnLogin = document.getElementById("btn-login");
const btnLogout = document.getElementById("btn-logout");
const infoUsuario = document.getElementById("info-usuario");
const pantallaLogin = document.getElementById("pantalla-login");
const appPrincipal = document.getElementById("app-principal");

btnLogin.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, proveedorGoogle);
    // No necesitamos hacer nada más aquí: onAuthStateChanged (abajo)
    // detecta el cambio automáticamente y actualiza la pantalla.
  } catch (error) {
    console.error("Error iniciando sesión:", error);
    mostrarToast("No se pudo iniciar sesión. Intenta de nuevo.", "error");
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});

// onAuthStateChanged es un "escuchador" que Firebase ejecuta automáticamente
// cada vez que el estado de sesión cambia (inicias sesión, cierras sesión,
// o incluso al recargar la página si ya habías iniciado sesión antes).
onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    // Hay alguien logueado: guardamos su uid y mostramos la app
    estadoAuth.uid = usuario.uid;

    pantallaLogin.style.display = "none";
    appPrincipal.style.display = "block";

    infoUsuario.innerHTML = `
      <img src="${usuario.photoURL}" alt="${usuario.displayName}">
      <span>${usuario.displayName}</span>
    `;
  } else {
    // Nadie logueado: limpiamos el estado y mostramos la pantalla de login
    estadoAuth.uid = null;

    pantallaLogin.style.display = "flex";
    appPrincipal.style.display = "none";
  }
});