// MIO EYE | 観測と回転の処理
// 操作: 1本指/マウスドラッグ = 一本の光る線
//       タッチパネル2本指 = 水星を回転
//       Macトラックパッド2本指スクロール = 水星を回転

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 1. 調整しやすい設定
const SETTINGS = {
  lineWidth: 2.3,           // 線の太さ
  lineGlow: 13,            // 発光のぼかし
  rotationSpeed: 0.006,    // 二本指ドラッグの回転速度
  trackpadSpeed: 0.006,    // トラックパッドのスクロール回転速度
};

// 2. 画面の取得
const screen = document.getElementById('screen');
const fx = document.getElementById('fx');
const ctx = fx.getContext('2d');
const status = document.getElementById('status');
const resetButton = document.getElementById('reset');
const discovery = document.getElementById('discovery');
const err = document.getElementById('err');

// 3. Three.js: 水星を表示
const scene = new THREE.Scene();
scene.background = new THREE.Color('#131a20');
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
camera.position.set(0, 0, 2.55);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
screen.prepend(renderer.domElement);

scene.add(new THREE.AmbientLight(0xc6e0f2, 1.35));
const sun = new THREE.DirectionalLight(0xffffff, 2.9);
sun.position.set(-3, 3, 5);
scene.add(sun);
const rimLight = new THREE.DirectionalLight(0x5bb5ff, 0.8);
rimLight.position.set(3, -1, -2);
scene.add(rimLight);
const globe = new THREE.Group();
scene.add(globe);

