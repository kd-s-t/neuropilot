"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MOVE_SPEED = 1.3;
const MOVE_SPEED_TURNING = 0.65;
const STRAFE_SPEED = 0.9;
const TURN_SPEED = 1.8;
const CAMERA_OFFSET = new THREE.Vector3(0, 1, 2.5);
const CAMERA_FOLLOW = 10;
const CAMERA_LOOK_AHEAD = 4;
const LIFT_SPEED = 1.5;
const DRAG = 0.88;
const DRONE_GLB = "/models/Drone.glb";

const CITY = "/models/city";
const BUILDING_GLBS = [
  "Building.glb",
  "Building B.glb",
  "Building-7lMEpT2ICD.glb",
  "Building-bbH2Bg73qM.glb",
  "Building-g15lpKh4li.glb",
  "Building-otRsYa6pan.glb",
  "Building-qOhhGLftam.glb",
  "Building-T3oyvK6VEU.glb",
  "/models/Bar.glb",
];
const BAR_GLB = "/models/Bar.glb";
const CAR_GLBS = ["Taxi.glb", "Car Hatchback.glb", "Police Car.glb", "Stationwagon.glb"];

const EXTRA_PROPS: { name: string; targetSize: number; useHeight: boolean }[] = [
  { name: "Base.glb", targetSize: 3, useHeight: false },
  { name: "Bench.glb", targetSize: 0.9, useHeight: false },
  { name: "Bush.glb", targetSize: 0.7, useHeight: false },
  { name: "Dumpster.glb", targetSize: 1, useHeight: true },
  { name: "Fire Hydrant.glb", targetSize: 1, useHeight: true },
  { name: "Rocks.glb", targetSize: 0.5, useHeight: false },
  { name: "Streetlight.glb", targetSize: 2.5, useHeight: true },
  { name: "Traffic light.glb", targetSize: 1.2, useHeight: true },
  { name: "Traffic light-Q6k7Izx6YD.glb", targetSize: 1.2, useHeight: true },
  { name: "Trafficlight B.glb", targetSize: 1.2, useHeight: true },
  { name: "Watertower.glb", targetSize: 6, useHeight: true },
];

const GRID_SIZE = 80;
const ROAD_SPACING = 8;
const ROAD_WIDTH = 2;
const LOT_SIZE = ROAD_SPACING - ROAD_WIDTH;
const TARGET_BUILDING_HEIGHT = 4;
const TARGET_CAR_LENGTH = 1.2;
const BOUNDS_MARGIN = 2;
const BOUNDS_XZ = GRID_SIZE / 2 - BOUNDS_MARGIN;
const BOUNDS_Y_MAX = 28;
const START_LIFT = 1;
const LIFT_ANIM_SPEED = 1.4;
const SINK_SPEED = 2.5;
const SINK_GRAVITY_RAMP = 0.9;
const BOUNCE_FACTOR = 1.4;
const BOUNCE_MIN = 0.04;
const BOUNCE_MAX = 0.22;
const HOVER_TILT_AMP = 0.03;
const HOVER_TILT_FREQ_X = 1.7;
const HOVER_TILT_FREQ_Z = 1.4;
const IDLE_VEL_THRESHOLD = 0.2;
const PROPELLER_SPIN_SPEED = 32;
const PROPELLER_RAMP_UP = 3.2;
const PROPELLER_RAMP_DOWN = 2.2;
const MOVEMENT_TILT = 0.35;
const TILT_SMOOTH = 0.12;
const RETURN_TO_HOVER_SMOOTH = 0.08;

const DRONE_BOX_HALF = new THREE.Vector3(0.28, 0.18, 0.28);
const COLLIDER_MARGIN = 0.03;

type Collider = { min: THREE.Vector3; max: THREE.Vector3 };

function loadGLB(
  loader: InstanceType<typeof GLTFLoader>,
  path: string
): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf: unknown) => resolve((gltf as { scene: THREE.Group }).scene),
      undefined,
      reject
    );
  });
}

function centerAndScale(
  model: THREE.Object3D,
  targetSize: number,
  useHeight = false
) {
  const bbox = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  model.position.sub(center);
  const dim = useHeight ? size.y : Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / dim;
  model.scale.setScalar(scale);
}

