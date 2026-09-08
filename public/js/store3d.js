import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Кольори з silpo.ua: синій #2358D1, червоний #DA291C, жовтий #FBBB5E, помаранчевий #FE8522.
const BLUE = 0x2358d1;
const RED = 0xda291c;
const YELLOW = 0xfbbb5e;
const ORANGE = 0xfe8522;
const INK = 0x202124;
const METAL = 0xfff4e4;

const ZONE_COLORS = {
  produce: 0x4ad85a,
  bakery: 0xffc14a,
  dairy: 0x4eb6ff,
  cheese: 0xffd34a,
  meat: 0xff5c52,
  sausage: 0xf07864,
  fish: 0x3aa8ff,
  deli: 0xff8c2a,
  grocery: 0xf0b24a,
  sauces: 0xe07a3a,
  sweets: 0xff74b8,
  snacks: 0xffb43a,
  coffee: 0xc46e3c,
  drinks: 0x3a9cff,
  frozen: 0x6edcff,
  alcohol: 0xd45a98,
  tobacco: 0xd2b48c,
  household: 0x6a9cff,
  care: 0xc888ff,
  health: 0x2ed9b0,
  kids: 0xff8ac8,
  pets: 0xe89a48,
  garden: 0x7edc5a,
  other: 0x7ab4ff
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
    (hsl.h + (rng() - 0.5) * 0.05 + 1) % 1,
    Math.min(1, hsl.s * (0.95 + rng() * 0.25)),
    Math.min(0.78, Math.max(0.38, hsl.l + (rng() - 0.5) * amount))
  );
  return color;
}

