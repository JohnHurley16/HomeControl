"""Presence node enclosure, version 2: HLK-LD2410C radar + ESP32-C3 SuperMini.

A slim wall bar in two printed parts, no supports and no hardware:
  shell  the visible part. Prints front face down. Two small ports in its front
         sit over the radar's two antenna patches; the rest of the board is hidden.
  back   the plate that sticks to the wall. Prints flat, wall side down.
The shell drops over the plate and slides down 2.4 mm until it clicks.
A plugged-in USB-C cable sits where the plate would have to go for the shell
to slide back up, so the cable locks the bar on: unplug it to take the bar off.

The radar board sits off centre inside, so that its antenna patches, and the
ports over them, land on the bar's centre line. Its pin row therefore has to be
on the +X side (the right, looking into the open shell with the USB end down).

Run:   python enclosure.py            (needs CadQuery 2.x: pip install cadquery)
Makes: print/presence-v2-shell.stl, print/presence-v2-back.stl (plus .step and .3mf),
       print/presence-v2-shell-closed.stl (the same shell without the ports),
       print/presence-v2-both.3mf (shell and back plate laid out to print together),
       print/presence-v2-plate-x5.3mf (five shells and five back plates, ten objects laid out for one bed),
       print/presence-v2-assembly.step (both parts plus simple board models).
       print/presence-duo-* (the same set for the long bar that also takes an HLK-LD2450 tracker:
       P(tracker=True), 1.5 mm deeper. A first fit-test version, see README.md).

Axes: X across the bar, Y along it (0 = USB end, bottom on the wall),
      Z from the front face (0) to the wall. All sizes in mm.
"""
from __future__ import annotations

import zipfile
from dataclasses import dataclass
from functools import reduce
from pathlib import Path

import cadquery as cq


