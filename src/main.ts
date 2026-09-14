import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Machine, jointNames } from "./machine";
import { CraneMachine } from "./crane-machine";
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
scene.add(machine.root, craneMachine.root);
craneMachine.root.visible = false;
let environment = showroom();
scene.add(environment);
scene.background = new THREE.Color("#e9e6de");
scene.fog = new THREE.Fog("#e9e6de", 45, 140);
let sim: Simulation | null = null,
  craneMission: CraneMission | null = null,
  mode: "showroom" | "site" = "showroom",
  selectedMachine: "excavator" | "crane" = "excavator",
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
  if (mode === "site" && variant === 2) {
    orbit.target.set(0.8, 2.1, 0.8);
    camera.position.set(overhead ? 1 : 19, overhead ? 30 : 15, overhead ? 22 : -21);
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
  return selectedMachine === "crane" ? craneMachine : machine;
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
  const activeTarget = sim?.tracker.target || craneMission?.target;
  if (activeTarget && mode === "site") {
    const p = new THREE.Vector3(
      activeTarget.x,
      variant === 1 ? 3.5 : 0.55,
      activeTarget.z,
    ).project(camera);
    $("#target-label").hidden = p.z > 1;
    $("#target-label").style.left = (p.x * 0.5 + 0.5) * w + "px";
    $("#target-label").style.top = (-p.y * 0.5 + 0.5) * h + "px";
  } else $("#target-label").hidden = true;
}
function updateModeUI() {
  const crane = mode === "site" ? variant === 2 : selectedMachine === "crane";
  renderer.domElement.setAttribute("aria-label", crane ? "可旋转和缩放的汽车起重机河岸作业场景" : "可旋转和缩放的挖掘机三维模型");
  document.body.dataset.mode = mode;
  $("#choose-excavator").classList.toggle("selected", selectedMachine === "excavator");
  $("#choose-crane").classList.toggle("selected", selectedMachine === "crane");
  $("#choose-excavator .card-bottom span").innerHTML = selectedMachine === "excavator" ? `已选择 ${icon("check", 13)}` : "点击选择";
  $("#choose-crane .card-bottom span").innerHTML = selectedMachine === "crane" ? `已选择 ${icon("check", 13)}` : "点击选择";
  $("#start").innerHTML = `确认${crane ? "起重机" : "挖掘机"} · 选择场景 ${icon("arrow", 18)}`;
  $("#garage-panel").hidden = mode === "site";
  $("#mission-panel").hidden = mode !== "site";
  $("#side-title").hidden = mode === "site";
  $("#step1").classList.toggle("active", mode === "showroom");
  $("#step2").classList.toggle("active", mode === "site");
  $("#start").hidden = mode === "site";
  $("#drive-hint").textContent =
    crane ? "支腿已经固定，车辆不可移动。" : mode === "site" ? "左右履带配合，慢慢转弯。" : "进入工地后，就能开动履带。";
  $("#reset-machine").innerHTML =
    icon("rotate", 15) + (mode === "site" ? "重新开始" : "机械复位");
  $("#overview").hidden = mode !== "site";
  document
    .querySelectorAll<HTMLButtonElement>(
      '[data-action="drive"],[data-action="steer"]',
    )
    .forEach((b) => (b.disabled = mode !== "site" || crane));
  $("#mission-name").textContent = crane ? "河岸 · 物资吊运" : variant ? "砂料厂 · 装车" : "城市工地";
  $("#required").textContent = crane ? "5" : variant ? "80%" : "8";
  $(".progress-caption > span").textContent = crane ? "物资搬运进度" : variant ? "车厢装载率" : "搬运进度";
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
  $("#success-count + span").textContent = crane ? "箱物资成功上岸" : variant ? "车厢装载率" : "块石头成功送达";
  $("#success-dialog > p").innerHTML = crane ? "船上的物资已经全部安全运到岸边。" : variant ? "卡车已装载至 80%，装沙任务完成。" : "石头都到达了新家。<br/>你用自己的双手，完成了一份了不起的工程。";
  $(".help-tip").textContent = crane ? "回转并调节吊臂，让吊钩接触箱子顶部。箱子发光后抓取，提升并回转到岸边绿框，低位释放。" : variant ? "放低动臂进入沙层，向前推进，再收斗、抬臂。靠近卡车后配合伸出斗杆抬高铲斗，越过围墙和车厢边缘，再翻斗卸沙。撒在道路上的沙不计入装载率。" : "把铲斗放低，朝石头前进，再慢慢收斗、抬臂。运到绿色圆圈上方，翻斗卸下。";
  const helpCopy = crane
    ? [["Q / E", "回转平台左转 / 右转"], ["R / F", "吊臂抬起 / 放下"], ["T / G", "伸缩臂伸出 / 缩回"], ["Y / H", "吊钩上升 / 下降"], ["Space", "抓取发光的物资箱"], ["Space", "在绿色框内释放物资"]]
    : [["W / S", "前进 / 后退"], ["A / D", "底盘左转 / 右转"], ["Q / E", "上车左回转 / 右回转"], ["R / F", "动臂抬起 / 放下"], ["T / G", "斗杆伸出 / 收回"], ["Y / H", "铲斗收斗 / 翻斗"]];
  document.querySelectorAll<HTMLElement>(".help-grid p").forEach((p, i) => {
    p.innerHTML = `<b>${helpCopy[i][0]}</b>${helpCopy[i][1]}`;
  });
  const jointCopy = crane
    ? [["回转平台", "左转", "右转"], ["吊臂变幅", "抬起", "放下"], ["伸缩吊臂", "伸出", "缩回"], ["起升机构", "上升", "下降"]]
    : [["回转", "左转", "右转"], ["动臂", "抬起", "放下"], ["斗杆", "伸出", "收回"], ["铲斗", "收斗", "翻斗"]];
  document.querySelectorAll<HTMLElement>(".joint-row").forEach((row, i) => {
    row.querySelector(".control-label strong")!.textContent = jointCopy[i][0];
    row.querySelectorAll<HTMLButtonElement>(".button-pair button").forEach((button, j) => {
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
    craneMission = null;
    variant = index;
    selectedMachine = index === 2 ? "crane" : "excavator";
    mode = "site";
    machine.root.visible = index !== 2;
    craneMachine.root.visible = false;
    machine.reset(true);
    machine.highlight("");
    const site = index === 2
      ? await new (await import("./crane-site")).CraneMission().load()
      : index === 1
        ? await (await import("./sand-site")).buildSandSite()
        : buildSite(0);
    if (index === 2) craneMission = site as CraneMission;
    environment = site.group;
    scene.add(environment);
    if (index !== 2) {
      const { Simulation } = await import("./physics");
      sim = index === 1
        ? new (await import("./sand")).SandSimulation(machine, site.target, 80)
        : new Simulation(machine, site.target, 8);
      await sim.init(index);
      scene.add(sim.group);
      for (let i = 0; i < 150; i++) sim.step();
      sim.render(1);
    }
    labelsOn = false;
    isPaused = false;
    scene.background = new THREE.Color("#d8e4de");
    scene.fog = new THREE.Fog("#d8e4de", 48, 135);
    $("#delivered").textContent = "0";
    lastCount = -1;
    $("#progress-fill").style.width = "0%";
    updateModeUI();
    if (index === 2) focus();
    else {
      orbit.target.set(-0.5, 0.5, index === 1 ? -6 : 0);
      camera.position.set(17, 19, index === 1 ? 14 : 23);
      orbit.update();
    }
    // The entry tween shifts the model in screen-depth; the kinematic machine
    // body would follow that and shove the rocks we've just settled. Pause
    // the machine sync for the duration of the tween and resume on completion.
    if (index !== 2) playEntry(machine, {
      onBegin: () => {
        if (sim) sim.machineSyncPaused = true;
      },
      onEnd: () => {
        if (sim) sim.machineSyncPaused = false;
      },
    });
    toast(
      index === 2
        ? "吊钩接触箱子后会发光，点击抓取，再吊到岸边绿框。"
        : index === 1
        ? "放低铲斗挖沙，收斗抬臂，越墙卸入卡车。"
        : "欢迎来到工地！先试着前进，靠近石堆。",
      4500,
    );
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
  craneMission = null;
  if (machine.root.visible) playExit(machine);
  disposeGroup(environment);
  environment = showroom();
  scene.add(environment);
  mode = "showroom";
  machine.root.visible = selectedMachine === "excavator";
  craneMachine.root.visible = selectedMachine === "crane";
  machine.reset(false);
  craneMachine.reset();
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
    const craneScene = card.dataset.scene === "2";
    card.hidden = selectedMachine === "crane" ? !craneScene : craneScene;
  });
  $("#scene-dialog .muted").textContent = selectedMachine === "crane"
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
function chooseMachine(kind: "excavator" | "crane") {
  if (!ready || busy || mode !== "showroom" || selectedMachine === kind) return;
  selectedMachine = kind;
  machine.root.visible = kind === "excavator";
  craneMachine.root.visible = kind === "crane";
  activeDisplayMachine().reset();
  activeDisplayMachine().highlight("");
  createLabels();
  updateModeUI();
  focus();
  playEntry(activeDisplayMachine());
}
$("#choose-excavator").addEventListener("click", () => chooseMachine("excavator"));
$("#choose-crane").addEventListener("click", () => chooseMachine("crane"));
$("#overview").addEventListener("click", () => focus(true));
function toggleCraneCargo() {
  if (!ready || busy || isPaused || mode !== "site" || variant !== 2 || !craneMission) return;
  clearInput();
  const result = craneMission.toggleGrab();
  if (result === "grabbed") {
    tone(430, 0.12, 0.018);
    toast("物资已挂好。先提升吊钩，再回转到岸边。");
  } else if (result === "released") {
    tone(560, 0.16, 0.018);
    toast("物资已安全放入指定位置。");
  } else if (result === "invalid-release") toast("请把物资低速放到发亮的绿色框内。");
}
$("#scoop-assist").addEventListener("click", () => {
  if (!ready || busy || isPaused || mode !== "site") return;
  if (variant === 2) {
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
    button.querySelector("strong")!.textContent = carrying ? "释放物资" : "抓取物资";
    $("#assist-state").textContent = carrying ? "已挂载" : craneMission?.candidate ? "可抓取" : "未对准";
    $("#assist-hint").textContent = carrying
      ? craneMission?.cargoGrounded ? "物资已触地，不能继续下放；可上升或释放。" : "移动到绿色卸货框，贴近地面后释放。"
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
    toast("机械与石堆已重新准备好。");
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
  if (e.code === "Space" && !e.repeat && craneMission && mode === "site" && !dialogOpen() && !isPaused) {
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
      (sim?.tracker.target.x ?? craneMission?.target.x ?? 0) + (Math.random() - 0.5) * 7,
      5 + Math.random() * 4,
      (sim?.tracker.target.z ?? craneMission?.target.z ?? 0) + (Math.random() - 0.5) * 6,
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
    $("#delivered").textContent = String(result.count) + (variant === 1 ? "%" : "");
    $("#progress-fill").style.width = Math.min(100, (result.count / required) * 100) + "%";
    compactMission.textContent = variant === 2
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
    $("#success-count").textContent = String(result.count) + (variant === 1 ? "%" : "");
    successTimer = window.setTimeout(() => {
      clearInput();
      showDialog("#success-dialog");
    }, 1800);
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
    while (accumulator >= fixedStep) {
      if (craneMission) {
        applyMissionResult(craneMission.step(inputs, fixedStep), craneMission.required);
      } else if (mode === "showroom" && selectedMachine === "crane")
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
    const activeCrane = craneMission || (mode === "showroom" && selectedMachine === "crane" ? craneMachine : null);
    if (activeCrane) {
      const values = activeCrane instanceof CraneMachine
        ? { slew: activeCrane.angles[0], boom: activeCrane.angles[1], extension: activeCrane.angles[2], ropeLength: activeCrane.angles[3] }
        : activeCrane;
      $("#angle0").textContent = Math.round(THREE.MathUtils.radToDeg(values.slew)) + "°";
      $("#angle1").textContent = Math.round(THREE.MathUtils.radToDeg(values.boom)) + "°";
      $("#angle2").textContent = values.extension.toFixed(1) + " m";
      $("#angle3").textContent = values.ropeLength.toFixed(1) + " m";
    } else jointNames.forEach(
      (_, i) => ($("#angle" + i).textContent = Math.round(THREE.MathUtils.radToDeg(machine.angles[i])) + "°"),
    );
    updateLabels();
    updateAssistUI();
  }
  updateFireworks(dt);
  orbit.update();
  renderer.render(scene, camera);
}
async function boot() {
  try {
    await Promise.all([machine.load(), craneMachine.load()]);
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
