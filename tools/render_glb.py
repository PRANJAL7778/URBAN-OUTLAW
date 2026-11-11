#!/usr/bin/env python3
"""CPU renderer for a skinned glTF, so the character/bike pose can actually be LOOKED at
without a GPU. Z-buffered triangles, optional skinning, optional base-colour textures,
simple 3-light shading. Writes a PNG.

    python3 render_glb.py out.png --view front --meshes outfit,haircut,AvatarHead ...
"""
import sys, json, struct, math, argparse
import numpy as np
from PIL import Image

# ---------------------------------------------------------------- glb / gltf
class GLTF:
    def __init__(self, path):
        self.raw = open(path, 'rb').read()
        clen, _ = struct.unpack('<II', self.raw[12:20])
        self.j = json.loads(self.raw[20:20 + clen].decode('utf-8'))
        off = 20 + clen
        blen, _ = struct.unpack('<II', self.raw[off:off + 8])
        self.bin = self.raw[off + 8: off + 8 + blen]
        self._arr = {}

    def acc(self, i):
        if i in self._arr: return self._arr[i]
        a = self.j['accessors'][i]
        bv = self.j['bufferViews'][a['bufferView']]
        comp = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a['componentType']]
        ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        count = a['count']
        stride = bv.get('byteStride')
        itemsize = np.dtype(comp).itemsize * ncomp
        if stride and stride != itemsize:
            out = np.zeros((count, ncomp), dtype=comp)
            for k in range(count):
                s = start + k * stride
                out[k] = np.frombuffer(self.bin, dtype=comp, count=ncomp, offset=s)
            arr = out
        else:
            arr = np.frombuffer(self.bin, dtype=comp, count=count * ncomp, offset=start).reshape(count, ncomp)
        if a.get('normalized') and comp != np.float32:
            arr = arr.astype(np.float32) / np.iinfo(comp).max
        arr = arr.astype(np.float32) if arr.dtype != np.float32 else arr
        self._arr[i] = arr
        return arr

    def image(self, i):
        im = self.j['images'][i]
        if 'bufferView' not in im: return None
        bv = self.j['bufferViews'][im['bufferView']]
        start = bv.get('byteOffset', 0); ln = bv['byteLength']
        try:
            from io import BytesIO
            return Image.open(BytesIO(self.bin[start:start + ln])).convert('RGB')
        except Exception:
            return None

# ---------------------------------------------------------------- math
def quat_to_mat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ], dtype=np.float64)

def trs(node):
    M = np.eye(4)
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
    t = np.array(node.get('translation', [0, 0, 0]), dtype=np.float64)
    r = np.array(node.get('rotation', [0, 0, 0, 1]), dtype=np.float64)
    s = np.array(node.get('scale', [1, 1, 1]), dtype=np.float64)
    R = quat_to_mat(r) * s[None, :]
    M[:3, :3] = R; M[:3, 3] = t
    return M