function addCollider(obj: THREE.Object3D, colliders: Collider[], margin = COLLIDER_MARGIN) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  colliders.push({
    min: b.min.clone().addScalar(-margin),
    max: b.max.clone().addScalar(margin),
  });
}

function aabbOverlap(
  aMin: THREE.Vector3,
  aMax: THREE.Vector3,
  bMin: THREE.Vector3,
  bMax: THREE.Vector3
): boolean {
  return (
    aMin.x <= bMax.x &&
    aMax.x >= bMin.x &&
    aMin.y <= bMax.y &&
    aMax.y >= bMin.y &&
    aMin.z <= bMax.z &&
    aMax.z >= bMin.z
  );
}

function wouldCollide(pos: THREE.Vector3, colliders: Collider[]): boolean {
  const mn = pos.clone().sub(DRONE_BOX_HALF);
  const mx = pos.clone().add(DRONE_BOX_HALF);
  for (const c of colliders) {
    if (aabbOverlap(mn, mx, c.min, c.max)) return true;
  }
  return false;
}

function createEnvironment(scene: THREE.Scene) {
  const groundGeo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x8a8a8a,
    roughness: 0.95,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  scene.background = new THREE.Color(0x87ceeb);

  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 0.9,
    metalness: 0.05,
  });
  const roadLen = GRID_SIZE + 2;
  const roadW = ROAD_WIDTH;
  const roadH = 0.02;
  const roadGeo = new THREE.BoxGeometry(roadW, roadH, roadLen);
  const roadGeoH = new THREE.BoxGeometry(roadLen, roadH, roadW);
  for (let i = -GRID_SIZE / 2; i <= GRID_SIZE / 2; i += ROAD_SPACING) {
    const r1 = new THREE.Mesh(roadGeo, roadMat);
    r1.position.set(i, roadH / 2, 0);
    r1.receiveShadow = true;
    scene.add(r1);
    const r2 = new THREE.Mesh(roadGeoH, roadMat);
    r2.position.set(0, roadH / 2, i);
    r2.receiveShadow = true;
    scene.add(r2);
  }

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
  dirLight.position.set(30, 50, 25);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 120;
  dirLight.shadow.camera.left = -45;
  dirLight.shadow.camera.right = 45;
  dirLight.shadow.camera.top = 45;
  dirLight.shadow.camera.bottom = -45;
  scene.add(dirLight);
  scene.add(new THREE.AmbientLight(0xaabbcc, 0.85));
  scene.add(new THREE.HemisphereLight(0xbbddff, 0x887766, 0.4));
}

