"""Wall mount for the control-center tablet, version 2: a full frame around a Samsung Galaxy Tab A11+
(the Tab A9+ has the same body).

A flat 2 mm back sheet screws to the wall with eight countersunk screws, heads flush, and carries
everything that bears load: the feet the tablet stands on, the stops beside it, and the springs
that take up play. A frame in four corner pieces snaps onto the sheet's edge and closes the tablet in on
all four sides. The charging plug and its cable sit inside the right side of the frame.

Printed parts (no supports, no hardware between the parts):
  back-left, back-right     the two halves of the back sheet. They key together at the middle.
                            back-one-piece is the same sheet whole, for a bed 290 mm wide.
  frame-bottom-left/-right  the lower corners of the frame. They go on first; the tablet then
                            slides in from the top behind their lips.
  frame-top-left/-right     the upper corners. They snap on last, over the plug.

Each frame piece is located by pins that drop into holes in the sheet (each pin hangs under a pad
on the frame's wall, and the pads seat on the sheet), and held by lips at the foot of its outer wall that click under beads on the sheet's edge. The beads sit on flexing
strips cut into the sheet, so the frame comes off again: a small flat screwdriver goes through
a slot in the frame's wall onto a ledge of the sheet and levers the piece up.

Only two lands, one behind each short edge, touch the tablet's back. Everything else behind it,
screw heads included, stays 1.6 mm below, which leaves room for the camera ring.

Run:   python mount.py            (needs CadQuery 2.x: pip install cadquery)
Makes: print/tablet-mount-*.stl (plus .step and .3mf), each part lying as it prints,
       print/tablet-mount-assembly.step (everything as mounted, with block models of the
       tablet, the plug and the cable).

Axes: X left to right seen from the front (0 = the tablet's left edge),
      Y up (0 = the tablet's bottom edge), Z out from the wall (0 = the wall).
Along an edge of the sheet, "t" runs along the edge and "n" points outward from it.
All sizes in mm.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import reduce
from pathlib import Path

import cadquery as cq


@dataclass(frozen=True)
class P:
    # ---- the tablet (Galaxy Tab A11+ and Tab A9+: 257.1 x 168.7 x 6.9 mm) ----
    tab_w: float = 257.1
    tab_h: float = 168.7
    tab_t: float = 6.9
    tab_r: float = 10.0          # corner radius used for the pictures and checks; the mount does not rely on it
    port_y: float = 84.35        # USB-C port centre above the bottom edge. Anything from about 60 to 95 fits

    # ---- the right-angle USB-C plug drawn in the checks (cable leaving along the tablet's edge) ----
    plug_reach: float = 11.0     # how far the plug body stands out past the tablet's edge
    plug_t: float = 6.6
    plug_up: float = 6.2         # plug body above the port centre
    plug_down: float = 18.0      # and below it, toward the cable
    plug_gap: float = 0.8        # metal shell showing between the tablet and the plug body
    relief_d: float = 6.5        # strain relief
    relief_l: float = 12.0
    cable_d: float = 4.8

    # ---- depth stack (Z) ----
    plate_t: float = 2.0         # the back sheet
    land_h: float = 1.6          # the lands the tablet's back rests on stand this far above the sheet
    z_clear: float = 0.3         # play between the glass and the frame's lip
    front_t: float = 2.0         # front of the frame

    # ---- frame ----
    side_out: float = 15.5       # outer face of the left and right sides, measured out from the tablet's edge
    band_out: float = 4.6        # the same for the bottom
    band_top: float = 5.0        # and the top: a little more, so a sheet that prints short still clears the tablet
    wall_t: float = 2.0
    edge_clear: float = 0.3      # between the sheet's edge and the inside of the frame's wall
    lip: float = 2.5             # how far the frame reaches over the glass
    lip_cam: float = 1.0         # less at the top middle, to stay out of the front camera's view
    cam_half: float = 13.0       # half the width of that relief
    corner_r: float = 5.0
    win_r: float = 7.0           # corner radius of the opening
    chamfer: float = 1.0         # front outer edge
    lip_chamfer: float = 0.6     # edge of the opening
    seam_y: float = 36.0         # where the lower and upper corner pieces meet on each side
    seam_gap: float = 0.2

    # ---- what the sheet carries ----
    gap_left: float = 1.5        # room on the spring side: what the sheet may print short, taken up by the springs
    land_w: float = 6.0          # land behind each short edge
    land_w_top: float = 3.0      # narrower near the top, where the camera ring might be
    cam_relief: float = 42.0     # length of that narrow part
    foot_in: float = 11.0        # each foot starts this far in from the tablet's side edge: the corner hangs free
    foot_reach: float = 26.0     # and ends here
    stop_t: float = 1.2          # ribs beside the tablet's edges
    stop_h: float = 3.6          # they reach this far above the tablet's back plane (about mid thickness)
    funnel: float = 6.0          # how far the stops open out at the top, to guide the tablet in
    spring_y: tuple = (46.0, 122.0)
    spring_len: float = 60.0
    spring_t: float = 1.0        # a spring is a thin wall standing over an opening in the sheet
    spring_h: float = 9.1        # its height from the wall
    spring_pre: float = 1.0      # its bump stands this far into the tablet's place when free
    spring_room: float = 3.0     # how far it can move back
    bump_len: float = 6.0
    bump_lead: float = 2.5       # ramp on the bump: at least spring_pre + gap_left
    screw_d: float = 4.2         # clearance for a #6 (3.5 mm) screw
    screw_head: float = 7.4      # countersink for its flat head, 82 degrees, the full depth of the sheet
    screws: tuple = ((14.0, 14.0), (14.0, 152.0), (106.0, 14.0), (106.0, 152.0))   # left half; the right half mirrors them
    key_y: tuple = (45.0, 125.0)                                   # dovetail keys joining the two halves
    key_len: float = 8.0
    key_neck: float = 3.0        # half widths
    key_tip: float = 6.5
    key_fit: float = 0.12

    # ---- snaps: a flexing strip set back in the sheet's edge with a bead, and a lip at the foot of the frame's wall ----
    snap_len: float = 26.0       # the strip
    snap_t: float = 1.2
    snap_slot: float = 1.2       # the slot behind it
    bead: float = 0.9            # the strip sits this far back from the edge; its bead comes back out to the edge
    bead_len: float = 14.0
    catch: float = 0.6           # how far the frame's lip reaches under the bead
    lip_len: float = 16.0
    flank_gap: float = 0.07      # play between the bead's underside and the lip, measured along Z
    snaps_top: tuple = (30.0, 82.0)       # centres along the top edge, left half (mirrored for the right half)
    snaps_bottom: tuple = (45.0, 82.0)
    snaps_side: tuple = (23.0, 78.0, 135.0)

    # ---- pins that locate the frame pieces ----
    pin_t: float = 1.6
    pin_len: float = 6.0
    pin_n: float = 1.3           # from the sheet's edge to the pin
    pin_fit: float = 0.1
    pin_tip: float = 0.4         # the pins stop this far short of the wall
    seat_gap: float = 0.05       # between the pads above the pins and the sheet, when the frame's foot is on the wall
    pin_low: tuple = (1.0, 7.0)          # bottom pieces: snug pin, along the side
    pin_slot: tuple = (41.0, 47.0)       # top pieces: pin in a slot
    pin_high: tuple = (156.0, 162.0)     # top pieces: snug pin
    epin: tuple = (4.0, 12.0)            # a thin pin on the top and bottom walls, this far from the middle seam:
    epin_t: float = 0.8                  # it keeps the long thin wall from bowing out and letting go of its snaps
    epin_n: float = 1.0                  # from the sheet's edge to the pin
    epin_slack: float = 0.3              # play along the edge

    # ---- openings in the frame ----
    vent_y: tuple = (14.0, 19.0, 24.0, 29.0, 70.0, 75.0, 80.0, 85.0, 90.0, 112.0, 117.0, 122.0, 127.0, 132.0)
    vent_w: float = 1.6
    vent_z: tuple = (4.6, 9.4)
    cable_x: tuple = (2.6, 9.6)          # cable notch in the bottom wall, out from the tablet's right edge
    cable_z: float = 9.9
    # pry points: a slot through the frame's wall above a ledge cut into the sheet's edge. The screwdriver's tip
    # bears on the ledge and its shank lifts the wall, so the force stays between sheet and frame
    pry: tuple = (18.0, 28.0)            # along the top and bottom, this far from the middle seam
    pry_side: tuple = (51.0, 61.0)       # along each side of the upper pieces
    pry_ledge: float = 1.0               # thickness left in the sheet
    pry_in: float = 3.0                  # how far the ledge reaches in from the sheet's edge
    pry_h: float = 1.8                   # height of the slot

    # derived -----------------------------------------------------------
    @property
    def s(self): return self.plate_t + self.land_h                  # the tablet's back plane
    @property
    def z_lip(self): return self.s + self.tab_t + self.z_clear      # underside of the frame's front
    @property
    def depth(self): return self.z_lip + self.front_t               # wall to front face
    @property
    def zc(self): return self.s + self.tab_t / 2                    # mid thickness of the tablet's edge
    @property
    def xm(self): return self.tab_w / 2                             # the middle seam
    # frame outline, inside of its wall, and the sheet
    @property
    def fx0(self): return -self.side_out
    @property
    def fx1(self): return self.tab_w + self.side_out
    @property
    def fy0(self): return -self.band_out
    @property
    def fy1(self): return self.tab_h + self.band_top
    @property
    def wx0(self): return self.fx0 + self.wall_t
    @property
    def wx1(self): return self.fx1 - self.wall_t
    @property
    def wy0(self): return self.fy0 + self.wall_t
    @property
    def wy1(self): return self.fy1 - self.wall_t
    @property
    def px0(self): return self.wx0 + self.edge_clear
    @property
    def px1(self): return self.wx1 - self.edge_clear
    @property
    def py0(self): return self.wy0 + self.edge_clear
    @property
    def py1(self): return self.wy1 - self.edge_clear
    @property
    def width(self): return self.fx1 - self.fx0
    @property
    def height(self): return self.fy1 - self.fy0
    @property
    def bay(self): return (22.0, self.port_y + 20.0)                # the stretch of the right side left free for the plug


# ------------------------------------------------------------------ helpers
V = cq.Vector
CORNERS = ("tl", "tr", "bl", "br")


def box(x0, x1, y0, y1, z0, z1) -> cq.Shape:
    return cq.Solid.makeBox(x1 - x0, y1 - y0, z1 - z0, V(x0, y0, z0))


def prism(points3d, direction) -> cq.Shape:
    wire = cq.Wire.makePolygon([V(*q) for q in points3d], close=True)
    return cq.Solid.extrudeLinear(cq.Face.makeFromWires(wire), V(*direction))


def prism_xz(pts, y0, y1) -> cq.Shape:
    return prism([(x, y0, z) for x, z in pts], (0, y1 - y0, 0))


def prism_xy(pts, z0, z1) -> cq.Shape:
    return prism([(x, y, z0) for x, y in pts], (0, 0, z1 - z0))


def prism_yz(pts, x0, x1) -> cq.Shape:
    return prism([(x0, y, z) for y, z in pts], (x1 - x0, 0, 0))


def union(shapes) -> cq.Shape:
    return reduce(lambda a, b: a.fuse(b), shapes).clean()


def cut_all(body: cq.Shape, cuts) -> cq.Shape:
    for c in cuts:
        body = body.cut(c)
    return body.clean()


def rounded(x0, x1, y0, y1, r, z0, z1) -> cq.Shape:
    return (cq.Workplane("XY").workplane(offset=z0).center((x0 + x1) / 2, (y0 + y1) / 2)
            .rect(x1 - x0, y1 - y0).extrude(z1 - z0).edges("|Z").fillet(r).val())


def pin_shape(x0, x1, y0, y1, z0, z1, c) -> cq.Shape:
    """A pin hanging down to z0, its tip tapered by c so it finds its hole."""
    return (cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0, centered=False).faces("<Z").chamfer(c)
            .val().translate(V(x0, y0, z0)))


def mirror_x(p: P, x: float) -> float:
    return p.tab_w - x


def edge_box(p: P, edge: str, t0, t1, n0, n1, z0, z1) -> cq.Shape:
    """A box given along (t) and outward from (n) one edge of the sheet: T, B, L or R."""
    if edge == "T":
        return box(t0, t1, p.py1 + n0, p.py1 + n1, z0, z1)
    if edge == "B":
        return box(t0, t1, p.py0 - n1, p.py0 - n0, z0, z1)
    if edge == "R":
        return box(p.px1 + n0, p.px1 + n1, t0, t1, z0, z1)
    return box(p.px0 - n1, p.px0 - n0, t0, t1, z0, z1)


def edge_prism(p: P, edge: str, t0, t1, pts_nz) -> cq.Shape:
    """A profile in (n, Z) pushed along one edge of the sheet."""
    if edge == "T":
        return prism_yz([(p.py1 + n, z) for n, z in pts_nz], t0, t1)
    if edge == "B":
        return prism_yz([(p.py0 - n, z) for n, z in pts_nz], t0, t1)
    if edge == "R":
        return prism_xz([(p.px1 + n, z) for n, z in pts_nz], t0, t1)
    return prism_xz([(p.px0 - n, z) for n, z in pts_nz], t0, t1)


def snaps(p: P):
    """Every snap as (edge, centre along the edge, corner piece that clips onto it)."""
    out = []
    for c in p.snaps_top:
        out += [("T", c, "tl"), ("T", mirror_x(p, c), "tr")]
    for c in p.snaps_bottom:
        out += [("B", c, "bl"), ("B", mirror_x(p, c), "br")]
    for c in p.snaps_side:
        out += [("L", c, "bl" if c < p.seam_y else "tl"), ("R", c, "br" if c < p.seam_y else "tr")]
    return out


def pins(p: P):
    """Every locating pin as (corner piece, x0, x1, y0, y1, slack along Y in its hole)."""
    xl = (p.px0 + p.pin_n, p.px0 + p.pin_n + p.pin_t)
    xr = (p.px1 - p.pin_n - p.pin_t, p.px1 - p.pin_n)
    out = []
    for corner, (x0, x1) in (("l", xl), ("r", xr)):
        out.append(("b" + corner, x0, x1, *p.pin_low, 0.0))
        out.append(("t" + corner, x0, x1, *p.pin_slot, 1.0))
        out.append(("t" + corner, x0, x1, *p.pin_high, 0.0))
    return out


def epins(p: P):
    """The thin pins near the middle seam as (edge, t0, t1, corner piece)."""
    a, b = p.epin
    out = []
    for edge, row in (("T", "t"), ("B", "b")):
        out += [(edge, p.xm - b, p.xm - a, row + "l"), (edge, p.xm + a, p.xm + b, row + "r")]
    return out


def prys(p: P):
    """The pry points as (edge, t0, t1, corner piece)."""
    a, b = p.pry
    out = []
    for edge, row in (("T", "t"), ("B", "b")):
        out += [(edge, p.xm - b, p.xm - a, row + "l"), (edge, p.xm + a, p.xm + b, row + "r")]
    out += [("L", *p.pry_side, "tl"), ("R", *p.pry_side, "tr")]
    return out


# ------------------------------------------------------------------ the back sheet
def _sheet(p: P, springs: bool = True, beads: bool = True) -> cq.Shape:
    W, H, s, pt = p.tab_w, p.tab_h, p.s, p.plate_t
    sheet = rounded(p.px0, p.px1, p.py0, p.py1, p.corner_r - p.wall_t - p.edge_clear, 0, pt)

    # ---- openings: under the springs, behind the snap strips, for the pins
    cuts = []
    sx0, sx1 = -p.gap_left - p.stop_t, -p.gap_left - p.stop_t + p.spring_t      # the spring wall, in X
    open_x0 = sx0 - p.spring_room
    for yc in p.spring_y:
        cuts.append(box(open_x0, -1.0, yc - p.spring_len / 2, yc + p.spring_len / 2, -1, pt + 1))
    for edge, c, _ in snaps(p):      # the strip's face set back from the edge, and the slot behind the strip
        t0, t1 = c - p.snap_len / 2, c + p.snap_len / 2
        cuts.append(edge_box(p, edge, t0, t1, -p.bead, 0.5, -1, pt + 1))
        cuts.append(edge_box(p, edge, t0, t1, -p.bead - p.snap_t - p.snap_slot, -p.bead - p.snap_t, -1, pt + 1))
    f = p.pin_fit
    for _, x0, x1, y0, y1, slack in pins(p):
        cuts.append(box(x0 - f, x1 + f, y0 - f - slack, y1 + f + slack, -1, pt + 1))
    for edge, t0, t1, _ in epins(p):
        cuts.append(edge_box(p, edge, t0 - p.epin_slack, t1 + p.epin_slack, -p.epin_n - p.epin_t - f, -p.epin_n + f, -1, pt + 1))
    for edge, t0, t1, _ in prys(p):
        cuts.append(edge_box(p, edge, t0, t1, -p.pry_in, 0.5, p.pry_ledge, pt + 1))
    sheet = cut_all(sheet, cuts)

    add = []
    # ---- lands the tablet's back rests on, narrow near the top and cut away beside the spring bumps
    y_rel = H - p.cam_relief
    lands = [box(-1.0, p.land_w, 0, y_rel, pt, s), box(-1.0, p.land_w_top, y_rel, H, pt, s),
             box(W - p.land_w, W, 0, y_rel, pt, s), box(W - p.land_w_top, W, y_rel, H, pt, s)]
    land = union(lands)
    for yc in p.spring_y:
        land = land.cut(box(-1.1, p.land_w + 0.1, yc - p.bump_len, yc + p.bump_len, pt, s + 1))
    land = land.cut(prism_yz([(H + 0.01, s + 0.01), (H + 0.01, s - 1.0), (H - 3.0, s + 0.01)], -2, W + 2))
    add.append(land)
    # ---- the two feet
    top = s + p.tab_t
    add += [box(p.foot_in, p.foot_reach, p.py0, 0, 0, top), box(W - p.foot_reach, W - p.foot_in, p.py0, 0, 0, top)]
    # ---- stops beside the edges: the datum on the right, end stops on the left, both opening out at the top
    zs = s + p.stop_h
    y_top = H - 8.0 - p.funnel
    k = p.stop_t * math.sqrt(2)
    add += [box(W, W + p.stop_t, 6.0, p.bay[0], pt, zs), box(W, W + p.stop_t, p.bay[1], y_top, pt, zs),
            prism_xy([(W, y_top), (W + p.funnel, y_top + p.funnel), (W + p.funnel, y_top + p.funnel - k), (W, y_top - k)], pt, zs)]
    xl = -p.gap_left
    spans = [(yc - p.spring_len / 2 - 2.0, yc + p.spring_len / 2 + 2.0) for yc in p.spring_y]
    edges = [4.0] + [v for a, b in spans for v in (a, b)] + [y_top]
    for i in range(0, len(edges), 2):
        add.append(box(xl - p.stop_t, xl, edges[i], edges[i + 1], pt, zs))
    add.append(prism_xy([(xl, y_top), (xl - p.funnel, y_top + p.funnel), (xl - p.funnel, y_top + p.funnel - k), (xl, y_top - k)], pt, zs))
    # ---- springs: a thin wall over each opening, fixed at both ends
    for yc in p.spring_y:
        y0, y1 = yc - p.spring_len / 2, yc + p.spring_len / 2
        add.append(box(sx0, sx1, y0 - 2.0, y1 + 2.0, 0, p.spring_h))
        if springs:   # the bump that meets the tablet's edge; its underside slopes so it prints
            tip, z0 = p.spring_pre, s + 0.8
            bump = prism_xz([(sx1 - 0.01, z0 - (tip - sx1) - 0.01), (tip, z0), (tip, p.spring_h), (sx1 - 0.01, p.spring_h)],
                            yc - p.bump_len / 2, yc + p.bump_len / 2)
            for sy in (1, -1):
                ye = yc + sy * p.bump_len / 2
                bump = bump.cut(prism_xy([(tip + 1, ye - sy * (p.bump_lead + 1)), (tip + 1, ye + sy),
                                          (tip - p.bump_lead - 1, ye + sy)], 0, p.spring_h + 1))
            add.append(bump)
    # ---- beads on the snap strips: both flanks at 45 degrees, so they print and so the frame comes off again
    if beads:
        b = p.bead
        for edge, c, _ in snaps(p):
            add.append(edge_prism(p, edge, c - p.bead_len / 2, c + p.bead_len / 2,
                                  [(-b - 0.01, 0.09), (0.0, 0.1 + b), (-b - 0.01, 0.11 + 2 * b)]))
    sheet = union([sheet] + add)

    # ---- screw holes, countersunk so a flat head sits flush with the sheet
    k41 = math.tan(math.radians(41))
    for x, y in screw_holes(p):
        sheet = sheet.cut(cq.Solid.makeCylinder(p.screw_d / 2, pt + 2, V(x, y, -1), V(0, 0, 1)))
        sheet = sheet.cut(cq.Solid.makeCone(p.screw_head / 2 - (pt + 0.5) * k41, p.screw_head / 2 + 0.01 * k41, pt + 0.51,
                                            V(x, y, -0.5), V(0, 0, 1)))
    return sheet.clean()


def screw_holes(p: P):
    return [(x, y) for x, y in p.screws] + [(p.tab_w - x, y) for x, y in p.screws]


def _key(p: P, yc: float, grow: float = 0.0, z0: float = 0.0, z1: float | None = None) -> cq.Shape:
    """A dovetail key on the left half, pointing into the right half."""
    xm, g = p.xm, grow
    return prism_xy([(xm - 0.5, yc - p.key_neck - g), (xm + p.key_len + g, yc - p.key_tip - g),
                     (xm + p.key_len + g, yc + p.key_tip + g), (xm - 0.5, yc + p.key_neck + g)],
                    z0, p.plate_t if z1 is None else z1)


def make_back(p: P, part: str = "one", springs: bool = True, beads: bool = True) -> cq.Shape:
    """The back sheet: "left", "right" (the two halves) or "one" (whole)."""
    sheet = _sheet(p, springs, beads)
    if part == "one":
        return sheet
    g = 0.0      # the halves butt against each other
    if part == "left":
        half = sheet.intersect(box(p.px0 - 5, p.xm - g, p.py0 - 5, p.py1 + 5, -1, 30))
        return union([half] + [_key(p, yc) for yc in p.key_y])
    half = sheet.intersect(box(p.xm + g, p.px1 + 5, p.py0 - 5, p.py1 + 5, -1, 30))
    return cut_all(half, [_key(p, yc, p.key_fit, -1.0, p.plate_t + 1.0) for yc in p.key_y])


# ------------------------------------------------------------------ the frame
def _ring(p: P) -> cq.Shape:
    W, H, D = p.tab_w, p.tab_h, p.depth
    slab = (cq.Workplane("XY").center((p.fx0 + p.fx1) / 2, (p.fy0 + p.fy1) / 2).rect(p.width, p.height).extrude(D)
            .edges("|Z").fillet(p.corner_r).faces(">Z").edges().chamfer(p.chamfer).val())
    c = p.lip_chamfer
    cuts = [rounded(p.wx0, p.wx1, p.wy0, p.wy1, p.corner_r - p.wall_t, -1, p.z_lip),             # the hollow
            rounded(p.lip, W - p.lip, p.lip, H - p.lip, p.win_r, p.z_lip - 1, D + 1),              # the opening
            (cq.Workplane("XY").workplane(offset=D - c).center(W / 2, H / 2).sketch()
             .rect(W - 2 * p.lip, H - 2 * p.lip).vertices().fillet(p.win_r).finalize().extrude(c + 0.01, taper=-45).val()),
            box(p.xm - p.cam_half, p.xm + p.cam_half, H - p.lip - 0.01, H - p.lip_cam, p.z_lip - 1, D + 1)]
    return cut_all(slab, cuts)


def make_frame(p: P, corner: str, lips: bool = True, locate: bool = True) -> cq.Shape:
    """One corner piece of the frame: "tl", "tr", "bl" or "br"."""
    W, H, D = p.tab_w, p.tab_h, p.depth
    top, left = corner[0] == "t", corner[1] == "l"
    g = p.seam_gap / 2
    x0, x1 = (p.fx0 - 1, p.xm - g) if left else (p.xm + g, p.fx1 + 1)
    y0, y1 = (p.seam_y + g, p.fy1 + 1) if top else (p.fy0 - 1, p.seam_y - g)
    piece = _ring(p).intersect(box(x0, x1, y0, y1, -1, D + 1))

    add, cuts = [], []
    if locate:
        zp = p.plate_t + p.seat_gap         # pads on the wall come down to just above the sheet: the piece seats on them
        for who, a, b, c, d, _ in pins(p):
            if who == corner:
                xa, xb = (p.wx0 - 0.01, b) if left else (a, p.wx1 + 0.01)
                add.append(box(xa, xb, c, d, zp, p.z_lip + 0.01))
                add.append(pin_shape(a, b, c, d, p.pin_tip, zp + 0.01, 0.3))
        for edge, t0, t1, who in epins(p):   # a pad on the wall with a thin pin under it that drops into the sheet
            if who == corner:
                add.append(edge_box(p, edge, t0, t1, -p.epin_n - p.epin_t, p.edge_clear + 0.01, zp, p.z_lip + 0.01))
                bb = edge_box(p, edge, t0, t1, -p.epin_n - p.epin_t, -p.epin_n, p.pin_tip, zp + 0.01).BoundingBox()
                add.append(pin_shape(bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax, 0.2))
    if lips:   # a lip at the foot of the wall that clicks under each bead; its top face lies along the bead's underside
        n0, zt = p.edge_clear, 0.1 + p.bead - p.flank_gap
        for edge, c, who in snaps(p):
            if who == corner:
                add.append(edge_prism(p, edge, c - p.lip_len / 2, c + p.lip_len / 2,
                                      [(n0 + 0.01, 0.0), (-p.catch, 0.0), (-p.catch, zt - p.catch), (n0 + 0.01, zt + n0 + 0.01)]))
    if add:
        piece = union([piece] + add)
    # vents: a row of upright slots through the side wall
    xa, xb = (p.fx0 - 0.1, p.wx0 + 0.1) if left else (p.wx1 - 0.1, p.fx1 + 0.1)
    for yv in p.vent_y:
        if (yv > p.seam_y) == top:
            cuts.append(box(xa, xb, yv - p.vent_w / 2, yv + p.vent_w / 2, *p.vent_z))
    # pry slots through the wall, just above the ledges in the sheet
    for edge, t0, t1, who in prys(p):
        if who == corner:
            cuts.append(edge_box(p, edge, t0, t1, p.edge_clear - 0.1, p.edge_clear + p.wall_t + 0.1,
                                 p.pry_ledge, p.pry_ledge + p.pry_h))
    if not top:
        # the slot between lip and lands opens up by 1 mm at the top end of the lower pieces, to lead the tablet in
        xa, xb = (p.wx0, p.lip + 0.1) if left else (W - p.lip - 0.1, p.wx1)
        cuts.append(prism_yz([(p.seam_y, p.z_lip - 0.01), (p.seam_y, p.z_lip + 1.0), (p.seam_y - 3.0, p.z_lip - 0.01)], xa, xb))
        if not left:   # the cable leaves through the bottom wall
            cuts.append(box(W + p.cable_x[0], W + p.cable_x[1], p.fy0 - 0.1, p.wy0 + 0.1, -0.1, p.cable_z))
    return cut_all(piece, cuts)


# ------------------------------------------------------------------ what goes in it (block models)
def make_tablet(p: P, r: float | None = None, dx: float = 0.0, dy: float = 0.0, cam=None) -> cq.Shape:
    """cam = (x, y, diameter, height) adds a camera ring on the back."""
    t = (cq.Workplane("XY").workplane(offset=p.s).center(p.tab_w / 2 + dx, p.tab_h / 2 + dy)
         .rect(p.tab_w, p.tab_h).extrude(p.tab_t).edges("|Z").fillet(r or p.tab_r).val())
    if cam:
        cx, cy, d, h = cam
        t = t.fuse(cq.Solid.makeCylinder(d / 2, h, V(cx + dx, cy + dy, p.s - h), V(0, 0, 1)))
    return t


def make_plug(p: P, out: float = 0.0, dy: float = 0.0, reach: float | None = None, t: float | None = None,
              down: float | None = None, cable: bool = True) -> cq.Shape:
    """Right-angle plug in the port; `out` pulls it that far out to the right. Only what stands outside the tablet."""
    reach, t, down = reach or p.plug_reach, t or p.plug_t, down or p.plug_down
    x0, py = p.tab_w + out, p.port_y + dy
    parts = [box(x0, x0 + p.plug_gap + 0.01, py - 4.2, py + 4.2, p.zc - 1.3, p.zc + 1.3),
             box(x0 + p.plug_gap, x0 + reach, py - down, py + p.plug_up, p.zc - t / 2, p.zc + t / 2)]
    xc = x0 + (p.plug_gap + reach) / 2
    parts.append(cq.Solid.makeCylinder(p.relief_d / 2, p.relief_l + 0.01, V(xc, py - down + 0.01, p.zc), V(0, -1, 0)))
    if cable:
        y_top = py - down - p.relief_l
        parts.append(cq.Solid.makeCylinder(p.cable_d / 2, y_top + 30.0, V(xc, y_top + 0.01, p.zc), V(0, -1, 0)))
    return union(parts)


# ------------------------------------------------------------------ as they print
def _on_bed(s: cq.Shape) -> cq.Shape:
    bb = s.BoundingBox()
    return s.translate(V(-bb.xmin, -bb.ymin, -bb.zmin))


def print_back(p: P, part: str) -> cq.Shape:
    """Wall side on the bed."""
    return _on_bed(make_back(p, part))


def print_frame(p: P, corner: str) -> cq.Shape:
    """Front face on the bed: the bed's surface becomes the visible face."""
    return _on_bed(make_frame(p, corner).rotate(V(0, 0, 0), V(1, 0, 0), 180))


