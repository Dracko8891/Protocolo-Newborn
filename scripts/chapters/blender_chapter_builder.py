"""
Gerador headless por capítulo (Blender 4.x / 5.x para Google Colab ou servidor Linux sem tela).
Gera props modulares de alta fidelidade PBR para cada fase e exporta em .glb com compressão Draco.

Uso:
    blender -b --factory-startup --python-exit-code 1 -P scripts/chapters/blender_chapter_builder.py -- --chapter 1 --out assets-chapters/fase_01
"""

import math
import os
import sys
import bpy


CHAPTER_THEMES = {
    1: {"id": "fase_01", "name": "Ala_Medica", "accent": (0.86, 0.14, 0.14, 1.0), "base": (0.14, 0.17, 0.21, 1.0)},
    2: {"id": "fase_02", "name": "Atrio_Frio", "accent": (0.04, 0.56, 0.85, 1.0), "base": (0.11, 0.16, 0.22, 1.0)},
    3: {"id": "fase_03", "name": "Alojamentos", "accent": (0.88, 0.52, 0.06, 1.0), "base": (0.17, 0.15, 0.12, 1.0)},
    4: {"id": "fase_04", "name": "Bio_Tanques", "accent": (0.10, 0.76, 0.34, 1.0), "base": (0.10, 0.17, 0.13, 1.0)},
    5: {"id": "fase_05", "name": "Engenharia", "accent": (0.06, 0.65, 0.94, 1.0), "base": (0.09, 0.11, 0.15, 1.0)},
    6: {"id": "fase_06", "name": "Bloco_Omega", "accent": (0.85, 0.18, 0.18, 1.0), "base": (0.07, 0.07, 0.09, 1.0)},
    7: {"id": "fase_07", "name": "Hangar_Carga", "accent": (0.94, 0.62, 0.06, 1.0), "base": (0.12, 0.15, 0.19, 1.0)},
}


def parse_args():
    chapter = 1
    out_dir = "assets-chapters/fase_01"
    render_preview = False
    if "--" in sys.argv:
        extra = sys.argv[sys.argv.index("--") + 1 :]
        for idx, token in enumerate(extra):
            if token == "--chapter" and idx + 1 < len(extra):
                chapter = max(1, min(7, int(extra[idx + 1])))
            elif token == "--out" and idx + 1 < len(extra):
                out_dir = extra[idx + 1]
            elif token == "--preview":
                render_preview = True
    return chapter, out_dir, render_preview


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_mat(name, base_color, metallic=0.2, roughness=0.5, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def add_bevel(obj, width=0.015, segments=2):
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def build_chapter_hero_cluster(chapter_num: int):
    theme = CHAPTER_THEMES[chapter_num]
    steel_mat = make_pbr_mat(f"M_{theme['name']}_Steel", theme["base"], metallic=0.82, roughness=0.42)
    dark_mat = make_pbr_mat(f"M_{theme['name']}_Trim", (0.05, 0.06, 0.08, 1.0), metallic=0.75, roughness=0.55)
    glow_mat = make_pbr_mat(
        f"M_{theme['name']}_Accent",
        theme["accent"],
        metallic=0.1,
        roughness=0.22,
        emission=theme["accent"],
        emission_strength=4.5,
    )

    # Arco estrutural chanfrado de antepara (PBR + chanfros limpos para celular)
    for side in (-1.35, 1.35):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side, 0.0, 1.35))
        pillar = bpy.context.active_object
        pillar.name = f"SM_{theme['name']}_Bulkhead_{'L' if side < 0 else 'R'}"
        pillar.scale = (0.22, 0.34, 2.7)
        bpy.ops.object.transform_apply(scale=True)
        add_bevel(pillar, 0.018, 2)
        pillar.data.materials.append(steel_mat)

        # Friso luminoso de sinalização do setor
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.88, -0.18, 1.4))
        strip = bpy.context.active_object
        strip.name = f"SM_{theme['name']}_Signal_{'L' if side < 0 else 'R'}"
        strip.scale = (0.04, 0.04, 1.65)
        bpy.ops.object.transform_apply(scale=True)
        strip.data.materials.append(glow_mat)

    # Viga superior com duto de ventilação
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 2.66))
    beam = bpy.context.active_object
    beam.name = f"SM_{theme['name']}_HeaderBeam"
    beam.scale = (2.92, 0.36, 0.24)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel(beam, 0.015, 2)
    beam.data.materials.append(dark_mat)

    # Elemento exclusivo por capítulo
    if chapter_num in (4, 5):
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.42, depth=1.9, location=(0.0, 0.0, 1.05))
        core = bpy.context.active_object
        core.name = f"SM_{theme['name']}_ReactorCore"
        core.data.materials.append(glow_mat)
    elif chapter_num == 7:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.6))
        crate = bpy.context.active_object
        crate.name = "SM_HangarCargoCrate"
        crate.scale = (1.1, 0.85, 1.2)
        bpy.ops.object.transform_apply(scale=True)
        add_bevel(crate, 0.025, 2)
        crate.data.materials.append(steel_mat)


def export_compressed_glb(out_path: str):
    kwargs = {
        "filepath": out_path,
        "export_format": "GLB",
        "export_apply": True,
        "export_draco_mesh_compression_enable": True,
        "export_draco_mesh_compression_level": 6,
        "export_draco_position_quantization": 12,
        "export_draco_normal_quantization": 10,
        "export_draco_texcoord_quantization": 10,
    }
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB")


def render_colab_preview(out_dir: str, chapter_num: int):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.filepath = os.path.join(out_dir, f"preview_cap0{chapter_num}.png")

    bpy.ops.object.light_add(type="AREA", location=(0.0, -2.5, 2.2))
    light = bpy.context.active_object
    light.data.energy = 85.0
    bpy.ops.object.camera_add(location=(0.0, -3.6, 1.45), rotation=(math.radians(82), 0, 0))
    scene.camera = bpy.context.active_object
    bpy.ops.render.render(write_still=True)


def main():
    chapter_num, out_dir, preview = parse_args()
    os.makedirs(out_dir, exist_ok=True)
    reset_scene()
    build_chapter_hero_cluster(chapter_num)
    glb_path = os.path.join(out_dir, "chapter_props.glb")
    export_compressed_glb(glb_path)
    if preview:
        render_colab_preview(out_dir, chapter_num)
    print(f"OK Cap. {chapter_num}: {glb_path}")


if __name__ == "__main__":
    main()
