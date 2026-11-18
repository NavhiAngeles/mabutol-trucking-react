import "./Skeleton.css";

const RADIUS_CLASS = {
  xs: "is-xs",
  sm: "is-sm",
  md: "is-md",
  lg: "is-lg",
  circle: "is-circle",
};

const ROW_VARIATIONS = [
  ["78%", "52%"],
  ["66%", "44%"],
  ["84%", "58%"],
  ["72%", "48%"],
  ["80%", "54%"],
  ["68%", "46%"],
];

export function SkeletonBlock({
  width = "100%",
  height = 14,
  radius = "xs",
  circle = false,
  className = "",
  style,
}) {
  const shapeClass = circle ? "is-circle" : (RADIUS_CLASS[radius] || "is-xs");
  const classes = ["tanaw-skeleton", shapeClass, className].filter(Boolean).join(" ");
  return (
    <span
      className={classes}
      aria-hidden="true"
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        ...style,
      }}
    />
  );
}

function renderSkeletonCell(col, rowIndex) {
  const spec = typeof col === "string" ? { type: col } : col || { type: "text" };
  const [primaryW, secondaryW] = ROW_VARIATIONS[rowIndex % ROW_VARIATIONS.length];

  switch (spec.type) {
    case "avatar-stack":
      return (
        <div className="tanaw-skeleton-avatar-cell">
          <SkeletonBlock
            width={spec.avatarSize || 34}
            height={spec.avatarSize || 34}
            circle={spec.circle !== false}
            radius={spec.circle === false ? "md" : "circle"}
          />
          <div className="tanaw-skeleton-stack">
            <SkeletonBlock width={spec.width || primaryW} height={13} />
            <SkeletonBlock width={spec.subWidth || secondaryW} height={11} />
          </div>
        </div>
      );
    case "stack":
      return (
        <div className="tanaw-skeleton-stack">
          <SkeletonBlock width={spec.width || primaryW} height={13} />
          <SkeletonBlock width={spec.subWidth || secondaryW} height={11} />
        </div>
      );
    case "badge":
      return (
        <SkeletonBlock
          width={spec.width || "88px"}
          height={spec.height || 22}
          radius="xs"
        />
      );
    case "short":
      return (
        <SkeletonBlock
          width={spec.width || secondaryW}
          height={spec.height || 13}
        />
      );
    case "action":
      return (
        <div className="tanaw-skeleton-action-cell">
          <SkeletonBlock width={spec.width || 28} height={spec.height || 28} radius="sm" />
        </div>
      );
    case "text":
    default:
      return (
        <SkeletonBlock
          width={spec.width || primaryW}
          height={spec.height || 13}
        />
      );
  }
}

export function SkeletonTableRows({
  rows = 5,
  columns = ["text"],
  rowClassName = "",
}) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <tr
      key={`skeleton-row-${rowIndex}`}
      className={["tanaw-skeleton-row", rowClassName].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {columns.map((col, colIndex) => {
        const align = typeof col === "object" ? col?.align : undefined;
        return (
          <td key={`skeleton-cell-${rowIndex}-${colIndex}`} className={align}>
            {renderSkeletonCell(col, rowIndex)}
          </td>
        );
      })}
    </tr>
  ));
}

export function SkeletonStatValue({
  width = "68px",
  height = 28,
  deltaWidth = "76%",
  showDelta = false,
  className = "",
}) {
  if (!showDelta) {
    return (
      <SkeletonBlock
        width={width}
        height={height}
        radius="xs"
        className={className}
      />
    );
  }
  return (
    <span className={["tanaw-skeleton-stat-wrap", className].filter(Boolean).join(" ")} aria-hidden="true">
      <SkeletonBlock width={width} height={height} radius="xs" />
      <SkeletonBlock width={deltaWidth} height={12} radius="xs" />
    </span>
  );
}

export function SkeletonListRows({
  rows = 3,
  variant = "alert",
  className = "",
}) {
  if (variant === "feed") {
    return (
      <div className={["tanaw-skeleton-feed-list", className].filter(Boolean).join(" ")} aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => {
          const [primaryW, secondaryW] = ROW_VARIATIONS[index % ROW_VARIATIONS.length];
          return (
            <div className="tanaw-skeleton-feed-item" key={`skeleton-feed-${index}`}>
              <SkeletonBlock width={8} height={8} circle style={{ marginTop: 5 }} />
              <div className="tanaw-skeleton-stack">
                <SkeletonBlock width={primaryW} height={13} />
                <SkeletonBlock width="90%" height={11} />
                <SkeletonBlock width={secondaryW} height={10} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === "bar") {
    return (
      <div className={["tanaw-skeleton-bar-list", className].filter(Boolean).join(" ")} aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => {
          const [primaryW] = ROW_VARIATIONS[index % ROW_VARIATIONS.length];
          return (
            <div className="tanaw-skeleton-bar-row" key={`skeleton-bar-${index}`}>
              <div className="tanaw-skeleton-bar-top">
                <SkeletonBlock width={primaryW} height={12} />
                <SkeletonBlock width={36} height={12} />
              </div>
              <SkeletonBlock width="100%" height={8} radius="xs" />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={["tanaw-skeleton-list", className].filter(Boolean).join(" ")} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => {
        const [primaryW, secondaryW] = ROW_VARIATIONS[index % ROW_VARIATIONS.length];
        return (
          <div className="tanaw-skeleton-alert-card" key={`skeleton-alert-${index}`}>
            <SkeletonBlock width={34} height={34} radius="md" />
            <div className="tanaw-skeleton-stack">
              <SkeletonBlock width={primaryW} height={13} />
              <SkeletonBlock width="92%" height={11} />
              <SkeletonBlock width={secondaryW} height={11} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TREND_HEIGHTS = [54, 86, 68, 104, 76, 92, 60];

export function SkeletonTrendBars({ className = "", count = 7 }) {
  const heights = Array.from({ length: count }, (_, idx) => TREND_HEIGHTS[idx % TREND_HEIGHTS.length]);
  return (
    <div className={["tanaw-skeleton-trend", className].filter(Boolean).join(" ")} aria-hidden="true">
      {heights.map((height, index) => (
        <div className="tanaw-skeleton-trend-col" key={`trend-skel-${index}`}>
          <SkeletonBlock width={18} height={11} />
          <SkeletonBlock width={16} height={height} radius="sm" />
          <SkeletonBlock width={24} height={10} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonDonut({ size = 176, className = "" }) {
  return (
    <div className={["tanaw-skeleton-donut-wrap", className].filter(Boolean).join(" ")} aria-hidden="true">
      <div
        className="tanaw-skeleton-donut-ring"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <SkeletonBlock width={48} height={24} />
        <SkeletonBlock width={58} height={10} />
      </div>
    </div>
  );
}