export class StoreMap3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.shelves = new Map();
    this.labels = [];
    this.routeGroup = null;
    this.promoGroup = null;
    this.hereGroup = null;
    this.youDot = null;
    this.walker = null;
    this.walkMode = false;
    this.curve = null;
    this.curveLength = 1;
    this.walkT = 0;
    this.walkPhase = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfff7e8);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
    this.camera.position.set(0, 30, 34);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.5, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.panSpeed = 1.15;
    this.controls.maxPolarAngle = Math.PI / 2.02;
    this.controls.minDistance = 1.1;
    this.controls.maxDistance = 90;
    this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = THREE.TOUCH.PAN;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.eyeMode = false;
    this.walkMode = false;
    this.onArrive = null;
    this.walkDone = false;

    this.scene.add(new THREE.AmbientLight(0xfff6e4, 0.72));
    this.scene.add(new THREE.HemisphereLight(0xfff8ee, 0xffd27a, 1.55));
    const sun = new THREE.DirectionalLight(0xfff4dc, 1.35);
    sun.position.set(14, 28, 16);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffe7b0, 0.7);
    fill.position.set(-18, 20, -14);
    this.scene.add(fill);
    const bounce = new THREE.DirectionalLight(0xfffaf0, 0.45);
    bounce.position.set(0, 22, -20);
    this.scene.add(bounce);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.raycaster = new THREE.Raycaster();
    this.onShelfTap = null;
    this._hoverId = null;
    this._pointerDown = null;
    canvas.addEventListener('pointerdown', (e) => {
      this._pointerDown = { x: e.clientX, y: e.clientY };
      if (e.button === 0) canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointerup', (e) => {
      canvas.style.cursor = 'grab';
      this._pick(e);
    });
    canvas.addEventListener('pointerleave', () => {
      this._pointerDown = null;
      this._hoverId = null;
      canvas.style.cursor = 'grab';
    });
    canvas.addEventListener('pointermove', (e) => this._hover(e));

    window.addEventListener('resize', () => this.resize());
    this.resize();

    // Підписи малюємо на canvas, тому чекаємо фірмовий шрифт і перемальовуємо.
    document.fonts?.ready.then(() => this._refreshLabels());

    const clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05);
      this.controls.update();
      this._clampPan();
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

  _hitShelf(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const targets = [...this.shelves.values()].flatMap((s) => [
      s.hit,
      s.frame,
      s.label
    ].filter(Boolean));
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    return { id: hit.object.userData.shelfId };
  }

  _pick(event) {
    const start = this._pointerDown;
    this._pointerDown = null;
    if (!this.onShelfTap || !start) return;
    // Обертання камери не має обирати стелаж.
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
    const hit = this._hitShelf(event);
    if (hit) this.onShelfTap(hit.id);
  }

  _hover(event) {
    if (this._pointerDown || !this.shelves.size) return;
    const hit = this._hitShelf(event);
    const id = hit?.id || null;
    this.canvas.style.cursor = id ? 'pointer' : 'grab';
    if (id === this._hoverId) return;
    this._hoverId = id;
    if (this.eyeMode) return;
    for (const entry of this.shelves.values()) {
      const hot = entry.shelf.id === id;
      const active = entry.header.material.emissiveIntensity > 0.4;
      entry.group.scale.setScalar(hot || active ? 1.05 : 1);
    }
  }

  loadLayout(layout) {
    this.clearRoute();
    if (this.hereGroup) {
      this.group.remove(this.hereGroup);
      this.hereGroup = null;
    }
    this.group.clear();
    this.shelves.clear();
    this.labels = [];
    this.layout = layout;

    this._floor(layout);
    this._entrance(layout.entrance);
    this._registers(layout);
    for (const island of layout.islands || []) this._promoIsland(island);
    for (const shelf of layout.shelves) this._shelf(shelf);

    this.frameAll();
  }

  setWalkMode(on) {
    this.walkMode = Boolean(on);
    this.eyeMode = this.walkMode;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    if (this.walkMode) {
      this.controls.enableRotate = false;
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = 0.12;
      this.controls.minDistance = 8;
      this.controls.maxDistance = 90;
      this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      this.controls.touches.ONE = THREE.TOUCH.PAN;
      this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      if (this.curve) this._frameRoute(this.curve.getPoints(8));
      else this.frameAll();
    } else {
      this.controls.enableRotate = true;
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = Math.PI / 2.02;
      this.controls.minDistance = 1.1;
      this.controls.maxDistance = 90;
      this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
      this.controls.touches.ONE = THREE.TOUCH.PAN;
      this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
      if (this.curve) this._frameRoute(this.curve.getPoints(8));
      else this.frameAll();
    }
    if (this.walker) this.walker.visible = !this.walkMode && !this.walkDone;
    if (this.youDot) this.youDot.visible = this.walkMode;
    this.pinShelfCards();
  }

  _clampPan() {
    if (!this.layout?.floor) return;
    const { width, depth } = this.layout.floor;
    const t = this.controls.target;
    const pad = 6;
    t.x = Math.min(width / 2 + pad, Math.max(-width / 2 - pad, t.x));
    t.z = Math.min(depth / 2 + pad, Math.max(-depth / 2 - pad, t.z));
    t.y = this.walkMode ? 0 : 0.5;
  }

  _floor({ floor }) {
    const { width, depth } = floor;
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: 0xfff8ea, roughness: 0.82, map: this._tileTexture(width, depth) })
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
    ctx.fillStyle = '#FFE9B8';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#F5C45C';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(width, depth);
    texture.anisotropy = 4;
    return texture;
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
    const deskMat = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.55 });
    const scoMat = new THREE.MeshStandardMaterial({ color: 0xd6e8ff, roughness: 0.5 });
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.85 });
    const screenMat = new THREE.MeshStandardMaterial({ color: INK, emissive: 0x0a1a3a, emissiveIntensity: 0.4 });
    const freeMat = new THREE.MeshStandardMaterial({ color: 0x07b324, emissive: 0x07b324, emissiveIntensity: 0.35, roughness: 0.5 });

    for (const register of registers || []) {
      const sco = register.kind === 'sco';
      const desk = new THREE.Mesh(new THREE.BoxGeometry(register.width, sco ? 1.15 : 1, register.depth), sco ? scoMat : deskMat);
      desk.position.set(register.x, sco ? 0.58 : 0.5, register.z);
      this.group.add(desk);

      if (!sco) {
        const belt = new THREE.Mesh(new THREE.BoxGeometry(register.width - 0.3, 0.06, 0.5), beltMat);
        belt.position.set(register.x, 1.03, register.z + 0.1);
        this.group.add(belt);
      }

      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(sco ? 0.42 : 0.5, sco ? 0.5 : 0.34, 0.08),
        register.recommended ? freeMat : screenMat
      );
      screen.position.set(register.x + register.width / 2 - 0.35, sco ? 1.45 : 1.3, register.z - 0.2);
      this.group.add(screen);

      const title = sco
        ? (register.recommended ? `SCO ${register.n} вільніше` : `SCO ${register.n}`)
        : `Каса ${register.n}`;
      this.group.add(this._label(title, register.x, sco ? 2.2 : 2, register.z - 1.1, register.recommended ? 'free' : 'checkout'));
    }

    if (checkout && !registers?.length) this.group.add(this._label('Каси', checkout.x, 2, checkout.z, 'checkout'));
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

  _shelfLevels(shelf) {
    if (shelf.kind === 'counter') {
      return [
        { n: 1, y: 0.42 },
        { n: 2, y: 0.78 },
        { n: 3, y: 1.16 }
      ];
    }
    return [
      { n: 1, y: 0.5 },
      { n: 2, y: 1.12 },
      { n: 3, y: 1.74 }
    ];
  }

  _shelf(shelf) {
    const group = new THREE.Group();
    group.position.set(shelf.x, 0, shelf.z);
    group.rotation.y = shelf.rotY || 0;

    const zoneColor = ZONE_COLORS[shelf.zone] || ZONE_COLORS.other;
    const height = shelf.kind === 'counter' ? 1.35 : 2.05;
    const aisleFace = shelf.kind === 'wall' || shelf.kind === 'fridge' || shelf.kind === 'counter';
    const sides = aisleFace ? [1] : [1, -1];
    const frameTint = new THREE.Color(zoneColor).lerp(new THREE.Color(0xfff6e8), shelf.kind === 'fridge' ? 0.72 : 0.38);
    const metal = new THREE.MeshStandardMaterial({
      color: frameTint,
      roughness: shelf.kind === 'fridge' ? 0.22 : 0.48,
      metalness: shelf.kind === 'fridge' ? 0.28 : 0.08,
      emissive: new THREE.Color(zoneColor),
      emissiveIntensity: 0.08
    });

    const back = new THREE.Mesh(new THREE.BoxGeometry(shelf.width, height, 0.08), metal);
    back.position.y = height / 2;
    back.userData.shelfId = shelf.id;
    group.add(back);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, shelf.depth), metal);
      post.position.set(side * (shelf.width / 2 - 0.04), height / 2, 0);
      group.add(post);
    }

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(shelf.width, 2.4), height + 1.1, Math.max(shelf.depth + 1.4, 1.8)),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.set(0, (height + 1.1) / 2, aisleFace ? shelf.depth / 2 + 0.35 : 0);
    hit.userData.shelfId = shelf.id;
    group.add(hit);

    const header = new THREE.Mesh(
      new THREE.BoxGeometry(shelf.width, 0.28, shelf.depth + 0.08),
      new THREE.MeshStandardMaterial({
        color: zoneColor,
        roughness: 0.42,
        emissive: new THREE.Color(zoneColor),
        emissiveIntensity: shelf.popular ? 0.32 : 0.2
      })
    );
    header.position.y = height + 0.14;
    group.add(header);

    if (shelf.kind === 'fridge') {
      for (const side of sides) {
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(shelf.width - 0.16, height - 0.2, 0.04),
          new THREE.MeshStandardMaterial({
            color: 0xb8ecff,
            transparent: true,
            opacity: 0.38,
            roughness: 0.05,
            metalness: 0.12,
            emissive: 0x7ad4ff,
            emissiveIntensity: 0.22
          })
        );
        glass.position.set(0, height / 2, side * (shelf.depth / 2 + 0.03));
        group.add(glass);
      }
    }

    const { planks } = this._stock(group, { ...shelf, height }, sides, zoneColor);

    const label = this._label(
      shelf.name,
      0,
      height + 0.58,
      aisleFace ? shelf.depth / 2 + 0.18 : 0,
      'shelf'
    );
    label.userData.shelfId = shelf.id;
    group.add(label);

    this.group.add(group);
    this.shelves.set(shelf.id, {
      group,
      shelf,
      frame: back,
      header,
      label,
      hit,
      planks,
      baseColor: zoneColor
    });
  }

  /** Три полиці з товарами: низ / середина / рівень очей. */
  _stock(group, shelf, sides, zoneColor) {
    const rng = rngFrom(`${shelf.id}:${shelf.width}`);
    const levels = this._shelfLevels(shelf);
    const bottle = BOTTLE_ZONES.has(shelf.zone);
    const itemW = bottle ? 0.2 : 0.28;
    const perRow = Math.max(3, Math.floor((shelf.width - 0.35) / (itemW + 0.06)));
    const count = perRow * levels.length * sides.length;
    const geometry = bottle
      ? new THREE.CylinderGeometry(itemW / 2, itemW / 2, 0.42, 10)
      : new THREE.BoxGeometry(itemW, 0.38, 0.24);
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ roughness: 0.42 }),
      count
    );

    const matrix = new THREE.Matrix4();
    let index = 0;
    const planks = [];
    const levelColors = [0xffc14a, 0x4eb6ff, 0x4ad85a];

    for (const side of sides) {
      for (const level of levels) {
        const plankMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(zoneColor).lerp(new THREE.Color(0xfff4dc), 0.58),
          roughness: 0.55,
          emissive: new THREE.Color(zoneColor),
          emissiveIntensity: 0.06
        });
        const plank = new THREE.Mesh(new THREE.BoxGeometry(shelf.width - 0.08, 0.05, 0.42), plankMat);
        plank.position.set(0, level.y, side * (shelf.depth / 2 + 0.12));
        plank.userData = { shelfId: shelf.id };
        group.add(plank);
        planks.push({ mesh: plank, level: level.n, material: plankMat });

        const brandTint = new THREE.Color(zoneColor).lerp(new THREE.Color(levelColors[level.n - 1]), 0.4);
        for (let i = 0; i < perRow; i += 1) {
          const x = -shelf.width / 2 + 0.36 + i * ((shelf.width - 0.72) / Math.max(1, perRow - 1));
          const height = bottle ? 0.34 + rng() * 0.12 : 0.3 + rng() * 0.16;
          matrix.makeScale(1, height / 0.38, 1);
          matrix.setPosition(
            x,
            level.y + 0.03 + height / 2,
            side * (shelf.depth / 2 + 0.18)
          );
          mesh.setMatrixAt(index, matrix);
          mesh.setColorAt(index, tint(brandTint.getHex(), rng, 0.18));
          index += 1;
        }
      }
    }

    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    return { planks };
  }

  _label(text, x, y, z, variant) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false })
    );
    sprite.material.map.colorSpace = THREE.SRGBColorSpace;
    sprite.position.set(x, y, z);
    const scale = variant === 'shelf' ? [3.2, 0.8] : [2.4, 0.6];
    sprite.scale.set(scale[0], scale[1], 1);
    sprite.userData = { canvas, text, variant };
    if (variant !== 'promo') this.labels.push(sprite);
    this._drawLabel(sprite);
    return sprite;
  }

  _drawLabel(sprite) {
    const { canvas, text, variant } = sprite.userData;
    const ctx = canvas.getContext('2d');
    const fill = variant === 'entrance'
      ? '#FBBB5E'
      : variant === 'checkout'
        ? '#FE8522'
        : variant === 'free'
          ? '#07B324'
          : variant === 'promo'
            ? '#FBBB5E'
            : '#2358D1';
    const color = variant === 'entrance' || variant === 'free' || variant === 'promo' ? '#202124' : '#ffffff';
    const raw = String(text || '');
    const label = variant === 'shelf' && raw.length > 14
      ? `${raw.slice(0, 13)}…`
      : raw.length > 22
        ? `${raw.slice(0, 21)}…`
        : raw;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(16, 34, 480, 60, 30) : ctx.rect(16, 34, 480, 60);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = variant === 'shelf'
      ? "800 36px 'Silpo Text', -apple-system, sans-serif"
      : "700 34px 'Silpo Text', -apple-system, sans-serif";
    ctx.fillText(label, 256, 65);
    sprite.material.map.needsUpdate = true;
  }

  _refreshLabels() {
    for (const sprite of this.labels) this._drawLabel(sprite);
  }

  frameAll() {
    if (!this.layout) return;
    if (this.walkMode) {
      const { width, depth } = this.layout.floor;
      const span = Math.max(width, depth, 16);
      this.camera.fov = 50;
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, span * 1.2, 0.02);
      this.camera.updateProjectionMatrix();
      return;
    }
    this.eyeMode = false;
    this.controls.minDistance = 1.1;
    this.controls.maxDistance = 90;
    this.controls.maxPolarAngle = Math.PI / 2.02;
    const { width, depth } = this.layout.floor;
    const radius = Math.hypot(width, depth) / 2;
    const fovY = (this.camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(fovY, fovX) / 2)) * 1.06;

    this.camera.fov = 46;
    this.controls.target.set(0, 0.5, 0);
    this.camera.position.set(0, distance * 0.74, distance * 0.68);
    this.camera.updateProjectionMatrix();
  }

  highlight(shelfId) {
    this._hoverId = shelfId || null;
    for (const entry of this.shelves.values()) {
      const active = entry.shelf.id === shelfId;
      entry.header.material.color = new THREE.Color(active ? ORANGE : entry.baseColor);
      entry.header.material.emissive = new THREE.Color(active ? ORANGE : entry.shelf.popular ? YELLOW : entry.baseColor);
      entry.header.material.emissiveIntensity = active ? 0.55 : entry.shelf.popular ? 0.32 : 0.2;
      if (!this.eyeMode) entry.group.scale.setScalar(active ? 1.05 : 1);
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
    this.youDot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: BLUE, emissive: BLUE, emissiveIntensity: 0.55, roughness: 0.4 })
    );
    this.youDot.position.copy(verts[0]).setY(0.22);
    this.youDot.visible = this.walkMode;
    this.routeGroup.add(this.youDot);
    this.markHere(null);
    this.walkT = 0;
    this.walkPhase = 0;
    this.walkDone = false;
    this._arriveNotified = false;

    this.group.add(this.routeGroup);
    if (opts.focus !== false && !this.eyeMode) this._frameRoute(verts);
    if (this.walkMode) this._frameRoute(verts);
  }

  pinShelfCards() {
    if (this.promoGroup && this.routeGroup) {
      this.routeGroup.remove(this.promoGroup);
      this.promoGroup.traverse((obj) => {
        obj.geometry?.dispose();
        obj.material?.map?.dispose();
        obj.material?.dispose?.();
      });
      this.promoGroup = null;
    }
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

    if (!this.walkDone) {
      const stopAt = Math.max(0.62, 1 - Math.min(3.2, this.curveLength * 0.28) / this.curveLength);
      const speed = 1.7 / this.curveLength;
      this.walkT = Math.min(stopAt, this.walkT + dt * speed);
      if (this.walkT >= stopAt) this.walkDone = true;
    }

    const t = Math.min(0.999, this.walkT);
    const position = this.curve.getPointAt(t);
    const tangent = this.curve.getTangentAt(t);
    const swing = this.walkDone ? 0 : Math.sin(this.walkPhase);
    if (!this.walkDone) this.walkPhase += dt * 8.5;

    this.walker.position.set(position.x, Math.abs(swing) * 0.03, position.z);
    this.walker.rotation.y = Math.atan2(tangent.x, tangent.z);
    this.walker.visible = !this.walkMode && !this.walkDone;
    if (this.youDot) {
      const start = this.curve.getPointAt(0);
      this.youDot.visible = this.walkMode;
      this.youDot.position.set(start.x, 0.22, start.z);
    }

    const [leftLeg, rightLeg] = this.walker.userData.legs;
    const [leftArm, rightArm] = this.walker.userData.arms;
    leftLeg.rotation.x = swing * 0.6;
    rightLeg.rotation.x = -swing * 0.6;
    leftArm.rotation.x = -swing * 0.45;
    rightArm.rotation.x = swing * 0.2;

    if (this.walkDone && !this._arriveNotified) {
      this._arriveNotified = true;
      if (!this.walkMode) this.walker.visible = false;
      this.onArrive?.();
    }
  }

  _frameRoute(verts) {
    const box = new THREE.Box3().setFromPoints(verts);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    if (this.walkMode) {
      const span = Math.max(14, size.x, size.z) * 1.35;
      this.camera.fov = 50;
      this.controls.target.set(center.x, 0, center.z);
      this.camera.position.set(center.x, span, center.z + 0.02);
      this.camera.updateProjectionMatrix();
      return;
    }
    const radius = Math.max(7, Math.hypot(size.x, size.z) / 2);
    const fovY = (this.camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(fovY, fovX) / 2)) * 1.02;

    this.controls.target.set(center.x, 0.5, center.z);
    this.camera.position.set(center.x, distance * 0.76, center.z + distance * 0.6);
    this.camera.updateProjectionMatrix();
  }

  markHere(shelf) {
    if (this.hereGroup) {
      this.group.remove(this.hereGroup);
      this.hereGroup = null;
    }
    if (!shelf) return;
    this.hereGroup = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: BLUE, emissive: BLUE, emissiveIntensity: 0.5, roughness: 0.4 })
    );
    disc.position.set(shelf.x, 0.2, shelf.z);
    this.hereGroup.add(disc);
    this.hereGroup.add(this._label('Ви тут', shelf.x, 2.5, shelf.z, 'entrance'));
    this.group.add(this.hereGroup);
  }

  clearRoute() {
    if (this.routeGroup) {
      this.group.remove(this.routeGroup);
      this.routeGroup.traverse((obj) => obj.geometry?.dispose());
      this.routeGroup = null;
    }
    this.walker = null;
    this.youDot = null;
    this.promoGroup = null;
    this.curve = null;
  }
}