@dataclass(frozen=True)
class P:
    # ---- the two boards (measure yours if a fit is off) ----
    c3_l: float = 22.52          # ESP32-C3 SuperMini PCB, along Y
    c3_w: float = 18.0           # across X
    usb_w: float = 8.94          # USB-C receptacle shell
    usb_h: float = 3.26
    usb_len: float = 7.35
    usb_overhang: float = 1.5    # how far the receptacle sticks out past the PCB edge
    rad_l: float = 22.0          # LD2410C PCB, along Y (the pin row runs along this edge)
    rad_w: float = 16.0
    rad_t: float = 1.2           # PCB thickness assumed for the checks
    rad_t_max: float = 1.6       # thickest radar PCB the back stops allow
    pin_inset: float = 1.3       # pin row, in from its edge of the radar board

    # ---- where the LD2410C's two antenna patches are, measured off a photo of one board (+-0.3 mm) ----
    patch_v: float = 5.45              # patch centres, in from the pin-row edge
    patch_u: tuple = (5.3, 16.9)       # patch centres along the board, from the short edge nearest the TX pin
    patch_w: float = 2.45              # patch size across the board
    patch_l: float = 3.8               # and along it

    # ---- optional second radar: an HLK-LD2450 tracker above the first, its long side along the bar ----
    # Hi-Link publishes 44 x 15 mm and nothing more. The socket's place and height are from a 3D model of
    # the board, the thickness is a guess: measure a real board before printing more than one case.
    tracker: bool = False
    trk_l: float = 44.0          # LD2450 PCB, along Y
    trk_w: float = 15.0
    trk_t: float = 1.2           # PCB thickness assumed for the checks; the back stops allow rad_t_max
    trk_sock: tuple = (1.25, 9.4)   # its 4-pin socket, from the board's lower short edge: start and end
    trk_sock_w: float = 8.65
    trk_sock_h: float = 4.6      # socket height off the board's back
    gap2: float = 6.0            # between the two radars: the tracker's plug, its wires and two catches

    # ---- shell ----
    wall: float = 2.5            # side walls. The radar's pocket runs 1.45 mm into one of them
    wall_usb: float = 1.2        # end wall the USB plug meets
    top_wall: float = 3.0        # end wall above the radar
    front: float = 1.2
    window: float = 0.8          # front thickness in front of the radar
    back_t: float = 1.2          # back plate
    depth: float = 9.0           # overall, front face to wall
    corner_r: float = 3.5
    front_chamfer: float = 1.0
    side_clear: float = 0.3      # each side of the C3
    c3_end_clear: float = 0.4    # total, along Y
    gap: float = 5.0             # between the two boards: wires and the two catches
    pocket_clear: float = 0.2    # each side of the radar

    # ---- ports: one opening over each antenna patch ----
    ports: bool = True
    port_border: float = 0.55    # opening = patch + this much all round
    port_r: float = 1.0          # corner radius of the opening
    port_bevel: float = 0.6      # 45 degree bevel on the outside
    port_baffle: bool = True     # a thin wall between the ports and the board's lettering, so a side view shows no text

    # ---- heights (Z) ----
    c3_top_z: float = 3.6        # the C3's component side sits at this height, facing the wall
    air_gap: float = 2.0         # radar face to the inside of the front
    fit: float = 0.2             # running clearance between back plate features and shell

    # ---- slide lock ----
    travel: float = 2.4
    catch: float = 1.0           # how far the catches stand in from the side walls
    barb_len: float = 2.0
    detent_r: float = 0.3        # rib radius; it stands 0.1 proud of the gap it runs in

    # derived -----------------------------------------------------------
    @property
    def inner_w(self): return self.c3_w + 2 * self.side_clear
    @property
    def width(self): return self.inner_w + 2 * self.wall
    @property
    def hw(self): return self.inner_w / 2          # inner half width (wall face)
    @property
    def zi(self): return self.depth - self.back_t  # top of the walls = inside of the back plate
    @property
    def y_c3_0(self): return self.wall_usb
    @property
    def y_c3_1(self): return self.y_c3_0 + self.c3_l + self.c3_end_clear
    @property
    def y_p0(self): return self.y_c3_1 + self.gap
    @property
    def pocket_l(self): return self.rad_l + 2 * self.pocket_clear
    @property
    def y_p1(self): return self.y_p0 + self.pocket_l
    # the tracker's pocket, above the first radar's
    @property
    def y_q0(self): return self.y_p1 + self.gap2
    @property
    def y_q1(self): return self.y_q0 + self.trk_l + 2 * self.pocket_clear
    @property
    def trk_y0(self): return self.y_q0 + self.pocket_clear
    @property
    def trk_hw(self): return self.trk_w / 2 + self.pocket_clear   # pocket half width
    @property
    def y_end(self): return self.y_q1 if self.tracker else self.y_p1   # where the inside ends
    @property
    def length(self): return self.y_end + self.top_wall
    # the radar board: its pin-row edge sits at x = patch_v, which puts the patches on x = 0
    @property
    def rad_x1(self): return self.patch_v
    @property
    def rad_x0(self): return self.rad_x1 - self.rad_w
    @property
    def rad_y0(self): return self.y_p0 + self.pocket_clear
    @property
    def pocket_x0(self): return self.rad_x0 - self.pocket_clear
    @property
    def pocket_x1(self): return self.rad_x1 + self.pocket_clear
    @property
    def port_w(self): return self.patch_w + 2 * self.port_border
    @property
    def port_l(self): return self.patch_l + 2 * self.port_border
    @property
    def rad_front_z(self): return self.window + self.air_gap
    @property
    def backstop_z(self): return self.rad_front_z + self.rad_t_max + 0.2
    @property
    def strip_top_z(self): return self.rad_front_z + 1.0
    @property
    def catch_z0(self): return self.zi - 2.4        # where the catch ramp leaves the wall
    @property
    def y_stop(self): return self.y_p0 - 0.62       # +Y end of the barb when locked
    @property
    def y_det(self): return self.y_c3_0 + 12.6      # detent rib, locked
    @property
    def locks(self):
        """Each pair of catches: (+Y end of the barb when locked, where the stop behind it ends,
        where the hook's post ends). The first pair sits between the C3 and the radar."""
        pairs = [(self.y_stop, self.y_p0, self.rad_y0 + 2.3)]
        if self.tracker:
            a = self.y_q0 - 0.62                    # between the two radars; its posts back the tracker's lower corners
            b = self.y_q1 - 3.0                     # near the top end; its posts back the tracker's upper corners
            pairs += [(a, self.y_q0, self.trk_y0 + 2.3), (b, b + 0.62, b)]
        return pairs


