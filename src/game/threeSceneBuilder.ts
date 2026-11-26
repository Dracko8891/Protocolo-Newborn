import * as THREE from "three";
import { ChapterConfig, PHYSICS_PARAMS } from "./gameLogic";
import {
  buildBeamConeTexture,
  buildCeilingGrateTexture,
  buildCrtFaceTexture,
  buildFloorTileTexture,
  buildGrimyGlassTexture,
  buildNewbornSkinMaps,
  buildTricorderScreenTexture,
  buildWallPanelTexture,
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
  lockerGroup: THREE.Group;
  relayGroup: THREE.Group;
  exitDoorGroup: THREE.Group;
  spores: THREE.Points;
  snowPoints?: THREE.Points;
  interactables: InteractableMarker[];
  disposables: Array<{ dispose: () => void }>;
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
    color: 0x161c24,
    roughness: 0.34,
    metalness: 0.82,
  });
  const knurlMat = new THREE.MeshStandardMaterial({
    color: 0x26303d,
    roughness: 0.45,
    metalness: 0.78,
  });
  const flashlightLensMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfde68a,
    emissiveIntensity: 1.6,
    roughness: 0.12,
  });
  const tricorderTex = buildTricorderScreenTexture();
  const tricorderScreenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tricorderTex,
    emissive: 0x67e8f9,
    emissiveMap: tricorderTex,
    emissiveIntensity: 1.35,
    roughness: 0.18,
  });
  const beamConeTex = buildBeamConeTexture();
  const beamConeMat = new THREE.MeshBasicMaterial({
    map: beamConeTex,
    color: 0xfff0d4,
    transparent: true,
    opacity: 0.055,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
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

  // Mão Direita: Lanterna Tática de Dínamo multi-peças + feixe atmosférico
  const rightHand = new THREE.Group();
  rightHand.position.set(0.24, -0.22, -0.38);

  const armGeo = new THREE.CylinderGeometry(0.036, 0.046, 0.34, 12);
  const rightArmMesh = new THREE.Mesh(armGeo, sleeveMat);
  rightArmMesh.rotation.x = Math.PI * 0.42;
  rightArmMesh.position.set(0.03, -0.05, 0.14);

  const gripGeo = new THREE.BoxGeometry(0.052, 0.048, 0.075);
  const rightGlove = new THREE.Mesh(gripGeo, gloveMat);
  rightGlove.position.set(0, -0.005, 0.01);

  const fingerGeo = new THREE.CylinderGeometry(0.008, 0.007, 0.042, 6);
  for (let f = 0; f < 3; f++) {
    const finger = new THREE.Mesh(fingerGeo, gloveMat);
    finger.rotation.z = Math.PI / 2;
    finger.position.set(-0.022, 0.008, -0.018 + f * 0.018);
    rightHand.add(finger);
  }

  const barrelGeo = new THREE.CylinderGeometry(0.019, 0.018, 0.21, 14);
  const barrel = new THREE.Mesh(barrelGeo, metalDarkMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.04);

  const collarGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.055, 14);
  const collar = new THREE.Mesh(collarGeo, knurlMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.012, -0.08);

  const headGeo = new THREE.CylinderGeometry(0.029, 0.021, 0.05, 14);
  const head = new THREE.Mesh(headGeo, metalDarkMat);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.012, -0.155);

  const lensGeo = new THREE.CircleGeometry(0.024, 14);
  const lens = new THREE.Mesh(lensGeo, flashlightLensMat);
  lens.rotation.y = Math.PI;
  lens.position.set(0, 0.012, -0.181);

  // Cone de luz atmosférica sutil na ponta da lanterna
  const beamConeGeo = new THREE.ConeGeometry(0.55, 2.4, 16, 1, true);
  beamConeGeo.translate(0, -1.2, 0);
  beamConeGeo.rotateX(Math.PI / 2);
  const beamConeMesh = new THREE.Mesh(beamConeGeo, beamConeMat);
  beamConeMesh.position.set(0, 0.012, -0.182);

  rightHand.add(
    rightArmMesh,
    rightGlove,
    barrel,
    collar,
    head,
    lens,
    beamConeMesh
  );

  // Mão Esquerda: Tricorder Portátil OLED com moldura chanfrada e botões
  const leftHand = new THREE.Group();
  leftHand.position.set(-0.24, -0.46, -0.34);
  leftHand.rotation.set(0.08, 0.28, -0.06);

  const leftArmMesh = new THREE.Mesh(armGeo, sleeveMat);
  leftArmMesh.rotation.x = Math.PI * 0.44;
  leftArmMesh.position.set(-0.03, -0.06, 0.14);

  const leftGlove = new THREE.Mesh(gripGeo, gloveMat);
  const triBodyGeo = new THREE.BoxGeometry(0.098, 0.152, 0.026);
  const triBody = new THREE.Mesh(triBodyGeo, metalDarkMat);
  triBody.rotation.x = -0.25;
  triBody.position.set(0.01, 0.035, -0.04);

  const triBezelGeo = new THREE.BoxGeometry(0.088, 0.082, 0.028);
  const triBezel = new THREE.Mesh(triBezelGeo, knurlMat);
  triBezel.rotation.x = -0.25;
  triBezel.position.set(0.01, 0.056, -0.036);

  const triScreenGeo = new THREE.PlaneGeometry(0.078, 0.072);
  const triScreen = new THREE.Mesh(triScreenGeo, tricorderScreenMat);
  triScreen.rotation.x = -0.25;
  triScreen.position.set(0.01, 0.056, -0.021);

  const triAntennaGeo = new THREE.CylinderGeometry(0.004, 0.006, 0.038, 8);
  const triAntenna = new THREE.Mesh(triAntennaGeo, knurlMat);
  triAntenna.rotation.x = -0.25;
  triAntenna.position.set(-0.028, 0.122, -0.058);

  leftHand.add(
    leftArmMesh,
    leftGlove,
    triBody,
    triBezel,
    triScreen,
    triAntenna
  );
  root.add(rightHand, leftHand);
  camera.add(root);

  disposables.push(
    armGeo,
    gripGeo,
    fingerGeo,
    barrelGeo,
    collarGeo,
    headGeo,
    lensGeo,
    beamConeGeo,
    triBodyGeo,
    triBezelGeo,
    triScreenGeo,
    triAntennaGeo
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

  // Pele úmida, macilenta, venosa e ferida (MeshPhysicalMaterial orgânico com clearcoat + sheen)
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8ccc9,
    map: skinMaps.map,
    normalMap: skinMaps.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: skinMaps.roughnessMap,
    roughness: 0.48,
    metalness: 0.02,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14,
    sheen: 0.35,
    sheenColor: new THREE.Color(0x4a151b),
  });
  const sinewMat = new THREE.MeshStandardMaterial({
    color: 0x3b2225,
    roughness: 0.44,
    metalness: 0.05,
  });
  const socketMat = new THREE.MeshStandardMaterial({
    color: 0x020102,
    roughness: 0.96,
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
    color: 0x3f0509,
    emissive: 0x100000,
    roughness: 0.18,
    metalness: 0.12,
  });
  const teethMat = new THREE.MeshStandardMaterial({
    color: 0xbcb3a4,
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
  const shadowGeo = new THREE.CircleGeometry(0.58, 20);
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

  // Pernas alongadas e articuladas (coxa + canela inclinada)
  const thighGeo = new THREE.CylinderGeometry(0.078, 0.056, 0.54, 10);
  const shinGeo = new THREE.CylinderGeometry(0.054, 0.036, 0.56, 10);
  for (const side of [-1, 1]) {
    const thigh = new THREE.Mesh(thighGeo, sinewMat);
    thigh.position.set(side * 0.13, 0.78, 0.04);
    thigh.rotation.x = -0.14;
    const shin = new THREE.Mesh(shinGeo, skinMat);
    shin.position.set(side * 0.13, 0.28, -0.02);
    shin.rotation.x = 0.1;
    root.add(thigh, shin);
  }
  disposables.push(thighGeo, shinGeo);

  // Torso curvado orgânico (permite inclinação para frente na caçada)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.02, 0.02);

  const pelvisGeo = new THREE.CylinderGeometry(0.14, 0.11, 0.22, 10);
  const pelvis = new THREE.Mesh(pelvisGeo, sinewMat);
  pelvis.position.y = 0.08;
  torsoGroup.add(pelvis);

  // Coluna vertebral curvada em TubeGeometry + vértebras saltadas
  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.12, -0.05),
    new THREE.Vector3(0, 0.45, -0.09),
    new THREE.Vector3(0, 0.78, 0.02),
    new THREE.Vector3(0, 0.94, 0.12),
  ]);
  const spineTubeGeo = new THREE.TubeGeometry(spineCurve, 12, 0.048, 8, false);
  const spineTube = new THREE.Mesh(spineTubeGeo, sinewMat);
  torsoGroup.add(spineTube);

  const ribCageGeo = new THREE.SphereGeometry(0.185, 14, 12);
  const ribCage = new THREE.Mesh(ribCageGeo, skinMat);
  ribCage.scale.set(1.02, 1.65, 0.72);
  ribCage.position.set(0, 0.48, 0.02);
  ribCage.rotation.x = 0.2;
  ribCage.castShadow = true;
  torsoGroup.add(ribCage);

  const ribGeo = new THREE.TorusGeometry(0.175, 0.017, 6, 12);
  for (let r = 0; r < 5; r++) {
    const rib = new THREE.Mesh(ribGeo, sinewMat);
    rib.rotation.x = Math.PI / 2 + 0.16;
    rib.scale.set(1.16, 0.72, 1);
    rib.position.set(0, 0.28 + r * 0.1, 0.02 + r * 0.01);
    torsoGroup.add(rib);
  }

  const spineKnobGeo = new THREE.SphereGeometry(0.032, 8, 8);
  for (let v = 0; v < 6; v++) {
    const knob = new THREE.Mesh(spineKnobGeo, sinewMat);
    knob.position.set(0, 0.2 + v * 0.13, -0.11 + (v > 3 ? 0.05 : 0));
    torsoGroup.add(knob);
  }

  // Clavículas e ombros ossudos deslocados para frente
  const shoulderGeo = new THREE.BoxGeometry(0.64, 0.09, 0.19);
  const shoulders = new THREE.Mesh(shoulderGeo, sinewMat);
  shoulders.position.set(0, 0.82, 0.08);
  torsoGroup.add(shoulders);

  const clavicleGeo = new THREE.CylinderGeometry(0.022, 0.018, 0.28, 6);
  for (const side of [-1, 1]) {
    const clav = new THREE.Mesh(clavicleGeo, teethMat);
    clav.rotation.z = side * 1.25;
    clav.rotation.y = side * -0.25;
    clav.position.set(side * 0.17, 0.85, 0.15);
    torsoGroup.add(clav);
  }
  disposables.push(clavicleGeo);

  disposables.push(
    pelvisGeo,
    spineTubeGeo,
    ribCageGeo,
    ribGeo,
    spineKnobGeo,
    shoulderGeo
  );

  // Braços compridos de duas articulações (braço + antebraço + garras ensanguentadas)
  const upperArmGeo = new THREE.CylinderGeometry(0.046, 0.035, 0.48, 10);
  const forearmGeo = new THREE.CylinderGeometry(0.034, 0.024, 0.52, 10);
  const clawGeo = new THREE.ConeGeometry(0.022, 0.22, 6);

  const buildArticulatedArm = (xPos: number) => {
    const shoulderGrp = new THREE.Group();
    shoulderGrp.position.set(xPos, 0.8, 0.08);

    const upper = new THREE.Mesh(upperArmGeo, skinMat);
    upper.position.y = -0.23;
    shoulderGrp.add(upper);

    const forearmGrp = new THREE.Group();
    forearmGrp.position.set(0, -0.46, 0);
    const fore = new THREE.Mesh(forearmGeo, sinewMat);
    fore.position.y = -0.25;
    forearmGrp.add(fore);

    for (let f = -1; f <= 1; f++) {
      const claw = new THREE.Mesh(clawGeo, clawBloodMat);
      claw.position.set(f * 0.024, -0.58, 0.03);
      claw.rotation.x = Math.PI - 0.22;
      forearmGrp.add(claw);
    }

    shoulderGrp.add(forearmGrp);
    return { shoulderGrp, forearmGrp };
  };

  const leftBuilt = buildArticulatedArm(-0.34);
  const rightBuilt = buildArticulatedArm(0.34);
  torsoGroup.add(leftBuilt.shoulderGrp, rightBuilt.shoulderGrp);
  disposables.push(upperArmGeo, forearmGeo, clawGeo);

  // Crânio humanoide alongado, encurvado para frente com órbitas fundas e boca rasgada
  const head = new THREE.Group();
  head.position.set(0, 1.03, 0.22);

  const craniumGeo = new THREE.SphereGeometry(0.185, 18, 16);
  const cranium = new THREE.Mesh(craniumGeo, skinMat);
  cranium.scale.set(0.78, 1.28, 1.06);
  cranium.castShadow = true;
  head.add(cranium);

  // Arcada supraciliar saliente sobre órbitas fundas
  const browGeo = new THREE.BoxGeometry(0.24, 0.042, 0.12);
  const brow = new THREE.Mesh(browGeo, sinewMat);
  brow.position.set(0, 0.1, 0.13);
  head.add(brow);
  disposables.push(browGeo);

  const mawGeo = new THREE.SphereGeometry(0.095, 10, 10);
  const mawCavity = new THREE.Mesh(mawGeo, clawBloodMat);
  mawCavity.scale.set(0.85, 0.95, 0.65);
  mawCavity.position.set(0, -0.075, 0.135);
  head.add(mawCavity);

  const socketGeo = new THREE.SphereGeometry(0.056, 10, 10);
  const eyeGeo = new THREE.SphereGeometry(0.019, 10, 10);
  const pupilGeo = new THREE.BoxGeometry(0.006, 0.026, 0.014);
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(socketGeo, socketMat);
    socket.scale.set(0.95, 1.32, 0.52);
    socket.position.set(side * 0.068, 0.048, 0.155);
    const eye = new THREE.Mesh(eyeGeo, eyeGlowMat);
    eye.position.set(side * 0.068, 0.048, 0.178);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(side * 0.068, 0.048, 0.194);
    head.add(socket, eye, pupil);
  }
  disposables.push(craniumGeo, mawGeo, socketGeo, eyeGeo, pupilGeo);

  // Veias neurais pulsantes pelo rosto e pescoço
  const veinGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.09, -0.14, 0.12),
      new THREE.Vector3(-0.14, 0.01, 0.13),
      new THREE.Vector3(-0.1, 0.14, 0.06),
    ]),
    10,
    0.0085,
    6,
    false
  );
  const leftVein = new THREE.Mesh(veinGeo, veinsMat);
  const rightVein = new THREE.Mesh(veinGeo, veinsMat);
  rightVein.scale.x = -1;
  head.add(leftVein, rightVein);
  disposables.push(veinGeo);

  // Mandíbula articulada serrilhada
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.07);
  const jawBlockGeo = new THREE.BoxGeometry(0.13, 0.06, 0.15);
  const jawBlock = new THREE.Mesh(jawBlockGeo, sinewMat);
  jawBlock.position.set(0, -0.025, 0.04);
  jaw.add(jawBlock);

  const toothGeo = new THREE.ConeGeometry(0.01, 0.042, 5);
  for (let t = -2; t <= 2; t++) {
    const lowTooth = new THREE.Mesh(toothGeo, teethMat);
    lowTooth.position.set(t * 0.024, 0.02, 0.098);
    jaw.add(lowTooth);
    const topTooth = new THREE.Mesh(toothGeo, teethMat);
    topTooth.rotation.x = Math.PI;
    topTooth.position.set(t * 0.024, -0.078, 0.148);
    head.add(topTooth);
  }
  head.add(jaw);
  disposables.push(jawBlockGeo, toothGeo);

  torsoGroup.add(head);
  root.add(torsoGroup);

  // Hook assíncrono preparado para substituir por modelo `.glb` rigado real quando hospedado
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
  chapter: ChapterConfig
): MedicalWingHandles {
  const disposables: Array<{ dispose: () => void }> = [];
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const CEIL_H = PHYSICS_PARAMS.ceilingHeight; // 2.85m claustrofóbico

  const bgByTheme: Record<ChapterConfig["palette"], number> = {
    medical: 0x040203,
    atrium: 0x02050a,
    quarters: 0x050402,
    biolab: 0x020604,
    engineering: 0x010204,
    omega: 0x020203,
    hangar: 0x040508,
  };
  const bgHex = bgByTheme[chapter.palette];
  scene.background = new THREE.Color(bgHex);
  scene.fog = new THREE.FogExp2(
    bgHex,
    chapter.palette === "hangar"
      ? 0.12
      : chapter.palette === "engineering"
        ? 0.14
        : 0.115
  );

  // Pipeline global de escuridão realista: AmbientLight <= 0.05
  const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.025);
  scene.add(ambientLight);

  const hemiColorMap: Record<ChapterConfig["palette"], number> = {
    medical: 0x4c1d1d,
    atrium: 0x1e3a5f,
    quarters: 0x452f14,
    biolab: 0x14452f,
    engineering: 0x0f2537,
    omega: 0x27272a,
    hangar: 0x334155,
  };
  const hemiLight = new THREE.HemisphereLight(
    hemiColorMap[chapter.palette],
    0x020305,
    0.08
  );
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(
    chapter.palette === "medical" ? 0xfca5a5 : 0xcbd5e1,
    0.09
  );
  keyLight.position.set(3, 8, 4);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    keyLight.shadow.bias = -0.0005;
  }
  scene.add(keyLight);

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
  const beaconLight = new THREE.PointLight(beaconColor, 2.8, 12, 2.0);
  beaconLight.position.set(0, CEIL_H - 0.28, 4.4);
  scene.add(beaconLight);

  const beaconGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.18, 10);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: beaconColor,
    emissive: beaconColor,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.position.set(0, CEIL_H - 0.1, 4.4);
  scene.add(beaconMesh);
  disposables.push(beaconGeo, beaconMat);

  // Fluorescente piscando no setor norte + Cabo elétrico soltando faíscas
  const flickerLight = new THREE.PointLight(0xbae6fd, 1.0, 9.5, 2.0);
  flickerLight.position.set(0, CEIL_H - 0.25, 10.6);
  scene.add(flickerLight);

  const sparkLight = new THREE.PointLight(0xfbbf24, 0, 5.5, 2.2);
  sparkLight.position.set(-1.3, 1.75, 6.2);
  scene.add(sparkLight);

  const sparkGeo = new THREE.SphereGeometry(0.04, 6, 6);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
  sparkMesh.position.set(-1.3, 1.75, 6.2);
  sparkMesh.visible = false;
  scene.add(sparkMesh);
  disposables.push(sparkGeo, sparkMat);

  // Texturas PBR em cache compartilhado (albedo + normal + roughness)
  const floorTex = buildFloorTileTexture(maxAniso);
  const wallTex = buildWallPanelTexture(maxAniso, chapter.palette);
  const grimyGlassTex = buildGrimyGlassTexture();

  const floorGeo = new THREE.PlaneGeometry(21, 21);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: floorTex.map,
    normalMap: floorTex.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: floorTex.roughnessMap,
    roughness: 0.88,
    metalness: 0.3,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 4.1);
  floor.receiveShadow = !isSoftwareGl;
  scene.add(floor);
  disposables.push(floorGeo, floorMat);

  // Poças escuras de sangue coagulado / fluido químico no chão (sem reflexo cinza artificial)
  const puddleGeo = new THREE.CircleGeometry(1, 14);
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
  disposables.push(puddleGeo, bloodPuddleMat, waterPuddleMat);

  for (const p of chapter.puddles) {
    const pm = new THREE.Mesh(
      puddleGeo,
      p.isBlood ? bloodPuddleMat : waterPuddleMat
    );
    pm.rotation.x = -Math.PI / 2;
    pm.rotation.z = p.x * 0.7;
    pm.scale.set(p.r, p.r * 0.65, 1);
    pm.position.set(p.x, 0.012, p.z);
    scene.add(pm);
  }

  // Teto escuro baixo (2.85m) com grades PBR + vigas estruturais + tubulações longitudinais em InstancedMesh
  const ceilTex = buildCeilingGrateTexture(maxAniso);
  const ceilingGeo = new THREE.PlaneGeometry(21, 21);
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: ceilTex.map,
    normalMap: ceilTex.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: ceilTex.roughnessMap,
    roughness: 0.86,
    metalness: 0.35,
  });
  const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEIL_H, 4.1);
  scene.add(ceiling);
  disposables.push(ceilingGeo, ceilingMat);

  // Vigas transversais no teto + tubulações de conduíte industrial + grade de duto aberto
  const beamGeo = new THREE.BoxGeometry(19.0, 0.16, 0.24);
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x161d27,
    roughness: 0.52,
    metalness: 0.76,
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

  // Tubulações industriais paralelas ao corredor
  const pipeGeo = new THREE.CylinderGeometry(0.055, 0.055, 19.5, 10);
  pipeGeo.rotateX(Math.PI / 2);
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x2a2320,
    roughness: 0.62,
    metalness: 0.65,
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

  // Escotilha escura de ventilação onde o Newborn cai (Z = 8.2)
  const ventGeo = new THREE.BoxGeometry(1.15, 0.08, 1.15);
  const ventHatch = new THREE.Mesh(ventGeo, beamMat);
  ventHatch.position.set(0, CEIL_H - 0.04, 8.2);
  scene.add(ventHatch);
  disposables.push(pipeGeo, pipeMat, ventGeo);

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
  const cableMesh = new THREE.Mesh(cableGeo, beamMat);
  scene.add(cableMesh);
  disposables.push(cableGeo);

  // Pilastras modulares PBR em InstancedMesh (relevo 3D ao longo dos corredores)
  const pillarGeo = new THREE.BoxGeometry(0.24, CEIL_H, 0.24);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x19202a,
    roughness: 0.48,
    metalness: 0.76,
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

  // Materiais modulares PBR de parede, vidro sujo, mobília e bio-tanques
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: wallTex.map,
    normalMap: wallTex.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: wallTex.roughnessMap,
    roughness: 0.78,
    metalness: 0.22,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: chapter.palette === "biolab" ? 0x6ee7b7 : 0x94a3b8,
    map: grimyGlassTex,
    roughness: 0.28,
    metalness: 0.08,
    transparent: true,
    opacity: isSoftwareGl ? 0.36 : 0.45,
    depthWrite: false,
  });
  const deskMat = new THREE.MeshStandardMaterial({
    color: 0x11151d,
    roughness: 0.72,
    metalness: 0.25,
  });
  const rustTrimMat = new THREE.MeshStandardMaterial({
    color: 0x3b2419,
    roughness: 0.88,
    metalness: 0.35,
  });
  disposables.push(wallMat, glassMat, deskMat, rustTrimMat);

  let coreLight: THREE.PointLight | undefined;

  for (const w of chapter.walls) {
    const sx = w.maxX - w.minX;
    const sz = w.maxZ - w.minZ;
    const sy = w.height ?? CEIL_H;
    const cx = (w.minX + w.maxX) * 0.5;
    const cz = (w.minZ + w.maxZ) * 0.5;

    if (w.kind === "tank") {
      // Bio-Tanque de Contenção Verde Tóxico (Cap. 4)
      const baseGeo = new THREE.CylinderGeometry(0.76, 0.84, 0.38, 16);
      const capGeo = new THREE.CylinderGeometry(0.76, 0.76, 0.35, 16);
      const tubeGeo = new THREE.CylinderGeometry(0.66, 0.66, 2.1, 16);
      const coreGeo = new THREE.CylinderGeometry(0.24, 0.18, 1.5, 10);
      const toxicMat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x15803d,
        emissiveIntensity: w.id === "bio-tank-sw" ? 0.18 : 1.05,
        roughness: 0.25,
      });
      const baseM = new THREE.Mesh(baseGeo, deskMat);
      baseM.position.set(cx, 0.19, cz);
      const capM = new THREE.Mesh(capGeo, deskMat);
      capM.position.set(cx, CEIL_H - 0.175, cz);
      const tubeM = new THREE.Mesh(tubeGeo, glassMat);
      tubeM.position.set(cx, 1.43, cz);
      const coreM = new THREE.Mesh(coreGeo, toxicMat);
      coreM.position.set(cx, 1.38, cz);
      scene.add(baseM, capM, tubeM, coreM);
      disposables.push(baseGeo, capGeo, tubeGeo, coreGeo, toxicMat);
      continue;
    }

    if (w.kind === "core") {
      // Núcleo Azul de Fusão (Cap. 5)
      const coreBaseGeo = new THREE.BoxGeometry(sx, 0.55, sz);
      const coreTopGeo = new THREE.BoxGeometry(sx, 0.55, sz);
      const plasmaGeo = new THREE.CylinderGeometry(1.15, 1.15, 1.75, 18);
      const plasmaMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 1.65,
        roughness: 0.15,
      });
      const baseM = new THREE.Mesh(coreBaseGeo, deskMat);
      baseM.position.set(cx, 0.275, cz);
      const topM = new THREE.Mesh(coreTopGeo, deskMat);
      topM.position.set(cx, CEIL_H - 0.275, cz);
      const plasmaM = new THREE.Mesh(plasmaGeo, plasmaMat);
      plasmaM.position.set(cx, CEIL_H * 0.5, cz);
      coreLight = new THREE.PointLight(0x38bdf8, 3.2, 13, 1.9);
      coreLight.position.set(cx, 1.5, cz);
      scene.add(baseM, topM, plasmaM, coreLight);
      disposables.push(coreBaseGeo, coreTopGeo, plasmaGeo, plasmaMat);
      continue;
    }

    if (w.kind === "bunk") {
      // Beliches/Armários de Alojamento (Cap. 3)
      const frameGeo = new THREE.BoxGeometry(sx, sy, sz);
      const frameM = new THREE.Mesh(frameGeo, rustTrimMat);
      frameM.position.set(cx, sy * 0.5, cz);
      const mattressGeo = new THREE.BoxGeometry(sx * 0.88, 0.14, sz * 0.82);
      const mattLower = new THREE.Mesh(mattressGeo, deskMat);
      mattLower.position.set(cx, 0.52, cz);
      const mattUpper = new THREE.Mesh(mattressGeo, deskMat);
      mattUpper.position.set(cx, 1.32, cz);
      scene.add(frameM, mattLower, mattUpper);
      disposables.push(frameGeo, mattressGeo);
      continue;
    }

    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const mat =
      w.kind === "glass" ? glassMat : w.kind === "desk" ? deskMat : wallMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, sy * 0.5, cz);

    if (w.kind === "glass") {
      mesh.geometry.dispose();
      const glassGeo = new THREE.BoxGeometry(sx, 1.85, sz * 0.38);
      mesh.geometry = glassGeo;
      mesh.position.set(cx, 1.85, cz);
      const sillGeo = new THREE.BoxGeometry(sx, 0.9, sz);
      const sill = new THREE.Mesh(sillGeo, deskMat);
      sill.position.set(cx, 0.45, cz);
      scene.add(sill);
      disposables.push(sillGeo);
    }

    if (w.kind === "desk") {
      // Balcão / Mesa com tampo chanfrado + prancheta e terminal caído em cima
      const rimGeo = new THREE.BoxGeometry(sx + 0.08, 0.06, sz + 0.08);
      const rim = new THREE.Mesh(rimGeo, rustTrimMat);
      rim.position.set(cx, sy + 0.02, cz);
      const paperGeo = new THREE.BoxGeometry(0.26, 0.014, 0.34);
      const paperMat = new THREE.MeshStandardMaterial({
        color: 0x3b424c,
        roughness: 0.96,
        metalness: 0.02,
      });
      const paper = new THREE.Mesh(paperGeo, paperMat);
      paper.position.set(cx - 0.38, sy + 0.055, cz + 0.04);
      paper.rotation.y = 0.28;
      scene.add(rim, paper);
      disposables.push(rimGeo, paperGeo, paperMat);
    }

    mesh.castShadow = !isSoftwareGl && w.kind !== "glass";
    mesh.receiveShadow = !isSoftwareGl;
    scene.add(mesh);
    disposables.push(mesh.geometry);
  }

  // Silhuetas de cadáveres caídos no chão (storytelling ambiental de horror)
  const corpseCoatMat = new THREE.MeshStandardMaterial({
    color: 0x1b2028,
    roughness: 0.9,
  });
  const corpseSkinMat = new THREE.MeshStandardMaterial({
    color: 0x646e78,
    roughness: 0.65,
  });
  const cTorsoGeo = new THREE.BoxGeometry(0.42, 0.2, 0.72);
  const cHeadGeo = new THREE.SphereGeometry(0.13, 10, 10);
  const cLimbGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.65, 8);
  disposables.push(corpseCoatMat, corpseSkinMat, cTorsoGeo, cHeadGeo, cLimbGeo);

  for (const cp of chapter.corpses) {
    const grp = new THREE.Group();
    const torso = new THREE.Mesh(cTorsoGeo, corpseCoatMat);
    torso.position.set(0, 0.1, 0);
    const head = new THREE.Mesh(cHeadGeo, corpseSkinMat);
    head.position.set(0.04, 0.13, -0.44);
    const leg1 = new THREE.Mesh(cLimbGeo, corpseCoatMat);
    leg1.rotation.x = Math.PI / 2;
    leg1.rotation.z = 0.2;
    leg1.position.set(-0.12, 0.06, 0.58);
    const leg2 = new THREE.Mesh(cLimbGeo, corpseCoatMat);
    leg2.rotation.x = Math.PI / 2;
    leg2.rotation.z = -0.15;
    leg2.position.set(0.12, 0.06, 0.56);
    const arm = new THREE.Mesh(cLimbGeo, corpseCoatMat);
    arm.rotation.z = Math.PI / 2 - 0.1;
    arm.position.set(0.36, 0.06, -0.12);
    grp.add(torso, head, leg1, leg2, arm);
    grp.position.set(cp.x, 0, cp.z);
    grp.rotation.y = cp.rotY;
    scene.add(grp);
  }

  // Partículas sutis de poeira atmosférica na luz
  const sporeCount = 180;
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
    opacity: 0.38,
    depthWrite: false,
  });
  const spores = new THREE.Points(sporeGeo, sporeMat);
  scene.add(spores);
  disposables.push(sporeGeo, sporeMat);

  // Nevasca exterior além da comporta norte no Capítulo 7 (Hangar)
  let snowPoints: THREE.Points | undefined;
  if (chapter.palette === "hangar") {
    const snowCount = 220;
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

  // Monitor CRT de vigilância CCTV escuro com granulação e flashes subliminares
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
  const crtCaseGeo = new THREE.BoxGeometry(0.95, 0.72, 0.36);
  const crtScreenGeo = new THREE.PlaneGeometry(0.84, 0.62);
  const crtPoleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8);
  const crtCase = new THREE.Mesh(crtCaseGeo, deskMat);
  const crtScreen = new THREE.Mesh(crtScreenGeo, crtScreenMat);
  crtScreen.position.z = 0.19;
  const crtPole = new THREE.Mesh(crtPoleGeo, deskMat);
  crtPole.position.y = 0.6;
  crtGroup.add(crtCase, crtScreen, crtPole);
  crtGroup.position.set(
    chapter.crtPosition.x,
    chapter.crtPosition.y,
    chapter.crtPosition.z
  );
  crtGroup.rotation.y = chapter.crtPosition.rotY;
  scene.add(crtGroup);
  disposables.push(crtScreenMat, crtCaseGeo, crtScreenGeo, crtPoleGeo);

  const interactables: InteractableMarker[] = [];

  // 1. Kit de Estanca
  const kitPickup = new THREE.Group();
  const kitBodyGeo = new THREE.BoxGeometry(0.32, 0.13, 0.22);
  const kitTrimGeo = new THREE.BoxGeometry(0.14, 0.14, 0.05);
  const kitBodyMat = new THREE.MeshStandardMaterial({
    color: 0xdbe2ea,
    roughness: 0.35,
    metalness: 0.35,
  });
  const kitCrossMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 0.8,
  });
  const kitBody = new THREE.Mesh(kitBodyGeo, kitBodyMat);
  const kitCross1 = new THREE.Mesh(kitTrimGeo, kitCrossMat);
  const kitCross2 = new THREE.Mesh(kitTrimGeo, kitCrossMat);
  kitCross2.rotation.y = Math.PI / 2;
  kitPickup.add(kitBody, kitCross1, kitCross2);
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
  disposables.push(kitBodyGeo, kitTrimGeo, kitBodyMat, kitCrossMat);

  // 2. Cartão / Crachá do Setor
  const badgePickup = new THREE.Group();
  const badgeGeo = new THREE.BoxGeometry(0.22, 0.02, 0.32);
  const badgeClipGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.035, 10);
  const badgeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.45,
    roughness: 0.28,
  });
  const badgeStripeGeo = new THREE.BoxGeometry(0.22, 0.024, 0.05);
  const badgeStripeMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.55,
  });
  const badgeCard = new THREE.Mesh(badgeGeo, badgeMat);
  const badgeStripe = new THREE.Mesh(badgeStripeGeo, badgeStripeMat);
  badgeStripe.position.z = -0.09;
  const badgeClip = new THREE.Mesh(badgeClipGeo, deskMat);
  badgeClip.position.z = -0.17;
  badgePickup.add(badgeCard, badgeStripe, badgeClip);
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
  disposables.push(
    badgeGeo,
    badgeClipGeo,
    badgeMat,
    badgeStripeGeo,
    badgeStripeMat
  );

  // 3. Armário de Aço Esconderijo (altura proporcional ao teto de 2.85m)
  const lockerGroup = new THREE.Group();
  const lockerBodyGeo = new THREE.BoxGeometry(1.0, 2.25, 0.95);
  const lockerDoorGeo = new THREE.BoxGeometry(0.9, 2.05, 0.06);
  const lockerHandleGeo = new THREE.BoxGeometry(0.04, 0.24, 0.07);
  const lockerMat = new THREE.MeshStandardMaterial({
    color: 0x2a3442,
    roughness: 0.45,
    metalness: 0.75,
  });
  const lockerBody = new THREE.Mesh(lockerBodyGeo, lockerMat);
  lockerBody.position.y = 1.125;
  const lockerDoor = new THREE.Mesh(lockerDoorGeo, deskMat);
  lockerDoor.position.set(0, 1.1, -0.48);
  const lockerHandle = new THREE.Mesh(lockerHandleGeo, badgeStripeMat);
  lockerHandle.position.set(-0.33, 1.1, -0.53);
  lockerGroup.add(lockerBody, lockerDoor, lockerHandle);
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
  disposables.push(lockerBodyGeo, lockerDoorGeo, lockerHandleGeo, lockerMat);

  // 4. Painel de Relés de Emergência
  const relayGroup = new THREE.Group();
  const relayBoxGeo = new THREE.BoxGeometry(0.88, 1.15, 0.22);
  const relayFaceGeo = new THREE.BoxGeometry(0.74, 0.88, 0.04);
  const relayIndGeo = new THREE.BoxGeometry(0.58, 0.1, 0.05);
  const relayStatusMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.25,
  });
  const relayBox = new THREE.Mesh(relayBoxGeo, deskMat);
  const relayFace = new THREE.Mesh(relayFaceGeo, wallMat);
  relayFace.position.z = -0.12;
  const relayInd = new THREE.Mesh(relayIndGeo, relayStatusMat);
  relayInd.position.set(0, 0.32, -0.14);
  relayGroup.add(relayBox, relayFace, relayInd);
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
  disposables.push(relayBoxGeo, relayFaceGeo, relayIndGeo, relayStatusMat);

  // 5. Comporta de Saída com moldura blindada proporcional (2.15m x 2.55m)
  const exitDoorGroup = new THREE.Group();
  const frameSideGeo = new THREE.BoxGeometry(0.32, CEIL_H, 0.38);
  const frameTopGeo = new THREE.BoxGeometry(2.7, 0.36, 0.38);
  const doorGeo = new THREE.BoxGeometry(2.1, 2.5, 0.22);
  const padGeo = new THREE.BoxGeometry(0.24, 0.38, 0.1);
  const exitDoorMat = new THREE.MeshStandardMaterial({
    color: 0x131a24,
    roughness: 0.36,
    metalness: 0.82,
  });
  const exitDoorLightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.5,
  });
  const frameLeft = new THREE.Mesh(frameSideGeo, deskMat);
  frameLeft.position.set(-1.2, CEIL_H * 0.5, 0);
  const frameRight = new THREE.Mesh(frameSideGeo, deskMat);
  frameRight.position.set(1.2, CEIL_H * 0.5, 0);
  const frameTop = new THREE.Mesh(frameTopGeo, deskMat);
  frameTop.position.set(0, CEIL_H - 0.18, 0);
  const exitDoorMesh = new THREE.Mesh(doorGeo, exitDoorMat);
  exitDoorMesh.position.set(0, 1.25, 0);
  // Barra transversal pneumática na comporta
  const barGeo = new THREE.BoxGeometry(1.96, 0.14, 0.28);
  const doorBar = new THREE.Mesh(barGeo, rustTrimMat);
  doorBar.position.set(0, 0.0, 0);
  exitDoorMesh.add(doorBar);
  const keypadMesh = new THREE.Mesh(padGeo, exitDoorLightMat);
  keypadMesh.position.set(1.2, 1.3, -0.22);
  exitDoorGroup.add(frameLeft, frameRight, frameTop, exitDoorMesh, keypadMesh);
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
  disposables.push(
    frameSideGeo,
    frameTopGeo,
    doorGeo,
    barGeo,
    padGeo,
    exitDoorMat,
    exitDoorLightMat
  );

  // 6. Newborn Orgânico + Viewmodel 1ª Pessoa
  const newborn = createNewbornModel(disposables, maxAniso);
  newborn.root.position.set(-1.0, 0, 3.2);
  scene.add(newborn.root);

  const viewmodel = attachFirstPersonViewmodel(camera, disposables);

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
    lockerGroup,
    relayGroup,
    exitDoorGroup,
    spores,
    snowPoints,
    interactables,
    disposables,
  };
}
