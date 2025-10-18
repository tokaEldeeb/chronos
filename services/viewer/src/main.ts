import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Scene setup
const app = document.getElementById('app')!;
const toolbar = document.createElement('div');
toolbar.className = 'toolbar';
toolbar.innerHTML = `
  <span class="title">3D Room Viewer</span>
  <span style="margin-left:auto"></span>
  <span class="badge">Blue & Grey</span>
`;
app.appendChild(toolbar);

const canvasWrap = document.createElement('div');
canvasWrap.className = 'canvas-wrap';
app.appendChild(canvasWrap);

const info = document.createElement('div');
info.className = 'instructions';
info.innerHTML = `
  WASD / Arrow keys: pan • Scroll: zoom • Drag: orbit<br/>
  Measurements are in meters (1 unit = 1 m).`;
canvasWrap.appendChild(info);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight - toolbar.clientHeight);
renderer.shadowMap.enabled = true;
canvasWrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f6fa);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / (window.innerHeight - toolbar.clientHeight), 0.1, 100);
camera.position.set(4.6, 2.2, 4.2);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.0, 0);

// Palette
const COLORS = {
  wall: new THREE.Color('#e8edf2'),
  floor: new THREE.Color('#b7c5d3'),
  bedFrame: new THREE.Color('#6f7d8a'),
  rail: new THREE.Color('#9fb9d7'),
  accentBlue: new THREE.Color('#5aa0ff'),
  matteGrey: new THREE.Color('#8b98a5'),
  shelfBack: new THREE.Color('#dbe7f6'),
  deskTop: new THREE.Color('#98a9ba'),
  door: new THREE.Color('#6e88a3'),
  windowTrim: new THREE.Color('#9fb3c6'),
  glass: new THREE.Color('#cfe6ff')
};

// Dimensions from the plan (approx):
const roomWidth = 3.0;  // X
const roomDepth = 2.6;  // Z
const roomHeight = 2.8; // Y

// Helpers
const grid = new THREE.GridHelper(10, 10, 0x93a4b4, 0xcfd8e3);
(grid.material as THREE.LineBasicMaterial).opacity = 0.45;
(grid.material as THREE.LineBasicMaterial).transparent = true;
grid.position.y = 0.001; // avoid z-fight with the floor
scene.add(grid);

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0xa8b6c0, 0.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(4, 6, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.2;
sun.shadow.camera.far = 20;
scene.add(sun);

// Floor
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(roomWidth, roomDepth),
  new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95, metalness: 0 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Walls: thin boxes for simplicity
function makeWall(width: number, height: number, depth: number, x: number, y: number, z: number, rotY = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 1 })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

const wallThickness = 0.1;
// Back wall (along X)
makeWall(roomWidth, roomHeight, wallThickness, 0, roomHeight / 2, -roomDepth / 2 + wallThickness / 2);
// Front wall
makeWall(roomWidth, roomHeight, wallThickness, 0, roomHeight / 2, roomDepth / 2 - wallThickness / 2);
// Left wall
makeWall(wallThickness, roomHeight, roomDepth, -roomWidth / 2 + wallThickness / 2, roomHeight / 2, 0);
// Right wall (with visual window cutout represented separately)
const rightWall = makeWall(wallThickness, roomHeight, roomDepth, roomWidth / 2 - wallThickness / 2, roomHeight / 2, 0);

// Window on right wall (approx 1.65m wide centered), sill height ~0.9m, window height 1.2m
const windowWidth = 1.65;
const windowHeight = 1.2;
const windowSill = 0.9;
const windowDepth = 0.08;

const windowFrame = new THREE.Mesh(
  new THREE.BoxGeometry(windowDepth, windowHeight + 0.1, windowWidth + 0.1),
  new THREE.MeshStandardMaterial({ color: COLORS.windowTrim })
);
windowFrame.position.set(roomWidth / 2 - wallThickness, windowSill + windowHeight / 2, 0);
windowFrame.rotation.z = Math.PI / 2; // orient correctly
scene.add(windowFrame);

const glass = new THREE.Mesh(
  new THREE.PlaneGeometry(windowWidth, windowHeight),
  new THREE.MeshPhysicalMaterial({ color: COLORS.glass, transmission: 0.8, opacity: 0.8, transparent: true, roughness: 0.1, metalness: 0.0 })
);
glass.position.set(roomWidth / 2 - wallThickness - 0.01, windowSill + windowHeight / 2, 0);
glass.rotation.y = -Math.PI / 2;
scene.add(glass);

