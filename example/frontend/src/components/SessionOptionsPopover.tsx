"use client";

import { useState, useRef, useEffect } from "react";
import { getModelOptionsForArchitecture, type SupportedArchitecture } from "../lib/constants";

interface SessionOptionsPopoverProps {
  architecture: SupportedArchitecture;
  currentModel?: string;
  onModelChange: (model: string) => Promise<void>;
  isUpdating: boolean;
}

/**
 * Popover component for editing session options (model selection)
 */
export function SessionOptionsPopover({
  architecture,
  currentModel,
  onModelChange,
  isUpdating,
}: SessionOptionsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const modelOptions = getModelOptionsForArchitecture(architecture);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  const handleModelSelect = async (model: string) => {
    if (model !== currentModel) {
      await onModelChange(model);
    }
    setIsOpen(false);
  };

  // Find current model label
  const currentModelLabel = modelOptions.find(m => m.value === currentModel)?.label || currentModel || "Default";

  return (
    <div className="relative">
      {/* Settings button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
        title="Session options"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span className="hidden sm:inline">{currentModelLabel}</span>
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
        >
          <div className="p-3">
            <h3 className="text-sm font-medium text-gray-800 mb-2">
              Session Options
            </h3>

            {/* Model selection */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Model</label>
              <select
                value={currentModel || ""}
                onChange={(e) => handleModelSelect(e.target.value)}
                disabled={isUpdating}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">Default</option>
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {isUpdating && (
              <div className="mt-2 text-xs text-gray-500">Updating...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
