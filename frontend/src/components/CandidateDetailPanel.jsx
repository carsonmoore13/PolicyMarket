import { useState, useEffect, useCallback } from "react";
import { getPartyBgClass } from "../utils/partyColors.js";
import CandidateAvatar from "./CandidateAvatar.jsx";
import { fetchCandidateBio } from "../api/client.js";

export default function CandidateDetailPanel({ candidate, onClose }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [bio, setBio] = useState(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError] = useState(null);

  useEffect(() => {
    if (candidate) {
      setImgFailed(false);
      setActiveTab("overview");
      setBio(null);
      setBioError(null);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [candidate?._id]);

  // Fetch bio lazily when Bio tab is selected
  useEffect(() => {
    if (activeTab !== "bio" || !candidate?._id || bio) return;
    let cancelled = false;
    setBioLoading(true);
    setBioError(null);

    fetchCandidateBio(candidate._id)
      .then((data) => {
        if (cancelled) return;
        if (data.bio) {
          setBio(data.bio);
        } else {
          setBioError(data.error || "No biography available");
        }
      })
      .catch(() => {
        if (!cancelled) setBioError("Failed to load biography");
      })
      .finally(() => {
        if (!cancelled) setBioLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, candidate?._id, bio]);

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

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "bio", label: "Biography" },
  ];

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

        {/* Tabs */}
        <div className="flex gap-1 mb-4 rounded-lg bg-white/5 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                activeTab === tab.id
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "overview" && (
          <>
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
          </>
        )}

        {activeTab === "bio" && (
          <div className="pm-detail-bio">
            {bioLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Loading biography from Ballotpedia...
              </div>
            )}
            {bioError && !bioLoading && (
              <p className="text-sm text-gray-500 py-4 italic">{bioError}</p>
            )}
            {bio && !bioLoading && (
              <div className="space-y-3">
                {bio.split("\n\n").map((paragraph, i) => (
                  <p
                    key={i}
                    className="text-sm text-gray-300 leading-relaxed"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    {paragraph}
                  </p>
                ))}
                <p className="text-xs text-gray-500 mt-3 italic">Source: Ballotpedia</p>
              </div>
            )}
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
