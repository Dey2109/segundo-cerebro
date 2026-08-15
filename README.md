<div align="center">

# 🧠 Segundo Cerebro

**Guarda un link. La IA lo lee, lo resume, y encuentra con qué más se conecta.**

Un gestor de links personal con resúmenes automáticos, búsqueda por significado, chat con tus propios datos, y un mapa visual de conexiones — todo construido desde cero con HTML/CSS/JS puro.

[![Hecho con Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Gemini API](https://img.shields.io/badge/IA-Google%20Gemini-4285F4?logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![D3.js](https://img.shields.io/badge/Visualizaci%C3%B3n-D3.js-F9A03C?logo=d3.js&logoColor=white)](https://d3js.org/)
[![Deploy](https://img.shields.io/badge/Deploy-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](https://github.com/features/actions)

</div>

---

## ¿Qué es esto?

Todos tenemos 200 pestañas abiertas y links guardados que nunca releemos. **Segundo Cerebro** resuelve eso: guardas una URL, la IA la lee y la resume en 3 puntos, la clasifica por categoría, y calcula automáticamente con qué otros links guardados se relaciona **por significado**, no por palabras exactas.

Cada usuario tiene su propio espacio privado (login con Google), y puede visualizar todo su conocimiento como un grafo interactivo de nodos conectados.

## ✨ Funciones

| | |
|---|---|
| 📝 **Resumen automático** | Lee cualquier link (artículos, blogs, YouTube) y lo resume en 3 puntos con IA |
| 🏷️ **Auto-categorización** | Si no eliges categoría, la IA la sugiere sola basándose en el contenido |
| 🔍 **Búsqueda semántica** | Busca por significado, no por texto exacto (ej. "goles" encuentra un link sobre Messi) |
| 🕸️ **Mapa de conexiones** | Grafo interactivo (D3.js) que muestra qué links están relacionados entre sí |
| 💬 **Chat con tus datos** | Pregúntale a tu propio archivo de links, con fuentes citadas (RAG) |
| 📊 **Digest semanal** | Resumen ejecutivo de lo que guardaste en los últimos 7 días |
| 🔎 **Vacíos de conocimiento** | Analiza en qué temas estás concentrado vs. cuáles casi no exploras |
| 🔐 **Cuentas individuales** | Login con Google — cada quien ve solo sus propios links |
| 🔊 **Texto a voz** | Escucha el resumen de cualquier link con un click |
| ⚠️ **Detección de duplicados** | Avisa si ya guardaste ese mismo link antes |

## 🛠️ Stack técnico

- **Frontend:** HTML5, CSS3, JavaScript ES6+ (módulos nativos, sin frameworks)
- **Base de datos:** Firebase Firestore (tiempo real, reglas de seguridad por usuario)
- **Autenticación:** Firebase Authentication (Google Sign-In)
- **IA:** Google Gemini (`gemini-3.5-flash-lite` para resúmenes/chat, `gemini-embedding-001` para búsqueda semántica)
- **Extracción de contenido:** [Jina AI Reader](https://jina.ai/reader/) + YouTube oEmbed API
- **Visualización:** D3.js (force-directed graph)
- **Despliegue:** GitHub Actions → GitHub Pages (con inyección segura de API keys vía Secrets)

## 🚀 Cómo correrlo tú mismo

### 1. Clona el repositorio

```bash
git clone https://github.com/Dey2109/segundo-cerebro.git
cd segundo-cerebro
```

### 2. Configura tus propias credenciales

Este proyecto necesita 2 servicios gratuitos:

- **Firebase**: crea un proyecto en [Firebase Console](https://console.firebase.google.com), activa **Firestore Database** y **Authentication (Google)**, y copia tu configuración en `firebase-config.js`
- **Gemini API**: consigue una clave gratis en [Google AI Studio](https://aistudio.google.com/apikey)

Copia la plantilla y agrega tu clave:

```bash
cp gemini-config.example.js gemini-config.js
# Edita gemini-config.js y pega tu clave real
```

> ⚠️ `gemini-config.js` está en `.gitignore` a propósito — nunca lo subas con tu clave real.

### 3. Corre el proyecto localmente

Como usa módulos ES6, necesitas un servidor local (no funciona con doble-click en el HTML):

```bash
# Con la extensión "Live Server" de VS Code: click derecho en index.html → "Open with Live Server"
```

### 4. (Opcional) Despliegue automático

Este repo incluye un workflow de GitHub Actions (`.github/workflows/deploy.yml`) que despliega a GitHub Pages automáticamente en cada push, inyectando tu API key de Gemini desde un [Secret de repositorio](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) — así nunca queda expuesta en el código.

## 📐 Reglas de seguridad de Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /links/{linkId} {
      allow read, update, delete: if request.auth != null && request.auth.uid == resource.data.uid;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.uid;
    }
  }
}
```

## 🗂️ Estructura del proyecto

```
segundo-cerebro/
├── index.html              # estructura principal
├── style.css                # sistema de diseño (paleta, tipografía, componentes)
├── firebase-config.js       # conexión a Firestore + Auth
├── gemini-config.example.js # plantilla de credenciales de Gemini
├── auth.js / auth-state.js  # login con Google y estado compartido
├── app.js                   # CRUD de links, búsqueda, duplicados
├── chat.js                  # chat RAG sobre tus propios links
├── digest.js                # digest semanal y vacíos de conocimiento
├── grafo.js                 # mapa visual con D3.js
├── toast.js                 # sistema de notificaciones
└── .github/workflows/       # despliegue automático a GitHub Pages
```

## 📄 Licencia

Proyecto personal con fines educativos.

---

<div align="center">
<sub>Construido por <a href="https://github.com/Dey2109">Dey2109</a> — estudiante de Desarrollo de Software en BTVDS de INFRAMEN</sub>
</div>
