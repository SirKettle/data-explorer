import type { Story, StoryDefault } from "@ladle/react";
import { useMemo, useState } from "react";
import {
  createSceneSource,
  DataExplorer,
  FALLBACK_PALETTE,
  type ExplorerBackground,
  type ExplorerEdges,
  type ExplorerEffects,
  type ExplorerPalette,
  type ExplorerPresence,
  type ExplorerShape,
  type RampColours,
  type RampInterpolation,
} from "../src/index";
import { rampColor } from "../src/headless";
import { playgroundData, type DataArgs, type Focus } from "./playground-data";

/**
 * Every prop the explorer takes, on one page. The `data…` controls build a new scene source (and
 * so a new explorer); every other control reaches the running canvas as a prop change, which is
 * itself what this page tests: each should re-tint or restyle in place, with the camera left where
 * it was. Ladle lists controls alphabetically, so each group shares a prefix.
 */
export default {
  title: "Data explorer",
} satisfies StoryDefault;

interface PlaygroundArgs {
  dataGroups: number;
  dataItems: number;
  dataDepth: number;
  dataShapes: "mixed" | ExplorerShape;
  dataEdges: number;
  dataRampShare: number;
  dataColourShare: number;
  dataRingShare: number;
  dataGlowShare: number;
  dataPulseShare: number;
  dataSeed: number;

  rampStops: number;
  rampStop1: string;
  rampStop2: string;
  rampStop3: string;
  rampStop4: string;
  rampStop5: string;
  rampInterpolation: RampInterpolation;
  rampHardEdges: boolean;

  paletteBackground: string;
  paletteGrid: string;
  paletteLabel: string;
  paletteLabelStroke: string;
  paletteSelection: string;
  paletteOwnership: string;
  paletteAggregate: string;
  paletteHover: string;

  bgGradient: boolean;
  bgGradientTo: string;
  bgGradientAngle: number;
  bgGrid: boolean;
  bgGridAlpha: number;
  bgGridStep: number;
  bgGridZoom: "snap" | "continuous";

  fxGrowIn: boolean;
  fxHalo: boolean;
  fxHoverRing: boolean;
  fxSelectionRing: boolean;
  fxGlow: boolean;
  fxPulse: boolean;

  edgesVisible: boolean;
  edgesColour: string;
  edgesStrongColour: string;
  edgesWidth: number;
  edgesAlpha: number;
  edgesCurve: number;
  edgesDash: boolean;
  edgesArrow: "none" | "start" | "end" | "both";

  presenceOn: boolean;
  presenceCutoff: number;
  presenceSoftness: number;

  debugStats: boolean;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function dataArgs(args: PlaygroundArgs): DataArgs {
  return {
    groups: args.dataGroups,
    items: args.dataItems,
    depth: args.dataDepth,
    shapes: args.dataShapes,
    edges: args.dataEdges,
    rampShare: args.dataRampShare,
    colourShare: args.dataColourShare,
    ringShare: args.dataRingShare,
    glowShare: args.dataGlowShare,
    pulseShare: args.dataPulseShare,
    seed: args.dataSeed,
  };
}

function rampFrom(args: PlaygroundArgs): RampColours {
  const colours = [args.rampStop1, args.rampStop2, args.rampStop3, args.rampStop4, args.rampStop5].slice(0, Math.max(1, args.rampStops));
  if (!args.rampHardEdges || colours.length < 2) return { stops: colours, interpolation: args.rampInterpolation };
  // Each colour holds for an equal band, with a hard edge between neighbours.
  const stops = colours.flatMap((color, i) => [
    { color, at: i / colours.length },
    { color, at: (i + 1) / colours.length },
  ]);
  return { stops, interpolation: args.rampInterpolation };
}

/** The ramp as the canvas samples it, through the package's own `rampColor`. */
function RampStrip({ ramp }: { ramp: RampColours }) {
  const samples = Array.from({ length: 48 }, (_, i) => hex(rampColor(i / 47, ramp)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, font: "12px system-ui, sans-serif" }}>
      <span>ramp 0</span>
      <div style={{ display: "flex", flex: 1, height: 14, borderRadius: 4, overflow: "hidden" }}>
        {samples.map((colour, i) => (
          <div key={i} style={{ flex: 1, background: colour }} />
        ))}
      </div>
      <span>1</span>
    </div>
  );
}

