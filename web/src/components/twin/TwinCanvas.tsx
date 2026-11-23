import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import { Box, RotateCcw, Scan } from "lucide-react";
import { PMREMGenerator, type Object3D } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useUi } from "../../state/ui";
import AutoFocus from "./AutoFocus";
import CameraRig from "./CameraRig";
import { buildFallbackModel } from "./FallbackModel";
import PartBadges from "./PartBadges";
import PartTooltip from "./PartTooltip";
import { TwinContext, type TwinApi } from "./TwinContext";
import TwinModel from "./TwinModel";

// Served from public/: no network beyond the app's own origin.
const MODEL_URL = "/models/transformer_parts.glb";

/** Image-based light from three's built-in RoomEnvironment: no HDR file is downloaded. */
function LocalEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.75;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
      room.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Suspense fallback: marks the model as loading. A plain DOM note shows it (see TwinCanvas). */
function LoadingMarker() {
  useEffect(() => {
    useUi.getState().setModelLoading(true);
    return () => useUi.getState().setModelLoading(false);
  }, []);
  return null;
}

/** Everything that needs the model: fit, shadow, camera behaviour. Mounts only once `root` exists. */
function Stage({ root }: { root: Object3D }) {
  return (
    <Bounds fit clip observe margin={1.15}>
      <TwinModel root={root} />
      <PartBadges />
      <CameraRig />
    </Bounds>
  );
}

/** Soft ground shadow. Outside <Bounds>: its plane must not count towards the fitted size. */
function Ground() {
  return <ContactShadows position={[0, 0.002, 0]} opacity={0.4} scale={14} blur={2.6} far={4} resolution={512} />;
}

function Scene({ root }: { root: Object3D }) {
  return (
    <>
      <Stage root={root} />
      <Ground />
    </>
  );
}

function GltfStage() {
  // draco/meshopt off: the file uses neither, and drei's default Draco decoder loads from a CDN.
  const gltf = useGLTF(MODEL_URL, false, false);
  const root = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <Scene root={root} />;
}

function FallbackStage() {
  const root = useMemo(() => buildFallbackModel(), []);
  return <Scene root={root} />;
}

/** If the .glb fails to load, build the primitive transformer with the same part ids. */
class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D model failed to load; using the fallback model.", error);
    useUi.getState().setModelFailed(true);
  }
  render() {
    return this.state.failed ? <FallbackStage /> : this.props.children;
  }
}

function Toolbar() {
  const xray = useUi((s) => s.xray);
  const toggleXray = useUi((s) => s.toggleXray);
  const resetView = useUi((s) => s.resetView);
  const button =
    "flex h-8 items-center gap-1.5 rounded-control border border-border bg-panel/90 px-2.5 text-sm font-medium shadow-sm backdrop-blur hover:bg-panel";
  return (
    <div className="absolute right-3 top-3 z-10 flex gap-2" role="toolbar" aria-label="3D view">
      <button
        type="button"
        aria-pressed={xray}
        onClick={toggleXray}
        className={`${button} ${xray ? "!bg-text !text-panel" : ""}`}
        title="Fade the tank to show the windings and core"
      >
        <Scan size={15} aria-hidden />
        X-ray
      </button>
      <button type="button" onClick={resetView} className={button} title="Fit the whole transformer in view">
        <RotateCcw size={15} aria-hidden />
        Reset view
      </button>
    </div>
  );
}

/** Interactive 3D transformer (FRONTEND_HANDOFF §15.2, §15.5). Loaded once; replay never reloads it. */
export default function TwinCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const apiRef = useRef<TwinApi | null>(null);
  const modelFailed = useUi((s) => s.modelFailed);
  const modelLoading = useUi((s) => s.modelLoading);

  return (
    <div ref={container} className="relative h-full w-full overflow-hidden bg-canvas">
        <Canvas dpr={[1, 2]} camera={{ position: [7, 4.5, 8], fov: 35 }} gl={{ antialias: true }}>
          <color attach="background" args={[getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() || "#eef1f5"]} />
          <LocalEnvironment />
          <directionalLight position={[6, 9, 5]} intensity={1.6} />
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            maxPolarAngle={Math.PI / 2 - 0.04}
            autoRotateSpeed={1} /* 1 rev/min */
          />
          <TwinContext.Provider value={apiRef}>
            <ModelBoundary>
              <Suspense fallback={<LoadingMarker />}>
                <GltfStage />
              </Suspense>
            </ModelBoundary>
          </TwinContext.Provider>
        </Canvas>
        <AutoFocus />
      <Toolbar />
        <PartTooltip container={container} />
      {modelLoading && (
        <p className="absolute inset-0 z-0 flex items-center justify-center text-sm text-muted-2">Loading 3D model…</p>
      )}
      {modelFailed && (
        <p className="absolute bottom-2 left-3 z-10 flex items-center gap-1.5 text-xs text-muted-2">
          <Box size={13} aria-hidden />
          Simplified model shown: the 3D file could not be loaded.
        </p>
      )}
    </div>
  );
}
