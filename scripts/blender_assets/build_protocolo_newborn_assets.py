"""
Gerador modular de assets 3D PBR para Protocolo Newborn (Blender 4.x / 5.x headless / Google Colab).
Exporta modelos .glb otimizados com compressão Draco para dispositivos mobile ARM Mali (Galaxy A04s / Moto G35).

Uso:
    blender -b --factory-startup --python-exit-code 1 -P scripts/blender_assets/build_protocolo_newborn_assets.py -- --out assets-chapters/shared
"""

import math
import os
import sys
import bpy


def parse_out_dir() -> str:
    out_dir = "assets-chapters/shared"
    if "--" in sys.argv:
        extra = sys.argv[sys.argv.index("--") + 1 :]
        for idx, token in enumerate(extra):
            if token == "--out" and idx + 1 < len(extra):
                out_dir = extra[idx + 1]
    return out_dir


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_mat(
    name: str,
    base_color,
    metallic: float = 0.25,
    roughness: float = 0.55,
    emission=None,
    emission_strength: float = 0.0,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Metallic"].default_value = min(0.45, metallic)
        bsdf.inputs["Roughness"].default_value = roughness
        if emission is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def add_bevel(obj, width: float = 0.012, segments: int = 2) -> None:
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"


def smooth_all_meshes() -> None:
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.shade_smooth()
            obj.select_set(False)


def export_glb(filepath: str) -> None:
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_materials="EXPORT",
    )


def build_industrial_locker(out_dir: str) -> None:
    reset_scene()
    shell_mat = make_pbr_mat("LockerShell", (0.09, 0.13, 0.15, 1.0), metallic=0.35, roughness=0.72)
    door_mat = make_pbr_mat("LockerDoor", (0.14, 0.20, 0.23, 1.0), metallic=0.32, roughness=0.74)
    trim_mat = make_pbr_mat("LockerHardware", (0.35, 0.37, 0.40, 1.0), metallic=0.42, roughness=0.42)

    # Gabinete oco (0.78m x 2.15m x 0.68m) elevado sobre 4 pés
    parts = [
        ("LockerBack", (0, 1.115, -0.325), (0.39, 1.035, 0.015), shell_mat),
        ("LockerLeft", (-0.375, 1.115, 0), (0.015, 1.035, 0.34), shell_mat),
        ("LockerRight", (0.375, 1.115, 0), (0.015, 1.035, 0.34), shell_mat),
        ("LockerTop", (0, 2.135, 0), (0.39, 0.015, 0.34), shell_mat),
        ("LockerBottom", (0, 0.095, 0), (0.39, 0.015, 0.34), shell_mat),
        ("DoorLower", (0, 0.705, 0.338), (0.335, 0.555, 0.012), door_mat),
        ("DoorUpper", (0, 1.725, 0.338), (0.335, 0.345, 0.012), door_mat),
        ("LatchPlate", (0.275, 1.09, 0.352), (0.028, 0.07, 0.01), trim_mat),
    ]
    for fx in (-0.34, 0.34):
        for fz in (-0.29, 0.29):
            parts.append((f"Foot_{fx}_{fz}", (fx, 0.04, fz), (0.03, 0.04, 0.03), shell_mat))

    for name, loc, scale, mat in parts:
        bpy.ops.mesh.primitive_cube_add(size=2.0, location=loc)
        obj = bpy.context.active_object
        obj.name = name
        obj.scale = scale
        obj.data.materials.append(mat)
        add_bevel(obj, 0.006, 1)

    for bank_y in (1.66, 0.32):
        for i in range(4):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, bank_y + i * 0.048, 0.346))
            slat = bpy.context.active_object
            slat.scale = (0.46, 0.016, 0.024)
            slat.rotation_euler = (0.42, 0, 0)
            slat.data.materials.append(trim_mat)

    smooth_all_meshes()
    export_glb(os.path.join(out_dir, "locker_industrial.glb"))