async function loadCityFromPack(
  scene: THREE.Scene,
  loader: InstanceType<typeof GLTFLoader>
): Promise<{ colliders: Collider[] }> {
  const colliders: Collider[] = [];
  const half = GRID_SIZE / 2;

  const buildingTemplates: THREE.Group[] = [];
  for (const name of BUILDING_GLBS) {
    try {
      const url = name.startsWith("/") ? name : `${CITY}/${encodeURIComponent(name)}`;
      const model = await loadGLB(loader, url);
      centerAndScale(model, TARGET_BUILDING_HEIGHT, true);
      model.traverse((c: THREE.Object3D) => {
        if (c instanceof THREE.Mesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      buildingTemplates.push(model);
    } catch (e) {
      console.warn("City building load failed:", name, e);
    }
  }

  if (buildingTemplates.length > 0) {
    const barIdx = BUILDING_GLBS.indexOf(BAR_GLB);
    const otherIndices = buildingTemplates
      .map((_, i) => i)
      .filter((i) => i !== barIdx || barIdx < 0);
    let barPlaced = false;
    const lotPositions: { cx: number; cz: number; seed: number }[] = [];
    for (let gx = -half; gx < half; gx += ROAD_SPACING) {
      for (let gz = -half; gz < half; gz += ROAD_SPACING) {
        const cx = gx + ROAD_SPACING / 2;
        const cz = gz + ROAD_SPACING / 2;
        if (Math.abs(cx) < 3 && Math.abs(cz) < 3) continue;
        const seed = gx * 12.1 + gz * 7.3;
        const r = (off: number) => (Math.sin(seed + off) * 0.5 + 0.5);
        if (r(11) > 0.82) continue;
        lotPositions.push({ cx, cz, seed });
      }
    }
    for (const { cx, cz, seed } of lotPositions) {
      const r = (off: number) => (Math.sin(seed + off) * 0.5 + 0.5);
      let idx: number;
      if (barIdx >= 0 && barIdx < buildingTemplates.length && !barPlaced) {
        idx = barIdx;
        barPlaced = true;
      } else {
        idx = otherIndices.length > 0
          ? otherIndices[Math.floor(r(4) * otherIndices.length)]
          : Math.floor(r(4) * buildingTemplates.length);
      }
      const t = buildingTemplates[idx];
      const clone = t.clone();
      clone.position.set(cx, 0, cz);
      const bbox = new THREE.Box3().setFromObject(clone);
      clone.position.y = -bbox.min.y;
      scene.add(clone);
      addCollider(clone, colliders);
    }
  }

  const carTemplates: THREE.Group[] = [];
  for (const name of CAR_GLBS) {
    try {
      const model = await loadGLB(loader, `${CITY}/${encodeURIComponent(name)}`);
      centerAndScale(model, TARGET_CAR_LENGTH, false);
      model.traverse((c: THREE.Object3D) => {
        if (c instanceof THREE.Mesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      carTemplates.push(model);
    } catch (e) {
      console.warn("City car load failed:", name, e);
    }
  }
  const carSpots: { x: number; z: number; rot: number }[] = [];
  for (let k = -half; k <= half; k += ROAD_SPACING) {
    for (let t = -half; t <= half; t += 3) {
      if (Math.abs(k) < 8 && Math.abs(t) < 8) continue;
      carSpots.push({ x: k, z: t, rot: 0 });
      carSpots.push({ x: t, z: k, rot: Math.PI / 2 });
    }
  }
  const toPlace = Math.min(carSpots.length, carTemplates.length * 8);
  for (let i = 0; i < toPlace && carTemplates.length > 0; i++) {
    const { x, z, rot } = carSpots[i];
    const model = carTemplates[i % carTemplates.length];
    const clone = model.clone();
    clone.position.set(x, 0.08, z);
    clone.rotation.y = rot;
    scene.add(clone);
    addCollider(clone, colliders);
  }

  const propTemplates: { model: THREE.Group; cfg: (typeof EXTRA_PROPS)[0] }[] = [];
  for (const cfg of EXTRA_PROPS) {
    try {
      const model = await loadGLB(loader, `${CITY}/${encodeURIComponent(cfg.name)}`);
      centerAndScale(model, cfg.targetSize, cfg.useHeight);
      model.traverse((c: THREE.Object3D) => {
        if (c instanceof THREE.Mesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      propTemplates.push({ model, cfg });
    } catch (e) {
      console.warn("City prop load failed:", cfg.name, e);
    }
  }

  const benchEntry = propTemplates.find((p) => p.cfg.name === "Bench.glb");
  if (benchEntry) {
    const off = ROAD_SPACING / 2 + 1.5;
    const benchSpots: { x: number; z: number; rot: number }[] = [];
    for (let k = -half; k <= half; k += ROAD_SPACING) {
      for (let t = -half; t <= half; t += ROAD_SPACING) {
        if (Math.abs(k) < 6 && Math.abs(t) < 6) continue;
        benchSpots.push({ x: k + off, z: t, rot: 0 });
        benchSpots.push({ x: k - off, z: t, rot: Math.PI });
        benchSpots.push({ x: k, z: t + off, rot: Math.PI / 2 });
        benchSpots.push({ x: k, z: t - off, rot: -Math.PI / 2 });
      }
    }
    const benchCount = Math.min(benchSpots.length, 60);
    for (let i = 0; i < benchCount; i++) {
      const { x, z, rot } = benchSpots[i];
      const clone = benchEntry.model.clone();
      clone.position.set(x, 0, z);
      clone.rotation.y = rot;
      const bbox = new THREE.Box3().setFromObject(clone);
      clone.position.y = -bbox.min.y;
      scene.add(clone);
      addCollider(clone, colliders);
    }
  }

  for (const { model, cfg } of propTemplates) {
    if (cfg.name === "Bench.glb") continue;
    const baseSeed = cfg.name.length * 17;
    let placed = 0;
    const maxPlace =
      cfg.name === "Watertower.glb" ? 3 : cfg.name === "Base.glb" ? 5 : 25;
    for (let gx = -half; gx < half && placed < maxPlace; gx += ROAD_SPACING) {
      for (let gz = -half; gz < half && placed < maxPlace; gz += ROAD_SPACING) {
        if (Math.abs(gx) < 10 && Math.abs(gz) < 10) continue;
        const seed = gx * 1.1 + gz * 2.3 + baseSeed;
        if ((Math.sin(seed) * 0.5 + 0.5) > 0.6) continue;
        const cx = gx + (Math.sin(seed + 1) * 0.5) * (ROAD_SPACING - 1);
        const cz = gz + (Math.sin(seed + 2) * 0.5) * (ROAD_SPACING - 1);
        const clone = model.clone();
        clone.position.set(cx, 0, cz);
        clone.rotation.y = (Math.sin(seed + 3) * 0.5 + 0.5) * Math.PI * 2;
        const bbox = new THREE.Box3().setFromObject(clone);
        clone.position.y = -bbox.min.y;
        scene.add(clone);
        addCollider(clone, colliders);
        placed++;
      }
    }
  }

  return { colliders };
}

export type DroneSceneControls = "keyboard" | "eeg";

export type EegCommand = {
  start: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  forward: boolean;
  back: boolean;
  turnLeft: boolean;
  turnRight: boolean;
};

export type DroneSceneProps = {
  className?: string;
  controls?: DroneSceneControls;
  eegCommandRef?: MutableRefObject<EegCommand | null>;
};

export default function DroneScene({
  className,
  controls = "keyboard",
  eegCommandRef,
}: DroneSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    camera.position.set(0, 4, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    createEnvironment(scene);
    const loader = new GLTFLoader();
    const collidersRef: { current: Collider[] } = { current: [] };
    loadCityFromPack(scene, loader)
      .then(({ colliders }) => {
        collidersRef.current = colliders;
      })
      .catch((e) => console.error("City load failed:", e));

    const drone = new THREE.Group();
    let droneGroundY = 0.5;
    drone.position.set(0, droneGroundY, 0);
    scene.add(drone);

    let droneModel: THREE.Object3D | null = null;
    const propellers: THREE.Object3D[] = [];
    loader.load(
      DRONE_GLB,
      (gltf: unknown) => {
        const g = gltf as { scene: THREE.Group };
        const model = g.scene;
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 1 / maxDim;
        model.scale.setScalar(scale);
        bbox.getCenter(model.position);
        model.position.negate();
        model.rotation.y = Math.PI;
        drone.add(model);
        droneModel = model;
        drone.position.y = 0;
        drone.updateMatrixWorld(true);
        const droneBbox = new THREE.Box3().setFromObject(drone);
        droneGroundY = Math.max(0.05, -droneBbox.min.y);
        drone.position.y = droneGroundY;
        model.traverse((o: THREE.Object3D) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        model.updateMatrixWorld(true);
        const modelCenter = new THREE.Vector3();
        model.getWorldPosition(modelCenter);
        const propCandidates: { obj: THREE.Object3D; dist: number }[] = [];
        model.traverse((o: THREE.Object3D) => {
          const n = (o.name || "").toLowerCase();
          const isProp =
            n.includes("prop") ||
            n.includes("rotor") ||
            n.includes("blade") ||
            n.includes("motor");
          if (!isProp) return;
          const wp = new THREE.Vector3();
          o.getWorldPosition(wp);
          const dist = wp.distanceTo(modelCenter);
          propCandidates.push({ obj: o, dist });
        });
        const wp = new THREE.Vector3();
        propCandidates.sort((a, b) => {
          a.obj.getWorldPosition(wp);
          const sa = wp.x + wp.z;
          b.obj.getWorldPosition(wp);
          const sb = wp.x + wp.z;
          return sa - sb;
        });
        const topLeftIdx = 0;
        const bottomRightIdx = propCandidates.length > 1 ? propCandidates.length - 1 : 0;
        const middle: number[] = [];
        for (let i = 0; i < propCandidates.length; i++) {
          if (i !== topLeftIdx && i !== bottomRightIdx) middle.push(i);
        }
        let topRightIdx = -1;
        let bottomLeftIdx = -1;
        if (middle.length >= 2) {
          const [a, b] = middle;
          propCandidates[a].obj.getWorldPosition(wp);
          const va = wp.x - wp.z;
          propCandidates[b].obj.getWorldPosition(wp);
          const vb = wp.x - wp.z;
          if (va < vb) {
            topRightIdx = a;
            bottomLeftIdx = b;
          } else {
            topRightIdx = b;
            bottomLeftIdx = a;
          }
        } else if (middle.length === 1) {
          topRightIdx = middle[0];
        }
        const indices = [topLeftIdx, bottomRightIdx];
        if (topRightIdx >= 0) indices.push(topRightIdx);
        if (bottomLeftIdx >= 0) indices.push(bottomLeftIdx);
        if (topLeftIdx === bottomRightIdx) indices.length = 1;
        for (const idx of indices) {
          if (idx >= propCandidates.length) continue;
          const P = propCandidates[idx].obj;
          const bbox = new THREE.Box3().setFromObject(P);
          bbox.getCenter(wp);
          const hub = wp.clone();
          const localCenter = hub.clone();
          P.worldToLocal(localCenter);
          const parent = P.parent!;
          const G = new THREE.Group();
          G.position.copy(hub);
          parent.worldToLocal(G.position);
          parent.add(G);
          parent.remove(P);
          G.add(P);
          P.rotation.set(0, 0, 0);
          P.position.copy(localCenter).negate();
          propellers.push(G);
        }
      },
      undefined,
      (err: unknown) => console.error("Drone GLB load failed:", err)
    );

    const velocity = { x: 0, y: 0, z: 0 };
    let heading = 0;
    let hoverTime = 0;
    let motorsOn = false;
    let liftTargetY: number | null = null;
    let propellerSpeed = 0;
    let sinkTime = 0;
    let hasBouncedThisFall = false;
    let landingTiltX = 0;
    let landingTiltZ = 0;
    let eegStartHeldTime = 0;
    const EEG_START_HOLD_SEC = 0.2;
    const keys: Record<string, boolean> = {};

    const onKeyDown = (e: KeyboardEvent) => {
      const gameKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyF", "KeyG", "ShiftLeft"];
      if (gameKeys.includes(e.code)) e.preventDefault();
      if (e.code === "KeyF" && !keys["KeyF"]) {
        if (!motorsOn) {
          motorsOn = true;
          sinkTime = 0;
          hasBouncedThisFall = false;
          landingTiltX = 0;
          landingTiltZ = 0;
          liftTargetY = Math.min(
            Math.max(drone.position.y, droneGroundY) + START_LIFT,
            BOUNDS_Y_MAX
          );
          velocity.x = 0;
          velocity.y = 0;
          velocity.z = 0;
        }
      } else if (e.code === "KeyG" && !keys["KeyG"]) {
        if (motorsOn) {
          motorsOn = false;
          liftTargetY = null;
          velocity.x = 0;
          velocity.y = 0;
          velocity.z = 0;
        }
      }
      keys[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = 0.016;
      hoverTime += dt;

      const onGround = drone.position.y <= droneGroundY + 0.02;
      const isLifting =
        motorsOn &&
        liftTargetY != null &&
        drone.position.y < liftTargetY - 0.005;
      const propellersSpinning = motorsOn && !onGround;

      const eegStartRequest = eegCommandRef?.current?.start;
      if (eegStartRequest) {
        eegStartHeldTime += dt;
      } else {
        eegStartHeldTime = 0;
      }
      const eegStartHeld = eegStartHeldTime >= EEG_START_HOLD_SEC;
      const eegStart = onGround && !motorsOn && (keys["Space"] || keys["KeyF"] || (eegStartRequest && eegStartHeld));
      if (eegStart) {
        eegStartHeldTime = 0;
        motorsOn = true;
        sinkTime = 0;
        hasBouncedThisFall = false;
        landingTiltX = 0;
        landingTiltZ = 0;
        liftTargetY = Math.min(
          Math.max(drone.position.y, droneGroundY) + START_LIFT,
          BOUNDS_Y_MAX
        );
        velocity.x = 0;
        velocity.y = 0;
        velocity.z = 0;
      }

      if (isLifting) {
        const dy = Math.min(LIFT_ANIM_SPEED * dt, liftTargetY! - drone.position.y);
        drone.position.y += dy;
        velocity.x = 0;
        velocity.y = 0;
        velocity.z = 0;
        if (drone.position.y >= liftTargetY! - 0.005) {
          drone.position.y = liftTargetY!;
          liftTargetY = null;
        }
      } else if (propellersSpinning) {
        const useEeg = controlsRef.current === "eeg" && eegCommandRef?.current;
        const fallback: EegCommand = {
          start: false,
          up: false,
          down: false,
          left: false,
          right: false,
          forward: false,
          back: false,
          turnLeft: false,
          turnRight: false,
        };
        const c = useEeg ? (eegCommandRef!.current ?? fallback) : null;
        const w = useEeg ? (c!.forward ?? false) : keys["KeyW"];
        const s = useEeg ? (c!.back ?? false) : keys["KeyS"];
        const a = useEeg ? (c!.left ?? false) : keys["KeyA"];
        const d = useEeg ? (c!.right ?? false) : keys["KeyD"];
        const space = useEeg ? (c!.up ?? false) : keys["Space"];
        const shift = useEeg ? (c!.down ?? false) : keys["ShiftLeft"];
        const turnL = useEeg ? (c!.turnLeft ?? false) : (keys["KeyW"] && keys["KeyA"]);
        const turnR = useEeg ? (c!.turnRight ?? false) : (keys["KeyW"] && keys["KeyD"]);

        if (turnL) heading += TURN_SPEED * dt;
        else if (turnR) heading -= TURN_SPEED * dt;
        const fx = -Math.sin(heading);
        const fz = -Math.cos(heading);
        const rx = Math.cos(heading);
        const rz = -Math.sin(heading);
        if (w) {
          const fwd = a || d ? MOVE_SPEED_TURNING : MOVE_SPEED;
          velocity.x += fx * fwd * dt;
          velocity.z += fz * fwd * dt;
        }
        if (s) {
          velocity.x -= fx * MOVE_SPEED * dt;
          velocity.z -= fz * MOVE_SPEED * dt;
        }
        if (a) {
          velocity.x -= rx * STRAFE_SPEED * dt;
          velocity.z -= rz * STRAFE_SPEED * dt;
        }
        if (d) {
          velocity.x += rx * STRAFE_SPEED * dt;
          velocity.z += rz * STRAFE_SPEED * dt;
        }
        if (space) velocity.y += LIFT_SPEED * dt;
        if (shift) velocity.y -= LIFT_SPEED * dt;
        velocity.x *= DRAG;
        velocity.y *= DRAG;
        velocity.z *= DRAG;

        const colliders = collidersRef.current;
        if (colliders.length > 0) {
          const tryX = new THREE.Vector3(
            drone.position.x + velocity.x,
            drone.position.y,
            drone.position.z
          );
          if (!wouldCollide(tryX, colliders)) {
            drone.position.x += velocity.x;
          } else velocity.x = 0;
          const tryY = new THREE.Vector3(
            drone.position.x,
            drone.position.y + velocity.y,
            drone.position.z
          );
          if (!wouldCollide(tryY, colliders)) {
            drone.position.y += velocity.y;
          } else velocity.y = 0;
          const tryZ = new THREE.Vector3(
            drone.position.x,
            drone.position.y,
            drone.position.z + velocity.z
          );
          if (!wouldCollide(tryZ, colliders)) {
            drone.position.z += velocity.z;
          } else velocity.z = 0;
        } else {
          drone.position.x += velocity.x;
          drone.position.y += velocity.y;
          drone.position.z += velocity.z;
        }
      } else {
        velocity.x = 0;
        velocity.y = 0;
        velocity.z = 0;
        if (!motorsOn && drone.position.y > droneGroundY) {
          sinkTime += dt;
          const g = 1 + sinkTime * SINK_GRAVITY_RAMP;
          const fallSpeed = SINK_SPEED * g * dt;
          let newY = drone.position.y - fallSpeed;
          const sinkPos = new THREE.Vector3(drone.position.x, newY, drone.position.z);
          const col = collidersRef.current;
          if (col.length === 0 || !wouldCollide(sinkPos, col)) {
            if (newY <= droneGroundY + 0.02) {
              if (!hasBouncedThisFall) {
                const bounce = Math.max(
                  BOUNCE_MIN,
                  Math.min(BOUNCE_MAX, fallSpeed * BOUNCE_FACTOR)
                );
                newY = droneGroundY + bounce;
                sinkTime *= 0.3;
                hasBouncedThisFall = true;
                if (Math.random() < 0.45) {
                  landingTiltX = (Math.random() - 0.5) * 0.25;
                  landingTiltZ = (Math.random() - 0.5) * 0.25;
                }
              } else {
                newY = droneGroundY;
              }
            }
            drone.position.y = newY;
          }
        }
      }

      drone.position.x = THREE.MathUtils.clamp(drone.position.x, -BOUNDS_XZ, BOUNDS_XZ);
      drone.position.y = THREE.MathUtils.clamp(drone.position.y, droneGroundY, BOUNDS_Y_MAX);
      drone.position.z = THREE.MathUtils.clamp(drone.position.z, -BOUNDS_XZ, BOUNDS_XZ);

      const onGroundNow = drone.position.y <= droneGroundY + 0.02;
      if (onGroundNow && motorsOn) {
        motorsOn = false;
        liftTargetY = null;
        sinkTime = 0;
        hasBouncedThisFall = false;
        landingTiltX = 0;
        landingTiltZ = 0;
        velocity.x = 0;
        velocity.y = 0;
        velocity.z = 0;
      }

      const velMag = Math.abs(velocity.x) + Math.abs(velocity.y) + Math.abs(velocity.z);
      const isIdle = velMag < IDLE_VEL_THRESHOLD;
      if (droneModel) {
        if (!motorsOn || onGround) {
          const tx = motorsOn ? 0 : landingTiltX;
          const tz = motorsOn ? 0 : landingTiltZ;
          droneModel.rotation.x += (tx - droneModel.rotation.x) * 0.15;
          droneModel.rotation.z += (tz - droneModel.rotation.z) * 0.15;
        } else if (isIdle) {
          const targetHoverX = HOVER_TILT_AMP * Math.sin(hoverTime * HOVER_TILT_FREQ_X);
          const targetHoverZ = HOVER_TILT_AMP * 0.7 * Math.cos(hoverTime * HOVER_TILT_FREQ_Z);
          droneModel.rotation.x +=
            (targetHoverX - droneModel.rotation.x) * RETURN_TO_HOVER_SMOOTH;
          droneModel.rotation.z +=
            (targetHoverZ - droneModel.rotation.z) * RETURN_TO_HOVER_SMOOTH;
        } else {
          const fx = -Math.sin(heading);
          const fz = -Math.cos(heading);
          const localForward = velocity.x * fx + velocity.z * fz;
          const localRight =
            velocity.x * Math.cos(heading) - velocity.z * Math.sin(heading);
          const targetTiltX = -MOVEMENT_TILT * localForward;
          const targetTiltZ = MOVEMENT_TILT * localRight;
          droneModel.rotation.x += (targetTiltX - droneModel.rotation.x) * TILT_SMOOTH;
          droneModel.rotation.z += (targetTiltZ - droneModel.rotation.z) * TILT_SMOOTH;
        }
      }

      if (motorsOn && !onGround) {
        propellerSpeed = Math.min(1, propellerSpeed + PROPELLER_RAMP_UP * dt);
      } else {
        propellerSpeed = Math.max(0, propellerSpeed - PROPELLER_RAMP_DOWN * dt);
      }
      if (propellerSpeed > 0) {
        for (let i = 0; i < propellers.length; i++) {
          const spin =
            PROPELLER_SPIN_SPEED * propellerSpeed * dt * (i % 2 === 0 ? 1 : -1);
          propellers[i].rotation.y += spin;
        }
      }

      drone.rotation.y = heading;
      const camDx = Math.sin(heading) * CAMERA_OFFSET.z;
      const camDz = Math.cos(heading) * CAMERA_OFFSET.z;
      const camTarget = new THREE.Vector3(
        drone.position.x + camDx,
        drone.position.y + CAMERA_OFFSET.y,
        drone.position.z + camDz
      );
      camera.position.lerp(camTarget, 1 - Math.exp(-CAMERA_FOLLOW * dt));
      const fx = -Math.sin(heading);
      const fz = -Math.cos(heading);
      const lookTarget = new THREE.Vector3(
        drone.position.x + fx * CAMERA_LOOK_AHEAD,
        drone.position.y,
        drone.position.z + fz * CAMERA_LOOK_AHEAD
      );
      camera.lookAt(lookTarget);
      renderer.render(scene, camera);
    };

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    onResize();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => onResize());
    ro.observe(container);

    animate();

    return () => {
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
