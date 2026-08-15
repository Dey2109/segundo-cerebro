// auth-state.js
// Este archivo guarda una única fuente de verdad sobre "quién eres" (tu uid),
// para que app.js, chat.js y grafo.js sepan filtrar SOLO tus links,
// sin tener que repetir la lógica de login en cada archivo.

// Un objeto simple que se actualiza cuando inicias/cierras sesión.
// Lo exportamos así (no como valores sueltos) para que los demás archivos
// siempre vean la versión más reciente, no una copia vieja.
export const estadoAuth = {
  uid: null
};