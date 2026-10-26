import type { Story, StoryDefault } from "@ladle/react";
import { useMemo, useState } from "react";
import { createSceneSource, DataExplorer, type ExplorerShape } from "../src/index";
import { fixedData, type FixedArgs, type Focus } from "./fixed-data";

export default {
  title: "Data explorer",
} satisfies StoryDefault;

/**
 * A fixed layout (`layout: "fixed"`): a schematic world whose continents, and the made-up places
 * inside them, are drawn at boxes the data gives, in one set of units. Each scene's `bounds` is its
 * parent item's box, so zooming in should show the children landing exactly where their parent was
 * drawn, with nothing moving at the swap, and its neighbours staying put around it.
 *
 * Things to try: rectangles that are long and thin (hover and click their ends); `outlines`, then
 * hover a lake (it is not part of its place) and a ragged edge, and see hover, selection and the
 * `ring` emphasis (every fifth item) follow each outline; `drawWith` another shape, to see a disc
 * keep to the largest circle that fits; `childLayout: packed`, to compare with an ordinary scene.
 */
export const FixedLayout: Story<FixedArgs & { customViewsMax: number }> = ({ customViewsMax, ...args }) => {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [lastEvent, setLastEvent] = useState("—");

  const dataKey = JSON.stringify(args);
  const source = useMemo(() => {
    const built = fixedData(args);
    return createSceneSource<Focus>({ load: built.scene, parentOf: built.parentOf });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ font: "12px system-ui, sans-serif", display: "flex", gap: 16, alignItems: "center" }}>
        <span>focus: {focus ?? "world"}</span>
        <span>last event: {lastEvent}</span>
        {focus !== null && <button onClick={() => setFocus(null)}>Back to the world</button>}
      </div>
      <div style={{ height: "70vh", minHeight: 360, borderRadius: 8, overflow: "hidden" }}>
        <DataExplorer<Focus>
          key={dataKey}
          source={source}
          focus={focus}
          onSettle={(next) => setFocus(next)}
          onNodeActivate={(event) => setLastEvent(`activate ${event.item.id}`)}
          onNodeHover={(item) => setLastEvent(item ? `hover ${item.id}` : "hover none")}
          renderers={() => import("./fixed-renderers")}
          customViews={{ max: customViewsMax }}
        />
      </div>
    </div>
  );
};

FixedLayout.args = {
  splits: 5,
  depth: 3,
  gap: 0.06,
  drawWith: "region",
  outlines: true,
  childLayout: "fixed",
  seed: 1,
  customViewsMax: 400,
};

const range = (min: number, max: number, step: number) => ({ control: { type: "range" as const, min, max, step } });

FixedLayout.argTypes = {
  splits: range(1, 16, 1),
  depth: range(1, 5, 1),
  gap: range(0, 0.3, 0.01),
  drawWith: { options: ["region", "tile", "square", "disc", "cloud"] satisfies (FixedArgs["drawWith"] | ExplorerShape)[], control: { type: "radio" } },
  childLayout: { options: ["fixed", "packed"], control: { type: "radio" } },
  seed: range(1, 50, 1),
  customViewsMax: range(0, 1000, 50),
};
