// toast.js
// Sistema de notificaciones "toast": pequeños avisos que aparecen y desaparecen
// solos, en vez de los alert()/confirm() feos y bloqueantes del navegador.
//
// Lo exportamos para que CUALQUIER otro archivo (app.js, chat.js, auth.js, etc.)
// pueda mostrar un toast simplemente importando estas 2 funciones.

// Creamos el contenedor de toasts una sola vez, y lo reusamos siempre.
// Vive flotando en una esquina de la pantalla, encima de todo lo demás.
let contenedorToasts = document.getElementById("toast-container");
if (!contenedorToasts) {
  contenedorToasts = document.createElement("div");
  contenedorToasts.id = "toast-container";
  document.body.appendChild(contenedorToasts);
}

/**
 * Muestra un toast (aviso flotante) que desaparece solo después de unos segundos.
 * @param {string} mensaje - el texto a mostrar
 * @param {"info"|"exito"|"error"|"advertencia"} tipo - afecta el color/ícono
 * @param {number} duracionMs - cuánto tiempo se queda visible antes de desaparecer
 */
export function mostrarToast(mensaje, tipo = "info", duracionMs = 4000) {
  const iconos = {
    info: "ℹ️",
    exito: "✅",
    error: "❌",
    advertencia: "⚠️"
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = `
    <span class="toast-icono">${iconos[tipo] || iconos.info}</span>
    <span class="toast-mensaje">${mensaje}</span>
  `;

  contenedorToasts.appendChild(toast);

  // Forzamos un pequeño delay antes de agregar la clase "visible",
  // para que la animación de entrada (definida en CSS) sí se note.
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  // Después de "duracionMs", lo hacemos desaparecer con una animación de salida,
  // y una vez terminada esa animación, lo quitamos del todo del HTML.
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, duracionMs);
}

/**
 * Muestra un modal de confirmación personalizado (reemplaza a confirm() nativo).
 * A diferencia de un toast, este SÍ espera a que el usuario decida,
 * por eso devolvemos una Promise que se resuelve con true/false.
 * @param {string} mensaje
 * @returns {Promise<boolean>}
 */
export function mostrarConfirmacion(mensaje) {
  return new Promise((resolve) => {
    const fondo = document.createElement("div");
    fondo.className = "confirm-fondo";
    fondo.innerHTML = `
      <div class="confirm-caja">
        <p>${mensaje}</p>
        <div class="confirm-botones">
          <button class="confirm-cancelar">Cancelar</button>
          <button class="confirm-aceptar">Guardar de todas formas</button>
        </div>
      </div>
    `;
    document.body.appendChild(fondo);
    requestAnimationFrame(() => fondo.classList.add("confirm-visible"));

    function cerrar(respuesta) {
      fondo.classList.remove("confirm-visible");
      fondo.addEventListener("transitionend", () => fondo.remove(), { once: true });
      resolve(respuesta);
    }

    fondo.querySelector(".confirm-cancelar").addEventListener("click", () => cerrar(false));
    fondo.querySelector(".confirm-aceptar").addEventListener("click", () => cerrar(true));
    // También permitimos cerrar dándole click al fondo oscuro (como "cancelar")
    fondo.addEventListener("click", (e) => {
      if (e.target === fondo) cerrar(false);
    });
  });
}