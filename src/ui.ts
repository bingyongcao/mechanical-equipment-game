export const icon = (name: string, size = 20) => {
  const paths: Record<string, string> = {
    cube: '<path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    rotate: '<path d="M20 8a9 9 0 1 0 1 7M20 3v6h-6"/>',
    target:
      '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    volume:
      '<path d="m4 9 4 0 5-5v16l-5-5H4zM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/>',
    label: '<path d="M3 4h9l9 9-8 8-10-10z"/><circle cx="7.5" cy="8" r="1"/>',
    pause: '<path d="M8 4v16M16 4v16"/>',
    play: '<path d="m8 4 12 8-12 8z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2"/>',
    book: '<path d="M12 5v16M3 3l9 2 9-2v16l-9 2-9-2z"/>',
    mouse:
      '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7"/>',
    helmet: '<path d="M3 16h18v4H3zM5 16v-4a7 7 0 0 1 14 0v4M10 5V2h4v3"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3z"/>',
  };
  return (
    '<svg width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (paths[name] || paths.cube) +
    "</svg>"
  );
};
export const description: Record<string, { title: string; text: string }> = {
  动臂: {
    title: "动臂 · 有力的大胳膊",
    text: "抬起或放下整套工作装置。先把动臂放低，让铲斗接近石头。",
  },
  斗杆: {
    title: "斗杆 · 灵活的小胳膊",
    text: "让铲斗靠近或远离机身。伸出去够一够，收回来挖一挖。",
  },
  铲斗: {
    title: "铲斗 · 会翻转的大勺子",
    text: "收斗把石头托起来，翻斗让石头落下。石头不会吸在铲斗上哦。",
  },
  连杆: {
    title: "连杆 · 动作的小帮手",
    text: "连接液压缸与铲斗，让铲斗的翻转更灵活。试着收斗，看看它怎么动。",
  },
  驾驶室: {
    title: "驾驶室 · 工程师的小基地",
    text: "操作手柄、观察周围，工程师在这里指挥整台挖掘机。",
  },
  履带: {
    title: "履带 · 稳稳的大脚丫",
    text: "左右履带配合前进，速度不同就能转弯。挖掘机不能横着走。",
  },
  液压缸: {
    title: "液压缸 · 伸缩的力量",
    text: "活塞杆从缸筒里伸出或缩回，推动机械的胳膊。",
  },
};
export function markup() {
  const jointControls = [
    ["回转", "joint0", "Q", "E", "左转", "右转"],
    ["动臂", "joint1", "R", "F", "抬起", "放下"],
    ["斗杆", "joint2", "T", "G", "伸出", "收回"],
    ["铲斗", "joint3", "Y", "H", "收斗", "翻斗"],
  ];
  return `
<header class="topbar"><a class="brand" href="./" aria-label="小小工程师首页"><span class="brand-icon"><img src="/favicon.svg" alt="" /></span><span>小小工程师<small>LITTLE BUILDERS</small></span></a>
<nav class="steps" aria-label="探索步骤"><span class="active" id="step1"><b>01</b> 认识机械</span><i></i><span id="step2"><b>02</b> 施工挑战</span></nav>
<div class="top-actions"><button id="sound" class="icon-button" aria-label="开启声音" title="开启声音">${icon("volume")}</button><button id="help" class="icon-button" aria-label="查看操作指南" title="操作指南">${icon("book")}</button></div></header>
<main class="layout">
<aside class="sidebar">
<h1 id="side-title">机械选择</h1>
<div id="garage-panel">
<button class="machine-card selected" id="choose-excavator"><span class="card-top"><span class="tag">挖掘 · 搬运</span><span class="selected-dot">${icon("check", 13)}</span></span><div class="machine-thumbnail"></div><strong>履带式挖掘机</strong><span class="card-bottom">EX 200 <span>已选择 ${icon("check", 13)}</span></span></button>
<div class="upcoming"><span class="mini-machine">▰</span><div><strong>推土机</strong><small>推平土地的大力士</small></div><span class="soon">筹备中</span></div>
<div class="upcoming"><span class="mini-machine">♜</span><div><strong>起重机</strong><small>把梦想举得更高</small></div><span class="soon">筹备中</span></div>
</div>
<div id="mission-panel" hidden>
<button class="back-button" id="return-showroom">${icon("arrow", 16)} 返回机械展厅</button>
<h2 id="mission-name">城市工地</h2>
<div class="progress-caption"><span>搬运进度</span><strong><b id="delivered">0</b> / <span id="required">8</span></strong></div><div class="progress-track"><span id="progress-fill"></span></div>
<ol class="mission-steps"><li><span>1</span><b>装载石头</b></li><li><span>2</span><b>移动到绿圈</b></li><li><span>3</span><b>卸下并停稳</b></li></ol>
<button class="text-button" id="change-scene">${icon("cube", 17)} 切换施工场景 ${icon("chevron", 15)}</button>
</div>
</aside>
<section class="stage" aria-label="三维机械互动区域">
<div class="stage-heading"><button id="reset-machine" class="tool-button">${icon("rotate", 15)} 机械复位</button></div>
<div id="viewport"><div id="labels"></div><div id="target-label" hidden>卸在这里 <span>↓</span></div></div>
<div class="loading" id="loading"><span class="loader"></span><strong id="loading-message">挖掘机正在驶来…</strong><small>正在准备模型与机械部件</small></div>
<button id="overview" class="tool-button stage-overview" hidden>${icon("cube", 16)} 鸟瞰工地</button>
<div class="camera-hint">${icon("mouse", 15)} <span>拖动旋转</span><i>·</i><span>滚轮缩放</span><i>·</i><span>右键平移</span></div>
<div class="status-toast" id="toast" role="status" aria-live="polite"></div>
</section>
<aside class="controls-panel">
<div class="controls-scroll">
<div class="panel-title"><span>${icon("helmet", 19)} 驾驶室</span><span class="panel-mode">键盘 / 按钮</span></div>
<section class="control-card drive-section"><div class="control-label"><strong>行走</strong><span>W A S D</span></div><div class="drive-controls"><button class="drive-forward" data-action="drive" data-sign="1" aria-label="前进 W"><span>↑</span><small>前进</small><kbd>W</kbd></button><button class="drive-left" data-action="steer" data-sign="1" aria-label="底盘左转 A"><span>↶</span><small>左转</small><kbd>A</kbd></button><button class="drive-back" data-action="drive" data-sign="-1" aria-label="后退 S"><span>↓</span><small>后退</small><kbd>S</kbd></button><button class="drive-right" data-action="steer" data-sign="-1" aria-label="底盘右转 D"><span>↷</span><small>右转</small><kbd>D</kbd></button></div><small id="drive-hint">进入工地后可驾驶。</small></section>
<section class="control-card work-section"><div class="section-heading"><strong>工作装置</strong><span>Q — H</span></div>
<div class="assist-controls"><button id="scoop-assist" aria-label="贴地铲装" aria-pressed="false" disabled>${icon("target", 16)} <strong>贴地铲装</strong><span id="assist-state">关闭</span></button><small id="assist-hint">自动调整到装料姿态。</small></div>
<div class="joint-controls">${jointControls.map(([title, action, k1, k2, t1, t2], i) => `<div class="joint-row"><div class="control-label"><strong>${title}</strong><span id="angle${i}">0°</span></div><div class="button-pair"><button data-action="${action}" data-sign="${i > 0 ? -1 : 1}" aria-label="${title}${t1} ${k1}"><span>${t1}</span><kbd>${k1}</kbd></button><button data-action="${action}" data-sign="${i > 0 ? 1 : -1}" aria-label="${title}${t2} ${k2}"><span>${t2}</span><kbd>${k2}</kbd></button></div></div>`).join("")}</div></section>
</div>
<div class="start-card"><button id="start" class="primary-button" disabled>去工地试一试 ${icon("arrow", 18)}</button></div>
</aside>
</main>
<dialog id="scene-dialog"><button class="dialog-close icon-button" data-close aria-label="关闭">${icon("close")}</button><div class="eyebrow">YOUR NEXT ADVENTURE</div><h2>选一份工程，出发吧。</h2><p class="muted">同一台挖掘机，不一样的小挑战。</p><div class="scene-cards"><button class="scene-card" data-scene="0"><div class="scene-art city-art" role="img" aria-label="挖掘机在城市建筑工地搬运石料"></div><span class="tag">第一站 · 轻松上手</span><h3>城市建筑工地</h3><p>在高楼之间，把 8 块石头送到指定区域。</p><strong>开始施工 ${icon("arrow", 16)}</strong></button><button class="scene-card" data-scene="1"><div class="scene-art yard-art" role="img" aria-label="挖掘机在材料场向工程车装载砂石"></div><span class="tag">第二站 · 再试一次</span><h3>工地材料整理</h3><p>换个卸料方向，练习搬运 12 块石头。</p><strong>接受挑战 ${icon("arrow", 16)}</strong></button></div></dialog>
<dialog id="help-dialog"><button class="dialog-close icon-button" data-close aria-label="关闭">${icon("close")}</button><div class="eyebrow">LITTLE BUILDER'S HANDBOOK</div><h2>慢慢来，你就是工程师。</h2><p>鼠标拖动画面可以环绕，滚轮缩放，右键拖动平移。按住右侧按钮，机械就会持续动作，松开即停。</p><div class="help-grid"><p><b>W / S</b>前进 / 后退</p><p><b>A / D</b>底盘左转 / 右转</p><p><b>Q / E</b>上车左回转 / 右回转</p><p><b>R / F</b>动臂抬起 / 放下</p><p><b>T / G</b>斗杆伸出 / 收回</p><p><b>Y / H</b>铲斗收斗 / 翻斗</p></div><p class="help-tip">把铲斗放低，朝石头前进，再慢慢收斗、抬臂。运到绿色圆圈上方，翻斗卸下。无需赶时间，也不怕重来。</p><button class="primary-button" data-close>我知道啦 ${icon("check", 17)}</button></dialog>
<dialog id="success-dialog"><div class="success-mark">${icon("helmet", 42)}</div><div class="eyebrow">MISSION ACCOMPLISHED</div><h2>干得漂亮，小工程师！</h2><p>石头都到达了新家。<br/>你用自己的双手，完成了一份了不起的工程。</p><div class="success-stats"><div><b id="success-count">8</b><span>块石头成功送达</span></div><div><b>★ ★ ★</b><span>今天的机械小能手</span></div></div><button class="primary-button" id="keep-playing">继续自由探索 ${icon("arrow", 18)}</button><button class="text-button" id="another-scene">再选一个任务</button></dialog>
`;
}
