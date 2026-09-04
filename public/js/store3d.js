import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Кольори з silpo.ua: синій #2358D1, червоний #DA291C, жовтий #FBBB5E, помаранчевий #FE8522.
const BLUE = 0x2358d1;
const RED = 0xda291c;
const YELLOW = 0xfbbb5e;
const ORANGE = 0xfe8522;
const INK = 0x202124;
const METAL = 0xd7dce6;

const ZONE_COLORS = {
  produce: 0x4caf50,
  bakery: 0xe0a63c,
  dairy: 0x64a8e8,
  cheese: 0xf0c14b,
  meat: 0xd9534f,
  sausage: 0xc2695c,
  fish: 0x2f8fd0,
  deli: 0xfe8522,
  grocery: 0xc79a55,
  sauces: 0xa9663c,
  sweets: 0xe173a5,
  snacks: 0xf3a63c,
  coffee: 0x7a5236,
  drinks: 0x3d8fd8,
  frozen: 0x8ecae6,
  alcohol: 0x8e5673,
  tobacco: 0x8b8a86,
  household: 0x7f8aa0,
  care: 0xa17dc4,
  health: 0x45b39a,
  kids: 0xf4a3bd,
  pets: 0xa9855c,
  garden: 0x74a35a,
  other: 0xa9b0bd
};

const BOTTLE_ZONES = new Set(['drinks', 'alcohol', 'sauces', 'care']);

function rngFrom(seed) {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    a ^= seed.charCodeAt(i);
    a = Math.imul(a, 16777619);
  }
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tint(hex, rng, amount = 0.22) {
  const color = new THREE.Color(hex);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL(
    (hsl.h + (rng() - 0.5) * 0.08 + 1) % 1,
    Math.min(1, hsl.s * (0.7 + rng() * 0.6)),
    Math.min(0.9, Math.max(0.25, hsl.l + (rng() - 0.5) * amount))
  );
  return color;
}

