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
  ArrowUpCircle,
  Info,
  Volume2,
  VolumeX,
  Layers,
  Film,
} from "lucide-react";
import { GameEngine } from "@/lib/game/engine";
import {
  BUFFS,
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  ENEMIES,
  KEEP_DOOR_MAX_TIER,
  LEVEL_SCRIPTS,
  MATCHUP,
  MAX_TIER,
  MATCHUP_MANTRA,
  TOTAL_LEVELS,
  TOWERS,
  WAVES_PER_LEVEL,
  keepDoorUpgradeCost,
  keepFortifyCost,
  wellIncome,
  KEEP_FORTIFY_LIVES,
  KEEP_DOOR_GUN_COST,
  KEEP_WELL_COST,
  MAX_KEEP_FORTIFY,
  levelScript,
  midShiftAfterWave,
  upgradeCost,
} from "@/lib/game/config";
import type {
  Element,
  GameSnapshot,
  GameSpeed,
  TargetMode,
  TowerKind,
  TowerRole,
  WavePreview,
} from "@/lib/game/types";
import { TARGET_MODE_LABEL } from "@/lib/game/types";
import { preloadSprites } from "@/lib/game/sprites";
import { clearSavedRun, loadSavedRun, writeSavedRun } from "@/lib/game/persist";

const TOWER_ORDER: TowerKind[] = ["ember", "frost", "volt", "iron"];
const SPEED_OPTIONS: GameSpeed[] = [1, 2, 3];
const ROLE_LABEL: Record<TowerRole, string> = {
  battery: "Battery",
  watch: "Watch",
  well: "Well",
  beacon: "Beacon",
};
const KEEP_SHOP_BTN =
  "flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-bg-subtle px-2 text-xs font-medium transition hover:bg-bg-elevated disabled:opacity-40";

