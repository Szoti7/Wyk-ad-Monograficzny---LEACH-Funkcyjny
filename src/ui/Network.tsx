import { BASE, FIELD_SIZE } from "../core/leach";
import type { Point, Sensor, Simulation } from "../core/types";

const field = { x: 44, y: 66, width: 800, height: 380 } as const;
const viewWidth = field.x + field.width + 24;
const viewHeight = field.y + field.height + 48;
const ticks = [0, 0.25, 0.5, 0.75, 1].map((part) => part * FIELD_SIZE);
const palette = [
  "#087f72",
  "#a46725",
  "#4969b6",
  "#b35370",
  "#6a7d34",
  "#8063a5",
] as const;

const color = (id: number | null) =>
  id === null ? "#74847f" : palette[id % palette.length];

// Położenie sensora w metrach przeliczamy na współrzędne pola na ekranie
const position = ({ x, y }: Point): Point => ({
  x: field.x + (x / FIELD_SIZE) * field.width,
  y: field.y + (1 - y / FIELD_SIZE) * field.height,
});

const Field = () => (
  <g>
    <rect {...field} rx="4" fill="#f5f8f3" stroke="#d8e1da" />
    {ticks.map((value) => {
      const { x, y } = position({ x: value, y: value });
      return (
        <g key={value} className="axis">
          <line
            x1={x}
            x2={x}
            y1={field.y}
            y2={field.y + field.height}
            stroke="#dce5df"
          />
          <line
            x1={field.x}
            x2={field.x + field.width}
            y1={y}
            y2={y}
            stroke="#dce5df"
          />
          <text x={x} y={field.y + field.height + 18} textAnchor="middle">
            {value}
          </text>
          <text x={field.x - 9} y={y} dy="0.35em" textAnchor="end">
            {value}
          </text>
        </g>
      );
    })}
    <text x={field.x - 10} y={field.y - 12} className="axis" textAnchor="end">
      y
    </text>
    <text
      x={field.x + field.width}
      y={viewHeight - 9}
      className="axis"
      textAnchor="end"
    >
      x
    </text>
  </g>
);

const SensorMarker = ({ node }: Readonly<{ node: Sensor }>) => {
  const { x, y } = position(node.position);
  const dead = node.energy === 0;
  const role = dead ? "wyczerpany" : node.isHead ? "lider" : "sensor";
  const cluster = node.headId === null ? "" : ` · klaster ${node.headId}`;
  return (
    <g transform={`translate(${x} ${y})`}>
      <title>{`Węzeł ${node.id} · ${node.energy.toFixed(5)} J · ${role}${cluster}`}</title>
      {dead ? (
        <path
          d="M -3 -3 L 3 3 M 3 -3 L -3 3"
          stroke="#b86d6b"
          strokeWidth="1.5"
        />
      ) : (
        <circle r={node.isHead ? 7 : 3.5} fill={color(node.headId)} />
      )}
      {node.isHead && !dead && (
        <circle r="10" fill="none" stroke={color(node.id)} />
      )}
    </g>
  );
};

// BS leży poza polem. Symbol umieszczamy nad mapą i podajemy rzeczywiste współrzędne
const station = { x: position(BASE).x, y: 28 } as const;

export const Network = ({
  simulation,
}: Readonly<{ simulation: Simulation }>) => {
  const nodesById: ReadonlyMap<number, Sensor> = new Map(
    simulation.nodes.map((node) => [node.id, node]),
  );
  return (
    <svg
      className="network"
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      role="img"
    >
      <Field />
      {simulation.links.map(({ from, to }) => {
        const source = nodesById.get(from);
        const target = to === "base" ? station : nodesById.get(to)?.position;
        if (!source || !target) return null;
        const start = position(source.position);
        const end = to === "base" ? station : position(target);
        return (
          <line
            key={`${from}-${to}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={color(source.headId)}
            strokeWidth={to === "base" ? 1.3 : 0.9}
            strokeDasharray={to === "base" ? "5 5" : undefined}
            opacity={0.4}
          />
        );
      })}
      <g transform={`translate(${station.x} ${station.y})`}>
        <rect x="-12" y="-12" width="24" height="24" rx="6" fill="#183d31" />
        <path d="M -6 4 L 0 -6 L 6 4 Z" fill="#d8f5a2" />
        <text x="21" y="-1" className="svg-label">
          STACJA BAZOWA
        </text>
        <text x="21" y="14" className="axis">
          ({BASE.x}, {BASE.y})
        </text>
      </g>
      {simulation.nodes.map((node) => (
        <SensorMarker key={node.id} node={node} />
      ))}
    </svg>
  );
};
