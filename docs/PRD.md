# Product Requirements Document (PRD)
## Generic Agent Runtime

**Version:** 1.0
**Last Updated:** 2025-01-17
**Status:** Draft
**Owner:** Engineering Team

---

## 1. Problem Statement

### Current State
The TicketDrop agent-service successfully orchestrates Claude AI agents for event research, but it's tightly coupled to TicketDrop's specific infrastructure:
- Convex backend for persistence
- Domain-specific MCP tools (`fetch_events`)
- Hardcoded authentication mechanisms
- TicketDrop-specific agent configurations

### Problem
While the service works well for TicketDrop, the core orchestration logic (session management, Modal sandbox orchestration, transcript persistence, WebSocket streaming) has value beyond our specific use case. However:

- **No Separation of Concerns**: Generic runtime logic is intertwined with TicketDrop-specific code
- **Not Reusable**: Other applications can't easily use our orchestration patterns
- **Harder to Maintain**: Changes to generic functionality require navigating TicketDrop-specific code
- **Missed Opportunity**: Valuable patterns (session lifecycle, sandbox management) could benefit the broader community

### Opportunity
Extract the generic agent runtime patterns into a reusable core that can be:
- **Used by other businesses** with different domains (customer support, data analysis, etc.)
- **Published as open source** for community use and contribution
- **Potentially offered as SaaS** for companies wanting hosted AI agent infrastructure

---

## 2. Goals & Non-Goals

### Goals

#### Primary Goals
1. **Establish Architecture Pattern**
   - Create clear separation between generic runtime (`src/`) and application-specific code (`ticketdrop/`)
   - Define stable interfaces for extensibility
   - Prove the pattern works with TicketDrop as reference implementation

2. **Enable Reusability**
   - Allow other applications to plug in their own:
     - Persistence backends (not just Convex)
     - Agent profiles and configurations
     - MCP tools and capabilities
     - Authentication strategies

3. **Maintain TicketDrop Functionality**
   - Zero breaking changes to existing TicketDrop agent-service behavior
   - All current features continue working identically
   - No performance regression

4. **Simplify Future Extraction**
   - Structure `src/` so it can become an npm package with minimal effort
   - Clear public API surface
   - No TicketDrop dependencies in generic code

#### Secondary Goals
- Document architecture decisions and patterns
- Establish interfaces for common use cases
- Create reference implementation (TicketDrop) as example

### Non-Goals (for v1)

The following are explicitly **out of scope** for the initial version:

- ❌ **Multi-tenant runtime**: One runtime instance serves one application (single tenant)
- ❌ **Production-ready external documentation**: Focus on proving the pattern, not polished docs
- ❌ **Support for other sandbox providers**: Modal only (Docker, Lambda, etc. can be added later)
- ❌ **Built-in UI or admin dashboard**: Runtime is headless, applications build their own UI
- ❌ **Automatic scaling / load balancing**: Single instance deployment
- ❌ **Migration tooling**: No tools for migrating existing deployments
- ❌ **Comprehensive examples**: TicketDrop is the primary example
- ❌ **Published npm package**: Just set up the pattern for future extraction
- ❌ **Support for non-Modal sandboxes**: Can abstract later if needed
- ❌ **Hot-reloading agent profiles**: Profiles loaded at session creation only

---

## 3. Use Cases

### Use Case 1: TicketDrop Event Research (Primary Reference)

**Actor:** TicketDrop backend system
**Goal:** Research upcoming events for weekly digest emails
**Priority:** P0 (Must Work)

**Flow:**
1. Backend creates agent session via WebSocket with `marketKey` and `agentType`
2. Runtime creates Modal sandbox with TicketDrop-specific environment
3. Agent uses custom `fetch_events` MCP tool to query Convex for event data
4. Agent researches events, generates descriptions and recommendations
5. Session state and transcripts persist to Convex for resume capability
6. Results returned to backend for use in email digest workflow

**Technical Requirements:**
- Convex persistence adapter for sessions and files
- Convex storage adapter for transcripts
- Custom MCP tool: `fetch_events` (queries TicketDrop event database)
- Agent profile: `event-researcher` with domain knowledge
- Shared secret authentication (`AGENT_TD_KEY`)
- Template variables: `{{SESSION_ID}}`, `{{AGENT_TYPE}}`, `{{MARKET_KEY}}`

**Success Criteria:**
- Existing TicketDrop functionality works identically
- Zero regression in performance or reliability
- All existing integration tests pass

---

### Use Case 2: Customer Support Agent System (Future External Use)

