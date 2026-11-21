"""Checks the tablet mount model against block models of the tablet, the plug and the cable.

Run:  python check.py     (after mount.py; needs CadQuery and numpy)
It does not replace a test print: it proves the model is consistent with the
dimensions written in mount.py, nothing more.
"""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import cadquery as cq
import numpy as np

import mount as m

p = m.P()
V = cq.Vector
results: list[tuple[str, bool, str]] = []
EPS = 1e-4  # mm^3


def record(name: str, ok: bool, detail: str) -> None:
    ok = bool(ok)
    results.append((name, ok, detail))
    print(("PASS  " if ok else "FAIL  ") + name + "  ->  " + detail)


def overlap(a: cq.Shape, b) -> float:
    """Shared volume of a and b; b may be a list."""
    total = 0.0
    for x in (b if isinstance(b, (list, tuple)) else [b]):
        total += a.intersect(x).Volume()
    return total


def moved(s: cq.Shape, dx=0.0, dy=0.0, dz=0.0) -> cq.Shape:
    return s.translate(V(dx, dy, dz))


W, H, T, s_ = p.tab_w, p.tab_h, p.tab_t, p.s
NAMES = {"tl": "top-left", "tr": "top-right", "bl": "bottom-left", "br": "bottom-right"}
halves = [m.make_back(p, "left"), m.make_back(p, "right")]
back = m.make_back(p, "one")
back_bare = m.make_back(p, "one", springs=False)                 # without the spring bumps, which move out of the tablet's way
back_plain = m.make_back(p, "one", springs=False, beads=False)   # and without the beads the frame clicks over
frame = {c: m.make_frame(p, c) for c in m.CORNERS}
frame_plain = {c: m.make_frame(p, c, lips=False) for c in m.CORNERS}
lower = [frame["bl"], frame["br"]]
RADII = (6.0, 10.0, 14.0)                                        # corner radii tried: the real one is not published
tab = m.make_tablet(p)

# ---- 1. the parts themselves
for name, fn in {**m.PARTS, **m.EXTRA}.items():
    shape = fn(p)
    record(f"{name} is one solid", shape.isValid() and len(shape.Solids()) == 1, f"{shape.Volume() / 1000:.1f} cm3, {shape.Volume() * 1.27 / 1000:.0f} g in PETG")
record("the two halves of the sheet fit together", overlap(halves[0], halves[1]) < EPS,
       f"butted, with {p.key_fit} mm around {len(p.key_y)} dovetail keys")
record("the keys hold the halves together in the sheet's plane",
       all(overlap(halves[0], moved(halves[1], dx, dy)) > EPS for dx, dy in ((0.4, 0), (0, 0.4), (0, -0.4))),
       "pulled apart or slid by 0.4 mm they collide")

# ---- 2. the tablet on the sheet
worst = max(overlap(m.make_tablet(p, r=r, dx=dx), back_bare) for r in RADII for dx in (0.0, -p.gap_left / 2, -p.gap_left))
record("tablet sits on the sheet without touching anything it should not", worst < EPS,
       f"corner radii {RADII}, anywhere between the right stop and the left one")
behind = back.intersect(m.box(p.land_w + 0.2, W - p.land_w - 0.2, 0.2, H - 0.2, p.plate_t + 0.02, s_ + T)).Volume()
record("only the two lands touch the tablet's back", behind < EPS and overlap(moved(tab, dz=-0.1), back_bare) > 1.0,
       f"everything else behind it is flush with the sheet, {p.land_h} mm back")
record("tablet stands on the two feet", overlap(moved(tab, dy=-0.2), back_bare) > 1.0 and
       back_bare.intersect(m.box(0, W, -0.5, -0.01, s_, s_ + T)).Volume() > 1.0, f"each {p.foot_reach - p.foot_in:.0f} mm long, {p.foot_in:.0f} mm in from the corners")
record("right edge rests on the datum ribs", overlap(moved(tab, dx=0.2), back_bare) > 0.5, "two ribs, one below the plug and one above")
record("left stops limit the springs' travel", overlap(moved(tab, dx=-p.gap_left - 0.2), back_bare) > 0.5
       and overlap(moved(tab, dx=-p.gap_left + 0.05), back_bare) < EPS, f"{p.gap_left} mm of travel")
