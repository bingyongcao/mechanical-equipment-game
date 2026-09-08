import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Machine, jointNames } from "./machine";
import type { Simulation } from "./physics";
import { showroom, buildSite, disposeGroup } from "./environment";
import { markup, icon, description } from "./ui";
import { clamp } from "./logic.mjs";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = markup();
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const viewport = $("#viewport"),
  scene = new THREE.Scene();
const compactMission = document.createElement("button");
compactMission.id = "compact-mission";
compactMission.className = "compact-mission";
compactMission.hidden = true;
compactMission.addEventListener("click", () => showDialog("#help-dialog"));
$(".stage").append(compactMission);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
viewport.prepend(renderer.domElement);
renderer.domElement.setAttribute("aria-label", "可旋转和缩放的挖掘机三维模型");
renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  pause(true);
  toast("画面暂时中断，请刷新页面重新加载。", 15000);
});
const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 230);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.075;
orbit.minDistance = 7;
orbit.maxDistance = 55;
orbit.maxPolarAngle = Math.PI * 0.475;
const hemi = new THREE.HemisphereLight("#f6f9ed", "#819184", 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff0d4", 2.1);
sun.position.set(6, 16, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.camera.far = 80;
sun.shadow.normalBias = 0.025;
scene.add(sun);
const env = new RoomEnvironment(),
  pmrem = new THREE.PMREMGenerator(renderer),
  envMap = pmrem.fromScene(env, 0.04);
scene.environment = envMap.texture;
env.dispose();
pmrem.dispose();
const machine = new Machine();
scene.add(machine.root);
let environment = showroom();
scene.add(environment);
scene.background = new THREE.Color("#e9e6de");
scene.fog = new THREE.Fog("#e9e6de", 45, 140);
let sim: Simulation | null = null,
  mode: "showroom" | "site" = "showroom",
  variant = 0,
  ready = false,
  busy = false,
  isPaused = false,
  labelsOn = true;
let accumulator = 0,
  last = performance.now(),
  toastTimer = 0,
  successTimer = 0;
const held = new Map<string, { action: string; sign: number }>(),
  inputs = new Map<string, number>();
let soundEnabled = false;
try {
  soundEnabled = localStorage.getItem("builders-sound") === "true";
} catch {}
let audio: AudioContext | undefined;
function tone(freq: number, duration = 0.1, volume = 0.02) {
  if (!soundEnabled) return;
  audio ??= new AudioContext();
  void audio.resume();
  const o = audio.createOscillator(),
    g = audio.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(volume, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  o.connect(g).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + duration);
}
function toast(message: string, time = 2600) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => $("#toast").classList.remove("visible"),
    time,
  );
}
function clearInput() {
  held.clear();
  inputs.clear();
  document
    .querySelectorAll(".pressed")
    .forEach((o) => o.classList.remove("pressed"));
}
function dialogOpen() {
  return Boolean(document.querySelector("dialog[open]"));
}
function showDialog(id: string) {
  clearInput();
  $(id) as HTMLDialogElement;
  $(id).hidden = false;
  ($(id) as HTMLDialogElement).showModal();
}
document
  .querySelectorAll("[data-close]")
  .forEach((b) =>
    b.addEventListener("click", () => b.closest("dialog")!.close()),
  );