**Actor:** E-commerce company
**Goal:** Build AI agents that help resolve customer support tickets
**Priority:** P1 (Design For)

**Flow:**
1. Company implements adapters for their infrastructure:
   - Postgres database for session persistence
   - S3 for transcript storage
   - Internal API for agent profile management
2. Provides agent profiles trained on support workflows:
   - Billing specialist
   - Technical support specialist
   - Returns & refunds specialist
3. Adds MCP tools for integration:
   - Zendesk ticket lookup
   - Order management API
   - Knowledge base search
4. Deploys runtime as standalone service in their infrastructure
5. Customer support frontend connects via WebSocket for real-time agent interaction
6. Support agents can resume previous conversations with customers

**Technical Requirements:**
- Generic database adapter (Postgres, MySQL, etc.)
- S3-compatible storage adapter
- Custom MCP tools (Zendesk, internal APIs)
- Multiple agent profiles with different specializations
- OAuth-based or API key authentication
- Session metadata includes customer ID, ticket ID, agent type

**Success Criteria:**
- Can implement all required adapters without modifying `src/`
- Runtime handles 50+ concurrent support sessions
- Session resume works reliably across server restarts

---

### Use Case 3: Open Source Research Tool (Community Use)

**Actor:** Individual developer / small team
**Goal:** Build personal research assistant for technical topics
**Priority:** P2 (Enable)

**Flow:**
1. Developer clones runtime repository
2. Implements simple file-based persistence adapter:
   - Sessions stored as JSON files in local directory
   - Transcripts stored as `.jsonl` files
3. Configures agent with research-focused prompts and capabilities
4. Adds MCP tools for their workflow:
   - Web search integration (Perplexity, Tavily)
   - GitHub repository analysis
   - Documentation lookup
5. Runs runtime locally on development machine
6. Interacts with agent via WebSocket client or simple web UI

**Technical Requirements:**
- File system persistence adapter (simple implementation)
- Local file storage for transcripts
- Open source MCP tools (web search, GitHub API)
- Simple authentication (API key or none for local use)
- Easy local deployment (npm install + run)

**Success Criteria:**
- Can set up and run locally in < 30 minutes
- Clear documentation on implementing file-based adapters
- Reference implementation helpful for understanding patterns

---

## 4. Functional Requirements

### FR1: Core Runtime

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1.1 | Runtime SHALL manage multiple concurrent agent sessions | P0 | In-memory Map of active sessions |
| FR1.2 | Runtime SHALL create/destroy Modal sandboxes for each session | P0 | One sandbox per session |
| FR1.3 | Runtime SHALL stream agent responses in real-time via WebSocket | P0 | JSONL message streaming |
| FR1.4 | Runtime SHALL handle session resume from persisted state | P0 | Load transcripts + files from storage |
| FR1.5 | Runtime SHALL monitor and cleanup idle sessions | P1 | Configurable timeout (default 15min) |
| FR1.6 | Runtime SHALL emit domain events via EventBus | P1 | Decouple business logic from transport |
| FR1.7 | Runtime SHALL gracefully shutdown with cleanup | P1 | Close sandboxes, sync state |

### FR2: Adapter System

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR2.1 | Runtime SHALL accept a `SessionPersistenceAdapter` for session CRUD | P0 | Fetch all, load, save, sync, delete |
| FR2.2 | Runtime SHALL accept a `StorageBackend` for files and transcripts | P0 | Upload, download, list, delete |
| FR2.3 | Runtime SHALL accept an `AgentProfileLoader` for profile loading | P0 | Load multiple profiles dynamically |
| FR2.4 | Runtime SHALL accept a `SandboxConfigProvider` for environment config | P0 | Env vars, MCP servers, dependencies |
| FR2.5 | All adapters SHALL be provided at runtime initialization | P0 | Constructor injection |
| FR2.6 | Adapter interfaces SHALL be fully TypeScript typed | P0 | Type safety across boundaries |
| FR2.7 | Adapter failures SHALL emit error events | P1 | Allow applications to handle errors |

### FR3: Agent Profiles

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR3.1 | Profile loader SHALL support loading multiple agent profiles | P0 | Not limited to one hardcoded profile |
| FR3.2 | Profiles SHALL include system prompts, .claude configs, MCP servers | P0 | Complete agent definition |
| FR3.3 | Profiles SHALL support template variable replacement | P1 | E.g., `{{SESSION_ID}}`, `{{MARKET_KEY}}` |
| FR3.4 | Profile loader SHALL be called at session creation time | P0 | Dynamic loading per session |
| FR3.5 | Profile loading errors SHALL fail session creation gracefully | P1 | Clear error messages |
| FR3.6 | Profiles MAY come from any source (files, DB, API) | P1 | Adapter decides implementation |