bite = tab.intersect(back)
bb = bite.BoundingBox()
record("springs press the tablet against the datum", abs(bb.xmax - p.spring_pre) < 0.05 and bite.Volume() > 1.0,
       f"{len(p.spring_y)} bumps stand {bb.xmax:.2f} mm into the tablet's place when free")
record("springs have room to move back", p.spring_room >= p.spring_pre + p.gap_left + 0.4 and p.bump_lead >= p.spring_pre + p.gap_left,
       f"{p.spring_room} mm behind them for {p.spring_pre + p.gap_left} mm of travel")

E = 2000.0                                              # MPa, printed PETG along the strands


def beam(L, t, b):
    """A strip fixed at both ends, loaded at its middle: stiffness (N/mm) and stress (MPa) at a deflection d."""
    I = b * t ** 3 / 12
    k = 192 * E * I / L ** 3
    return k, lambda d: (k * d * L / 8) * (t / 2) / I + E * 2.47 * (d / L) ** 2      # bending plus stretching


k_sp, st_sp = beam(p.spring_len, p.spring_t, p.spring_h)
record("spring force and stress are modest", 0.5 < k_sp * p.spring_pre < 3.0 and st_sp(p.spring_pre) < 10 and st_sp(p.spring_pre + p.gap_left) < 30,
       f"{k_sp * p.spring_pre:.1f} N each when seated at {st_sp(p.spring_pre):.0f} MPa; {st_sp(p.spring_pre + p.gap_left):.0f} MPa pushed right back")

# ---- 3. sliding the tablet in from the top, with the lower frame pieces on
steps = (0.0, 1.0, 5.0, 15.0, 30.0, 35.0, 37.0, 45.0, 80.0, 130.0, 175.0)
worst = max(overlap(m.make_tablet(p, r=r, dx=dx, dy=dy), [back_bare] + lower)
            for r in (6.0, 14.0) for dx in (0.0, -p.gap_left) for dy in steps)
start = p.seam_y + 1.0                                   # bottom edge just above the lower pieces
laid = max(overlap(m.make_tablet(p, dx=dx, dy=start).translate(V(0, 0, dz)), [back_bare] + lower)
           for dx in (0.0, -p.gap_left) for dz in (0.0, 1.0, 3.0, 8.0, 20.0))
record("tablet slides in from the top behind the lower pieces", worst < EPS and laid < EPS,
       f"checked at {len(steps)} heights, against either side stop; laid in from the front it needs {start + H - p.fy1:.0f} mm free above the frame")
cams = [(20.0, H - 14.0), (W - 20.0, H - 14.0), (40.0, H - 25.0), (W - 40.0, H - 25.0), (W / 2, H - 12.0)]
worst = max(overlap(m.make_tablet(p, dx=dx, dy=dy, cam=(cx, cy, 14.0, 1.2)), [back_bare] + lower)
            for cx, cy in cams for dx in (0.0, -p.gap_left) for dy in (0.0, 20.0, 60.0, 120.0, 175.0))
record("a camera ring 1.2 mm proud clears the sheet all the way in", worst < EPS, f"14 mm ring tried at {len(cams)} places along the top")

# ---- 4. the frame on the sheet
pieces = list(frame.values())
worst = max(overlap(frame[c], halves) for c in m.CORNERS)
record("frame pieces sit on the sheet without collision", worst < EPS, f"{p.edge_clear} mm between the sheet's edge and the frame's wall")
seams = sum(overlap(frame[a], frame[b]) for i, a in enumerate(m.CORNERS) for b in m.CORNERS[i + 1:])
record("frame pieces do not collide with each other", seams < EPS, f"{p.seam_gap} mm seams")
worst = max(overlap(m.make_tablet(p, r=r, dx=dx), pieces) for r in RADII for dx in (0.0, -p.gap_left))
record("frame closes over the seated tablet without touching it", worst < EPS, f"{p.z_clear} mm above the glass")
hold = [overlap(moved(tab, dx=-p.gap_left, dz=p.z_clear + 0.2), frame[c]) for c in m.CORNERS]
record("frame holds the tablet in on all four sides", min(hold) > 0.5,
       f"{p.lip} mm over the glass, {p.lip - p.gap_left:.1f} mm at worst on the right; {p.lip_cam} mm at the front camera")
