# 🥊 Shadow Boxing AI Coach

An advanced real-time Computer Vision application that tracks your shadow boxing performance, detects punches, and provides active coaching feedback using **MediaPipe** and **OpenCV**.

![Aesthetics Placeholder](https://img.shields.io/badge/AI-Coach-FFD700?style=for-the-badge&logo=google-ai&logoColor=black)
![Aesthetics Placeholder](https://img.shields.io/badge/OpenCV-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white)
![Aesthetics Placeholder](https://img.shields.io/badge/MediaPipe-00C0FF?style=for-the-badge&logo=google&logoColor=white)

## ✨ Features

### 🧠 AI Coaching System
- **Guard Detection**: Real-time monitoring of hand positions. Alerts you with `"KEEP YOUR HANDS UP!"` if your guard drops below nose level.
- **Punch Quality (Extension Check)**: Analyzes the physics of every punch.
  - 🌟 **EXCELLENT**: Full, crisp extension.
  - ✅ **GOOD**: Solid standard reach.
  - ⚠️ **SHORT**: Warns you to reach further for better snap.

### 📊 Real-Time Metrics
- **PPM (Punches Per Minute)**: Tracks your intensity and cardio output.
- **Combo Counter**: Detects consecutive strikes within a 1.2s window.
- **Best Combo**: Records your highest streak during the session.
- **Dynamic Angles**: Real-time display of elbow angles to ensure proper form.

### 🛠 Technical Highlights
- **Dynamic Scaling**: The system automatically scales detection thresholds based on your distance from the camera (using torso-to-shoulder ratio).
- **Physics-Based Velocity**: Distinguishes between intentional punches and general movement using wrist velocity and acceleration deltas.

---

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- Webcam

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/nikhilgupta-dev-bit/Shadow_boxing_using_mediaPipe.git
   cd Shadow_boxing_using_mediaPipe
   ```

2. **Set up Virtual Environment** (Recommended):
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On macOS/Linux
   ```

3. **Install Dependencies**:
   ```bash
   pip install opencv-python mediapipe numpy
   ```

### 🥊 Usage

Run the app using the provided script:
```bash
./run.sh
```

**Controls**:
- `q`: Quit the application.
- `r`: Reset session statistics.

**CLI Options**:
- `--camera`: Specify camera index (default: 0).
- `--min-detect`: Minimum detection confidence (default: 0.6).

---

## 📸 interface Preview
The UI features a high-visibility dark overlay, real-time landmark tracking, and color-coded coaching feedback to keep you focused on your form.

## 📜 License
Distibuted under the MIT License. See `LICENSE` for more information.
