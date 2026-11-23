"""Split the Sketchfab transformer GLB into named, separately pickable meshes.
Keeps the original vertex buffers, textures and materials; only adds per-part index
accessors. Usage: python split_glb.py input.glb output.glb"""
import sys, json, struct
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

src, dst = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read()
jlen, _ = struct.unpack('<II', raw[12:20]); g = json.loads(raw[20:20+jlen])
off = 20 + jlen; blen, _ = struct.unpack('<II', raw[off:off+8]); binbuf = bytearray(raw[off+8:off+8+blen])

CT = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def read_acc(i):
    a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]
    n, dt = NC[a['type']], CT[a['componentType']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', 0) or n*np.dtype(dt).itemsize
    if stride == n*np.dtype(dt).itemsize:
        return np.frombuffer(binbuf, dt, a['count']*n, start).reshape(a['count'], n)
    rows = [np.frombuffer(binbuf, dt, n, start+k*stride) for k in range(a['count'])]
    return np.array(rows)

def local(nd):
    if 'matrix' in nd: return np.array(nd['matrix']).reshape(4, 4).T
    T = np.eye(4); T[:3, 3] = nd.get('translation', [0, 0, 0])
    x, y, z, w = nd.get('rotation', [0, 0, 0, 1])
    R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                  [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                  [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    S = np.diag(nd.get('scale', [1, 1, 1])); M = np.eye(4); M[:3, :3] = R @ S
    return T @ M

parent = {c: i for i, n in enumerate(g['nodes']) for c in n.get('children', [])}
def world(i):
    M = local(g['nodes'][i])
    while i in parent: i = parent[i]; M = local(g['nodes'][i]) @ M
    return M

def classify(c, s, src_mesh):
    x, y, z = c; sx, sy, sz = s
    if y > 3.3 and sy > 1.0 and sx < 0.5:                return 'bushing'
    if 2.6 < y < 3.3 and sx < 0.6 and sz < 0.8 and abs(z) > 0.4: return 'bushing_base'
    if 1.0 < y < 2.6 and sx > 2.0 and sy > 1.5 and abs(z) > 0.9: return 'radiator_header'
    if 1.2 < y < 2.6 and sy > 1.5 and abs(z) > 1.2:      return 'radiator'
    if abs(z) > 1.2 and sy < 0.4:                        return 'radiator_pipe'
    if x < -2.0 and y > 2.4:                             return 'conservator'
    if sx > 4.0 and sy > 2.0:                            return 'tank'
    return 'tank_fitting'

new_meshes, plan = [], []
for ni, nd in enumerate(list(g['nodes'])):
    if 'mesh' not in nd: continue
    M = world(ni); mesh = g['meshes'][nd['mesh']]
    for prim in mesh['primitives']:
        P = read_acc(prim['attributes']['POSITION']).astype(float)
        I = read_acc(prim['indices']).reshape(-1, 3).astype(np.int64)
        W = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3]
        u, inv = np.unique(np.round(W, 4), axis=0, return_inverse=True); inv = inv.ravel()
        F = inv[I]; n = len(u)
        r = np.r_[F[:, 0], F[:, 1]]; c = np.r_[F[:, 1], F[:, 2]]
        k, lab = connected_components(coo_matrix((np.ones(len(r)), (r, c)), shape=(n, n)), directed=False)
        fl = lab[F[:, 0]]
        for comp in range(k):
            sel = I[fl == comp]
            if len(sel) == 0: continue
            pts = W[np.unique(sel)]
            plan.append((ni, prim, classify(pts.mean(0), np.ptp(pts, 0), nd['mesh']), pts.mean(0), sel))

# deterministic, readable names
order = {'bushing': lambda p: (-round(p[3][2],1), round(p[3][0],2)), 'bushing_base': lambda p: (-round(p[3][2],1), round(p[3][0],2)),
         'radiator': lambda p: (-round(p[3][2],1), round(p[3][0],2))}
named = []
for kind in ['tank', 'conservator', 'bushing', 'bushing_base', 'radiator', 'radiator_header', 'radiator_pipe', 'tank_fitting']:
    items = [p for p in plan if p[2] == kind]
    items.sort(key=order.get(kind, lambda p: tuple(p[3])))
    if kind == 'bushing':
        for j, p in enumerate(items):
            row = 'hv' if p[3][2] > 0 else 'lv'
            idx = sum(1 for q in items[:j+1] if (q[3][2] > 0) == (p[3][2] > 0))
            named.append((f'bushing_{row}_{idx}', p))
    elif kind == 'conservator':
        # merge all conservator pieces into one mesh
        sel = np.vstack([p[4] for p in items]); named.append(('conservator', (items[0][0], items[0][1], kind, None, sel)))
    elif kind == 'tank':
        sel = np.vstack([p[4] for p in items]); named.append(('tank', (items[0][0], items[0][1], kind, None, sel)))
    elif kind == 'tank_fitting':
        if items:
            # group fittings per source primitive so materials stay correct
            by = {}
            for p in items: by.setdefault((p[0], id(p[1])), []).append(p)
            for j, grp in enumerate(by.values(), 1):
                named.append((f'tank_fitting_{j}', (grp[0][0], grp[0][1], kind, None, np.vstack([p[4] for p in grp]))))
    else:
        for j, p in enumerate(items, 1): named.append((f'{kind}_{j}', p))

# write new index accessors
def pad4(b):
    while len(b) % 4: b.append(0)
src_mesh_nodes = sorted({p[0] for _, p in named})
new_children = {}
for name, (ni, prim, kind, _, sel) in named:
    pad4(binbuf); data = sel.astype(np.uint32).ravel().tobytes()
    g['bufferViews'].append({'buffer': 0, 'byteOffset': len(binbuf), 'byteLength': len(data), 'target': 34963})
    binbuf += data
    g['accessors'].append({'bufferView': len(g['bufferViews'])-1, 'componentType': 5125,
                           'count': int(sel.size), 'type': 'SCALAR'})
    p2 = {k: v for k, v in prim.items() if k != 'indices'}; p2['indices'] = len(g['accessors'])-1
    g['meshes'].append({'name': name, 'primitives': [p2]})
    g['nodes'].append({'name': name, 'mesh': len(g['meshes'])-1})
    new_children.setdefault(ni, []).append(len(g['nodes'])-1)
for ni, kids in new_children.items():
    nd = g['nodes'][ni]; nd.pop('mesh'); nd['name'] = nd.get('name', '') + '_parts'
    nd['children'] = nd.get('children', []) + kids
pad4(binbuf); g['buffers'][0]['byteLength'] = len(binbuf)
g['asset'].setdefault('extras', {})['note'] = 'Split into named parts for PowerNext dashboard (split_glb.py)'

js = json.dumps(g, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out = struct.pack('<4sII', b'glTF', 2, 12+8+len(js)+8+len(binbuf)) + struct.pack('<II', len(js), 0x4E4F534A) + js \
      + struct.pack('<II', len(binbuf), 0x004E4942) + bytes(binbuf)
open(dst, 'wb').write(out)
from collections import Counter
print('parts written:', len(named)); print(sorted(n for n, _ in named))
