import "./TanawLogo.css";

const SIZE_DIMENSIONS = {
  sm: 32,
  md: 38,
  lg: 46,
};

export default function TanawLogo({
  subtitle = "Mabutol Trucking",
  size = "md",
  className = "",
  priority = false,
}) {
  const normalizedSize = SIZE_DIMENSIONS[size] ? size : "md";
  const dimension = SIZE_DIMENSIONS[normalizedSize];
  const classes = ["tanaw-brand-lockup", `is-${normalizedSize}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      <span className="tanaw-brand-badge">
        <img
          src="/tanaw-logo.png"
          alt=""
          width={dimension}
          height={dimension}
          className="tanaw-brand-img"
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : undefined}
        />
      </span>
      <span className="tanaw-brand-text">
        <span className="tanaw-brand-wordmark">TANAW</span>
        {subtitle && <span className="tanaw-brand-subtitle">{subtitle}</span>}
      </span>
    </span>
  );
}
