import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { BackSide, Box3, Color, Mesh, MeshBasicMaterial, type Material, type Object3D } from "three";
import { useUi } from "../../state/ui";
import { buildInternals } from "./internals";
import { PART_IDS, partOfMesh, type PartId } from "./parts";
import { useTwinApi } from "./TwinContext";
import { useTwinStatus } from "./TwinStatusContext";

const XRAY_TANK_OPACITY = 0.15;
const HOVER_EMISSIVE = new Color("#60a5fa");

// Status outline (§15.4 "Look" column): a slightly larger backside shell per mesh, coloured and
// sized by status. Red pulses at 1 Hz; `useFrame` below skips the pulse under reduced motion.
const OUTLINE_COLOUR: Record<"green" | "yellow" | "red", string> = {
  green: "#16a34a",
  yellow: "#ca8a04",
  red: "#dc2626",
};
const OUTLINE_OPACITY: Record<"green" | "yellow" | "red", number> = { green: 0.22, yellow: 0.5, red: 0.75 };
const OUTLINE_SCALE = 1.015;

type StdMaterial = Material & { emissive?: Color; emissiveIntensity?: number };

interface MaterialBackup {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  emissive?: Color;
  emissiveIntensity?: number;
}

const materialsOf = (mesh: Mesh): StdMaterial[] =>
  (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as StdMaterial[];

/** First part under the pointer; in X-ray the faded tank does not hide what is inside it. */
function pickPart(hits: ThreeEvent<PointerEvent>["intersections"], xray: boolean): PartId | null {
  let tank: PartId | null = null;
  for (const hit of hits) {
    const part = hit.object.userData.partId as PartId | undefined;
    if (!part) continue;
    if (xray && part === "tank") {
      tank ??= part;
      continue;
    }
    return part;
  }
  return tank;
}

/**
 * The transformer: groups the meshes of `root` into parts by name prefix, clones materials so
 * tinting one part never affects another, adds the windings and core, and handles hover and X-ray.
 * `root` is built once and reused: replaying never rebuilds it.
 */
export default function TwinModel({ root }: { root: Object3D }) {
  const xray = useUi((s) => s.xray);
  // The part to light up: under the pointer on the model, or under the pointer in the panel list.
  const pointerPart = useUi((s) => s.hoveredPart);
  const listPart = useUi((s) => s.listHover);
  const hovered = pointerPart ?? listPart;
  const setHovered = useUi((s) => s.setHoveredPart);
  const focusPart = useUi((s) => s.focusPart);
  const apiRef = useTwinApi();
  const status = useTwinStatus();
  const reduceMotion = useRef(false);
  const lastMove = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => (reduceMotion.current = mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const model = useMemo(() => {
    root.updateWorldMatrix(true, true);
    const parts = Object.fromEntries(PART_IDS.map((p) => [p, [] as Mesh[]])) as Record<PartId, Mesh[]>;
    const backups = new Map<Material, MaterialBackup>();
    const outlines = new Map<Mesh, Mesh>();

    // StrictMode runs this twice on the same root: add the internals and clone materials once.
    const prepared = root.userData.twinPrepared === true;
    if (!prepared) {
      // Windings and core are sized from the tank body, before they are added to the scene.
      const tankBody = new Box3();
      root.traverse((o) => {
        if ((o as Mesh).isMesh && o.name.toLowerCase() === "tank") tankBody.expandByObject(o);
      });
      if (tankBody.isEmpty()) {
        root.traverse((o) => {
          if ((o as Mesh).isMesh && partOfMesh(o.name) === "tank") tankBody.expandByObject(o);
        });
      }
      if (!tankBody.isEmpty()) root.add(buildInternals(tankBody));
    }

    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || mesh.name.endsWith("__outline")) return;
      const part = (o.userData.partId as PartId | undefined) ?? partOfMesh(o.name);
      if (!part) return;
      o.userData.partId = part;
      // Per-part materials: the cached glTF materials are shared, so clone before changing them.
      if (!prepared) {
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : mesh.material.clone();
      }
      for (const m of materialsOf(mesh)) {
        backups.set(m, {
          transparent: m.transparent,
          opacity: m.opacity,
          depthWrite: m.depthWrite,
          emissive: m.emissive?.clone(),
          emissiveIntensity: m.emissiveIntensity,
        });
      }
      parts[part].push(mesh);
    });

    // Status outlines, built *after* the traversal above finishes: an inverted-hull shell per
    // mesh (same geometry, slightly scaled up, back faces only), added as a child so it always
    // matches the mesh's transform. Adding children while `root.traverse` is still walking the
    // tree makes it walk into the new nodes too (their name still starts with the part's mesh
    // prefix), so this has to happen in its own pass. Core stays grey and never needs one. On the
    // StrictMode re-run `prepared` is already true: reuse the child added on the first pass
    // instead of stacking a second shell on the same mesh.
    for (const part of PART_IDS) {
      if (part === "core") continue;
      for (const mesh of parts[part]) {
        const outlineName = `${mesh.name}__outline`;
        let outline = prepared ? (mesh.children.find((c) => c.name === outlineName) as Mesh | undefined) : undefined;
        if (!outline) {
          outline = new Mesh(
            mesh.geometry,
            new MeshBasicMaterial({
              color: OUTLINE_COLOUR.green,
              transparent: true,
              opacity: 0,
              depthWrite: false,
              side: BackSide,
            }),
          );
          outline.name = outlineName;
          outline.scale.setScalar(OUTLINE_SCALE);
          outline.visible = false;
          outline.raycast = () => {};
          mesh.add(outline);
        }
        outlines.set(mesh, outline);
      }
    }

    root.userData.twinPrepared = true;
    return {
      parts,
      backups,
      outlines,
      raycast: new Map(Object.values(parts).flat().map((m) => [m, m.raycast])),
    };
  }, [root]);

  useEffect(() => {
    apiRef.current = {
      partBox: (part) => {
        const meshes = model.parts[part].filter((m) => m.visible || part !== "core");
        if (meshes.length === 0) return null;
        const box = new Box3();
        for (const m of meshes) box.expandByObject(m);
        return box.isEmpty() ? null : box;
      },
      meshBoxes: (part) =>
        model.parts[part].map((m) => ({ name: m.name, box: new Box3().expandByObject(m) })).filter((x) => !x.box.isEmpty()),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, model]);

  // X-ray: tank (and its fittings) fade to ~15 %; windings and core appear.
  useEffect(() => {
    for (const m of model.parts.tank) {
      for (const mat of materialsOf(m)) {
        const b = model.backups.get(mat)!;
        mat.transparent = xray ? true : b.transparent;
        mat.opacity = xray ? XRAY_TANK_OPACITY : b.opacity;
        mat.depthWrite = xray ? false : b.depthWrite;
        mat.needsUpdate = true;
      }
    }
    for (const part of ["windings", "core"] as const) {
      for (const m of model.parts[part]) {
        m.visible = xray;
        // Hidden meshes must not take hover hits (the raycaster ignores `visible`).
        m.raycast = xray ? model.raycast.get(m)! : () => {};
        // The status outline (windings only; core has none) must hide with its mesh too.
        const outline = model.outlines.get(m);
        if (outline) outline.visible = xray && outline.userData.wantVisible === true;
      }
    }
    if (!xray && (useUi.getState().hoveredPart === "windings" || useUi.getState().hoveredPart === "core")) {
      setHovered(null);
    }
  }, [xray, model, setHovered]);

  // Status outline colour/opacity (FRONTEND_HANDOFF §15.4 "Look"): green/yellow/red only — grey
  // (NO DATA) and sensor-fault parts show no outline, just the ⓘ badge (PartBadges).
  useEffect(() => {
    for (const part of PART_IDS) {
      const st = status[part];
      const wantVisible = st.status === "green" || st.status === "yellow" || st.status === "red";
      for (const mesh of model.parts[part]) {
        const outline = model.outlines.get(mesh);
        if (!outline) continue;
        outline.userData.wantVisible = wantVisible;
        outline.visible = wantVisible && mesh.visible;
        if (wantVisible) {
          const mat = outline.material as MeshBasicMaterial;
          mat.color.set(OUTLINE_COLOUR[st.status as "green" | "yellow" | "red"]);
          mat.opacity = OUTLINE_OPACITY[st.status as "green" | "yellow" | "red"];
        }
      }
    }
  }, [status, model]);

  // CRITICAL parts pulse their outline opacity at 1 Hz; skipped under reduced motion.
  useFrame(({ clock }) => {
    const pulse = reduceMotion.current ? 1 : 0.55 + 0.45 * Math.sin(clock.elapsedTime * 2 * Math.PI);
    for (const part of PART_IDS) {
      if (status[part].status !== "red") continue;
      for (const mesh of model.parts[part]) {
        const outline = model.outlines.get(mesh);
        if (!outline?.visible) continue;
        (outline.material as MeshBasicMaterial).opacity = OUTLINE_OPACITY.red * pulse;
      }
    }
  });

  // Hover: lift the emissive of every material of the part, restore the rest.
  useEffect(() => {
    for (const part of PART_IDS) {
      for (const mesh of model.parts[part]) {
        for (const mat of materialsOf(mesh)) {
          if (!mat.emissive) continue;
          const b = model.backups.get(mat)!;
          if (part === hovered) {
            mat.emissive.copy(HOVER_EMISSIVE);
            mat.emissiveIntensity = 0.55;
          } else {
            mat.emissive.copy(b.emissive ?? mat.emissive);
            mat.emissiveIntensity = b.emissiveIntensity ?? 1;
          }
        }
      }
    }
  }, [hovered, model]);

  return (
    <primitive
      object={root}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        lastMove.current = performance.now();
        setHovered(pickPart(e.intersections, xray));
      }}
      // R3F also fires "leave" whenever the nearest child mesh changes, in the same event as the
      // move that follows. Only a leave with no move alongside it means the pointer left the model.
      onPointerLeave={() => {
        const at = performance.now();
        setTimeout(() => {
          if (Math.abs(lastMove.current - at) > 2) setHovered(null);
        }, 0);
      }}
      onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const part = pickPart(e.intersections as ThreeEvent<PointerEvent>["intersections"], xray);
        if (part) focusPart(part);
      }}
    />
  );
}