up = 0.8
record("a sheet that prints short still takes the upper pieces", overlap(moved(tab, dy=up), [frame["tl"], frame["tr"]]) < EPS,
       f"{up} mm of room above the tablet's top edge ({100 * up / H:.2f} %), {p.gap_left} mm beside it ({100 * p.gap_left / W:.2f} %)")

# snaps
for c in m.CORNERS:
    mine = [(e, t) for e, t, who in m.snaps(p) if who == c]
    zones = [m.edge_box(p, e, t - 9, t + 9, -2.0, 1.0, -1, 3) for e, t in mine]
    lifted = moved(frame[c], dz=p.flank_gap + 0.25)
    caught = [lifted.intersect(back).intersect(z).Volume() for z in zones]
    record(f"{NAMES[c]} piece is caught by every one of its snaps", overlap(frame[c], back) < EPS and min(caught) > 0.01,
           f"{len(mine)} snaps, each lip {p.catch} mm under its bead")
worst = max(overlap(moved(frame[c], dz=dz), back_plain) for c in m.CORNERS for dz in (0.0, 0.5, 1.0, 2.0, 5.0, 12.0))
record("only the beads stand in the lips' way", worst < EPS, "pressed on straight, nothing else touches")
worst = max(overlap(moved(frame[c], dz=dz), back) for c in m.CORNERS for dz in (2.0, 5.0, 12.0))
record("lips are clear of the beads from 2 mm out", worst < EPS, "the click happens over the last 1.6 mm")
k_sn, st_sn = beam(p.snap_len, p.snap_t, p.plate_t)
F = k_sn * p.catch
mu = 0.3
pull = F * (1 + mu) / (1 - mu)
record("snap strips flex without yielding", st_sn(p.catch) < 35 and 2.0 < pull < 12.0,
       f"{p.catch} mm of flex at {st_sn(p.catch):.0f} MPa; about {pull:.0f} N to click each snap on or off, {len(m.snaps(p))} snaps")

# pins
for c in m.CORNERS:
    seated = overlap(frame_plain[c], back_plain)
    shoved = [overlap(moved(frame_plain[c], dx, dy), back_plain) for dx, dy in ((0.25, 0), (-0.25, 0), (0, 0.25), (0, -0.25))]
    n = sum(1 for who, *_ in m.pins(p) if who == c) + sum(1 for *_, who in m.epins(p) if who == c)
    seats = overlap(moved(frame_plain[c], dz=-p.seat_gap - 0.05), back_plain) > EPS
    record(f"{NAMES[c]} piece is located by its pins", seated < EPS and min(shoved) > EPS and seats,
           f"{n} pins; it cannot shift 0.25 mm in any direction, and their pads seat it on the sheet")
for edge, t0, t1, c in m.epins(p):
    out = 0.25 if edge == "T" else -0.25
    zone = m.edge_box(p, edge, t0 - 1, t1 + 1, -4.0, 1.0, -1, 3)
    held = moved(frame_plain[c], dy=out).intersect(back_plain).intersect(zone).Volume()
    if held < EPS:
        break
record("thin pins keep the top and bottom walls from bowing out", held > EPS, f"{len(m.epins(p))} pins, {p.epin[0]:.0f} mm from the middle seam")

# pry points
ok = True
for edge, t0, t1, c in m.prys(p):
    tc = (t0 + t1) / 2
    tip = m.edge_box(p, edge, tc - 2.5, tc + 2.5, -p.pry_in + 0.2, 6.0, p.pry_ledge + 0.05, p.pry_ledge + 1.05)
    under = m.edge_box(p, edge, tc - 2.5, tc + 2.5, -p.pry_in + 0.2, -0.2, 0.1, p.pry_ledge - 0.1)
    ok &= overlap(tip, [back] + pieces) < EPS and abs(under.intersect(back).Volume() - under.Volume()) < 1e-3
