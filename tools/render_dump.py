#!/usr/bin/env python3
"""Render the pose dump written by tests/harness/rider_preview.mjs (CPU, no GPU)."""
import sys, json, gzip, math, argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('dump'); ap.add_argument('out')
ap.add_argument('--view', default='side')
ap.add_argument('--yaw', type=float, default=None)
ap.add_argument('--pitch', type=float, default=None)
ap.add_argument('--size', default='760x560')
ap.add_argument('--target', default='')
ap.add_argument('--zoom', type=float, default=1.0)
ap.add_argument('--fov', type=float, default=34)
ap.add_argument('--flat', action='store_true')
ap.add_argument('--colours', default='')   # src:name=r,g,b;...
a = ap.parse_args()

import os
if a.dump.endswith('.gz'):
    d = json.loads(gzip.open(a.dump).read().decode())
else:
    d = json.load(open(a.dump))
W, H = (int(v) for v in a.size.split('x'))
override = []   # list of (all-of-these-substrings, colour)
for part in a.colours.split(';'):
    if '=' in part:
        k, v = part.split('=', 1)
        override.append((k.split('&'), np.array([float(t) for t in v.split(',')], np.float32)))

tris = []
lo = np.array([1e9]*3); hi = np.array([-1e9]*3)
for m in d['meshes']:
    P = np.frombuffer(__import__('base64').b64decode(m['pos']), dtype=np.float32).reshape(-1, 3).astype(np.float64)
    UV = np.frombuffer(__import__('base64').b64decode(m['uv']), dtype=np.float32).reshape(-1, 2).astype(np.float64) if m.get('uv') else np.zeros((len(P), 2))
    I = np.frombuffer(__import__('base64').b64decode(m['idx']), dtype=np.uint32).reshape(-1)
    col = np.array([0.62, 0.64, 0.68], np.float32)
    if m['material'].startswith('markerSEAT'): col = np.array([0.15,1.0,0.30], np.float32)
    elif m['material'].startswith('markerGRIP'): col = np.array([1.0,0.25,0.15], np.float32)
    elif m['material'].startswith('markerPEG'): col = np.array([0.25,0.55,1.0], np.float32)
    key = m['src'] + ':' + m['material'] + ':' + m['name']
    for keys, v in override:
        if all(t in key for t in keys): col = v
    lo = np.minimum(lo, P.min(0)); hi = np.maximum(hi, P.max(0))
    tris.append((P, UV, I, col, m['name'], m['src']))

ctr = (lo + hi) / 2
if a.target: ctr = np.array([float(v) for v in a.target.split(',')])
yaw = {'side': math.pi/2, 'front': math.pi, 'back': 0.0, 'q34': math.pi-0.7, 'top': math.pi-0.3,
       'side2': -math.pi/2, 'q34b': 0.7}[a.view]
pitch = {'side': 0.06, 'front': 0.05, 'back': 0.05, 'q34': 0.10, 'top': 1.25, 'side2': 0.06, 'q34b': 0.10}[a.view]
if a.yaw is not None: yaw = a.yaw
if a.pitch is not None: pitch = a.pitch
D = np.array([math.sin(yaw)*math.cos(pitch), math.sin(pitch), math.cos(yaw)*math.cos(pitch)]); D /= np.linalg.norm(D)
f = D
rgt = np.cross(np.array([0.,1.,0.]), f); rgt /= np.linalg.norm(rgt)
up2 = np.cross(f, rgt)
span = max(hi[1]-lo[1], (hi[0]-lo[0])*H/W) / a.zoom
fov = math.radians(a.fov)
eye = ctr - f * ((span*0.5)/math.tan(fov/2))

zbuf = np.full((H, W), 1e9); color = np.tile(np.array([0.09,0.11,0.14], np.float32), (H, W, 1))
L1 = np.array([0.4,0.8,0.55]); L1 /= np.linalg.norm(L1)
L2 = np.array([-0.55,0.25,-0.6]); L2 /= np.linalg.norm(L2)
fpx = (H/2)/math.tan(fov/2)

for P, UV, I, col, name, src in tris:
    rel = P - eye
    x = rel @ rgt; y = rel @ up2; z = rel @ f
    z = np.maximum(z, 1e-4)
    sx = W/2 + x/z*fpx; sy = H/2 - y/z*fpx
    T = P[I.reshape(-1,3)].reshape(-1,3,3)
    fn = np.cross(T[:,1]-T[:,0], T[:,2]-T[:,0])
    ln = np.linalg.norm(fn, axis=1, keepdims=True); ln[ln==0]=1; fn = fn/ln
    for t in range(len(I)//3):
        i0,i1,i2 = I[3*t], I[3*t+1], I[3*t+2]
        X = np.array([sx[i0],sx[i1],sx[i2]]); Y = np.array([sy[i0],sy[i1],sy[i2]]); Z = np.array([z[i0],z[i1],z[i2]])
        minx=max(int(X.min()),0); maxx=min(int(X.max())+1,W); miny=max(int(Y.min()),0); maxy=min(int(Y.max())+1,H)
        if minx>=maxx or miny>=maxy: continue
        den = (Y[1]-Y[2])*(X[0]-X[2]) + (X[2]-X[1])*(Y[0]-Y[2])
        if abs(den) < 1e-12: continue
        xs = np.arange(minx,maxx)+0.5; ys = (np.arange(miny,maxy)+0.5)[:,None]
        w0 = ((Y[1]-Y[2])*(xs[None,:]-X[2]) + (X[2]-X[1])*(ys-Y[2]))/den
        w1 = ((Y[2]-Y[0])*(xs[None,:]-X[2]) + (X[0]-X[2])*(ys-Y[2]))/den
        w2 = 1-w0-w1
        mask = (w0>=0)&(w1>=0)&(w2>=0)
        if not mask.any(): continue
        zz = w0*Z[0]+w1*Z[1]+w2*Z[2]
        sub = zbuf[miny:maxy, minx:maxx]; better = mask & (zz < sub)
        if not better.any(): continue
        NN = fn[t]
        if NN[2] < 0: NN = -NN
        shade = 0.40 + 0.60*max(0.0,float(NN@L1)) + 0.30*max(0.0,float(NN@L2))
        sub[better] = zz[better]
        color[miny:maxy, minx:maxx][better] = np.clip(col*shade, 0, 1)
Image.fromarray((np.clip(color,0,1)**(1/1.05)*255).astype(np.uint8)).save(a.out)
print(f'wrote {a.out} ({W}x{H}) · bounds x[{lo[0]:.2f},{hi[0]:.2f}] y[{lo[1]:.2f},{hi[1]:.2f}] z[{lo[2]:.2f},{hi[2]:.2f}]')
