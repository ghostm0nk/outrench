# Outrench Dashboard — Design Notes
> Last updated: 2026-03-13

---

## Overview

This document captures the intended layout, page structure, and UX decisions for the Outrench web dashboard. Refer to this before building any new views or navigation.

---

## Navigation Structure

### Top Navigation Row (Context / Views)
Each tab is a **separate full page view**.

| Tab | Purpose |
|-----|---------|
| **Station** | Home / main dashboard. Shows bot activity (left panel) and AI task list (right panel). |
| **Startup Directory** | Separate page. Displays startup info, milestones, and progress. |
| **Notes** | Separate page. Structured task input for the user to give the AI instructions. No freeform chat. |

### Bottom Navigation Row (Actions / Settings)
Each tab is also a **separate full page view**.

| Tab | Purpose |
|-----|---------|
| **Channels** | Communication channels the bot is operating on. |
| **Analytics** | Metrics and performance data. |
| **Profile / Bills** | User profile management and billing. |

---

## Station Page Layout (Home)

```
┌─────────────────────────────────────────────┐
│  [Station]  [Startup Directory]  [Notes]    │  ← Top nav
├──────────────────────────┬──────────────────┤
│                          │                  │
│   Bot Activity Feed      │   AI Task List   │
│   (main left panel)      │   (right panel)  │
│                          │  [READ ONLY]     │
├──────────────────────────┴──────────────────┤
│  [Channels]  [Analytics]  [Profile/Bills]   │  ← Bottom nav
└─────────────────────────────────────────────┘
```

### Left Panel — Bot Activity Feed
- Shows what the AI agent is currently doing / has recently done.
- Should display **human-readable summaries**, NOT raw logs.
  - e.g. "Sent a LinkedIn message to Jane at Acme Co."
- Consider a timeline or card-based layout rather than a text log.
- TODO: Decide on plain English summaries vs. expandable detail cards.

### Right Panel — AI Task List
- Read-only. The user cannot edit tasks here.
- Shows the queue of tasks the AI has received and their status.
- Tasks originate from the **Notes** tab.

---

## Notes Page
- Structured task input — the user tells the AI what to do.
- NOT a freeform chat interface.
- After submitting a task, there should be clear confirmation feedback (e.g. task appears in the Task List on Station).

---

## Startup Directory Page
- Displays info for startups.
- Includes milestones / progress tracking.
- TODO: Clarify whether milestones are updated by the AI automatically or manually by the user.

---

## Bot Activity Format
- **NOT raw logs** — human-readable event lines in a terminal-style panel.
- Terminal line types:
  | Type | Prefix | Color | Meaning |
  |------|--------|-------|---------|
  | `info` | `·` | white/dim | General activity |
  | `success` | `✓` | green | Action completed |
  | `error` | `✗` | red | Something failed |
  | `warn` | `⚠` | amber | Warning / rate limit |
  | `cmd` | `$` | indigo-light | User command echoed |
  | `ai_response` | `←` | muted indigo | AI reply to user question |

---

## AI Response Location
- **AI answers appear inline in the terminal** (Option A).
- When the user types a task/question in the command input:
  1. Command echoes immediately as a `cmd` line (`$`).
  2. Backend processes it and pushes back an `ai_response` line (`←`).
  3. Agent activity lines follow as the bot starts working.
- `ai_response` lines are visually distinct: italic text, muted indigo left border, subtle background.
- The Notes tab remains **task input only** — no conversational Q&A there.

---

## Future Pages (not building yet)
- **How It Works / Instructions page** — A dedicated explainer page for users on:
  - How to use the terminal and command input
  - What each line type means
  - How to skip / edit tasks
  - How the agent operates on platforms
  - Build this **after** the full product is working end-to-end.

---


1. **Bot health indicator** — How does the user know if the bot is running, paused, or errored? Need a visible status signal.
2. **Bot activity format** — Plain English summary cards? Timeline? Expandable logs?
3. **Task confirmation flow** — After submitting in Notes, how does the user know it was received?
4. **Milestone ownership** — AI-updated or user-updated in Startup Directory?
5. **Emergency stop** — Is there a way to pause/stop the bot mid-task? Where does this live in the UI?
6. **Mobile support** — Is a mobile layout expected? The two-panel Station layout won't translate directly.

---

## Design Principles

- Keep the user **observing, not micromanaging** the agent.
- Avoid raw technical output (logs) — always translate to plain English for the user.
- Every top-level tab and bottom-level tab is a distinct page/view.