record("a 5 x 1 mm screwdriver tip reaches every pry ledge", ok, f"{len(m.prys(p))} slots, {p.pry[1] - p.pry[0]:.0f} x {p.pry_h} mm")

# screws
k41 = math.tan(math.radians(41))
below6 = (p.screw_head - 7.09) / 2 / k41
proud8 = (8.4 - p.screw_head) / 2 / k41
holes = m.screw_holes(p)
plug_holes = sum(back.intersect(cq.Solid.makeCylinder(p.screw_d / 2 - 0.05, 5, V(x, y, -1), V(0, 0, 1))).Volume() for x, y in holes)
head = lambda x, y: cq.Solid.makeCylinder(p.screw_head / 2 + 2.0, 3.0, V(x, y, p.plate_t + 0.02), V(0, 0, 1))
free = sum(overlap(head(x, y), [back] + pieces) for x, y in holes)
record("screw heads sit flush", plug_holes < EPS and free < EPS and 0 <= below6 <= 0.4 and p.plate_t + proud8 < s_ - 0.8,
       f"{len(holes)} holes; a #6 flat head ends {below6:.1f} mm below the sheet's face, a #8 would stand {proud8:.1f} mm proud, still {s_ - p.plate_t - proud8:.1f} mm behind the tablet")

# ---- 5. plug and cable
everything = [back_bare] + pieces
fits = [dy for dy in range(-30, 21) if overlap(m.make_plug(p, dy=float(dy)), everything) < EPS]
lo = hi = 0
while lo - 1 in fits: lo -= 1
while hi + 1 in fits: hi += 1
record("plug and cable fit inside the right side", 0 in fits and lo <= -8 and hi >= 8,
       f"port between {p.port_y + lo:.0f} and {p.port_y + hi:.0f} mm above the bottom edge (drawn at {p.port_y})")
big = dict(reach=12.5, t=7.2, down=22.0)
record("a bulkier plug fits too", max(overlap(m.make_plug(p, dy=dy, **big), everything) for dy in (-5.0, 0.0, 5.0)) < EPS,
       f"{big['reach']} mm out from the edge, {big['t']} mm thick, {big['down']:.0f} mm long below the port")
way = [back_bare, frame["bl"], frame["br"], frame["tl"], tab]
worst = max(overlap(m.make_plug(p, out=o, dy=dy, cable=False), way) for o in (0.0, 3.0, 6.0, 9.0) for dy in (-8.0, 0.0, 8.0))
record("plug goes in from the side with the top-right piece off", worst < EPS, "9 mm of travel checked; the cable bends out of the way")
worst = max(overlap(moved(frame_plain["tr"], dz=dz), [m.make_plug(p), m.make_plug(p, **big), tab]) for dz in (0.0, 2.0, 6.0, 12.0))
record("top-right piece goes on over the plug", worst < EPS, f"{p.z_lip - (p.zc + p.plug_t / 2):.2f} mm above a {p.plug_t} mm plug")

# ---- 6. each part prints without supports
def overhangs(shape: cq.Shape):
    """Every downward face steeper than 45 degrees that is not on the bed: (angle, area, face)."""
    found = {}
    for fi, face in enumerate(shape.Faces()):
        verts, tris = face.tessellate(0.01, 0.1)
        v = np.array([(a.x, a.y, a.z) for a in verts])
        for i, j, k_ in tris:
            a, b_, c = v[i], v[j], v[k_]
            area = np.linalg.norm(np.cross(b_ - a, c - a)) / 2
            if area < 1e-9 or min(a[2], b_[2], c[2]) <= 0.01:
                continue
            n = face.normalAt(V(*((a + b_ + c) / 3)))
            if n.z >= -1e-6:
                continue
            angle = float(np.degrees(np.arcsin(min(1.0, -n.z))))
            if angle > 45.01:
                rec = found.setdefault(fi, [angle, 0.0, face])
                rec[0] = max(rec[0], angle); rec[1] += area
    return list(found.values())


