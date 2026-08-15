// chat.js
// Este archivo le permite al usuario "preguntarle" a su segundo cerebro.
// La técnica que usamos se llama RAG (Retrieval-Augmented Generation):
// en vez de que la IA responda de memoria, primero BUSCAMOS los links
// más relevantes, y luego le pedimos que responda basándose SOLO en esos.

import { db, auth } from "./firebase-config.js";
import { generarEmbedding, similitudCoseno, preguntarConGemini } from "./gemini-config.js";
import { mostrarToast } from "./toast.js";
import {
  collection,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const linksRef = collection(db, "links");
const inputPregunta = document.getElementById("input-pregunta");
const btnPreguntar = document.getElementById("btn-preguntar");
const respuestaChat = document.getElementById("respuesta-chat");

// Guardamos siempre la última versión de TUS links en memoria,
// para no tener que volver a pedirlos cada vez que preguntas algo.
let todosLosLinks = [];
let dejarDeEscuchar = null;

onAuthStateChanged(auth, (usuario) => {
  if (dejarDeEscuchar) {
    dejarDeEscuchar();
    dejarDeEscuchar = null;
  }

  if (!usuario) return;

  const q = query(linksRef, where("uid", "==", usuario.uid));

  dejarDeEscuchar = onSnapshot(q, (snapshot) => {
    todosLosLinks = [];
    snapshot.forEach((docSnap) => {
      todosLosLinks.push({ id: docSnap.id, ...docSnap.data() });
    });
  });
});

btnPreguntar.addEventListener("click", async () => {
  const pregunta = inputPregunta.value.trim();

  if (!pregunta) {
    mostrarToast("Escribe una pregunta primero.", "advertencia");
    return;
  }

  // Filtramos solo los links que sí tienen embedding calculado
  const linksConEmbedding = todosLosLinks.filter((l) => l.embedding);

  if (linksConEmbedding.length === 0) {
    respuestaChat.innerHTML = `<p class="chat-vacio">Todavía no tienes links guardados con embeddings. Guarda algunos primero.</p>`;
    return;
  }

  btnPreguntar.disabled = true;
  btnPreguntar.textContent = "Pensando...";
  respuestaChat.innerHTML = "";

  try {
    // Paso 1: convertir la pregunta en un embedding
    const embeddingPregunta = await generarEmbedding(pregunta);

    // Paso 2: comparar esa pregunta contra todos los links guardados
    const relevantes = linksConEmbedding
      .map((link) => ({
        ...link,
        score: similitudCoseno(embeddingPregunta, link.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // top 5 más relevantes

    // Paso 3: armar el contexto para Gemini con esos links
    const contexto = relevantes
      .map((l, i) => `[${i + 1}] Título: ${l.titulo || l.url}\nResumen: ${l.resumen || "(sin resumen)"}\nURL: ${l.url}`)
      .join("\n\n");

    const prompt = `
Eres el asistente de un "segundo cerebro" personal de links guardados.
Responde la pregunta del usuario basándote ÚNICAMENTE en los links de contexto de abajo.
Si ninguno de los links responde la pregunta, dilo honestamente en vez de inventar.
Al final de tu respuesta, cita cuáles links [1], [2], etc. usaste.

Links guardados:
${contexto}

Pregunta del usuario: ${pregunta}
    `;

    // Paso 4: pedirle a Gemini que responda usando ese contexto
    const respuesta = await preguntarConGemini(prompt);

    // Mostramos la respuesta + la lista de links que se usaron como fuente
    const fuentesHtml = relevantes
      .map((l, i) => `<li>[${i + 1}] <a href="${l.url}" target="_blank" rel="noopener">${l.titulo || l.url}</a></li>`)
      .join("");

    respuestaChat.innerHTML = `
      <div class="respuesta-ia">${respuesta.replace(/\n/g, "<br>")}</div>
      <div class="fuentes">
        <p>Fuentes consultadas:</p>
        <ul>${fuentesHtml}</ul>
      </div>
    `;
  } catch (error) {
    console.error("Error en el chat:", error);

    if (error.message === "LIMITE_ALCANZADO") {
      respuestaChat.innerHTML = `<p class="chat-vacio">Alcanzaste el límite de solicitudes gratuitas de Gemini por ahora. Espera unos minutos e intenta de nuevo.</p>`;
    } else {
      respuestaChat.innerHTML = `<p class="chat-vacio">Algo salió mal. Revisa la consola (F12).</p>`;
    }
  } finally {
    btnPreguntar.disabled = false;
    btnPreguntar.textContent = "Preguntar";
  }
});