// Door on left wall near bottom-left corner (width 0.9m)
const doorWidth = 0.9;
const doorHeight = 2.1;
const doorThickness = 0.04;
const door = new THREE.Mesh(
  new THREE.BoxGeometry(doorThickness, doorHeight, doorWidth),
  new THREE.MeshStandardMaterial({ color: COLORS.door })
);
door.position.set(-roomWidth / 2 + wallThickness + doorThickness / 2, doorHeight / 2, roomDepth / 2 - 1.0);
door.castShadow = true;
scene.add(door);

// Closet block on left wall near top (depth 0.4m, length 1.0m along wall)
const closet = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 2.4, 1.0),
  new THREE.MeshStandardMaterial({ color: COLORS.matteGrey })
);
closet.position.set(-roomWidth / 2 + 0.4 / 2 + wallThickness, 1.2, -roomDepth / 2 + 0.5);
closet.castShadow = true;
closet.receiveShadow = true;
scene.add(closet);

// Bunk bed aligned to back wall (like reference image)
function addBunkBed() {
  const group = new THREE.Group();

  const bedLength = 2.0; // along X
  const bedWidth = 0.95; // along Z
  const platformHeight = 1.55; // top bunk platform height
  const frameThickness = 0.06;

  const frameMaterial = new THREE.MeshStandardMaterial({ color: COLORS.bedFrame, roughness: 0.9 });
  const railMaterial = new THREE.MeshStandardMaterial({ color: COLORS.rail, roughness: 0.7 });

  // Lower bed box
  const lowerBase = new THREE.Mesh(new THREE.BoxGeometry(bedLength, frameThickness, bedWidth), frameMaterial);
  lowerBase.position.set(0, 0.35, 0);
  lowerBase.castShadow = true; lowerBase.receiveShadow = true;
  group.add(lowerBase);

  // Mattress shapes
  const mattressMaterial = new THREE.MeshStandardMaterial({ color: COLORS.shelfBack, roughness: 0.95 });
  const lowerMattress = new THREE.Mesh(new THREE.BoxGeometry(bedLength - 0.1, 0.18, bedWidth - 0.1), mattressMaterial);
  lowerMattress.position.set(0, 0.45, 0);
  lowerMattress.castShadow = true; lowerMattress.receiveShadow = true;
  group.add(lowerMattress);

  // Upper platform
  const upperBase = new THREE.Mesh(new THREE.BoxGeometry(bedLength, frameThickness, bedWidth), frameMaterial);
  upperBase.position.set(0, platformHeight, 0);
  upperBase.castShadow = true; upperBase.receiveShadow = true;
  group.add(upperBase);

  // Guard rails
  const railHeight = 0.25;
  const railThickness = 0.04;
  const sideRail = new THREE.Mesh(new THREE.BoxGeometry(bedLength, railHeight, railThickness), railMaterial);
  sideRail.position.set(0, platformHeight + railHeight / 2, -bedWidth / 2 + railThickness / 2);
  group.add(sideRail);

  const frontRail = new THREE.Mesh(new THREE.BoxGeometry(railThickness, railHeight, bedWidth), railMaterial);
  frontRail.position.set(-bedLength / 2 + railThickness / 2, platformHeight + railHeight / 2, 0);
  group.add(frontRail);

  // Head/foot frames
  const headFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, 1.0, bedWidth), frameMaterial);
  headFrame.position.set(bedLength / 2 - frameThickness / 2, platformHeight - 0.5, 0);
  group.add(headFrame);

  const footFrame = headFrame.clone();
  footFrame.position.x = -bedLength / 2 + frameThickness / 2;
  group.add(footFrame);

  // Decorative blue pillow
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: COLORS.accentBlue }));
  pillow.position.set(bedLength / 2 - 0.5, 0.55, 0);
  group.add(pillow);

  // Storage drawers below
  const drawerMaterial = new THREE.MeshStandardMaterial({ color: COLORS.matteGrey, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(bedLength / 3 - 0.05, 0.22, 0.5), drawerMaterial);
    drawer.position.set(-bedLength / 2 + (i + 0.5) * (bedLength / 3), 0.2, bedWidth / 2 + 0.25);
    group.add(drawer);
  }

  // Group transform: push against back wall, centered horizontally, with right side open for stairs
  group.position.set(0, 0, -roomDepth / 2 + bedWidth / 2 + 0.05);
  return group;
}

