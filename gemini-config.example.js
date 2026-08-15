// gemini-config.js
// Este archivo se encarga de hablar con la IA de Google (Gemini).
// Le mandamos texto y nos regresa un resumen + categoría sugerida.

// Tu clave de API de Gemini (conseguida en aistudio.google.com/apikey)
const GEMINI_API_KEY = "PEGA_AQUI_TU_PROPIA_CLAVE_DE_GEMINI";

// La URL del modelo que vamos a usar (Gemini 3.5 Flash-Lite: rápido y barato, ideal para resúmenes)
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

/**
 * Revisa si la respuesta de fetch fue exitosa. Si no, lanza un error.
 * Si el error es específicamente 429 (límite de solicitudes alcanzado),
 * lanza un error con un mensaje especial que las pantallas pueden reconocer
 * para mostrar un aviso amigable en vez del error técnico crudo.
 */
async function verificarRespuesta(respuesta, contexto) {
  if (!respuesta.ok) {
    const textoError = await respuesta.text();
    console.error(`Detalle del error (${contexto}):`, textoError);

    if (respuesta.status === 429) {
      throw new Error("LIMITE_ALCANZADO");
    }
    throw new Error(`Error al llamar a Gemini (${contexto}): ${respuesta.status}`);
  }
}

/**
 * Le pide a Gemini que resuma un texto largo en 3 puntos clave.
 * @param {string} textoLargo - el contenido de la página (ya extraído con Jina)
 * @returns {Promise<string>} - el resumen generado por la IA
 */
export async function resumirConGemini(textoLargo) {
  // Le damos instrucciones claras a la IA sobre qué queremos que haga.
  // A esto se le llama "prompt".
  const prompt = `
Resume el siguiente contenido en español, de forma breve y clara.
Si el contenido es extenso, usa 3 puntos clave. Si el contenido es corto
(por ejemplo, solo un título y autor), simplemente describe en 1-2 líneas
de qué podría tratarse, sin inventar detalles que no están presentes.
No agregues introducción ni conclusión.

Contenido:
${textoLargo.slice(0, 8000)}
  `;
  // Nota: slice(0, 8000) corta el texto si es demasiado largo,
  // para no gastar de más ni exceder límites de la API.

  const respuesta = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  await verificarRespuesta(respuesta, "resumen");

  const data = await respuesta.json();
  // Si en algún punto Gemini no devuelve texto (ej. contenido bloqueado),
  // devolvemos un mensaje por default para no romper la app.
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return texto || "No se pudo generar un resumen para este link.";
}

/**
 * Genera un embedding (vector de números) que representa el significado
 * de un texto. Dos textos con significados parecidos generan vectores parecidos.
 * @param {string} texto
 * @returns {Promise<number[]>} el vector de embedding
 */
export async function generarEmbedding(texto) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

  const respuesta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      content: { parts: [{ text: texto.slice(0, 2000) }] }
    })
  });

  await verificarRespuesta(respuesta, "embedding");

  const data = await respuesta.json();
  return data.embedding.values; // un array de ~3072 números
}

/**
 * Calcula qué tan "parecidos" son dos vectores (similitud coseno).
 * Devuelve un número entre -1 y 1: mientras más cerca de 1, más parecidos.
 * @param {number[]} a
 * @param {number[]} b
 */
export function similitudCoseno(a, b) {
  let productoPunto = 0;
  let magnitudA = 0;
  let magnitudB = 0;

  for (let i = 0; i < a.length; i++) {
    productoPunto += a[i] * b[i];
    magnitudA += a[i] * a[i];
    magnitudB += b[i] * b[i];
  }

  return productoPunto / (Math.sqrt(magnitudA) * Math.sqrt(magnitudB));
}

/**
 * Le hace una pregunta libre a Gemini (usada para el chat con tus links).
 * A diferencia de resumirConGemini, aquí el prompt completo ya viene armado
 * desde afuera (incluye la pregunta + el contexto de los links relevantes).
 * @param {string} promptCompleto
 * @returns {Promise<string>} la respuesta de Gemini
 */
export async function preguntarConGemini(promptCompleto) {
  const respuesta = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptCompleto }] }]
    })
  });

  await verificarRespuesta(respuesta, "chat");

  const data = await respuesta.json();
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return texto || "No se pudo generar una respuesta.";
}

// Las categorías válidas, deben coincidir exactamente con las opciones del <select> en el HTML
const CATEGORIAS_VALIDAS = ["general", "programacion", "futbol", "gaming", "estudio", "otro"];

/**
 * Le pide a Gemini que sugiera la categoría más adecuada para un link,
 * basándose en su resumen. Solo puede responder con una de las categorías válidas.
 * @param {string} resumen
 * @returns {Promise<string>} una de CATEGORIAS_VALIDAS
 */
export async function sugerirCategoria(resumen) {
  const prompt = `
Clasifica el siguiente resumen en EXACTAMENTE una de estas categorías (responde solo con la palabra, sin explicación, sin comillas, sin punto final):
${CATEGORIAS_VALIDAS.join(", ")}

Resumen: ${resumen}
  `;

  try {
    const respuestaCruda = await preguntarConGemini(prompt);
    // Limpiamos espacios y mayúsculas, por si Gemini responde "Futbol" o " futbol "
    const categoria = respuestaCruda.trim().toLowerCase();

    // Si por algún motivo Gemini responde algo fuera de la lista, usamos "general" como respaldo
    return CATEGORIAS_VALIDAS.includes(categoria) ? categoria : "general";
  } catch (error) {
    // Si falla (ej. límite de solicitudes), no queremos que se rompa el guardado del link.
    // Simplemente nos quedamos con "general" y seguimos.
    console.error("No se pudo sugerir categoría, usando 'general':", error);
    return "general";
  }
}