def build_medkit(out_dir: str) -> None:
    reset_scene()
    case_mat = make_pbr_mat("MedkitCase", (0.82, 0.86, 0.90, 1.0), metallic=0.28, roughness=0.38)
    cross_mat = make_pbr_mat(
        "MedkitCross", (0.06, 0.72, 0.50, 1.0), metallic=0.1, roughness=0.3, emission=(0.06, 0.72, 0.50, 1.0), emission_strength=0.8
    )

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    body = bpy.context.active_object
    body.scale = (0.34, 0.13, 0.24)
    body.data.materials.append(case_mat)
    add_bevel(body, 0.018, 2)

    for rot_y in (0.0, math.pi / 2):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.068, 0))
        bar = bpy.context.active_object
        bar.scale = (0.14, 0.022, 0.045)
        bar.rotation_euler = (0, rot_y, 0)
        bar.data.materials.append(cross_mat)

    smooth_all_meshes()
    export_glb(os.path.join(out_dir, "medkit.glb"))


def build_relay_panel(out_dir: str) -> None:
    reset_scene()
    box_mat = make_pbr_mat("RelayChassis", (0.10, 0.13, 0.17, 1.0), metallic=0.38, roughness=0.55)
    led_mat = make_pbr_mat(
        "RelayBeacon", (0.96, 0.62, 0.04, 1.0), metallic=0.1, roughness=0.2, emission=(0.96, 0.62, 0.04, 1.0), emission_strength=1.4
    )

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    box = bpy.context.active_object
    box.scale = (0.88, 1.15, 0.22)
    box.data.materials.append(box_mat)
    add_bevel(box, 0.015, 2)

    for idx, x_off in enumerate((-0.2, 0.0, 0.2)):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_off, 0.05, -0.14))
        sw = bpy.context.active_object
        sw.scale = (0.055, 0.14, 0.055)
        sw.rotation_euler = (-0.45 if idx != 1 else 0.45, 0, 0)
        sw.data.materials.append(box_mat)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.38, -0.135))
    ind = bpy.context.active_object
    ind.scale = (0.58, 0.08, 0.05)
    ind.data.materials.append(led_mat)

    smooth_all_meshes()
    export_glb(os.path.join(out_dir, "relay_panel.glb"))


def build_bulkhead_door(out_dir: str) -> None:
    reset_scene()
    steel_mat = make_pbr_mat("BulkheadSteel", (0.12, 0.15, 0.20, 1.0), metallic=0.42, roughness=0.46)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.25, 0))
    slab = bpy.context.active_object
    slab.scale = (2.08, 2.5, 0.2)
    slab.data.materials.append(steel_mat)
    add_bevel(slab, 0.02, 2)

    for rz in (0.68, -0.68):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.25, 0))
        rib = bpy.context.active_object
        rib.scale = (0.11, 2.3, 0.24)
        rib.rotation_euler = (0, 0, rz)
        rib.data.materials.append(steel_mat)

    smooth_all_meshes()
    export_glb(os.path.join(out_dir, "bulkhead_door.glb"))


def build_newborn_mesh(out_dir: str) -> None:
    reset_scene()
    skin_mat = make_pbr_mat("NewbornSkin", (0.65, 0.56, 0.54, 1.0), metallic=0.04, roughness=0.42)
    sinew_mat = make_pbr_mat("NewbornSinew", (0.24, 0.10, 0.12, 1.0), metallic=0.05, roughness=0.46)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.18, location=(0, 1.5, 0.02))
    torso = bpy.context.active_object
    torso.scale = (1.05, 1.9, 0.72)
    torso.data.materials.append(skin_mat)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.175, location=(0, 2.04, 0.22))
    head = bpy.context.active_object
    head.scale = (0.78, 1.24, 1.08)
    head.data.materials.append(skin_mat)

    for r in range(6):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.17, minor_radius=0.015, major_segments=12, minor_segments=6, location=(0, 1.34 + r * 0.08, 0.03)
        )
        rib = bpy.context.active_object
        rib.scale = (1.15, 0.72, 1.0)
        rib.data.materials.append(sinew_mat)

    smooth_all_meshes()
    export_glb(os.path.join(out_dir, "newborn_rig.glb"))


def main() -> None:
    out_dir = parse_out_dir()
    build_industrial_locker(out_dir)
    build_medkit(out_dir)
    build_relay_panel(out_dir)
    build_bulkhead_door(out_dir)
    build_newborn_mesh(out_dir)
    print(f"Assets modulares .glb exportados para {out_dir}")


if __name__ == "__main__":
    main()
