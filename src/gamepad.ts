/** Standard browser mapping; Nintendo face labels differ from Xbox labels. */
export function deadzone(value: number, threshold = 0.18) {
  return Math.abs(value) <= threshold
    ? 0
    : Math.sign(value) *
        Math.min(1, (Math.abs(value) - threshold) / (1 - threshold));
}

export class GamepadInput {
  private identity = "";
  private previous: boolean[] = [];
  private cameraWasHeld = false;
  armed = false;

  suspend() {
    this.armed = false;
  }

  read(pads: readonly (Gamepad | null)[], enabled: boolean) {
    const pad = pads.find((p) => p?.connected && p.mapping === "standard");
    const identity = pad ? `${pad.index}:${pad.id}` : "";
    const changed = identity !== this.identity;
    if (changed) {
      this.identity = identity;
      this.armed = false;
      this.previous = [];
    }
    const buttons = pad?.buttons.map((b) => b.pressed || b.value > 0.5) || [];
    const axes = Array.from({ length: 4 }, (_, i) =>
      deadzone(pad?.axes[i] || 0),
    );
    const nintendo = /Joy-Con|Nintendo|057e/i.test(pad?.id || "");
    const camera = !!buttons[nintendo ? 3 : 2];
    const edge = (i: number) =>
      enabled && !changed && buttons[i] && !this.previous[i];
    const action = !!edge(nintendo ? 1 : 0);
    const pause = !!edge(9);
    const reset = camera && !!edge(11);
    if (!enabled || (this.cameraWasHeld && !camera)) this.armed = false;
    if (
      enabled &&
      axes.every((v) => v === 0) &&
      pad?.buttons.every((b) => !b.pressed && b.value <= 0.05)
    )
      this.armed = true;
    this.previous = buttons;
    this.cameraWasHeld = camera;
    const value = (i: number) => pad?.buttons[i]?.value || 0;
    return {
      pad,
      nintendo,
      camera: enabled && camera,
      axes,
      zoom: value(6) - value(7),
      action,
      pause,
      reset,
      active: enabled && this.armed && !!pad,
      drive: value(7) - value(6),
      steer: value(4) - value(5),
    };
  }
}