# ------------------------------------------------------------------ helpers
def box(x0, x1, y0, y1, z0, z1) -> cq.Shape:
    return cq.Solid.makeBox(x1 - x0, y1 - y0, z1 - z0, cq.Vector(x0, y0, z0))


def prism(points3d, direction) -> cq.Shape:
    wire = cq.Wire.makePolygon([cq.Vector(*p) for p in points3d], close=True)
    return cq.Solid.extrudeLinear(cq.Face.makeFromWires(wire), cq.Vector(*direction))


def prism_xz(pts, y0, y1) -> cq.Shape:
    """Profile in X,Z pushed along Y."""
    return prism([(x, y0, z) for x, z in pts], (0, y1 - y0, 0))


def prism_xy(pts, z0, z1) -> cq.Shape:
    return prism([(x, y, z0) for x, y in pts], (0, 0, z1 - z0))


def prism_yz(pts, x0, x1) -> cq.Shape:
    return prism([(x0, y, z) for y, z in pts], (x1 - x0, 0, 0))


def union(shapes) -> cq.Shape:
    return reduce(lambda a, b: a.fuse(b), shapes).clean()


def both_sides(fn):
    """fn(s) builds a feature for the +X side when s=1; this returns both."""
    return [fn(1), fn(-1)]


def rounded_slab(p: P, z0, z1) -> cq.Workplane:
    return (
        cq.Workplane("XY").workplane(offset=z0)
        .center(0, p.length / 2).rect(p.width, p.length).extrude(z1 - z0)
        .edges("|Z").fillet(p.corner_r)
    )


def rounded_cutter(xc, yc, w, l, r, z0, z1, taper=None) -> cq.Shape:
    """A rounded rectangle pushed from z0 to z1. With taper (degrees) it narrows on the way up."""
    wp = cq.Workplane("XY").workplane(offset=z0).center(xc, yc).sketch().rect(w, l).vertices().fillet(r).finalize()
    return (wp.extrude(z1 - z0, taper=taper) if taper else wp.extrude(z1 - z0)).val()


