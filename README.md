# 🏛️ LLM Council

**A Next-Generation Multi-Agent Debate Orchestrator**

LLM Council is a sophisticated web application that assembles diverse AI personas to debate, research, and synthesize complex topics in real-time. By leveraging the power of **Google Gemini**, **OpenRouter**, and **Perplexity**, it creates a "Council of Experts" that helps reduce hallucinations and bias through dialectical reasoning.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-beta-purple.svg)
![Stack](https://img.shields.io/badge/stack-React%20%7C%20Gemini%20%7C%20TypeScript-blue)

---

## ✨ Key Features

### 🧠 Intelligent Orchestration
*   **Auto-Pilot Mode:** An AI Chairperson dynamically manages the debate flow, deciding when to move between Opening Arguments, Rebuttals, and Synthesis based on conversation quality.
*   **Logical Fallacy Detection:** Real-time analysis runs in the background to flag weak arguments (e.g., Ad Hominem, Strawman) within the chat stream.
*   **Golden Mean Synthesis:** The debate concludes not just with a winner, but with a synthesized solution that merges the best points from all sides.

### 👥 Dynamic Personas
*   **Diverse Roles:** Pre-set agents like The Skeptic, The Visionary, and The Scientist.
*   **AI Generator:** Generate unique custom councils based on a theme (e.g., "Create a council of Cyberpunk Hackers" or "18th Century Philosophers").
*   **Guest Experts:** The Orchestrator can dynamically "summon" temporary guest experts (e.g., a Constitutional Lawyer) if the debate lacks specific domain knowledge.

### 🔌 Connectivity & Grounding
*   **Multi-Provider Support:** First-class support for **Google Gemini** (Flash/Pro) and **OpenRouter** (Claude, GPT-4, Llama, etc.).
*   **Real-Time Research:**
    *   **Google Grounding:** Native support for Gemini models.
    *   **Perplexity API:** Allows OpenRouter/Llama models to search the live web for facts and citations.
*   **Human-in-the-Loop:** Agents can explicitly pause the debate to ask *you* for input or moral guidance.

### 🎬 Director Mode ("God Mode")
*   Take control of the simulation in real-time.
*   **Inject System Messages:** Force specific constraints (e.g., "Assume budget is zero").
*   **Force Phase Changes:** Skip boring arguments and move directly to Voting.
*   **Inject Research:** Paste documents or context directly into the Council's knowledge base.

---

## 🚀 Getting Started

This project is built as a Client-Side Single Page Application (SPA). No backend server is required.

### Prerequisites
*   Node.js (v18+)
*   npm or yarn

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/llm-council.git
    cd llm-council
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Start the development server**
    ```bash
    npm start
    ```

4.  Open `http://localhost:3000` in your browser.

---

## ⚙️ Configuration

LLM Council is designed to be **serverless and config-free**. You do not need `proces.env` variables to run the app.

1.  Open the application in your browser.
2.  Click the **Settings (Gear Icon)** in the top right.
3.  **Choose your Provider:**
    *   **Google Gemini:** Enter your Google GenAI API Key.
    *   **OpenRouter:** Enter your OpenRouter Key to access models like Claude 3.5 Sonnet or Llama 3.
4.  **(Optional) Perplexity Search:** Enter a Perplexity API Key to enable web search capabilities for non-Google models.

*Note: API Keys are stored securely in your browser's LocalStorage and are never sent to any server other than the respective API endpoints.*

---

## 🛠️ Tech Stack

*   **Frontend:** React 19, TypeScript, Vite (implied structure).
*   **Styling:** Tailwind CSS, Framer Motion (animations).
*   **AI Integration:** `@google/genai` SDK, `fetch` for OpenRouter/Perplexity.
*   **Icons:** Lucide React.

---

## 📦 Deployment

This app is optimized for deployment on **Netlify**, **Vercel**, or **GitHub Pages**.

### Netlify (Recommended)
A `netlify.toml` file is included to handle SPA routing (redirects `/*` to `/index.html`).

1.  Drag and drop the `build/` folder to Netlify Drop, or connect your GitHub repo.
2.  No environment variables are needed on Netlify; users configure keys in the browser.

---

## 🤝 Contributing

Contributions are welcome!
1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
