import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Info } from "lucide-react";
import { useRef, useState } from "react";
import { Vector3 } from "three";
import { SENSOR_NOTE } from "../../lib/alerts";
import { PART_IDS, type PartId } from "./parts";
import { useTwinApi } from "./TwinContext";
import { useTwinStatus } from "./TwinStatusContext";

/**
 * Blue-grey ⓘ badge on any part with an active sensor-origin alert (FRONTEND_HANDOFF §15.4):
 * never red, never changes the part's health colour. Tracks the part's bounding box, so it
 * follows the model when it rotates and reappears if X-ray reveals the part.
 */
export default function PartBadges() {
  const status = useTwinStatus();
  const twin = useTwinApi();
  const [positions, setPositions] = useState<Partial<Record<PartId, Vector3>>>({});
  const posRef = useRef(positions);
  posRef.current = positions;

  useFrame(() => {
    let changed = false;
    const next = { ...posRef.current };
    for (const part of PART_IDS) {
      const want = status[part].sensorFault;
      const box = want ? twin.current?.partBox(part) : null;
      const prev = next[part];
      if (box) {
        const p = box.getCenter(new Vector3());
        p.y = box.max.y + 0.05;
        if (!prev || !prev.equals(p)) {
          next[part] = p;
          changed = true;
        }
      } else if (prev) {
        delete next[part];
        changed = true;
      }
    }
    if (changed) setPositions(next);
  });

  return (
    <>
      {PART_IDS.filter((part) => positions[part]).map((part) => (
        <Html key={part} position={positions[part]} center distanceFactor={8} zIndexRange={[20, 0]}>
          <span
            title={SENSOR_NOTE}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-white/70 shadow-sm"
            style={{ background: "var(--sensor)", color: "white" }}
          >
            <Info size={12} strokeWidth={2.5} aria-hidden />
          </span>
        </Html>
      ))}
    </>
  );
}