// 4. 観測時に浮かび上がる水星表面の光（元の表現を維持）
const MAX_POINTS = 64;
const points = Array.from({ length: MAX_POINTS }, () => new THREE.Vector3(99, 99, 99));
const uniforms = {
  uTime: { value: 0 },
  uReveal: { value: 0 },
  uPoints: { value: points },
  uCount: { value: 0 },
  uRadius: { value: 0.25 },
  uCompletion: { value: 0 },
};
const shader = new THREE.ShaderMaterial({
  uniforms,
transparent:true,depthWrite:false,side:THREE.FrontSide,vertexShader:`varying vec3 vP;varying vec3 vN;varying vec3 vW;void main(){vP=position;vN=normalize(normalMatrix*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`precision highp float;
uniform float uTime,uReveal,uCompletion,uRadius;
uniform vec3 uPoints[64];uniform int uCount;
varying vec3 vP,vN,vW;
void main(){
 vec3 p=normalize(vP);
 float reveal=0.;
 for(int i=0;i<64;i++){
   if(i>=uCount)break;
   float d=distance(p,uPoints[i]);
   reveal=max(reveal,1.-smoothstep(.09,.29,d));
 }
 reveal=max(reveal,uCompletion);
 vec3 q=p-vec3(0.,.18,0.);
 float r=max(length(q),.15);
 vec3 n=normalize(q);
 vec3 B=(3.*dot(n,vec3(0.,1.,0.))*n-vec3(0.,1.,0.))/(r*r*r);
 float strength=clamp((length(B)-.7)/3.2,0.,1.);
 vec3 cyan=vec3(.08,.64,.78), pale=vec3(.38,.91,1.0), amber=vec3(1.,.73,.42);
 vec3 c=mix(cyan,pale,smoothstep(.1,.65,strength));
 c=mix(c,amber,smoothstep(.73,1.,strength)*.52);
 float contours=pow(1.-abs(sin((strength*12.-uTime*.10)*3.14159)),25.);
 float shimmer=.5+.5*sin(uTime*1.4+p.x*14.+p.y*17.);
 float alpha=(.10+.16*strength+.10*contours+.045*shimmer)*reveal*uReveal;
 float rim=pow(1.-abs(dot(normalize(vN),normalize(-vW))),3.);
 gl_FragColor=vec4(c+vec3(.18,.27,.30)*contours+vec3(.13,.33,.4)*rim,clamp(alpha,0.,.45));
}` });
const observation = new THREE.Mesh(new THREE.SphereGeometry(1.012, 128, 96), shader);
globe.add(observation);
const hitSphere = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 48),
  new THREE.MeshBasicMaterial({ visible: false })
);
globe.add(hitSphere);

new GLTFLoader().load('./mercury.glb', (gltf) => {
  const model = gltf.scene;
  globe.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const scale = 2 / Math.max(size.x, size.y, size.z);
  model.position.copy(center).multiplyScalar(-scale);
  model.scale.setScalar(scale);
}, undefined, () => {
  err.textContent = '水星モデルが読み込めません。フォルダごとLive Serverで開いてください。';
});

// 5. 観測データ
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const activePointers = new Map();
const stamps = [];
const observedPoints = [];
const trail = [];
let lastActivity = performance.now();
let complete = false;
let previousCenter = null;
let currentStroke = 0;
let wasMultitouch = false;

const sphereSamples = [];
for (let i = 0; i < 420; i++) {
  const y = 1 - 2 * (i + 0.5) / 420;
  const r = Math.sqrt(1 - y * y);
  const phi = i * Math.PI * (3 - Math.sqrt(5));
  sphereSamples.push(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));
}

function pointerPosition(event) {
  const rect = screen.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return { x, y, nx: x / rect.width * 2 - 1, ny: 1 - y / rect.height * 2 };
}

function hitMercury(pos) {
  mouse.set(pos.nx, pos.ny);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(hitSphere);
  return hits.length ? globe.worldToLocal(hits[0].point.clone()).normalize() : null;
}

// 指で触れた位置に「観測点」と一本の線の点を追加
function observe(pos) {
  const point = hitMercury(pos);
  if (!point) return;
  lastActivity = performance.now();
  if (stamps.length === MAX_POINTS) stamps.shift();
  stamps.push(point);
  observedPoints.push(point.clone());
  uniforms.uCount.value = stamps.length;
  for (let i = 0; i < MAX_POINTS; i++) {
    points[i].copy(stamps[i] || new THREE.Vector3(99, 99, 99));
  }
  trail.push({ x: pos.x, y: pos.y, time: performance.now(), stroke: currentStroke });
  // 線はリセットまで保存する（時間や点数による自動削除なし）

  let count = 0;
  for (const sample of sphereSamples) {
    if (observedPoints.some((stamp) => sample.distanceToSquared(stamp) < 0.075)) count++;
  }
  if (count / sphereSamples.length > 0.48 && !complete) {
    complete = true;
    discovery.classList.add('show');
    // 結果表示は指を離したときに行う
  }
}

function centerOfPointers() {
  const positions = [...activePointers.values()];
  return {
    x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
    y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length,
  };
}

function rotateMercury(dx, dy, speed) {
  globe.rotation.y += dx * speed;
  globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x + dy * speed, -1.35, 1.35);
  lastActivity = performance.now();
}

// 6. タッチパネル: 1本指は描画 / 2本指は回転
screen.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  screen.setPointerCapture(event.pointerId);
  const pos = pointerPosition(event);
  activePointers.set(event.pointerId, pos);
  lastActivity = performance.now();

  if (activePointers.size === 1) {
    wasMultitouch = false;
    currentStroke++;
    observe(pos);
  } else {
    wasMultitouch = true;
    previousCenter = centerOfPointers();
    // 二本指になった瞬間に描画を止め、線の続きを接続しない
    currentStroke++;
  }
});

screen.addEventListener('pointermove', (event) => {
  if (!activePointers.has(event.pointerId)) return;
  event.preventDefault();
  const previous = activePointers.get(event.pointerId);
  const pos = pointerPosition(event);
  activePointers.set(event.pointerId, pos);

  if (activePointers.size >= 2) {
    const center = centerOfPointers();
    if (previousCenter) {
      rotateMercury(center.x - previousCenter.x, center.y - previousCenter.y, SETTINGS.rotationSpeed);
    }
    previousCenter = center;
    return;
  }

  if (wasMultitouch) return; // 二本指を離した直後の誤描画を防ぐ
  const distance = Math.hypot(pos.x - previous.x, pos.y - previous.y);
  if (distance < 1) return;
  const steps = Math.max(1, Math.ceil(distance / 12));
  for (let i = 1; i <= steps; i++) {
    const fraction = i / steps;
    observe({
      x: previous.x + (pos.x - previous.x) * fraction,
      y: previous.y + (pos.y - previous.y) * fraction,
      nx: previous.nx + (pos.nx - previous.nx) * fraction,
      ny: previous.ny + (pos.ny - previous.ny) * fraction,
    });
  }
});

function endPointer(event) {
  activePointers.delete(event.pointerId);

  if (activePointers.size < 2) {
    previousCenter = null;
  }

  if (activePointers.size === 0) {
    wasMultitouch = false;

    // タッチを離したら観測結果を表示
    if (stamps.length > 0) {
      status.textContent = '観測結果';
      resetButton.hidden = false;
    }
  }
}
screen.addEventListener('pointerup', endPointer);
screen.addEventListener('pointercancel', endPointer);
screen.addEventListener('lostpointercapture', endPointer);

// 7. Macトラックパッド: 二本指スクロールを回転として使う
// トラックパッドのスクロールはPointerEventではなくWheelEventとして届く。
screen.addEventListener('wheel', (event) => {
  event.preventDefault();
  // Ctrl/⌘ + ホイール（ピンチズーム）は回転として扱わない
  if (event.ctrlKey || event.metaKey) return;
  const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? screen.clientWidth : 1;
  rotateMercury(event.deltaX * factor, event.deltaY * factor, SETTINGS.trackpadSpeed);
}, { passive: false });

// 8. リセットと展示モード
function reset() {
  stamps.length = 0;
  observedPoints.length = 0;
  trail.length = 0;
  // 捕捉中のポインターを解除し、リセット直後の誤描画を防ぐ
  for (const pointerId of activePointers.keys()) {
    if (screen.hasPointerCapture(pointerId)) screen.releasePointerCapture(pointerId);
  }
  activePointers.clear();
  currentStroke++;
  previousCenter = null;
  wasMultitouch = false;
  complete = false;
  uniforms.uCount.value = 0;
  uniforms.uReveal.value = 0;
  uniforms.uCompletion.value = 0;
  // シェーダー側の観測点も初期化
  for (const point of points) point.set(99, 99, 99);
  // 描画用キャンバスを即時クリア（次フレームも trail は空）
  ctx.clearRect(0, 0, fx.width, fx.height);
  globe.rotation.set(0, 0, 0);
  discovery.classList.remove('show');
  status.textContent = '触って観察しよう';
  resetButton.hidden = true;
  lastActivity = performance.now();
}
function toggleKiosk() { document.body.classList.toggle('kiosk'); }
// ボタンのタッチが背後の観測画面に伝わらないようにする
resetButton.addEventListener('pointerdown', (event) => event.stopPropagation());
resetButton.addEventListener('pointermove', (event) => event.stopPropagation());
resetButton.addEventListener('pointerup', (event) => event.stopPropagation());
resetButton.addEventListener('click', (event) => {
  event.stopPropagation();
  reset();
});
document.getElementById('kiosk').addEventListener('click', toggleKiosk);
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'r' || event.key === 'Escape') reset();
  if (event.key.toLowerCase() === 'k') toggleKiosk();
});

// 9. 画面サイズ
function resize() {
  const size = screen.clientWidth;
  const pixelRatio = Math.min(devicePixelRatio, 2);
  renderer.setSize(size, size, false);
  fx.width = Math.round(size * pixelRatio);
  fx.height = Math.round(size * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// 10. 一本の線だけを描画。枝線・横の短い線・粒子は一切生成しない。
function drawSingleLine(now) {
  ctx.clearRect(0, 0, screen.clientWidth, screen.clientHeight);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowBlur = SETTINGS.lineGlow;
  ctx.shadowColor = '#48e4ff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    // 異なるストロークを結ばない（離れた場所に横線が飛ばない）
    if (a.stroke !== b.stroke || b.time - a.time > 120) continue;
    ctx.strokeStyle = 'rgba(158,242,255,0.85)';
    ctx.lineWidth = SETTINGS.lineWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

// 11. アニメーション
function animate(now) {
  requestAnimationFrame(animate);
  uniforms.uTime.value = now / 1000;
  uniforms.uReveal.value += ((stamps.length ? 1 : 0) - uniforms.uReveal.value) * 0.045;
  uniforms.uCompletion.value += ((complete ? 1 : 0) - uniforms.uCompletion.value) * 0.018;
  drawSingleLine(now);
  // 描いている間は観測中、離したら観測結果。完了演出後も同じ表示。
  if (activePointers.size === 1 && !wasMultitouch) {
    status.textContent = '観測中';
    resetButton.hidden = true;
  } else if (activePointers.size === 0) {
    const hasResult = stamps.length > 0;
    status.textContent = hasResult ? '観測結果' : '触って観察しよう';
    resetButton.hidden = !hasResult;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
