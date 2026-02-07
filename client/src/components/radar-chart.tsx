import { cn } from "@/lib/utils";
import { TRAIT_AXES } from "@shared/schema";

interface RadarChartProps {
  traits: Record<string, number>;
  size?: number;
  className?: string;
  showLabels?: boolean;
  color?: string;
  compareTraits?: Record<string, number>;
  compareColor?: string;
}

const TRAIT_LABELS: Record<string, string> = {
  novelty: "Novelty",
  intensity: "Intensity",
  cozy: "Cozy",
  strategy: "Strategy",
  social: "Social",
  creativity: "Creative",
  nostalgia: "Nostalgia",
  adventure: "Adventure",
};

const TRAIT_ICONS: Record<string, string> = {
  novelty: "N",
  intensity: "I",
  cozy: "C",
  strategy: "S",
  social: "So",
  creativity: "Cr",
  nostalgia: "No",
  adventure: "Ad",
};

export function RadarChart({
  traits,
  size = 280,
  className,
  showLabels = true,
  color = "rgba(16, 185, 129, 0.6)",
  compareTraits,
  compareColor = "rgba(99, 102, 241, 0.5)",
}: RadarChartProps) {
  const axes = TRAIT_AXES;
  const numAxes = axes.length;
  const center = size / 2;
  const maxRadius = size / 2 - 40;
  const angleStep = (2 * Math.PI) / numAxes;

  function getPoint(axisIndex: number, value: number): [number, number] {
    const angle = axisIndex * angleStep - Math.PI / 2;
    const r = value * maxRadius;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  }

  function getPolygonPoints(traitValues: Record<string, number>): string {
    return axes
      .map((axis, i) => {
        const val = traitValues[axis] ?? 0.5;
        const [x, y] = getPoint(i, val);
        return `${x},${y}`;
      })
      .join(" ");
  }

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className={cn("relative", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="drop-shadow-lg"
      >
        {gridLevels.map((level) => (
          <polygon
            key={level}
            points={axes
              .map((_, i) => {
                const [x, y] = getPoint(i, level);
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        ))}

        {axes.map((_, i) => {
          const [x, y] = getPoint(i, 1);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.06}
              strokeWidth={1}
            />
          );
        })}

        {compareTraits && (
          <polygon
            points={getPolygonPoints(compareTraits)}
            fill={compareColor}
            fillOpacity={0.15}
            stroke={compareColor}
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        )}

        <polygon
          points={getPolygonPoints(traits)}
          fill={color}
          fillOpacity={0.2}
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          className="transition-all duration-700 ease-out"
        />

        {axes.map((axis, i) => {
          const val = traits[axis] ?? 0.5;
          const [x, y] = getPoint(i, val);
          return (
            <circle
              key={axis}
              cx={x}
              cy={y}
              r={3}
              fill={color}
              stroke="hsl(var(--background))"
              strokeWidth={1.5}
              className="transition-all duration-500 ease-out"
            />
          );
        })}

        {showLabels &&
          axes.map((axis, i) => {
            const [x, y] = getPoint(i, 1.22);
            return (
              <text
                key={axis}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px] font-medium"
              >
                {TRAIT_LABELS[axis]}
              </text>
            );
          })}
      </svg>
    </div>
  );
}
