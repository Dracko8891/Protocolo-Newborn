import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ChapterConfig, PHYSICS_PARAMS } from "./gameLogic";
import { getChapterAssetBlobUrl } from "./levelStorage";
import {
  buildBadgeCardTexture,
  buildBeamConeTexture,
  buildCeilingGrateTexture,
  buildCrtFaceTexture,
  buildFloorTileTexture,
  buildGrimyGlassTexture,
  buildIndustrialLockerTexture,
  buildKeypadPanelTexture,
  buildNewbornSkinMaps,
  buildRelayFaceTexture,
  buildTricorderScreenTexture,
  buildWallPanelTexture,
  configureAssetLoaders,
  loadGlbModelOrFallback,
} from "./resourceCache";

export interface NewbornRig {
  root: THREE.Group;
  torsoGroup: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  veinsMat: THREE.MeshStandardMaterial;
  eyeGlowMat: THREE.MeshStandardMaterial;
  leftArm: THREE.Group;
  leftForearm: THREE.Group;
  rightArm: THREE.Group;
  rightForearm: THREE.Group;
  customGlbGroup?: THREE.Group;
}

export interface ViewmodelRig {
  root: THREE.Group;
  rightHand: THREE.Group;
  leftHand: THREE.Group;
  flashlightLensMat: THREE.MeshStandardMaterial;
  beamConeMesh: THREE.Mesh;
  tricorderScreenMat: THREE.MeshStandardMaterial;
}

export interface InteractableMarker {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  mesh: THREE.Object3D;
}

export interface MedicalWingHandles {
  newborn: NewbornRig;
  viewmodel: ViewmodelRig;
  beaconLight: THREE.PointLight;
  beaconMesh: THREE.Mesh;
  flickerLight: THREE.PointLight;
  sparkLight: THREE.PointLight;
  sparkMesh: THREE.Mesh;
  coreLight?: THREE.PointLight;
  crtScreenMat: THREE.MeshStandardMaterial;
  cctvNormalTex: THREE.Texture;
  cctvSubliminalTex: THREE.Texture;
  relayStatusMat: THREE.MeshStandardMaterial;
  exitDoorMesh: THREE.Mesh;
  exitDoorLightMat: THREE.MeshStandardMaterial;
  kitPickup: THREE.Group;
  badgePickup: THREE.Group;
  wallMapGroup: THREE.Group;
  wallMapStatusMat: THREE.MeshStandardMaterial;
  containmentDoorMesh: THREE.Mesh;
  containmentPanelMat: THREE.MeshStandardMaterial;
  decoyPickup: THREE.Group;
  activeDecoyGroup: THREE.Group;
  activeDecoyLedMat: THREE.MeshStandardMaterial;
  logPickups: [THREE.Group, THREE.Group];
  bloodDropsInst: THREE.InstancedMesh;
  lockerGroup: THREE.Group;
  relayGroup: THREE.Group;
  exitDoorGroup: THREE.Group;
  spores: THREE.Points;
  snowPoints?: THREE.Points;
  interactables: InteractableMarker[];
  disposables: Array<{ dispose: () => void }>;
}

export interface SceneBuildOptions {
  texSize?: 256 | 512;
  particleDensity?: number;
  shadowsEnabled?: boolean;
}

const _m4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();

/**
 * Normaliza atributos (não-indexado, normal, uv, e opcionalmente vertexColors)
 * para mesclagem segura via BufferGeometryUtils.mergeGeometries sem falhas em ARM Mali.
 */
function mergeNormalizedGeometries(
  geos: THREE.BufferGeometry[],
  withVertexColors = false,
  disposeInputs = true
): THREE.BufferGeometry {
  if (geos.length === 0) {
    return new THREE.BufferGeometry();
  }
  const normalized: THREE.BufferGeometry[] = [];
  for (const src of geos) {
    const g = src.index ? src.toNonIndexed() : src.clone();
    const pos = g.getAttribute("position");
    if (!pos || pos.count === 0) {
      g.dispose();
      continue;
    }
    if (!g.getAttribute("normal")) {
      g.computeVertexNormals();
    }
    if (!g.getAttribute("uv")) {
      g.setAttribute(
        "uv",
        new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2)
      );
    }
    if (withVertexColors) {
      if (!g.getAttribute("color")) {
        const cols = new Float32Array(pos.count * 3);
        cols.fill(1.0);
        g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      }
    } else if (g.getAttribute("color")) {
      g.deleteAttribute("color");
    }
    if (g.getAttribute("tangent")) {
      g.deleteAttribute("tangent");
    }
    normalized.push(g);
  }

  if (disposeInputs) {
    for (const src of geos) {
      src.dispose();
    }
  }

  if (normalized.length === 0) {
    return new THREE.BufferGeometry();
  }
  const merged = mergeGeometries(normalized, false);
  for (const g of normalized) {
    g.dispose();
  }
  return merged ?? new THREE.BufferGeometry();
}

function placeGeo(
  geo: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1
): THREE.BufferGeometry {
  const clone = geo.clone();
  _pos.set(x, y, z);
  _euler.set(rx, ry, rz);
  _quat.setFromEuler(_euler);
  _scl.set(sx, sy, sz);
  _m4.compose(_pos, _quat, _scl);
  clone.applyMatrix4(_m4);
  return clone;
}

