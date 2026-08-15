// digest.js
// Dos features en un archivo:
// 1. Digest semanal: Gemini lee tus links de los últimos 7 días y te da un resumen ejecutivo.
// 2. Vacíos de conocimiento: analiza en qué categorías guardas mucho vs poco.

import { db, auth } from "./firebase-config.js";
import { preguntarConGemini } from "./gemini-config.js";
import {
  collection,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const linksRef = collection(db, "links");
const btnDigest = document.getElementById("btn-digest");
const btnVacios = document.getElementById("btn-vacios");
const resultadoDigest = document.getElementById("resultado-digest");

let misLinks = [];
let dejarDeEscuchar = null;

onAuthStateChanged(auth, (usuario) => {
  if (dejarDeEscuchar) {
    dejarDeEscuchar();
    dejarDeEscuchar = null;
  }
  if (!usuario) return;

  const q = query(linksRef, where("uid", "==", usuario.uid));
  dejarDeEscuchar = onSnapshot(q, (snapshot) => {
    misLinks = [];
    snapshot.forEach((docSnap) => {
      misLinks.push({ id: docSnap.id, ...docSnap.data() });
    });
  });
});

// ---------------------------
// DIGEST SEMANAL
// ---------------------------
btnDigest.addEventListener("click", async () => {
  // "fecha" es un Timestamp de Firestore, tiene un método .toDate() para
  // convertirlo a un objeto Date normal de JavaScript y poder compararlo.
  const haceUnaSemana = new Date();
  haceUnaSemana.setDate(haceUnaSemana.getDate() - 7);

  const linksDeEstaSemana = misLinks.filter((l) => {
    if (!l.fecha) return false; // por si algún documento no tiene fecha (no debería pasar)
    return l.fecha.toDate() >= haceUnaSemana;
  });

  if (linksDeEstaSemana.length === 0) {
    resultadoDigest.innerHTML = `<p class="chat-vacio">No guardaste ningún link en los últimos 7 días.</p>`;
    return;
  }

  btnDigest.disabled = true;
  btnDigest.textContent = "Generando...";
  resultadoDigest.innerHTML = "";

  try {
    const listaTexto = linksDeEstaSemana
      .map((l) => `- [${l.categoria || "general"}] ${l.titulo || l.url}: ${l.resumen || "(sin resumen)"}`)
      .join("\n");

    const prompt = `
Eres el asistente de un "segundo cerebro" personal. El usuario guardó estos links
en los últimos 7 días. Escribe un digest ejecutivo breve (máximo 5-6 líneas) que:
- Mencione cuántos links guardó y de qué temas principales tratan
- Señale si hay una conexión o patrón interesante entre varios de ellos
- Tenga un tono cercano y útil, como un asistente personal, no un reporte corporativo

Links de esta semana:
${listaTexto}
    `;

    const digest = await preguntarConGemini(prompt);

    resultadoDigest.innerHTML = `
      <div class="respuesta-ia">
        <p class="digest-titulo">🗓️ Tu semana en ${linksDeEstaSemana.length} link${linksDeEstaSemana.length === 1 ? "" : "s"}</p>
        ${digest.replace(/\n/g, "<br>")}
      </div>
    `;
  } catch (error) {
    console.error("Error generando el digest:", error);
    if (error.message === "LIMITE_ALCANZADO") {
      resultadoDigest.innerHTML = `<p class="chat-vacio">Alcanzaste el límite de solicitudes gratuitas de Gemini. Espera unos minutos.</p>`;
    } else {
      resultadoDigest.innerHTML = `<p class="chat-vacio">Algo salió mal. Revisa la consola (F12).</p>`;
    }
  } finally {
    btnDigest.disabled = false;
    btnDigest.textContent = "🗓️ Digest de esta semana";
  }
});

// ---------------------------
// VACÍOS DE CONOCIMIENTO
// ---------------------------
// Esta parte NO necesita IA para la parte de conteo (eso es matemática simple),
// pero sí le pedimos a Gemini que interprete el patrón y te dé una sugerencia.
btnVacios.addEventListener("click", async () => {
  if (misLinks.length === 0) {
    resultadoDigest.innerHTML = `<p class="chat-vacio">Todavía no tienes links guardados para analizar.</p>`;
    return;
  }

  btnVacios.disabled = true;
  btnVacios.textContent = "Analizando...";
  resultadoDigest.innerHTML = "";

  try {
    // Paso 1 (matemática simple, sin IA): contar cuántos links hay por categoría
    const conteo = {};
    misLinks.forEach((l) => {
      const cat = l.categoria || "general";
      conteo[cat] = (conteo[cat] || 0) + 1;
    });

    // Armamos una lista ordenada de más a menos guardado
    const distribucion = Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, n]) => `${cat}: ${n} link${n === 1 ? "" : "s"}`)
      .join(", ");

    // Mostramos primero la distribución "en crudo" (esto no necesita esperar a Gemini)
    const barrasHtml = Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, n]) => {
        const porcentaje = Math.round((n / misLinks.length) * 100);
        return `
          <div class="barra-categoria">
            <span class="barra-label">${cat}</span>
            <div class="barra-fondo"><div class="barra-relleno" style="width:${porcentaje}%"></div></div>
            <span class="barra-numero">${n}</span>
          </div>
        `;
      })
      .join("");

    // Paso 2: le pedimos a Gemini que interprete el patrón y sugiera algo
    const prompt = `
Un usuario tiene un "segundo cerebro" de links guardados, distribuidos así por categoría: ${distribucion}.
En 2-3 líneas, dile de forma honesta y motivadora en qué área está muy concentrado
y qué categoría(s) casi no explora, con una sugerencia breve. Tono cercano, no genérico.
    `;

    const interpretacion = await preguntarConGemini(prompt);

    resultadoDigest.innerHTML = `
      <div class="respuesta-ia">
        <p class="digest-titulo">🔍 Distribución de tus intereses</p>
        <div class="barras-container">${barrasHtml}</div>
        <p style="margin-top:12px;">${interpretacion.replace(/\n/g, "<br>")}</p>
      </div>
    `;
  } catch (error) {
    console.error("Error analizando vacíos:", error);
    if (error.message === "LIMITE_ALCANZADO") {
      resultadoDigest.innerHTML = `<p class="chat-vacio">Alcanzaste el límite de solicitudes gratuitas de Gemini. Espera unos minutos.</p>`;
    } else {
      resultadoDigest.innerHTML = `<p class="chat-vacio">Algo salió mal. Revisa la consola (F12).</p>`;
    }
  } finally {
    btnVacios.disabled = false;
    btnVacios.textContent = "🔍 Vacíos de conocimiento";
  }
});