### FR4: MCP Tool Configuration

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR4.1 | Runtime SHALL support dynamic MCP server registration per agent | P0 | No hardcoded tools in generic code |
| FR4.2 | MCP tools SHALL be isolated per sandbox | P0 | No shared state between sessions |
| FR4.3 | MCP configs SHALL include environment variables for sandbox | P0 | API keys, endpoints, etc. |
| FR4.4 | Application-specific MCP tools SHALL be provided via adapters | P0 | E.g., TicketDrop's `fetch_events` |
| FR4.5 | MCP servers MAY be command-based or code-based | P1 | Support both patterns |
| FR4.6 | MCP tool failures SHALL be reported to client | P1 | Error visibility |

### FR5: WebSocket Transport

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR5.1 | Runtime SHALL expose WebSocket server for client connections | P0 | Socket.io based |
| FR5.2 | WebSocket SHALL emit events: session lifecycle, messages, file changes | P0 | Real-time updates |
| FR5.3 | WebSocket SHALL use room-based broadcasting per session | P0 | Isolation between sessions |
| FR5.4 | WebSocket protocol SHALL remain stable across adapter changes | P0 | Generic event schema |
| FR5.5 | WebSocket SHALL handle client disconnects gracefully | P1 | Sessions continue running |
| FR5.6 | WebSocket SHALL support reconnection | P1 | Resume from current state |

### FR6: TicketDrop Implementation

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR6.1 | TicketDrop implementation SHALL reside in `ticketdrop/` directory | P0 | Clear separation |
| FR6.2 | TicketDrop SHALL implement all required adapters for Convex | P0 | Persistence, storage, profiles, sandbox |
| FR6.3 | TicketDrop SHALL provide `fetch_events` MCP tool | P0 | Queries Convex event data |
| FR6.4 | TicketDrop SHALL configure `event-researcher` agent profile | P0 | Current primary agent |
| FR6.5 | TicketDrop implementation SHALL import from `src/` only | P0 | No direct Convex imports in src/ |
| FR6.6 | TicketDrop SHALL continue working identically to current version | P0 | Zero breaking changes |

---

## 5. Non-Functional Requirements

### NFR1: Performance

| ID | Requirement | Priority | Target |
|----|-------------|----------|--------|
| NFR1.1 | Session creation SHALL complete within 30 seconds | P0 | Includes sandbox startup |
| NFR1.2 | Message streaming SHALL have < 500ms latency | P1 | From sandbox to client |
| NFR1.3 | Runtime SHALL support 50+ concurrent sessions per instance | P1 | Resource efficiency |
| NFR1.4 | Periodic sync SHALL not block message streaming | P1 | Background sync every 30s |
| NFR1.5 | Session resume SHALL complete within 60 seconds | P1 | Load transcripts + files |

### NFR2: Reliability

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| NFR2.1 | Crashed sandboxes SHALL be detected and cleaned up | P0 | Modal health monitoring |
| NFR2.2 | Session state SHALL persist before sandbox termination | P0 | Final sync on shutdown |
| NFR2.3 | Network interruptions SHALL not cause data loss | P1 | Retry pending syncs |
| NFR2.4 | Adapter failures SHALL not crash the runtime | P1 | Error isolation |
| NFR2.5 | Runtime SHALL log all errors with context | P1 | Debugging support |

### NFR3: Maintainability

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| NFR3.1 | Clear separation between `src/` (generic) and `ticketdrop/` (specific) | P0 | Enforce with imports |
| NFR3.2 | All public interfaces SHALL have TypeScript types | P0 | Type safety |
| NFR3.3 | Core abstractions SHALL be documented with JSDoc | P1 | API documentation |
| NFR3.4 | Code SHALL follow existing patterns | P1 | Layered architecture, EventBus |
| NFR3.5 | No TicketDrop-specific code in `src/` | P0 | Verified by import checks |

### NFR4: Extensibility

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| NFR4.1 | Adding new adapter SHALL not require changes to `src/` | P0 | Interface compliance only |
| NFR4.2 | Adding new MCP tools SHALL not require runtime code changes | P0 | Config-driven |
| NFR4.3 | Interface changes SHALL be backwards compatible where possible | P1 | Minimize breaking changes |
| NFR4.4 | Session metadata SHALL be extensible | P1 | Generic Record<string, unknown> |

---

## 6. Success Metrics

### Launch Criteria (Must Achieve)

Before considering v1 complete:

