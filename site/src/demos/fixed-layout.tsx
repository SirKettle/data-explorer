import { createSceneSource, DataExplorer, type ExplorerNode, type ExplorerRect } from "@data-xplorer/core";

// Two made-up islands, each split into districts that share their borders exactly. Every shape is
// in one set of map units, as projected map data would be; nothing here is laid out for you.
type Ring = number[][];
interface Place {
  name: string;
  outline: Ring[]; // its edge, then any holes
  districts?: Place[];
}

const islands: Place[] = [
  {
    name: "North Isle",
    outline: [[[30, 40], [90, 20], [160, 45], [150, 100], [60, 110], [20, 80]]],
    districts: [
      { name: "Westfold", outline: [[[30, 40], [90, 20], [100, 105.6], [60, 110], [20, 80]]] },
      { name: "Eastmarch", outline: [[[90, 20], [160, 45], [150, 100], [100, 105.6]]] },
    ],
  },
  {
    name: "South Isle",
    outline: [
      [[160, 130], [230, 110], [280, 150], [250, 190], [170, 180], [150, 155]],
      [[230, 150], [245, 150], [245, 162], [230, 162]], // a lake: not part of the island
    ],
    districts: [
      { name: "Lowmoor", outline: [[[160, 130], [205, 117.1], [205, 184.4], [170, 180], [150, 155]]] },
      {
        name: "Lakeside",
        outline: [
          [[205, 117.1], [230, 110], [280, 150], [250, 190], [205, 184.4]],
          [[230, 150], [245, 150], [245, 162], [230, 162]],
        ],
      },
    ],
  },
];

// The smallest rectangle round a place's edge: where it sits, and the bounds of its own scene.
function boxOf(place: Place): ExplorerRect {
  const xs = place.outline[0]!.map(([x]) => x!);
  const ys = place.outline[0]!.map(([, y]) => y!);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const region = (place: Place, i: number): ExplorerNode<string> => ({
  id: place.name,
  label: place.name,
  weight: 1, // ignored: a fixed scene draws each item at its own box
  href: `#${place.name}`,
  drillsInto: place.districts ? place.name : null,
  shape: "region",
  box: boxOf(place),
  outline: [place.outline], // one polygon: its edge, then its holes
  ramp: i / 3,
});

const source = createSceneSource<string>({
  load(focus) {
    const island = islands.find((i) => i.name === focus);
    const places = island ? island.districts! : islands;
    return {
      id: focus ?? "map",
      heading: focus ?? "The islands",
      layout: "fixed",
      // An island's scene is bounded by that island's own box, so its districts land exactly on it.
      bounds: island ? boxOf(island) : { x: 0, y: 0, width: 300, height: 200 },
      clusters: island ? [] : places.map(region),
      nodes: island ? places.map(region) : [],
      edges: [],
    };
  },
  parentOf: (focus) => ({ kind: "anchored", focus: null, anchorId: focus }),
});

export default function FixedLayout() {
  return <DataExplorer source={source} focus={null} />;
}