# ------------------------------------------------------------------ shell
def make_shell(p: P, crush_ribs: bool = True) -> cq.Shape:
    hw, zi = p.hw, p.zi
    body = rounded_slab(p, 0, zi).faces("<Z").edges().chamfer(p.front_chamfer).val()

    shell = body.cut(box(-hw, hw, p.y_c3_0, p.y_end, p.front, zi + 1))
    if p.pocket_x0 < -hw:      # the radar's pocket runs into the -X wall
        shell = shell.cut(box(p.pocket_x0, -hw + 0.01, p.y_p0, p.y_p1, p.front, zi + 1))

    add = []
    # radar pocket: a block on the +X side up to the board's back, and the low fence toward the gap
    if p.pocket_x1 < hw:
        add.append(box(p.pocket_x1, hw, p.y_p0, p.y_p1, p.front, p.strip_top_z))
    if p.pocket_x0 > -hw:
        add.append(box(-hw, p.pocket_x0, p.y_p0, p.y_p1, p.front, p.strip_top_z))
    add.append(box(-hw, hw, p.y_p0 - 0.8, p.y_p0, p.front, p.strip_top_z - 0.2))
    # C3: stop behind its antenna edge, and two low rails as a fallback rest
    add.append(box(-6, 6, p.y_c3_1, p.y_c3_1 + 1.0, p.front, p.c3_top_z + 0.4))
    rail_top = p.c3_top_z - 1.6 - 0.2
    add += both_sides(lambda s: box(*sorted((s * 2.5, s * 3.5)), p.y_c3_0 + 6.5, p.y_c3_1 - 1.5, p.front, rail_top))
    # slide lock: a ramped catch on each side wall with a full-height stop behind it
    def catch(s, y_stop, y_stop_end):
        a, b = s * hw, s * (hw - p.catch)
        ramp = prism_xz([(a, p.catch_z0), (b, p.catch_z0 + p.catch), (b, zi), (a, zi)],
                        y_stop - p.barb_len - 0.2, y_stop)
        stop = box(*sorted((a, b)), y_stop, y_stop_end, p.front, zi)
        return ramp.fuse(stop)
    for y_stop, y_stop_end, _ in p.locks:
        add += both_sides(lambda s: catch(s, y_stop, y_stop_end))
    if p.tracker:
        # the first radar's upper fence (on the short bar the end wall does this), then the tracker's pocket:
        # a block each side up to the board's back, and a low fence toward the gap its plug and wires cross
        add.append(box(-hw, hw, p.y_p1, p.y_p1 + 0.8, p.front, p.strip_top_z - 0.2))
        add += both_sides(lambda s: box(*sorted((s * p.trk_hw, s * hw)), p.y_q0, p.y_q1, p.front, p.strip_top_z))
        add.append(box(-hw, hw, p.y_q0 - 0.8, p.y_q0, p.front, p.strip_top_z - 0.2))
    shell = union([shell] + add)

    # thinner front over the radar (not under the wall the pocket runs into), then the four corner rests
    shell = shell.cut(box(max(p.pocket_x0, -hw), p.pocket_x1, p.y_p0, p.y_p1, p.window, p.front + 0.01))
    rests = []
    for x_edge, sx in ((p.pocket_x1, 1), (p.pocket_x0, -1)):
        for y_end, sy in ((p.y_p0, 1), (p.y_p1, -1)):
            x_in, y_in = x_edge - sx * (p.pocket_clear + 0.7), y_end + sy * (p.pocket_clear + 0.7)
            rests.append(box(*sorted((x_edge, x_edge - sx * 3.0)), *sorted((y_end, y_in)), p.window, p.rad_front_z))
            rests.append(box(*sorted((x_edge, x_in)), *sorted((y_end, y_end + sy * 3.0)), p.window, p.rad_front_z))
    shell = union([shell] + rests)

    if p.tracker:
        # the tracker gets the same thin, closed front and four corner rests. No ports: its antennas were not measured.
        shell = shell.cut(box(-p.trk_hw, p.trk_hw, p.y_q0, p.y_q1, p.window, p.front + 0.01))
        rests = []
        for x_edge, sx in ((p.trk_hw, 1), (-p.trk_hw, -1)):
            for y_end, sy in ((p.y_q0, 1), (p.y_q1, -1)):
                x_in, y_in = x_edge - sx * (p.pocket_clear + 0.7), y_end + sy * (p.pocket_clear + 0.7)
                rests.append(box(*sorted((x_edge, x_edge - sx * 3.0)), *sorted((y_end, y_in)), p.window, p.rad_front_z))
                rests.append(box(*sorted((x_edge, x_in)), *sorted((y_end, y_end + sy * 3.0)), p.window, p.rad_front_z))
        shell = union([shell] + rests)

    if p.ports:
        # one opening over each antenna patch: bevelled on the outside, a short straight land on the inside
        b = p.port_bevel
        for u in p.patch_u:
            yc = p.rad_y0 + u
            shell = shell.cut(rounded_cutter(0, yc, p.port_w, p.port_l, p.port_r, 0, p.window + 0.01))
            shell = shell.cut(rounded_cutter(0, yc, p.port_w + 2 * b, p.port_l + 2 * b, p.port_r + b, 0, b, taper=45))
        if p.port_baffle:
            # stands on the pin side of both ports and stops 0.2 mm short of the board, over its lettering strip
            x = p.port_w / 2
            shell = shell.fuse(box(x, x + 0.8, p.rad_y0 + min(p.patch_u) - p.port_l / 2 - 1.0,
                                   p.rad_y0 + max(p.patch_u) + p.port_l / 2 + 1.0, p.window, p.rad_front_z - 0.2))
        shell = shell.clean()

    if crush_ribs:
        ribs = []
        z0, z1, h = p.window, p.strip_top_z, 0.35  # from the floor up, so nothing hangs in the air
        for x, s in ((p.pocket_x1, 1), (p.pocket_x0, -1)):
            for y in (p.y_p0 + 4.0, p.y_p1 - 4.0):   # outside the pin row span
                rib = prism_xy([(x, y - 0.45), (x, y + 0.45), (x - s * h, y)], z0, z1)
                lead = prism_xz([(x - s * h, z1), (x - s * h, z1 - h), (x, z1)], y - 0.5, y + 0.5)
                ribs.append(rib.cut(lead))
        z1e, xm = p.strip_top_z - 0.2, (p.rad_x0 + p.rad_x1) / 2
        for y_face, sy in ((p.y_p0, 1), (p.y_p1, -1)):
            rib = prism_xy([(xm - 0.45, y_face), (xm + 0.45, y_face), (xm, y_face + sy * 0.25)], z0, z1e)
            lead = prism_yz([(y_face + sy * 0.25, z1e), (y_face + sy * 0.25, z1e - 0.25), (y_face, z1e)], xm - 0.5, xm + 0.5)
            ribs.append(rib.cut(lead))
        if p.tracker:
            # two ribs on each long side of the tracker and one at each end, like the first radar's
            for x, s in ((p.trk_hw, 1), (-p.trk_hw, -1)):
                for y in (p.y_q0 + 13.0, p.y_q1 - 13.0):
                    rib = prism_xy([(x, y - 0.45), (x, y + 0.45), (x - s * h, y)], z0, z1)
                    lead = prism_xz([(x - s * h, z1), (x - s * h, z1 - h), (x, z1)], y - 0.5, y + 0.5)
                    ribs.append(rib.cut(lead))
            for y_face, sy in ((p.y_q0, 1), (p.y_q1, -1)):
                rib = prism_xy([(-0.45, y_face), (0.45, y_face), (0, y_face + sy * 0.25)], z0, z1e)
                lead = prism_yz([(y_face + sy * 0.25, z1e), (y_face + sy * 0.25, z1e - 0.25), (y_face, z1e)], -0.5, 0.5)
                ribs.append(rib.cut(lead))
        shell = union([shell] + ribs)

    cuts = []
    # USB-C: a U open to the back. Its floor carries the receptacle's overhang.
    cuts.append(box(-p.usb_w / 2 - 0.33, p.usb_w / 2 + 0.33, -1, p.y_c3_0 + 0.01, p.c3_top_z, zi + 1))
    # two vertical detent grooves per side: parked (plate in place) and locked
    def groove(s, y):
        x, d = s * hw, 0.4
        return prism_xy([(x - s * 0.02, y - d), (x - s * 0.02, y + d), (x + s * d, y)], p.c3_top_z, zi + 1)
    for y in (p.y_det, p.y_det - p.travel):
        cuts += both_sides(lambda s: groove(s, y))
    # two small vents at the top end, closed by the back plate
    cuts += both_sides(lambda s: box(*sorted((s * 2.5, s * 6.5)), p.y_end - 0.01, p.length + 1, zi - 1.0, zi + 1))
    return reduce(lambda a, b: a.cut(b), cuts, shell).clean()