function applyBoxVertexAO(geo: THREE.BufferGeometry, height: number): void {
  const pos = geo.getAttribute("position");
  if (!pos) return;
  const colors = new Float32Array(pos.count * 3);
  const halfH = Math.max(0.1, height * 0.5);
  for (let i = 0; i < pos.count; i++) {
    const yNorm = (pos.getY(i) + halfH) / (halfH * 2);
    let shade = 1.0;
    if (yNorm < 0.2) shade = 0.62;
    else if (yNorm > 0.85) shade = 0.78;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function createRoundedBoxShape(w: number, h: number, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  const hw = w * 0.5;
  const hh = h * 0.5;
  const cr = Math.min(r, hw * 0.45, hh * 0.45);
  shape.moveTo(-hw + cr, -hh);
  shape.lineTo(hw - cr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  shape.lineTo(hw, hh - cr);
  shape.quadraticCurveTo(hw, hh, hw - cr, hh);
  shape.lineTo(-hw + cr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  shape.lineTo(-hw, -hh + cr);
  shape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  return shape;
}

function buildWallMapCanvasTexture(chapter: ChapterConfig): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#04111c";
  ctx.fillRect(0, 0, 256, 192);
  ctx.strokeStyle = "#0ea5e9";
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 184);

  const mapX = (wx: number) => 16 + ((wx + 10) / 20) * 224;
  const mapZ = (wz: number) => 176 - ((wz + 6) / 20.5) * 144;

  ctx.fillStyle = "#1e293b";
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1;
  for (const w of chapter.walls) {
    const rx = mapX(w.minX);
    const ry = mapZ(w.maxZ);
    const rw = Math.max(2, mapX(w.maxX) - mapX(w.minX));
    const rh = Math.max(2, mapZ(w.minZ) - mapZ(w.maxZ));
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
  }

  const mx = mapX(chapter.wallMapPos.x);
  const mz = mapZ(chapter.wallMapPos.z);
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.arc(mx, mz, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#7dd3fc";
  ctx.font = "bold 11px monospace";
  ctx.fillText("VOCÊ ESTÁ AQUI", 14, 20);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px monospace";
  ctx.fillText(chapter.shortLabel.toUpperCase(), 165, 20);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function attachFirstPersonViewmodel(
  camera: THREE.PerspectiveCamera,
  disposables: Array<{ dispose: () => void }>
): ViewmodelRig {
  const root = new THREE.Group();

  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x1a2029,
    roughness: 0.88,
    metalness: 0.06,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x0e1218,
    roughness: 0.56,
    metalness: 0.16,
  });
  const metalDarkMat = new THREE.MeshStandardMaterial({
    color: 0x1e2631,
    roughness: 0.42,
    metalness: 0.42,
  });
  const knurlMat = new THREE.MeshStandardMaterial({
    color: 0x2c3746,
    roughness: 0.5,
    metalness: 0.38,
  });
  const flashlightLensMat = new THREE.MeshStandardMaterial({
    color: 0xfff5db,
    emissive: 0xffebba,
    emissiveIntensity: 1.4,
    roughness: 0.16,
  });
  const tricorderTex = buildTricorderScreenTexture();
  const tricorderScreenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tricorderTex,
    emissive: 0x67e8f9,
    emissiveMap: tricorderTex,
    emissiveIntensity: 1.25,
    roughness: 0.2,
  });
  const beamConeTex = buildBeamConeTexture();
  const beamConeMat = new THREE.MeshBasicMaterial({
    map: beamConeTex,
    color: 0xfff2dc,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  disposables.push(
    sleeveMat,
    gloveMat,
    metalDarkMat,
    knurlMat,
    flashlightLensMat,
    tricorderScreenMat,
    beamConeMat
  );

  // Mão Direita: Lanterna Tática de Dínamo mesclada em poucas draw calls
  const rightHand = new THREE.Group();
  rightHand.position.set(0.24, -0.22, -0.38);

  const armBase = new THREE.CylinderGeometry(0.036, 0.046, 0.34, 12);
  const rightArmGeo = placeGeo(armBase, 0.03, -0.05, 0.14, Math.PI * 0.42);
  const rightArmMesh = new THREE.Mesh(rightArmGeo, sleeveMat);

  const gripBase = new THREE.BoxGeometry(0.052, 0.048, 0.075);
  const fingerBase = new THREE.CylinderGeometry(0.008, 0.007, 0.042, 6);
  const gloveParts: THREE.BufferGeometry[] = [
    placeGeo(gripBase, 0, -0.005, 0.01),
    placeGeo(fingerBase, -0.022, 0.008, -0.018, 0, 0, Math.PI / 2),
    placeGeo(fingerBase, -0.022, 0.008, 0.0, 0, 0, Math.PI / 2),
    placeGeo(fingerBase, -0.022, 0.008, 0.018, 0, 0, Math.PI / 2),
  ];
  const rightGloveGeo = mergeNormalizedGeometries(gloveParts);
  const rightGlove = new THREE.Mesh(rightGloveGeo, gloveMat);

  const barrelBase = new THREE.CylinderGeometry(0.019, 0.018, 0.21, 14);
  const headBase = new THREE.CylinderGeometry(0.029, 0.021, 0.05, 14);
  const flashlightMetalGeo = mergeNormalizedGeometries([
    placeGeo(barrelBase, 0, 0.012, -0.04, Math.PI / 2),
    placeGeo(headBase, 0, 0.012, -0.155, Math.PI / 2),
  ]);
  const barrel = new THREE.Mesh(flashlightMetalGeo, metalDarkMat);

  const collarBase = new THREE.CylinderGeometry(0.022, 0.022, 0.055, 14);
  const collar = new THREE.Mesh(
    placeGeo(collarBase, 0, 0.012, -0.08, Math.PI / 2),
    knurlMat
  );

  const lensGeo = new THREE.CircleGeometry(0.024, 14);
  const lens = new THREE.Mesh(lensGeo, flashlightLensMat);
  lens.rotation.y = Math.PI;
  lens.position.set(0, 0.012, -0.181);

  const beamConeGeo = new THREE.ConeGeometry(0.18, 0.3, 8, 1, true);
  const beamConeMesh = new THREE.Mesh(beamConeGeo, beamConeMat);
  beamConeMesh.visible = false;
  beamConeMesh.position.set(0, 0.012, -0.182);

  rightHand.add(rightArmMesh, rightGlove, barrel, collar, lens, beamConeMesh);

  // Mão Esquerda: Tricorder Portátil OLED
  const leftHand = new THREE.Group();
  leftHand.position.set(-0.24, -0.46, -0.34);
  leftHand.rotation.set(0.08, 0.28, -0.06);

  const leftArmGeo = placeGeo(armBase, -0.03, -0.06, 0.14, Math.PI * 0.44);
  const leftArmMesh = new THREE.Mesh(leftArmGeo, sleeveMat);
  const leftGlove = new THREE.Mesh(gripBase, gloveMat);

  const triBodyGeo = new THREE.BoxGeometry(0.098, 0.152, 0.026);
  const triBody = new THREE.Mesh(triBodyGeo, metalDarkMat);
  triBody.rotation.x = -0.25;
  triBody.position.set(0.01, 0.035, -0.04);

  const triBezelBase = new THREE.BoxGeometry(0.088, 0.082, 0.028);
  const triAntennaBase = new THREE.CylinderGeometry(0.004, 0.006, 0.038, 8);
  const triDetailGeo = mergeNormalizedGeometries([
    placeGeo(triBezelBase, 0.01, 0.056, -0.036, -0.25),
    placeGeo(triAntennaBase, -0.028, 0.122, -0.058, -0.25),
  ]);
  const triBezel = new THREE.Mesh(triDetailGeo, knurlMat);

  const triScreenGeo = new THREE.PlaneGeometry(0.078, 0.072);
  const triScreen = new THREE.Mesh(triScreenGeo, tricorderScreenMat);
  triScreen.rotation.x = -0.25;
  triScreen.position.set(0.01, 0.056, -0.021);

  leftHand.add(leftArmMesh, leftGlove, triBody, triBezel, triScreen);
  root.add(rightHand, leftHand);
  camera.add(root);

  armBase.dispose();
  fingerBase.dispose();
  barrelBase.dispose();
  headBase.dispose();
  collarBase.dispose();
  triBezelBase.dispose();
  triAntennaBase.dispose();

  disposables.push(
    rightArmGeo,
    rightGloveGeo,
    flashlightMetalGeo,
    collar.geometry,
    lensGeo,
    beamConeGeo,
    leftArmGeo,
    gripBase,
    triBodyGeo,
    triDetailGeo,
    triScreenGeo
  );

  return {
    root,
    rightHand,
    leftHand,
    flashlightLensMat,
    beamConeMesh,
    tricorderScreenMat,
  };
}

export function createNewbornModel(
  disposables: Array<{ dispose: () => void }>,
  maxAniso = 4
): NewbornRig {
  const root = new THREE.Group();
  const skinMaps = buildNewbornSkinMaps(maxAniso);

  // Materiais orgânicos estáveis em ARM Mali mediump (sem MeshPhysicalMaterial)
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd8ccc9,
    map: skinMaps.map,
    normalMap: skinMaps.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: skinMaps.roughnessMap,
    roughness: 0.42,
    metalness: 0.04,
  });
  const sinewMat = new THREE.MeshStandardMaterial({
    color: 0x3b1f23,
    roughness: 0.46,
    metalness: 0.05,
  });
  const socketMat = new THREE.MeshStandardMaterial({
    color: 0x030203,
    roughness: 0.95,
  });
  const eyeGlowMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: 0x94a3b8,
    emissiveIntensity: 0.85,
    roughness: 0.08,
  });
  const pupilMat = new THREE.MeshStandardMaterial({
    color: 0x010102,
    roughness: 0.05,
  });
  const veinsMat = new THREE.MeshStandardMaterial({
    color: 0x26090c,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.22,
  });
  const clawBloodMat = new THREE.MeshStandardMaterial({
    color: 0x45060b,
    emissive: 0x100000,
    roughness: 0.2,
    metalness: 0.14,
  });
  const teethMat = new THREE.MeshStandardMaterial({
    color: 0xc2b8a8,
    roughness: 0.28,
    metalness: 0.06,
  });
  disposables.push(
    skinMat,
    sinewMat,
    socketMat,
    eyeGlowMat,
    pupilMat,
    veinsMat,
    clawBloodMat,
    teethMat
  );

  // Sombra de contato no chão
  const shadowGeo = new THREE.CircleGeometry(0.62, 20);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  root.add(contactShadow);
  disposables.push(shadowGeo, shadowMat);

  // Pernas digitígradas (coxa + joelho protuberante + canela inclinada + metatarso + garras) mescladas por material
  const thighBase = new THREE.CylinderGeometry(0.084, 0.056, 0.52, 10);
  const kneeBase = new THREE.SphereGeometry(0.058, 8, 8);
  const shinBase = new THREE.CylinderGeometry(0.052, 0.032, 0.48, 10);
  const footBase = new THREE.BoxGeometry(0.095, 0.05, 0.24);
  const toeClawBase = new THREE.ConeGeometry(0.014, 0.11, 5);

  const legsSinewParts: THREE.BufferGeometry[] = [];
  const legsSkinParts: THREE.BufferGeometry[] = [];
  const legsClawParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    legsSinewParts.push(
      placeGeo(thighBase, side * 0.14, 0.82, 0.06, -0.28, 0, side * -0.05),
      placeGeo(kneeBase, side * 0.14, 0.58, 0.13),
      placeGeo(footBase, side * 0.14, 0.04, 0.06, 0.08)
    );
    legsSkinParts.push(
      placeGeo(shinBase, side * 0.14, 0.34, -0.01, 0.32)
    );
    for (let t = -1; t <= 1; t++) {
      legsClawParts.push(
        placeGeo(
          toeClawBase,
          side * 0.14 + t * 0.03,
          0.03,
          0.19,
          Math.PI * 0.45
        )
      );
    }
  }
  const legsSinewGeo = mergeNormalizedGeometries(legsSinewParts);
  const legsSkinGeo = mergeNormalizedGeometries(legsSkinParts);
  const legsClawGeo = mergeNormalizedGeometries(legsClawParts);
  root.add(
    new THREE.Mesh(legsSinewGeo, sinewMat),
    new THREE.Mesh(legsSkinGeo, skinMat),
    new THREE.Mesh(legsClawGeo, clawBloodMat)
  );
  thighBase.dispose();
  kneeBase.dispose();
  shinBase.dispose();
  footBase.dispose();
  toeClawBase.dispose();
  disposables.push(legsSinewGeo, legsSkinGeo, legsClawGeo);

  // Torso escultural em LatheGeometry + costelas arqueadas + espinha saliente + escápulas
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.0, 0.02);

  const torsoLathePoints = [
    new THREE.Vector2(0.08, 0.0),
    new THREE.Vector2(0.14, 0.12), // pelve estreita
    new THREE.Vector2(0.11, 0.3), // cintura esquelética
    new THREE.Vector2(0.175, 0.54), // caixa torácica expandida
    new THREE.Vector2(0.21, 0.74), // peito largo curvado
    new THREE.Vector2(0.15, 0.88), // ombros
    new THREE.Vector2(0.08, 0.96), // base do pescoço
  ];
  const torsoHullRaw = new THREE.LatheGeometry(torsoLathePoints, 14);
  const torsoHullPlaced = placeGeo(torsoHullRaw, 0, 0.02, 0.02, 0.14, 0, 0, 1.05, 1.0, 0.72);
  const scapulaBase = new THREE.BoxGeometry(0.14, 0.22, 0.06);
  const torsoSkinGeo = mergeNormalizedGeometries([
    torsoHullPlaced,
    placeGeo(scapulaBase, -0.15, 0.74, -0.07, 0.22, -0.25, 0.15),
    placeGeo(scapulaBase, 0.15, 0.74, -0.07, 0.22, 0.25, -0.15),
  ]);
  const torsoSkinMesh = new THREE.Mesh(torsoSkinGeo, skinMat);
  torsoSkinMesh.castShadow = true;
  torsoGroup.add(torsoSkinMesh);
  torsoHullRaw.dispose();
  scapulaBase.dispose();

  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.06, -0.05),
    new THREE.Vector3(0, 0.36, -0.11),
    new THREE.Vector3(0, 0.68, -0.02),
    new THREE.Vector3(0, 0.92, 0.11),
  ]);
  const spineTubeBase = new THREE.TubeGeometry(spineCurve, 12, 0.044, 8, false);
  const ribArchBase = new THREE.TorusGeometry(0.168, 0.015, 6, 12);
  const spineSpikeBase = new THREE.ConeGeometry(0.024, 0.095, 5);
  const shoulderCapBase = new THREE.SphereGeometry(0.09, 8, 8);
  const neckBase = new THREE.CylinderGeometry(0.072, 0.092, 0.22, 10);

  const torsoSinewParts: THREE.BufferGeometry[] = [
    spineTubeBase,
    placeGeo(neckBase, 0, 0.92, 0.14, 0.45),
    placeGeo(shoulderCapBase, -0.3, 0.8, 0.07),
    placeGeo(shoulderCapBase, 0.3, 0.8, 0.07),
  ];
  for (let r = 0; r < 6; r++) {
    const scaleR = 0.84 + r * 0.065;
    torsoSinewParts.push(
      placeGeo(
        ribArchBase,
        0,
        0.34 + r * 0.08,
        0.02 + r * 0.014,
        Math.PI / 2 + 0.18,
        0,
        0,
        scaleR * 1.15,
        scaleR * 0.72,
        1
      )
    );
  }
  for (let v = 0; v < 7; v++) {
    const t = v / 6;
    const pt = spineCurve.getPoint(t);
    torsoSinewParts.push(
      placeGeo(spineSpikeBase, pt.x, pt.y + 0.01, pt.z - 0.055, -Math.PI * 0.42)
    );
  }
  const torsoSinewGeo = mergeNormalizedGeometries(torsoSinewParts);
  torsoGroup.add(new THREE.Mesh(torsoSinewGeo, sinewMat));

  const clavicleBase = new THREE.CylinderGeometry(0.02, 0.016, 0.3, 6);
  const torsoBoneGeo = mergeNormalizedGeometries([
    placeGeo(clavicleBase, -0.17, 0.84, 0.15, 0, 0.24, -1.24),
    placeGeo(clavicleBase, 0.17, 0.84, 0.15, 0, -0.24, 1.24),
  ]);
  torsoGroup.add(new THREE.Mesh(torsoBoneGeo, teethMat));

  ribArchBase.dispose();
  spineSpikeBase.dispose();
  shoulderCapBase.dispose();
  neckBase.dispose();
  clavicleBase.dispose();
  disposables.push(torsoSkinGeo, torsoSinewGeo, torsoBoneGeo);

  // Braços articulados compridos com cotovelo ossudo e 4 garras longas por mão
  const upperArmBase = new THREE.CylinderGeometry(0.048, 0.034, 0.48, 10);
  const forearmBase = new THREE.CylinderGeometry(0.034, 0.023, 0.54, 10);
  const elbowSpurBase = new THREE.ConeGeometry(0.022, 0.09, 5);
  const palmBase = new THREE.BoxGeometry(0.075, 0.085, 0.045);
  const clawBase = new THREE.ConeGeometry(0.018, 0.23, 6);

  const upperArmGeo = placeGeo(upperArmBase, 0, -0.23, 0);
  const forearmParts: THREE.BufferGeometry[] = [
    placeGeo(elbowSpurBase, 0, -0.02, -0.04, -Math.PI * 0.68),
    placeGeo(forearmBase, 0, -0.26, 0),
    placeGeo(palmBase, 0, -0.53, 0.015),
  ];
  const forearmMergedGeo = mergeNormalizedGeometries(forearmParts);
  const handClawsParts: THREE.BufferGeometry[] = [];
  for (let f = -1.5; f <= 1.5; f += 1) {
    handClawsParts.push(
      placeGeo(
        clawBase,
        f * 0.022,
        -0.63,
        0.035 + (Math.abs(f) < 1 ? 0.01 : 0),
        Math.PI - 0.28,
        0,
        f * 0.08
      )
    );
  }
  const handClawsGeo = mergeNormalizedGeometries(handClawsParts);
  upperArmBase.dispose();
  forearmBase.dispose();
  elbowSpurBase.dispose();
  palmBase.dispose();
  clawBase.dispose();

  const buildArticulatedArm = (xPos: number) => {
    const shoulderGrp = new THREE.Group();
    shoulderGrp.position.set(xPos, 0.8, 0.08);
    shoulderGrp.add(new THREE.Mesh(upperArmGeo, skinMat));

    const forearmGrp = new THREE.Group();
    forearmGrp.position.set(0, -0.46, 0);
    forearmGrp.add(
      new THREE.Mesh(forearmMergedGeo, sinewMat),
      new THREE.Mesh(handClawsGeo, clawBloodMat)
    );
    shoulderGrp.add(forearmGrp);
    return { shoulderGrp, forearmGrp };
  };

  const leftBuilt = buildArticulatedArm(-0.34);
  const rightBuilt = buildArticulatedArm(0.34);
  torsoGroup.add(leftBuilt.shoulderGrp, rightBuilt.shoulderGrp);
  disposables.push(upperArmGeo, forearmMergedGeo, handClawsGeo);

  // Crânio esculpido com arcada supraciliar, maçãs do rosto, órbitas profundas e boca rasgada
  const head = new THREE.Group();
  head.position.set(0, 1.03, 0.22);

  const craniumBase = new THREE.SphereGeometry(0.18, 16, 14);
  const cheekBase = new THREE.BoxGeometry(0.065, 0.05, 0.14);
  const craniumGeo = mergeNormalizedGeometries([
    placeGeo(craniumBase, 0, 0.02, -0.01, -0.1, 0, 0, 0.78, 1.24, 1.08),
    placeGeo(cheekBase, -0.092, -0.01, 0.08, 0.15, 0.22, 0),
    placeGeo(cheekBase, 0.092, -0.01, 0.08, 0.15, -0.22, 0),
  ]);
  const cranium = new THREE.Mesh(craniumGeo, skinMat);
  cranium.castShadow = true;
  head.add(cranium);

  const browBase = new THREE.BoxGeometry(0.22, 0.04, 0.12);
  const crestBase = new THREE.BoxGeometry(0.036, 0.05, 0.22);
  const skullRidgesGeo = mergeNormalizedGeometries([
    placeGeo(browBase, 0, 0.098, 0.125, 0.18),
    placeGeo(crestBase, 0, 0.2, -0.02, -0.15),
  ]);
  head.add(new THREE.Mesh(skullRidgesGeo, sinewMat));

  const mawBase = new THREE.SphereGeometry(0.095, 10, 10);
  const mawCavity = new THREE.Mesh(
    placeGeo(mawBase, 0, -0.078, 0.132, 0, 0, 0, 0.88, 0.95, 0.62),
    clawBloodMat
  );
  head.add(mawCavity);

  const socketBase = new THREE.SphereGeometry(0.056, 10, 10);
  const eyeBase = new THREE.SphereGeometry(0.019, 10, 10);
  const pupilBase = new THREE.BoxGeometry(0.006, 0.026, 0.014);
  const socketGeo = mergeNormalizedGeometries([
    placeGeo(socketBase, -0.066, 0.048, 0.152, 0, 0, 0, 0.92, 1.32, 0.52),
    placeGeo(socketBase, 0.066, 0.048, 0.152, 0, 0, 0, 0.92, 1.32, 0.52),
  ]);
  const eyesGeo = mergeNormalizedGeometries([
    placeGeo(eyeBase, -0.066, 0.048, 0.175),
    placeGeo(eyeBase, 0.066, 0.048, 0.175),
  ]);
  const pupilsGeo = mergeNormalizedGeometries([
    placeGeo(pupilBase, -0.066, 0.048, 0.191),
    placeGeo(pupilBase, 0.066, 0.048, 0.191),
  ]);
  head.add(
    new THREE.Mesh(socketGeo, socketMat),
    new THREE.Mesh(eyesGeo, eyeGlowMat),
    new THREE.Mesh(pupilsGeo, pupilMat)
  );

  // Veias neurais pulsantes simétricas no rosto
  const veinLeftRaw = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.085, -0.14, 0.12),
      new THREE.Vector3(-0.135, 0.01, 0.125),
      new THREE.Vector3(-0.095, 0.14, 0.05),
    ]),
    8,
    0.0085,
    6,
    false
  );
  const veinRightRaw = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.085, -0.14, 0.12),
      new THREE.Vector3(0.135, 0.01, 0.125),
      new THREE.Vector3(0.095, 0.14, 0.05),
    ]),
    8,
    0.0085,
    6,
    false
  );
  const veinsGeo = mergeNormalizedGeometries([veinLeftRaw, veinRightRaw]);
  head.add(new THREE.Mesh(veinsGeo, veinsMat));

  // Dentes superiores + Mandíbula articulada serrilhada (sem cubo simples)
  const toothBase = new THREE.ConeGeometry(0.0095, 0.044, 5);
  const topTeethParts: THREE.BufferGeometry[] = [];
  const lowTeethParts: THREE.BufferGeometry[] = [];
  for (let t = -3; t <= 3; t++) {
    const curveZ = Math.cos(t * 0.35) * 0.025;
    topTeethParts.push(
      placeGeo(toothBase, t * 0.021, -0.082, 0.128 + curveZ, Math.PI - 0.12)
    );
    lowTeethParts.push(
      placeGeo(toothBase, t * 0.02, 0.018, 0.088 + curveZ, 0.12)
    );
  }
  const topTeethGeo = mergeNormalizedGeometries(topTeethParts);
  head.add(new THREE.Mesh(topTeethGeo, teethMat));

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.07);
  const jawRamus = new THREE.BoxGeometry(0.036, 0.052, 0.14);
  const jawChin = new THREE.CylinderGeometry(0.055, 0.042, 0.052, 8);
  const jawGeo = mergeNormalizedGeometries([
    placeGeo(jawRamus, -0.05, -0.02, 0.025, 0.12, -0.16),
    placeGeo(jawRamus, 0.05, -0.02, 0.025, 0.12, 0.16),
    placeGeo(jawChin, 0, -0.028, 0.092, 0.18, 0, 0, 1.05, 1, 0.72),
  ]);
  const lowTeethGeo = mergeNormalizedGeometries(lowTeethParts);
  jaw.add(new THREE.Mesh(jawGeo, sinewMat), new THREE.Mesh(lowTeethGeo, teethMat));
  head.add(jaw);

  craniumBase.dispose();
  cheekBase.dispose();
  browBase.dispose();
  crestBase.dispose();
  mawBase.dispose();
  socketBase.dispose();
  eyeBase.dispose();
  pupilBase.dispose();
  toothBase.dispose();
  jawRamus.dispose();
  jawChin.dispose();

  disposables.push(
    craniumGeo,
    skullRidgesGeo,
    mawCavity.geometry,
    socketGeo,
    eyesGeo,
    pupilsGeo,
    veinsGeo,
    topTeethGeo,
    jawGeo,
    lowTeethGeo
  );

  torsoGroup.add(head);
  root.add(torsoGroup);

  void loadGlbModelOrFallback("newborn_rig", null).then((glbScene) => {
    if (glbScene) {
      glbScene.visible = true;
      root.add(glbScene);
    }
  });

  return {
    root,
    torsoGroup,
    head,
    jaw,
    veinsMat,
    eyeGlowMat,
    leftArm: leftBuilt.shoulderGrp,
    leftForearm: leftBuilt.forearmGrp,
    rightArm: rightBuilt.shoulderGrp,
    rightForearm: rightBuilt.forearmGrp,
  };
}

