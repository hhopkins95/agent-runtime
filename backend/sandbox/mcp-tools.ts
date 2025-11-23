// /**
//  * MCP Tools for Convex Backend Integration
//  *
//  * Provides tools for the Agent SDK to query the Convex backend
//  * using type-safe API definitions.
//  */

// import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
// import { ConvexHttpClient } from "convex/browser";
// import { convexApi } from "./convex-api.js";

// /**
//  * Initialize Convex client
//  */
// const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// /**
//  * Convex Backend MCP Server
//  *
//  * Provides tools for querying event data from the TicketDrop backend
//  */
// export const convexTools = createSdkMcpServer({
//   name: "convex-backend",
//   version: "1.0.0",
//   tools: [
//     tool(
//       "fetch_events",
//       "Fetch upcoming events for a specific market. Use this to find events in cities like Charlotte (clt), Nashville (nash), etc.",
//       {
//         type: "object",
//         properties: {
//           marketKey: {
//             type: "string",
//             description:
//               "The market/city key (e.g., 'clt' for Charlotte, 'nash' for Nashville)",
//           },
//           limit: {
//             type: "number",
//             description:
//               "Maximum number of events to return (default: 20, max: 50)",
//           },
//         },
//         required: ["marketKey"],
//       },
//       async (args: { marketKey: string; limit?: number }) => {
//         try {
//           // Validate and set defaults
//           const marketKey = args.marketKey.toLowerCase();
//           const limit = Math.min(args.limit ?? 20, 50);

//           // Query Convex with typed API
//           const result = await convex.query(
//             convexApi["apis/agents/events"].getUpcomingEvents,
//             {
//               apiKey: process.env.AGENT_TD_KEY!,
//               marketKey,
//               limit,
//             }
//           );

//           // Format response for agent
//           if (!result.success) {
//             return {
//               content: [
//                 {
//                   type: "text",
//                   text: "Failed to fetch events. The market key may be invalid.",
//                 },
//               ],
//               isError: true,
//             };
//           }

//           // Return formatted event list
//           const eventList = result.events
//             .map(
//               (event, idx) =>
//                 `${idx + 1}. **${event.name}**\n` +
//                 `   Date: ${event.dateFormatted}\n` +
//                 `   Venue: ${event.venue || "TBA"}\n` +
//                 `   Category: ${event.category || "General"}\n` +
//                 (event.description
//                   ? `   Description: ${event.description}\n`
//                   : "") +
//                 (event.occurrenceCount > 1
//                   ? `   (${event.occurrenceCount} dates available)\n`
//                   : "")
//             )
//             .join("\n");

//           return {
//             content: [
//               {
//                 type: "text",
//                 text:
//                   `Found ${result.count} upcoming events in ${result.market.name}:\n\n` +
//                   eventList,
//               },
//             ],
//           };
//         } catch (error: any) {
//           return {
//             content: [
//               {
//                 type: "text",
//                 text: `Error fetching events: ${error.message}`,
//               },
//             ],
//             isError: true,
//           };
//         }
//       }
//     ),
//   ],
// });
