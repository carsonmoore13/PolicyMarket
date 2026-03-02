export default function LevelTabs({ activeLevel, onLevelChange, counts }) {
  const tabs = [
    { id: "federal", label: "Federal" },
    { id: "state", label: "State" },
    { id: "local", label: "Local" },
  ];
  return (
    <div className="flex border-b border-gray-800 bg-slate-900/70">
      {tabs.map((tab) => {
        const count = counts?.[tab.id] ?? 0;
        const active = activeLevel === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onLevelChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
              active
                ? "border-b-2 border-blue-500 text-blue-400"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <span>{tab.label}</span>
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-200">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