PARTS = {
    "tablet-mount-back-left": lambda p: print_back(p, "left"),
    "tablet-mount-back-right": lambda p: print_back(p, "right"),
    "tablet-mount-frame-bottom-left": lambda p: print_frame(p, "bl"),
    "tablet-mount-frame-bottom-right": lambda p: print_frame(p, "br"),
    "tablet-mount-frame-top-left": lambda p: print_frame(p, "tl"),
    "tablet-mount-frame-top-right": lambda p: print_frame(p, "tr"),
}
EXTRA = {"tablet-mount-back-one-piece": lambda p: print_back(p, "one")}    # instead of the two halves, on a big bed


def export(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    p = P()
    for name, fn in {**PARTS, **EXTRA}.items():
        shape = fn(p)
        cq.exporters.export(cq.Workplane(obj=shape), str(out / f"{name}.stl"), tolerance=0.01, angularTolerance=0.1)
        cq.exporters.export(cq.Workplane(obj=shape), str(out / f"{name}.step"))
        cq.exporters.export(cq.Workplane(obj=shape), str(out / f"{name}.3mf"), tolerance=0.01, angularTolerance=0.1)
        bb = shape.BoundingBox()
        print(f"{name}: {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm as printed, {shape.Volume() * 1.27 / 1000:.0f} g in PETG")
    asm = cq.Assembly(name="tablet_mount")
    body, back = cq.Color(0.93, 0.93, 0.91), cq.Color(0.80, 0.80, 0.78)
    asm.add(make_back(p, "left"), name="back_left", color=back)
    asm.add(make_back(p, "right"), name="back_right", color=back)
    for corner in CORNERS:
        asm.add(make_frame(p, corner), name=f"frame_{corner}", color=body)
    asm.add(make_tablet(p), name="galaxy_tab_a11_plus", color=cq.Color(0.15, 0.16, 0.18))
    asm.add(make_plug(p), name="usb_c_plug", color=cq.Color(0.05, 0.05, 0.05))
    asm.save(str(out / "tablet-mount-assembly.step"))
    print(f"mounted: {p.width:.1f} wide x {p.height:.1f} tall x {p.depth:.1f} mm deep")


if __name__ == "__main__":
    export(Path(__file__).parent / "print")