export const Playground: Story<PlaygroundArgs> = (args) => {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [lastEvent, setLastEvent] = useState("—");

  // Data: a new source, and a new explorer, only when a data control changes.
  const data = dataArgs(args);
  const dataKey = JSON.stringify(data);
  const { source, rampOf } = useMemo(() => {
    const built = playgroundData(data);
    return { source: createSceneSource<Focus>({ load: built.scene, parentOf: built.parentOf }), rampOf: built.rampOf };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  // Inline objects on purpose: the explorer compares these by value.
  const ramp = rampFrom(args);
  const palette: ExplorerPalette = {
    ...FALLBACK_PALETTE,
    background: args.paletteBackground,
    grid: args.paletteGrid,
    label: args.paletteLabel,
    labelStroke: args.paletteLabelStroke,
    selection: args.paletteSelection,
    ownership: args.paletteOwnership,
    aggregate: args.paletteAggregate,
    hover: args.paletteHover,
  };
  const background: ExplorerBackground = {
    gradient: args.bgGradient ? { from: args.paletteBackground, to: args.bgGradientTo, angle: args.bgGradientAngle } : null,
    grid: args.bgGrid ? { alpha: args.bgGridAlpha, step: args.bgGridStep, zoom: args.bgGridZoom } : false,
  };
  const effects: ExplorerEffects = {
    growIn: args.fxGrowIn,
    halo: args.fxHalo,
    hoverRing: args.fxHoverRing,
    selectionRing: args.fxSelectionRing,
    glow: args.fxGlow,
    pulse: args.fxPulse,
  };
  const edges: ExplorerEdges = {
    visible: args.edgesVisible,
    style: {
      color: args.edgesColour,
      width: args.edgesWidth,
      alpha: args.edgesAlpha,
      curve: args.edgesCurve,
      dash: args.edgesDash ? [6, 4] : null,
      arrow: args.edgesArrow,
    },
    styles: { strong: { color: args.edgesStrongColour, width: args.edgesWidth * 2 } },
  };
  // Items past the cutoff on the ramp fade out; items without a ramp position stay.
  const { presenceOn, presenceCutoff: cutoff, presenceSoftness: softness } = args;
  const presence = useMemo<ExplorerPresence | undefined>(() => {
    if (!presenceOn) return undefined;
    return (id) => {
      const position = rampOf.get(id);
      if (position === undefined) return undefined;
      if (softness <= 0) return position <= cutoff ? 1 : 0;
      return Math.min(1, Math.max(0, (cutoff - position) / softness + 1));
    };
  }, [presenceOn, cutoff, softness, rampOf]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <RampStrip ramp={ramp} />
      <div style={{ font: "12px system-ui, sans-serif", display: "flex", gap: 16, alignItems: "center" }}>
        <span>focus: {focus ?? "top"}</span>
        <span>last event: {lastEvent}</span>
        {focus !== null && <button onClick={() => setFocus(null)}>Back to the top</button>}
      </div>
      <div style={{ height: "70vh", minHeight: 360, borderRadius: 8, overflow: "hidden" }}>
        <DataExplorer<Focus>
          // `stats` is read once, at mount.
          key={`${dataKey}:${args.debugStats}`}
          source={source}
          focus={focus}
          onSettle={(next) => setFocus(next)}
          onNodeActivate={(event) => setLastEvent(`activate ${event.item.id}`)}
          onNodeHover={(item) => setLastEvent(item ? `hover ${item.id}` : "hover none")}
          palette={palette}
          ramp={ramp}
          background={background}
          effects={effects}
          edges={edges}
          presence={presence}
          stats={args.debugStats}
        />
      </div>
    </div>
  );
};

const range = (min: number, max: number, step: number) => ({ control: { type: "range" as const, min, max, step } });
const share = range(0, 1, 0.05);
const colour = { control: { type: "color" as const } };

Playground.args = {
  dataGroups: 6,
  dataItems: 30,
  dataDepth: 2,
  dataShapes: "mixed",
  dataEdges: 0,
  dataRampShare: 0.85,
  dataColourShare: 0,
  dataRingShare: 0.1,
  dataGlowShare: 0.05,
  dataPulseShare: 0.03,
  dataSeed: 1,

  rampStops: 2,
  rampStop1: "#14b8a6",
  rampStop2: "#8b5cf6",
  rampStop3: "#f59e0b",
  rampStop4: "#ef4444",
  rampStop5: "#22c55e",
  rampInterpolation: "oklab",
  rampHardEdges: false,

  paletteBackground: hex(FALLBACK_PALETTE.background),
  paletteGrid: hex(FALLBACK_PALETTE.grid),
  paletteLabel: hex(FALLBACK_PALETTE.label),
  paletteLabelStroke: hex(FALLBACK_PALETTE.labelStroke),
  paletteSelection: hex(FALLBACK_PALETTE.selection),
  paletteOwnership: hex(FALLBACK_PALETTE.ownership),
  paletteAggregate: hex(FALLBACK_PALETTE.aggregate),
  paletteHover: hex(FALLBACK_PALETTE.hover),

  bgGradient: false,
  bgGradientTo: "#1e1b4b",
  bgGradientAngle: 160,
  bgGrid: true,
  bgGridAlpha: 0.22,
  bgGridStep: 160,
  bgGridZoom: "snap",

  fxGrowIn: true,
  fxHalo: true,
  fxHoverRing: true,
  fxSelectionRing: true,
  fxGlow: true,
  fxPulse: true,

  edgesVisible: false,
  edgesColour: "#8ea2c0",
  edgesStrongColour: "#f59e0b",
  edgesWidth: 1.5,
  edgesAlpha: 0.5,
  edgesCurve: 0.2,
  edgesDash: false,
  edgesArrow: "end",

  presenceOn: false,
  presenceCutoff: 1,
  presenceSoftness: 0.1,

  debugStats: false,
};

Playground.argTypes = {
  dataGroups: range(0, 24, 1),
  dataItems: range(0, 2000, 10),
  dataDepth: range(0, 4, 1),
  dataShapes: { options: ["mixed", "disc", "square", "cloud"], control: { type: "select" } },
  dataEdges: range(0, 2000, 10),
  dataRampShare: share,
  dataColourShare: share,
  dataRingShare: share,
  dataGlowShare: share,
  dataPulseShare: share,
  dataSeed: range(1, 100, 1),

  rampStops: range(1, 5, 1),
  rampStop1: colour,
  rampStop2: colour,
  rampStop3: colour,
  rampStop4: colour,
  rampStop5: colour,
  rampInterpolation: { options: ["oklab", "srgb", "hsl"], control: { type: "radio" } },

  paletteBackground: colour,
  paletteGrid: colour,
  paletteLabel: colour,
  paletteLabelStroke: colour,
  paletteSelection: colour,
  paletteOwnership: colour,
  paletteAggregate: colour,
  paletteHover: colour,

  bgGradientTo: colour,
  bgGradientAngle: range(0, 360, 5),
  bgGridAlpha: range(0, 1, 0.01),
  bgGridStep: range(20, 400, 10),
  bgGridZoom: { options: ["snap", "continuous"], control: { type: "radio" } },

  edgesColour: colour,
  edgesStrongColour: colour,
  edgesWidth: range(0.5, 8, 0.5),
  edgesAlpha: range(0, 1, 0.05),
  edgesCurve: range(0, 1, 0.05),
  edgesArrow: { options: ["none", "start", "end", "both"], control: { type: "select" } },

  presenceCutoff: range(0, 1, 0.01),
  presenceSoftness: range(0, 0.5, 0.01),
};
