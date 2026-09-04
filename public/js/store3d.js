import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Палітра «Сільпо» AI Factory: теплий крем, помаранчевий, жовтий, синій, ink.
const ZONE_COLORS = {
  produce: 0x8ab447,
  bakery: 0xffd939,
  dairy: 0x8fc4f2,
  cheese: 0xf3c65a,
  meat: 0xd9534a,
  sausage: 0xc0705a,
  fish: 0x317de9,
  deli: 0xfe860f,
  grocery: 0xd79a4e,
  sauces: 0xa86a3c,
  sweets: 0xe98aa8,
  snacks: 0xf2a950,
  coffee: 0x7a5236,
  drinks: 0x5b9bd5,
  frozen: 0xa9d6ea,
  alcohol: 0x8f5b7a,
  tobacco: 0x8a8079,
  household: 0x8b93a1,
  care: 0xa98cc4,
  health: 0x63b79a,
  kids: 0xf7b4c6,
  pets: 0xb08e63,
  garden: 0x7aa45c,
  other: 0xb0a79d
};

const ACCENT = 0xfe860f;
const YELLOW = 0xffd939;

export class StoreMap3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.shelves = new Map();
    this.routeGroup = null;
    this.walker = null;
    this.curve = null;
    this.walkT = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfff7ea);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    this.camera.position.set(0, 26, 30);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.5, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 60;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cbb8, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(12, 22, 14);
    this.scene.add(sun);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.raycaster = new THREE.Raycaster();
    this.onShelfTap = null;
    canvas.addEventListener('pointerdown', (e) => this._pick(e));

    window.addEventListener('resize', () => this.resize());
    this.resize();

    const clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => {
      const dt = clock.getDelta();
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
    this.layout = layout;

    const { width, depth } = layout.floor;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: 0xf9f1e3, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    const grid = new THREE.GridHelper(Math.max(width, depth), Math.max(width, depth) / 2, 0xe6dcd0, 0xf1e7da);
    grid.position.y = 0.01;
    this.group.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.9 });
    const walls = [
      { x: 0, z: -depth / 2, w: width, d: 0.4 },
      { x: -width / 2, z: 0, w: 0.4, d: depth },
      { x: width / 2, z: 0, w: 0.4, d: depth }
    ];
    for (const w of walls) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, 3.4, w.d), wallMat);
      mesh.position.set(w.x, 1.7, w.z);
      this.group.add(mesh);
    }

    this._pad(layout.entrance, YELLOW, 'Вхід');
    this._pad(layout.checkout, ACCENT, 'Каси');
    this._checkouts(layout.checkout);

    for (const shelf of layout.shelves) this._shelf(shelf);
    this.frameAll();
  }

  frameAll() {
    if (!this.layout) return;
    const { width, depth } = this.layout.floor;
    const radius = Math.hypot(width, depth) / 2;
    const fovY = (this.camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(fovY, fovX) / 2)) * 0.95;

    this.controls.target.set(0, 0.5, 0);
    this.camera.position.set(0, distance * 0.72, distance * 0.7);
    this.camera.updateProjectionMatrix();
  }

  _pad(point, color, label) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 0.12, 28),
      new THREE.MeshStandardMaterial({ color })
    );
    pad.position.set(point.x, 0.07, point.z);
    this.group.add(pad);
    this.group.add(this._label(label, point.x, 1.6, point.z, true));
  }

  _checkouts(point) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xfbecd9, roughness: 0.7 });
    for (let i = 0; i < 4; i += 1) {
      const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.8), mat);
      desk.position.set(point.x - i * 3.4, 0.45, point.z);
      this.group.add(desk);
    }
  }

  _shelf(shelf) {
    const group = new THREE.Group();
    group.position.set(shelf.x, 0, shelf.z);
    group.rotation.y = shelf.rotY || 0;

    const color = ZONE_COLORS[shelf.zone] || ZONE_COLORS.other;
    const isFridge = shelf.kind === 'fridge';
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(shelf.width, shelf.height, shelf.depth),
      new THREE.MeshStandardMaterial({
        color,
        roughness: isFridge ? 0.25 : 0.75,
        metalness: isFridge ? 0.35 : 0
      })
    );
    frame.position.y = shelf.height / 2;
    frame.userData.shelfId = shelf.id;
    group.add(frame);

    if (isFridge) {
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(shelf.width - 0.2, shelf.height - 0.6, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xe9f4fd, transparent: true, opacity: 0.5, roughness: 0.1 })
      );
      glass.position.set(0, shelf.height / 2 + 0.1, shelf.depth / 2 + 0.05);
      group.add(glass);
    } else {
      const plankMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.6 });
      const levels = [0.45, 0.95, 1.45].filter((y) => y < shelf.height - 0.2);
      for (const y of levels) {
        for (const side of [1, -1]) {
          const plank = new THREE.Mesh(
            new THREE.BoxGeometry(shelf.width - 0.15, 0.07, 0.34),
            plankMat
          );
          plank.position.set(0, y, side * (shelf.depth / 2 + 0.14));
          group.add(plank);
        }
      }
    }

    const label = this._label(shelf.name, 0, shelf.height + 0.5, 0, false);
    group.add(label);
    this.group.add(group);
    this.shelves.set(shelf.id, { group, shelf, frame, label, baseColor: color });
  }

  _label(text, x, y, z, accent) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = accent ? 'rgba(254,134,15,0.96)' : 'rgba(34,24,18,0.88)';
    ctx.fillRect(0, 26, 512, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px -apple-system, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text).slice(0, 30), 256, 56);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })
    );
    sprite.position.set(x, y, z);
    sprite.scale.set(3.9, 0.85, 1);
    return sprite;
  }

  highlight(shelfId) {
    for (const entry of this.shelves.values()) {
      const active = entry.shelf.id === shelfId;
      entry.frame.material.color = new THREE.Color(active ? ACCENT : entry.baseColor);
      entry.frame.material.emissive = new THREE.Color(active ? 0x5a2c00 : 0x000000);
      entry.group.scale.setScalar(active ? 1.04 : 1);
    }
  }

  showRoute(points, opts = {}) {
    this.clearRoute();
    if (!points || points.length < 2) return;

    this.routeGroup = new THREE.Group();
    const verts = points.map((p) => new THREE.Vector3(p.x, 0.14, p.z));
    this.curve = new THREE.CatmullRomCurve3(verts, false, 'catmullrom', 0.05);

    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(this.curve, 200, 0.16, 10, false),
      new THREE.MeshStandardMaterial({ color: ACCENT, emissive: 0x6b3200, roughness: 0.4 })
    );
    this.routeGroup.add(tube);

    verts.forEach((v, i) => {
      if (i === 0 || i === verts.length - 1) return;
      const dot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.08, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      dot.position.copy(v).setY(0.16);
      this.routeGroup.add(dot);
    });

    this.walker = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: ACCENT, emissiveIntensity: 0.45 })
    );
    this.routeGroup.add(this.walker);
    this.walkT = 0;

    this.group.add(this.routeGroup);

    if (opts.focus !== false) this._frameRoute(verts);
  }

  _frameRoute(verts) {
    const box = new THREE.Box3().setFromPoints(verts);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(6, Math.hypot(size.x, size.z) / 2);
    const fovY = (this.camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(fovY, fovX) / 2)) * 1.05;

    this.controls.target.set(center.x, 0.5, center.z);
    this.camera.position.set(center.x, distance * 0.78, center.z + distance * 0.62);
    this.camera.updateProjectionMatrix();
  }

  _animateWalker(dt) {
    if (!this.walker || !this.curve) return;
    this.walkT = (this.walkT + dt * 0.12) % 1;
    this.walker.position.copy(this.curve.getPointAt(this.walkT)).setY(0.5);
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