- ✅ **Functional Parity**: TicketDrop agent-service works identically to current implementation
- ✅ **Clean Separation**: `src/` contains zero TicketDrop-specific logic (verified by code review)
- ✅ **Import Isolation**: `ticketdrop/` imports from `src/` exclusively (no Convex in src/)
- ✅ **Type Safety**: All TypeScript types resolve correctly, no `any` types in public APIs
- ✅ **Test Coverage**: Existing integration tests pass without modification
- ✅ **No Regression**: Performance metrics match or exceed current implementation

### Post-Launch Success Indicators

Metrics to track after v1 release:

- 📊 **External Adoption**: External team successfully implements custom adapters
- 📊 **Extraction Ready**: Can extract `src/` to npm package with < 4 hours effort
- 📊 **Development Velocity**: Adding new agent types takes < 2 hours
- 📊 **Stability**: Zero production incidents related to refactoring
- 📊 **Code Health**: Test coverage maintained or improved
- 📊 **Developer Experience**: Positive feedback from team on architecture

### Quality Metrics

Ongoing quality indicators:

- **Code Quality**: TypeScript strict mode enabled, zero linter errors
- **Documentation**: All public interfaces have JSDoc comments
- **Test Coverage**: Integration tests for critical paths (session creation, resume, MCP tools)
- **Performance**: Session creation < 30s, message latency < 500ms
- **Reliability**: Successful session completion rate > 99%

---

## 7. User Stories

### Story 1: As a TicketDrop developer
**I want** the agent-service to continue working exactly as before
**So that** I can focus on building features without worrying about infrastructure changes

**Acceptance Criteria:**
- Existing API calls work identically
- Session creation, messaging, and resume work as expected
- Event research agents produce same quality results
- No new errors or warnings in logs
- Performance is equal or better

---

### Story 2: As a platform engineer
**I want** to understand what interfaces I need to implement
**So that** I can integrate the agent runtime with my company's infrastructure

**Acceptance Criteria:**
- Clear TypeScript interfaces for all adapters
- JSDoc comments explain each method's purpose
- TicketDrop implementation serves as reference example
- Documentation explains data flow and lifecycle

---

### Story 3: As an open source contributor
**I want** to run the agent runtime locally with minimal setup
**So that** I can experiment and contribute improvements

**Acceptance Criteria:**
- Can implement file-based adapters in < 100 lines of code
- Clear separation between generic and application code
- README explains architecture decisions
- No hidden dependencies on TicketDrop infrastructure

---

### Story 4: As a maintainer
**I want** to add new agent types easily
**So that** I can rapidly prototype new capabilities

**Acceptance Criteria:**
- Adding new agent profile doesn't require code changes in `src/`
- Can configure new MCP tools declaratively
- Template variable system supports custom variables
- Takes < 2 hours to add new agent type

---

## 8. Dependencies & Constraints

### Technical Dependencies

**Required:**
- Node.js 22+ (current requirement)
- TypeScript 5+ (type system features)
- Modal account & API credentials (sandbox provider)
- Socket.io (WebSocket transport)
- @anthropic-ai/claude-agent-sdk (agent execution)

**TicketDrop-Specific:**
- Convex backend (TicketDrop implementation only)
- TicketDrop event schema (for fetch_events tool)

### Constraints

**Must Not:**
- Break existing TicketDrop functionality
- Introduce new external dependencies to `src/` (keep it lightweight)
- Change WebSocket protocol (breaking change for clients)
- Require database migrations

**Should Minimize:**
- Performance overhead from abstraction layers
- Complexity in adapter implementations
- Breaking changes to public interfaces

---

## 9. Open Questions

### Q1: Session Metadata Schema
**Question:** Should we validate session metadata structure?

**Options:**
- A) No validation, fully dynamic `Record<string, unknown>`
- B) Optional Zod schema provided by application
- C) Required base metadata fields in RuntimeConfig

**Recommendation:** B - Allow applications to provide optional Zod schema for validation

**Decision:** TBD

---

### Q2: Error Handling Strategy
**Question:** How should adapter errors be handled?

**Options:**
- A) Bubble up, let caller handle
- B) Retry with exponential backoff
- C) Emit error events, continue running

**Recommendation:** A + C - Bubble critical errors (session creation fails), emit non-critical errors (sync failures)

**Decision:** TBD

---

### Q3: MCP Tool Packaging
**Question:** How are MCP tool dependencies installed in sandbox?

**Options:**
- A) All dependencies in base image (slow builds)
- B) Dynamic npm install per session (slow startup)
- C) Layered Docker images per agent type (complex but fast)

**Recommendation:** A for v1 (simple), C for future optimization

