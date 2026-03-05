import argparse
import math
import time
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np


mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils


def _dist(a: Tuple[int, int], b: Tuple[int, int]) -> float:
    return float(math.hypot(a[0] - b[0], a[1] - b[1]))


def _angle(a: Tuple[int, int], b: Tuple[int, int], c: Tuple[int, int]) -> float:
    ba = np.array([a[0] - b[0], a[1] - b[1]], dtype=np.float32)
    bc = np.array([c[0] - b[0], c[1] - b[1]], dtype=np.float32)
    nba = np.linalg.norm(ba)
    nbc = np.linalg.norm(bc)
    if nba < 1e-6 or nbc < 1e-6:
        return 0.0
    cosang = float(np.dot(ba, bc) / (nba * nbc))
    cosang = float(np.clip(cosang, -1.0, 1.0))
    return float(math.degrees(math.acos(cosang)))


def _xy(landmarks, idx: int, w: int, h: int) -> Tuple[int, int]:
    lm = landmarks[idx]
    return int(lm.x * w), int(lm.y * h)


@dataclass
class HandTracker:
    last_pos: Optional[Tuple[int, int]] = None
    last_t: float = 0.0
    last_extension: float = 0.0
    cooldown_until: float = 0.0
    punches: int = 0
    last_angle: float = 0.0


@dataclass
class SessionStats:
    total: int = 0
    left: int = 0
    right: int = 0
    combo: int = 0
    best_combo: int = 0
    last_punch_t: float = 0.0
    started_at: float = time.time()

    def register_punch(self, side: str, t_now: float) -> None:
        self.total += 1
        if side == "left":
            self.left += 1
        else:
            self.right += 1

        if self.last_punch_t and (t_now - self.last_punch_t) <= 1.2:
            self.combo += 1
        else:
            self.combo = 1

        self.best_combo = max(self.best_combo, self.combo)
        self.last_punch_t = t_now

    def punches_per_minute(self, t_now: float) -> float:
        elapsed = max(t_now - self.started_at, 1e-6)
        return (self.total / elapsed) * 60.0


class ShadowBoxingAnalyzer:
    """Detects straight punches from wrist speed + arm extension."""

    def __init__(self) -> None:
        self.hands: Dict[str, HandTracker] = {
            "left": HandTracker(),
            "right": HandTracker(),
        }
        self.stats = SessionStats()

    def _detect_for_side(
        self,
        side: str,
        shoulder: Tuple[int, int],
        elbow: Tuple[int, int],
        wrist: Tuple[int, int],
        torso_scale: float,
        t_now: float,
    ) -> bool:
        hand = self.hands[side]

        extension = _dist(shoulder, wrist) / torso_scale
        elbow_angle = _angle(shoulder, elbow, wrist)

        if hand.last_pos is None:
            hand.last_pos = wrist
            hand.last_t = t_now
            hand.last_extension = extension
            return False

        dt = max(t_now - hand.last_t, 1e-6)
        velocity = (_dist(wrist, hand.last_pos) / torso_scale) / dt
        extension_delta = extension - hand.last_extension

        punched = False
        if t_now >= hand.cooldown_until:
            # Tuned for shadow boxing with standard webcams.
            if (
                velocity > 3.2
                and extension > 1.22
                and extension_delta > 0.16
                and elbow_angle > 145
            ):
                hand.punches += 1
                hand.cooldown_until = t_now + 0.28
                self.stats.register_punch(side, t_now)
                punched = True

        hand.last_pos = wrist
        hand.last_t = t_now
        hand.last_extension = extension
        hand.last_angle = elbow_angle
        return punched

    def process(self, landmarks, frame_shape) -> Dict[str, object]:
        h, w, _ = frame_shape
        lms = landmarks.landmark

        l_sh = _xy(lms, mp_pose.PoseLandmark.LEFT_SHOULDER.value, w, h)
        r_sh = _xy(lms, mp_pose.PoseLandmark.RIGHT_SHOULDER.value, w, h)
        l_el = _xy(lms, mp_pose.PoseLandmark.LEFT_ELBOW.value, w, h)
        r_el = _xy(lms, mp_pose.PoseLandmark.RIGHT_ELBOW.value, w, h)
        l_wr = _xy(lms, mp_pose.PoseLandmark.LEFT_WRIST.value, w, h)
        r_wr = _xy(lms, mp_pose.PoseLandmark.RIGHT_WRIST.value, w, h)

        torso_scale = max(_dist(l_sh, r_sh), 40.0)
        t_now = time.time()

        left_punch = self._detect_for_side(
            "left", l_sh, l_el, l_wr, torso_scale, t_now
        )
        right_punch = self._detect_for_side(
            "right", r_sh, r_el, r_wr, torso_scale, t_now
        )

        return {
            "left_punch": left_punch,
            "right_punch": right_punch,
            "stats": self.stats,
            "points": {
                "l_sh": l_sh,
                "r_sh": r_sh,
                "l_el": l_el,
                "r_el": r_el,
                "l_wr": l_wr,
                "r_wr": r_wr,
            },
            "angles": {
                "left": self.hands["left"].last_angle,
                "right": self.hands["right"].last_angle,
            }
        }


