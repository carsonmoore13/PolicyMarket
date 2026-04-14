import { useState } from "react";
import AppLayout from "./components/AppLayout.jsx";
import AddressModal from "./components/AddressModal.jsx";
import CandidateDetailPanel from "./components/CandidateDetailPanel.jsx";
import { useAddressLookup } from "./hooks/useAddressLookup.js";
import { useCandidates } from "./hooks/useCandidates.js";
import { useCandidateTotals } from "./hooks/useCandidateTotals.js";

export default function App() {
  const {
    address,
    addressData,
    loading: addressLoading,
    error: addressError,
    submitAddress,
  } = useAddressLookup();

  const [level, setLevel] = useState("federal");
  const [sublevel, setSublevel] = useState(null);
  const [showAddressModal, setShowAddressModal] = useState(!addressData);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const {
    candidates,
    loading: candidatesLoading,
    error: candidatesError,
    discovering: candidatesDiscovering,
    schoolBoard,
    mayoral,
    cityCouncil,
  } = useCandidates(address, level);

  const { totals: totalCounts } = useCandidateTotals();

  const counts = {
    federal: level === "federal" ? candidates.length : undefined,
    state: level === "state" ? candidates.length : undefined,
    local: level === "local" ? candidates.length : undefined,
  };

  const handleAddressSubmit = async (addr) => {
    const data = await submitAddress(addr);
    if (data) {
      setShowAddressModal(false);
      setLevel("federal");
      setSelectedCandidate(null);
    }
    return data;
  };

  const handleLevelChange = (lvl) => {
    setLevel(lvl);
    setSublevel(null);
    setSelectedCandidate(null);
  };

  const handleMapLevelChange = (lvl) => {
    if (lvl !== level) {
      setLevel(lvl);
      setSelectedCandidate(null);
    }
  };

  const handleCandidateSelect = (c) => {
    setSelectedCandidate(c);
  };

  return (
    <>
      <div className="texture-overlay" />
      <AppLayout
        addressData={addressData}
        address={address}
        onChangeAddressClick={() => setShowAddressModal(true)}
        level={level}
        sublevel={sublevel}
        onLevelChange={handleLevelChange}
        onSublevelChange={setSublevel}
        levelCounts={counts}
        totalCounts={totalCounts}
        candidates={candidates}
        candidatesLoading={candidatesLoading}
        candidatesError={candidatesError}
        candidatesDiscovering={candidatesDiscovering}
        schoolBoardNotice={level === "local" ? schoolBoard : null}
        mayoralNotice={level === "local" ? mayoral : null}
        cityCouncilNotice={level === "local" ? cityCouncil : null}
        onSelectCandidate={handleCandidateSelect}
        selectedCandidate={selectedCandidate}
        onLevelChangeFromMap={handleMapLevelChange}
      />
      <AddressModal
        open={showAddressModal}
        onSubmit={handleAddressSubmit}
        loading={addressLoading}
        error={addressError}
        initialAddress={address}
      />
      <CandidateDetailPanel
        candidate={selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
      />
    </>
  );
}
