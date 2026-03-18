import { useState, useEffect, useCallback } from "react";
import { getPartyBgClass } from "../utils/partyColors.js";
import CandidateAvatar from "./CandidateAvatar.jsx";

export default function CandidateDetailPanel({ candidate, onClose }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Animate in when candidate changes
  useEffect(() => {
    if (candidate) {
      setImgFailed(false);
      // Trigger slide-in on next frame
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [candidate?._id]);

  // Escape key to close
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") onClose?.();
    },
    [onClose],
  );
  useEffect(() => {
    if (candidate) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [candidate, handleKeyDown]);

  if (!candidate) return null;

  const partyClass = getPartyBgClass(candidate.party);
  const partyColor =
    (candidate.party || "").toUpperCase() === "R"
      ? "#ef4444"
      : (candidate.party || "").toUpperCase() === "D"
        ? "#3b82f6"
        : "#6b7280";

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose?.();
  };

  return (
    <div
      className="pm-detail-backdrop"
      data-visible={visible ? "true" : undefined}
      onClick={handleBackdropClick}
    >
      <div className="pm-detail-panel" data-visible={visible ? "true" : undefined}>
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <CandidateAvatar
              candidate={candidate}
              size={64}
              partyColor={partyColor}
              onImgError={() => setImgFailed(true)}
            />
            <div>
              <h2 className="text-lg font-semibold text-white leading-tight">
                {candidate.name}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${partyClass}`}
                >
                  {candidate.party || "Unknown party"}
                </span>
                <span className="rounded border border-gray-600 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-300">
                  {candidate.office_level}
                </span>
                {candidate.status_2026 === "runoff" && (
                  <span className="rounded bg-amber-600/20 border border-amber-500/40 px-2 py-0.5 text-[11px] font-semibold text-amber-400 uppercase">
                    Runoff
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pm-detail-close"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Metadata */}
        <div className="pm-detail-meta">
          <div className="pm-detail-row">
            <span className="pm-detail-label">Office</span>
            <span>
              {candidate.office}
              {candidate.district ? ` · ${candidate.district}` : ""}
            </span>
          </div>
          <div className="pm-detail-row">
            <span className="pm-detail-label">Jurisdiction</span>
            <span>{candidate.jurisdiction}</span>
          </div>
          {candidate.home_city && (
            <div className="pm-detail-row">
              <span className="pm-detail-label">Location</span>
              <span>{candidate.home_city}</span>
            </div>
          )}
        </div>

        {/* Policy positions */}
        {Array.isArray(candidate.policies) && candidate.policies.length > 0 && (
          <div className="pm-detail-policies">
            <div className="pm-detail-section-title">Policy positions</div>
            <ul className="space-y-2">
              {candidate.policies.map((p, i) => (
                <li
                  key={i}
                  className="pm-detail-policy-item"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span
                    className="pm-detail-policy-dot"
                    style={{ background: partyColor }}
                  />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Source link */}
        {candidate.source_url && (
          <div className="pm-detail-footer">
            <a
              href={candidate.source_url}
              target="_blank"
              rel="noreferrer"
              className="pm-detail-link"
            >
              <span>{candidate.source_name || "View on Ballotpedia"}</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 2h7v7M12 2L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