# ------------------------------------------------------------------ back plate
def make_back(p: P, detent: bool = True) -> cq.Shape:
    """Built in its locked position. Slide it by -travel in Y for the parked position."""
    hw, zi, f = p.hw, p.zi, p.fit
    plate = rounded_slab(p, zi, p.depth).faces(">Z").edges().chamfer(0.4).val()
    add = []
    # pad over the USB-C receptacle (also fills the U in the end wall)
    add.append(box(-p.usb_w / 2 + 0.15, p.usb_w / 2 - 0.15, 0.1, p.y_c3_0 + 7.2, p.c3_top_z + p.usb_h + 0.14, zi))
    # tabs over unused pads of the C3 (pads 4 to 6 from the USB end, both rows)
    tab_y0, tab_y1 = p.y_c3_0 + 9.2, p.y_c3_0 + 16.0
    def tab(s):
        x_in = s * (hw - f - 1.15)
        t = box(*sorted((s * (hw - f), x_in)), tab_y0, tab_y1, p.c3_top_z + 0.2, zi)
        t = t.fuse(prism_xz([(x_in, zi), (x_in - s * 0.8, zi), (x_in, zi - 0.8)], tab_y0, tab_y1))  # root gusset
        if detent:
            rib = cq.Solid.makeCylinder(p.detent_r, zi - p.c3_top_z - 0.8,
                                        cq.Vector(s * (hw - f), p.y_det, p.c3_top_z + 0.8), cq.Vector(0, 0, 1))
            t = t.fuse(rib)
        return t
    add += both_sides(tab)
    # hooks: a post with a barb that slides under the shell's catch. The -X post also backs the radar.
    def hook(s, y_stop, y1):
        x_post_out = s * (hw - p.catch - f)
        x_post_in = s * (hw - p.catch - f - 1.3)
        x_tip = s * (hw - f)
        y0 = y_stop - p.barb_len
        post = box(*sorted((x_post_in, x_post_out)), y0, y1, p.backstop_z, zi)
        post = post.fuse(prism_xz([(x_post_in, zi), (x_post_in - s * 0.8, zi), (x_post_in, zi - 0.8)], y0, y1))
        ramp_at = lambda x: p.catch_z0 + (hw - abs(x)) - 0.2    # 0.2 under the catch ramp
        barb = prism_xz([(x_post_out, p.backstop_z), (x_tip, p.backstop_z),
                         (x_tip, ramp_at(x_tip)), (x_post_out, ramp_at(x_post_out))], y0, y_stop)
        return post.fuse(barb)
    for y_stop, _, y_post_end in p.locks:
        add += both_sides(lambda s: hook(s, y_stop, y_post_end))
    # two more back stops for the radar: its pin-side lower corner and its top end
    add.append(box(p.rad_x1 - 2.2, p.rad_x1 - 0.2, p.rad_y0 + 0.1, p.rad_y0 + 2.3, p.backstop_z, zi))
    add.append(box(-3, 3, p.y_p1 - 2.4, p.y_p1 - 0.6, p.backstop_z, zi))
    return union([plate] + add)