export function buildChapterScene(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  chapter: ChapterConfig,
  options: SceneBuildOptions = {}
): MedicalWingHandles {
  const disposables: Array<{ dispose: () => void }> = [];
  const texSize = options.texSize ?? (isSoftwareGl ? 256 : 512);
  const particleDensity = options.particleDensity ?? (isSoftwareGl ? 0.5 : 1.0);
  const shadowsEnabled = options.shadowsEnabled ?? !isSoftwareGl;
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const CEIL_H = PHYSICS_PARAMS.ceilingHeight;

  const bgByTheme: Record<ChapterConfig["palette"], number> = {
    medical: 0x080608,
    atrium: 0x050a12,
    quarters: 0x0a0805,
    biolab: 0x050c08,
    engineering: 0x04070b,
    omega: 0x060609,
    hangar: 0x080a10,
  };
  const bgHex = bgByTheme[chapter.palette];
  scene.background = new THREE.Color(bgHex);
  scene.fog = new THREE.FogExp2(
    bgHex,
    chapter.palette === "hangar"
      ? 0.085
      : chapter.palette === "engineering"
        ? 0.095
        : 0.082
  );

  // Iluminação visível e realista (compatível ARM Mali)
  const ambientLight = new THREE.AmbientLight(0xa3b3c9, 0.18);
  scene.add(ambientLight);

  const hemiColorMap: Record<ChapterConfig["palette"], number> = {
    medical: 0x6b2d2d,
    atrium: 0x2c5282,
    quarters: 0x6b4c24,
    biolab: 0x225c40,
    engineering: 0x1b3d59,
    omega: 0x3b3d47,
    hangar: 0x475569,
  };
  const hemiLight = new THREE.HemisphereLight(
    hemiColorMap[chapter.palette],
    0x0d131c,
    0.34
  );
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(
    chapter.palette === "medical" ? 0xfecaca : 0xdbeafe,
    0.22
  );
  keyLight.position.set(3, 8, 4);
  if (shadowsEnabled) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    keyLight.shadow.bias = -0.0005;
  }
  scene.add(keyLight);

  configureAssetLoaders(renderer);

  // Giroflex / Farol temático do capítulo
  const beaconColorMap: Record<ChapterConfig["palette"], number> = {
    medical: 0xdc2626,
    atrium: 0x0284c7,
    quarters: 0xd97706,
    biolab: 0x16a34a,
    engineering: 0x0ea5e9,
    omega: 0xef4444,
    hangar: 0xf59e0b,
  };
  const beaconColor = beaconColorMap[chapter.palette];
  const beaconLight = new THREE.PointLight(beaconColor, 3.1, 13, 1.9);
  beaconLight.position.set(0, CEIL_H - 0.28, 4.4);
  scene.add(beaconLight);

  const beaconGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.18, 12);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: beaconColor,
    emissive: beaconColor,
    emissiveIntensity: 2.4,
    roughness: 0.18,
  });
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.position.set(0, CEIL_H - 0.1, 4.4);
  scene.add(beaconMesh);

  const beaconConeGeo = new THREE.ConeGeometry(1.15, 1.9, 14, 1, true);
  const beaconConeMat = new THREE.MeshBasicMaterial({
    color: beaconColor,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beaconCone = new THREE.Mesh(beaconConeGeo, beaconConeMat);
  beaconCone.position.set(0, CEIL_H - 1.05, 4.4);
  scene.add(beaconCone);
  disposables.push(beaconGeo, beaconMat, beaconConeGeo, beaconConeMat);

  const flickerLight = new THREE.PointLight(0xbae6fd, 1.15, 10.5, 1.75);
  flickerLight.position.set(0, CEIL_H - 0.25, 10.6);
  scene.add(flickerLight);

  const sparkLight = new THREE.PointLight(0xfbbf24, 0, 5.5, 2.0);
  sparkLight.position.set(-1.3, 1.75, 6.2);
  scene.add(sparkLight);

  const sparkGeo = new THREE.SphereGeometry(0.04, 6, 6);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
  sparkMesh.position.set(-1.3, 1.75, 6.2);
  sparkMesh.visible = false;
  scene.add(sparkMesh);
  disposables.push(sparkGeo, sparkMat);

  // Chão PBR
  const floorTex = buildFloorTileTexture(maxAniso, texSize);
  const wallTex = buildWallPanelTexture(maxAniso, chapter.palette, texSize);
  const grimyGlassTex = buildGrimyGlassTexture();

  const floorGeo = new THREE.PlaneGeometry(21, 21);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: floorTex.map,
    normalMap: floorTex.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: floorTex.roughnessMap,
    roughness: 0.88,
    metalness: 0.24,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 4.1);
  floor.receiveShadow = shadowsEnabled;
  scene.add(floor);
  disposables.push(floorGeo, floorMat);

  // Poças mescladas (1 draw call para sangue, 1 draw call para água/químico)
  const puddleBase = new THREE.CircleGeometry(1, 14);
  const bloodPuddleMat = new THREE.MeshStandardMaterial({
    color: 0x1c0103,
    emissive: 0x060000,
    roughness: 0.56,
    metalness: 0.0,
    envMapIntensity: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const waterPuddleMat = new THREE.MeshStandardMaterial({
    color: chapter.palette === "biolab" ? 0x07190e : 0x04080e,
    roughness: 0.52,
    metalness: 0.0,
    envMapIntensity: 0.16,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const bloodPuddleParts: THREE.BufferGeometry[] = [];
  const waterPuddleParts: THREE.BufferGeometry[] = [];
  for (const p of chapter.puddles) {
    const pg = placeGeo(
      puddleBase,
      p.x,
      0.012,
      p.z,
      -Math.PI / 2,
      0,
      p.x * 0.7,
      p.r,
      p.r * 0.65,
      1
    );
    if (p.isBlood) bloodPuddleParts.push(pg);
    else waterPuddleParts.push(pg);
  }
  if (bloodPuddleParts.length > 0) {
    const bloodMerged = mergeNormalizedGeometries(bloodPuddleParts);
    scene.add(new THREE.Mesh(bloodMerged, bloodPuddleMat));
    disposables.push(bloodMerged);
  }
  if (waterPuddleParts.length > 0) {
    const waterMerged = mergeNormalizedGeometries(waterPuddleParts);
    scene.add(new THREE.Mesh(waterMerged, waterPuddleMat));
    disposables.push(waterMerged);
  }
  puddleBase.dispose();
  disposables.push(bloodPuddleMat, waterPuddleMat);

  // Teto + vigas + tubulações + flanges + grade de ventilação real
  const ceilTex = buildCeilingGrateTexture(maxAniso, texSize);
  const ceilingGeo = new THREE.PlaneGeometry(21, 21);
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: ceilTex.map,
    normalMap: ceilTex.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: ceilTex.roughnessMap,
    roughness: 0.86,
    metalness: 0.28,
  });
  const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEIL_H, 4.1);
  scene.add(ceiling);
  disposables.push(ceilingGeo, ceilingMat);

  const beamGeo = new THREE.BoxGeometry(19.0, 0.16, 0.24);
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x1a222d,
    roughness: 0.56,
    metalness: 0.4,
  });
  const beamZs = [-4.2, -1.0, 2.2, 5.4, 8.6, 11.8];
  const beamsInst = new THREE.InstancedMesh(beamGeo, beamMat, beamZs.length);
  const dummy = new THREE.Object3D();
  beamZs.forEach((bz, idx) => {
    dummy.position.set(0, CEIL_H - 0.08, bz);
    dummy.updateMatrix();
    beamsInst.setMatrixAt(idx, dummy.matrix);
  });
  beamsInst.instanceMatrix.needsUpdate = true;
  beamsInst.computeBoundingSphere();
  scene.add(beamsInst);
  disposables.push(beamGeo, beamMat);

  const ledStripGeo = new THREE.BoxGeometry(1.1, 0.03, 0.08);
  const ledStripMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    emissive: chapter.palette === "biolab" ? 0x22c55e : 0x38bdf8,
    emissiveIntensity: 0.85,
    roughness: 0.25,
  });
  const ledZs = [-3.6, 0.4, 7.0, 12.2];
  const ledInst = new THREE.InstancedMesh(ledStripGeo, ledStripMat, ledZs.length);
  ledZs.forEach((lz, idx) => {
    dummy.position.set(0, CEIL_H - 0.02, lz);
    dummy.updateMatrix();
    ledInst.setMatrixAt(idx, dummy.matrix);
  });
  ledInst.instanceMatrix.needsUpdate = true;
  scene.add(ledInst);
  disposables.push(ledStripGeo, ledStripMat);

  // Tubulações industriais + Flanges em InstancedMesh
  const pipeGeo = new THREE.CylinderGeometry(0.055, 0.055, 19.5, 10);
  pipeGeo.rotateX(Math.PI / 2);
  const pipeMat = new THREE.MeshStandardMaterial({
    color: chapter.palette === "engineering" ? 0x5c3420 : 0x2f2824,
    roughness: 0.58,
    metalness: 0.42,
  });
  const pipeOffsets = [-1.18, -1.02, 1.05, 1.2];
  const pipesInst = new THREE.InstancedMesh(pipeGeo, pipeMat, pipeOffsets.length);
  pipeOffsets.forEach((px, idx) => {
    dummy.position.set(px, CEIL_H - 0.21, 4.2);
    dummy.updateMatrix();
    pipesInst.setMatrixAt(idx, dummy.matrix);
  });
  pipesInst.instanceMatrix.needsUpdate = true;
  pipesInst.computeBoundingSphere();
  scene.add(pipesInst);

  const flangeGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10);
  flangeGeo.rotateX(Math.PI / 2);
  const flangeZs = [-3.0, 1.0, 5.0, 9.0, 12.5];
  const flangesInst = new THREE.InstancedMesh(
    flangeGeo,
    beamMat,
    pipeOffsets.length * flangeZs.length
  );
  let fIdx = 0;
  for (const px of pipeOffsets) {
    for (const fz of flangeZs) {
      dummy.position.set(px, CEIL_H - 0.21, fz);
      dummy.updateMatrix();
      flangesInst.setMatrixAt(fIdx++, dummy.matrix);
    }
  }
  flangesInst.instanceMatrix.needsUpdate = true;
  scene.add(flangesInst);
  disposables.push(pipeGeo, pipeMat, flangeGeo);

  // Escotilha de ventilação com moldura e aletas metálicas onde o Newborn cai (Z = 8.2)
  const ventRimBase = new THREE.BoxGeometry(1.24, 0.09, 0.1);
  const ventBarBase = new THREE.BoxGeometry(1.06, 0.04, 0.045);
  const ventParts: THREE.BufferGeometry[] = [
    placeGeo(ventRimBase, 0, CEIL_H - 0.045, 8.2 - 0.57),
    placeGeo(ventRimBase, 0, CEIL_H - 0.045, 8.2 + 0.57),
    placeGeo(ventRimBase, -0.57, CEIL_H - 0.045, 8.2, 0, Math.PI / 2),
    placeGeo(ventRimBase, 0.57, CEIL_H - 0.045, 8.2, 0, Math.PI / 2),
  ];
  for (let s = -2; s <= 2; s++) {
    ventParts.push(placeGeo(ventBarBase, 0, CEIL_H - 0.05, 8.2 + s * 0.2, 0.35));
  }
  const ventGeo = mergeNormalizedGeometries(ventParts);
  scene.add(new THREE.Mesh(ventGeo, beamMat));
  ventRimBase.dispose();
  ventBarBase.dispose();
  disposables.push(ventGeo);

  // Cabo elétrico rompido pendurado soltando faíscas
  const cableGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.45, CEIL_H, 6.0),
      new THREE.Vector3(-1.38, 2.25, 6.1),
      new THREE.Vector3(-1.3, 1.75, 6.2),
    ]),
    8,
    0.022,
    6,
    false
  );
  scene.add(new THREE.Mesh(cableGeo, beamMat));
  disposables.push(cableGeo);

  // Pilastras modulares PBR em InstancedMesh
  const pillarGeo = new THREE.BoxGeometry(0.24, CEIL_H, 0.24);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x1f2734,
    roughness: 0.52,
    metalness: 0.42,
  });
  const pillarPositions = [
    [-9.1, CEIL_H * 0.5, -5.2],
    [-9.1, CEIL_H * 0.5, -1.0],
    [-9.1, CEIL_H * 0.5, 4.0],
    [-9.1, CEIL_H * 0.5, 9.0],
    [-9.1, CEIL_H * 0.5, 13.4],
    [9.1, CEIL_H * 0.5, -5.2],
    [9.1, CEIL_H * 0.5, -1.0],
    [9.1, CEIL_H * 0.5, 4.0],
    [9.1, CEIL_H * 0.5, 9.0],
    [9.1, CEIL_H * 0.5, 13.4],
    [-1.5, CEIL_H * 0.5, 1.4],
    [1.5, CEIL_H * 0.5, 1.4],
    [-1.5, CEIL_H * 0.5, 9.2],
    [1.5, CEIL_H * 0.5, 9.2],
  ];
  const pillarsInst = new THREE.InstancedMesh(
    pillarGeo,
    pillarMat,
    pillarPositions.length
  );
  pillarPositions.forEach(([x, y, z], idx) => {
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    pillarsInst.setMatrixAt(idx, dummy.matrix);
  });
  pillarsInst.instanceMatrix.needsUpdate = true;
  scene.add(pillarsInst);
  disposables.push(pillarGeo, pillarMat);

  // Materiais estruturais compartilhados
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: wallTex.map,
    normalMap: wallTex.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: wallTex.roughnessMap,
    roughness: 0.78,
    metalness: 0.18,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: chapter.palette === "biolab" ? 0x6ee7b7 : 0x94a3b8,
    map: grimyGlassTex,
    roughness: 0.28,
    metalness: 0.08,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const deskMat = new THREE.MeshStandardMaterial({
    color: 0x161c26,
    roughness: 0.7,
    metalness: 0.26,
  });
  const trimSteelMat = new THREE.MeshStandardMaterial({
    color: 0x252f3d,
    roughness: 0.52,
    metalness: 0.4,
  });
  const rustTrimMat = new THREE.MeshStandardMaterial({
    color: 0x452b1e,
    roughness: 0.85,
    metalness: 0.28,
  });
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0x434c59,
    roughness: 0.95,
    metalness: 0.02,
  });
  disposables.push(
    wallMat,
    glassMat,
    deskMat,
    trimSteelMat,
    rustTrimMat,
    paperMat
  );

  // Acumuladores de geometria estática para reduzir drasticamente draw calls
  const wallGeos: THREE.BufferGeometry[] = [];
  const trimGeos: THREE.BufferGeometry[] = [];
  const deskGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const paperGeos: THREE.BufferGeometry[] = [];
  const rustGeos: THREE.BufferGeometry[] = [];

  let coreLight: THREE.PointLight | undefined;
  const tankCoreGeos: THREE.BufferGeometry[] = [];
  let hasIntactTank = false;

  for (const w of chapter.walls) {
    const sx = w.maxX - w.minX;
    const sz = w.maxZ - w.minZ;
    const sy = w.height ?? CEIL_H;
    const cx = (w.minX + w.maxX) * 0.5;
    const cz = (w.minZ + w.maxZ) * 0.5;

    if (w.kind === "tank") {
      // Bio-Tanque de Contenção detalhado (Cap. 4) com anéis, 4 hastes de aço, tubo de vidro e espécime orgânico
      const baseGeo = new THREE.CylinderGeometry(0.76, 0.86, 0.36, 16);
      const ringGeo = new THREE.TorusGeometry(0.78, 0.04, 6, 16);
      const capGeo = new THREE.CylinderGeometry(0.76, 0.76, 0.34, 16);
      const strutGeo = new THREE.CylinderGeometry(0.032, 0.032, 2.2, 6);
      const tubeGeo = new THREE.CylinderGeometry(0.65, 0.65, 2.1, 16);
      const specimenGeo = new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.06, -0.7),
          new THREE.Vector2(0.24, -0.35),
          new THREE.Vector2(0.16, 0.0),
          new THREE.Vector2(0.28, 0.35),
          new THREE.Vector2(0.14, 0.65),
          new THREE.Vector2(0.04, 0.8),
        ],
        10
      );

      deskGeos.push(
        placeGeo(baseGeo, cx, 0.18, cz),
        placeGeo(capGeo, cx, CEIL_H - 0.17, cz)
      );
      trimGeos.push(
        placeGeo(ringGeo, cx, 0.37, cz, Math.PI / 2),
        placeGeo(ringGeo, cx, CEIL_H - 0.35, cz, Math.PI / 2)
      );
      for (let a = 0; a < 4; a++) {
        const ang = (a * Math.PI) / 2 + Math.PI / 4;
        trimGeos.push(
          placeGeo(
            strutGeo,
            cx + Math.cos(ang) * 0.72,
            1.42,
            cz + Math.sin(ang) * 0.72
          )
        );
      }
      glassGeos.push(placeGeo(tubeGeo, cx, 1.43, cz));
      if (w.id !== "bio-tank-sw") {
        hasIntactTank = true;
        tankCoreGeos.push(placeGeo(specimenGeo, cx, 1.38, cz));
      }

      baseGeo.dispose();
      ringGeo.dispose();
      capGeo.dispose();
      strutGeo.dispose();
      tubeGeo.dispose();
      specimenGeo.dispose();
      continue;
    }

    if (w.kind === "core") {
      // Núcleo Azul de Fusão (Cap. 5) com pedestais chanfrados, aletas e anéis magnéticos
      const coreBaseGeo = new THREE.CylinderGeometry(1.75, 2.05, 0.56, 8);
      const coreTopGeo = new THREE.CylinderGeometry(2.05, 1.75, 0.54, 8);
      const finGeo = new THREE.BoxGeometry(0.12, 1.85, 0.32);
      const ringGeo = new THREE.TorusGeometry(1.42, 0.065, 8, 22);
      const plasmaGeo = new THREE.CylinderGeometry(1.02, 1.02, 1.85, 18);
      const plasmaMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 1.65,
        roughness: 0.15,
      });

      deskGeos.push(
        placeGeo(coreBaseGeo, cx, 0.28, cz, 0, Math.PI / 8),
        placeGeo(coreTopGeo, cx, CEIL_H - 0.27, cz, 0, Math.PI / 8)
      );
      for (let f = 0; f < 4; f++) {
        const ang = (f * Math.PI) / 2 + Math.PI / 4;
        trimGeos.push(
          placeGeo(
            finGeo,
            cx + Math.cos(ang) * 1.55,
            CEIL_H * 0.5,
            cz + Math.sin(ang) * 1.55,
            0,
            -ang
          )
        );
      }
      const plasmaParts: THREE.BufferGeometry[] = [
        placeGeo(plasmaGeo, cx, CEIL_H * 0.5, cz),
        placeGeo(ringGeo, cx, CEIL_H * 0.5 - 0.42, cz, Math.PI / 2 + 0.12),
        placeGeo(ringGeo, cx, CEIL_H * 0.5 + 0.42, cz, Math.PI / 2 - 0.12),
      ];
      const mergedPlasma = mergeNormalizedGeometries(plasmaParts);
      scene.add(new THREE.Mesh(mergedPlasma, plasmaMat));
      coreLight = new THREE.PointLight(0x38bdf8, 3.2, 13, 1.9);
      coreLight.position.set(cx, 1.5, cz);
      scene.add(coreLight);

      coreBaseGeo.dispose();
      coreTopGeo.dispose();
      finGeo.dispose();
      ringGeo.dispose();
      plasmaGeo.dispose();
      disposables.push(mergedPlasma, plasmaMat);
      continue;
    }

    if (w.kind === "bunk") {
      // Beliches detalhados (Cap. 3): 4 postes, longarinas, escada lateral, colchões e travesseiros
      const postGeo = new THREE.BoxGeometry(0.08, sy, 0.08);
      const deckGeo = new THREE.BoxGeometry(sx * 0.94, 0.06, sz * 0.9);
      const railGeo = new THREE.BoxGeometry(sx * 0.72, 0.04, 0.04);
      const rungGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.48, 6);
      const mattressGeo = new THREE.BoxGeometry(sx * 0.88, 0.14, sz * 0.82);
      const pillowGeo = new THREE.BoxGeometry(0.32, 0.07, sz * 0.62);

      for (const px of [-sx * 0.45, sx * 0.45]) {
        for (const pz of [-sz * 0.42, sz * 0.42]) {
          rustGeos.push(placeGeo(postGeo, cx + px, sy * 0.5, cz + pz));
        }
      }
      rustGeos.push(
        placeGeo(deckGeo, cx, 0.43, cz),
        placeGeo(deckGeo, cx, 1.23, cz),
        placeGeo(railGeo, cx + sx * 0.08, 1.48, cz - sz * 0.43)
      );
      for (let r = 0; r < 3; r++) {
        trimGeos.push(
          placeGeo(
            rungGeo,
            cx - sx * 0.25,
            0.45 + r * 0.34,
            cz - sz * 0.45,
            0,
            0,
            Math.PI / 2
          )
        );
      }
      deskGeos.push(
        placeGeo(mattressGeo, cx, 0.53, cz),
        placeGeo(mattressGeo, cx, 1.33, cz)
      );
      paperGeos.push(
        placeGeo(pillowGeo, cx + sx * 0.32, 0.63, cz),
        placeGeo(pillowGeo, cx + sx * 0.32, 1.43, cz)
      );

      postGeo.dispose();
      deckGeo.dispose();
      railGeo.dispose();
      rungGeo.dispose();
      mattressGeo.dispose();
      pillowGeo.dispose();
      continue;
    }

    if (w.kind === "glass") {
      const glassGeo = new THREE.BoxGeometry(sx, 1.85, Math.max(0.06, sz * 0.36));
      glassGeos.push(placeGeo(glassGeo, cx, 1.85, cz));
      glassGeo.dispose();

      const sillGeo = new THREE.BoxGeometry(sx, 0.9, sz);
      const sillCapGeo = new THREE.BoxGeometry(sx + 0.04, 0.06, sz + 0.06);
      deskGeos.push(placeGeo(sillGeo, cx, 0.45, cz));
      trimGeos.push(placeGeo(sillCapGeo, cx, 0.92, cz));
      sillGeo.dispose();
      sillCapGeo.dispose();

      // Montantes verticais metálicos nas divisórias de vidro
      const mullionCount = Math.max(2, Math.round(Math.max(sx, sz) / 0.9));
      const mulGeo = new THREE.BoxGeometry(0.06, 1.9, 0.08);
      for (let m = 0; m <= mullionCount; m++) {
        const t = -0.5 + m / mullionCount;
        const mx = sx >= sz ? cx + t * (sx - 0.06) : cx;
        const mz = sz > sx ? cz + t * (sz - 0.06) : cz;
        trimGeos.push(placeGeo(mulGeo, mx, 1.88, mz));
      }
      mulGeo.dispose();
      continue;
    }

    if (w.kind === "desk") {
      // Balcão / Maca com tampo chanfrado, pés laterais, prancheta e monitor caído
      const topGeo = new THREE.BoxGeometry(sx, 0.08, sz);
      const rimGeo = new THREE.BoxGeometry(sx + 0.07, 0.045, sz + 0.07);
      const panelGeo = new THREE.BoxGeometry(sx * 0.9, sy - 0.08, sz * 0.82);
      const paperGeo = new THREE.BoxGeometry(0.24, 0.015, 0.32);
      const termGeo = new THREE.BoxGeometry(0.32, 0.14, 0.22);

      deskGeos.push(
        placeGeo(panelGeo, cx, (sy - 0.08) * 0.5, cz),
        placeGeo(topGeo, cx, sy - 0.04, cz)
      );
      trimGeos.push(
        placeGeo(rimGeo, cx, sy + 0.01, cz),
        placeGeo(termGeo, cx + sx * 0.2, sy + 0.09, cz, 0, -0.34, 0.12)
      );
      paperGeos.push(placeGeo(paperGeo, cx - sx * 0.22, sy + 0.04, cz + 0.04, 0, 0.28));

      topGeo.dispose();
      rimGeo.dispose();
      panelGeo.dispose();
      paperGeo.dispose();
      termGeo.dispose();
      continue;
    }

    // Parede sólida com Vertex AO + rodapé metálico + sanca superior
    const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
    applyBoxVertexAO(boxGeo, sy);
    wallGeos.push(placeGeo(boxGeo, cx, sy * 0.5, cz));
    boxGeo.dispose();

    if (!w.id.startsWith("outer-") && sy >= 2.2) {
      const skirtGeo = new THREE.BoxGeometry(sx + 0.03, 0.11, sz + 0.03);
      trimGeos.push(
        placeGeo(skirtGeo, cx, 0.055, cz),
        placeGeo(skirtGeo, cx, CEIL_H - 0.055, cz)
      );
      skirtGeo.dispose();
    }

    // Identidade visual para contêineres do Hangar (Cap. 7) e chicanas Ômega (Cap. 6)
    if (w.id.startsWith("hng-crate-")) {
      const ribGeo = new THREE.BoxGeometry(0.08, sy - 0.2, sz + 0.06);
      for (let rx = w.minX + 0.45; rx <= w.maxX - 0.45; rx += 0.65) {
        rustGeos.push(placeGeo(ribGeo, rx, sy * 0.5, cz));
      }
      ribGeo.dispose();
    } else if (w.id.startsWith("omg-baffle-")) {
      const braceGeo = new THREE.BoxGeometry(0.14, sy, sz + 0.12);
      for (let bx = w.minX + 0.8; bx <= w.maxX - 0.8; bx += 2.1) {
        trimGeos.push(placeGeo(braceGeo, bx, sy * 0.5, cz));
      }
      braceGeo.dispose();
    }
  }

  // Props específicos leves por setor (mesclados nas malhas estáticas para zero draw calls extras)
  if (chapter.palette === "medical") {
    // Maca hospitalar + suporte de soro + bandeja inox na Sala de Raio-X/Triagem
    const bedFrame = new THREE.BoxGeometry(1.85, 0.08, 0.78);
    const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.66, 6);
    const ivPole = new THREE.CylinderGeometry(0.018, 0.02, 1.85, 6);
    const trayGeo = new THREE.BoxGeometry(0.55, 0.035, 0.36);
    trimGeos.push(
      placeGeo(bedFrame, -5.6, 0.88, -0.35),
      placeGeo(trayGeo, -5.6, 0.93, -0.35),
      placeGeo(ivPole, -4.55, 0.925, -0.35),
      placeGeo(legGeo, -6.4, 0.33, -0.68),
      placeGeo(legGeo, -4.8, 0.33, -0.68),
      placeGeo(legGeo, -6.4, 0.33, -0.02),
      placeGeo(legGeo, -4.8, 0.33, -0.02)
    );
    bedFrame.dispose();
    legGeo.dispose();
    ivPole.dispose();
    trayGeo.dispose();
  } else if (chapter.palette === "atrium") {
    // Cristais de gelo facetados e dutos criogênicos
    const crystalGeo = new THREE.ConeGeometry(0.22, 0.85, 5);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
      roughness: 0.22,
      metalness: 0.15,
    });
    const crystalMerged = mergeNormalizedGeometries([
      placeGeo(crystalGeo, -2.5, 0.42, 1.5, 0.2, 0.3, -0.15),
      placeGeo(crystalGeo, -2.25, 0.28, 1.45, -0.1, 1.1, 0.35, 0.7, 0.65, 0.7),
      placeGeo(crystalGeo, 2.5, 0.42, 7.1, -0.15, 0.7, 0.2),
      placeGeo(crystalGeo, -5.4, 0.36, 4.1, 0.2, -0.5, 0.15, 0.8, 0.8, 0.8),
    ]);
    scene.add(new THREE.Mesh(crystalMerged, crystalMat));
    crystalGeo.dispose();
    disposables.push(crystalMerged, crystalMat);
  } else if (chapter.palette === "biolab" && hasIntactTank && tankCoreGeos.length > 0) {
    const toxicMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x15803d,
      emissiveIntensity: 0.95,
      roughness: 0.25,
    });
    const mergedTankCores = mergeNormalizedGeometries(tankCoreGeos);
    scene.add(new THREE.Mesh(mergedTankCores, toxicMat));
    disposables.push(mergedTankCores, toxicMat);
  } else if (chapter.palette === "engineering") {
    const valveGeo = new THREE.TorusGeometry(0.24, 0.038, 6, 12);
    const spokeGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.44, 6);
    const stemGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.22, 8);
    const valveMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.45,
      metalness: 0.3,
    });
    const mergedValves = mergeNormalizedGeometries([
      placeGeo(valveGeo, -5.24, 1.35, 5.2, 0, Math.PI / 2),
      placeGeo(spokeGeo, -5.24, 1.35, 5.2, Math.PI / 2, 0, 0),
      placeGeo(spokeGeo, -5.24, 1.35, 5.2, 0, 0, 0),
      placeGeo(valveGeo, 5.24, 1.35, 7.6, 0, Math.PI / 2),
      placeGeo(spokeGeo, 5.24, 1.35, 7.6, Math.PI / 2, 0, 0),
      placeGeo(spokeGeo, 5.24, 1.35, 7.6, 0, 0, 0),
    ]);
    trimGeos.push(
      placeGeo(stemGeo, -5.33, 1.35, 5.2, 0, 0, Math.PI / 2),
      placeGeo(stemGeo, 5.33, 1.35, 7.6, 0, 0, Math.PI / 2)
    );
    scene.add(new THREE.Mesh(mergedValves, valveMat));
    valveGeo.dispose();
    spokeGeo.dispose();
    stemGeo.dispose();
    disposables.push(mergedValves, valveMat);
  } else if (chapter.palette === "omega") {
    const consoleBase = new THREE.BoxGeometry(0.95, 1.05, 0.55);
    const screenTilt = new THREE.BoxGeometry(0.75, 0.32, 0.08);
    deskGeos.push(
      placeGeo(consoleBase, -6.2, 0.525, -0.4),
      placeGeo(consoleBase, 6.2, 0.525, 10.6)
    );
    trimGeos.push(
      placeGeo(screenTilt, -6.2, 1.15, -0.4, -0.55),
      placeGeo(screenTilt, 6.2, 1.15, 10.6, -0.55)
    );
    consoleBase.dispose();
    screenTilt.dispose();
  } else if (chapter.palette === "hangar") {
    const crateGeo = new THREE.BoxGeometry(1.1, 0.85, 1.1);
    const crateMat = new THREE.MeshStandardMaterial({
      color: 0x3f2e21,
      roughness: 0.82,
      metalness: 0.15,
    });
    const mergedCrates = mergeNormalizedGeometries([
      placeGeo(crateGeo, 7.6, 0.425, 10.8),
      placeGeo(crateGeo, -7.8, 0.38, 10.9, 0, 0.25, 0, 0.9, 0.9, 0.9),
      placeGeo(crateGeo, 7.65, 1.2, 10.85, 0, -0.3, 0, 0.65, 0.65, 0.65),
    ]);
    scene.add(new THREE.Mesh(mergedCrates, crateMat));
    crateGeo.dispose();
    disposables.push(mergedCrates, crateMat);
  }

  // Emitir todas as malhas arquitetônicas mescladas (5 draw calls para todo o complexo!)
  if (wallGeos.length > 0) {
    const mergedWalls = mergeNormalizedGeometries(wallGeos, true);
    const wallMesh = new THREE.Mesh(mergedWalls, wallMat);
    wallMesh.castShadow = shadowsEnabled;
    wallMesh.receiveShadow = shadowsEnabled;
    scene.add(wallMesh);
    disposables.push(mergedWalls);
  }
  if (trimGeos.length > 0) {
    const mergedTrim = mergeNormalizedGeometries(trimGeos);
    const trimMesh = new THREE.Mesh(mergedTrim, trimSteelMat);
    trimMesh.receiveShadow = shadowsEnabled;
    scene.add(trimMesh);
    disposables.push(mergedTrim);
  }
  if (deskGeos.length > 0) {
    const mergedDesks = mergeNormalizedGeometries(deskGeos);
    const deskMesh = new THREE.Mesh(mergedDesks, deskMat);
    deskMesh.castShadow = shadowsEnabled;
    deskMesh.receiveShadow = shadowsEnabled;
    scene.add(deskMesh);
    disposables.push(mergedDesks);
  }
  if (rustGeos.length > 0) {
    const mergedRust = mergeNormalizedGeometries(rustGeos);
    scene.add(new THREE.Mesh(mergedRust, rustTrimMat));
    disposables.push(mergedRust);
  }
  if (paperGeos.length > 0) {
    const mergedPapers = mergeNormalizedGeometries(paperGeos);
    scene.add(new THREE.Mesh(mergedPapers, paperMat));
    disposables.push(mergedPapers);
  }
  if (glassGeos.length > 0) {
    const mergedGlass = mergeNormalizedGeometries(glassGeos);
    scene.add(new THREE.Mesh(mergedGlass, glassMat));
    disposables.push(mergedGlass);
  }

  // Silhuetas anatômicas de cadáveres mescladas por material (apenas 2 draw calls)
  const corpseCoatMat = new THREE.MeshStandardMaterial({
    color: 0x1b2028,
    roughness: 0.9,
  });
  const corpseSkinMat = new THREE.MeshStandardMaterial({
    color: 0x646e78,
    roughness: 0.65,
  });
  const cTorsoGeo = new THREE.CylinderGeometry(0.18, 0.15, 0.68, 8);
  const cHeadGeo = new THREE.SphereGeometry(0.125, 10, 10);
  const cLimbGeo = new THREE.CylinderGeometry(0.055, 0.044, 0.62, 8);
  const corpseCoatParts: THREE.BufferGeometry[] = [];
  const corpseSkinParts: THREE.BufferGeometry[] = [];

  for (const cp of chapter.corpses) {
    const grp = new THREE.Group();
    grp.position.set(cp.x, 0, cp.z);
    grp.rotation.y = cp.rotY;
    grp.updateMatrixWorld(true);

    const addPart = (
      target: THREE.BufferGeometry[],
      geo: THREE.BufferGeometry,
      lx: number,
      ly: number,
      lz: number,
      rx = 0,
      ry = 0,
      rz = 0
    ) => {
      const local = placeGeo(geo, lx, ly, lz, rx, ry, rz);
      local.applyMatrix4(grp.matrixWorld);
      target.push(local);
    };

    addPart(corpseCoatParts, cTorsoGeo, 0, 0.12, 0, Math.PI / 2);
    addPart(corpseCoatParts, cLimbGeo, -0.14, 0.06, 0.54, Math.PI / 2, 0, 0.22);
    addPart(corpseCoatParts, cLimbGeo, 0.13, 0.07, 0.5, Math.PI / 2 - 0.12, 0, -0.16);
    addPart(corpseCoatParts, cLimbGeo, 0.34, 0.055, -0.14, 0, 0, Math.PI / 2 - 0.1);
    addPart(corpseSkinParts, cHeadGeo, 0.05, 0.13, -0.44);
  }
  if (corpseCoatParts.length > 0) {
    const mergedCoat = mergeNormalizedGeometries(corpseCoatParts);
    const mergedSkin = mergeNormalizedGeometries(corpseSkinParts);
    scene.add(
      new THREE.Mesh(mergedCoat, corpseCoatMat),
      new THREE.Mesh(mergedSkin, corpseSkinMat)
    );
    disposables.push(mergedCoat, mergedSkin);
  }
  cTorsoGeo.dispose();
  cHeadGeo.dispose();
  cLimbGeo.dispose();
  disposables.push(corpseCoatMat, corpseSkinMat);

  // Poeira atmosférica + nevasca exterior (Cap. 7)
  const sporeCount = Math.max(48, Math.round(180 * particleDensity));
  const sporePositions = new Float32Array(sporeCount * 3);
  for (let i = 0; i < sporeCount; i++) {
    sporePositions[i * 3] = (Math.random() - 0.5) * 18;
    sporePositions[i * 3 + 1] = 0.15 + Math.random() * (CEIL_H - 0.3);
    sporePositions[i * 3 + 2] = -5 + Math.random() * 18.2;
  }
  const sporeGeo = new THREE.BufferGeometry();
  sporeGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(sporePositions, 3)
  );
  const sporeMat = new THREE.PointsMaterial({
    color: chapter.palette === "biolab" ? 0x4ade80 : 0x94a3b8,
    size: 0.032,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const spores = new THREE.Points(sporeGeo, sporeMat);
  scene.add(spores);
  disposables.push(sporeGeo, sporeMat);

  let snowPoints: THREE.Points | undefined;
  if (chapter.palette === "hangar") {
    const snowCount = Math.max(70, Math.round(220 * particleDensity));
    const snowPos = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount; i++) {
      snowPos[i * 3] = (Math.random() - 0.5) * 14;
      snowPos[i * 3 + 1] = Math.random() * 4.5;
      snowPos[i * 3 + 2] = 14.0 + Math.random() * 8;
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
    const snowMat = new THREE.PointsMaterial({
      color: 0xe2e8f0,
      size: 0.06,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    snowPoints = new THREE.Points(snowGeo, snowMat);
    scene.add(snowPoints);
    disposables.push(snowGeo, snowMat);
  }

  // Monitor CRT de vigilância CCTV com suporte metálico e carcaça chanfrada
  const cctvNormalTex = buildCrtFaceTexture(false);
  const cctvSubliminalTex = buildCrtFaceTexture(true);
  const crtScreenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: cctvNormalTex,
    emissive: 0x94a3b8,
    emissiveMap: cctvNormalTex,
    emissiveIntensity: 0.85,
    roughness: 0.25,
  });
  const crtGroup = new THREE.Group();
  const crtBackBase = new THREE.BoxGeometry(0.92, 0.68, 0.34);
  const crtRimBase = new THREE.BoxGeometry(0.98, 0.74, 0.06);
  const crtPoleBase = new THREE.CylinderGeometry(0.038, 0.044, 0.82, 8);
  const crtCaseGeo = mergeNormalizedGeometries([
    placeGeo(crtBackBase, 0, 0, 0),
    placeGeo(crtRimBase, 0, 0, 0.16),
    placeGeo(crtPoleBase, 0, 0.58, -0.04),
  ]);
  const crtScreenGeo = new THREE.PlaneGeometry(0.84, 0.6);
  const crtScreen = new THREE.Mesh(crtScreenGeo, crtScreenMat);
  crtScreen.position.z = 0.195;
  crtGroup.add(new THREE.Mesh(crtCaseGeo, deskMat), crtScreen);
  crtGroup.position.set(
    chapter.crtPosition.x,
    chapter.crtPosition.y,
    chapter.crtPosition.z
  );
  crtGroup.rotation.y = chapter.crtPosition.rotY;
  scene.add(crtGroup);
  crtBackBase.dispose();
  crtRimBase.dispose();
  crtPoleBase.dispose();
  disposables.push(crtScreenMat, crtCaseGeo, crtScreenGeo);

  const interactables: InteractableMarker[] = [];

  // 1. Kit de Estanca (Maleta médica chanfrada com nervuras, fechos, alça e cruz em alto-relevo)
  const kitPickup = new THREE.Group();
  const kitShape = createRoundedBoxShape(0.34, 0.24, 0.03);
  const kitShellRaw = new THREE.ExtrudeGeometry(kitShape, {
    depth: 0.11,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  kitShellRaw.rotateX(-Math.PI / 2);
  const kitRibBase = new THREE.BoxGeometry(0.36, 0.025, 0.03);
  const kitHandleBase = new THREE.TorusGeometry(0.045, 0.011, 6, 10, Math.PI);
  const kitBodyGeo = mergeNormalizedGeometries([
    placeGeo(kitShellRaw, 0, -0.055, 0),
    placeGeo(kitRibBase, 0, 0.015, -0.06),
    placeGeo(kitRibBase, 0, 0.015, 0.06),
    placeGeo(kitHandleBase, 0, 0.0, 0.135, Math.PI / 2),
  ]);
  const kitCrossBar = new THREE.BoxGeometry(0.14, 0.025, 0.045);
  const kitCrossGeo = mergeNormalizedGeometries([
    placeGeo(kitCrossBar, 0, 0.068, 0),
    placeGeo(kitCrossBar, 0, 0.068, 0, 0, Math.PI / 2),
  ]);
  const kitBodyMat = new THREE.MeshStandardMaterial({
    color: 0xdbe2ea,
    roughness: 0.36,
    metalness: 0.3,
  });
  const kitCrossMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 0.85,
  });
  kitPickup.add(
    new THREE.Mesh(kitBodyGeo, kitBodyMat),
    new THREE.Mesh(kitCrossGeo, kitCrossMat)
  );
  kitPickup.position.set(chapter.kitPos.x, 0.12, chapter.kitPos.z);
  scene.add(kitPickup);
  interactables.push({
    id: "pickup_kit",
    label: "Coletar Kit de Estanca",
    x: chapter.kitPos.x,
    y: 0.12,
    z: chapter.kitPos.z,
    mesh: kitPickup,
  });
  kitShellRaw.dispose();
  kitRibBase.dispose();
  kitHandleBase.dispose();
  kitCrossBar.dispose();
  disposables.push(kitBodyGeo, kitCrossGeo, kitBodyMat, kitCrossMat);

  // 2. Cartão / Crachá do Setor com textura real de identificação + clipe metálico
  const badgePickup = new THREE.Group();
  const badgeTex = buildBadgeCardTexture();
  const badgeGeo = new THREE.BoxGeometry(0.22, 0.016, 0.32);
  const badgeClipBase = new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10);
  const badgeRingBase = new THREE.TorusGeometry(0.026, 0.006, 6, 10);
  const badgeClipGeo = mergeNormalizedGeometries([
    placeGeo(badgeClipBase, 0, 0.006, -0.175),
    placeGeo(badgeRingBase, 0, 0.01, -0.205, Math.PI / 2),
  ]);
  const badgeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: badgeTex,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.25,
    roughness: 0.28,
  });
  badgePickup.add(
    new THREE.Mesh(badgeGeo, badgeMat),
    new THREE.Mesh(badgeClipGeo, trimSteelMat)
  );
  badgePickup.position.set(chapter.badgePos.x, 0.1, chapter.badgePos.z);
  scene.add(badgePickup);
  interactables.push({
    id: "pickup_badge",
    label: `Coletar ${chapter.badgeName}`,
    x: chapter.badgePos.x,
    y: 0.1,
    z: chapter.badgePos.z,
    mesh: badgePickup,
  });
  badgeClipBase.dispose();
  badgeRingBase.dispose();
  disposables.push(badgeGeo, badgeClipGeo, badgeMat);

  // 3. Armário Industrial de Aço (0.78m x 2.15m x 0.68m) com frente orientada para +Z local (hideX/hideZ),
  //    4 pés elevados, venezianas 3D reais com frestas oculares, porta texturizada fosca, dobradiças e trinco com cadeado!
  const lockerGroup = new THREE.Group();
  const lockerPbr = buildIndustrialLockerTexture(maxAniso, chapter.id, texSize);
  const lockerInteriorMat = new THREE.MeshStandardMaterial({
    color: 0x151d23,
    roughness: 0.72,
    metalness: 0.36,
    side: THREE.DoubleSide,
  });
  const lockerDoorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: lockerPbr.map,
    normalMap: lockerPbr.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: lockerPbr.roughnessMap,
    roughness: 0.76,
    metalness: 0.32,
  });
  const lockerLatchMat = new THREE.MeshStandardMaterial({
    color: 0x71717a,
    roughness: 0.42,
    metalness: 0.44,
  });

  // Gabinete metálico oco (altura 2.15m sobre pés de 0.08m, largura 0.78m, profundidade 0.68m)
  const lBack = new THREE.BoxGeometry(0.78, 2.07, 0.03);
  const lSide = new THREE.BoxGeometry(0.03, 2.07, 0.68);
  const lTopBot = new THREE.BoxGeometry(0.78, 0.03, 0.68);
  const lFoot = new THREE.BoxGeometry(0.06, 0.08, 0.06);
  const lFrameSide = new THREE.BoxGeometry(0.055, 2.07, 0.04);
  const lFrameH = new THREE.BoxGeometry(0.78, 0.065, 0.04);
  const lShelf = new THREE.BoxGeometry(0.72, 0.025, 0.6);

  const lockerShellGeo = mergeNormalizedGeometries([
    placeGeo(lBack, 0, 1.115, -0.325),
    placeGeo(lSide, -0.375, 1.115, 0),
    placeGeo(lSide, 0.375, 1.115, 0),
    placeGeo(lTopBot, 0, 2.135, 0),
    placeGeo(lTopBot, 0, 0.095, 0),
    placeGeo(lShelf, 0, 1.78, -0.02),
    // 4 pés industriais elevados
    placeGeo(lFoot, -0.34, 0.04, -0.29),
    placeGeo(lFoot, 0.34, 0.04, -0.29),
    placeGeo(lFoot, -0.34, 0.04, 0.29),
    placeGeo(lFoot, 0.34, 0.04, 0.29),
    // Moldura frontal recuada (+Z = frente voltada para a sala)
    placeGeo(lFrameSide, -0.362, 1.115, 0.328),
    placeGeo(lFrameSide, 0.362, 1.115, 0.328),
    placeGeo(lFrameH, 0, 2.115, 0.328),
    placeGeo(lFrameH, 0, 0.115, 0.328),
  ]);

  // Folha da porta segmentada mantendo fresta horizontal real na altura dos olhos (y = 1.26..1.38)
  const dLower = new THREE.BoxGeometry(0.67, 1.11, 0.025);
  const dUpper = new THREE.BoxGeometry(0.67, 0.69, 0.025);
  const lockerDoorGeo = mergeNormalizedGeometries([
    placeGeo(dLower, 0, 0.705, 0.338), // y: 0.15..1.26
    placeGeo(dUpper, 0, 1.725, 0.338), // y: 1.38..2.07
  ]);

  // Venezianas horizontais 3D + frestas oculares + plaqueta numérica
  const louverSlat = new THREE.BoxGeometry(0.46, 0.016, 0.024);
  const tagPlate = new THREE.BoxGeometry(0.18, 0.075, 0.012);
  const ventParts3d: THREE.BufferGeometry[] = [
    placeGeo(tagPlate, 0, 1.5, 0.354),
  ];
  for (let i = 0; i < 4; i++) {
    ventParts3d.push(
      placeGeo(louverSlat, 0, 1.66 + i * 0.048, 0.346, 0.42),
      placeGeo(louverSlat, 0, 0.32 + i * 0.048, 0.346, 0.42)
    );
  }
  // 2 aletas finas enquadrando a fresta ocular sem obstruir visão central (y = 1.32)
  ventParts3d.push(
    placeGeo(louverSlat, 0, 1.265, 0.344, 0.35),
    placeGeo(louverSlat, 0, 1.375, 0.344, 0.35)
  );
  const lockerVentsGeo = mergeNormalizedGeometries(ventParts3d);

  // Trinco embutido + argola de cadeado + 3 dobradiças pequenas (sem puxador vertical de geladeira!)
  const latchPlate = new THREE.BoxGeometry(0.055, 0.14, 0.018);
  const haspLoop = new THREE.TorusGeometry(0.018, 0.005, 6, 10);
  const hingeBarrel = new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8);
  const lockerHardwareGeo = mergeNormalizedGeometries([
    placeGeo(latchPlate, 0.275, 1.09, 0.352),
    placeGeo(haspLoop, 0.275, 1.08, 0.366, 0, Math.PI / 2),
    placeGeo(hingeBarrel, -0.338, 0.38, 0.352),
    placeGeo(hingeBarrel, -0.338, 1.12, 0.352),
    placeGeo(hingeBarrel, -0.338, 1.88, 0.352),
  ]);

  lockerGroup.add(
    new THREE.Mesh(lockerShellGeo, lockerInteriorMat),
    new THREE.Mesh(lockerDoorGeo, lockerDoorMat),
    new THREE.Mesh(lockerVentsGeo, trimSteelMat),
    new THREE.Mesh(lockerHardwareGeo, lockerLatchMat)
  );
  lockerGroup.position.set(chapter.lockerPos.x, 0, chapter.lockerPos.z);
  lockerGroup.rotation.y = chapter.lockerPos.rotY;
  scene.add(lockerGroup);
  interactables.push({
    id: "locker_xray",
    label: "Esconder no Armário de Aço",
    x: chapter.lockerPos.hideX,
    y: 1.15,
    z: chapter.lockerPos.hideZ,
    mesh: lockerGroup,
  });

  lBack.dispose();
  lSide.dispose();
  lTopBot.dispose();
  lFoot.dispose();
  lFrameSide.dispose();
  lFrameH.dispose();
  lShelf.dispose();
  dLower.dispose();
  dUpper.dispose();
  louverSlat.dispose();
  tagPlate.dispose();
  latchPlate.dispose();
  haspLoop.dispose();
  hingeBarrel.dispose();
  disposables.push(
    lockerShellGeo,
    lockerDoorGeo,
    lockerVentsGeo,
    lockerHardwareGeo,
    lockerInteriorMat,
    lockerDoorMat,
    lockerLatchMat
  );

  // 4. Painel de Relés de Emergência (caixa industrial, placa gráfica, alavancas, fusíveis e cabos TubeGeometry)
  const relayGroup = new THREE.Group();
  const relayFaceTex = buildRelayFaceTexture();
  const relayBoxBase = new THREE.BoxGeometry(0.88, 1.15, 0.22);
  const relayLipBase = new THREE.BoxGeometry(0.94, 0.06, 0.26);
  const relayHingeBase = new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8);
  const relayBoxGeo = mergeNormalizedGeometries([
    placeGeo(relayBoxBase, 0, 0, 0),
    placeGeo(relayLipBase, 0, 0.56, -0.02),
    placeGeo(relayLipBase, 0, -0.56, -0.02),
    placeGeo(relayHingeBase, 0.43, 0, -0.11),
  ]);
  const relayFaceGeo = new THREE.PlaneGeometry(0.74, 0.88);
  const relayFaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: relayFaceTex,
    roughness: 0.45,
    metalness: 0.22,
  });
  const relayFace = new THREE.Mesh(relayFaceGeo, relayFaceMat);
  relayFace.rotation.y = Math.PI; // voltado para -Z (interior da sala)
  relayFace.position.z = -0.114;

  // Alavancas de disjuntor + fusíveis + 3 cabos coloridos em curva (Ciano / Âmbar / Vermelho)
  const toggleBase = new THREE.BoxGeometry(0.055, 0.14, 0.055);
  const fuseBase = new THREE.CylinderGeometry(0.026, 0.026, 0.07, 8);
  const relaySwitchGeo = mergeNormalizedGeometries([
    placeGeo(toggleBase, -0.2, 0.05, -0.14, -0.45),
    placeGeo(toggleBase, 0.0, 0.05, -0.14, 0.45),
    placeGeo(toggleBase, 0.2, 0.05, -0.14, -0.45),
    placeGeo(fuseBase, -0.18, -0.24, -0.135, Math.PI / 2),
    placeGeo(fuseBase, 0.18, -0.24, -0.135, Math.PI / 2),
  ]);

  const cableCyanMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    roughness: 0.35,
  });
  const cableAmberMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.35,
  });
  const cableRedMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.35,
  });
  const makeCable = (xOff: number) =>
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(xOff, -0.22, -0.12),
        new THREE.Vector3(xOff * 0.7, -0.46, -0.18),
        new THREE.Vector3(xOff * 0.4, -0.68, -0.1),
      ]),
      6,
      0.016,
      6,
      false
    );
  const cCyanGeo = makeCable(-0.22);
  const cAmberGeo = makeCable(0.0);
  const cRedGeo = makeCable(0.22);

  const relayIndGeo = new THREE.BoxGeometry(0.58, 0.08, 0.05);
  const relayStatusMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.25,
  });
  const relayInd = new THREE.Mesh(relayIndGeo, relayStatusMat);
  relayInd.position.set(0, 0.38, -0.135);

  relayGroup.add(
    new THREE.Mesh(relayBoxGeo, deskMat),
    relayFace,
    new THREE.Mesh(relaySwitchGeo, trimSteelMat),
    new THREE.Mesh(cCyanGeo, cableCyanMat),
    new THREE.Mesh(cAmberGeo, cableAmberMat),
    new THREE.Mesh(cRedGeo, cableRedMat),
    relayInd
  );
  relayGroup.position.set(chapter.relayPos.x, 1.38, chapter.relayPos.z);
  scene.add(relayGroup);
  interactables.push({
    id: "relay_panel",
    label: "Painel de Relés de Emergência",
    x: chapter.relayPos.x,
    y: 1.38,
    z: chapter.relayPos.z - 0.35,
    mesh: relayGroup,
  });
  relayBoxBase.dispose();
  relayLipBase.dispose();
  relayHingeBase.dispose();
  toggleBase.dispose();
  fuseBase.dispose();
  disposables.push(
    relayBoxGeo,
    relayFaceGeo,
    relayFaceMat,
    relaySwitchGeo,
    cCyanGeo,
    cAmberGeo,
    cRedGeo,
    cableCyanMat,
    cableAmberMat,
    cableRedMat,
    relayIndGeo,
    relayStatusMat
  );

  // 5. Comporta Blindada de Saída (pilares chanfrados, pistões hidráulicos, X-bracing, visor sujo e teclado digital)
  const exitDoorGroup = new THREE.Group();
  const frameSideBase = new THREE.BoxGeometry(0.32, CEIL_H, 0.38);
  const frameTopBase = new THREE.BoxGeometry(2.74, 0.36, 0.4);
  const pistonBase = new THREE.CylinderGeometry(0.045, 0.055, 2.2, 8);
  const padCaseBase = new THREE.BoxGeometry(0.28, 0.42, 0.1);
  const exitFrameGeo = mergeNormalizedGeometries([
    placeGeo(frameSideBase, -1.2, CEIL_H * 0.5, 0),
    placeGeo(frameSideBase, 1.2, CEIL_H * 0.5, 0),
    placeGeo(frameTopBase, 0, CEIL_H - 0.18, 0),
    placeGeo(pistonBase, -1.03, 1.28, -0.14),
    placeGeo(pistonBase, 1.03, 1.28, -0.14),
    placeGeo(padCaseBase, 1.2, 1.3, -0.2),
  ]);

  const exitDoorMat = new THREE.MeshStandardMaterial({
    color: 0x1a2230,
    roughness: 0.44,
    metalness: 0.42,
  });
  const exitDoorLightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.5,
  });
  const keypadTex = buildKeypadPanelTexture();
  const keypadScreenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: keypadTex,
    emissive: 0x2dd4bf,
    emissiveMap: keypadTex,
    emissiveIntensity: 0.65,
    roughness: 0.25,
  });

  // Folha da comporta blindada com nervuras estruturais em X + barra de travamento
  const doorSlabBase = new THREE.BoxGeometry(2.08, 2.5, 0.2);
  const ribDiagBase = new THREE.BoxGeometry(0.11, 2.3, 0.24);
  const ribHBase = new THREE.BoxGeometry(1.96, 0.14, 0.26);
  const exitDoorGeo = mergeNormalizedGeometries([
    placeGeo(doorSlabBase, 0, 0, 0),
    placeGeo(ribHBase, 0, 0.0, 0),
    placeGeo(ribHBase, 0, 0.92, 0),
    placeGeo(ribHBase, 0, -0.92, 0),
    placeGeo(ribDiagBase, 0, 0, 0, 0, 0, 0.68),
    placeGeo(ribDiagBase, 0, 0, 0, 0, 0, -0.68),
  ]);
  const exitDoorMesh = new THREE.Mesh(exitDoorGeo, exitDoorMat);
  exitDoorMesh.position.set(0, 1.25, 0);

  // Pequena vigia de vidro reforçado na comporta
  const viewportGlassGeo = new THREE.PlaneGeometry(0.46, 0.22);
  const viewportGlass = new THREE.Mesh(viewportGlassGeo, glassMat);
  viewportGlass.rotation.y = Math.PI;
  viewportGlass.position.set(0, 0.42, -0.115);
  exitDoorMesh.add(viewportGlass);

  const keypadScreenGeo = new THREE.PlaneGeometry(0.22, 0.34);
  const keypadMesh = new THREE.Mesh(keypadScreenGeo, keypadScreenMat);
  keypadMesh.rotation.y = Math.PI;
  keypadMesh.position.set(1.2, 1.3, -0.255);

  const exitLampGeo = new THREE.BoxGeometry(1.55, 0.08, 0.12);
  const exitLamp = new THREE.Mesh(exitLampGeo, exitDoorLightMat);
  exitLamp.position.set(0, CEIL_H - 0.38, -0.22);

  exitDoorGroup.add(
    new THREE.Mesh(exitFrameGeo, deskMat),
    exitDoorMesh,
    keypadMesh,
    exitLamp
  );
  exitDoorGroup.position.set(chapter.exitPos.x, 0, chapter.exitPos.z);
  scene.add(exitDoorGroup);
  interactables.push({
    id: "exit_door",
    label: "Comporta de Saída (PIN)",
    x: chapter.exitPos.x,
    y: 1.3,
    z: chapter.exitPos.z - 0.4,
    mesh: exitDoorGroup,
  });

  frameSideBase.dispose();
  frameTopBase.dispose();
  pistonBase.dispose();
  padCaseBase.dispose();
  doorSlabBase.dispose();
  ribDiagBase.dispose();
  ribHBase.dispose();
  disposables.push(
    exitFrameGeo,
    exitDoorGeo,
    viewportGlassGeo,
    keypadScreenGeo,
    exitLampGeo,
    exitDoorMat,
    exitDoorLightMat,
    keypadScreenMat
  );

  // 5.1 Mapa Iluminado de Parede ("VOCÊ ESTÁ AQUI")
  const wallMapGroup = new THREE.Group();
  const wallMapTex = buildWallMapCanvasTexture(chapter);
  const wallMapFrameGeo = new THREE.BoxGeometry(1.12, 0.86, 0.08);
  const wallMapScreenGeo = new THREE.PlaneGeometry(0.96, 0.72);
  const wallMapScreenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: wallMapTex,
    emissive: 0x38bdf8,
    emissiveMap: wallMapTex,
    emissiveIntensity: 0.95,
    roughness: 0.22,
  });
  const wallMapStatusMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.1,
  });
  const wmFrame = new THREE.Mesh(wallMapFrameGeo, deskMat);
  const wmScreen = new THREE.Mesh(wallMapScreenGeo, wallMapScreenMat);
  wmScreen.position.z = 0.045;
  const wmLedGeo = new THREE.BoxGeometry(0.96, 0.04, 0.09);
  const wmLed = new THREE.Mesh(wmLedGeo, wallMapStatusMat);
  wmLed.position.y = 0.45;
  wallMapGroup.add(wmFrame, wmScreen, wmLed);
  wallMapGroup.position.set(chapter.wallMapPos.x, 1.38, chapter.wallMapPos.z);
  wallMapGroup.rotation.y = chapter.wallMapPos.rotY;
  scene.add(wallMapGroup);
  interactables.push({
    id: "wall_map",
    label: "Escanear Mapa do Setor",
    x: chapter.wallMapPos.x,
    y: 1.38,
    z: chapter.wallMapPos.z,
    mesh: wallMapGroup,
  });
  disposables.push(
    wallMapTex,
    wallMapFrameGeo,
    wallMapScreenGeo,
    wmLedGeo,
    wallMapScreenMat,
    wallMapStatusMat
  );

  // 5.2 Porta de Contenção Temporária (com nervuras blindadas + trilho superior + painel pedestal)
  const cw = chapter.containmentDoor.wall;
  const cdW = Math.max(0.25, cw.maxX - cw.minX);
  const cdD = Math.max(0.25, cw.maxZ - cw.minZ);
  const cdSlabBase = new THREE.BoxGeometry(cdW, 2.55, cdD);
  const cdRibBase = new THREE.BoxGeometry(cdW + 0.04, 0.12, cdD + 0.06);
  const cdGeo = mergeNormalizedGeometries([
    placeGeo(cdSlabBase, 0, 0, 0),
    placeGeo(cdRibBase, 0, -0.65, 0),
    placeGeo(cdRibBase, 0, 0.0, 0),
    placeGeo(cdRibBase, 0, 0.65, 0),
  ]);
  const containmentDoorMat = new THREE.MeshStandardMaterial({
    color: 0x263242,
    roughness: 0.44,
    metalness: 0.36,
  });
  const containmentPanelMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.2,
  });
  const containmentDoorMesh = new THREE.Mesh(cdGeo, containmentDoorMat);
  containmentDoorMesh.position.set(
    (cw.minX + cw.maxX) * 0.5,
    3.65,
    (cw.minZ + cw.maxZ) * 0.5
  );
  scene.add(containmentDoorMesh);

  const cdPostGeo = new THREE.BoxGeometry(0.14, 1.35, 0.12);
  const cdPost = new THREE.Mesh(cdPostGeo, deskMat);
  cdPost.position.set(chapter.containmentDoor.panelX, 0.675, chapter.containmentDoor.panelZ);
  scene.add(cdPost);

  const cdPanelGeo = new THREE.BoxGeometry(0.26, 0.36, 0.14);
  const cdPanel = new THREE.Mesh(cdPanelGeo, containmentPanelMat);
  cdPanel.position.set(chapter.containmentDoor.panelX, 1.38, chapter.containmentDoor.panelZ);
  scene.add(cdPanel);
  interactables.push({
    id: "containment_door",
    label: chapter.containmentDoor.label,
    x: chapter.containmentDoor.panelX,
    y: 1.35,
    z: chapter.containmentDoor.panelZ,
    mesh: cdPanel,
  });
  cdSlabBase.dispose();
  cdRibBase.dispose();
  disposables.push(
    cdGeo,
    cdPostGeo,
    cdPanelGeo,
    containmentDoorMat,
    containmentPanelMat
  );

  // 5.3 Isca Sonora (emissor acústico torneado com aletas e antena)
  const decoyPickup = new THREE.Group();
  const decoyCoreBase = new THREE.CylinderGeometry(0.065, 0.085, 0.2, 12);
  const decoyCapBase = new THREE.CylinderGeometry(0.04, 0.065, 0.04, 12);
  const decoyAntBase = new THREE.CylinderGeometry(0.006, 0.008, 0.09, 6);
  const decoyBodyGeo = mergeNormalizedGeometries([
    placeGeo(decoyCoreBase, 0, 0, 0),
    placeGeo(decoyCapBase, 0, 0.12, 0),
    placeGeo(decoyAntBase, 0.025, 0.16, 0),
  ]);
  const decoyRingGeo = new THREE.TorusGeometry(0.082, 0.016, 6, 12);
  const decoyMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
    metalness: 0.38,
  });
  const activeDecoyLedMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 1.6,
  });
  const dBody = new THREE.Mesh(decoyBodyGeo, decoyMat);
  const dRing = new THREE.Mesh(decoyRingGeo, activeDecoyLedMat);
  dRing.rotation.x = Math.PI / 2;
  dRing.position.y = 0.075;
  decoyPickup.add(dBody, dRing);
  decoyPickup.position.set(chapter.decoyPos.x, 0.14, chapter.decoyPos.z);
  scene.add(decoyPickup);
  interactables.push({
    id: "pickup_decoy",
    label: "Coletar Isca Sonora",
    x: chapter.decoyPos.x,
    y: 0.14,
    z: chapter.decoyPos.z,
    mesh: decoyPickup,
  });

  const activeDecoyGroup = decoyPickup.clone();
  activeDecoyGroup.visible = false;
  scene.add(activeDecoyGroup);
  decoyCoreBase.dispose();
  decoyCapBase.dispose();
  decoyAntBase.dispose();
  disposables.push(decoyBodyGeo, decoyRingGeo, decoyMat, activeDecoyLedMat);

  // 5.4 Armadilhas Sonoras no Chão (cacos prismáticos de vidro estilhaçado + poças fundas)
  const shardBase = new THREE.ConeGeometry(0.065, 0.14, 3);
  const trapGlassMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.14,
    metalness: 0.28,
    transparent: true,
    opacity: 0.72,
  });
  const glassTrapParts: THREE.BufferGeometry[] = [];
  const waterTrapParts: THREE.BufferGeometry[] = [];
  const trapDiscBase = new THREE.CircleGeometry(0.75, 10);

  for (const trap of chapter.soundTraps) {
    if (trap.kind === "glass") {
      for (let s = 0; s < 14; s++) {
        const ang = s * 2.39996;
        const rad = Math.sqrt((s + 0.5) / 14) * trap.radius * 0.85;
        glassTrapParts.push(
          placeGeo(
            shardBase,
            trap.x + Math.cos(ang) * rad,
            0.018,
            trap.z + Math.sin(ang) * rad,
            Math.PI * 0.48,
            ang,
            0.25,
            0.7 + (s % 3) * 0.3,
            0.9 + (s % 2) * 0.4,
            0.25
          )
        );
      }
    } else {
      waterTrapParts.push(
        placeGeo(
          trapDiscBase,
          trap.x,
          0.016,
          trap.z,
          -Math.PI / 2,
          0,
          0,
          trap.radius,
          trap.radius,
          1
        )
      );
    }
  }
  if (glassTrapParts.length > 0) {
    const mergedShards = mergeNormalizedGeometries(glassTrapParts);
    scene.add(new THREE.Mesh(mergedShards, trapGlassMat));
    disposables.push(mergedShards);
  }
  if (waterTrapParts.length > 0) {
    const mergedTrapsW = mergeNormalizedGeometries(waterTrapParts);
    scene.add(new THREE.Mesh(mergedTrapsW, waterPuddleMat));
    disposables.push(mergedTrapsW);
  }
  shardBase.dispose();
  trapDiscBase.dispose();
  disposables.push(trapGlassMat);

  // 5.5 2 Logs de Sobreviventes Coletáveis (PADD tático com cantoneiras reforçadas e antena)
  const logSlabBase = new THREE.BoxGeometry(0.24, 0.028, 0.32);
  const logBumpBase = new THREE.BoxGeometry(0.26, 0.036, 0.055);
  const logBodyGeo = mergeNormalizedGeometries([
    placeGeo(logSlabBase, 0, 0, 0),
    placeGeo(logBumpBase, 0, 0, -0.145),
    placeGeo(logBumpBase, 0, 0, 0.145),
  ]);
  const logScreenGeo = new THREE.PlaneGeometry(0.18, 0.22);
  const logBodyMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.48,
    metalness: 0.3,
  });
  const logScreenMat = new THREE.MeshStandardMaterial({
    color: 0xfde68a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.0,
  });
  const buildLogPickup = (idx: 0 | 1) => {
    const spec = chapter.survivorLogs[idx];
    const g = new THREE.Group();
    const b = new THREE.Mesh(logBodyGeo, logBodyMat);
    const sc = new THREE.Mesh(logScreenGeo, logScreenMat);
    sc.rotation.x = -Math.PI / 2;
    sc.position.y = 0.017;
    g.add(b, sc);
    g.position.set(spec.x, 0.12, spec.z);
    scene.add(g);
    interactables.push({
      id: `pickup_log_${idx}`,
      label: `Ler Registro: ${spec.author}`,
      x: spec.x,
      y: 0.12,
      z: spec.z,
      mesh: g,
    });
    return g;
  };
  const logPickups: [THREE.Group, THREE.Group] = [
    buildLogPickup(0),
    buildLogPickup(1),
  ];
  logSlabBase.dispose();
  logBumpBase.dispose();
  disposables.push(logBodyGeo, logScreenGeo, logBodyMat, logScreenMat);

  // 5.6 Rastro de Sangue InstancedMesh (até 48 gotas)
  const bloodDropGeo = new THREE.CircleGeometry(0.14, 8);
  bloodDropGeo.rotateX(-Math.PI / 2);
  const bloodDropsInst = new THREE.InstancedMesh(bloodDropGeo, bloodPuddleMat, 48);
  bloodDropsInst.count = 0;
  bloodDropsInst.frustumCulled = false;
  scene.add(bloodDropsInst);
  disposables.push(bloodDropGeo);

  // 6. Newborn Orgânico + Viewmodel 1ª Pessoa
  const newborn = createNewbornModel(disposables, maxAniso);
  newborn.root.position.set(-1.0, 0, 3.2);
  scene.add(newborn.root);

  const viewmodel = attachFirstPersonViewmodel(camera, disposables);

  // Carregamento assíncrono opcional de `.glb` modular salvo no dispositivo
  let activeDisposed = false;
  let downloadedPropUrl: string | null = null;
  disposables.push({
    dispose: () => {
      activeDisposed = true;
      if (downloadedPropUrl) {
        URL.revokeObjectURL(downloadedPropUrl);
        downloadedPropUrl = null;
      }
    },
  });

  void getChapterAssetBlobUrl(chapter.id, ".glb").then(async (blobUrl) => {
    if (!blobUrl || activeDisposed) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      return;
    }
    downloadedPropUrl = blobUrl;
    const glbProps = await loadGlbModelOrFallback(
      `chapter_props_${chapter.id}`,
      blobUrl,
      renderer
    );
    if (glbProps && !activeDisposed) {
      glbProps.position.set(0, 0, 4.4);
      scene.add(glbProps);
    }
  });

  return {
    newborn,
    viewmodel,
    beaconLight,
    beaconMesh,
    flickerLight,
    sparkLight,
    sparkMesh,
    coreLight,
    crtScreenMat,
    cctvNormalTex,
    cctvSubliminalTex,
    relayStatusMat,
    exitDoorMesh,
    exitDoorLightMat,
    kitPickup,
    badgePickup,
    wallMapGroup,
    wallMapStatusMat,
    containmentDoorMesh,
    containmentPanelMat,
    decoyPickup,
    activeDecoyGroup,
    activeDecoyLedMat,
    logPickups,
    bloodDropsInst,
    lockerGroup,
    relayGroup,
    exitDoorGroup,
    spores,
    snowPoints,
    interactables,
    disposables,
  };
}
