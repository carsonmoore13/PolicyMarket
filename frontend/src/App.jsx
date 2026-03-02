import { useState } from "react";
import AppLayout from "./components/AppLayout.jsx";
import ZipCodeModal from "./components/ZipCodeModal.jsx";
import CandidateDetailPanel from "./components/CandidateDetailPanel.jsx";
import { useZipLookup } from "./hooks/useZipLookup.js";
import { useCandidates } from "./hooks/useCandidates.js";

export default function App() {
  const {
    zip,
    setZip,
    zipData,
    loading: zipLoading,
    error: zipError,
    submitZip,
  } = useZipLookup();
  const [level, setLevel] = useState("federal");
  const [showZipModal, setShowZipModal] = useState(!zipData);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const {
    candidates,
    loading: candidatesLoading,
    error: candidatesError,
  } = useCandidates(zip, level);

  const counts = {
    federal:
      level === "federal" ? candidates.length : undefined,
    state: level === "state" ? candidates.length : undefined,
    local: level === "local" ? candidates.length : undefined,
  };

  const handleZipSubmit = async (z) => {
    const data = await submitZip(z);
    if (data) {
      setShowZipModal(false);
    }
    return data;
  };

  const handleLevelChange = (lvl) => {
    setLevel(lvl);
    setSelectedCandidate(null);
  };

  const handleCandidateSelect = (c) => {
    setSelectedCandidate(c);
  };

  return (
    <>
      <AppLayout
        zipData={zipData}
        zip={zip}
        onChangeZipClick={() => setShowZipModal(true)}
        level={level}
        onLevelChange={handleLevelChange}
        levelCounts={counts}
        candidates={candidates}
        candidatesLoading={candidatesLoading}
        candidatesError={candidatesError}
        onSelectCandidate={handleCandidateSelect}
        selectedCandidate={selectedCandidate}
      />
      <ZipCodeModal
        open={showZipModal}
        onSubmit={handleZipSubmit}
        loading={zipLoading}
        error={zipError}
        initialZip={zip}
      />
      <CandidateDetailPanel
        candidate={selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
      />
    </>
  );
}