# ------------------------------------------------------------------ board models (for checks and pictures)
def make_c3(p: P, t: float = 1.0) -> cq.Shape:
    y0 = p.y_c3_0 + 0.1
    pcb = box(-p.c3_w / 2, p.c3_w / 2, y0, y0 + p.c3_l, p.c3_top_z - t, p.c3_top_z)
    usb = box(-p.usb_w / 2, p.usb_w / 2, y0 - p.usb_overhang, y0 - p.usb_overhang + p.usb_len,
              p.c3_top_z, p.c3_top_z + p.usb_h)
    parts = box(-6.2, 6.2, y0 + 8.3, y0 + p.c3_l - 0.3, p.c3_top_z, p.c3_top_z + 1.6)  # chip, buttons, antenna
    return union([pcb, usb, parts])


def make_radar(p: P, pins: str = "bent") -> cq.Shape:
    """Antenna side toward the front, pin row on the +X edge.
    pins: 'bent' (folded flat toward the middle), 'cut' (1 mm stubs) or 'none'."""
    x0, x1, y0, zf = p.rad_x0, p.rad_x1, p.rad_y0, p.rad_front_z
    zb = zf + p.rad_t
    pcb = box(x0, x1, y0, y0 + p.rad_l, zf, zb)
    # chip and small parts, up to 1 mm tall, anywhere from the antenna area to the far edge. The strip between the
    # pin row and the antennas (2.1 to 3.9 mm in from the pin edge) carries only printed lettering on the board measured.
    parts = box(x0 + 1.0, x1 - 3.9, y0 + 1.2, y0 + p.rad_l - 1.2, zf - 1.0, zf)
    out = [pcb, parts]
    if pins != "none":
        x_row = x1 - p.pin_inset
        ya, yb = y0 + p.rad_l / 2 - 5.08, y0 + p.rad_l / 2 + 5.08
        out.append(box(x_row - 0.32, x_row + 0.32, ya - 0.32, yb + 0.32, zf - 1.8, zf))  # solder tails, front
        out.append(box(x_row - 1.27, x_row + 1.27, ya - 1.27, yb + 1.27, zb, zb + 2.54))  # header plastic
        if pins == "bent":
            out.append(box(x_row - 6.0, x_row + 0.32, ya - 0.32, yb + 0.32, zb + 2.54, zb + 2.54 + 0.64))
        else:
            out.append(box(x_row - 0.32, x_row + 0.32, ya - 0.32, yb + 0.32, zb + 2.54, zb + 3.54))
    return union(out)


