// grafo.js
// Este archivo dibuja el mapa visual: cada link es un círculo (nodo),
// y las líneas entre ellos representan qué tan relacionados están
// (calculado con similitud coseno sobre los embeddings).

import { db, auth } from "./firebase-config.js";
import { similitudCoseno } from "./gemini-config.js";
import {
  collection,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const linksRef = collection(db, "links");
const btnToggle = document.getElementById("btn-toggle-mapa");
const mapaContainer = document.getElementById("mapa-container");

let mapaVisible = false;
let ultimosDocs = []; // guardamos la última versión de los datos
let dejarDeEscuchar = null;

// Mostrar/ocultar el mapa con el botón
btnToggle.addEventListener("click", () => {
  mapaVisible = !mapaVisible;
  mapaContainer.style.display = mapaVisible ? "block" : "none";
  btnToggle.textContent = mapaVisible ? "🕸️ Ocultar mapa" : "🕸️ Ver mapa de conexiones";

  if (mapaVisible) {
    dibujarGrafo(ultimosDocs);
  }
});

// Escuchamos SOLO tus links en tiempo real (filtrado por uid)
onAuthStateChanged(auth, (usuario) => {
  if (dejarDeEscuchar) {
    dejarDeEscuchar();
    dejarDeEscuchar = null;
  }

  if (!usuario) return;

  const q = query(linksRef, where("uid", "==", usuario.uid));

  dejarDeEscuchar = onSnapshot(q, (snapshot) => {
    ultimosDocs = [];
    snapshot.forEach((docSnap) => {
      ultimosDocs.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Solo redibujamos si el mapa está visible (para no gastar recursos de más)
    if (mapaVisible) {
      dibujarGrafo(ultimosDocs);
    }
  });
});

/**
 * Construye y dibuja el grafo de nodos y conexiones usando D3.js
 * @param {Array} docs - todos los links guardados, con su embedding
 */
function dibujarGrafo(docs) {
  const svg = d3.select("#grafo");
  svg.selectAll("*").remove(); // limpiamos el dibujo anterior antes de redibujar

  const ancho = svg.node().getBoundingClientRect().width;
  const alto = 600;
  svg.attr("height", alto);

  // Solo nos interesan los links que sí tienen embedding calculado
  const nodos = docs
    .filter((d) => d.embedding)
    .map((d) => ({
      id: d.id,
      titulo: d.titulo || d.url,
      categoria: d.categoria || "general"
    }));

  if (nodos.length === 0) {
    svg.append("text")
      .attr("x", ancho / 2)
      .attr("y", alto / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#888")
      .text("Todavía no hay suficientes links con embeddings para mostrar el mapa.");
    return;
  }

  // Construimos las conexiones (edges): comparamos cada par de links
  // una sola vez (por eso el segundo for empieza en i+1, para no repetir pares).
  const conexiones = [];
  const docsConEmbedding = docs.filter((d) => d.embedding);

  for (let i = 0; i < docsConEmbedding.length; i++) {
    for (let j = i + 1; j < docsConEmbedding.length; j++) {
      const score = similitudCoseno(docsConEmbedding[i].embedding, docsConEmbedding[j].embedding);

      // Umbral de 0.6: calibrado con datos reales (Messi/Ronaldo dieron 0.656,
      // y sí son links relacionados de verdad, así que 0.7 era demasiado estricto).
      if (score > 0.6) {
        conexiones.push({
          source: docsConEmbedding[i].id,
          target: docsConEmbedding[j].id,
          score
        });
      }
    }
  }

  // Contamos cuántas conexiones tiene cada nodo, para que los más
  // "conectados" se vean más grandes (un indicador visual de importancia).
  const conteoConexiones = {};
  conexiones.forEach((c) => {
    conteoConexiones[c.source] = (conteoConexiones[c.source] || 0) + 1;
    conteoConexiones[c.target] = (conteoConexiones[c.target] || 0) + 1;
  });

  const colores = {
    general: "#9ca3af",
    programacion: "#5b8cff",
    futbol: "#34c782",
    gaming: "#a86cff",
    estudio: "#f5a623",
    otro: "#ec4899"
  };

  // ---------------------------
  // Leyenda de categorías (arriba a la izquierda)
  // ---------------------------
  const leyenda = svg.append("g").attr("transform", "translate(14, 14)");
  Object.entries(colores).forEach(([cat, color], i) => {
    const fila = leyenda.append("g").attr("transform", `translate(0, ${i * 18})`);
    fila.append("circle").attr("r", 5).attr("fill", color);
    fila.append("text")
      .text(cat)
      .attr("x", 10)
      .attr("y", 4)
      .attr("font-size", "11px")
      .attr("fill", "#9a9da6");
  });

  // ---------------------------
  // Zoom y pan: permite acercarte/alejarte y arrastrar el fondo del mapa
  // ---------------------------
  const grupoZoom = svg.append("g");

  svg.call(
    d3.zoom()
      .scaleExtent([0.3, 4]) // qué tanto puedes acercar/alejar
      .on("zoom", (event) => {
        grupoZoom.attr("transform", event.transform);
      })
  );

  // La "simulación de fuerzas" es el motor de D3 que acomoda los nodos
  // automáticamente: los conecta como si tuvieran resortes, y los separa
  // como si se repelieran entre sí (para que no queden amontonados).
  const simulacion = d3.forceSimulation(nodos)
    .force("link", d3.forceLink(conexiones).id((d) => d.id).distance(130))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(ancho / 2, alto / 2))
    .force("collide", d3.forceCollide().radius(36)); // evita que los nodos se encimen

  // Dibujamos las líneas de conexión primero (para que queden detrás de los círculos)
  const lineas = grupoZoom.append("g")
    .selectAll("line")
    .data(conexiones)
    .join("line")
    .attr("stroke", "#5b8cff")
    .attr("stroke-opacity", (d) => d.score * 0.6) // más parecido = línea más visible
    .attr("stroke-width", (d) => d.score * 3);

  // Dibujamos los nodos (círculos + texto del título)
  const grupoNodos = grupoZoom.append("g")
    .selectAll("g")
    .data(nodos)
    .join("g")
    .style("cursor", "grab")
    .call(arrastrar(simulacion));

  // El radio del círculo crece un poco según cuántas conexiones tiene (mínimo 9, máximo ~20)
  grupoNodos.append("circle")
    .attr("r", (d) => 9 + Math.min(conteoConexiones[d.id] || 0, 6) * 1.8)
    .attr("fill", (d) => colores[d.categoria] || colores.general)
    .attr("stroke", "#0f1115")
    .attr("stroke-width", 2);

  // Tooltip nativo del navegador: aparece al dejar el mouse encima (sin código extra)
  grupoNodos.append("title")
    .text((d) => d.titulo);

  grupoNodos.append("text")
    .text((d) => d.titulo.length > 22 ? d.titulo.slice(0, 22) + "…" : d.titulo)
    .attr("x", (d) => 16 + Math.min(conteoConexiones[d.id] || 0, 6) * 1.8)
    .attr("y", 4)
    .attr("font-size", "12px")
    .attr("font-weight", "500")
    .attr("fill", "#e4e6eb");

  // En cada "tick" de la simulación, actualizamos las posiciones en pantalla
  simulacion.on("tick", () => {
    lineas
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    grupoNodos.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });
}

/**
 * Permite arrastrar los nodos con el mouse para reacomodar el mapa manualmente.
 */
function arrastrar(simulacion) {
  function empezar(event, d) {
    if (!event.active) simulacion.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function mover(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function terminar(event, d) {
    if (!event.active) simulacion.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  return d3.drag().on("start", empezar).on("drag", mover).on("end", terminar);
}