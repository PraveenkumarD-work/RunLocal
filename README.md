# RunLocal

**Know exactly which AI models your hardware can run — before you download anything.**

RunLocal scans your browser's hardware via the WebGPU API and instantly tells you which local LLMs will run smoothly, which will struggle, and which will never fit. No installs, no backend, no data collection.

## Features

- **Hardware detection** — GPU, VRAM, system RAM, and CPU cores via WebGPU API
- **17 models profiled** — Llama, Mistral, Gemma, Qwen, DeepSeek, Phi, Mixtral and more
- **Smart recommendations** — Smooth / Balanced / Too Heavy tiers based on your actual specs
- **Integrated GPU support** — Correctly handles Intel Iris Xe, AMD iGPU, and Apple Silicon
- **Office vs Dedicated mode** — Accounts for RAM used by Chrome, Zoom, and other apps
- **One-click Ollama commands** — Pull and run commands ready to copy
- **Direct Ollama links** — Click through to each model's library page

## Tech Stack

- React + Vite
- Tailwind CSS
- WebGPU API (for hardware detection)
- 100% client-side — no backend, no database, no API calls

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Adding New Models

Edit `src/modelDatabase.js` — each entry is self-contained with VRAM requirements, expected speeds, and Ollama commands.

## License

MIT
