import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GamepadInput } from "./gamepad";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Machine, jointNames } from "./machine";
import { CraneMachine } from "./crane-machine";
import { TowerMachine, materialNames } from "./tower-machine";
import type { TowerMission } from "./tower-site";
import type { Simulation } from "./physics";
import { showroom, buildSite, disposeGroup } from "./environment";
import { markup, icon, description } from "./ui";
import { clamp } from "./logic.mjs";
import { playEntry, playExit } from "./transition";
import type { CraneMission } from "./crane-site";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = markup();
const sandCard = document.querySelector('[data-scene="1"]')!;
sandCard.querySelector("h3")!.textContent = "砂料厂 · 装车";
sandCard.querySelector("p")!.textContent =
  "挖掘沙层，卸入墙外卡车，装载至 80%。";
sandCard.querySelector(".tag")!.textContent = "第二站 · 沙子装车";
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
const craneMachine = new CraneMachine();
const towerMachine = new TowerMachine();
scene.add(machine.root, craneMachine.root, towerMachine.root);
towerMachine.root.visible = false;
craneMachine.root.visible = false;
let environment = showroom();
scene.add(environment);
scene.background = new THREE.Color("#e9e6de");
scene.fog = new THREE.Fog("#e9e6de", 45, 140);
let sim: Simulation | null = null,
  craneMission: CraneMission | null = null,
  towerMission: TowerMission | null = null,
  mode: "showroom" | "site" = "showroom",
  selectedMachine: "excavator" | "crane" | "tower" = "excavator",
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
const gamepad = new GamepadInput();
let windowFocused = document.hasFocus();
const gamepadHelp = document.createElement("section");
gamepadHelp.className = "control-card gamepad-help";
gamepadHelp.innerHTML =
  '<strong>手柄控制</strong><p id="gamepad-status" role="status"></p><p id="gamepad-bindings"></p>';
$(".controls-scroll").prepend(gamepadHelp);
let connectedGamepad = false;
let nintendoGamepad = false;
const keyboardHints = new Map<HTMLElement, string>();
document
  .querySelectorAll<HTMLElement>("[data-action] kbd")
  .forEach((k) => keyboardHints.set(k, k.textContent || ""));
const mouseCameraHint = $(".camera-hint").innerHTML;
const keyboardHelpIntro = $("#help-dialog > p").textContent!;
const gamepadGuide = document.createElement("p");
gamepadGuide.id = "gamepad-guide";
$("#help-dialog .help-grid").before(gamepadGuide);
const menuButton = document.createElement("button");
menuButton.id = "game-menu";
menuButton.className = "tool-button";
menuButton.textContent = "菜单";
$(".top-actions").prepend(menuButton);
const gameMenu = document.createElement("dialog");
gameMenu.id = "game-menu-dialog";
gameMenu.innerHTML = `<h2>游戏菜单</h2><p class="muted">切换场景、返回展厅或重新开始会重置本次任务。</p><div class="game-menu-actions">
<button class="primary-button" data-menu="resume">继续游戏</button>
<button data-menu="scenes">选择 / 切换场景</button>
<button data-menu="exit">退出场景 · 返回机械展厅</button>
<button data-menu="reset">重新开始 / 机械复位</button>
<button data-menu="overview">默认视角</button>
<button data-menu="stock">塔吊料场视角</button>
<button data-menu="roof">塔吊楼顶视角</button>
<button data-menu="cargo">吊物放回原位</button>
<button data-menu="help">操作指南</button>
<button data-menu="sound">切换声音</button></div>`;
document.body.append(gameMenu);
let menuWasPaused = false;
menuButton.addEventListener("click", openGameMenu);
gameMenu.addEventListener("close", () => pause(menuWasPaused));
gameMenu
  .querySelectorAll<HTMLButtonElement>("[data-menu]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      gameMenu.close();
      // Restore immediately before an action; close event runs asynchronously.
      pause(menuWasPaused);
      const action = button.dataset.menu;
      if (action === "scenes") {
        prepareSceneDialog();
        showDialog("#scene-dialog");
      }
      if (action === "exit") returnShowroom();
      if (action === "reset") $("#reset-machine").click();
      if (action === "overview") focus();
      if (action === "stock" || action === "roof") focusTowerView(action);
      if (action === "cargo") $("#return-cargo").click();
      if (action === "help") showDialog("#help-dialog");
      if (action === "sound") $("#sound").click();
    });
  });
