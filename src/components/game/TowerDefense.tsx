import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Heart,
  Coins,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Swords,
  Trash2,
  ArrowUpCircle,
  Info,
  Volume2,
  VolumeX,
  Layers,
} from "lucide-react";
import { GameEngine } from "@/lib/game/engine";
import {
  BASE_WAVES,
  BUFFS,
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  ENEMIES,
  MATCHUP,
  MAX_TIER,
  TOTAL_LEVELS,
  TOWERS,
  WAVES_PER_LEVEL,
  upgradeCost,
} from "@/lib/game/config";
import type {
  Element,
  GameSnapshot,
  GameSpeed,
  TargetMode,
  TowerKind,
  WavePreview,
} from "@/lib/game/types";
import { TARGET_MODE_LABEL } from "@/lib/game/types";

const TOWER_ORDER: TowerKind[] = ["ember", "frost", "volt", "iron"];
const SPEED_OPTIONS: GameSpeed[] = [1, 2, 3];

function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(true);

  const ensure = () => {
    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  };

  const beep = useCallback(
    (freq: number, dur = 0.06, type: OscillatorType = "square", gain = 0.04) => {
      if (!enabledRef.current) return;
      try {
        const ctx = ensure();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.value = gain;
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + dur);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return {
    beep,
    setEnabled: (v: boolean) => {
      enabledRef.current = v;
    },
    unlock: () => {
      try {
        ensure();
      } catch {
        /* ignore */
      }
    },
  };
}

export function TowerDefense() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) engineRef.current = new GameEngine();
  const engine = engineRef.current;

  const [snap, setSnap] = useState<GameSnapshot>(() => engine.snapshot());
  const [showHelp, setShowHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const audio = useAudio();
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const sizeRef = useRef({ w: 880, h: 560 });

  const pushSnap = useCallback(() => {
    setSnap(engine.snapshot());
  }, [engine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = (t: number) => {
      if (!lastRef.current) lastRef.current = t;
      let dt = (t - lastRef.current) / 1000;
      lastRef.current = t;
      if (dt > 0.1) dt = 0.1;

      if (engine.phase === "playing" || engine.phase === "levelclear") {
        const speed = engine.gameSpeed || 1;
        engine.update(dt * speed);
      }

      const { w, h } = sizeRef.current;
      engine.render(ctx, w, h);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const snapTimer = window.setInterval(() => {
      if (engine.phase !== "menu") pushSnap();
    }, 120);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(snapTimer);
    };
  }, [engine, pushSnap]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(280, Math.floor(rect.height));
      sizeRef.current = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const c = canvas.getContext("2d");
      if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    audio.setEnabled(!muted);
  }, [muted, audio]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (engine.phase === "menu") return;
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (engine.phase === "levelclear") {
          engine.continueAfterLevelClear();
          audio.beep(400, 0.08, "triangle", 0.05);
          pushSnap();
        } else if (!engine.waveActive && engine.phase === "playing") {
          engine.startWave();
          audio.beep(280, 0.1, "triangle", 0.05);
          pushSnap();
        }
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        engine.togglePause();
        pushSnap();
      } else if (e.key === "1") {
        engine.setPlacement("ember");
        pushSnap();
      } else if (e.key === "2") {
        engine.setPlacement("frost");
        pushSnap();
      } else if (e.key === "3") {
        engine.setPlacement("volt");
        pushSnap();
      } else if (e.key === "4") {
        engine.setPlacement("iron");
        pushSnap();
      } else if (e.key === "u" || e.key === "U") {
        engine.upgradeSelected();
        pushSnap();
      } else if (e.key === "x" || e.key === "X") {
        engine.sellSelected();
        pushSnap();
      } else if (e.key === "f" || e.key === "F") {
        engine.cycleGameSpeed();
        pushSnap();
      } else if (e.key === "t" || e.key === "T") {
        engine.cycleSelectedTargetMode();
        pushSnap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, audio, pushSnap]);

  const selected = useMemo(() => {
    if (snap.selectedTowerId == null) return null;
    return engine.getSelectedTower();
  }, [snap.selectedTowerId, engine, snap.gold, snap.wave, snap.score, snap.level]);

  const startGame = () => {
    audio.unlock();
    engine.reset();
    audio.beep(440, 0.08, "triangle", 0.05);
    pushSnap();
  };

  const onPointer = (e: React.PointerEvent) => {
    if (engine.phase !== "playing" && engine.phase !== "paused") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { w, h } = sizeRef.current;
    const cell = engine.screenToCell(e.clientX, e.clientY, rect, w, h);
    if (!cell) return;

    if (e.type === "pointermove") {
      engine.setHover(cell.col, cell.row);
      return;
    }
    if (e.type === "pointerdown") {
      if (engine.placement) {
        const ok = engine.tryPlace(cell.col, cell.row);
        if (ok) audio.beep(520, 0.07, "square", 0.04);
        else audio.beep(160, 0.08, "sawtooth", 0.03);
      } else {
        engine.selectAt(cell.col, cell.row);
        audio.beep(320, 0.04, "triangle", 0.03);
      }
      pushSnap();
    }
  };

  const pickTower = (kind: TowerKind) => {
    if (engine.phase !== "playing") return;
    if (engine.placement === kind) engine.setPlacement(null);
    else engine.setPlacement(kind);
    audio.beep(380, 0.05);
    pushSnap();
  };

  const startWave = () => {
    engine.startWave();
    audio.beep(280, 0.1, "triangle", 0.05);
    setTimeout(() => audio.beep(360, 0.1, "triangle", 0.05), 80);
    pushSnap();
  };

  const upgrade = () => {
    if (engine.upgradeSelected()) audio.beep(600, 0.08, "square", 0.04);
    else audio.beep(140, 0.06);
    pushSnap();
  };

  const sell = () => {
    if (engine.sellSelected()) audio.beep(220, 0.08);
    pushSnap();
  };

  const togglePause = () => {
    engine.togglePause();
    pushSnap();
  };

  const continueLevel = () => {
    engine.continueAfterLevelClear();
    audio.beep(480, 0.1, "triangle", 0.05);
    pushSnap();
  };

  const setSpeed = (speed: GameSpeed) => {
    engine.setGameSpeed(speed);
    audio.beep(300 + speed * 60, 0.04, "triangle", 0.03);
    pushSnap();
  };

  const cycleTargetMode = () => {
    engine.cycleSelectedTargetMode();
    audio.beep(360, 0.04, "triangle", 0.03);
    pushSnap();
  };

  const upCost = selected ? upgradeCost(selected.kind, selected.tier) : null;
  const waveDisplay =
    snap.wave >= snap.totalWaves ? snap.totalWaves : snap.wave + 1;
  const gameSpeed: GameSpeed = snap.gameSpeed ?? engine.gameSpeed ?? 1;
  const nextPreview: WavePreview | null = snap.nextWavePreview ?? null;
  const selectedTargetMode: TargetMode = selected?.targetMode ?? "first";

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-bg pt-[var(--grok-banner-h,0px)] text-fg">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5 sm:gap-4 sm:px-4 sm:py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
            Aether Bastion
          </h1>
          <p className="hidden text-xs text-fg-muted sm:block">
            10 levels · wild paths · towers stay forever
          </p>
        </div>

        {snap.phase !== "menu" && (
          <div className="flex items-center gap-1 sm:gap-2">
            <StatChip
              icon={<Layers className="size-3.5" />}
              label={`${snap.level}/${snap.totalLevels}`}
            />
            <StatChip icon={<Coins className="size-3.5" />} label={`${snap.gold}`} tone="warn" />
            <StatChip icon={<Heart className="size-3.5" />} label={`${snap.lives}`} tone="danger" />
            <StatChip
              icon={<Swords className="size-3.5" />}
              label={`W${waveDisplay}/${snap.totalWaves}`}
            />
            <div className="hidden sm:block">
              <StatChip icon={<Crosshair className="size-3.5" />} label={`${snap.score}`} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-1">
          {snap.phase !== "menu" && (
            <div
              className="mr-0.5 flex items-center rounded-[var(--radius-sm)] border border-border bg-bg-subtle p-0.5"
              role="group"
              aria-label="Game speed"
            >
              {SPEED_OPTIONS.map((s) => {
                const active = gameSpeed === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-label={`Game speed ${s}×`}
                    aria-pressed={active}
                    title={`Speed ${s}× (F to cycle)`}
                    onClick={() => setSpeed(s)}
                    className={[
                      "min-h-8 min-w-8 rounded-[calc(var(--radius-sm)-2px)] px-1.5 font-mono text-[11px] font-semibold tabular-nums transition sm:min-h-7 sm:min-w-7",
                      active
                        ? "bg-accent text-accent-fg"
                        : "text-fg-muted hover:bg-bg hover:text-fg",
                    ].join(" ")}
                  >
                    {s}×
                  </button>
                );
              })}
            </div>
          )}
          <IconBtn label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </IconBtn>
          <IconBtn label="Matchups" onClick={() => setShowHelp((v) => !v)}>
            <Info className="size-4" />
          </IconBtn>
          {snap.phase === "playing" || snap.phase === "paused" ? (
            <IconBtn
              label={snap.phase === "paused" ? "Resume" : "Pause"}
              onClick={togglePause}
            >
              {snap.phase === "paused" ? (
                <Play className="size-4" />
              ) : (
                <Pause className="size-4" />
              )}
            </IconBtn>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={wrapRef}
          className="relative min-h-0 flex-1 touch-none bg-bg"
          style={{ touchAction: "none" }}
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full"
            onPointerDown={onPointer}
            onPointerMove={onPointer}
          />

          {snap.message && snap.phase !== "menu" && (
            <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-2 sm:top-3 sm:px-3">
              <div className="rounded-[var(--radius-md)] border border-border bg-bg-elevated/95 px-3 py-1.5 text-center text-[11px] font-medium text-fg shadow-lg sm:text-sm">
                {snap.message}
              </div>
            </div>
          )}

          {snap.phase === "menu" && (
            <Overlay>
              <div className="mx-auto max-h-[90dvh] max-w-md overflow-y-auto px-4 py-6 text-center">
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-fg-subtle">
                  Tower Defense
                </p>
                <h2 className="mb-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                  Aether Bastion
                </h2>
                <p className="mb-6 text-sm leading-relaxed text-fg-muted">
                  Survive <strong className="font-medium text-fg">{TOTAL_LEVELS} levels</strong> of{" "}
                  {WAVES_PER_LEVEL} waves each. Every level spawns a{" "}
                  <strong className="font-medium text-fg">wild randomized path</strong>. Towers you place are permanent
                  forever. Enemies scale hard. Exploit matchups and stack tiers.
                </p>
                <button
                  type="button"
                  onClick={startGame}
                  className="inline-flex h-11 min-w-[180px] items-center justify-center rounded-[var(--radius-md)] bg-accent px-6 text-sm font-semibold text-accent-fg transition hover:opacity-90 active:scale-[0.98]"
                >
                  Begin Siege
                </button>
                <div className="mt-6 grid grid-cols-2 gap-2 text-left sm:mt-8 sm:grid-cols-4">
                  {TOWER_ORDER.map((k) => (
                    <div
                      key={k}
                      className="rounded-[var(--radius-sm)] border border-border bg-bg-subtle/80 p-2"
                    >
                      <div
                        className="mb-1 text-xs font-semibold"
                        style={{ color: ELEMENT_COLOR[k] }}
                      >
                        {ELEMENT_LABEL[k]}
                      </div>
                      <p className="text-[10px] leading-snug text-fg-subtle">
                        {TOWERS[k].description}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] text-fg-subtle">
                  Keys: 1–4 build · Space wave · U upgrade · X sell · F speed · T target · Esc
                  pause
                </p>
              </div>
            </Overlay>
          )}

          {snap.phase === "levelclear" && (
            <Overlay dim>
              <div className="mx-auto max-w-sm px-4 text-center">
                <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-fg-subtle">
                  Level complete
                </p>
                <h2 className="mb-2 text-2xl font-semibold tracking-tight">
                  Level {snap.level} Cleared
                </h2>
                <p className="mb-1 text-sm text-fg-muted">
                  Score <span className="font-mono text-fg">{snap.score}</span>
                </p>
                <p className="mb-6 text-sm text-fg-muted">
                  Next: Level {Math.min(snap.level + 1, snap.totalLevels)} — new path, harder
                  enemies, towers stay locked
                </p>
                <button
                  type="button"
                  onClick={continueLevel}
                  className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-6 text-sm font-semibold text-accent-fg transition hover:opacity-90 active:scale-[0.98]"
                >
                  Continue to Level {Math.min(snap.level + 1, snap.totalLevels)}
                </button>
              </div>
            </Overlay>
          )}

          {(snap.phase === "won" || snap.phase === "lost") && (
            <Overlay>
              <div className="mx-auto max-w-sm px-4 text-center">
                <h2 className="mb-2 text-2xl font-semibold tracking-tight">
                  {snap.phase === "won" ? "All Levels Cleared" : "Base Fallen"}
                </h2>
                <p className="mb-1 text-sm text-fg-muted">
                  Score <span className="font-mono text-fg">{snap.score}</span>
                </p>
                <p className="mb-6 text-sm text-fg-muted">
                  Level {snap.level} / {snap.totalLevels} · Wave{" "}
                  {Math.min(snap.wave, snap.totalWaves)} / {snap.totalWaves}
                </p>
                <button
                  type="button"
                  onClick={startGame}
                  className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-6 text-sm font-semibold text-accent-fg transition hover:opacity-90 active:scale-[0.98]"
                >
                  <RotateCcw className="size-4" />
                  Play Again
                </button>
              </div>
            </Overlay>
          )}

          {snap.phase === "paused" && (
            <Overlay dim>
              <div className="text-center">
                <p className="mb-4 text-lg font-semibold">Paused</p>
                <button
                  type="button"
                  onClick={togglePause}
                  className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-bg-elevated px-5 text-sm font-medium transition hover:bg-bg-subtle"
                >
                  <Play className="size-4" />
                  Resume
                </button>
              </div>
            </Overlay>
          )}

          {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
        </div>

        {snap.phase !== "menu" && (
          <aside className="flex shrink-0 flex-col gap-1.5 border-t border-border bg-bg-elevated p-2 sm:gap-2 sm:p-3 lg:w-[300px] lg:border-t-0 lg:border-l">
            <div className="flex items-center gap-2">
              {snap.phase === "levelclear" ? (
                <button
                  type="button"
                  onClick={continueLevel}
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-accent text-sm font-semibold text-accent-fg transition hover:opacity-90 active:scale-[0.98]"
                >
                  Next Level
                </button>
              ) : (
                <button
                  type="button"
                  disabled={
                    snap.waveActive ||
                    snap.phase !== "playing" ||
                    snap.wave >= snap.totalWaves
                  }
                  onClick={startWave}
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-accent text-sm font-semibold text-accent-fg transition hover:opacity-90 disabled:opacity-40 active:scale-[0.98]"
                >
                  {snap.waveActive
                    ? `L${snap.level} W${snap.wave + 1} — ${snap.enemiesRemaining} left`
                    : snap.wave >= snap.totalWaves
                      ? "Level clear"
                      : `Start Wave ${snap.wave + 1}`}
                </button>
              )}
            </div>
            {snap.phase === "playing" && snap.wave < snap.totalWaves && !snap.waveActive && (
              nextPreview ? (
                <WavePreviewPanel preview={nextPreview} />
              ) : (
                <p className="px-0.5 text-[11px] text-fg-subtle">
                  Level {snap.level}/{snap.totalLevels}
                  {snap.nextWaveName ? ` · Next: ${snap.nextWaveName}` : ""}
                </p>
              )
            )}

            <div>
              <p className="mb-1 hidden text-[11px] font-medium uppercase tracking-wider text-fg-subtle sm:block">
                Build towers
              </p>
              <div className="grid grid-cols-4 gap-1 sm:gap-1.5 lg:grid-cols-2">
                {TOWER_ORDER.map((kind) => {
                  const def = TOWERS[kind];
                  const cost = def.tiers[0]!.cost;
                  const active = snap.placement === kind;
                  const canAfford = snap.gold >= cost;
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-label={`Build ${def.name} for ${cost} gold`}
                      disabled={snap.phase !== "playing"}
                      onClick={() => pickTower(kind)}
                      className={[
                        "flex min-h-11 flex-col items-start justify-center rounded-[var(--radius-sm)] border px-2 py-1.5 text-left transition sm:py-2",
                        active
                          ? "border-fg bg-bg-subtle"
                          : "border-border bg-bg hover:border-border-strong",
                        !canAfford ? "opacity-50" : "",
                      ].join(" ")}
                    >
                      <span className="text-xs font-semibold" style={{ color: def.color }}>
                        {def.short}
                      </span>
                      <span className="font-mono text-[11px] text-fg-muted">{cost}g</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[var(--radius-md)] border border-border bg-bg p-2 sm:p-3">
              {selected ? (
                <>
                  <div className="mb-1.5 flex items-start justify-between gap-2 sm:mb-2">
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-semibold"
                        style={{ color: TOWERS[selected.kind].color }}
                      >
                        {TOWERS[selected.kind].name}
                      </p>
                      <p className="text-xs text-fg-muted">
                        Tier {selected.tier}/{MAX_TIER} · {selected.kills} kills ·{" "}
                        {TARGET_MODE_LABEL[selectedTargetMode]}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        background: TOWERS[selected.kind].color + "22",
                        color: TOWERS[selected.kind].color,
                      }}
                    >
                      L{selected.tier}
                    </span>
                  </div>
                  <div className="hidden sm:block">
                    <TierBars kind={selected.kind} tier={selected.tier} />
                    <p className="mt-2 text-[11px] leading-snug text-fg-subtle">
                      {TOWERS[selected.kind].description}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Cycle targeting mode, currently ${TARGET_MODE_LABEL[selectedTargetMode]}`}
                    disabled={snap.phase !== "playing" && snap.phase !== "paused"}
                    onClick={cycleTargetMode}
                    className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-bg-subtle text-xs font-medium transition hover:bg-bg-elevated disabled:opacity-40 sm:mt-2.5"
                  >
                    <Crosshair className="size-3.5 text-fg-muted" />
                    Target: {TARGET_MODE_LABEL[selectedTargetMode]}
                    <span className="ml-0.5 text-[10px] text-fg-subtle">(T)</span>
                  </button>
                  <div className="mt-2 flex gap-2 sm:mt-2.5">
                    <button
                      type="button"
                      disabled={
                        upCost == null ||
                        snap.gold < (upCost ?? 0) ||
                        snap.phase !== "playing"
                      }
                      onClick={upgrade}
                      className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-bg-subtle text-xs font-medium transition hover:bg-bg-elevated disabled:opacity-40"
                    >
                      <ArrowUpCircle className="size-3.5" />
                      {upCost == null ? "Max" : `Up ${upCost}g`}
                    </button>
                    <button
                      type="button"
                      disabled={snap.phase !== "playing"}
                      onClick={sell}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border px-3 text-xs font-medium text-fg-muted transition hover:border-danger hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" />
                      Sell
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 py-1 sm:flex-col sm:py-2 sm:text-center">
                  <Shield className="size-4 shrink-0 text-fg-subtle sm:mx-auto sm:mb-1 sm:size-5" />
                  <p className="text-[11px] text-fg-muted sm:text-xs">
                    {snap.placement
                      ? "Tap a buildable tile to place"
                      : "Pick a tower type, then tap the map"}
                  </p>
                </div>
              )}
            </div>

            <div className="hidden rounded-[var(--radius-md)] border border-border bg-bg p-3 lg:block">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                Element matchups
              </p>
              <MatchupGrid compact />
              <div className="mt-2 space-y-1 text-[10px] text-fg-subtle">
                <p>
                  <span className="inline-block size-2 rounded-full bg-success align-middle" />{" "}
                  Green aura = strength buff
                </p>
                <p>
                  <span className="inline-block size-2 rounded-full bg-danger align-middle" />{" "}
                  Red dashed = weakness
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function StatChip({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "warn" | "danger";
}) {
  const color =
    tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-fg-muted";
  return (
    <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-bg-subtle px-1.5 py-1 sm:px-2">
      <span className={color}>{icon}</span>
      <span className="font-mono text-xs font-medium tabular-nums text-fg sm:text-sm">
        {label}
      </span>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-bg-subtle text-fg-muted transition hover:border-border-strong hover:text-fg"
    >
      {children}
    </button>
  );
}

function Overlay({
  children,
  dim,
}: {
  children: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <div
      className={[
        "absolute inset-0 z-10 flex items-center justify-center",
        dim ? "bg-bg/70 backdrop-blur-[2px]" : "bg-bg/90 backdrop-blur-sm",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function TierBars({ kind, tier }: { kind: Element; tier: number }) {
  const stats = TOWERS[kind].tiers[tier - 1]!;
  const max = TOWERS[kind].tiers[MAX_TIER - 1]!;
  const rows = [
    { label: "DMG", v: stats.damage, m: max.damage },
    { label: "RNG", v: stats.range, m: max.range },
    { label: "ROF", v: stats.fireRate, m: max.fireRate },
  ];
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-7 font-mono text-[10px] text-fg-subtle">{r.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-subtle">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (r.v / r.m) * 100)}%`,
                background: TOWERS[kind].color,
              }}
            />
          </div>
          <span className="w-8 text-right font-mono text-[10px] text-fg-muted">
            {typeof r.v === "number" && r.v < 10 ? r.v.toFixed(1) : Math.round(r.v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MatchupGrid({ compact }: { compact?: boolean }) {
  const elements: Element[] = ["ember", "frost", "volt", "iron"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="p-0.5 text-left font-medium text-fg-subtle">Atk\Arm</th>
            {elements.map((e) => (
              <th
                key={e}
                className="p-0.5 font-semibold"
                style={{ color: ELEMENT_COLOR[e] }}
              >
                {compact ? e.slice(0, 1).toUpperCase() : ELEMENT_LABEL[e].slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {elements.map((atk) => (
            <tr key={atk}>
              <td className="p-0.5 font-semibold" style={{ color: ELEMENT_COLOR[atk] }}>
                {compact ? atk.slice(0, 1).toUpperCase() : ELEMENT_LABEL[atk].slice(0, 3)}
              </td>
              {elements.map((arm) => {
                const m = MATCHUP[atk][arm];
                const strong = m >= 1.4;
                const weak = m <= 0.6;
                return (
                  <td
                    key={arm}
                    className={[
                      "p-0.5 text-center font-mono",
                      strong ? "text-success" : weak ? "text-danger" : "text-fg-subtle",
                    ].join(" ")}
                  >
                    {m.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WavePreviewPanel({ preview }: { preview: WavePreview }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-bg px-2 py-1.5 sm:px-2.5 sm:py-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-semibold text-fg sm:text-xs">
          Wave {preview.waveNumber}: {preview.name}
        </p>
        {preview.bonusGold > 0 && (
          <span className="shrink-0 font-mono text-[10px] text-warn">+{preview.bonusGold}g</span>
        )}
      </div>
      <ul className="space-y-0.5">
        {preview.spawns.map((s, i) => (
          <li
            key={`${s.kind}-${i}`}
            className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-tight text-fg-muted sm:text-[11px]"
          >
            <span className="font-mono tabular-nums text-fg">{s.count}×</span>
            <span className="text-fg">{s.name}</span>
            <span style={{ color: ELEMENT_COLOR[s.armor] }}>{ELEMENT_LABEL[s.armor]}</span>
            {s.isBoss && (
              <span className="rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-danger ring-1 ring-danger/40">
                Boss
              </span>
            )}
            {s.buff && (
              <span
                className={
                  BUFFS[s.buff].polarity === "strength" ? "text-success" : "text-danger"
                }
              >
                {BUFFS[s.buff].name}
              </span>
            )}
          </li>
        ))}
      </ul>
      {preview.totalEnemies > 0 && (
        <p className="mt-1 text-[10px] text-fg-subtle">{preview.totalEnemies} enemies</p>
      )}
    </div>
  );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-bg/80 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-bg-elevated p-4 shadow-2xl sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">How to play</h3>
            <p className="text-xs text-fg-muted">Levels, maps, strengths & weaknesses</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-[var(--radius-sm)] border border-border px-3 py-1 text-xs text-fg-muted hover:text-fg"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 text-sm text-fg-muted">
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Levels
            </h4>
            <p className="text-xs leading-relaxed">
              {TOTAL_LEVELS} levels × {WAVES_PER_LEVEL} waves. Clear all waves to unlock the next
              level. Each new level generates a <strong className="text-fg">fresh random path</strong>
              . <strong className="text-fg">Towers never move</strong> — the path winds around them.
              Spawn and base can jump edges. Enemies scale hard — Level 10 is brutal.
            </p>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Controls
            </h4>
            <ul className="space-y-1 text-xs leading-relaxed">
              <li>
                <strong className="text-fg">F</strong> — cycle game speed (1× / 2× / 3×). Buttons
                also sit in the header.
              </li>
              <li>
                <strong className="text-fg">T</strong> — cycle targeting on the selected tower:
                First, Strong, Close, Last.
              </li>
              <li>
                Between waves, a <strong className="text-fg">wave preview</strong> lists enemy
                counts, armor, bosses, and spawn buffs.
              </li>
            </ul>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Element matchups
            </h4>
            <MatchupGrid />
            <p className="mt-2 text-[11px] leading-relaxed">
              Ember melts Frost · Frost freezes Volt · Volt shocks Ember & Iron · Iron
              is steady but poor vs Iron armor.
            </p>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Tower debuffs
            </h4>
            <p className="text-xs leading-relaxed">
              Higher-tier towers can apply <strong className="text-danger">Frail</strong> and{" "}
              <strong className="text-danger">Exposed</strong> on hit (and Volt on chain hops).
              Stack these with element matchups for big damage.
            </p>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Attacker buffs
            </h4>
            <ul className="space-y-1.5 text-xs">
              {Object.values(BUFFS).map((b) => (
                <li key={b.id} className="flex gap-2">
                  <span
                    className={
                      b.polarity === "strength"
                        ? "font-medium text-success"
                        : "font-medium text-danger"
                    }
                  >
                    {b.name}
                  </span>
                  <span className="text-fg-subtle">{b.description}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Wave templates
            </h4>
            <p className="text-[11px] text-fg-subtle">
              Each level reuses {BASE_WAVES.length} wave scripts scaled up:{" "}
              {BASE_WAVES.map((w) => w.name).join(", ")}.
            </p>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Enemy roster
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.values(ENEMIES).map((e) => (
                <div
                  key={e.kind}
                  className="rounded-[var(--radius-sm)] border border-border bg-bg px-2 py-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-fg">{e.name}</span>
                    <span
                      className="text-[10px]"
                      style={{ color: ELEMENT_COLOR[e.armor] }}
                    >
                      {ELEMENT_LABEL[e.armor]}
                    </span>
                  </div>
                  <p className="text-[10px] text-fg-subtle">
                    {e.innateStrength.length
                      ? `Buff: ${e.innateStrength.map((id) => BUFFS[id].name).join(", ")}`
                      : "No strength buff"}
                    {" · "}
                    {e.innateWeakness.length
                      ? `Weak to: ${e.innateWeakness.map((id) => BUFFS[id].name).join(", ")}`
                      : "No weakness"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