document.querySelectorAll("dialog").forEach((d) => {
  d.addEventListener("close", () => {
    clearInput();
    last = performance.now();
    accumulator = 0;
  });
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      const p = e as MouseEvent;
      if (
        p.clientX < r.left ||
        p.clientX > r.right ||
        p.clientY < r.top ||
        p.clientY > r.bottom
      )
        d.close();
    }
  });
});
function focus(overhead = false) {
  const p =
    mode === "site"
      ? machine.root.position.clone()
      : new THREE.Vector3(1.4, 0, 0);
  if (overhead && mode === "site") {
    orbit.target.set(0, 0, 0);
    camera.position.set(24, 28, 30);
  } else {
    orbit.target
      .copy(p)
      .add(new THREE.Vector3(mode === "site" ? 2.2 : 0, 1.7, 0));
    camera.position
      .copy(orbit.target)
      .add(
        mode === "site"
          ? new THREE.Vector3(12, 11, 15)
          : new THREE.Vector3(10, 6.8, 12),
      );
  }
  orbit.update();
}
function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
function selectPart(label: string) {
  machine.highlight(label);
  const d = description[label];
  if (!d) return;
  $("#part-title").textContent = d.title;
  $("#part-text").textContent = d.text;
  $("#part-note").hidden = false;
  document
    .querySelectorAll(".part-label")
    .forEach((b) =>
      b.classList.toggle("selected", (b as HTMLElement).dataset.part === label),
    );
}
const labels: { node: THREE.Object3D; button: HTMLButtonElement }[] = [];
function createLabels() {
  for (const a of machine.annotationNodes) {
    const button = document.createElement("button");
    button.className = "part-label";
    button.textContent = a.text;
    button.dataset.part = a.text;
    button.ariaLabel = "认识" + a.text;
    button.addEventListener("click", () => selectPart(a.text));
    $("#labels").append(button);
    labels.push({ node: a.node, button });
  }
}
function updateLabels() {
  const w = viewport.clientWidth,
    h = viewport.clientHeight,
    projected: { x: number; y: number; button: HTMLButtonElement }[] = [];
  for (const { node, button } of labels) {
    const p = node.getWorldPosition(new THREE.Vector3()).project(camera);
    const visible = labelsOn && p.z < 1 && p.z > -1;
    button.hidden = !visible;
    if (visible)
      projected.push({
        x: clamp((p.x * 0.5 + 0.5) * w, 43, w - 43),
        y: clamp((-p.y * 0.5 + 0.5) * h, 190, h - 210),
        button,
      });
  }
  projected.sort((a, b) => a.y - b.y);
  for (let i = 0; i < projected.length; i++) {
    const p = projected[i];
    for (let j = 0; j < i; j++) {
      const other = projected[j];
      if (Math.abs(p.x - other.x) < 90 && Math.abs(p.y - other.y) < 33)
        p.y = other.y + 33;
    }
    p.button.style.left = p.x + "px";
    p.button.style.top = p.y + "px";
  }
  if (sim && mode === "site") {
    const p = new THREE.Vector3(
      sim.tracker.target.x,
      0.55,
      sim.tracker.target.z,
    ).project(camera);
    $("#target-label").hidden = p.z > 1;
    $("#target-label").style.left = (p.x * 0.5 + 0.5) * w + "px";
    $("#target-label").style.top = (-p.y * 0.5 + 0.5) * h + "px";
  } else $("#target-label").hidden = true;
}
function updateModeUI() {
  document.body.dataset.mode = mode;
  $("#garage-panel").hidden = mode === "site";
  $("#mission-panel").hidden = mode !== "site";
  $("#side-title").textContent =
    mode === "site" ? "开工啦，小工程师！" : "今天，开哪一台？";
  $("#side-intro").textContent =
    mode === "site"
      ? "慢慢试，每一次尝试都算进步。"
      : "每一台机械，都有自己的超能力。";
  $("#stage-title").textContent =
    mode === "site"
      ? variant
        ? "工地材料整理"
        : "城市建筑工地"
      : "认识你的大力士";
  $("#stage-subtitle").textContent =
    mode === "site"
      ? "把石头搬到绿色圆圈里，让工地焕然一新。"
      : "转一转，看一看。每个零件都有自己的故事。";
  $("#stage-eyebrow").textContent =
    mode === "site"
      ? "A LITTLE JOB. A BIG ACHIEVEMENT."
      : "MEET YOUR EXCAVATOR";
  $("#view-badge").innerHTML =
    icon("cube", 15) + (mode === "site" ? "施工现场" : "机械展厅");
  $("#step1").classList.toggle("active", mode === "showroom");
  $("#step2").classList.toggle("active", mode === "site");
  $("#start").innerHTML =
    mode === "site"
      ? "返回机械展厅 " + icon("arrow", 18)
      : "去工地试一试 " + icon("arrow", 18);
  $("#start-caption").textContent =
    mode === "site" ? "换个角度，继续认识机械。" : "准备好大显身手了吗？";
  $("#start-footnote").textContent =
    mode === "site" ? "返回展厅会结束当前任务。" : "一个小任务，一份大成就。";
  $("#drive-hint").textContent =
    mode === "site" ? "左右履带配合，慢慢转弯。" : "进入工地后，就能开动履带。";
  $("#reset-machine").innerHTML =
    icon("rotate", 15) + (mode === "site" ? "重新开始" : "机械复位");
  $("#overview").hidden = mode !== "site";
  document
    .querySelectorAll<HTMLButtonElement>(
      '[data-action="drive"],[data-action="steer"]',
    )
    .forEach((b) => (b.disabled = mode !== "site"));
  $("#toggle-labels").classList.toggle("active", labelsOn);
  $("#toggle-labels").setAttribute("aria-pressed", String(labelsOn));
  $("#mission-name").textContent = variant
    ? "工地材料整理"
    : "城市工地 · 石头搬运";
  $("#required").textContent = String(variant ? 12 : 8);
  compactMission.hidden = mode !== "site";
  compactMission.textContent =
    "已送达 " +
    (sim?.tracker.count || 0) +
    " / " +
    (variant ? 12 : 8) +
    " 块石头 · 查看任务提示";
}
async function enterSite(index: number) {
  if (!ready || busy) return;
  busy = true;
  clearInput();
  clearTimeout(successTimer);
  $("#loading").hidden = false;
  $("#loading-message").textContent = "正在准备你的施工现场…";
  try {
    sim?.dispose();
    sim = null;
    disposeGroup(environment);
    variant = index;
    mode = "site";
    machine.reset(true);
    machine.highlight("");
    const site = buildSite(index);
    environment = site.group;
    scene.add(environment);
    const { Simulation } = await import("./physics");
    sim = new Simulation(machine, site.target, index ? 12 : 8);
    await sim.init(index);
    scene.add(sim.group);
    for (let i = 0; i < 150; i++) sim.step();
    sim.render(1);
    labelsOn = false;
    $("#part-note").hidden = true;
    isPaused = false;
    $("#pause").innerHTML = icon("pause", 17);
    scene.background = new THREE.Color("#d8e4de");
    scene.fog = new THREE.Fog("#d8e4de", 48, 135);
    $("#delivered").textContent = "0";
    $("#progress-fill").style.width = "0%";
    updateModeUI();
    orbit.target.set(-0.5, 0.5, 0);
    camera.position.set(17, 19, 23);
    orbit.update();
    toast("欢迎来到工地！先试着前进，靠近石堆。", 4500);
  } catch (e) {
    console.error(e);
    toast("场景加载失败，请重试。", 8000);
    returnShowroom();
  } finally {
    busy = false;
    $("#loading").hidden = true;
    accumulator = 0;
    last = performance.now();
  }
}
function returnShowroom() {
  clearInput();
  clearTimeout(successTimer);
  sim?.dispose();
  sim = null;
  disposeGroup(environment);
  environment = showroom();
  scene.add(environment);
  mode = "showroom";
  machine.reset(false);
  machine.highlight("");
  labelsOn = true;
  isPaused = false;
  $("#pause").innerHTML = icon("pause", 17);
  scene.background = new THREE.Color("#e9e6de");
  scene.fog = new THREE.Fog("#e9e6de", 45, 140);
  updateModeUI();
  focus();
  selectPart("动臂");
  accumulator = 0;
}
function pause(value = !isPaused) {
  isPaused = value;
  clearInput();
  $("#pause").innerHTML = icon(isPaused ? "play" : "pause", 17);
  $("#pause").setAttribute("aria-label", isPaused ? "继续游戏" : "暂停游戏");
  toast(isPaused ? "已暂停。再点一下，继续探索。" : "继续探索吧。");
  accumulator = 0;
  last = performance.now();
}
$("#start").addEventListener("click", () => {
  if (mode === "showroom") showDialog("#scene-dialog");
  else returnShowroom();
});
$("#change-scene").addEventListener("click", () => showDialog("#scene-dialog"));
document.querySelectorAll<HTMLButtonElement>("[data-scene]").forEach((b) =>
  b.addEventListener("click", () => {
    $<HTMLDialogElement>("#scene-dialog").close();
    void enterSite(Number(b.dataset.scene));
  }),
);
$("#help").addEventListener("click", () => showDialog("#help-dialog"));
$("#choose-excavator").addEventListener("click", () => {
  if (ready) {
    machine.reset(false);
    focus();
  }
});
$("#focus").addEventListener("click", () => focus());
$("#overview").addEventListener("click", () => focus(true));
$("#toggle-labels").addEventListener("click", () => {
  labelsOn = !labelsOn;
  updateModeUI();
});
$("#dismiss-note").addEventListener(
  "click",
  () => ($("#part-note").hidden = true),
);
$("#pause").addEventListener("click", () => pause());
$("#reset-machine").addEventListener("click", () => {
  if (!ready || busy) return;
  if (mode === "site") {
    void enterSite(variant);
    toast("机械与石堆已重新准备好。");
  } else {
    machine.reset();
    focus();
    toast("机械回到了初始姿态。");
  }
});
$("#sound").setAttribute("aria-label", soundEnabled ? "关闭声音" : "开启声音");
$("#sound").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  try {
    localStorage.setItem("builders-sound", String(soundEnabled));
  } catch {}
  $("#sound").setAttribute(
    "aria-label",
    soundEnabled ? "关闭声音" : "开启声音",
  );
  $("#sound").title = soundEnabled ? "关闭声音" : "开启声音";
  toast(soundEnabled ? "声音已开启" : "声音已关闭");
  tone(440);
});
$("#keep-playing").addEventListener("click", () =>
  $<HTMLDialogElement>("#success-dialog").close(),
);
$("#another-scene").addEventListener("click", () => {
  $<HTMLDialogElement>("#success-dialog").close();
  showDialog("#scene-dialog");
});
const bindings: Record<string, [string, number]> = {
  KeyW: ["drive", 1],
  KeyS: ["drive", -1],
  KeyA: ["steer", 1],
  KeyD: ["steer", -1],
  KeyQ: ["joint0", 1],
  KeyE: ["joint0", -1],
  KeyR: ["joint1", -1],
  KeyF: ["joint1", 1],
  KeyT: ["joint2", -1],
  KeyG: ["joint2", 1],
  KeyY: ["joint3", -1],
  KeyH: ["joint3", 1],
};
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (!dialogOpen()) pause();
    return;
  }
  const b = bindings[e.code];
  if (
    !b ||
    !ready ||
    busy ||
    dialogOpen() ||
    isPaused ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey
  )
    return;
  e.preventDefault();
  if (mode === "showroom" && ["drive", "steer"].includes(b[0])) return;
  held.set(e.code, { action: b[0], sign: b[1] });
});
window.addEventListener("keyup", (e) => held.delete(e.code));
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  clearInput();
  accumulator = 0;
  last = performance.now();
});
document
  .querySelectorAll<HTMLButtonElement>("[data-action]")
  .forEach((button) => {
    button.addEventListener("pointerdown", (e) => {
      if (!ready || busy || isPaused || dialogOpen() || button.disabled) return;
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      held.set("pointer" + e.pointerId, {
        action: button.dataset.action!,
        sign: Number(button.dataset.sign),
      });
      tone(155, 0.045, 0.005);
    });
    button.addEventListener("pointermove", (e) => {
      const r = button.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        held.delete("pointer" + e.pointerId);
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(event, (e) => {
        held.delete("pointer" + (e as PointerEvent).pointerId);
      });
  });
const raycaster = new THREE.Raycaster();
let down = new THREE.Vector2();
renderer.domElement.addEventListener("pointerdown", (e) =>
  down.set(e.clientX, e.clientY),
);
renderer.domElement.addEventListener("pointerup", (e) => {
  if (
    !ready ||
    mode === "site" ||
    Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5
  )
    return;
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(
    new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    ),
    camera,
  );
  const hit = raycaster.intersectObject(machine.model, true)[0];
  if (hit) {
    let o: THREE.Object3D | null = hit.object;
    while (o) {
      const label = o.userData.part_label;
      if (label && description[label]) {
        selectPart(label);
        break;
      }
      if (o.name === "J_Base") {
        selectPart("履带");
        break;
      }
      o = o.parent;
    }
  }
});
type Burst = { points: THREE.Points; vel: Float32Array; life: number };
const bursts: Burst[] = [];
function fireworks() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let b = 0; b < 5; b++) {
    const count = 75,
      positions = new Float32Array(count * 3),
      vel = new Float32Array(count * 3),
      colors = new Float32Array(count * 3);
    const center = new THREE.Vector3(
      (sim?.tracker.target.x || 0) + (Math.random() - 0.5) * 7,
      5 + Math.random() * 4,
      (sim?.tracker.target.z || 0) + (Math.random() - 0.5) * 6,
    );
    for (let i = 0; i < count; i++) {
      positions.set(center.toArray(), i * 3);
      const d = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(2 + Math.random() * 3);
      vel.set(d.toArray(), i * 3);
      const c = new THREE.Color().setHSL(
        (b * 0.18 + Math.random() * 0.06) % 1,
        0.85,
        0.65,
      );
      colors.set(c.toArray(), i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.17,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.NormalBlending,
      }),
    );
    scene.add(points);
    bursts.push({ points, vel, life: 3 });
  }
}
function updateFireworks(dt: number) {
  for (let b = bursts.length - 1; b >= 0; b--) {
    const f = bursts[b];
    f.life -= dt;
    const p = f.points.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      f.vel[i * 3 + 1] -= 2.2 * dt;
      p.setXYZ(
        i,
        p.getX(i) + f.vel[i * 3] * dt,
        p.getY(i) + f.vel[i * 3 + 1] * dt,
        p.getZ(i) + f.vel[i * 3 + 2] * dt,
      );
    }
    p.needsUpdate = true;
    (f.points.material as THREE.PointsMaterial).opacity = Math.max(
      0,
      f.life / 3,
    );
    if (f.life <= 0) {
      f.points.removeFromParent();
      f.points.geometry.dispose();
      (f.points.material as THREE.Material).dispose();
      bursts.splice(b, 1);
    }
  }
}
let lastCount = 0,
  lastBlocked = 0;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.08);
  last = now;
  requestAnimationFrame(frame);
  inputs.clear();
  for (const v of held.values())
    inputs.set(v.action, clamp((inputs.get(v.action) || 0) + v.sign, -1, 1));
  document
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((b) =>
      b.classList.toggle(
        "pressed",
        (inputs.get(b.dataset.action!) || 0) === Number(b.dataset.sign),
      ),
    );
  if (ready && !busy && !isPaused && !dialogOpen() && !document.hidden) {
    accumulator += dt;
    while (accumulator >= 1 / 120) {
      machine.step(inputs, 1 / 120, mode === "site");
      if (
        (machine.blockedReason === "wall" ||
          machine.blockedReason === "office") &&
        inputs.size &&
        now - lastBlocked > 2500
      ) {
        toast(
          machine.blockedReason === "wall"
            ? "已经到围墙边了，换个方向试试。"
            : "前面是工棚，绕开它试试。",
        );
        lastBlocked = now;
      }
      if (sim) {
        const result = sim.step();
        if (result.count !== lastCount) {
          lastCount = result.count;
          $("#delivered").textContent = String(result.count);
          $("#progress-fill").style.width =
            Math.min(100, (result.count / sim.tracker.required) * 100) + "%";
          compactMission.textContent =
            "已送达 " +
            result.count +
            " / " +
            sim.tracker.required +
            " 块石头 · 查看任务提示";
          if (result.count > 0) tone(520, 0.12, 0.012);
        }
        if (result.justCompleted) {
          fireworks();
          tone(523, 0.25);
          setTimeout(() => tone(659, 0.25), 160);
          setTimeout(() => tone(784, 0.5), 320);
          $("#success-count").textContent = String(result.count);
          successTimer = window.setTimeout(() => {
            clearInput();
            showDialog("#success-dialog");
          }, 1800);
        }
      }
      accumulator -= 1 / 120;
    }
    sim?.render(accumulator / (1 / 120));
  } else accumulator = 0;
  if (ready) {
    jointNames.forEach(
      (_, i) =>
        ($("#angle" + i).textContent =
          Math.round(THREE.MathUtils.radToDeg(machine.angles[i])) + "°"),
    );
    updateLabels();
  }
  updateFireworks(dt);
  orbit.update();
  renderer.render(scene, camera);
}
async function boot() {
  try {
    await machine.load();
    ready = true;
    machine.reset();
    createLabels();
    focus();
    updateModeUI();
    selectPart("动臂");
    $("#loading").hidden = true;
    $<HTMLButtonElement>("#start").disabled = false;
    $("#render-status").textContent = "鼠标与键盘，都可以探索";
  } catch (e) {
    console.error(e);
    $("#loading-message").textContent = "模型暂时没有加载成功";
    $("#loading small").textContent =
      "请刷新页面重试，或检查本地服务是否运行。";
    $("#loading .loader").hidden = true;
  }
}
focus();
resize();
requestAnimationFrame(frame);
void boot();
// Development-only inspection surface for browser smoke and physical regression tests.
if (import.meta.env.DEV)
  (window as any).__builders = {
    get ready() {
      return ready;
    },
    get mode() {
      return mode;
    },
    get machine() {
      return machine;
    },
    get sim() {
      return sim;
    },
    get paused() {
      return isPaused;
    },
    enterSite,
    returnShowroom,
    pause,
    get burstCount() {
      return bursts.length;
    },
    get held() {
      return held.size;
    },
  };
