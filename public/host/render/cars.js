// Atores dinamicos: picapes, caixas de item, minas, misseis e ondas Whomp.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLORS } from '/shared/protocol.js';
import { buildTruck } from './models.js';
import { questionTexture, softShadowTexture, glowTexture } from './textures.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...o });

export class Actors {
  constructor(scene, { shadows = true } = {}) {
    this.scene = scene;
    this.shadows = shadows;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.cars = new Map();
    this.boxes = [];
    this.mines = [];
    this.missiles = [];
    this.shocks = [];
    this.blobMat = new THREE.MeshBasicMaterial({ map: softShadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.boxGeo = new RoundedBoxGeometry(2.8, 2.8, 2.8, 3, 0.4);
    this.boxMat = std(0xffffff, { map: questionTexture(), emissive: 0xff9a1f, emissiveIntensity: 0.35, roughness: 0.35 });
    this.glowMat = new THREE.SpriteMaterial({ map: glowTexture('255,200,80'), transparent: true, depthWrite: false, opacity: 0.8 });
    this.mineGeo = new THREE.SphereGeometry(1.3, 14, 8);
    this.mineMat = std(0x2b2e38, { roughness: 0.4, metalness: 0.5 });
  }

  clear() {
    this.root.clear();
    this.cars.clear();
    this.boxes.length = this.mines.length = this.missiles.length = this.shocks.length = 0;
  }

  setup(game) {
    this.clear();
    this.track = game.track;
    for (const c of game.cars) {
      const truck = buildTruck(COLORS[c.color % 8].hex);
      this.root.add(truck.group);
      let blob = null;
      if (!this.shadows) {
        blob = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 5).rotateX(-Math.PI / 2), this.blobMat);
        this.root.add(blob);
      }
      this.cars.set(c.id, { truck, blob, bounce: Math.random() * 6 });
    }
    for (const b of game.items.boxes) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(this.boxGeo, this.boxMat);
      m.castShadow = true;
      const glow = new THREE.Sprite(this.glowMat);
      glow.scale.setScalar(7);
      g.add(m, glow);
      this.root.add(g);
      this.boxes.push({ g, m, y: game.track.elevAt(b.s) });
    }
  }

  update(game, time, dt) {
    const track = game.track;
    for (const c of game.cars) {
      const v = this.cars.get(c.id);
      if (!v) continue;
      const show = !c.hidden;
      const { truck } = v;
      truck.group.visible = show;
      if (v.blob) v.blob.visible = show && c.state !== 'falling';
      if (!show) continue;
      const el = c.near ? track.elevAt(c.near.s) : 0;
      const g = truck.group;
      v.bounce += dt * (4 + c.speed * 0.35);
      const bump = c.state === 'run' ? Math.sin(v.bounce) * 0.04 * Math.min(1, c.speed / 20) : 0;
      g.position.set(c.x, Math.max(-8, el + c.y + bump), c.z);
      g.rotation.set(0, -c.h + c.spin, 0, 'YXZ');
      if (c.state === 'stun') g.rotation.z = Math.sin(time * 16) * 0.25;
      else if (c.state === 'falling') { g.rotation.z = c.fall * 1.8; g.scale.setScalar(Math.max(0.25, 1 - c.fall * 0.45)); }
      else {
        g.scale.setScalar(1);
        // inclina nas curvas e "senta" ao acelerar
        g.rotation.x = c.steerSm * Math.min(1, c.speed / 24) * 0.07;
        g.rotation.z = c.boost > 0 ? 0.05 : 0;
      }
      truck.setSteer(c.steerSm);
      truck.spin((c.speed * dt) / 0.82);
      truck.flame.visible = c.boost > 0;
      if (c.boost > 0) truck.flame.scale.set(0.8 + Math.random() * 0.7, 1, 1);
      if (v.blob) {
        v.blob.position.set(c.x, el + 0.1, c.z);
        v.blob.rotation.y = -c.h;
        v.blob.scale.setScalar(Math.max(0.35, 1 - Math.max(0, c.y) * 0.06));
      }
    }
    // caixas de item
    game.items.boxes.forEach((b, i) => {
      const v = this.boxes[i];
      if (!v) return;
      v.g.visible = b.active;
      v.g.position.set(b.x, v.y + 3.2 + Math.sin(time * 2.4 + i) * 0.4, b.z);
      v.m.rotation.y = time * 1.5 + i;
      v.m.rotation.x = 0.25;
    });
    // minas
    sync(this.mines, game.items.mines, () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.mineGeo, this.mineMat);
      body.scale.y = 0.5;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      led.position.y = 0.85;
      body.castShadow = true;
      g.add(body, led);
      this.root.add(g);
      return g;
    }, (g, m) => {
      g.position.set(m.x, track.elevAt(track.nearest(m.x, m.z, -1, this._n || (this._n = track.newNear())).s) + 0.55, m.z);
      g.children[1].visible = Math.floor(time * 4) % 2 === 0;
    }, (g) => this.root.remove(g));
    // misseis
    sync(this.missiles, game.items.missiles, () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 3, 10).rotateZ(Math.PI / 2), std(0xf4f4f4, { roughness: 0.3 }));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 10).rotateZ(-Math.PI / 2), std(0xd61f2c));
      nose.position.x = 2;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 1.7), std(0xd61f2c));
      fin.position.x = -1.2;
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.8, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb020 }));
      fire.position.x = -2.5;
      g.add(body, nose, fin, fire);
      g.children.forEach((c) => (c.castShadow = true));
      this.root.add(g);
      return g;
    }, (g, m) => {
      g.position.set(m.x, (m.near ? track.elevAt(m.near.s) : 0) + 1.8, m.z);
      g.rotation.y = -m.h;
    }, (g) => this.root.remove(g));
    // ondas whomp
    sync(this.shocks, game.items.shocks, () => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      this.root.add(mesh);
      return mesh;
    }, (m, s) => {
      m.position.set(s.x, 0.6 + (track.elevAt(0) > 0.1 ? 0 : 0), s.z);
      m.scale.setScalar(Math.max(0.1, s.r));
      m.material.opacity = Math.max(0, 1 - s.r / 17) * 0.9;
    }, (m) => this.root.remove(m));
  }
}

function sync(views, data, create, update, remove) {
  while (views.length < data.length) views.push(create());
  while (views.length > data.length) remove(views.pop());
  for (let i = 0; i < data.length; i++) update(views[i], data[i]);
}
