---
name: Task
about: One branch-sized piece of work from the task board
title: '[ID] Title'
labels: ''
---

**Task:** <!-- e.g. C3 -->
**Lane / area / wave / size / tier:** <!-- e.g. L3 / BE / W2 / L / tier 1 -->

**Done when**

**Branch:** `feat/<ID>-<slug>`
**PR title:** `[<ID>] <title>`
**Depends on:** <!-- task ids that must be merged first -->
**Owns:** <!-- path globs; edits outside these need the owner's say-so -->
**Traces to:** <!-- UC-n, FR x.y, NFR-x.y, or a course deliverable -->

**Watch out**

Definition of done: typecheck and tests pass, new behaviour has tests, no edits outside `owns`, PR squash-merged into `dev` after one review from another lane.