def bridge(shape: cq.Shape, face: cq.Face):
    """A flat ceiling: the shortest span across it that stands on material at both ends (None if neither way does),
    and its narrow width."""
    bb = face.BoundingBox()
    z, dx, dy = bb.zmin, bb.xlen, bb.ylen
    ax, ay = min(dx * 0.2, 1.0), min(dy * 0.2, 1.0)
    along_x = [m.box(bb.xmin - 0.4, bb.xmin - 0.05, bb.ymin + ay, bb.ymax - ay, z - 0.5, z - 0.05),
               m.box(bb.xmax + 0.05, bb.xmax + 0.4, bb.ymin + ay, bb.ymax - ay, z - 0.5, z - 0.05)]
    along_y = [m.box(bb.xmin + ax, bb.xmax - ax, bb.ymin - 0.4, bb.ymin - 0.05, z - 0.5, z - 0.05),
               m.box(bb.xmin + ax, bb.xmax - ax, bb.ymax + 0.05, bb.ymax + 0.4, z - 0.5, z - 0.05)]
    spans = [span for span, ends in ((dx, along_x), (dy, along_y))
             if all(e.intersect(shape).Volume() / e.Volume() > 0.8 for e in ends)]
    return (min(spans) if spans else None), min(dx, dy)


BED = 180.0
for name, fn in {**m.PARTS, **m.EXTRA}.items():
    shape = fn(p)
    bb = shape.BoundingBox()
    if name in m.PARTS:
        record(f"{name} fits a {BED:.0f} mm bed", max(bb.xlen, bb.ylen) <= BED - 6, f"{bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm as printed")
    spans, bad = [], 0.0
    for angle, area, face in overhangs(shape):
        if angle > 89.9:
            span, narrow = bridge(shape, face)
            if span is not None and span <= 10.01:
                spans.append(span); continue
        bad += area
    detail = f"{len(spans)} bridges, longest {max(spans):.1f} mm" if spans else "no bridges"
    record(f"{name} prints without supports", bad < 0.01, detail + f"; {bad:.2f} mm2 of overhang beyond 45 degrees")

# ---- 7. exported meshes are closed
def stl_check(path: Path):
    data = path.read_bytes()
    n = struct.unpack("<I", data[80:84])[0]
    if 84 + 50 * n != len(data):                      # ASCII STL
        pts = np.array([[float(x) for x in ln.split()[1:4]] for ln in data.decode().splitlines()
                        if ln.strip().startswith("vertex")]).reshape(-1, 3, 3)
    else:
        rec = np.frombuffer(data, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), offset=84, count=n)
        pts = rec["v"].astype(float)
    key = np.round(pts.reshape(-1, 3), 4)
    _, idx = np.unique(key, axis=0, return_inverse=True)
    f = idx.reshape(-1, 3)
    edges = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    und = np.sort(edges, axis=1)
    _, counts = np.unique(und, axis=0, return_counts=True)
    _, dcounts = np.unique(edges, axis=0, return_counts=True)
    vol = abs(np.einsum("ij,ij->i", pts[:, 0], np.cross(pts[:, 1], pts[:, 2])).sum() / 6)
    return len(f), bool((counts == 2).all()), bool((dcounts == 1).all()), vol, pts.reshape(-1, 3).min(0), pts.reshape(-1, 3).max(0)


out = Path(__file__).parent / "print"
for name, fn in {**m.PARTS, **m.EXTRA}.items():
    path = out / f"{name}.stl"
    if not path.exists():
        record(f"{name}.stl exists", False, "run mount.py first")
        continue
    ntri, closed, oriented, vol, lo_, hi_ = stl_check(path)
    size = hi_ - lo_
    record(f"{name}.stl is a closed, consistently oriented mesh", closed and oriented and abs(vol - fn(p).Volume()) < 1.0,
           f"{ntri} triangles, {vol / 1000:.1f} cm3, {size[0]:.1f} x {size[1]:.1f} x {size[2]:.1f} mm, lowest point z={lo_[2]:.2f}")

failed = [r for r in results if not r[1]]
(out / "check-results.json").write_text(json.dumps(
    {"mounted_mm": [round(p.width, 1), round(p.height, 1), round(p.depth, 1)],
     "checks": [{"name": n, "pass": ok, "detail": d} for n, ok, d in results]}, indent=2))
print(f"\n{len(results) - len(failed)} of {len(results)} checks passed")
sys.exit(1 if failed else 0)
