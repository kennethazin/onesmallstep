import React from "react";

const AgcConnectionIndicator = ({ connected }) => {
  return (
    <div className="fixed top-0 left-1/2 transform -translate-x-1/2 z-[999999] p-2.5 rounded bg-black/70 text-white flex items-center text-xs">
      <div
        className={`w-1.5 h-1.5 rounded-full mr-2 ${
          connected ? "bg-green-500" : "bg-red-500"
        }`}
      />
      <span className="font-mono">
        AGC: {connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
};

export default AgcConnectionIndicator;
