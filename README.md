# party-games

Template for building 'Jackbox' style games. Utilize to iterate board game designs.

---

# Claude Welcome Message

Hi Claude — welcome to the **party-001** project.
This repository contains the foundation for a **Jackbox-style party game shell** where new games can be added quickly as modular "plugins." The end goal is a framework that lets me build & iterate on small multiplayer games that run on phones with a room code system.

### **Two key documents guide this project:**

---

## **SPEC — What we are building**

Located at: [`docs/spec`](docs/spec)

This defines:

* the overall architecture
* core engine concepts
* game template system
* networking model
* UX flow
* roles of host / players
* how new games should be structured

This is the **source of truth** for the final system design.
Whenever you implement features, please check your work against the spec.

---

## **PLAN — How we will build it**

Located at: [`docs/plan`](docs/plan)

This document translates the spec into **phased, incremental PRs**, including:

* task breakdown
* acceptance criteria
* the order we will build components
* what belongs in each PR and what is out of scope

It's the execution guide. Follow it phase by phase.

---

## **Your role**

You will help implement the system by:

* generating PR branches
* scaffolding folders & files
* writing TypeScript/Next.js/React code
* asking clarifying questions before making structural decisions
* ensuring each PR matches the corresponding phase in PLAN

Don't jump ahead.
We build **one phase at a time**, review, then continue.

---

## **Before we begin**

Please read both **docs/spec** and **docs/plan** carefully.

Then:

### **Ask any clarifying questions you have about the architecture, project goals, constraints, or implementation details before starting Phase 1.**

I want to make sure you fully understand the system before generating the first PR.

---

Excited to build this with you.
