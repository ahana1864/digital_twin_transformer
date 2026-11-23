import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "three";

/**
 * Primitive transformer with the same part ids as the .glb, used if the model fails to load
 * (FRONTEND_HANDOFF §15.2). Mesh names follow the same prefixes so `partOfMesh` maps them.
 * The internals (windings, core) are added by TwinModel, as for the real model.
 */
export function buildFallbackModel(): Group {
  const root = new Group();
  root.name = "fallback_transformer";
  const mat = (color: string) => new MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.1 });
  const add = (name: string, geo: BoxGeometry | CylinderGeometry, color: string, x: number, y: number, z: number) => {
    const m = new Mesh(geo, mat(color));
    m.name = name;
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };

  // Units are arbitrary: a representative shape, not to scale.
  add("tank", new BoxGeometry(3, 2.2, 2), "#b9c3cf", 0, 1.1, 0);
  const lid = add("tank_fitting_1", new BoxGeometry(3.1, 0.12, 2.1), "#c9d2dc", 0, 2.26, 0);
  lid.name = "tank_fitting_1";

  const cons = add("conservator", new CylinderGeometry(0.35, 0.35, 1.8, 28), "#aab4c0", -1.5, 3.1, 0);
  cons.rotation.z = Math.PI / 2;
  add("conservator_support", new BoxGeometry(0.1, 0.8, 0.1), "#aab4c0", -1.2, 2.6, 0).name = "tank_fitting_2";

  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1;
    add(`radiator_${i + 1}`, new BoxGeometry(0.28, 1.7, 1.0), "#c4ccd6", ((i % 3) - 1) * 0.9, 1.1, side * 1.45);
  }
  add("radiator_header_1", new BoxGeometry(2.8, 0.1, 0.1), "#c4ccd6", 0, 1.95, 1.45);
  add("radiator_header_2", new BoxGeometry(2.8, 0.1, 0.1), "#c4ccd6", 0, 0.25, -1.45);

  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.75;
    add(`bushing_hv_${i + 1}`, new CylinderGeometry(0.1, 0.16, 1.1, 20), "#d7dde5", x, 2.9, -0.45);
    add(`bushing_lv_${i + 1}`, new CylinderGeometry(0.08, 0.12, 0.8, 20), "#d7dde5", x, 2.75, 0.55);
    add(`bushing_base_${i + 1}`, new CylinderGeometry(0.2, 0.2, 0.1, 20), "#aab4c0", x, 2.37, -0.45);
    add(`bushing_base_${i + 4}`, new CylinderGeometry(0.16, 0.16, 0.1, 20), "#aab4c0", x, 2.37, 0.55);
  }
  return root;
}
