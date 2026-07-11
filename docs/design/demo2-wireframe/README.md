# Demo2 Wireframe

This low-fidelity wireframe defines the proposed public demo journey for ARK.

## Screens

1. Build the `22408` event, four subject sub-apps, one question bank, and three representative focus works.
2. Arrange the English II workflow, detection threshold, Fork branches, and mandatory parent return.
3. Run a deterministic failed attempt, complete a Fork focus work, return to the parent, pass, and show the workflow archive.

## Design Constraints

- The page is a guided product demonstration, not a full management console.
- Four sub-apps demonstrate scope; English II demonstrates the complete mechanism.
- Todo, schedule, achievement, and task binding remain secondary.
- The actual path and quality improvement are the main settlement evidence.

## V2 Model Correction

`demo2-wireframe-v2.drawio` separates stable definitions from repeated runtime instances:

- Event, sub-app, question bank, focus work, workflow, and Fork configuration are global definitions.
- Starting a workflow creates a new workflow run.
- Every executed focus work creates its own focus-work run archive.
- Fork and return paths belong to one workflow run and do not mutate the workflow definition.
- Settlement returns to the same workflow entry so another independent run can be started.

## V3 Runtime Correction

`demo2-wireframe-v3.drawio` aligns runtime presentation with the current focus-work implementation:

- While a focus work is running, the whole work area is dedicated to its exercise template.
- A choice template may split reading material and questions, but both columns belong to the exercise itself.
- Workflow paths and run archives are not permanently visible beside the exercise.
- Focus-work detection and Fork selection replace or overlay the exercise only after that focus work ends.
- The complete actual path is shown only after the entire workflow run finishes.
- The first screen now uses the event as the outer container, groups all four subjects under an explicit sub-app section, and expands the selected English II sub-app into its question-bank, focus-work, and workflow definitions.

## Fork-first Homepage Variant

`demo2-wireframe-fork-first.drawio` keeps the established hierarchy and makes the homepage differentiator explicit:

- The left side explains how question banks, specialized training, and training plans organize learning.
- The right side shows a real Fork outcome: failed parent training, targeted branch, mandatory return, and successful re-validation.
- The runtime, focus-work result, and workflow settlement screens remain unchanged from V3.

`demo2-wireframe-fork-first-v2.drawio` additionally replaces all visible `sub-app` wording with `learning module` wording and introduces an explicit multi-plan selector before training starts.
