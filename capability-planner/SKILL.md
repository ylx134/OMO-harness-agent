---
name: capability-planner
description: Use when the task is not mainly about a new product surface, but about making the system truly able to do something deeper, less visible, rule-heavy, or baseline-dependent.
---

# Capability Planner

## Overview

Turn a vague "make this really work" request into a clear capability route before execution starts.

This skill is the front door for `能力型` work.
It does not build product screens or feature wish-lists.
It only makes the hidden work legible enough for `/plan`, `/drive`, and `/check` to operate.

Core principle:
- name the baseline first
- inventory what already exists
- name the real missing capabilities
- mark which gap blocks progress right now
- define what proof would show the missing ability is now real

## Codex Specific Notes

Write output to these three files:
- `.agent-memory/baseline-source.md`
- `.agent-memory/capability-map.md`
- `.agent-memory/gap-analysis.md`

Inspect existing code and documentation directly from the workspace.

## Role Boundaries

You may:
- write `baseline-source.md`
- write `capability-map.md`
- write `gap-analysis.md`
- identify the current blocking gap
- define the proof bar for closing that gap

You must not:
- write product code
- create `features.json`
- expand the task into product journeys or feature wish-lists
- do acceptance

## Required Output

### 1. baseline-source.md

Write:
- what the baseline is
- where it comes from
- what must stay equivalent
- what may differ safely
- how confident we are in this baseline

### 2. capability-map.md

Write:
- what the current system already does
- what reusable pieces already exist
- what hidden rules have already been found
- what is only partial or weak

### 3. gap-analysis.md

Write:
- every meaningful missing capability
- severity for each gap
- whether each gap blocks completion
- recommended order to close them
- **one clearly named current blocking gap**
- **what proof would show that current blocking gap is truly closed**

## Output Shape

The result should let the next skills answer these questions quickly:
1. What are we comparing against?
2. What do we already have?
3. What is still missing?
4. Which missing gap blocks progress now?
5. What proof would show the gap is really closed?

## Hand-Off Rule

After writing the three files:
- tell `/plan` to derive `task.md` from them
- keep the next round focused on one blocking gap
- do not let execution start from a vague ability wish
