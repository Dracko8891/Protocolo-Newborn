"""
Script de teste headless para Blender (Google Colab / Linux sem monitor).
Uso:
    blender -b --factory-startup --python-exit-code 1 -P scripts/blender_render_colab.py -- --out out/
"""

import math
import os
import sys
import bpy


def parse_out_dir() -> str:
    if "--" in sys.argv:
        extra = sys.argv[sys.argv.index("--") + 1 :]
        for idx, token in enumerate(extra):
            if token == "--out" and idx + 1 < len(extra):
                return extra[idx + 1]
    return "out"


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def configure_render(out_dir: str) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = os.path.join(out_dir, "newborn_relay_preview.png")

    # Tenta usar GPU CUDA no Google Colab; se não existir, cai para CPU
    use_gpu = False
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "CUDA"
        prefs.get_devices()
        for dev in prefs.devices:
            if dev.type in {"CUDA", "OPTIX"}:
                dev.use = True
                use_gpu = True
    except Exception:
        use_gpu = False

    scene.cycles.device = "GPU" if use_gpu else "CPU"


def create_material(name: str, base_color, metallic: float, roughness: float, emission=None, emission_strength: float = 0.0):
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


def build_relay_prop() -> None:
    steel = create_material("M_VanguardSteel", (0.11, 0.13, 0.16, 1.0), 0.85, 0.42)
    amber_glow = create_material(
        "M_RelayAmber",
        (0.95, 0.55, 0.05, 1.0),
        0.1,
        0.2,
        emission=(1.0, 0.48, 0.04, 1.0),
        emission_strength=6.0,
    )
    cyan_glow = create_material(
        "M_RelayCyan",
        (0.05, 0.72, 0.85, 1.0),
        0.1,
        0.2,
        emission=(0.04, 0.78, 0.92, 1.0),
        emission_strength=5.0,
    )

    # Caixa principal do painel de relés
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.55))
    cabinet = bpy.context.active_object
    cabinet.name = "SM_RelayCabinet"
    cabinet.scale = (0.55, 0.22, 0.75)
    cabinet.data.materials.append(steel)

    # Indicador LED Âmbar
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.045, depth=0.04, location=(-0.14, -0.115, 0.72), rotation=(math.radians(90), 0, 0))
    led_amber = bpy.context.active_object
    led_amber.name = "SM_LedAmber"
    led_amber.data.materials.append(amber_glow)

    # Indicador LED Ciano
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.045, depth=0.04, location=(0.14, -0.115, 0.72), rotation=(math.radians(90), 0, 0))
    led_cyan = bpy.context.active_object
    led_cyan.name = "SM_LedCyan"
    led_cyan.data.materials.append(cyan_glow)

    # Iluminação atmosférica fria + luz de emergência
    bpy.ops.object.light_add(type="AREA", location=(-1.4, -1.8, 1.8))
    key_light = bpy.context.active_object
    key_light.data.energy = 60.0
    key_light.data.color = (0.65, 0.82, 1.0)
    key_light.rotation_euler = (math.radians(58), 0, math.radians(-32))

    # Câmera
    bpy.ops.object.camera_add(location=(1.35, -1.85, 1.05), rotation=(math.radians(74), 0, math.radians(36)))
    cam = bpy.context.active_object
    bpy.context.scene.camera = cam


def main() -> None:
    out_dir = parse_out_dir()
    os.makedirs(out_dir, exist_ok=True)

    reset_scene()
    build_relay_prop()
    configure_render(out_dir)

    glb_path = os.path.join(out_dir, "newborn_relay_prop.glb")
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB")
    bpy.ops.render.render(write_still=True)
    print(f"OK: GLB={glb_path} PNG={bpy.context.scene.render.filepath}")


if __name__ == "__main__":
    main()
