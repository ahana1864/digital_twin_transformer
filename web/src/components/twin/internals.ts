import {
  type Box3,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from "three";

/** Thin horizontal stripes: a laminated steel look generated in code (no texture file). */
function laminationTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = "#aab2bc";
  g.fillRect(0, 0, 4, 16);
  g.fillStyle = "#7d8793";
  g.fillRect(0, 0, 4, 3);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, 14);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Windings (R/Y/B coils) and the laminated core, sized inside the tank bounds. Representative
 * shapes only: no real dimensions are implied (CLAUDE.md: no invented specs). Hidden until X-ray.
 */
export function buildInternals(tank: Box3): Group {
  const size = tank.getSize(new Vector3());
  const centre = tank.getCenter(new Vector3());
  const r = Math.min(size.x * 0.1, size.z * 0.3);
  const legX = [-0.26, 0, 0.26].map((k) => centre.x + k * size.x);
  const coilH = size.y * 0.42;
  const legH = Math.min(coilH * 1.25, size.y * 0.7);
  const yokeT = r * 0.8;

  const copper = new MeshStandardMaterial({ color: "#b7773c", metalness: 0.75, roughness: 0.35 });
  const steel = new MeshStandardMaterial({ map: laminationTexture(), metalness: 0.5, roughness: 0.5 });

  const group = new Group();
  group.name = "internals";
  const add = (mesh: Mesh, name: string, part: "windings" | "core") => {
    mesh.name = name;
    mesh.userData.partId = part;
    mesh.visible = false;
    group.add(mesh);
  };

  (["winding_r", "winding_y", "winding_b"] as const).forEach((name, i) => {
    const coil = new Mesh(new CylinderGeometry(r, r, coilH, 40), copper.clone());
    coil.position.set(legX[i], centre.y, centre.z);
    add(coil, name, "windings");
  });

  legX.forEach((x, i) => {
    const leg = new Mesh(new BoxGeometry(r * 1.1, legH, r * 1.1), steel.clone());
    leg.position.set(x, centre.y, centre.z);
    add(leg, `core_leg_${i + 1}`, "core");
  });
  const span = legX[2] - legX[0] + r * 1.1;
  for (const [k, sign] of [["top", 1], ["bottom", -1]] as const) {
    const yoke = new Mesh(new BoxGeometry(span, yokeT, r * 1.1), steel.clone());
    yoke.position.set(centre.x, centre.y + sign * (legH / 2 + yokeT / 2), centre.z);
    add(yoke, `core_yoke_${k}`, "core");
  }
  return group;
}
