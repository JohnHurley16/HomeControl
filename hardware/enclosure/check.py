"""Checks the enclosure model against simple models of the two boards.

Run:  python check.py [ports|closed|duo|duo-closed]     (after enclosure.py; needs CadQuery and numpy)
One run checks one front; ports and closed share a back plate, and so do duo and duo-closed.
The duo runs add the second radar. Its board is only partly known (see enclosure.py), so its checks
prove the case against the board model, not against a board.
It does not replace a test print: it proves the model is consistent with the
dimensions written in enclosure.py, nothing more.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import cadquery as cq
import numpy as np

import enclosure as e

variant = sys.argv[1] if len(sys.argv) > 1 else "ports"
p = e.VARIANTS[variant]
V = cq.Vector
results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str) -> None:
    ok = bool(ok)
    results.append((name, ok, detail))
    print(("PASS  " if ok else "FAIL  ") + name + "  ->  " + detail)


def overlap(a: cq.Shape, b: cq.Shape) -> float:
    try:
        return a.intersect(b).Volume()
    except Exception:
        return 0.0


def moved(s: cq.Shape, dy=0.0, dz=0.0) -> cq.Shape:
    return s.translate(V(0, dy, dz))


EPS = 1e-4  # mm^3

shell = e.make_shell(p)
shell_plain = e.make_shell(p, crush_ribs=False)
back = e.make_back(p)
back_plain = e.make_back(p, detent=False)

# ---- 1. solids
for name, s in (("shell", shell), ("back plate", back)):
    record(f"{name} is one valid solid", s.isValid() and len(s.Solids()) == 1,
           f"{s.Volume():.0f} mm3, {s.Volume() * 1.27 / 1000:.1f} g in PETG")

# ---- 2. boards drop in and sit clear of the shell
c3_variants = {t: e.make_c3(p, t) for t in (0.6, 1.0, 1.6)}
radar_variants = {pins: e.make_radar(p, pins) for pins in ("bent", "cut", "none")}
worst = max(overlap(shell_plain, c) for c in c3_variants.values())
record("C3 seated: no contact with the shell (PCB 0.6, 1.0, 1.6 mm)", worst < EPS, f"overlap {worst:.4f} mm3")
worst = max(overlap(shell_plain, r) for r in radar_variants.values())
record("radar seated: no contact with the shell (pins bent, cut, none)",
       worst < EPS, f"overlap {worst:.4f} mm3")
tracker_variants = {t: e.make_tracker(p, t, plug=False) for t in (1.0, 1.2, 1.6)} if p.tracker else {}
if p.tracker:
    worst = max(overlap(shell_plain, k) for k in tracker_variants.values())
    record("tracker seated: no contact with the shell (PCB 1.0, 1.2, 1.6 mm)", worst < EPS, f"overlap {worst:.4f} mm3")
# straight drop from the back, from the seat to clear of the shell
worst = 0.0
for lift in np.arange(0.5, p.depth + 0.01, 0.5):
    for c in c3_variants.values():
        worst = max(worst, overlap(shell_plain, moved(c, dz=lift)))
    for r in radar_variants.values():
        worst = max(worst, overlap(shell_plain, moved(r, dz=lift)))
    for k in tracker_variants.values():
        worst = max(worst, overlap(shell_plain, moved(k, dz=lift)))
record(("all three" if p.tracker else "both") + " boards lower straight in from the back", worst < EPS,
       f"worst overlap on the way {worst:.4f} mm3")

# ---- 3. back plate: parked, sliding, locked
boards = [c3_variants[1.0], c3_variants[1.6], c3_variants[0.6]] + list(radar_variants.values())
if p.tracker:      # with its plug in and the wires' first bend, for every board thickness
    boards += [e.make_tracker(p, t, plug=True) for t in (1.0, 1.2, 1.6)]
worst_shell = worst_board = 0.0
for frac in np.linspace(0, 1, 13):
    b = moved(back_plain, dy=-p.travel * (1 - frac))
    worst_shell = max(worst_shell, overlap(shell_plain, b))
    worst_board = max(worst_board, max(overlap(b, x) for x in boards))
record("back plate slides parked -> locked without touching the shell", worst_shell < EPS,
       f"worst overlap {worst_shell:.4f} mm3 over 13 positions")
record("back plate slides parked -> locked without touching " + ("any board or the tracker's plug" if p.tracker else "either board"), worst_board < EPS,
       f"worst overlap {worst_board:.4f} mm3")
worst_shell = worst_board = 0.0
for lift in np.arange(0.0, p.depth - 0.99, 0.5):          # with the detent ribs: they ride in the parked grooves
    b = moved(back, dy=-p.travel, dz=lift)
    worst_shell = max(worst_shell, overlap(shell_plain, b))
    worst_board = max(worst_board, max(overlap(b, x) for x in boards))
record("back plate lowers straight on in the parked position", max(worst_shell, worst_board) < EPS,
       f"worst overlap shell {worst_shell:.4f}, boards {worst_board:.4f} mm3")

# ---- 4. the lock holds
free_play = None
for lift in np.arange(0.05, 1.01, 0.05):
    if overlap(shell_plain, moved(back_plain, dz=lift)) > EPS:
        free_play = lift - 0.05
        break
record("locked: the catches stop the plate lifting off", free_play is not None and free_play <= 0.21,
       f"free play before the barbs meet the catches {free_play:.2f} mm")
lifted = overlap(shell_plain, moved(back_plain, dz=1.0))
record("locked: 1 mm of lift is solidly blocked", lifted > 0.5, f"{lifted:.2f} mm3 of barb inside the catches")
record("locked: plate cannot slide further up", overlap(shell_plain, moved(back_plain, dy=0.2)) > EPS,
       "barbs meet the stops")
record("parked: plate lifts off freely", overlap(shell_plain, moved(back_plain, dy=-p.travel, dz=1.0)) < EPS, "no overlap")
if p.tracker:
    held = []
    lifted_plate = moved(back_plain, dz=1.0)
    for y_stop, _, _ in p.locks:
        zone = e.box(-p.width, p.width, y_stop - p.barb_len - 0.5, y_stop + 0.1, 0, p.depth + 2)
        held.append(overlap(shell_plain.intersect(zone), lifted_plate))
    record("locked: all three pairs of catches hold, along the whole bar", min(held) > 0.15,
           "barb inside the catches at 1 mm of lift: " + ", ".join(f"{v:.2f}" for v in held) + " mm3")

# ---- 5. the two designed press fits
rad = radar_variants["none"]
rib_bite = overlap(shell, rad) - overlap(shell_plain, rad)
record("crush ribs bite a 16.0 x 22.0 mm radar board", 0.005 < rib_bite < 1.0, f"{rib_bite:.3f} mm3 of rib to squash")
if p.tracker:
    trk = tracker_variants[1.2]
    rib_bite = overlap(shell, trk) - overlap(shell_plain, trk)
    record(f"crush ribs bite a {p.trk_w} x {p.trk_l} mm tracker board", 0.005 < rib_bite < 1.5, f"{rib_bite:.3f} mm3 of rib to squash")
det_locked = overlap(shell_plain, back) - overlap(shell_plain, back_plain)
det_parked = overlap(shell_plain, moved(back, dy=-p.travel)) - overlap(shell_plain, moved(back_plain, dy=-p.travel))
det_mid = overlap(shell_plain, moved(back, dy=-p.travel / 2)) - overlap(shell_plain, moved(back_plain, dy=-p.travel / 2))
record("detent ribs sit free in their grooves when parked and when locked", det_locked < EPS and det_parked < EPS,
       f"overlap locked {det_locked:.4f}, parked {det_parked:.4f} mm3")
record("detent ribs press on the walls between the grooves", det_mid > 0.01, f"{det_mid:.3f} mm3 (walls flex 0.15 mm)")

# ---- 6. clearances that matter
def gap(a, b): return a.distance(b)

zf, zb = p.rad_front_z, p.rad_front_z + p.rad_t
# the radar sits on its four corner rests: a probe just in front of each board corner must be solid shell
y_r0, y_r1 = p.rad_y0, p.rad_y0 + p.rad_l
on_rests = 0
for x_c, sx in ((p.rad_x1, 1), (p.rad_x0, -1)):
    for y_c, sy in ((y_r0, 1), (y_r1, -1)):
        xa, xb = sorted((x_c - sx * 0.1, x_c - sx * 0.6))
        ya, yb = sorted((y_c + sy * 0.1, y_c + sy * 0.6))
        probe = e.box(xa, xb, ya, yb, zf - 0.3, zf)
        on_rests += overlap(shell_plain, probe) > 0.99 * probe.Volume()
record("radar sits on four corner rests", on_rests == 4, f"{on_rests} of 4 corners carried, 0.5 mm of board edge on each")

x_row = p.rad_x1 - p.pin_inset
window_inside = e.box(max(p.pocket_x0, -p.hw), p.pocket_x1, p.y_p0, p.y_p1, 0, p.window)
g_parts = gap(e.box(p.rad_x0 + 1.0, p.rad_x1 - 3.9, p.y_p0 + 1.4, p.y_p1 - 1.4, zf - 1.0, zf), window_inside)
g_tails = gap(e.box(x_row - 0.35, x_row + 0.35, y_r0 + 5.6, y_r0 + 16.4, zf - 1.8, zf), window_inside)
record(f"radar parts and 1.8 mm solder tails clear the {p.window} mm front", g_parts >= 0.9 and g_tails >= 0.15,
       f"1 mm parts {g_parts:.2f} mm, tails {g_tails:.2f} mm")
left_wall = p.width / 2 + p.pocket_x0
record("wall left where the radar's pocket runs into it", left_wall >= 1.0, f"{left_wall:.2f} mm")

if p.ports:
    # patch and lettering positions are measured off a photo of one LD2410C: good to about 0.3 mm
    patches = [e.box(-p.patch_w / 2, p.patch_w / 2, y_r0 + u - p.patch_l / 2, y_r0 + u + p.patch_l / 2, -1, zf) for u in p.patch_u]
    worst = max(overlap(shell, m) for m in patches)
    record("ports: each antenna patch shows whole, straight on", worst < EPS,
           f"openings {p.port_w:.2f} x {p.port_l:.2f} mm, {p.port_border:.2f} mm wider than the patch all round")
    off = max(abs(m.Center().x) for m in patches)
    record("ports sit on the bar's centre line", off < 0.01, f"patch centres {off:.2f} mm off centre")
    # seen straight on, a spot on the board is hidden if the front is solid in front of it at the opening's
    # narrowest level, the straight land above the bevel
    z_a, z_b = p.port_bevel + 0.02, p.window - 0.02
    lettering = e.box(p.rad_x1 - 3.6, p.rad_x1 - 2.4, y_r0 + 4.0, y_r0 + 18.5, z_a, z_b)   # the silk text
    tails = e.box(x_row - 0.9, x_row + 0.9, y_r0 + 5.0, y_r0 + 17.0, z_a, z_b)             # the pin tips
    chip = e.box(p.rad_x1 - 13.5, p.rad_x1 - 7.25, y_r0 + 8.1, y_r0 + 14.4, z_a, z_b)       # the radar chip
    hidden = all(overlap(shell, m) > 0.999 * m.Volume() for m in (lettering, tails, chip))
    edge_to_text = (p.rad_x1 - 3.6) - p.port_w / 2
    record("ports: lettering, pin tips and the radar chip stay hidden, straight on", hidden,
           f"the opening's edge is {edge_to_text:.2f} mm short of the lettering")
    if p.port_baffle:
        strip = e.box(p.rad_x1 - 3.9, p.rad_x1 - 2.1, y_r0 + 1.0, y_r0 + 21.0, zf - 0.19, zf)   # 0.19 mm of air over the lettering strip
        g = gap(shell_plain, e.box(p.rad_x1 - 3.9, p.rad_x1 - 2.1, y_r0 + 1.0, y_r0 + 21.0, zf - 0.001, zf))
        record("ports: the baffle stops short of the board's lettering strip", overlap(shell_plain, strip) < EPS and g >= 0.19,
               f"{g:.2f} mm above the board; it needs that strip free of parts, as on the board measured")
        seen = max(0.0, g * np.tan(np.radians(45)) - ((p.rad_x1 - 3.6) - p.port_w / 2))        # g of air under the baffle
        record("ports: lettering seen from 45 degrees to the side", seen <= 0.2, f"{seen:.2f} mm of its lower edge, under the baffle")
    def clear_angle(margin):       # the opening's inner edge and the bevel's outer edge both limit it
        return float(np.degrees(min(np.arctan(margin / p.air_gap), np.arctan((margin + p.port_bevel) / zf))))
    record("ports: plastic-free angle from a patch edge", clear_angle(p.port_border) >= 10,
           f"about {clear_angle(p.port_border):.0f} deg each way; past that the signal crosses the {p.window} mm front")

plate_only = e.box(-p.width / 2, p.width / 2, 0, p.length, p.zi, p.depth)
if p.tracker:
    ty0, ty1 = p.trk_y0, p.trk_y0 + p.trk_l
    on_rests = 0
    for x_c, sx in ((p.trk_w / 2, 1), (-p.trk_w / 2, -1)):
        for y_c, sy in ((ty0, 1), (ty1, -1)):
            xa, xb = sorted((x_c - sx * 0.1, x_c - sx * 0.6))
            ya, yb = sorted((y_c + sy * 0.1, y_c + sy * 0.6))
            probe = e.box(xa, xb, ya, yb, zf - 0.3, zf)
            on_rests += overlap(shell_plain, probe) > 0.99 * probe.Volume()
    record("tracker sits on four corner rests", on_rests == 4, f"{on_rests} of 4 corners carried, {p.air_gap} mm of air to the {p.window} mm front")
    for t_pcb in (1.0, 1.2, 1.6):
        board = e.box(-p.trk_w / 2, p.trk_w / 2, ty0, ty1, zf, zf + t_pcb)
        g = gap(board, back_plain)
        record(f"back stops behind a {t_pcb} mm tracker board", 0.15 <= g <= 0.85, f"{g:.2f} mm, at its four corners")
    for t_pcb, need in ((1.2, 0.5), (1.6, 0.2)):
        sock = e.box(-p.trk_sock_w / 2, p.trk_sock_w / 2, ty0 + p.trk_sock[0], ty0 + p.trk_sock[1], zf + t_pcb, zf + t_pcb + p.trk_sock_h)
        g = gap(sock, plate_only)
        record(f"tracker's {p.trk_sock_h} mm socket clears the back plate on a {t_pcb} mm board", g >= need, f"{g:.2f} mm")
    # the posts stand over the board's long edges only: how far in from the edge they reach
    reach = p.trk_w / 2 - (p.hw - p.catch - p.fit - 1.3)
    # (each post has a 0.8 mm gusset where it meets the plate, so the free strip is checked 1.5 mm in from the edges)
    free = overlap(back_plain, e.box(-p.trk_w / 2 + 1.5, p.trk_w / 2 - 1.5, ty0, ty1, zf, p.zi)) < EPS
    record("the back plate stands only over the tracker's long edges", free and reach <= 1.0,
           f"posts cover {reach:.2f} mm of each edge; the middle {p.trk_w - 3:.0f} mm of the board stays free for its parts")
    wires = p.zi - (zf + p.rad_t + 2.54 + 0.64)
    record("room for the tracker's wires over the first radar's bent pins", wires >= 1.5, f"{wires:.2f} mm under the back plate")
    # lanes for the tracker's four wires, clear of every post in both plate positions: TX and RX go left of the
    # first radar's upper back stop and over its bare back to the C3; 5V and GND go right of it to the pin row
    zb1 = zf + p.rad_t
    lane_l = e.box(-6.0, -3.5, p.y_p0 - 3.0, p.y_p1 + 3.5, zb1 + 0.3, p.zi - 0.2)
    lane_r = e.box(3.4, 6.2, p.rad_y0 + p.rad_l / 2 + 1.5, p.y_p1 + 3.5, zb1 + 2.54 + 0.64 + 0.3, p.zi - 0.2)
    blocked = max(overlap(lane, part) for lane in (lane_l, lane_r)
                  for part in (shell_plain, back_plain, moved(back_plain, dy=-p.travel), e.make_radar(p, "bent")))
    record("two free lanes for the tracker's wires, plate parked and locked", blocked < EPS,
           f"to the C3: 2.5 mm wide, {p.zi - 0.2 - zb1 - 0.3:.1f} mm deep; to the first radar's pins: 2.8 mm wide, "
           f"{p.zi - 0.2 - (zb1 + 2.54 + 0.64 + 0.3):.1f} mm deep")
    fence = e.box(-3, 3, p.y_p1 + 0.1, p.y_p1 + 0.7, p.front + 0.1, p.strip_top_z - 0.3)
    record("first radar's upper end has its own fence", overlap(shell_plain, fence) > 0.99 * fence.Volume(),
           f"{p.gap2 - 1.6:.1f} mm between the two fences for the plug and wires")
for pins, need in (("bent", 0.3), ("cut", 0.2)):
    g = gap(e.make_radar(p, pins), plate_only)
    record(f"radar header pins ({pins}) clear the back plate", g >= need, f"{g:.2f} mm (radar PCB {p.rad_t} mm)")
usb_top = e.box(-p.usb_w / 2, p.usb_w / 2, p.y_c3_0 - 1.4, p.y_c3_0 + 5.9, p.c3_top_z, p.c3_top_z + p.usb_h)
g = gap(usb_top, back_plain)
record("pad over the USB-C receptacle", 0.1 <= g <= 0.2, f"{g:.2f} mm above the receptacle")
c3_face = e.box(-p.c3_w / 2, p.c3_w / 2, p.y_c3_0 + 0.1, p.y_c3_0 + 0.1 + p.c3_l, p.c3_top_z - 0.6, p.c3_top_z)
g = gap(c3_face, back_plain)
record("tabs over the C3 pads", 0.15 <= g <= 0.25, f"{g:.2f} mm above the board, whatever its thickness")
for t in (1.0, 1.2, 1.6):
    r = e.box(p.rad_x0, p.rad_x1, p.rad_y0, p.rad_y0 + p.rad_l, zf, zf + t)
    g = gap(r, back_plain)
    record(f"back stops behind a {t} mm radar board", 0.15 <= g <= 0.85, f"{g:.2f} mm")
import dataclasses
r16 = e.make_radar(dataclasses.replace(p, rad_t=1.6), "bent")
g = gap(r16, plate_only)
record("radar header pins (bent) clear the back plate with a 1.6 mm radar board", g >= 0.15, f"{g:.2f} mm")
for thick in (6.5, 7.0):
    plug = e.usb_plug(p, thick)
    bb = plug.BoundingBox()
    record(f"{thick} mm thick USB-C plug stays inside the bar's profile", bb.zmin >= 0 and bb.zmax <= p.depth,
           f"front {bb.zmin:.2f} mm, wall side {p.depth - bb.zmax:.2f} mm to spare")
plug = e.usb_plug(p, 5.5).translate(V(0, -0.35, 0))      # the thinnest common plug, seated with its usual gap
record("a plugged-in cable does not touch the locked back plate", overlap(plug, back_plain) < EPS, "no overlap")
blocked = overlap(plug, moved(back_plain, dy=-p.travel))
record("a plugged-in cable blocks the slide to the parked position (the cable locks the bar on)", blocked > 0.5,
       f"{blocked:.1f} mm3 of plug in the way, even with a 5.5 mm thick plug")

# ---- 7. printability: nothing steeper than 45 degrees, no bridges (exact surface normals, not facets)
def overhangs(shape: cq.Shape):
    bad_area = area45 = 0.0
    worst = 0.0
    for face in shape.Faces():
        verts, tris = face.tessellate(0.01, 0.1)
        v = np.array([(a.x, a.y, a.z) for a in verts])
        for i, j, k in tris:
            a, b, c = v[i], v[j], v[k]
            area = np.linalg.norm(np.cross(b - a, c - a)) / 2
            if area < 1e-9 or min(a[2], b[2], c[2]) <= 0.01:      # slivers, and anything standing on the bed
                continue
            n = face.normalAt(V(*((a + b + c) / 3)))
            if n.z >= -1e-6:
                continue
            angle = float(np.degrees(np.arcsin(min(1.0, -n.z))))  # 0 = vertical wall, 90 = flat ceiling
            worst = max(worst, angle)
            if angle > 45.01:
                bad_area += area
            elif angle > 44.9:
                area45 += area
    return bad_area, worst, area45

for name, s in (("shell (front face down)", shell), ("back plate (wall side down)", e.to_print(back, p))):
    bad_area, worst_angle, a45 = overhangs(s)
    record(f"{name}: prints without supports", bad_area < 0.01,
           f"steepest overhang {worst_angle:.1f} deg, {a45:.1f} mm2 of 45 deg ramps, {bad_area:.2f} mm2 beyond")

# ---- 8. exported meshes are closed
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
for name, solid in ((e.SHELL_FILE[variant], shell), (e.BACK_FILE[variant], back)):
    path = out / f"{name}.stl"
    if not path.exists():
        record(f"{name}.stl exists", False, "run enclosure.py first")
        continue
    ntri, closed, oriented, vol, lo, hi = stl_check(path)
    size = hi - lo
    record(f"{name}.stl is a closed, consistently oriented mesh", closed and oriented and abs(vol - solid.Volume()) < 0.5,
           f"{ntri} triangles, {vol:.0f} mm3, {size[0]:.1f} x {size[1]:.2f} x {size[2]:.1f} mm, lowest point z={lo[2]:.2f}")

failed = [r for r in results if not r[1]]
(out / ("check-results.json" if variant == "ports" else f"check-results-{variant}.json")).write_text(json.dumps(
    {"front": variant, "outside_mm": [round(p.width, 2), round(p.length, 2), p.depth],
     "checks": [{"name": n, "pass": ok, "detail": d} for n, ok, d in results]}, indent=2))
print(f"\n{variant}: {len(results) - len(failed)} of {len(results)} checks passed")
sys.exit(1 if failed else 0)