# ---------------------------------------------------------------- renderer
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('glb'); ap.add_argument('out')
    ap.add_argument('--view', default='front', choices=['front', 'side', 'q34', 'back', 'top'])
    ap.add_argument('--meshes', default='')          # substring allow-list
    ap.add_argument('--hide', default='')            # substring deny-list
    ap.add_argument('--size', default='560x760')
    ap.add_argument('--yaw', type=float, default=None)
    ap.add_argument('--pitch', type=float, default=None)
    ap.add_argument('--target', default='')          # x,y,z focus point
    ap.add_argument('--zoom', type=float, default=1.0)
    ap.add_argument('--fov', type=float, default=32.0)
    ap.add_argument('--flat', action='store_true')   # ignore textures, one colour per material
    ap.add_argument('--colours', default='')         # name=r,g,b;... overrides
    ap.add_argument('--islands', action='store_true')  # colour each connected component of the mesh differently
    ap.add_argument('--min-tris', type=int, default=0)
    a = ap.parse_args()

    g = GLTF(a.glb)
    j = g.j
    W, H = (int(v) for v in a.size.split('x'))
    allow = [s for s in a.meshes.split(',') if s]
    hide = [s for s in a.hide.split(',') if s]
    override = {}
    for part in a.colours.split(';'):
        if '=' in part:
            k, v = part.split('=')
            override[k] = np.array([float(t) for t in v.split(',')], dtype=np.float32)

    # node world matrices
    nodes = j['nodes']
    world = {}
    def walk(i, P):
        M = P @ trs(nodes[i])
        world[i] = M
        for c in nodes[i].get('children', []): walk(c, M)
    for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4))

    # mesh instances
    tris = []   # (v0,v1,v2, uv0,uv1,uv2, colour, tex)
    island_of = []
    for ni, n in enumerate(nodes):
        if 'mesh' not in n or ni not in world: continue
        mesh = j['meshes'][n['mesh']]
        name = mesh.get('name', '')
        if allow and not any(s in name for s in allow): continue
        if hide and any(s in name for s in hide): continue
        M = world[ni]
        for prim in mesh['primitives']:
            P = g.acc(prim['attributes']['POSITION']).astype(np.float64)
            P = P @ M[:3, :3].T + M[:3, 3]
            uv = g.acc(prim['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in prim['attributes'] else np.zeros((len(P), 2))
            idx = g.acc(prim['indices']).astype(np.int64).reshape(-1) if 'indices' in prim else np.arange(len(P))
            mat = j['materials'][prim.get('material', 0)]
            tex = None; col = np.array([0.7, 0.7, 0.7], dtype=np.float32)
            pbr = mat.get('pbrMetallicRoughness', {})
            if 'baseColorFactor' in pbr: col = np.array(pbr['baseColorFactor'][:3], dtype=np.float32)
            if not a.flat and 'baseColorTexture' in pbr:
                ti = pbr['baseColorTexture']['index']
                src = j['textures'][ti]['source']
                tex = g.image(src)
            for k, v in override.items():
                if k in name: col = v; tex = None
            if a.islands:
                idx3 = idx.reshape(-1, 3)
                parent = np.arange(len(P))
                def find(x):
                    while parent[x] != x:
                        parent[x] = parent[parent[x]]; x = parent[x]
                    return x
                for t in idx3:
                    ra, rb = find(t[0]), find(t[1])
                    if ra != rb: parent[rb] = ra
                    ra, rb = find(t[1]), find(t[2])
                    if ra != rb: parent[rb] = ra
                roots = np.array([find(i) for i in range(len(P))])
                ids = {r: n for n, r in enumerate(sorted(set(roots.tolist())))}
                PALETTE = np.array([[.95,.25,.25],[.25,.8,.95],[.95,.85,.25],[.35,.9,.4],[.85,.4,.95],[.95,.55,.2],
                                    [.4,.55,.95],[.2,.9,.75],[.9,.55,.7],[.6,.85,.3],[.75,.55,.35],[.55,.55,.6],
                                    [.9,.4,.55],[.3,.7,.55],[.85,.7,.55],[.5,.8,.85]], dtype=np.float32)
                for t in range(len(idx3)):
                    a0, b0, c0 = idx3[t]
                    r0 = int(roots[a0]); k = ids[r0] % len(PALETTE)
                    if (P[[a0, b0, c0]][:, 1].max() - 0) < 0: continue
                    sub = np.array([P[a0], P[b0], P[c0]])
                    if (sub.max(0) - sub.min(0)).max() <= 0 and a.min_tris == 0: pass
                    tris.append((np.array([P[a0], P[b0], P[c0]]), uv[[a0, b0, c0]], np.array([0, 1, 2]), PALETTE[k], None))
                    island_of.append(ids[r0])
                continue
            tris.append((P, uv, idx, col, tex))

    if not tris: print('nothing to draw'); return

    allP = np.concatenate([t[0] for t in tris])
    lo, hi = allP.min(0), allP.max(0)
    ctr = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2])
    if a.target:
        ctr = np.array([float(v) for v in a.target.split(',')])
    # "front" looks at the face: the character faces +Z, so the lens sits on +Z
    yaw = {'front': math.pi, 'back': 0.0, 'side': math.pi / 2, 'q34': math.pi - 0.72, 'top': math.pi - 0.4}[a.view]
    pitch = {'front': 0.02, 'back': 0.02, 'side': 0.02, 'q34': 0.06, 'top': 1.30}[a.view]
    if a.yaw is not None: yaw = a.yaw
    if a.pitch is not None: pitch = a.pitch
    D = np.array([math.sin(yaw) * math.cos(pitch), math.sin(pitch), math.cos(yaw) * math.cos(pitch)])
    D /= np.linalg.norm(D)
    f = D.copy()                       # view direction (from the lens towards the subject)
    up = np.array([0.0, 1.0, 0.0])
    rgt = np.cross(up, f); rgt /= np.linalg.norm(rgt)
    up2 = np.cross(f, rgt)
    # fit the requested span to the vertical field of view
    span = max(hi[1] - lo[1], (hi[0] - lo[0]) * H / W) / a.zoom
    fov = math.radians(a.fov)
    dist = (span * 0.5) / math.tan(fov / 2)
    eye = ctr - f * dist

    zbuf = np.full((H, W), 1e9, dtype=np.float64)
    color = np.zeros((H, W, 3), dtype=np.float32)
    bg = np.array([0.10, 0.12, 0.15], dtype=np.float32)
    color[:] = bg
    L1 = np.array([0.45, 0.75, 0.5]); L1 /= np.linalg.norm(L1)
    L2 = np.array([-0.5, 0.3, -0.6]); L2 /= np.linalg.norm(L2)


    def project(P):
        rel = P - eye
        x = rel @ rgt; y = rel @ up2; z = rel @ f
        z = np.maximum(z, 1e-4)
        fpx = (H / 2) / math.tan(fov / 2)
        sx = W / 2 + x / z * fpx
        sy = H / 2 - y / z * fpx
        return sx, sy, z

    for P, uv, idx, col, tex in tris:
        sx, sy, z = project(P)
        n = len(P)
        N = np.zeros((n, 3))
        T = P[idx].reshape(-1, 3, 3)
        fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
        ln = np.linalg.norm(fn, axis=1, keepdims=True); ln[ln == 0] = 1
        fn = fn / ln
        for t in range(len(idx) // 3):
            i0, i1, i2 = idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]
            x0, y0, z0 = sx[i0], sy[i0], z[i0]
            x1, y1, z1 = sx[i1], sy[i1], z[i1]
            x2, y2, z2 = sx[i2], sy[i2], z[i2]
            minx = max(int(min(x0, x1, x2)), 0); maxx = min(int(max(x0, x1, x2)) + 1, W)
            miny = max(int(min(y0, y1, y2)), 0); maxy = min(int(max(y0, y1, y2)) + 1, H)
            if minx >= maxx or miny >= maxy: continue
            den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(den) < 1e-12: continue
            xs = np.arange(minx, maxx) + 0.5
            ys = (np.arange(miny, maxy) + 0.5)[:, None]
            w0 = ((y1 - y2) * (xs[None, :] - x2) + (x2 - x1) * (ys - y2)) / den
            w1 = ((y2 - y0) * (xs[None, :] - x2) + (x0 - x2) * (ys - y2)) / den
            w2 = 1 - w0 - w1
            mask = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not mask.any(): continue
            zz = w0 * z0 + w1 * z1 + w2 * z2
            sub = zbuf[miny:maxy, minx:maxx]
            better = mask & (zz < sub)
            if not better.any(): continue
            base = col.copy()
            if tex is not None:
                u0, v0 = uv[i0]; u1, v1 = uv[i1]; u2, v2 = uv[i2]
                uu = w0 * u0 + w1 * u1 + w2 * u2
                vv = w0 * v0 + w1 * v1 + w2 * v2
                tw, th = tex.size
                tx = np.clip((uu * tw).astype(np.int32), 0, tw - 1)
                ty = np.clip(((1 - vv) * th).astype(np.int32), 0, th - 1)
                ta = np.asarray(tex, dtype=np.float32)[ty, tx] / 255.0
                base = ta[better]
            NN = fn[t]
            if NN[2] < 0: NN = -NN
            shade = 0.42 + 0.62 * max(0.0, float(NN @ L1)) + 0.28 * max(0.0, float(NN @ L2))
            sub[better] = zz[better]
            color[miny:maxy, minx:maxx][better] = np.clip(base * shade, 0, 1) if tex is not None else np.clip(base[None, :] * shade, 0, 1)

    Image.fromarray((np.clip(color, 0, 1) ** (1 / 1.05) * 255).astype(np.uint8)).save(a.out)
    print(f'wrote {a.out}  ({W}x{H})  bounds y {lo[1]:.3f}..{hi[1]:.3f}  x {lo[0]:.2f}..{hi[0]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}')

if __name__ == '__main__':
    main()