window.addEventListener("focus", () => {
  windowFocused = true;
});
window.addEventListener("blur", () => {
  windowFocused = false;
  gamepad.suspend();
});
window.addEventListener("gamepaddisconnected", () => clearInput());
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
  gamepad.suspend();
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
  if (connectedGamepad) focusGamepadOption($(id), 0, true);
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
  orbit.maxDistance = selectedMachine === "tower" ? 170 : 55;
  if (selectedMachine === "tower") {
    const site = mode === "site";
    orbit.target.set(site ? 6 : 4, site ? 12 : 16, 0);
    const aspect = Math.max(0.4, camera.aspect);
    const distance = site ? (overhead ? 110 : 78) : Math.max(65, 42 / aspect);
    camera.position
      .copy(orbit.target)
      .add(
        new THREE.Vector3(overhead ? 0.1 : 0.7, overhead ? 1.2 : 0.48, 1)
          .normalize()
          .multiplyScalar(distance),
      );
    orbit.update();
    return;
  }
  if (mode === "site" && variant === 2) {
    orbit.target.set(0.8, 2.1, 0.8);
    camera.position.set(
      overhead ? 1 : 19,
      overhead ? 30 : 15,
      overhead ? 22 : -21,
    );
    orbit.update();
    return;
  }
  if (mode === "showroom" && selectedMachine === "crane") {
    orbit.target.set(0.8, 2.6, 0);
    camera.position.set(14, 10, 16);
    orbit.update();
    return;
  }
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
function activeDisplayMachine() {
  return selectedMachine === "tower"
    ? towerMachine
    : selectedMachine === "crane"
      ? craneMachine
      : machine;
}
function selectPart(label: string) {
  activeDisplayMachine().highlight(label);
  document
    .querySelectorAll(".part-label")
    .forEach((b) =>
      b.classList.toggle("selected", (b as HTMLElement).dataset.part === label),
    );
}
const labels: { node: THREE.Object3D; button: HTMLButtonElement }[] = [];
function createLabels() {
  const source = activeDisplayMachine();
  labels.splice(0).forEach(({ button }) => button.remove());
  $("#labels").replaceChildren();
  for (const a of source.annotationNodes) {
    const button = document.createElement("button");
    button.className = "part-label";
    button.dataset.part = a.text;
    const copy = description[a.text];
    button.ariaLabel = copy ? `${copy.title}：${copy.text}` : `认识${a.text}`;
    const tooltip = document.createElement("span");
    tooltip.className = "part-tooltip";
    const title = document.createElement("strong");
    title.textContent = copy?.title || a.text;
    const text = document.createElement("span");
    text.textContent = copy?.text || "";
    tooltip.append(title, text);
    button.append(tooltip);
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
        x: clamp((p.x * 0.5 + 0.5) * w, 18, w - 18),
        y: clamp((-p.y * 0.5 + 0.5) * h, 18, h - 18),
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
    p.button.classList.toggle("align-right", p.x > w * 0.65);
  }
  const activeTarget =
    sim?.tracker.target || craneMission?.target || towerMission?.target;
  if (activeTarget && mode === "site") {
    const p = new THREE.Vector3(
      activeTarget.x,
      towerMission ? towerMission.roofY + 1 : variant === 1 ? 3.5 : 0.55,
      activeTarget.z,
    ).project(camera);
    $("#target-label").hidden = p.z > 1 || !!towerMission?.completed;
    $("#target-label").style.left = (p.x * 0.5 + 0.5) * w + "px";
    $("#target-label").style.top = (-p.y * 0.5 + 0.5) * h + "px";
  } else $("#target-label").hidden = true;
}
function updateModeUI() {
  const crane = mode === "site" ? variant === 2 : selectedMachine === "crane";
  const tower = selectedMachine === "tower";
  document.body.dataset.machine = selectedMachine;
  $<HTMLSelectElement>("#machine-select").value = selectedMachine;
  $("#mobile-machine-picker").hidden = mode !== "showroom";
  $("#tower-task").hidden = !tower || mode !== "site";
  $("#tower-views").hidden = !tower || mode !== "site";
  renderer.domElement.setAttribute(
    "aria-label",
    crane
      ? "可旋转和缩放的汽车起重机河岸作业场景"
      : "可旋转和缩放的挖掘机三维模型",
  );
  document.body.dataset.mode = mode;
  $("#choose-excavator").classList.toggle(
    "selected",
    selectedMachine === "excavator",
  );
  $("#choose-crane").classList.toggle("selected", selectedMachine === "crane");
  $("#choose-tower").classList.toggle("selected", tower);
  $("#choose-excavator").setAttribute(
    "aria-pressed",
    String(selectedMachine === "excavator"),
  );
  $("#choose-crane").setAttribute(
    "aria-pressed",
    String(selectedMachine === "crane"),
  );
  $("#choose-tower").setAttribute("aria-pressed", String(tower));
  $("#start").innerHTML =
    `确认${tower ? "塔吊" : crane ? "起重机" : "挖掘机"} · 选择场景 ${icon("arrow", 18)}`;
  $("#garage-panel").hidden = mode === "site";
  $("#mission-panel").hidden = mode !== "site";
  $("#side-title").hidden = mode === "site";
  $("#step1").classList.toggle("active", mode === "showroom");
  $("#step2").classList.toggle("active", mode === "site");
  $("#start").hidden = mode === "site";
  $("#drive-hint").textContent = crane
    ? "支腿已经固定，车辆不可移动。"
    : mode === "site"
      ? "左右履带配合，慢慢转弯。"
      : "进入工地后，就能开动履带。";
  $("#reset-machine").innerHTML =
    icon("rotate", 15) + (mode === "site" ? "重新开始" : "机械复位");
  $("#overview").hidden = mode !== "site";
  document
    .querySelectorAll<HTMLButtonElement>(
      '[data-action="drive"],[data-action="steer"]',
    )
    .forEach((b) => (b.disabled = mode !== "site" || crane || tower));
  $("#mission-name").textContent = crane
    ? "河岸 · 物资吊运"
    : variant
      ? "砂料厂 · 装车"
      : "城市工地";
  $("#required").textContent = crane ? "5" : variant ? "80%" : "8";
  $(".progress-caption > span").textContent = crane
    ? "物资搬运进度"
    : variant
      ? "车厢装载率"
      : "搬运进度";
  document
    .querySelectorAll(".mission-steps b")
    .forEach(
      (o, i) =>
        (o.textContent = (
          crane
            ? ["对准并抓取箱子", "平稳回转到岸边", "低位释放到绿框"]
            : variant
              ? ["挖沙并收斗", "抬臂越过围墙", "卸入车厢至 80%"]
              : ["装载石头", "移动到绿圈", "卸下并停稳"]
        )[i]),
    );
  $("#success-count + span").textContent = crane
    ? "箱物资成功上岸"
    : variant
      ? "车厢装载率"
      : "块石头成功送达";
  $("#success-dialog > p").innerHTML = crane
    ? "船上的物资已经全部安全运到岸边。"
    : variant
      ? "卡车已装载至 80%，装沙任务完成。"
      : "石头都到达了新家。<br/>你用自己的双手，完成了一份了不起的工程。";
  $(".help-tip").textContent = crane
    ? "回转并调节吊臂，让吊钩接触箱子顶部。箱子发光后抓取，提升并回转到岸边绿框，低位释放。"
    : variant
      ? "放低动臂进入沙层，向前推进，再收斗、抬臂。靠近卡车后配合伸出斗杆抬高铲斗，越过围墙和车厢边缘，再翻斗卸沙。撒在道路上的沙不计入装载率。"
      : "把铲斗放低，朝石头前进，再慢慢收斗、抬臂。运到绿色圆圈上方，翻斗卸下。";
  const helpCopy = crane
    ? [
        ["Q / E", "回转平台左转 / 右转"],
        ["R / F", "吊臂抬起 / 放下"],
        ["T / G", "伸缩臂伸出 / 缩回"],
        ["Y / H", "吊钩上升 / 下降"],
        ["Space", "抓取发光的物资箱"],
        ["Space", "在绿色框内释放物资"],
      ]
    : [
        ["W / S", "前进 / 后退"],
        ["A / D", "底盘左转 / 右转"],
        ["Q / E", "上车左回转 / 右回转"],
        ["R / F", "动臂抬起 / 放下"],
        ["T / G", "斗杆伸出 / 收回"],
        ["Y / H", "铲斗收斗 / 翻斗"],
      ];
  document.querySelectorAll<HTMLElement>(".help-grid p").forEach((p, i) => {
    p.innerHTML = `<b>${helpCopy[i][0]}</b>${helpCopy[i][1]}`;
  });
  const jointCopy = crane
    ? [
        ["回转平台", "左转", "右转"],
        ["吊臂变幅", "抬起", "放下"],
        ["伸缩吊臂", "伸出", "缩回"],
        ["起升机构", "上升", "下降"],
      ]
    : [
        ["回转", "左转", "右转"],
        ["动臂", "抬起", "放下"],
        ["斗杆", "伸出", "收回"],
        ["铲斗", "收斗", "翻斗"],
      ];
  document.querySelectorAll<HTMLElement>(".joint-row").forEach((row, i) => {
    row.hidden = tower && i === 1;
    row
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => (b.disabled = tower && i === 1));
    row.querySelector(".control-label strong")!.textContent = jointCopy[i][0];
    row
      .querySelectorAll<HTMLButtonElement>(".button-pair button")
      .forEach((button, j) => {
        button.querySelector("span")!.textContent = jointCopy[i][j + 1];
        button.ariaLabel = `${jointCopy[i][0]}${jointCopy[i][j + 1]} ${button.querySelector("kbd")!.textContent}`;
      });
  });
  compactMission.hidden = mode !== "site";
  compactMission.textContent =
    "已送达 " +
    (sim?.tracker.count || 0) +
    " / " +
    (variant ? "80%" : 8) +
    " 块石头 · 查看任务提示";
  if (variant === 1)
    compactMission.textContent = `车厢 ${sim?.tracker.count || 0}% / 80% · 挖沙装车`;
  if (crane)
    compactMission.textContent = `已吊运 ${craneMission?.count || 0} / 5 箱 · 河岸作业`;
  if (tower) {
    renderer.domElement.setAttribute(
      "aria-label",
      "可旋转和缩放的塔吊三维模型与小区施工场景",
    );
    $("#drive-hint").textContent =
      "塔吊固定在基座上，通过回转、小车和吊钩搬运。";
    $("#mission-name").textContent = "小区 · 楼栋建设";
    $("#required").textContent = "5";
    $(".progress-caption > span").textContent = "已新建楼层";
    document
      .querySelectorAll(".mission-steps b")
      .forEach(
        (o, i) =>
          (o.textContent = [
            "抓取最上层材料",
            "送到楼顶同名区域",
            "收齐三类，升钩增层",
          ][i]),
      );
    $("#success-count + span").textContent = "层新楼建设完成";
    $("#success-dialog > p").textContent =
      "15 份材料全部送达，楼栋从 2 层建成了 7 层！";
    $(".help-tip").textContent =
      "每层需要钢筋、砖头、石膏板各一份。对准顶层吊环，按 Space 抓取；先升高越过楼体，再对准同名区域低位释放。三种材料齐备后升起吊钩，楼栋自动增加一层。共可增加 5 层。";
    const copy = [
      ["Q / E", "塔吊左转 / 右转"],
      ["T / G", "小车向外 / 向内"],
      ["Y / H", "吊钩上升 / 下降"],
      ["Space", "抓取 / 低位释放"],
      ["视角按钮", "全景 / 料场 / 楼顶"],
      ["放回原位", "退回当前吊物，不扣库存"],
    ];
    document
      .querySelectorAll<HTMLElement>(".help-grid p")
      .forEach((p, i) => (p.innerHTML = `<b>${copy[i][0]}</b>${copy[i][1]}`));
    const rows = document.querySelectorAll<HTMLElement>(".joint-row");
    rows[0].querySelector("strong")!.textContent = "回转平台";
    rows[2].querySelector("strong")!.textContent = "变幅小车";
    rows[3].querySelector("strong")!.textContent = "起重吊钩";
    for (const [i, words] of [
      [2, ["向外", "向内"]],
      [3, ["上升", "下降"]],
    ] as const)
      rows[i].querySelectorAll<HTMLButtonElement>("button").forEach((b, j) => {
        b.querySelector("span")!.textContent = words[j];
        b.ariaLabel = `${rows[i].querySelector("strong")!.textContent}${words[j]} ${b.querySelector("kbd")!.textContent}`;
      });
    updateTowerUI();
  }
}
async function enterSite(index: number) {
  if (!ready || busy || ![0, 1, 2, 3].includes(index)) return;
  busy = true;
  clearInput();
  clearTimeout(successTimer);
  $("#loading").hidden = false;
  $("#loading-message").textContent = "正在准备你的施工现场…";
  try {
    sim?.dispose();
    sim = null;
    disposeGroup(environment);
    towerMission = null;
    craneMission = null;
    variant = index;
    selectedMachine =
      index === 3 ? "tower" : index === 2 ? "crane" : "excavator";
    mode = "site";
    machine.root.visible = index < 2;
    craneMachine.root.visible = false;
    towerMachine.root.visible = false;
    machine.reset(true);
    machine.highlight("");
    const site =
      index === 3
        ? await new (await import("./tower-site")).TowerMission().load()
        : index === 2
          ? await new (await import("./crane-site")).CraneMission().load()
          : index === 1
            ? await (await import("./sand-site")).buildSandSite()
            : buildSite(0);
    if (index === 2) craneMission = site as CraneMission;
    if (index === 3) towerMission = site as TowerMission;
    environment = site.group;
    scene.add(environment);
    if (index < 2) {
      const { Simulation } = await import("./physics");
      sim =
        index === 1
          ? new (await import("./sand")).SandSimulation(
              machine,
              site.target,
              80,
            )
          : new Simulation(machine, site.target, 8);
      await sim.init(index);
      scene.add(sim.group);
      for (let i = 0; i < 150; i++) sim.step();
      sim.render(1);
    }
    labelsOn = false;
    isPaused = false;
    scene.background = new THREE.Color("#d8e4de");
    scene.fog = new THREE.Fog(
      "#d8e4de",
      index === 3 ? 100 : 48,
      index === 3 ? 220 : 135,
    );
    $("#delivered").textContent = "0";
    lastCount = -1;
    $("#progress-fill").style.width = "0%";
    updateModeUI();
    if (index >= 2) focus();
    else {
      orbit.target.set(-0.5, 0.5, index === 1 ? -6 : 0);
      camera.position.set(17, 19, index === 1 ? 14 : 23);
      orbit.update();
    }
    // The entry tween shifts the model in screen-depth; the kinematic machine
    // body would follow that and shove the rocks we've just settled. Pause
    // the machine sync for the duration of the tween and resume on completion.
    if (index < 2)
      playEntry(machine, {
        onBegin: () => {
          if (sim) sim.machineSyncPaused = true;
        },
        onEnd: () => {
          if (sim) sim.machineSyncPaused = false;
        },
      });
    toast(
      index === 3
        ? "从料垛顶层抓取材料，运到楼顶同名区域。每种一份即可增加一层。"
        : index === 2
          ? "吊钩接触箱子后会发光，点击抓取，再吊到岸边绿框。"
          : index === 1
            ? "放低铲斗挖沙，收斗抬臂，越墙卸入卡车。"
            : "欢迎来到工地！先试着前进，靠近石堆。",
      4500,
    );
  } catch (e) {
    console.error(e);
    toast("场景加载失败，请重试。", 8000);
    busy = false;
    returnShowroom();
  } finally {
    busy = false;
    $("#loading").hidden = true;
    accumulator = 0;
    last = performance.now();
  }
}
function returnShowroom() {
  if (busy) return;
  clearInput();
  clearTimeout(successTimer);
  sim?.dispose();
  sim = null;
  craneMission = null;
  towerMission = null;
  if (machine.root.visible) playExit(machine);
  disposeGroup(environment);
  environment = showroom();
  scene.add(environment);
  mode = "showroom";
  machine.root.visible = selectedMachine === "excavator";
  craneMachine.root.visible = selectedMachine === "crane";
  towerMachine.root.visible = selectedMachine === "tower";
  machine.reset(false);
  craneMachine.reset();
  towerMachine.reset();
  activeDisplayMachine().highlight("");
  createLabels();
  labelsOn = true;
  isPaused = false;
  scene.background = new THREE.Color("#e9e6de");
  scene.fog = new THREE.Fog("#e9e6de", 45, 140);
  updateModeUI();
  focus();
  accumulator = 0;
  playEntry(activeDisplayMachine());
}
function pause(value = !isPaused) {
  isPaused = value;
  clearInput();
  accumulator = 0;
  last = performance.now();
}
function prepareSceneDialog() {
  document.querySelectorAll<HTMLElement>("[data-scene]").forEach((card) => {
    const index = Number(card.dataset.scene);
    card.hidden =
      selectedMachine === "tower"
        ? index !== 3
        : selectedMachine === "crane"
          ? index !== 2
          : index >= 2;
  });
  $("#scene-dialog .muted").textContent =
    selectedMachine === "tower"
      ? "为塔吊选择小区楼栋建设任务。"
      : selectedMachine === "crane"
        ? "为汽车起重机选择河岸吊装任务。"
        : "为履带式挖掘机选择施工任务。";
}
$("#start").addEventListener("click", () => {
  prepareSceneDialog();
  showDialog("#scene-dialog");
});
$("#return-showroom").addEventListener("click", returnShowroom);
$("#change-scene").addEventListener("click", () => {
  prepareSceneDialog();
  showDialog("#scene-dialog");
});
document.querySelectorAll<HTMLButtonElement>("[data-scene]").forEach((b) =>
  b.addEventListener("click", () => {
    $<HTMLDialogElement>("#scene-dialog").close();
    void enterSite(Number(b.dataset.scene));
  }),
);
$("#help").addEventListener("click", () => showDialog("#help-dialog"));
function chooseMachine(kind: "excavator" | "crane" | "tower") {
  if (!ready || busy || mode !== "showroom" || selectedMachine === kind) return;
  selectedMachine = kind;
  machine.root.visible = kind === "excavator";
  craneMachine.root.visible = kind === "crane";
  towerMachine.root.visible = kind === "tower";
  activeDisplayMachine().reset();
  activeDisplayMachine().highlight("");
  createLabels();
  updateModeUI();
  focus();
  playEntry(activeDisplayMachine());
}
$("#choose-excavator").addEventListener("click", () =>
  chooseMachine("excavator"),
);
$("#choose-crane").addEventListener("click", () => chooseMachine("crane"));
$("#choose-tower").addEventListener("click", () => chooseMachine("tower"));
$("#machine-select").addEventListener("change", (e) =>
  chooseMachine(
    (e.target as HTMLSelectElement).value as typeof selectedMachine,
  ),
);
$("#overview").addEventListener("click", () => focus(true));
let towerView: "overview" | "stock" | "roof" = "overview";
function focusTowerView(view: typeof towerView) {
  if (!towerMission) return;
  towerView = view;
  if (view === "overview") {
    focus(true);
    return;
  }
  const target =
    view === "stock"
      ? new THREE.Vector3(10, 3, 10)
      : new THREE.Vector3(12, towerMission.roofY, -3);
  orbit.target.copy(target);
  camera.position
    .copy(target)
    .add(
      view === "stock"
        ? new THREE.Vector3(13, 12, 21)
        : new THREE.Vector3(10, 20, 22),
    );
  orbit.update();
}
document
  .querySelectorAll<HTMLButtonElement>("[data-tower-view]")
  .forEach((b) =>
    b.addEventListener("click", () =>
      focusTowerView(b.dataset.towerView as typeof towerView),
    ),
  );
