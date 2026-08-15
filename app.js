// app.js
// Aquí vive toda la lógica: agregar links, mostrarlos, y borrarlos.

// Importamos "db" (la conexión que ya configuramos en firebase-config.js)
import { db, auth } from "./firebase-config.js";
import { estadoAuth } from "./auth-state.js";
import { resumirConGemini, generarEmbedding, similitudCoseno, sugerirCategoria } from "./gemini-config.js";
import { mostrarToast, mostrarConfirmacion } from "./toast.js";

// Importamos las funciones de Firestore que vamos a usar (el "CRUD"):
// - collection: para apuntar a una colección (ej. "links")
// - addDoc: para CREAR un documento nuevo
// - onSnapshot: para LEER datos en tiempo real (se actualiza solo si algo cambia)
// - deleteDoc y doc: para BORRAR un documento específico
// - where: para filtrar y traer SOLO los links del usuario actual
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Referencia a la colección "links" dentro de Firestore.
// Si la colección no existe todavía, Firebase la crea automáticamente
// en el momento en que guardemos el primer documento.
const linksRef = collection(db, "links");

// Referencias a elementos del HTML que vamos a manipular
const inputUrl = document.getElementById("input-url");
const inputTitulo = document.getElementById("input-titulo");
const inputCategoria = document.getElementById("input-categoria");
const btnGuardar = document.getElementById("btn-guardar");
const contenedorLinks = document.getElementById("contenedor-links");
const inputBusqueda = document.getElementById("input-busqueda");
const btnBuscar = document.getElementById("btn-buscar");
const btnLimpiarBusqueda = document.getElementById("btn-limpiar-busqueda");
const avisoDuplicado = document.getElementById("aviso-duplicado");

// Guardamos siempre la última versión completa de tus links en memoria,
// para poder filtrarlos localmente cuando buscas, sin pedirle nada a Firestore de nuevo.
let todosLosDocsGlobal = [];

/**
 * Detecta si una URL es de YouTube (youtube.com o youtu.be)
 */
function esYouTube(url) {
  return /youtube\.com\/watch|youtu\.be\//.test(url);
}

/**
 * Usa el endpoint oEmbed de YouTube para conseguir título y canal reales.
 * A diferencia de Jina, esto sí funciona con YouTube porque no depende
 * de leer el HTML renderizado por JS — es un endpoint hecho para esto.
 * @param {string} url
 * @returns {Promise<string>} un texto descriptivo listo para resumir
 */
async function leerInfoDeYouTube(url) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const respuesta = await fetch(oembedUrl);

  if (!respuesta.ok) {
    return "Video de YouTube (no se pudo obtener información adicional).";
  }

  const data = await respuesta.json();
  // Armamos un texto con lo que sí tenemos: título y canal.
  // No tenemos la transcripción del video, así que el resumen de Gemini
  // se va a basar solo en esto (es una limitación real, no un error).
  return `Video de YouTube titulado "${data.title}", publicado por el canal "${data.author_name}".`;
}

/**
 * Usa Jina AI Reader para leer el contenido de cualquier página web,
 * evitando el bloqueo de CORS.
 * @param {string} url
 * @returns {Promise<string>} el texto limpio de esa página
 */
async function leerContenidoDeLink(url) {
  const urlConJina = "https://r.jina.ai/" + url;
  const respuesta = await fetch(urlConJina);
  const textoLimpio = await respuesta.text();
  return textoLimpio;
}