/** X/C cycle: inland battery → watch → well → beacon → watch. Covering watch/well/beacon → battery. */
function convertRoleForKey(t: { role: TowerRole; covering: boolean }): TowerRole {
  if (t.covering) {
    if (t.role === "watch" || t.role === "well" || t.role === "beacon") return "battery";
    return "watch";
  }
  switch (t.role) {
    case "battery":
      return "watch";
    case "watch":
      return "well";
    case "well":
      return "beacon";
    case "beacon":
      return "watch";
    default: {
      const _never: never = t.role;
      return _never;
    }
  }
}

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
    (freq: number, dur = 0.06, type: OscillatorType = "square", gain = 0.04, endFreq?: number) => {
      if (!enabledRef.current) return;
      try {
        const ctx = ensure();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const now = ctx.currentTime;
        o.type = type;
        o.frequency.setValueAtTime(freq, now);
        if (endFreq != null && endFreq > 0) {
          o.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
        }
        g.gain.value = gain;
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        o.stop(now + dur);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const stinger = useCallback(() => {
    beep(262, 0.12, "triangle", 0.045);
    setTimeout(() => beep(330, 0.12, "triangle", 0.042), 110);
    setTimeout(() => beep(415, 0.18, "triangle", 0.04), 220);
  }, [beep]);

  const combat = useCallback((name: string) => {
    if (!enabledRef.current) return;
    const sep = name.indexOf(":");
    const base = sep === -1 ? name : name.slice(0, sep);
    const elem = sep === -1 ? "" : name.slice(sep + 1);
    switch (base) {
      case "fire":
        switch (elem) {
          case "ember":
            beep(490, 0.05, "sawtooth", 0.022);
            break;
          case "frost":
            beep(560, 0.08, "triangle", 0.02, 240);
            break;
          case "volt":
            beep(980, 0.028, "square", 0.016);
            break;
          case "iron":
            beep(78, 0.09, "sine", 0.05);
            break;
          default:
            beep(620, 0.035, "square", 0.018);
            break;
        }
        break;
      case "hit":
        switch (elem) {
          case "ember":
            beep(210, 0.055, "sawtooth", 0.032);
            break;
          case "frost":
            beep(380, 0.09, "triangle", 0.028, 150);
            break;
          case "volt":
            beep(760, 0.032, "square", 0.024);
            break;
          case "iron":
            beep(64, 0.11, "sine", 0.052);
            break;
          default:
            beep(240, 0.04, "triangle", 0.03);
            break;
        }
        break;
      case "shred":
        beep(180, 0.05, "sawtooth", 0.028);
        break;
      case "kill":
        beep(520, 0.05, "triangle", 0.035);
        setTimeout(() => beep(380, 0.06, "triangle", 0.03), 40);
        break;
      case "bossKill":
        beep(160, 0.12, "sawtooth", 0.04);
        setTimeout(() => beep(420, 0.1, "triangle", 0.04), 80);
        break;
      case "leak":
        beep(110, 0.14, "sawtooth", 0.045);
        break;
      case "wave":
        beep(360, 0.07, "triangle", 0.04);
        break;
      case "clear":
      case "shift":
        stinger();
        break;
      case "win":
        beep(440, 0.1, "triangle", 0.05);
        setTimeout(() => beep(554, 0.12, "triangle", 0.05), 100);
        break;
      case "place":
        beep(520, 0.06, "square", 0.03);
        break;
      default:
        break;
    }
  }, [beep, stinger]);

  return {
    beep,
    combat,
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
  const [hasSave, setHasSave] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const audio = useAudio();
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const sizeRef = useRef({ w: 880, h: 560 });

  const persistNow = useCallback(() => {
    if (engine.phase === "won" || engine.phase === "lost" || engine.phase === "menu") {
      clearSavedRun();
      setHasSave(false);
      return;
    }
    const run = engine.exportRun();
    if (!run) return;
    writeSavedRun(run);
    setHasSave(true);
  }, [engine]);

  const pushSnap = useCallback(() => {
    setSnap(engine.snapshot());
  }, [engine]);

  const toggleFpv = useCallback(() => {
    const on = engine.toggleFpv();
    audio.beep(on ? 480 : 260, 0.07, "triangle", 0.04);
    pushSnap();
  }, [engine, audio, pushSnap]);

  useEffect(() => {
    setHasSave(loadSavedRun() !== null);
  }, []);

  useEffect(() => {
    if (snap.phase === "won" || snap.phase === "lost") {
      clearSavedRun();
      setHasSave(false);
    }
  }, [snap.phase]);

  useEffect(() => {
    const persistIfHidden = () => {
      if (document.visibilityState === "hidden") persistNow();
    };
    const persistOnUnload = () => persistNow();
    document.addEventListener("visibilitychange", persistIfHidden);
    window.addEventListener("beforeunload", persistOnUnload);
    return () => {
      document.removeEventListener("visibilitychange", persistIfHidden);
      window.removeEventListener("beforeunload", persistOnUnload);
    };
  }, [persistNow]);

  useEffect(() => {
    preloadSprites();
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
        for (const name of engine.consumeSfx()) audioRef.current.combat(name);
      }

      const { w, h } = sizeRef.current;
      engine.render(ctx, w, h);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const snapTimer = window.setInterval(() => {
      if (engine.phase === "menu") return;
      pushSnap();
      if (!engine.waveActive) persistNow();
    }, 120);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(snapTimer);
    };
  }, [engine, persistNow, pushSnap]);

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
          persistNow();
          pushSnap();
        } else if (!engine.waveActive && engine.phase === "playing") {
          engine.startWave();
          audio.beep(280, 0.1, "triangle", 0.05);
          persistNow();
          pushSnap();
        }
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        if (e.key === "Escape" && engine.fpv) {
          engine.setFpv(false);
          pushSnap();
          return;
        }
        engine.togglePause();
        persistNow();
        pushSnap();
      } else if (e.key === "v" || e.key === "V") {
        toggleFpv();
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        if (engine.fpv) {
          engine.lookFpv(-18, 0);
          e.preventDefault();
        }
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        if (engine.fpv) {
          engine.lookFpv(18, 0);
          e.preventDefault();
        }
      } else if (e.key === "ArrowUp") {
        if (engine.fpv) {
          engine.lookFpv(0, -14);
          e.preventDefault();
        }
      } else if (e.key === "ArrowDown") {
        if (engine.fpv) {
          engine.lookFpv(0, 14);
          e.preventDefault();
        }
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
        persistNow();
        pushSnap();
      } else if (e.key === "x" || e.key === "X" || e.key === "c" || e.key === "C") {
        const t = engine.getSelectedTower();
        if (t) {
          const role = convertRoleForKey(t);
          engine.convertSelected(role);
          if (role === "well" || role === "beacon") engine.setFpv(false);
        }
        persistNow();
        pushSnap();
      } else if (e.key === "f" || e.key === "F") {
        engine.cycleGameSpeed();
        persistNow();
        pushSnap();
      } else if (e.key === "t" || e.key === "T") {
        engine.cycleSelectedTargetMode();
        persistNow();
        pushSnap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, audio, persistNow, pushSnap, toggleFpv]);

  const selected = useMemo(() => {
    if (snap.selectedTowerId == null) return null;
    return engine.getSelectedTower();
  }, [
    snap.selectedTowerId,
    engine,
    snap.gold,
    snap.wave,
    snap.score,
    snap.level,
    snap.fpv,
    snap.message,
    snap.selectedKeep,
  ]);

  const startGame = () => {
    audio.unlock();
    clearSavedRun();
    setHasSave(false);
    engine.reset();
    audio.beep(440, 0.08, "triangle", 0.05);
    pushSnap();
  };

  const continueGame = () => {
    audio.unlock();
    const saved = loadSavedRun();
    if (!saved) return;
    if (!engine.importRun(saved)) return;
    audio.beep(400, 0.08, "triangle", 0.05);
    pushSnap();
  };

  const onPointer = (e: React.PointerEvent) => {
    if (engine.phase !== "playing" && engine.phase !== "paused") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (engine.fpv) {
      if (e.type === "pointerdown") {
        engine.fpvDragging = true;
        canvas.setPointerCapture(e.pointerId);
      } else if (e.type === "pointermove" && engine.fpvDragging) {
        engine.lookFpv(e.movementX, e.movementY);
      } else if (e.type === "pointerup" || e.type === "pointercancel") {
        engine.fpvDragging = false;
      }
      return;
    }

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
        if (ok) persistNow();
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
    persistNow();
    pushSnap();
  };

  const upgrade = () => {
    if (engine.upgradeSelected()) audio.beep(600, 0.08, "square", 0.04);
    else audio.beep(140, 0.06);
    persistNow();
    pushSnap();
  };

  const convert = (role: TowerRole) => {
    if (engine.convertSelected(role)) {
      audio.beep(600, 0.08, "square", 0.04);
      if (role === "well" || role === "beacon") engine.setFpv(false);
    } else audio.beep(140, 0.06);
    persistNow();
    pushSnap();
  };

  const fortifyKeep = () => {
    if (engine.fortifyKeep()) audio.beep(520, 0.08, "square", 0.04);
    else audio.beep(140, 0.06);
    persistNow();
    pushSnap();
  };

  const buyKeepDoorGun = () => {
    if (engine.buyKeepDoorGun()) audio.beep(520, 0.08, "square", 0.04);
    else audio.beep(140, 0.06);
    persistNow();
    pushSnap();
  };

  const upgradeKeepDoorGun = () => {
    if (engine.upgradeKeepDoorGun()) audio.beep(520, 0.08, "square", 0.04);
    else audio.beep(140, 0.06);
    persistNow();
    pushSnap();
  };

  const buyKeepWell = () => {
    if (engine.buyKeepWell()) audio.beep(520, 0.08, "square", 0.04);
    else audio.beep(140, 0.06);
    persistNow();
    pushSnap();
  };

  const togglePause = () => {
    engine.togglePause();
    persistNow();
    pushSnap();
  };

  const continueLevel = () => {
    engine.continueAfterLevelClear();
    audio.beep(480, 0.1, "triangle", 0.05);
    persistNow();
    pushSnap();
  };

  const setSpeed = (speed: GameSpeed) => {
    engine.setGameSpeed(speed);
    audio.beep(300 + speed * 60, 0.04, "triangle", 0.03);
    persistNow();
    pushSnap();
  };

  const cycleTargetMode = () => {
    engine.cycleSelectedTargetMode();
    audio.beep(360, 0.04, "triangle", 0.03);
    persistNow();
    pushSnap();
  };

  const upCost = selected ? upgradeCost(selected.kind, selected.tier) : null;
  const fortifyCost = keepFortifyCost(snap.keepFortify);
  const keepDoorGun = snap.keepDoorGun;
  const keepDoorTier = snap.keepDoorTier ?? (keepDoorGun ? 1 : 0);
  const doorUpgradeCost = keepDoorUpgradeCost(keepDoorTier);
  const keepWell = snap.keepWell;
  const levelName = snap.levelName ?? levelScript(snap.level).name;
  const midShiftAfter = snap.midShiftAfter ?? midShiftAfterWave(snap.level);
  const waveDisplay =
    snap.wave >= snap.totalWaves ? snap.totalWaves : snap.wave + 1;
  const gameSpeed: GameSpeed = snap.gameSpeed ?? engine.gameSpeed ?? 1;
  const nextPreview: WavePreview | null = snap.nextWavePreview ?? null;
  const selectedTargetMode: TargetMode = selected?.targetMode ?? "first";
  const emptyBoard =
    snap.phase === "playing" &&
    !snap.waveActive &&
    snap.wave < snap.totalWaves &&
    !snap.shiftHold &&
    engine.towers.length === 0;

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-bg pt-[var(--grok-banner-h,0px)] text-fg">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5 sm:gap-4 sm:px-4 sm:py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
            Aether Bastion
          </h1>
          <p className="hidden text-xs text-fg-muted sm:block">
            {snap.phase === "menu"
              ? "10 levels · keep holds · the front moves"
              : `L${snap.level} ${levelName}`}
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <div
          ref={wrapRef}
          className={[
            "relative min-h-0 min-w-0 flex-1 bg-bg",
            snap.phase === "playing" || snap.phase === "paused" ? "touch-none" : "",
          ].join(" ")}
          style={{
            touchAction:
              snap.phase === "playing" || snap.phase === "paused" ? "none" : "auto",
          }}
        >
          <canvas
            ref={canvasRef}
            className={["block h-full w-full", snap.fpv ? "cursor-grab active:cursor-grabbing" : ""].join(" ")}
            onPointerDown={onPointer}
            onPointerMove={onPointer}
            onPointerUp={onPointer}
            onPointerCancel={onPointer}
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
              <div className="mx-auto max-h-[90dvh] max-w-md overflow-y-auto overflow-x-hidden px-4 py-6 text-center">
                <img
                  src="/sprites/keep.png"
                  alt=""
                  width={88}
                  height={88}
                  className="mx-auto mb-2 size-20 object-contain sm:size-[88px]"
                />
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-fg-subtle">
                  Tower Defense
                </p>
                <h2 className="mb-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                  Aether Bastion
                </h2>
                <p className="mb-6 text-pretty text-sm leading-relaxed text-fg-muted">
                  Survive <strong className="font-medium text-fg">{TOTAL_LEVELS} levels</strong> of{" "}
                  {WAVES_PER_LEVEL} waves each. The{" "}
                  <strong className="font-medium text-fg">keep stays in a corner</strong>. Towers stay
                  forever. On {levelScript(1).name} the road moves after wave{" "}
                  {midShiftAfterWave(1)}; later levels shift after wave {midShiftAfterWave(2)}.
                  Convert inland towers to Watch, Well, or Beacon. Exploit matchups and stack
                  tiers.
                </p>
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startGame();
                    }}
                    className="relative z-20 inline-flex h-11 min-w-[180px] items-center justify-center rounded-[var(--radius-md)] bg-accent px-6 text-sm font-semibold text-accent-fg transition hover:opacity-90 active:scale-[0.98]"
                  >
                    Begin Siege
                  </button>
                  {hasSave ? (
                    <button
                      type="button"
                      onClick={continueGame}
                      className="inline-flex h-11 min-w-[180px] items-center justify-center rounded-[var(--radius-md)] border border-border bg-bg-elevated px-6 text-sm font-semibold text-fg transition hover:bg-bg-subtle active:scale-[0.98]"
                    >
                      Continue
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowTrailer(true)}
                    className="inline-flex h-10 min-w-[180px] items-center justify-center gap-2 rounded-[var(--radius-md)] text-sm font-medium text-fg-muted transition hover:text-fg"
                  >
                    <Film className="size-4" />
                    Watch trailer
                  </button>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-2 text-left sm:mt-8 sm:grid-cols-4">
                  {TOWER_ORDER.map((k) => (
                    <div
                      key={k}
                      className="rounded-[var(--radius-sm)] border border-border bg-bg-subtle/80 p-2"
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <img
                          src={`/sprites/${k}.png`}
                          alt=""
                          width={36}
                          height={36}
                          className="size-9 shrink-0 object-contain"
                        />
                        <span className="text-xs font-semibold" style={{ color: ELEMENT_COLOR[k] }}>
                          {ELEMENT_LABEL[k]}
                        </span>
                      </div>
                      <p className="text-[10px] leading-snug text-fg-subtle">
                        {TOWERS[k].description}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-pretty text-[11px] text-fg-subtle">
                  Keys: 1–4 build · Space wave · U upgrade · X/C convert inland (Watch / Well /
                  Beacon) · click keep to upgrade · F speed · T target · V turret cam · Esc pause
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
                  The keep stays. The front moves. A new road winds toward the same
                  bastion — towers off the line go inland and only fire if the path
                  comes back into range. A gold resupply arrives so you can reinforce
                  the new approach.
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
                  {snap.phase === "won" ? "All Levels Cleared" : "Keep Fallen"}
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
          <aside className="flex max-h-[42dvh] min-h-0 shrink-0 flex-col gap-1.5 overflow-y-auto border-t border-border bg-bg-elevated p-2 sm:gap-2 sm:p-3 lg:h-full lg:max-h-none lg:w-[300px] lg:border-t-0 lg:border-l">
            <div className={emptyBoard ? "flex flex-col gap-1.5" : "flex items-center gap-2"}>
              {emptyBoard ? (
                <p className="flex min-h-10 w-full items-center justify-center rounded-[var(--radius-sm)] bg-accent px-2 py-1.5 text-center text-sm font-semibold leading-snug text-accent-fg">
                  Tap a tower, then tap the grass beside the road.
                </p>
              ) : null}
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
                  className={
                    emptyBoard
                      ? "flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border bg-bg-elevated text-sm font-semibold text-fg transition hover:opacity-90 disabled:opacity-40 active:scale-[0.98]"
                      : "flex h-10 flex-1 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-accent text-sm font-semibold text-accent-fg transition hover:opacity-90 disabled:opacity-40 active:scale-[0.98]"
                  }
                >
                  {snap.waveActive
                    ? `L${snap.level} W${snap.wave + 1} — ${snap.enemiesRemaining} left`
                    : snap.wave >= snap.totalWaves
                      ? "Level clear"
                      : snap.shiftHold
                        ? `Start Wave ${snap.wave + 1} · new road`
                        : `Start Wave ${snap.wave + 1}`}
                </button>
              )}
            </div>
            {snap.phase === "playing" && snap.wave < snap.totalWaves && !snap.waveActive && (
              nextPreview ? (
                <>
                  {snap.shiftHold ? (
                    <p className="px-0.5 text-[11px] leading-snug text-fg-muted">
                      New road. Convert inland towers or grow the keep, then start.
                    </p>
                  ) : null}
                  <WavePreviewPanel preview={nextPreview} />
                </>
              ) : (
                <p className="px-0.5 text-[11px] text-fg-subtle">
                  Level {snap.level}/{snap.totalLevels}
                  {snap.nextWaveName ? ` · Next: ${snap.nextWaveName}` : ""}
                  {!snap.shiftHold && snap.wave < midShiftAfter
                    ? ` · road moves after wave ${midShiftAfter}`
                    : ""}
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
                  const affordOpen = emptyBoard && canAfford && !active;
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-label={`Build ${def.name} for ${cost} gold`}
                      disabled={snap.phase !== "playing"}
                      onClick={() => pickTower(kind)}
                      style={affordOpen ? { borderColor: def.color } : undefined}
                      className={[
                        "flex min-h-11 flex-col items-start justify-center rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition sm:py-2",
                        affordOpen ? "border-2" : "border",
                        active
                          ? "border-fg bg-bg-subtle"
                          : "border-border bg-bg hover:border-border-strong",
                        !canAfford ? "opacity-50" : "",
                      ].join(" ")}
                    >
                      <span className="flex items-center gap-1.5">
                        <img
                          src={`/sprites/${kind}.png`}
                          alt=""
                          width={28}
                          height={28}
                          className="size-7 shrink-0 object-contain"
                        />
                        <span className="text-xs font-semibold" style={{ color: def.color }}>
                          {def.short}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-fg-muted">{cost}g</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[var(--radius-md)] border border-border bg-bg p-2 sm:p-3">
              {snap.selectedKeep ? (
                <>
                  <div className="mb-1.5 flex items-start justify-between gap-2 sm:mb-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">The Bastion</p>
                      <p className="text-xs text-fg-muted">
                        {snap.lives} lives · Walls {snap.keepFortify}/{MAX_KEEP_FORTIFY}
                      </p>
                    </div>
                    <img
                      src="/sprites/keep.png"
                      alt=""
                      width={28}
                      height={28}
                      className="size-7 shrink-0 object-contain"
                    />
                  </div>
                  <p className="text-[11px] leading-snug text-fg-subtle">
                    The keep stays. The road moves around it.
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5 sm:mt-2.5">
                    <button
                      type="button"
                      aria-label="Thicker walls"
                      disabled={
                        fortifyCost == null ||
                        snap.gold < (fortifyCost ?? 0) ||
                        snap.phase !== "playing"
                      }
                      onClick={fortifyKeep}
                      className={KEEP_SHOP_BTN}
                    >
                      <Shield className="size-3.5 shrink-0" />
                      {fortifyCost == null
                        ? "Walls maxed"
                        : `Thicker walls ${fortifyCost}g · +${KEEP_FORTIFY_LIVES} lives`}
                    </button>
                    <button
                      type="button"
                      aria-label="Door gun"
                      disabled={
                        keepDoorGun ||
                        snap.gold < KEEP_DOOR_GUN_COST ||
                        snap.phase !== "playing"
                      }
                      onClick={buyKeepDoorGun}
                      className={KEEP_SHOP_BTN}
                    >
                      <Crosshair className="size-3.5 shrink-0" />
                      {keepDoorGun
                        ? `Door gun T${keepDoorTier}`
                        : `Door gun ${KEEP_DOOR_GUN_COST}g · shoots the last stretch`}
                    </button>
                    {keepDoorGun && keepDoorTier < KEEP_DOOR_MAX_TIER ? (
                      <button
                        type="button"
                        aria-label="Upgrade door gun"
                        disabled={
                          doorUpgradeCost == null ||
                          snap.gold < (doorUpgradeCost ?? 0) ||
                          snap.phase !== "playing"
                        }
                        onClick={upgradeKeepDoorGun}
                        className={KEEP_SHOP_BTN}
                      >
                        <ArrowUpCircle className="size-3.5 shrink-0" />
                        {doorUpgradeCost == null
                          ? `Door gun T${keepDoorTier}`
                          : `Door gun T${keepDoorTier} · upgrade ${doorUpgradeCost}g`}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Courtyard well"
                      disabled={
                        keepWell ||
                        snap.gold < KEEP_WELL_COST ||
                        snap.phase !== "playing"
                      }
                      onClick={buyKeepWell}
                      className={KEEP_SHOP_BTN}
                    >
                      <Coins className="size-3.5 shrink-0" />
                      {keepWell
                        ? "Courtyard well ready"
                        : `Courtyard well ${KEEP_WELL_COST}g · gold each wave`}
                    </button>
                  </div>
                </>
              ) : selected ? (
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
                        Tier {selected.tier}/{MAX_TIER} · {ROLE_LABEL[selected.role]}
                        {selected.role !== "well" && selected.role !== "beacon"
                          ? ` · ${selected.kills} kills · ${TARGET_MODE_LABEL[selectedTargetMode]}`
                          : ` · ${selected.kills} kills`}
                        {selected.covering === false ? " · off the new path" : ""}
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
                  {selected.covering === false ? (
                    <>
                      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:mt-2.5">
                        <button
                          type="button"
                          disabled={selected.role === "watch" || snap.phase !== "playing"}
                          title="Boss snipe, longer range"
                          onClick={() => convert("watch")}
                          className="flex h-10 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-bg-subtle text-xs font-medium transition hover:bg-bg-elevated disabled:opacity-40"
                        >
                          Watch
                        </button>
                        <button
                          type="button"
                          disabled={selected.role === "well" || snap.phase !== "playing"}
                          title={`No shots — ${wellIncome(selected.tier, snap.level)}g each wave`}
                          onClick={() => convert("well")}
                          className="flex h-10 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-bg-subtle text-xs font-medium transition hover:bg-bg-elevated disabled:opacity-40"
                        >
                          Well
                        </button>
                        <button
                          type="button"
                          disabled={selected.role === "beacon" || snap.phase !== "playing"}
                          title="No shots — pulls the next road toward it"
                          onClick={() => convert("beacon")}
                          className="flex h-10 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-bg-subtle text-xs font-medium transition hover:bg-bg-elevated disabled:opacity-40"
                        >
                          Beacon
                        </button>
                      </div>
                      <p className="mt-1.5 text-[10px] leading-snug text-fg-subtle">
                        Watch: boss snipe, longer range. Well: no shots,{" "}
                        {wellIncome(selected.tier, snap.level)}g each wave. Beacon: no shots,
                        pulls the next road.
                      </p>
                    </>
                  ) : selected.role === "watch" ||
                    selected.role === "well" ||
                    selected.role === "beacon" ? (
                    <button
                      type="button"
                      disabled={snap.phase !== "playing"}
                      onClick={() => convert("battery")}
                      className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-bg-subtle text-xs font-medium transition hover:bg-bg-elevated disabled:opacity-40 sm:mt-2.5"
                    >
                      Restore battery
                    </button>
                  ) : null}
                  {selected.role !== "well" && selected.role !== "beacon" ? (
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
                  ) : null}
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

          </aside>
        )}
      </div>

      {showTrailer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6"
          role="dialog"
          aria-label="Aether Bastion trailer"
          onClick={() => setShowTrailer(false)}
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-[var(--radius-md)] border border-border bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src="/trailer.mp4"
              poster="/trailer-poster.jpg"
              controls
              autoPlay
              playsInline
              className="aspect-video w-full bg-black"
            />
            <div className="flex items-center justify-between gap-2 border-t border-border bg-bg-elevated px-3 py-2">
              <p className="text-xs text-fg-muted">29s · 1080p · ready for X</p>
              <div className="flex items-center gap-2">
                <a
                  href="/trailer.mp4"
                  download="aether-bastion-trailer.mp4"
                  className="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-subtle"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setShowTrailer(false)}
                  className="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-bg-subtle hover:text-fg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
        "absolute inset-0 z-20 flex items-center justify-center touch-auto",
        dim ? "bg-bg/70 backdrop-blur-[2px]" : "bg-bg/90 backdrop-blur-sm",
      ].join(" ")}
      style={{ touchAction: "auto", pointerEvents: "auto" }}
      onPointerDown={(e) => e.stopPropagation()}
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
            <img
              src={`/sprites/${s.kind}.png`}
              alt=""
              width={24}
              height={24}
              className="size-6 shrink-0 object-contain"
            />
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
              {TOTAL_LEVELS} authored campaigns × {WAVES_PER_LEVEL} waves. Clear all waves to
              unlock the next level. Each new level weaves a{" "}
              <strong className="text-fg">fresh path</strong> around towers that never move.
              Spawn can jump edges; the keep stays in its corner. Enemies scale hard — Last
              Stand is brutal.
            </p>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              The front shifts
            </h4>
            <p className="text-xs leading-relaxed">
              On {levelScript(1).name} the road moves after wave {midShiftAfterWave(1)}. Later
              levels shift after wave {midShiftAfterWave(2)}. Towers stay forever — there is no
              selling. Convert inland towers to <strong className="text-fg">Watch</strong> (boss
              snipe, longer range), <strong className="text-fg">Well</strong> (gold that scales
              with the campaign level), or <strong className="text-fg">Beacon</strong> (pulls the
              next road toward it). When the road comes back, restore them to a battery.
            </p>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              The Keep
            </h4>
            <p className="text-xs leading-relaxed">
              The Bastion is the corner keep. Click it to upgrade: thicker walls, a door gun you
              can keep upgrading, or a courtyard well. The keep stays. The road always ends at
              its door.
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
                <strong className="text-fg">V</strong> — enter the selected tower’s turret cam
                (first-person). Drag to look, Esc or V to exit. Minimap stays in the corner.
              </li>
              <li>
                <strong className="text-fg">X</strong> / <strong className="text-fg">C</strong> —
                convert the selected inland tower (battery → Watch → Well → Beacon). Covering
                Watch, Well, or Beacon restore to Battery. Click the keep to upgrade.
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
            <p className="mt-2 text-[11px] leading-relaxed">{MATCHUP_MANTRA}</p>
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
              Campaign
            </h4>
            <p className="text-[11px] text-fg-subtle">
              Each level is an authored campaign, not the same 10 wave scripts on a scaler.{" "}
              {LEVEL_SCRIPTS.map((s) => s.name).join(", ")}. Watch snipes bosses from farther
              out. Wells pay gold that scales with the campaign level. A Beacon pulls the next
              road toward it.
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