def make_tracker(p: P, t: float | None = None, plug: bool = True) -> cq.Shape:
    """The LD2450 as far as it is known: board, socket at the lower end, and room for parts on the back.
    plug adds the cable's plug and the first bend of its wires, leaving toward the first radar."""
    t = p.trk_t if t is None else t
    x0, x1, y0, zf = -p.trk_w / 2, p.trk_w / 2, p.trk_y0, p.rad_front_z
    zb = zf + t
    out = [box(x0, x1, y0, y0 + p.trk_l, zf, zb)]
    out.append(box(-p.trk_sock_w / 2, p.trk_sock_w / 2, y0 + p.trk_sock[0], y0 + p.trk_sock[1], zb, zb + p.trk_sock_h))
    out.append(box(x0 + 1.5, x1 - 1.5, y0 + p.trk_sock[1], y0 + p.trk_l - 1.5, zb, zb + 2.0))   # chips and small parts
    if plug:
        out.append(box(-4.0, 4.0, y0 - 4.5, y0 + p.trk_sock[0] + 0.01, zb + 0.4, zb + p.trk_sock_h - 0.4))
    return union(out)


def usb_plug(p: P, thick: float = 6.5, wide: float = 12.0) -> cq.Shape:
    zc = p.c3_top_z + p.usb_h / 2
    return box(-wide / 2, wide / 2, -18.0, 0.0, zc - thick / 2, zc + thick / 2)


def to_print(back: cq.Shape, p: P) -> cq.Shape:
    """Back plate as it prints: wall side on the bed."""
    return back.rotate(cq.Vector(0, 0, 0), cq.Vector(0, 1, 0), 180).translate(cq.Vector(0, 0, p.depth))


# ------------------------------------------------------------------ export
# Two fronts on one body. Both take the same back plate.
VARIANTS = {
    "ports": P(),                 # an opening over each antenna patch
    "closed": P(ports=False),     # 0.8 mm of plastic in front of the whole radar
    # the long bar for two radars: the LD2450 tracker sits above the LD2410C, behind a closed front.
    # 1.5 mm deeper, for the tracker's socket.
    "duo": P(tracker=True, depth=10.5),
    "duo-closed": P(tracker=True, depth=10.5, ports=False),
}
SHELL_FILE = {"ports": "presence-v2-shell", "closed": "presence-v2-shell-closed",
              "duo": "presence-duo-shell", "duo-closed": "presence-duo-shell-closed"}
BACK_FILE = {"ports": "presence-v2-back", "closed": "presence-v2-back",
             "duo": "presence-duo-back", "duo-closed": "presence-duo-back"}


def mesh_of(shape: cq.Shape, tol: float = 0.01, ang: float = 0.1):
    """A closed, indexed triangle mesh of a solid: vertices shared between faces are merged."""
    verts, tris = shape.tessellate(tol, ang)
    index, points, faces = {}, [], []
    def vid(v):
        key = (round(v.x, 5), round(v.y, 5), round(v.z, 5))
        if key not in index:
            index[key] = len(points)
            points.append(key)
        return index[key]
    ids = [vid(v) for v in verts]
    for a, b, c in tris:
        a, b, c = ids[a], ids[b], ids[c]
        if a != b and b != c and a != c:
            faces.append((a, b, c))
    return points, faces