// Stairs + side shelves adjacent to right side of bunk bed
function addStairsAndShelves() {
  const group = new THREE.Group();
  const stairWidth = 0.55;
  const stepDepth = 0.28;
  const stepHeight = 0.23;
  const steps = 7; // ~1.61m rise
  const material = new THREE.MeshStandardMaterial({ color: COLORS.matteGrey, roughness: 0.9 });
  const riserMaterial = new THREE.MeshStandardMaterial({ color: COLORS.rail, roughness: 0.8 });

  for (let i = 0; i < steps; i++) {
    const tread = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, stepHeight, stepDepth), material);
    tread.position.set(0, (i + 0.5) * stepHeight, i * stepDepth + stepDepth / 2);
    tread.castShadow = true; tread.receiveShadow = true;
    group.add(tread);
  }

  // Side shelf tower with cubbies
  const cubbyRows = 4;
  const cubbyCols = 1;
  const cubbyInnerW = 0.35;
  const cubbyInnerH = 0.32;
  const cubbyInnerD = 0.28;
  const shelfMaterial = new THREE.MeshStandardMaterial({ color: COLORS.shelfBack, roughness: 0.95 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(cubbyInnerW + 0.04, cubbyRows * (cubbyInnerH + 0.04) + 0.04, cubbyInnerD + 0.04), riserMaterial);
  frame.position.set(stairWidth / 2 + (cubbyInnerW + 0.08) / 2, (cubbyRows * (cubbyInnerH + 0.04)) / 2, (cubbyInnerD + 0.04) / 2);
  group.add(frame);

  for (let r = 0; r < cubbyRows; r++) {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(cubbyInnerW, cubbyInnerH, cubbyInnerD), shelfMaterial);
    cube.position.set(frame.position.x, (r + 0.5) * (cubbyInnerH + 0.04), frame.position.z);
    cube.castShadow = true; cube.receiveShadow = true;
    group.add(cube);
  }

  // Position group at back-right corner near window
  group.position.set(1.0, 0, -roomDepth / 2 + 0.95);
  return group;
}

// Desk under window along right wall
function addDeskUnderWindow() {
  const group = new THREE.Group();
  const deskLength = 1.6; // align with window width
  const deskDepth = 0.55;
  const deskHeight = 0.76;

  const top = new THREE.Mesh(new THREE.BoxGeometry(deskLength, 0.04, deskDepth), new THREE.MeshStandardMaterial({ color: COLORS.deskTop }));
  top.position.set(0, deskHeight, 0);
  top.castShadow = true; top.receiveShadow = true;
  group.add(top);

  const legThickness = 0.05;
  const legMaterial = new THREE.MeshStandardMaterial({ color: COLORS.bedFrame });
  const legPositions = [
    [-deskLength / 2 + legThickness / 2, deskHeight / 2, -deskDepth / 2 + legThickness / 2],
    [deskLength / 2 - legThickness / 2, deskHeight / 2, -deskDepth / 2 + legThickness / 2],
    [-deskLength / 2 + legThickness / 2, deskHeight / 2, deskDepth / 2 - legThickness / 2],
    [deskLength / 2 - legThickness / 2, deskHeight / 2, deskDepth / 2 - legThickness / 2]
  ];
  for (const [x, y, z] of legPositions) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(legThickness, deskHeight, legThickness), legMaterial);
    leg.position.set(x, y, z);
    leg.castShadow = true; leg.receiveShadow = true;
    group.add(leg);
  }

  group.position.set(roomWidth / 2 - 0.8 - wallThickness, 0, 0);
  return group;
}

const bunk = addBunkBed();
scene.add(bunk);

const stairs = addStairsAndShelves();
scene.add(stairs);

const desk = addDeskUnderWindow();
scene.add(desk);

// Animate slight door swing for life
let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.01;
  door.rotation.y = Math.sin(t) * 0.1; // gentle swing
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  const h = window.innerHeight - toolbar.clientHeight;
  camera.aspect = window.innerWidth / h;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, h);
});
