import type { RoundStats } from "../core/types";

export const HistoryChart = ({
  history,
  max,
}: Readonly<{
  history: readonly RoundStats[];
  max: number;
}>) => {
  const last = history.at(-1);
  const rounds = Math.max(1, last?.round ?? 0);
  const points = history
    .map(
      (item) =>
        `${42 + (item.round / rounds) * 490},${130 - (item.alive / max) * 105}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 550 164"
      role="img"
      aria-label="Liczba żywych sensorów w kolejnych rundach"
    >
      {[0, 0.5, 1].map((fraction) => (
        <g key={fraction}>
          <line
            x1="42"
            y1={130 - fraction * 105}
            x2="532"
            y2={130 - fraction * 105}
            stroke="#e3e9e2"
          />
          <text
            x="33"
            y={134 - fraction * 105}
            textAnchor="end"
            className="axis"
          >
            {Number((fraction * max).toFixed(2))}
          </text>
        </g>
      ))}
      <polygon
        points={`42,130 ${points} ${42 + ((last?.round ?? 0) / rounds) * 490},130`}
        fill="#eaf3df"
      />
      <polyline
        points={points}
        fill="none"
        stroke="#4e7938"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <text x="42" y="153" className="axis">
        0
      </text>
      <text x="532" y="153" textAnchor="end" className="axis">
        runda {last?.round ?? 0}
      </text>
    </svg>
  );
};
