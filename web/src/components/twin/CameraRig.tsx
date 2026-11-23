import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useBounds } from "@react-three/drei";
import { MathUtils, type PerspectiveCamera, Sphere, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useUi } from "../../state/ui";
import { useTwinApi } from "./TwinContext";

const FOCUS_MS = 800;
const RESUME_AFTER_MS = 10_000;
/** Default viewing direction: front-right and slightly above, conservator at the far left. */
const DEFAULT_DIR = new Vector3(1, 0.62, 1.15).normalize();

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Tween {
  t0: number;
  fromPos: Vector3;
  fromTarget: Vector3;
  toPos: Vector3;
  toTarget: Vector3;
}

/**
 * Camera behaviour on top of drei <Bounds>: zoom limits that follow the fitted distance,
 * auto-rotate that pauses on hover or drag and resumes after 10 s, focusPart(id) and Reset view
 * as 800 ms eased moves. Bounds itself keeps the whole model in view on load and on resize.
 */
export default function CameraRig() {
  const bounds = useBounds();
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const twin = useTwinApi();
  const focusRequest = useUi((s) => s.focusRequest);
  const resetNonce = useUi((s) => s.resetNonce);
  const hovered = useUi((s) => s.hoveredPart);

  const tween = useRef<Tween | null>(null);
  const dragging = useRef(false);
  const hoveredRef = useRef(false);
  const lastInteraction = useRef(-Infinity);
  const reduceMotion = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => (reduceMotion.current = mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    hoveredRef.current = hovered !== null;
    lastInteraction.current = performance.now();
  }, [hovered]);

  useEffect(() => {
    if (!controls) return;
    const start = () => {
      dragging.current = true;
      tween.current = null;
    };
    const end = () => {
      dragging.current = false;
      lastInteraction.current = performance.now();
    };
    controls.addEventListener("start", start);
    controls.addEventListener("end", end);
    return () => {
      controls.removeEventListener("start", start);
      controls.removeEventListener("end", end);
    };
  }, [controls]);

  /** Distance at which a sphere of `radius` fills the view (whichever of width/height is tighter). */
  const fitDistance = (radius: number) => {
    const vfov = MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / size.height));
    return radius / Math.sin(Math.min(vfov, hfov) / 2);
  };

  const moveTo = (centre: Vector3, distance: number, keepDirection: boolean) => {
    if (!controls) return;
    const dir = keepDirection ? camera.position.clone().sub(controls.target).normalize() : DEFAULT_DIR.clone();
    tween.current = {
      t0: performance.now(),
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: centre.clone().addScaledVector(dir, distance),
      toTarget: centre.clone(),
    };
  };

  // focusPart(id): frame that part
  useEffect(() => {
    if (!focusRequest) return;
    const box = twin.current?.partBox(focusRequest.part);
    if (!box) return;
    const sphere = box.getBoundingSphere(new Sphere());
    moveTo(sphere.center, fitDistance(sphere.radius) * 1.3, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // Reset view: back to the default framing of the whole model
  useEffect(() => {
    if (resetNonce === 0) return;
    const { center, distance } = bounds.refresh().getSize();
    bounds.clip();
    moveTo(center, distance, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce]);

  useFrame(() => {
    if (!controls) return;
    const now = performance.now();

    // Zoom limits follow the fitted distance (Bounds.clip resets maxDistance on every refit).
    const fit = bounds.getSize().distance;
    controls.minDistance = fit * 0.12;
    controls.maxDistance = fit * 1.35;

    const tw = tween.current;
    if (tw) {
      const k = Math.min(1, (now - tw.t0) / FOCUS_MS);
      const e = ease(k);
      camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      if (k >= 1) tween.current = null;
      lastInteraction.current = now;
    }

    controls.autoRotate =
      !reduceMotion.current &&
      !tween.current &&
      !dragging.current &&
      !hoveredRef.current &&
      now - lastInteraction.current >= RESUME_AFTER_MS;
  });

  return null;
}