def write_3mf(path: Path, items, title: str = "Presence node enclosure v2, print plate") -> None:
    """items: (name, shape) pairs, each shape already where it should print. One 3MF object per item,
    so a slicer lists them separately and can skip one that fails."""
    objs, build = [], []
    for i, (name, shape) in enumerate(items, start=1):
        points, faces = mesh_of(shape)
        vs = "".join(f'<vertex x="{x:.5f}" y="{y:.5f}" z="{z:.5f}"/>' for x, y, z in points)
        ts = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in faces)
        objs.append(f'<object id="{i}" name="{name}" type="model"><mesh><vertices>{vs}</vertices>'
                    f'<triangles>{ts}</triangles></mesh></object>')
        build.append(f'<item objectid="{i}"/>')
    model = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
             f'<metadata name="Title">{title}</metadata>'
             '<metadata name="Application">enclosure.py</metadata>'
             f'<resources>{"".join(objs)}</resources><build>{"".join(build)}</build></model>')
    types = ('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
             '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
            'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, text in (("[Content_Types].xml", types), ("_rels/.rels", rels), ("3D/3dmodel.model", model)):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))     # fixed date: the file rebuilds byte for byte
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, text)


PLATE_COPIES = 5
PLATE_GAP = (8.0, 10.0)        # between neighbours across the plate, and between the two rows
PLATE_BED = 256.0              # the layout is centred on a bed this size; it needs 150 x 119 mm


def plate_items(p: P, copies: int = PLATE_COPIES):
    """Shells in the back row, back plates in the front row, each pair in one column."""
    shell, back = make_shell(p), to_print(make_back(p), p)
    pitch = p.width + PLATE_GAP[0]
    x0 = PLATE_BED / 2 - (copies - 1) * pitch / 2
    y_front = PLATE_BED / 2 - PLATE_GAP[1] / 2 - p.length
    y_back = PLATE_BED / 2 + PLATE_GAP[1] / 2
    items = []
    for i in range(copies):
        items.append((f"shell {i + 1}", shell.translate(cq.Vector(x0 + i * pitch, y_back, 0))))
        items.append((f"back plate {i + 1}", back.translate(cq.Vector(x0 + i * pitch, y_front, 0))))
    return items


def export_family(out: Path, stem: str, ports: str, closed: str, title: str) -> None:
    p = VARIANTS[ports]
    shell, back = make_shell(p), make_back(p)
    parts = [(SHELL_FILE[ports], shell), (BACK_FILE[ports], to_print(back, p)),
             (SHELL_FILE[closed], make_shell(VARIANTS[closed]))]
    for name, shape in parts:
        cq.exporters.export(cq.Workplane(obj=shape), str(out / f"{name}.stl"), tolerance=0.01, angularTolerance=0.1)
        cq.exporters.export(cq.Workplane(obj=shape), str(out / f"{name}.step"))
        cq.exporters.export(cq.Workplane(obj=shape), str(out / f"{name}.3mf"), tolerance=0.01, angularTolerance=0.1)
    both = cq.Compound.makeCompound([shell, to_print(back, p).translate(cq.Vector(p.width + 5, 0, 0))])
    cq.exporters.export(cq.Workplane(obj=both), str(out / f"{stem}-both.3mf"), tolerance=0.01, angularTolerance=0.1)
    write_3mf(out / f"{stem}-plate-x{PLATE_COPIES}.3mf", plate_items(p), title)
    asm = cq.Assembly(name="presence_node")
    asm.add(shell, name="shell", color=cq.Color(0.93, 0.93, 0.91))
    asm.add(back, name="back", color=cq.Color(0.80, 0.80, 0.78))
    asm.add(make_c3(p), name="esp32_c3_supermini", color=cq.Color(0.10, 0.25, 0.45))
    asm.add(make_radar(p), name="ld2410c", color=cq.Color(0.08, 0.08, 0.10))
    if p.tracker:
        asm.add(make_tracker(p), name="ld2450", color=cq.Color(0.08, 0.10, 0.08))
    asm.save(str(out / f"{stem}-assembly.step"))
    print(f"{stem} outside: {p.width:.1f} x {p.length:.2f} x {p.depth:.1f} mm")


def export(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    export_family(out, "presence-v2", "ports", "closed", "Presence node enclosure v2, print plate")
    export_family(out, "presence-duo", "duo", "duo-closed", "Presence node enclosure for two radars, print plate")
    write_3mf(out / "presence-duo-fit-test.3mf", plate_items(VARIANTS["duo"], copies=1),
              "Presence node enclosure for two radars, one set")


if __name__ == "__main__":
    export(Path(__file__).parent / "print")