// ---------------------------
// Detección de links duplicados (en vivo, mientras escribes)
// ---------------------------
// Normalizamos la URL quitando "https://", "www." y la barra final,
// para detectar duplicados aunque estén escritos un poco distinto
// (ej. "youtube.com/x" y "https://www.youtube.com/x/" cuentan como el mismo link).
function normalizarUrl(url) {
  return url.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

inputUrl.addEventListener("input", () => {
  const urlNormalizada = normalizarUrl(inputUrl.value);

  if (!urlNormalizada) {
    avisoDuplicado.style.display = "none";
    return;
  }

  const yaExiste = todosLosDocsGlobal.some((l) => normalizarUrl(l.url) === urlNormalizada);

  if (yaExiste) {
    avisoDuplicado.textContent = "⚠️ Ya tienes este link guardado.";
    avisoDuplicado.style.display = "block";
  } else {
    avisoDuplicado.style.display = "none";
  }
});

// ---------------------------
// CREATE: guardar un link nuevo
// ---------------------------
btnGuardar.addEventListener("click", async () => {
  // Protección extra: si por alguna razón no hay sesión activa, no dejamos guardar.
  if (!estadoAuth.uid) {
    mostrarToast("Debes iniciar sesión primero.", "advertencia");
    return;
  }

  const url = inputUrl.value.trim();

  // Validación simple: que no esté vacío
  if (!url) {
    mostrarToast("Pega un link antes de guardar.", "advertencia");
    return;
  }

  // Si no está vacío, revisamos duplicados una última vez antes de gastar
  // solicitudes de Gemini en algo que ya tienes guardado.
  const urlNormalizada = normalizarUrl(url);
  const yaExiste = todosLosDocsGlobal.some((l) => normalizarUrl(l.url) === urlNormalizada);

  if (yaExiste) {
    const continuar = await mostrarConfirmacion("Ya tienes este link guardado. ¿Quieres guardarlo de nuevo de todas formas?");
    if (!continuar) return;
  }

  // Si el usuario no escribió título, usamos la URL como título por default.
  const titulo = inputTitulo.value.trim() || url;
  const categoria = inputCategoria.value;

  // Deshabilitamos el botón mientras trabajamos, para que el usuario
  // sepa que algo está pasando y no le dé click varias veces.
  btnGuardar.disabled = true;
  btnGuardar.textContent = "Leyendo y resumiendo...";

  try {
    // Paso 1: leer el contenido, con el método correcto según el tipo de link
    const contenido = esYouTube(url)
      ? await leerInfoDeYouTube(url)
      : await leerContenidoDeLink(url);

    // Paso 2: pedirle a Gemini que lo resuma en 3 puntos
    const resumen = await resumirConGemini(contenido);

    // Paso 2.5: si el usuario dejó la categoría en "general" (el valor por default),
    // le pedimos a Gemini que sugiera una más específica. Si el usuario ya eligió
    // una categoría a propósito, respetamos su elección y no la tocamos.
    const categoriaFinal = categoria === "general"
      ? await sugerirCategoria(resumen)
      : categoria;

    // Paso 3: generar el embedding a partir del resumen
    // (usamos el resumen, no el contenido crudo, porque es más corto y ya está "limpio")
    const embedding = await generarEmbedding(resumen);

    // Paso 4: guardar todo junto en Firestore
    await addDoc(linksRef, {
      uid: estadoAuth.uid, // así sabemos a quién pertenece este link
      url: url,
      titulo: titulo,
      categoria: categoriaFinal,
      resumen: resumen,
      embedding: embedding,
      fecha: serverTimestamp()
    });

    // Limpiamos los inputs después de guardar
    inputUrl.value = "";
    inputTitulo.value = "";
    inputCategoria.value = "general";
    avisoDuplicado.style.display = "none";
    mostrarToast("Link guardado con éxito.", "exito");
  } catch (error) {
    console.error("Error guardando el link:", error);

    if (error.message === "LIMITE_ALCANZADO") {
      mostrarToast("Alcanzaste el límite de solicitudes gratuitas de Gemini por ahora. Espera unos minutos e intenta de nuevo.", "error");
    } else {
      mostrarToast("Algo salió mal guardando el link. Revisa la consola (F12).", "error");
    }
  } finally {
    // Pase lo que pase (éxito o error), reactivamos el botón
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar link";
  }
});

// ---------------------------
// READ: mostrar los links guardados en tiempo real
// ---------------------------
// onSnapshot "escucha" la colección: cada vez que agregas o borras algo,
// esta función se vuelve a ejecutar automáticamente. No necesitas recargar la página.

// ---------------------------
// READ: mostrar los links guardados en tiempo real (solo los tuyos)
// ---------------------------
// Esperamos a que Firebase confirme quién eres antes de pedir datos.
// Si pidiéramos los datos antes, no sabríamos qué "uid" usar para filtrar.
let dejarDeEscuchar = null; // guardamos la función para "apagar" el listener anterior

onAuthStateChanged(auth, (usuario) => {
  // Si había un listener activo de una sesión anterior, lo apagamos primero
  // (evita que se dupliquen los datos si alguien cierra e inicia sesión con otra cuenta).
  if (dejarDeEscuchar) {
    dejarDeEscuchar();
    dejarDeEscuchar = null;
  }

  if (!usuario) return; // nadie logueado todavía, no hacemos nada más

  // where("uid", "==", usuario.uid) es el filtro clave:
  // le decimos a Firestore "solo tráeme los documentos donde el campo uid
  // coincida con el uid de la persona que tiene la sesión abierta ahora".
  const q = query(
    linksRef,
    where("uid", "==", usuario.uid),
    orderBy("fecha", "desc")
  );

  dejarDeEscuchar = onSnapshot(q, (snapshot) => {
    todosLosDocsGlobal = [];
    snapshot.forEach((docSnap) => {
      todosLosDocsGlobal.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (inputBusqueda.value.trim()) {
      return;
    }

    renderizarLinks(todosLosDocsGlobal);
  });
});

/**
 * Dibuja las tarjetas de links en pantalla.
 * @param {Array} docs - la lista de links a mostrar (puede ser todos, o un subconjunto filtrado por búsqueda)
 * @param {Object} scoresPorId - opcional: un mapa {id: score} para mostrar el % de relevancia de la búsqueda
 */
function renderizarLinks(docs, scoresPorId = null) {
  if (docs.length === 0) {
    const mensaje = scoresPorId
      ? "No se encontraron links relacionados con esa búsqueda."
      : "Todavía no has guardado ningún link.";
    contenedorLinks.innerHTML = `<p class="vacio">${mensaje}</p>`;
    return;
  }

  contenedorLinks.innerHTML = "";

  docs.forEach((data) => {
    const id = data.id;

    const titulo = data.titulo || data.url;
    const categoria = data.categoria || "general";
    const resumen = data.resumen || null;

    // ---------------------------
    // Calcular los links más relacionados (usando embeddings)
    // Se compara siempre contra la lista COMPLETA (no la filtrada),
    // para que las conexiones no cambien solo porque estás buscando algo.
    // ---------------------------
    let relacionadosHtml = "";
    if (data.embedding) {
      const relacionados = todosLosDocsGlobal
        .filter((otro) => otro.id !== id && otro.embedding)
        .map((otro) => ({
          titulo: otro.titulo || otro.url,
          score: similitudCoseno(data.embedding, otro.embedding)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        // Mismo umbral que usamos en el mapa (0.6): calibrado con datos reales,
        // ya que 0.7 dejaba fuera links que sí están genuinamente relacionados.
        .filter((r) => r.score > 0.6);

      if (relacionados.length > 0) {
        const items = relacionados
          .map((r) => `<li>${r.titulo} <span class="score">(${Math.round(r.score * 100)}%)</span></li>`)
          .join("");
        relacionadosHtml = `<div class="relacionados"><p>Relacionado con:</p><ul>${items}</ul></div>`;
      }
    }

    // Si venimos de una búsqueda, mostramos el % de qué tan bien coincide con lo buscado
    const matchHtml = scoresPorId && scoresPorId[id] !== undefined
      ? `<span class="badge badge-match">coincidencia: ${Math.round(scoresPorId[id] * 100)}%</span>`
      : "";

    // ---------------------------
    // Tiempo de lectura estimado
    // ---------------------------
    // Cálculo simple: contamos las palabras del resumen y asumimos una
    // velocidad promedio de lectura de 200 palabras por minuto.
    // No es exacto (el resumen es más corto que el artículo original),
    // pero da una idea aproximada y rápida sin gastar otra llamada a la IA.
    let tiempoLecturaHtml = "";
    if (resumen) {
      const palabras = resumen.trim().split(/\s+/).length;
      const minutos = Math.max(1, Math.round(palabras / 200));
      tiempoLecturaHtml = `<span class="badge badge-tiempo">⏱️ ~${minutos} min</span>`;
    }

    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta-link";
    tarjeta.innerHTML = `
      <div class="tarjeta-info">
        <p class="tarjeta-titulo">${titulo}</p>
        <a href="${data.url}" target="_blank" rel="noopener" class="tarjeta-url">${data.url}</a>
        <span class="badge badge-${categoria}">${categoria}</span>
        ${tiempoLecturaHtml}
        ${matchHtml}
        ${resumen ? `
          <div class="resumen-con-voz">
            <p class="tarjeta-resumen">${resumen.replace(/\n/g, "<br>")}</p>
            <button class="btn-voz" data-resumen="${encodeURIComponent(resumen)}" title="Escuchar resumen">🔊</button>
          </div>
        ` : ""}
        ${relacionadosHtml}
      </div>
      <button class="btn-borrar" data-id="${id}">🗑️</button>
    `;
    contenedorLinks.appendChild(tarjeta);
  });

  // ---------------------------
  // Texto a voz: leer el resumen en voz alta
  // ---------------------------
  // Usamos la Web Speech API, que ya viene incluida en el navegador
  // (no necesita ninguna librería ni API key extra).
  document.querySelectorAll(".btn-voz").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Si ya está leyendo algo, lo detenemos primero (evita que se
      // encimen varias voces si le das click a varios botones seguidos).
      window.speechSynthesis.cancel();

      const texto = decodeURIComponent(btn.getAttribute("data-resumen"));
      const utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = "es-ES"; // le indicamos que el texto está en español

      window.speechSynthesis.speak(utterance);
    });
  });

  // ---------------------------
  // DELETE: borrar un link
  // ---------------------------
  document.querySelectorAll(".btn-borrar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      try {
        await deleteDoc(doc(db, "links", id));
      } catch (error) {
        console.error("Error borrando el link:", error);
      }
    });
  });
}

