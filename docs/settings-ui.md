# Settings UI audit — 2026-10-01

The audit used Computer Use on the running Mac app: all ten Settings categories,
agent definitions, and the project settings page through its automation list.
Visual and interaction checks for the replacement use `/tmp/taskd-shot` and
Storybook, so testing changes no production preferences or tasks.

## Finding

The kit already had individual inputs and some useful compounds (ordered
editors, searchable pickers, list frames). It lacked a settings-specific
composition that owned the label, explanation, control width and row spacing.
`Section` gaps, `Field` margins and checkbox margins accumulated. Short values
occupied isolated columns, while buttons used to select hooks or perform
connection actions stretched across the page. Related controls did not read as
one decision. Project-specific runner configuration appeared before the
project's identity and execution defaults.

## Research and decisions

- [Apple: Settings](https://developer.apple.com/design/human-interface-guidelines/settings)
  and [Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles)
  informed the related preference groups and the distinction between a switch
  and a checkbox. Immediate preferences use switches; explicitly saved agent
  and automation definitions retain checkboxes. Multiple choices remain a
  checkbox group.
- [Carbon: Forms](https://www.carbondesignsystem.com/building-blocks/core/patterns/forms)
  informed meaningful grouping, ordering, persistent labels, and widths chosen
  for the expected value. Long text and ordered editors put labels above their
  controls. Short settings put their value beside the label, stacking when the
  available pane narrows.
- [W3C: Grouping controls](https://www.w3.org/WAI/tutorials/forms/grouping/)
  and [MUI: Text field accessibility](https://mui.com/material-ui/react-text-field/#accessibility)
  informed named groups and explicit relationships between native inputs,
  labels and descriptions. A browse/apply button keeps its own accessible name.
- [MUI: Switch](https://mui.com/material-ui/react-switch/)
  informed the native control implementation. Existing small-switch theme rules
  conflicted with MUI's nested sizing rules and clipped the thumb; the common
  theme now sizes track, thumb and travel together at both densities.
- [GOV.UK: Conditional questions](https://design-system.service.gov.uk/components/checkboxes/#conditionally-revealing-a-related-question)
  informed showing dependent controls directly beneath the choice that makes
  them relevant. The shared toggle owns this relationship, including visibility
  to keyboard and assistive technology. Keeping children mounted follows
  [React's state preservation guidance](https://react.dev/learn/preserving-and-resetting-state#preserving-state-for-removed-components)
  so switching a feature off and on preserves its draft.

This is a composition policy, not a rule to replace every select with segments.
Theme and hook execution kind are compact sets of visible choices. Agent, application, strategy
and inheritance values can be long and remain searchable selects. Only enabled
features reveal their dependent inputs and save actions. Conditional editors
also appear only for relevant modes (custom PR prompts, custom identity, selected
hooks, custom cron).

## Dependency review after the SSTP feedback

The first pass solved composition but missed whether controls should be usable
in the current state. The second pass checks each control against its runtime
prerequisites, rather than assuming every adjacent switch is its parent.

| Parent | Dependent controls shown only while enabled |
|---|---|
| SSTP delivery | Host, port, notification type, script list, variables and Save |
| External session import | Project creation, history range and manual import (the importer also requires the enable flag for manual runs) |
| Report AI | Writer, project instructions and task instructions |
| Each PR follow-up condition | Its prompt, in app and project settings |
| HTTP/gRPC and MCP | Port, Apply and current endpoint/status |
| Runner listener | Port, Apply, pairing action and pairing details |
| Multiple-PC host | Port, Apply, address and pairing controls |
| Project runner execution | Label/repository drafts and their Save actions |

Switches change activation alone. Switching off does not implicitly save project
runner drafts or the listener port; each retains its own Save/Apply action.
Project Runner activation needs a valid Git repository/remote first: requesting
activation without a saved remote opens a setup form, and **Save and enable** explicitly commits the
remote, labels and activation together. Cancel leaves it off; failed validation
keeps the editable setup open. This avoids hiding the very remote field needed
to make initial activation succeed. The kit's existing
[form dialog](https://mui.com/material-ui/react-dialog/#form-dialogs) owns that surface.
Saved preferences and unsaved drafts survive switching off and on within the
screen. Initial disabled state, enabling, disabling, re-enabling and explicit
save are covered in interaction tests.

Exceptions are intentional: existing runner/device revocation is still useful
while a listener is off. Starting the scheduler on app launch is not its main
on/off switch, so its poll interval remains available. Agent/group/automation
definitions and hook definitions can be prepared while inactive. Identity setup
must remain available before activation. Satellite pairing already appears only
while enabled; iPhone sync already prevents Sync Now while disabled.

## Control inventory

| Surface / controls | Composition and reason |
|---|---|
| General: launch, continue after close, worktree | Immediate switch rows grouped by responsibility |
| General: poll interval, import age, retention | Short numeric rows; units and zero-value meanings stay inside the input |
| General: import enable/create project/manual import | Related switch rows and a compact manual action within one group |
| General: default editor | Select plus browse action; action retains its natural width |
| General: GitHub identity | Identity readout/editor in a padded group; existing authorization flow preserved |
| Agents and groups: list/add/context actions | Existing tables and list bars retained; no extra card around the list |
| Agent: name, description, enabled | Basic group; checkbox because Save commits the draft |
| Agent: command, arguments, resume arguments, environment | Command input and full-width ordered editors; existing add/remove/reorder behavior retained |
| Agent: concurrency, timeout, fallback, limit patterns, cooldown, log format | Numeric widths, searchable choices, and full-width pattern editor grouped by responsibility |
| Group: name, description, strategy, default, members | Explicit-save checkbox and ordered membership editor; existing priority/reorder semantics retained |
| Hooks: selection, add/preset/remove, built-in report | Selectable list rows; compact list actions and separate built-in report readout/action |
| Hook: name, activation, kind, target, prompt/command, timeout | Named rows; two segments for AI/command; long content above full-width editor; override control belongs to its field |
| Hook: lifecycle events | Named checkbox grid that reflows with the pane; inherited fields remain disabled until overridden |
| Hooks: recent execution history | Existing execution list retained without redundant containment |
| Reports: activation, target, project and task instructions | Parent switch reveals the writer and full-width instructions with distinct labels; warnings remain adjacent |
| PR: failed CI, pending CI, conflict | Each condition names its switch and contains its prompt; removes repeated ambiguous Send labels |
| Notifications: review/failure events and system/SSTP delivery | Independent immediate switch rows grouped by responsibility |
| Notifications: SSTP receiver and scripts | Revealed beneath SSTP activation; explicit-save fields and repeatable scripts; drafts survive failed saves and off/on transitions |
| iPhone: sync enable, status, sync action, errors, conflicts | Switch plus status/action row; errors and conflict resolution retain their existing behavior |
| Multiple PCs: host, port, address, PIN, devices | Host switch; numeric input plus apply; compact pairing action/readout; device actions beside each device |
| Multiple PCs: satellite, state, discovered peers, address/PIN | Satellite switch; state/action block; address and PIN with adjacent pairing action |
| External connections: Runner, port, PIN, connected runners | Switch; port plus save; compact pairing; per-runner status/capacity/revoke grouped together |
| External connections: HTTP/gRPC and MCP | Switch, port/apply row, endpoint or error readout per service |
| External connections: connection file | Selectable path and supporting information grouped together |
| Appearance: theme | Three visible radio segments (dark, light, system) |
| Project: name, directory, editor, color | Basics first; full-width directory plus change action; select and swatches keep native choice behavior |
| Project: target, priority, concurrency, enabled | Execution group immediately after basics; short numeric fields and immediate switch |
| Project: runner enable, labels, repository | Runner-specific group after basic execution; saved label/repository input-action pairs |
| Project: hooks and report enable | Same hook editor and switch composition as global settings |
| Project: worktree inheritance | Mode select plus effective on/off hint when following global settings |
| Project: PR inheritance/custom/disabled | Mode row; custom mode reveals the same three condition/prompt groups |
| Project: identity inheritance/custom | Mode row with resolved identity or existing identity editor |
| Project: automatic task list and editor | Existing list; grouped task and schedule fields; saved checkboxes; named status multiselection; cron errors associated with their input |

## Reusable boundary

`SettingsGroup`, `SettingRow`, `SettingToggle`, `SettingsBlock`, `InputAction`
and `CheckboxGroup` own appearance and accessibility in the design system.
Call sites own labels, save timing, inheritance, validation and API behavior.
No domain vocabulary or renderer-specific styling is added to the kit.

Stories cover dark, light, narrow and comfortable layouts. Interaction tests
cover native accessible names/descriptions, error association, label activation,
independent multiselection and disabled inherited controls. Existing project,
hook, runner, network and connection tests cover their save contracts.