export class StoreMap3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.shelves = new Map();
    this.labels = [];
    this.routeGroup = null;
    this.walker = null;
    this.curve = null;
    this.curveLength = 1;
    this.walkT = 0;
    this.walkPhase = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf2f4f9);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
    this.camera.position.set(0, 30, 34);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.5, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 90;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc7ced9, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(14, 26, 18);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.28);
    fill.position.set(-16, 18, -12);
    this.scene.add(fill);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.raycaster = new THREE.Raycaster();
    this.onShelfTap = null;
    canvas.addEventListener('pointerdown', (e) => this._pick(e));

    window.addEventListener('resize', () => this.resize());
    this.resize();

    // Підписи малюємо на canvas, тому чекаємо фірмовий шрифт і перемальовуємо.
    document.fonts?.ready.then(() => this._refreshLabels());

    const clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05);
      this.controls.update();
      this._animateWalker(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.layout && !this.routeGroup) this.frameAll();
  }

  _pick(event) {
    if (!this.onShelfTap) return;
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const meshes = [...this.shelves.values()].map((s) => s.frame);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (hit) this.onShelfTap(hit.object.userData.shelfId);
  }

  loadLayout(layout) {
    this.clearRoute();
    this.group.clear();
    this.shelves.clear();
    this.labels = [];
    this.layout = layout;

    this._floor(layout);
    this._walls(layout);
    this._entrance(layout.entrance);
    this._registers(layout);
    for (const island of layout.islands || []) this._promoIsland(island);
    for (const shelf of layout.shelves) this._shelf(shelf);

    this.frameAll();
  }

  _floor({ floor }) {
    const { width, depth } = floor;
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: this._tileTexture(width, depth) })
    );
    slab.rotation.x = -Math.PI / 2;
    this.group.add(slab);
  }

  /** Плитка підлоги текстурою, а не сіткою: не виходить за межі залу. */
  _tileTexture(width, depth) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#EDF0F5';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#E1E6EF';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(width, depth);
    texture.anisotropy = 4;
    return texture;
  }

  _walls({ floor }) {
    const { width, depth } = floor;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
    const walls = [
      { x: 0, z: -depth / 2, w: width, d: 0.3 },
      { x: -width / 2, z: 0, w: 0.3, d: depth },
      { x: width / 2, z: 0, w: 0.3, d: depth }
    ];
    for (const wall of walls) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, 4, wall.d), mat);
      mesh.position.set(wall.x, 2, wall.z);
      this.group.add(mesh);
    }
  }

  _entrance(point) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.7 })
    );
    pad.position.set(point.x, 0.05, point.z);
    this.group.add(pad);

    const postMat = new THREE.MeshStandardMaterial({ color: METAL, metalness: 0.5, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.5), postMat);
      post.position.set(point.x + side * 1.25, 0.55, point.z);
      this.group.add(post);
    }

    this.group.add(this._label('Вхід', point.x, 1.9, point.z, 'entrance'));
  }

  _registers({ registers, checkout }) {
    const deskMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.85 });
    const screenMat = new THREE.MeshStandardMaterial({ color: INK, emissive: 0x0a1a3a, emissiveIntensity: 0.4 });

    for (const register of registers || []) {
      const desk = new THREE.Mesh(new THREE.BoxGeometry(register.width, 1, register.depth), deskMat);
      desk.position.set(register.x, 0.5, register.z);
      this.group.add(desk);

      const belt = new THREE.Mesh(new THREE.BoxGeometry(register.width - 0.3, 0.06, 0.5), beltMat);
      belt.position.set(register.x, 1.03, register.z + 0.1);
      this.group.add(belt);

      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.08), screenMat);
      screen.position.set(register.x + register.width / 2 - 0.4, 1.3, register.z - 0.2);
      this.group.add(screen);
    }

    if (checkout) this.group.add(this._label('Каси', checkout.x, 2, checkout.z, 'checkout'));
  }

  _promoIsland(island) {
    const group = new THREE.Group();
    group.position.set(island.x, 0, island.z);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(island.size, 0.35, island.size),
      new THREE.MeshStandardMaterial({ color: RED, roughness: 0.6 })
    );
    base.position.y = 0.18;
    group.add(base);

    const rng = rngFrom(`promo${island.x}${island.z}`);
    for (let i = 0; i < 9; i += 1) {
      const size = 0.3 + rng() * 0.16;
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshStandardMaterial({ color: tint(YELLOW, rng, 0.3), roughness: 0.65 })
      );
      crate.position.set((rng() - 0.5) * (island.size - 0.5), 0.36 + size / 2 + Math.floor(i / 5) * size, (rng() - 0.5) * (island.size - 0.5));
      crate.rotation.y = rng() * Math.PI;
      group.add(crate);
    }

    const sign = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.07, 24),
      new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.5 })
    );
    sign.position.y = 1.5;
    sign.rotation.x = Math.PI / 2;
    group.add(sign);

    this.group.add(group);
  }

  _shelf(shelf) {
    const group = new THREE.Group();
    group.position.set(shelf.x, 0, shelf.z);
    group.rotation.y = shelf.rotY || 0;

    const zoneColor = ZONE_COLORS[shelf.zone] || ZONE_COLORS.other;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(shelf.width, shelf.height, shelf.depth),
      new THREE.MeshStandardMaterial({
        color: shelf.kind === 'fridge' ? 0xf7fafc : METAL,
        roughness: shelf.kind === 'fridge' ? 0.3 : 0.8,
        metalness: shelf.kind === 'fridge' ? 0.3 : 0.1
      })
    );
    body.position.y = shelf.height / 2;
    body.userData.shelfId = shelf.id;
    group.add(body);

    // Кольоровий фриз зверху — так відділ видно навіть без підпису.
    const header = new THREE.Mesh(
      new THREE.BoxGeometry(shelf.width, 0.3, shelf.depth + 0.06),
      new THREE.MeshStandardMaterial({ color: zoneColor, roughness: 0.55 })
    );
    header.position.y = shelf.height + 0.15;
    if (shelf.popular) {
      header.material.emissive = new THREE.Color(YELLOW);
      header.material.emissiveIntensity = 0.28;
    }
    group.add(header);

    const sides = shelf.kind === 'wall' || shelf.kind === 'fridge' || shelf.kind === 'counter' ? [1] : [1, -1];

    if (shelf.kind === 'fridge') {
      for (const side of sides) {
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(shelf.width - 0.2, shelf.height - 0.5, 0.05),
          new THREE.MeshStandardMaterial({
            color: 0xdff0fb,
            transparent: true,
            opacity: 0.42,
            roughness: 0.05,
            metalness: 0.1
          })
        );
        glass.position.set(0, shelf.height / 2 + 0.1, side * (shelf.depth / 2 + 0.04));
        group.add(glass);
      }
    } else if (shelf.kind === 'counter') {
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(shelf.width - 0.1, 0.7, shelf.depth + 0.3),
        new THREE.MeshStandardMaterial({ color: 0xeaf4fb, transparent: true, opacity: 0.34, roughness: 0.05 })
      );
      glass.position.set(0, shelf.height + 0.35, 0.1);
      group.add(glass);
    }

    this._stock(group, shelf, sides, zoneColor);

    const label = this._label(shelf.name, 0, shelf.height + 0.85, 0, 'shelf');
    group.add(label);

    this.group.add(group);
    this.shelves.set(shelf.id, { group, shelf, frame: body, header, label, baseColor: zoneColor });
  }

  /** Товари на полицях: ряди коробок і бутлів, стабільні для конкретного відділу. */
  _stock(group, shelf, sides, zoneColor) {
    const rng = rngFrom(`${shelf.id}:${shelf.width}`);
    const levels = [];
    const top = shelf.kind === 'counter' ? shelf.height + 0.05 : shelf.height - 0.35;
    for (let y = 0.55; y <= top; y += 0.55) levels.push(y);
    if (!levels.length) levels.push(shelf.height / 2);

    const bottle = BOTTLE_ZONES.has(shelf.zone);
    const itemW = bottle ? 0.16 : 0.22;
    const perRow = Math.max(2, Math.floor((shelf.width - 0.4) / (itemW + 0.03)));
    const count = perRow * levels.length * sides.length;

    const geometry = bottle
      ? new THREE.CylinderGeometry(itemW / 2, itemW / 2, 0.34, 8)
      : new THREE.BoxGeometry(itemW, 0.3, 0.2);
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      count
    );

    const matrix = new THREE.Matrix4();
    let index = 0;

    for (const side of sides) {
      const plankMat = new THREE.MeshStandardMaterial({ color: 0xc9d1de, roughness: 0.75 });
      for (const y of levels) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(shelf.width - 0.1, 0.04, 0.34), plankMat);
        plank.position.set(0, y - 0.17, side * (shelf.depth / 2 + 0.12));
        group.add(plank);

        for (let i = 0; i < perRow; i += 1) {
          const x = -shelf.width / 2 + 0.28 + i * ((shelf.width - 0.56) / Math.max(1, perRow - 1));
          const height = 0.24 + rng() * 0.18;
          matrix.makeScale(1, height / 0.3, 1);
          matrix.setPosition(
            x + (rng() - 0.5) * 0.03,
            y - 0.14 + height / 2,
            side * (shelf.depth / 2 + 0.16 + rng() * 0.06)
          );
          mesh.setMatrixAt(index, matrix);
          mesh.setColorAt(index, tint(zoneColor, rng));
          index += 1;
        }
      }
    }

    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  _label(text, x, y, z, variant) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false })
    );
    sprite.position.set(x, y, z);
    sprite.scale.set(variant === 'shelf' ? 4.8 : 3.4, variant === 'shelf' ? 1.2 : 0.85, 1);
    sprite.userData = { canvas, text, variant };
    this.labels.push(sprite);
    this._drawLabel(sprite);
    return sprite;
  }

  _drawLabel(sprite) {
    const { canvas, text, variant } = sprite.userData;
    const ctx = canvas.getContext('2d');
    const fill = variant === 'entrance' ? '#FBBB5E' : variant === 'checkout' ? '#FE8522' : 'rgba(32,33,36,0.9)';
    const color = variant === 'entrance' ? '#202124' : '#ffffff';
    const label = String(text).length > 26 ? `${String(text).slice(0, 25)}…` : String(text);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(16, 34, 480, 60, 30) : ctx.rect(16, 34, 480, 60);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = "700 34px 'Silpo Text', -apple-system, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 65);
    sprite.material.map.needsUpdate = true;
  }

  _refreshLabels() {
    for (const sprite of this.labels) this._drawLabel(sprite);
  }

  frameAll() {
    if (!this.layout) return;
    const { width, depth } = this.layout.floor;
    const radius = Math.hypot(width, depth) / 2;
    const fovY = (this.camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(fovY, fovX) / 2)) * 1.06;

    this.controls.target.set(0, 0.5, 0);
    this.camera.position.set(0, distance * 0.74, distance * 0.68);
    this.camera.updateProjectionMatrix();
  }

  highlight(shelfId) {
    for (const entry of this.shelves.values()) {
      const active = entry.shelf.id === shelfId;
      entry.header.material.color = new THREE.Color(active ? ORANGE : entry.baseColor);
      entry.header.material.emissive = new THREE.Color(active ? 0x6b3200 : entry.shelf.popular ? YELLOW : 0x000000);
      entry.header.material.emissiveIntensity = active ? 0.6 : entry.shelf.popular ? 0.28 : 0;
      entry.group.scale.setScalar(active ? 1.03 : 1);
    }
  }

  showRoute(points, opts = {}) {
    this.clearRoute();
    if (!points || points.length < 2) return;

    this.routeGroup = new THREE.Group();
    const verts = points.map((p) => new THREE.Vector3(p.x, 0.12, p.z));
    this.curve = new THREE.CatmullRomCurve3(verts, false, 'catmullrom', 0.02);
    this.curveLength = Math.max(1, this.curve.getLength());

    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(this.curve, Math.min(400, verts.length * 40), 0.14, 8, false),
      new THREE.MeshStandardMaterial({ color: ORANGE, emissive: 0x5a2c00, emissiveIntensity: 0.35, roughness: 0.4 })
    );
    this.routeGroup.add(tube);

    verts.forEach((v, i) => {
      if (i === 0) return;
      const isFinish = i === verts.length - 1;
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(isFinish ? 0.5 : 0.24, isFinish ? 0.5 : 0.24, 0.07, 20),
        new THREE.MeshStandardMaterial({ color: isFinish ? RED : 0xffffff, roughness: 0.5 })
      );
      marker.position.copy(v).setY(0.14);
      this.routeGroup.add(marker);
    });

    this.walker = this._makeWalker();
    this.routeGroup.add(this.walker);
    this.walkT = 0;
    this.walkPhase = 0;

    this.group.add(this.routeGroup);
    if (opts.focus !== false) this._frameRoute(verts);
  }

  /** Покупець із кошиком: ноги й руки крокують, корпус повертається за маршрутом. */
  _makeWalker() {
    const walker = new THREE.Group();

    // Підсвітка під ногами: з висоти пташиного льоту фігурку інакше важко знайти.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.6, 28),
      new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    walker.add(ring);

    const skin = new THREE.MeshStandardMaterial({ color: 0xf1c7a4, roughness: 0.7 });
    const shirt = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.65 });
    const jeans = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.75 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12), shirt);
    torso.position.y = 1.02;
    walker.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skin);
    head.position.y = 1.42;
    walker.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), jeans);
    hair.position.y = 1.44;
    walker.add(hair);

    walker.userData.legs = [];
    walker.userData.arms = [];

    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.09, 0.82, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.5, 4, 8), jeans);
      leg.position.y = -0.31;
      hip.add(leg);
      walker.add(hip);
      walker.userData.legs.push(hip);

      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.2, 1.2, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.34, 4, 8), skin);
      arm.position.y = -0.22;
      shoulder.add(arm);
      walker.add(shoulder);
      walker.userData.arms.push(shoulder);

      if (side === 1) {
        const basket = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.22, 0.22),
          new THREE.MeshStandardMaterial({ color: RED, roughness: 0.55 })
        );
        basket.position.set(0, -0.46, 0.02);
        shoulder.add(basket);
      }
    }

    return walker;
  }

  _animateWalker(dt) {
    if (!this.walker || !this.curve) return;

    const speed = 1.5 / this.curveLength;
    this.walkT = (this.walkT + dt * speed) % 1;
    this.walkPhase += dt * 8.5;

    const position = this.curve.getPointAt(this.walkT);
    const tangent = this.curve.getTangentAt(this.walkT);
    const swing = Math.sin(this.walkPhase);

    this.walker.position.set(position.x, Math.abs(swing) * 0.03, position.z);
    this.walker.rotation.y = Math.atan2(tangent.x, tangent.z);

    const [leftLeg, rightLeg] = this.walker.userData.legs;
    const [leftArm, rightArm] = this.walker.userData.arms;
    leftLeg.rotation.x = swing * 0.6;
    rightLeg.rotation.x = -swing * 0.6;
    leftArm.rotation.x = -swing * 0.45;
    rightArm.rotation.x = swing * 0.2;
  }

  _frameRoute(verts) {
    const box = new THREE.Box3().setFromPoints(verts);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(7, Math.hypot(size.x, size.z) / 2);
    const fovY = (this.camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(fovY, fovX) / 2)) * 1.02;

    this.controls.target.set(center.x, 0.5, center.z);
    this.camera.position.set(center.x, distance * 0.76, center.z + distance * 0.6);
    this.camera.updateProjectionMatrix();
  }

  clearRoute() {
    if (this.routeGroup) {
      this.group.remove(this.routeGroup);
      this.routeGroup.traverse((obj) => obj.geometry?.dispose());
      this.routeGroup = null;
    }
    this.walker = null;
    this.curve = null;
  }
}
