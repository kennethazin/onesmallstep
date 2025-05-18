"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  required?: boolean;
}

interface MissionChecklistProps {
  title: string;
  items: ChecklistItem[];
  onComplete: () => void;
  canProceed: boolean;
  missionType: "launch" | "landing";
  waitingForAGC?: boolean;
}

export default function MissionChecklist({
  title,
  items,
  onComplete,
  canProceed,
  missionType,
  waitingForAGC = false,
}: MissionChecklistProps) {
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(items);

  const handleItemCheck = (id: string) => {
    setChecklistItems(
      checklistItems.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const allRequiredItemsChecked = checklistItems
    .filter((item) => item.required)
    .every((item) => item.checked);

  const proceedButtonText =
    missionType === "launch"
      ? "INITIATE LAUNCH SEQUENCE"
      : "BEGIN LUNAR DESCENT";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute top-4 left-4 bg-zinc-950 border border-zinc-800 rounded-md p-6 w-[80%] max-w-md max-h-[80vh] overflow-y-auto z-10 text-zinc-300 font-mono"
    >
      <div className="flex justify-between items-center pb-3 border-b border-zinc-800 mb-4">
        <h2 className="text-zinc-300 m-0 text-xl font-light tracking-wider">
          {title}
        </h2>
      </div>

      <h3 className="text-zinc-400 my-3 text-sm font-light uppercase tracking-wider">
        {missionType === "launch"
          ? "PRE-LAUNCH VERIFICATION"
          : "LUNAR DESCENT PREPARATION"}
      </h3>

      <ul className="list-none p-0 m-0 space-y-2">
        {checklistItems.map((item) => (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`flex items-center p-2 rounded ${
              item.checked ? "bg-zinc-900" : "bg-transparent"
            } border-l-2 ${
              item.checked
                ? "border-l-zinc-500"
                : item.required
                  ? "border-l-zinc-600"
                  : "border-l-zinc-800"
            } transition-all duration-300 hover:bg-zinc-900`}
          >
            <input
              type="checkbox"
              id={item.id}
              checked={item.checked}
              onChange={() => handleItemCheck(item.id)}
              className="mr-3 cursor-pointer w-4 h-4 bg-zinc-800 border-zinc-700 rounded"
            />
            <span
              className={`flex-grow ${
                item.checked
                  ? "text-zinc-500 line-through"
                  : item.required
                    ? "text-zinc-400"
                    : "text-zinc-400"
              } text-sm`}
            >
              {item.text}{" "}
              {item.required && <span className="text-zinc-600 ml-1">✱</span>}
            </span>
          </motion.li>
        ))}
      </ul>

      {waitingForAGC && (
        <div
          className={`flex items-center mt-4 p-2 bg-zinc-900 rounded text-xs ${
            canProceed ? "text-zinc-400" : "text-zinc-500"
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full mr-2 ${
              canProceed ? "bg-zinc-500" : "bg-zinc-700"
            }`}
          ></div>
          AGC {missionType === "launch" ? "LAUNCH" : "LUNAR DESCENT"} PROGRAM:{" "}
          {canProceed ? "DETECTED" : "WAITING"}
        </div>
      )}

      <motion.button
        whileHover={{
          opacity:
            canProceed || (waitingForAGC ? true : allRequiredItemsChecked)
              ? 0.8
              : 0.5,
        }}
        onClick={onComplete}
        disabled={
          !canProceed || (waitingForAGC ? false : !allRequiredItemsChecked)
        }
        className={`w-full mt-4 py-2 px-4 border text-xs tracking-widest uppercase ${
          !canProceed || (waitingForAGC ? false : !allRequiredItemsChecked)
            ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed"
            : "bg-transparent border-zinc-700 text-zinc-300 cursor-pointer hover:bg-zinc-900"
        } transition-colors duration-300`}
      >
        {proceedButtonText}
      </motion.button>

      {!canProceed && waitingForAGC && (
        <p className="text-zinc-600 mt-3 text-xs">
          {missionType === "launch"
            ? "Waiting for Saturn V launch program to be loaded in AGC..."
            : "Waiting for Lunar Descent program to be loaded in AGC..."}
        </p>
      )}

      {!allRequiredItemsChecked && !waitingForAGC && (
        <p className="text-zinc-600 mt-3 text-xs">
          Complete all required items (✱) to proceed
        </p>
      )}
    </motion.div>
  );
}
