import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";
import { DataExplorer, type ExplorerEffects } from "../src/index";
import { worldMapSource } from "../examples/world-map/source";

export default {
  title: "Data explorer",
} satisfies StoryDefault;

// The world-map example's own source, so the story and the example cannot drift apart.
const source = worldMapSource();

/**
 * Real country shapes in fixed scenes (`examples/world-map/`): continents at the top, each entered
 * to its countries. Things to try: zoom into a continent and watch its countries land where it was;
 * point at Lesotho, a hole in South Africa; pan sideways from one continent into the next.
 */
export const WorldMap: Story<{ background: string; growIn: boolean; hoverRing: boolean; selectionRing: boolean }> = ({ background, growIn, hoverRing, selectionRing }) => {
  const [focus, setFocus] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState("—");
  const effects: ExplorerEffects = { growIn, hoverRing, selectionRing };

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
          background={{ color: background, grid: false }}
          effects={effects}
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
};

WorldMap.argTypes = {
  background: { control: { type: "color" } },
};