$("#return-cargo").addEventListener("click", () => {
  if (!towerMission || isPaused || busy || dialogOpen()) return;
  clearInput();
  if (towerMission.resetCargo()) toast("材料已放回原料垛，可以重新抓取。");
});
let towerUIState = "";
function updateTowerUI() {
  if (!towerMission) return;
  const m = towerMission;
  const state = JSON.stringify([
    m.count,
    m.received,
    m.remaining,
    m.status,
    !!m.held,
    isPaused,
  ]);
  if (state === towerUIState) return;
  towerUIState = state;
  $("#tower-floor").textContent =
    `楼栋 ${2 + m.count} / 7 层 · 加建 ${m.count} / 5 层`;
  $("#tower-materials").innerHTML = materialNames
    .map(
      (name, i) =>
        `<li class="${m.received[i] ? "done" : ""}"><span>${m.received[i] ? "✓" : "○"} ${name}</span><small>${m.completed ? "全部建设完成" : m.received[i] ? "本层已就位" : "本层待送达"} · 剩余 ${m.remaining[i]}</small></li>`,
    )
    .join("");
  $("#tower-status").textContent = m.status;
  compactMission.textContent = `加建 ${m.count} / 5 层 · ${materialNames.map((name, i) => name + (m.received[i] ? "✓" : "○")).join(" ")}`;
  $<HTMLButtonElement>("#return-cargo").disabled = !m.held || isPaused || busy;
}
function toggleCraneCargo() {
  if (
    !ready ||
    busy ||
    isPaused ||
    mode !== "site" ||
    (!craneMission && !towerMission)
  )
    return;
  clearInput();
  const result = (towerMission || craneMission)!.toggleGrab();
  if (result === "grabbed") {
    tone(430, 0.12, 0.018);
    toast(
      towerMission
        ? "材料已挂好。先提升吊钩，再运到楼顶同名区域。"
        : "物资已挂好。先提升吊钩，再回转到岸边。",
    );
  } else if (result === "released") {
    tone(560, 0.16, 0.018);
    toast("物资已安全放入指定位置。");
  } else if (result === "invalid-release")
    toast(
      towerMission
        ? "请对准楼顶同名区域，并下降到材料底部接触平台后释放。"
        : "请把物资低速放到发亮的绿色框内。",
    );
  updateTowerUI();
}
$("#scoop-assist").addEventListener("click", () => {
  if (!ready || busy || isPaused || mode !== "site") return;
  if (variant >= 2) {
    toggleCraneCargo();
    return;
  }
  clearInput();
  if (variant === 1) return;
  machine.setScoopAssist(!machine.scoopAssist);
  toast(
    machine.scoopAssist
      ? "正在缓慢贴地。显示“已贴地”后，向石堆前进。"
      : "贴地铲装已关闭，可以自由控制工作装置。",
  );
});
let assistUIState = "";
function updateAssistUI() {
  if (towerMission && mode === "site") {
    const m = towerMission,
      carrying = !!m.held;
    const button = $<HTMLButtonElement>("#scoop-assist");
    button.disabled =
      isPaused || busy || (carrying ? !m.canRelease : !m.canGrab);
    button.setAttribute("aria-pressed", String(carrying));
    button.ariaLabel = carrying ? "释放材料 Space" : "抓取材料 Space";
    button.querySelector("strong")!.textContent = carrying
      ? "释放材料"
      : "抓取材料";
    $("#grab-key").hidden = false;
    $("#assist-state").textContent = carrying
      ? "已挂载"
      : m.canGrab
        ? "可抓取"
        : "未对准";
    $("#assist-hint").textContent = m.status;
    updateTowerUI();
    assistUIState = "";
    return;
  }
  const state = `${mode}:${variant}:${machine.scoopAssist}:${machine.scoopAssistReady}:${isPaused}:${craneMission?.held?.root.name}:${craneMission?.candidate?.root.name}:${craneMission?.cargoGrounded}`;
  if (state === assistUIState) return;
  assistUIState = state;
  const button = $<HTMLButtonElement>("#scoop-assist");
  if (variant === 2 && mode === "site") {
    const carrying = Boolean(craneMission?.held);
    button.disabled = isPaused || (!carrying && !craneMission?.candidate);
    button.setAttribute("aria-pressed", String(carrying));
    button.ariaLabel = carrying ? "释放物资 Space" : "抓取物资 Space";
    $("#grab-key").hidden = false;
    button.querySelector("strong")!.textContent = carrying
      ? "释放物资"
      : "抓取物资";
    $("#assist-state").textContent = carrying
      ? "已挂载"
      : craneMission?.candidate
        ? "可抓取"
        : "未对准";
    $("#assist-hint").textContent = carrying
      ? craneMission?.cargoGrounded
        ? "物资已触地，不能继续下放；可上升或释放。"
        : "移动到绿色卸货框，贴近地面后释放。"
      : "吊钩接触箱子时，箱子会发光。";
    return;
  }
  button.ariaLabel = "贴地铲装";
  $("#grab-key").hidden = true;
  button.querySelector("strong")!.textContent = "贴地铲装";
  button.disabled = mode !== "site" || isPaused || variant === 1;
  button.setAttribute("aria-pressed", String(machine.scoopAssist));
  $("#assist-state").textContent = machine.scoopAssist
    ? machine.scoopAssistReady
      ? "已贴地"
      : "调整中"
    : "关闭";
  $("#assist-hint").textContent = machine.scoopAssistReady
    ? "向石堆前进，随后收斗并抬臂。"
    : machine.scoopAssist
      ? "正在调平；手动控制工作装置会退出。"
      : "自动调整到贴近地面的装料姿态。";
  if (variant === 1)
    $("#assist-hint").textContent = "沙层请手动下挖、收斗并抬臂。";
}
$("#reset-machine").addEventListener("click", () => {
  if (!ready || busy) return;
  if (mode === "site") {
    void enterSite(variant);
    toast("机械与任务已重新准备好。");
  } else {
    activeDisplayMachine().reset();
    focus();
    playEntry(activeDisplayMachine());
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
  prepareSceneDialog();
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
  if (
    (e.target as HTMLElement | null)?.closest?.(
      "input, textarea, select, [contenteditable='true']",
    )
  )
    return;
  if (
    e.code === "Space" &&
    !e.repeat &&
    (craneMission || towerMission) &&
    mode === "site" &&
    !dialogOpen() &&
    !isPaused &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey
  ) {
    e.preventDefault();
    toggleCraneCargo();
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
  const hit = raycaster.intersectObject(activeDisplayMachine().model, true)[0];
  if (hit) {
    let o: THREE.Object3D | null = hit.object;
    while (o) {
      const label = o.userData.part_label;
      if (label && description[label]) {
        selectPart(label);
        break;
      }
      if (selectedMachine === "excavator" && o.name === "J_Base") {
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
      (sim?.tracker.target.x ??
        craneMission?.target.x ??
        towerMission?.target.x ??
        0) +
        (Math.random() - 0.5) * 7,
      (towerMission ? towerMission.roofY + 3 : 5) + Math.random() * 4,
      (sim?.tracker.target.z ??
        craneMission?.target.z ??
        towerMission?.target.z ??
        0) +
        (Math.random() - 0.5) * 6,
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
function applyMissionResult(
  result: { count: number; justCompleted: boolean },
  required: number,
) {
  if (result.count !== lastCount) {
    lastCount = result.count;
    $("#delivered").textContent =
      String(result.count) + (variant === 1 ? "%" : "");
    $("#progress-fill").style.width =
      Math.min(100, (result.count / required) * 100) + "%";
    compactMission.textContent =
      variant === 3 && towerMission
        ? `加建 ${result.count} / 5 层 · ${materialNames.map((name, i) => name + (towerMission!.received[i] ? "✓" : "○")).join(" ")}`
        : variant === 2
          ? `已吊运 ${result.count} / 5 箱 · 河岸作业`
          : variant === 1
            ? `车厢 ${result.count}% / 80% · 挖沙装车`
            : `已送达 ${result.count} / ${required} 块石头 · 查看任务提示`;
    if (result.count > 0) tone(520, 0.12, 0.012);
  }
  if (result.justCompleted) {
    fireworks();
    tone(523, 0.25);
    setTimeout(() => tone(659, 0.25), 160);
    setTimeout(() => tone(784, 0.5), 320);
    $("#success-count").textContent =
      String(result.count) + (variant === 1 ? "%" : "");
    successTimer = window.setTimeout(() => {
      clearInput();
      showDialog("#success-dialog");
    }, 1800);
  }
}
function gamepadOptions(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  )
    .filter((b) => b.getClientRects().length && !b.closest("[hidden]"))
    .sort(
      (a, b) =>
        Number(a.classList.contains("dialog-close")) -
        Number(b.classList.contains("dialog-close")),
    );
}
function focusGamepadOption(root: HTMLElement, delta: number, initial = false) {
  const options = gamepadOptions(root);
  if (!options.length) return;
  const current = initial
    ? -1
    : options.indexOf(document.activeElement as HTMLButtonElement);
  const index =
    current < 0 ? 0 : (current + delta + options.length) % options.length;
  document
    .querySelectorAll(".gamepad-focus")
    .forEach((e) => e.classList.remove("gamepad-focus"));
  options[index].classList.add("gamepad-focus");
  options[index].focus({ preventScroll: true });
  options[index].scrollIntoView({ block: "nearest" });
}
function openGameMenu() {
  if (!ready || busy || dialogOpen()) return;
  menuWasPaused = isPaused;
  pause(true);
  for (const name of ["exit", "stock", "roof", "cargo"]) {
    const button = gameMenu.querySelector<HTMLButtonElement>(
      `[data-menu="${name}"]`,
    )!;
    button.hidden = name === "exit" ? mode !== "site" : !towerMission;
    button.disabled =
      name === "cargo" && $<HTMLButtonElement>("#return-cargo").disabled;
  }
  showDialog("#game-menu-dialog");
}
function updateInputHints() {
  document.body.dataset.input = connectedGamepad ? "gamepad" : "keyboard";
  $("#gamepad-bindings").hidden = !connectedGamepad;
  const set = (selector: string, value: string) => {
    const node = $(selector);
    if (node.textContent !== value) node.textContent = value;
  };
  set(".panel-mode", connectedGamepad ? "手柄控制" : "键盘 / 按钮");
  set(
    ".drive-section .control-label > span",
    connectedGamepad
      ? nintendoGamepad
        ? "ZL / ZR · L / R"
        : "LT / RT · LB / RB"
      : "W A S D",
  );
  set(
    ".work-section .section-heading > span",
    connectedGamepad ? "双摇杆" : "Q — H",
  );
  for (const [kbd, original] of keyboardHints) {
    const button = kbd.closest<HTMLButtonElement>("button")!;
    const positive = Number(button.dataset.sign) > 0;
    const action = button.dataset.action;
    const value =
      action === "drive"
        ? positive
          ? nintendoGamepad
            ? "ZR"
            : "RT"
          : nintendoGamepad
            ? "ZL"
            : "LT"
        : action === "steer"
          ? positive
            ? nintendoGamepad
              ? "L"
              : "LB"
            : nintendoGamepad
              ? "R"
              : "RB"
          : action === "joint0"
            ? `左杆${positive ? "←" : "→"}`
            : action === "joint2"
              ? `左杆${positive ? "↓" : "↑"}`
              : action === "joint1" || selectedMachine === "tower"
                ? `右杆${positive ? "↓" : "↑"}`
                : `右杆${positive ? "→" : "←"}`;
    const text = connectedGamepad ? value : original;
    if (kbd.textContent !== text) kbd.textContent = text;
    const title =
      button.closest(".joint-row")?.querySelector(".control-label strong")
        ?.textContent || "";
    const label =
      button.querySelector("small")?.textContent ||
      button.querySelector("span")?.textContent ||
      "";
    button.ariaLabel = `${title}${action === "steer" ? "底盘" : ""}${label} ${text}`;
  }
  set("#grab-key", connectedGamepad ? "A" : "Space");
  const assist = $("#scoop-assist");
  assist.ariaLabel = `${assist.querySelector("strong")!.textContent}${connectedGamepad ? " A" : variant >= 2 ? " Space" : ""}`;
  const tip = $(".help-tip");
  const tipText = tip.textContent!.replace(
    /按 (Space|A)/g,
    connectedGamepad ? "按 A" : "按 Space",
  );
  if (tip.textContent !== tipText) tip.textContent = tipText;
  $("#grab-key").hidden = !connectedGamepad && variant < 2;
  set(
    "#game-menu",
    connectedGamepad ? `${nintendoGamepad ? "＋" : "Menu"} 菜单` : "菜单",
  );
  const cameraHint = connectedGamepad
    ? "按住 X：左杆平移 · 右杆旋转 · 扳机缩放"
    : mouseCameraHint;
  if ($(".camera-hint").innerHTML !== cameraHint)
    $(".camera-hint").innerHTML = cameraHint;
  $("#help-dialog .help-grid").hidden = connectedGamepad;
  gamepadGuide.hidden = !connectedGamepad;
  if (connectedGamepad)
    gamepadGuide.textContent = $("#gamepad-bindings").textContent;
  set(
    "#help-dialog > p",
    connectedGamepad
      ? "方向键选择机械；A 选择场景或确认；B 返回或打开菜单；＋ / Menu 打开菜单。弹窗也支持左摇杆导航。"
      : keyboardHelpIntro,
  );
  const start = $("#start");
  let hint = start.querySelector("kbd");
  if (connectedGamepad && !hint) {
    hint = document.createElement("kbd");
    hint.textContent = "A";
    start.prepend(hint);
  }
  if (!connectedGamepad) hint?.remove();
  for (const dialog of Array.from(document.querySelectorAll("dialog"))) {
    let hint = dialog.querySelector<HTMLElement>(".gamepad-dialog-hint");
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "gamepad-dialog-hint";
      hint.textContent = "方向键 / 左摇杆选择 · A 确认 · B 返回";
      dialog.append(hint);
    }
    hint.hidden = !connectedGamepad;
  }
  if (!connectedGamepad)
    document
      .querySelectorAll(".gamepad-focus")
      .forEach((e) => e.classList.remove("gamepad-focus"));
}

function updateGamepad(dt: number) {
  let pads: (Gamepad | null)[] = [];
  try {
    pads = [...(navigator.getGamepads?.() || [])];
  } catch {
    /* Unavailable in restricted contexts. */
  }
  const enabled = ready && !busy && !document.hidden && windowFocused;
  const state = gamepad.read(pads, enabled);
  connectedGamepad = !!state.pad;
  nintendoGamepad = state.nintendo;
  menuButton.disabled = !ready || busy;
  const status = !state.pad
    ? pads.some(Boolean)
      ? "未识别为标准布局，请切换标准手柄模式。"
      : "连接手柄后按任意键启用。"
    : isPaused
      ? "已暂停 · ＋ / Menu 继续"
      : !enabled
        ? "手柄待命"
        : !state.active
          ? "已连接 · 请松开按键并让摇杆回中"
          : state.camera
            ? "镜头控制 · 松开 X 后回中恢复机械操作"
            : "已连接 · 机械控制";
  if ($("#gamepad-status").textContent !== status)
    $("#gamepad-status").textContent = status;
  const joints =
    selectedMachine === "tower"
      ? "左杆：回转 / 小车内外；右杆上下：升降吊钩。"
      : selectedMachine === "crane"
        ? "左杆：回转 / 伸缩臂；右杆上下：抬放臂，左右：升降吊钩。"
        : "左杆：回转 / 斗杆；右杆上下：动臂，左右：收斗 / 翻斗。";
  const help = `${joints} ${selectedMachine === "excavator" ? (state.nintendo ? "L/R 转向，ZL/ZR 后退/前进。 " : "LB/RB 转向，LT/RT 后退/前进。 ") : ""}A：${mode === "showroom" ? "选择场景" : selectedMachine === "excavator" ? "贴地铲装（城市工地）" : "抓取/释放"}。按住 X：左杆平移、右杆旋转、${state.nintendo ? "ZL/ZR" : "LT/RT"} 拉远/拉近、右杆按下复位。${state.nintendo ? "＋" : "Menu"} / B：菜单。方向键选择机械；弹窗用方向键 / 左杆选择，A 确认、B 返回。`;
  if ($("#gamepad-bindings").textContent !== help)
    $("#gamepad-bindings").textContent = help;
  if (!enabled) return;
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
  if (dialog) {
    inputs.clear();
    // Keep machine controls disarmed for the entire modal, even with neutral sticks.
    gamepad.suspend();
    if (state.back || (state.pause && dialog === gameMenu)) {
      dialog.close();
      return;
    }
    if (state.navigate || state.navigateAxis)
      focusGamepadOption(dialog, state.navigate || state.navigateAxis);
    if (state.action) {
      if (
        !gamepadOptions(dialog).includes(
          document.activeElement as HTMLButtonElement,
        )
      )
        focusGamepadOption(dialog, 0);
      (document.activeElement as HTMLButtonElement)?.click();
    }
    return;
  }
  if (state.pause || state.back) {
    openGameMenu();
    return;
  }
  if (state.help) {
    showDialog("#help-dialog");
    return;
  }
  if (isPaused || !state.active) return;
  if (mode === "showroom" && !state.camera) {
    if (state.navigate) {
      const kinds = ["excavator", "crane", "tower"] as const;
      chooseMachine(
        kinds[
          (kinds.indexOf(selectedMachine) + state.navigate + kinds.length) %
            kinds.length
        ],
      );
      clearInput();
      return;
    }
    if (state.action) {
      $("#start").click();
      return;
    }
  }
  const [lx, ly, rx, ry] = state.axes;
  if (state.camera) {
    inputs.clear();
    machine.setScoopAssist(false);
    if (state.reset) {
      focus();
      return;
    }
    const offset = camera.position.clone().sub(orbit.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= rx * dt * 1.7;
    spherical.phi = clamp(
      spherical.phi + ry * dt * 1.4,
      Math.max(0.05, orbit.minPolarAngle),
      orbit.maxPolarAngle,
    );
    spherical.radius = clamp(
      spherical.radius * Math.exp(state.zoom * dt),
      orbit.minDistance,
      orbit.maxDistance,
    );
    const pan = new THREE.Vector3()
      .setFromMatrixColumn(camera.matrix, 0)
      .multiplyScalar(lx)
      .addScaledVector(
        new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1),
        -ly,
      )
      .multiplyScalar(spherical.radius * dt * 0.65);
    orbit.target.add(pan);
    camera.position.copy(orbit.target).add(offset.setFromSpherical(spherical));
    return;
  }
  if (state.action && mode === "site") {
    $<HTMLButtonElement>("#scoop-assist").click();
    return;
  }
  const add = (name: string, value: number) => {
    if (value) inputs.set(name, clamp((inputs.get(name) || 0) + value, -1, 1));
  };
  add("joint0", -lx);
  add("joint2", ly);
  if (selectedMachine === "tower") add("joint3", ry);
  else {
    add("joint1", ry);
    add("joint3", rx);
  }
  if (mode === "site" && selectedMachine === "excavator") {
    add("drive", state.drive);
    add("steer", state.steer);
  }
}

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.08);
  const fixedStep = mode === "site" && variant === 1 ? 1 / 60 : 1 / 120;
  last = now;
  requestAnimationFrame(frame);
  inputs.clear();
  for (const v of held.values())
    inputs.set(v.action, clamp((inputs.get(v.action) || 0) + v.sign, -1, 1));
  updateGamepad(dt);
  document
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((b) =>
      b.classList.toggle(
        "pressed",
        Math.sign(inputs.get(b.dataset.action!) || 0) ===
          Number(b.dataset.sign),
      ),
    );
  if (ready && !busy && !isPaused && !dialogOpen() && !document.hidden) {
    accumulator += dt;
    while (accumulator >= fixedStep) {
      if (towerMission) {
        const result = towerMission.step(inputs, fixedStep);
        applyMissionResult(result, towerMission.required);
        if (result.justBuilt) {
          toast(
            result.justCompleted
              ? "7 层楼栋建成！"
              : `第 ${towerMission.count} 层建设完成，继续吊运下一组材料。`,
          );
          if (towerView === "roof") focusTowerView("roof");
        }
      } else if (craneMission) {
        applyMissionResult(
          craneMission.step(inputs, fixedStep),
          craneMission.required,
        );
      } else if (mode === "showroom" && selectedMachine === "tower")
        towerMachine.step(inputs, fixedStep);
      else if (mode === "showroom" && selectedMachine === "crane")
        craneMachine.step(inputs, fixedStep);
      else machine.step(inputs, fixedStep, mode === "site");
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
        applyMissionResult(result, sim.tracker.required);
      }
      accumulator -= fixedStep;
    }
    sim?.render(accumulator / fixedStep);
  } else accumulator = 0;
  if (ready) {
    const activeTower =
      towerMission?.machine ||
      (mode === "showroom" && selectedMachine === "tower"
        ? towerMachine
        : null);
    const activeCrane =
      craneMission ||
      (mode === "showroom" && selectedMachine === "crane"
        ? craneMachine
        : null);
    if (activeTower) {
      $("#angle0").textContent =
        Math.round(THREE.MathUtils.radToDeg(activeTower.slew)) + "°";
      $("#angle2").textContent = activeTower.radius.toFixed(1) + " m";
      $("#angle3").textContent = activeTower.ropeLength.toFixed(1) + " m";
    } else if (activeCrane) {
      const values =
        activeCrane instanceof CraneMachine
          ? {
              slew: activeCrane.angles[0],
              boom: activeCrane.angles[1],
              extension: activeCrane.angles[2],
              ropeLength: activeCrane.angles[3],
            }
          : activeCrane;
      $("#angle0").textContent =
        Math.round(THREE.MathUtils.radToDeg(values.slew)) + "°";
      $("#angle1").textContent =
        Math.round(THREE.MathUtils.radToDeg(values.boom)) + "°";
      $("#angle2").textContent = values.extension.toFixed(1) + " m";
      $("#angle3").textContent = values.ropeLength.toFixed(1) + " m";
    } else
      jointNames.forEach(
        (_, i) =>
          ($("#angle" + i).textContent =
            Math.round(THREE.MathUtils.radToDeg(machine.angles[i])) + "°"),
      );
    updateLabels();
    updateAssistUI();
  }
  updateFireworks(dt);
  updateInputHints();
  orbit.update();
  renderer.render(scene, camera);
}
async function boot() {
  try {
    await Promise.all([
      machine.load(),
      craneMachine.load(),
      towerMachine.load(),
    ]);
    ready = true;
    machine.reset();
    createLabels();
    focus();
    updateModeUI();
    $("#loading").hidden = true;
    $<HTMLButtonElement>("#start").disabled = false;
    playEntry(machine);
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
    get cameraView() {
      return {
        position: camera.position.toArray(),
        target: orbit.target.toArray(),
      };
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
    get craneMission() {
      return craneMission;
    },
    get craneMachine() {
      return craneMachine;
    },
    get towerMachine() {
      return towerMachine;
    },
    get towerMission() {
      return towerMission;
    },
    get rendererInfo() {
      return renderer.info.render;
    },
    get selectedMachine() {
      return selectedMachine;
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
