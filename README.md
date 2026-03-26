# 🥊 Shadow Boxing Tracker

A real-time web-based shadow boxing punch detector powered by **MediaPipe Pose JS** — running entirely in the browser. No installations, no Python, no backend. Just open and box! 

![MediaPipe](https://img.shields.io/badge/MediaPipe-00C0FF?style=for-the-badge&logo=google&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)

---

## ✨ Features

### 🧠 Pose-Based Punch Detection
- **Physics-based algorithm**: detects punches using wrist velocity, arm extension, extension delta, and elbow angle — all normalized to your body proportions
- **Left / Right hand tracking**: independently tracks each hand with a per-hand cooldown (280 ms)
- **Double punch**: detects simultaneous left + right throws

### 📊 Real-Time Session Stats
- **Total Punches** — cumulative count for the session
- **Left / Right** — breakdown by hand
- **PPM** (Punches Per Minute) — tracks your cardio intensity
- **Combo Counter** — consecutive punches within a 1.2 s window
- **Best Combo 🏆** — highest streak of the session
- **Live Elbow Angles** — real-time L/R elbow angle display for form feedback

### 🎛 Detection Tuning (Live Sliders)
Adjust thresholds on-the-fly without reloading:
- **Velocity threshold** — minimum wrist speed to register a punch
- **Extension minimum** — how far your arm must reach relative to shoulder width
- **Elbow angle minimum** — minimum elbow straightness (degrees)

### 🎨 Premium Dark UI
- Glassmorphism dark theme with accent glow effects
- Live skeleton overlay drawn on canvas
- Per-punch edge flash (green = left, red = right, cyan = double)
- Animated combo/event label on screen
- Fully responsive — works on tablets too

---

## 🚀 Getting Started

### Option A — Open directly in browser (simplest)
> **Requires a local server** because MediaPipe loads WASM files via fetch.  
> Simply double-clicking `index.html` will NOT work.

```bash
# Using Node (npx serve — no install needed)
npx serve . -l 3000
# Then open http://localhost:3000
```

### Option B — Use the npm script
```bash
npm start
# Opens at http://localhost:3000
```

### Option C — Live deployment (recommended)
The app is deployed on **GitHub Pages**:  
👉 **[https://nikhilgupta-dev-bit.github.io/Shadow_boxing_using_mediaPipe](https://nikhilgupta-dev-bit.github.io/Shadow_boxing_using_mediaPipe)**

> Webcam access requires **HTTPS** — GitHub Pages provides this automatically.

---

## 🛠 How It Works

The detection pipeline mirrors the original Python `shadow_boxing_cv.py` logic, ported to JavaScript:

| Step | What it does |
|---|---|
| **MediaPipe Pose** | Detects 33 body landmarks from the webcam feed at 30 fps |
| **Torso scaling** | Normalizes all distances by shoulder-width to handle any distance from camera |
| **Velocity check** | Wrist speed (normalized) must exceed the velocity threshold |
| **Extension check** | Wrist-to-shoulder distance / shoulder-width must exceed the extension threshold |
| **Delta check** | Arm must be actively extending (not retracting) |
| **Elbow angle check** | Elbow must be sufficiently straight (> angle threshold) |
| **Cooldown** | 280 ms cooldown per hand prevents double-counting a single punch |

All thresholds are tunable in real-time via the sidebar sliders.

---

## 📁 Project Structure

```
Shadow_boxing/
├── index.html          # App shell & layout
├── app.js              # MediaPipe integration + punch detection logic
├── style.css           # Dark theme UI styles
├── package.json        # npm scripts (serve)
├── shadow_boxing_cv.py # Original Python/OpenCV version (reference)
└── run.sh              # Script to run the Python version
```

---

## 📜 License

Distributed under the MIT License.
