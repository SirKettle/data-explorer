import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";
import { DataExplorer, type ExplorerEffects, type ExplorerLimits } from "@data-xplorer/core";
import { worldMapSource } from "../src/source";

export default {
  title: "World",
} satisfies StoryDefault;

// The app's own source, so the story and the app cannot drift apart.
const source = worldMapSource();

/**
 * Real country shapes in fixed scenes (`apps/world/`): continents at the top, each entered
 * to its countries. Things to try: zoom into a continent and watch its countries land where it was;
 * point at Lesotho, a hole in South Africa; pan sideways from one continent into the next; try to
 * pan the map away or zoom it to a speck, then turn the `limit…` controls off and try again.
 */
interface WorldMapArgs {
  background: string;
  growIn: boolean;
  hoverRing: boolean;
  selectionRing: boolean;
  limitPan: boolean;
  limitPanKeep: number;
  limitZoomOut: boolean;
  limitZoomOutTo: number;
  limitZoomIn: boolean;
  limitZoomInTo: number;
}

export const WorldMap: Story<WorldMapArgs> = (args) => {
  const [focus, setFocus] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState("—");
  const effects: ExplorerEffects = { growIn: args.growIn, hoverRing: args.hoverRing, selectionRing: args.selectionRing };
  const limits: ExplorerLimits = {
    pan: args.limitPan && args.limitPanKeep,
    zoomOut: args.limitZoomOut && args.limitZoomOutTo,
    zoomIn: args.limitZoomIn && args.limitZoomInTo,
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ font: "12px system-ui, sans-serif", display: "flex", gap: 16, alignItems: "center" }}>
        <span>focus: {focus ?? "world"}</span>
        <span>last event: {lastEvent}</span>
        {focus !== null && <button onClick={() => setFocus(null)}>Back to the world</button>}
      </div>
      <div style={{ height: "70vh", minHeight: 360, borderRadius: 8, overflow: "hidden" }}>
        <DataExplorer<string>
          source={source}
          focus={focus}
          onSettle={(next) => setFocus(next)}
          onNodeActivate={(event) => setLastEvent(`activate ${event.item.id}`)}
          onNodeHover={(item) => setLastEvent(item ? `hover ${item.id}` : "hover none")}
          background={{ color: args.background, grid: false }}
          effects={effects}
          limits={limits}
        />
      </div>
    </div>
  );
};

WorldMap.args = {
  background: "#0b1d2e",
  growIn: true,
  hoverRing: true,
  selectionRing: true,
  limitPan: true,
  limitPanKeep: 0.5,
  limitZoomOut: true,
  limitZoomOutTo: 0.5,
  limitZoomIn: true,
  limitZoomInTo: 2,
};

const range = (min: number, max: number, step: number) => ({ control: { type: "range" as const, min, max, step } });

WorldMap.argTypes = {
  background: { control: { type: "color" } },
  limitPanKeep: range(0, 1, 0.05),
  limitZoomOutTo: range(0.05, 0.65, 0.05),
  limitZoomInTo: range(1, 20, 0.5),
};