**Decision:** TBD

---

### Q4: Hot Profile Reloading
**Question:** Should agent profiles be reloadable without restart?

**Options:**
- A) No, profiles loaded once at session creation
- B) Yes, with cache invalidation API
- C) Watch file system for changes

**Recommendation:** A for v1 - Profiles loaded at session creation only

**Decision:** TBD

---

### Q5: Sandbox Provider Abstraction
**Question:** Should we abstract Modal away to support other sandbox providers?

**Options:**
- A) No, Modal only for now (simplest)
- B) Yes, create SandboxProvider interface (future-proof)
- C) Support Modal + Docker Compose (practical alternative)

**Recommendation:** A for v1 - Modal adapter can stay in core, abstract later if needed

**Decision:** TBD

---

## 10. Out of Scope

Explicitly **not** included in v1:

### Not Building
- ❌ Admin dashboard or UI
- ❌ Agent marketplace or discovery
- ❌ Built-in authentication/authorization system
- ❌ Monitoring/observability stack (use external tools)
- ❌ Rate limiting / quota management
- ❌ Multi-region deployment support

### Not Supporting
- ❌ Sandboxes other than Modal
- ❌ Persistence backends with specific features (e.g., graph databases)
- ❌ Real-time collaboration between agents
- ❌ Agent-to-agent communication
- ❌ Streaming to multiple clients simultaneously

### Not Optimizing
- ❌ Horizontal scaling (single instance only)
- ❌ Sub-second session creation
- ❌ Millions of concurrent sessions
- ❌ Cost optimization for sandbox usage

---

## 11. Timeline & Resources

### Estimated Effort
**Total: 12-18 hours** (1.5-2 work days for one developer)

### Phases

| Phase | Duration | Deliverables |
|-------|----------|-------------|
| 1. Define Interfaces | 2-3 hours | All adapter interfaces, RuntimeConfig type |
| 2. Refactor Core | 4-5 hours | SessionManager, AgentSession using adapters |
| 3. TicketDrop Adapters | 3-4 hours | All TicketDrop implementations |
| 4. Dynamic MCP | 2-3 hours | Sandbox executor, MCP tool loading |
| 5. Entry Point | 1 hour | ticketdrop/index.ts, package.json update |
| 6. Testing & Validation | 2-3 hours | Integration tests, performance validation |

### Resources Required
- 1 senior engineer (architecture + implementation)
- Access to TicketDrop Convex backend (testing)
- Modal account (sandbox testing)

---

## 12. Risks & Mitigation

### Risk 1: Breaking TicketDrop Functionality
**Probability:** Medium
**Impact:** High

**Mitigation:**
- Keep existing integration tests
- Test thoroughly at each phase
- Run side-by-side comparison (old vs new)
- Gradual rollout with feature flag

---

### Risk 2: Performance Regression
**Probability:** Low
**Impact:** Medium

**Mitigation:**
- Benchmark before/after
- Profile critical paths (session creation, message streaming)
- Minimize abstraction overhead
- Monitor production metrics

---

### Risk 3: Over-Engineering
**Probability:** Medium
**Impact:** Low

**Mitigation:**
- Start simple, add complexity only when needed (YAGNI)
- Use TicketDrop as only use case for v1
- Avoid premature optimization
- Time-box implementation phases

---

### Risk 4: Incomplete Abstraction
**Probability:** Medium
**Impact:** Medium

**Mitigation:**
- Clear definition of adapter interfaces upfront
- Code review for TicketDrop-specific code in src/
- Attempt mock implementation of alternative backend
- Import analysis (no Convex in src/)

---

## 13. Appendix

### Glossary

- **Agent Profile**: Configuration defining an agent's capabilities, prompts, and tools
- **Adapter**: Implementation of a persistence or configuration interface
- **EventBus**: Internal event system for decoupling components
- **MCP (Model Context Protocol)**: Standard for extending Claude with custom tools
- **Modal**: Serverless compute platform for running sandboxes
- **Runtime**: The core orchestration system managing agent sessions
- **Sandbox**: Isolated execution environment for an agent session
- **Session**: A single agent conversation with state and history
- **Transcript**: JSONL log of messages between client and agent

### References

- [Current agent-service implementation](../src/)
- [Modal documentation](https://modal.com/docs)
- [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [MCP Specification](https://modelcontextprotocol.io/)

---

**Document Status:** Draft - Awaiting Review & Approval

**Next Steps:**
1. Review with stakeholders
2. Resolve open questions
3. Approve and move to design phase
4. Begin implementation

---

*This PRD is a living document and will be updated as requirements evolve.*
