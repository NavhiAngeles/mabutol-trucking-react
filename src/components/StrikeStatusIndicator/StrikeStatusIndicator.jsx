import { useEffect, useId, useRef, useState } from 'react';
import { normalizeCustomerStanding } from '../../services/customerStandingService';
import './StrikeStatusIndicator.css';

export default function StrikeStatusIndicator({
  customer = null,
  strikeCount: strikeCountProp = null,
  standing: standingProp = null,
  size = 'md',
  onClick = null,
  showCountText = false,
  className = '',
}) {
  const tooltipId = useId();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);

  const normalized = standingProp || normalizeCustomerStanding(
    customer || { no_show_strike_count: strikeCountProp ?? 0 }
  );

  const strikeCount = strikeCountProp !== null && strikeCountProp !== undefined
    ? Math.max(0, Number(strikeCountProp) || 0)
    : normalized.strikeCount;
  const activeCircles = Math.min(3, strikeCount);
  const extraStrikes = Math.max(0, strikeCount - 3);
  const clampedFraction = `${activeCircles}/3`;

  const accessibleLabel = extraStrikes > 0
    ? `${strikeCount} no-show strikes (${clampedFraction} plus ${extraStrikes} post-reinstatement), standing ${normalized.label}`
    : `${strikeCount} of 3 no-show strikes, standing ${normalized.label}`;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const handleBlur = (event) => {
    if (wrapRef.current && event.relatedTarget && wrapRef.current.contains(event.relatedTarget)) {
      return;
    }
    setOpen(false);
  };

  const circles = (
    <span className={`strike-indicator__dots strike-indicator__dots--${size}`} aria-hidden="true">
      {[0, 1, 2].map((index) => {
        const isActive = index < activeCircles;
        return (
          <span
            key={index}
            className={`strike-indicator__dot ${isActive ? 'strike-indicator__dot--filled' : 'strike-indicator__dot--empty'}`}
          >
            {isActive ? (
              <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true" focusable="false">
                <rect x="8.85" y="4.2" width="2.3" height="7.4" rx="1.15" fill="#FFFFFF" />
                <circle cx="10" cy="14.5" r="1.35" fill="#FFFFFF" />
              </svg>
            ) : null}
          </span>
        );
      })}
      {extraStrikes > 0 ? (
        <span className="strike-indicator__extra">+{extraStrikes}</span>
      ) : null}
    </span>
  );

  const countLabel = showCountText ? (
    <span className="strike-indicator__caption">
      {extraStrikes > 0 ? `${clampedFraction} (+${extraStrikes})` : clampedFraction}
    </span>
  ) : null;

  const tooltipContent = (
    <div
      id={tooltipId}
      role="tooltip"
      className={`strike-indicator__tooltip ${open ? 'is-open' : ''}`}
      hidden={!open}
    >
      <div className="strike-indicator__tooltip-title">
        {extraStrikes > 0 ? `${strikeCount} strikes (post-reinstatement)` : `${strikeCount} of 3 strikes`}
      </div>
      <div className="strike-indicator__tooltip-meta">
        Standing: {normalized.label}
      </div>
      {normalized.blockReason ? (
        <div className="strike-indicator__tooltip-detail">{normalized.blockReason}</div>
      ) : null}
      {onClick ? (
        <div className="strike-indicator__tooltip-hint">Click to view strike history</div>
      ) : null}
    </div>
  );

  return (
    <div
      ref={wrapRef}
      className={`strike-indicator ${className}`.trim()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={handleBlur}
    >
      {typeof onClick === 'function' ? (
        <button
          type="button"
          className="strike-indicator__trigger strike-indicator__trigger--interactive"
          aria-label={accessibleLabel}
          aria-describedby={open ? tooltipId : undefined}
          onFocus={() => setOpen(true)}
          onClick={onClick}
        >
          {circles}
          {countLabel}
        </button>
      ) : (
        <span
          role="img"
          tabIndex={0}
          className="strike-indicator__trigger"
          aria-label={accessibleLabel}
          aria-describedby={open ? tooltipId : undefined}
          onFocus={() => setOpen(true)}
        >
          {circles}
          {countLabel}
        </span>
      )}
      {tooltipContent}
    </div>
  );
}