// ---------------------------
// BÚSQUEDA SEMÁNTICA
// ---------------------------
// A diferencia de una búsqueda normal (que solo encuentra palabras exactas),
// esta busca por SIGNIFICADO: comparamos el embedding de tu búsqueda contra
// el embedding de cada link guardado, usando la misma similitud coseno
// que ya usamos para las conexiones y el chat.
btnBuscar.addEventListener("click", async () => {
  const busqueda = inputBusqueda.value.trim();

  if (!busqueda) {
    mostrarToast("Escribe algo para buscar.", "advertencia");
    return;
  }

  const linksConEmbedding = todosLosDocsGlobal.filter((l) => l.embedding);
  if (linksConEmbedding.length === 0) {
    contenedorLinks.innerHTML = '<p class="vacio">Todavía no hay links con embeddings para buscar.</p>';
    return;
  }

  btnBuscar.disabled = true;
  btnBuscar.textContent = "Buscando...";

  try {
    const embeddingBusqueda = await generarEmbedding(busqueda);

    const conScore = linksConEmbedding.map((l) => ({
      ...l,
      score: similitudCoseno(embeddingBusqueda, l.embedding)
    }));

    // Nos quedamos solo con los que superan un umbral razonable de relevancia,
    // ordenados del más relevante al menos relevante.
    const resultados = conScore
      .filter((l) => l.score > 0.55)
      .sort((a, b) => b.score - a.score);

    const scoresPorId = {};
    resultados.forEach((r) => { scoresPorId[r.id] = r.score; });

    renderizarLinks(resultados, scoresPorId);
  } catch (error) {
    console.error("Error en la búsqueda:", error);
    if (error.message === "LIMITE_ALCANZADO") {
      mostrarToast("Alcanzaste el límite de solicitudes gratuitas de Gemini por ahora. Espera unos minutos e intenta de nuevo.", "error");
    } else {
      mostrarToast("Algo salió mal buscando. Revisa la consola (F12).", "error");
    }
  } finally {
    btnBuscar.disabled = false;
    btnBuscar.textContent = "Buscar";
  }
});

// Botón para limpiar la búsqueda y volver a ver todos los links
btnLimpiarBusqueda.addEventListener("click", () => {
  inputBusqueda.value = "";
  renderizarLinks(todosLosDocsGlobal);
});