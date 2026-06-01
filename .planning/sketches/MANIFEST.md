# Sketch Manifest

## Design Direction
ShipShape Tasks redesign. Combine BlitzBooks' day-centric task engine (horizontal day strip,
recurring tasks, carry-over of unfinished work) with ShipShape's crew strengths (assign-to,
To do / Doing / Done status, descriptions). iOS-native marine aesthetic: glass headers, grouped
cards, ocean-teal accent, SF system font. Mobile-first PWA. Night Watch is a task **tag/filter**,
not a status. Notifications deferred to a later pass.

## Reference Points
- BlitzBooks Tasks (`Projects/ClientWork/BlitzBooks/src/pages/Tasks.tsx`) — day strip, recurrence, carry-over.
- Current ShipShape Tasks (`src/pages/Tasks.tsx`, `src/components/TaskSheet.tsx`) — status + crew assignment.
- iOS Reminders / Things — agenda-by-day mental model.

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | tasks-day-board | One status at a time (filter) vs whole-day board (stacked)? | **A — Filtered** | tasks, layout, day-strip, night-watch |
