"use client";

import { useState } from "react";
import { useEvents, type DebugEvent } from "@hhopkins/agent-runtime-react";

/**
 * Event Item - Displays a single debug event with expandable payload
 */
function EventItem({ event }: { event: DebugEvent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const time = new Date(event.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

  // Color code by event type
  const getEventColor = (eventName: string): string => {
    if (eventName.includes("block")) return "text-blue-400";
    if (eventName.includes("file")) return "text-yellow-400";
    if (eventName.includes("subagent")) return "text-purple-400";
    if (eventName.includes("status")) return "text-cyan-400";
    if (eventName.includes("metadata")) return "text-orange-400";
    if (eventName === "error") return "text-red-400";
    return "text-green-400";
  };

  return (
    <div className="border-b border-gray-700 py-1">
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-gray-800 px-1 rounded"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-gray-500 flex-shrink-0">{time}</span>
        <span className={`${getEventColor(event.eventName)} flex-1 truncate`}>
          {event.eventName}
        </span>
        <span className="text-gray-600 text-[10px]">
          {isExpanded ? "▼" : "▶"}
        </span>
      </div>
      {isExpanded && (
        <pre className="text-gray-400 text-[10px] mt-1 ml-4 whitespace-pre-wrap break-all bg-gray-800 p-2 rounded">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * DebugEventList - Shows WebSocket events for debugging
 */
export function DebugEventList() {
  const { events, clearEvents } = useEvents();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filteredEvents = filter
    ? events.filter((e) =>
        e.eventName.toLowerCase().includes(filter.toLowerCase())
      )
    : events;

  return (
    <div className="fixed bottom-16 left-4 z-50">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 text-white px-3 py-1 rounded-t-lg text-sm font-mono"
      >
        {isOpen ? "Hide Events" : `Events (${events.length})`}
      </button>

      {/* Event List Panel */}
      {isOpen && (
        <div className="bg-gray-900 text-green-400 rounded-lg shadow-2xl w-[450px] max-h-[400px] overflow-hidden font-mono text-xs">
          {/* Header */}
          <div className="flex items-center gap-2 p-2 border-b border-gray-700">
            <input
              type="text"
              placeholder="Filter events..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1 bg-gray-800 text-green-400 px-2 py-1 rounded text-xs border border-gray-700 focus:outline-none focus:border-gray-500"
            />
            <button
              onClick={clearEvents}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs text-gray-300"
            >
              Clear
            </button>
            <span className="text-gray-500">{filteredEvents.length} events</span>
          </div>

          {/* Event List */}
          <div className="overflow-auto max-h-[340px] p-2">
            {filteredEvents.length === 0 ? (
              <div className="text-gray-500 text-center py-4">
                {filter ? "No matching events" : "No events yet"}
              </div>
            ) : (
              filteredEvents.map((event) => (
                <EventItem key={event.id} event={event} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