def draw_ui(frame, stats: SessionStats, fps: float, event_text: str, angles: Dict[str, float]) -> None:
    cv2.rectangle(frame, (0, 0), (530, 185), (25, 25, 25), -1)
    cv2.putText(frame, "SHADOW BOXING TRACKER", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 220, 255), 2)
    cv2.putText(frame, f"Total: {stats.total}", (14, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
    cv2.putText(frame, f"Left: {stats.left}  Right: {stats.right}", (14, 88), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
    cv2.putText(frame, f"Combo: {stats.combo}  Best: {stats.best_combo}", (14, 116), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
    cv2.putText(
        frame,
        f"PPM: {stats.punches_per_minute(time.time()):.1f}  FPS: {fps:.1f}",
        (14, 144),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (180, 255, 180),
        2,
    )
    cv2.putText(frame, f"L-Ang: {angles['left']:.0f}  R-Ang: {angles['right']:.0f}", (14, 172), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 200, 0), 2)

    if event_text:
        cv2.putText(frame, event_text, (15, frame.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 3)


def main() -> None:
    parser = argparse.ArgumentParser(description="Shadow boxing punch detector (OpenCV + MediaPipe)")
    parser.add_argument("--camera", type=int, default=0, help="Camera index")
    parser.add_argument("--min-detect", type=float, default=0.6, help="Min detection confidence")
    parser.add_argument("--min-track", type=float, default=0.6, help="Min tracking confidence")
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam. Try --camera 1 or check camera permissions.")

    analyzer = ShadowBoxingAnalyzer()
    ptime = time.time()

    with mp_pose.Pose(
        min_detection_confidence=args.min_detect,
        min_tracking_confidence=args.min_track,
        model_complexity=1,
    ) as pose:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            frame = cv2.flip(frame, 1)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(rgb)

            event_text = ""
            out = {}
            if result.pose_landmarks:
                out = analyzer.process(result.pose_landmarks, frame.shape)
                mp_drawing.draw_landmarks(
                    frame,
                    result.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS,
                    mp_drawing.DrawingSpec(color=(120, 120, 120), thickness=2, circle_radius=2),
                    mp_drawing.DrawingSpec(color=(0, 180, 255), thickness=2, circle_radius=2),
                )

                pts = out.get("points", {})
                if pts:
                    cv2.line(frame, pts["l_sh"], pts["l_wr"], (0, 255, 255), 2)
                    cv2.line(frame, pts["r_sh"], pts["r_wr"], (255, 255, 0), 2)

                if out.get("left_punch") and out.get("right_punch"):
                    event_text = "DOUBLE"
                elif out.get("left_punch"):
                    event_text = "LEFT STRAIGHT"
                elif out.get("right_punch"):
                    event_text = "RIGHT STRAIGHT"

            ctime = time.time()
            fps = 1.0 / max(ctime - ptime, 1e-6)
            ptime = ctime

            draw_ui(frame, analyzer.stats, fps, event_text, out.get("angles", {"left": 0, "right": 0}))

            # Draw angles near elbows
            if result.pose_landmarks and "points" in out:
                pts = out["points"]
                angles = out.get("angles", {"left": 0, "right": 0})
                cv2.putText(frame, f"{angles['left']:.0f}", pts["l_el"], cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                cv2.putText(frame, f"{angles['right']:.0f}", pts["r_el"], cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

            cv2.imshow("Shadow Boxing CV (q=quit, r=reset)", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("r"):
                analyzer = ShadowBoxingAnalyzer()

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
