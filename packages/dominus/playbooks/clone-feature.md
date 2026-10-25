# Playbook: clone a feature

The Dominus reads this before planning when the owner asks to copy a feature ("copy this for me",
"clone the calculator of this app") and gives a link, a path on the computer or a file. Making
neurons this way is one of the Cerebro's main purposes: the best result for the least effort of
the owner. This file is the base that ships with the Cerebro; what each install learns goes to
`playbooks/clone-feature.lessons.md` in the data folder and is read right after it (see
_Lessons_).

## 0. What is copied

The feature, never the code. Functionality is not protected by copyright (ideas, procedures and
methods are not; in Brazil, Lei 9.610, art. 8), so the Builder studies how it behaves and writes
its own code. The look is the Cerebro's kit: never the original's name, logo or visual identity.
Watch the site's terms about automated access (observing one feature for personal use is low
risk) and only decompile programs to understand them and rebuild in the owner's own app.

## 1. Understand the request

- **Target:** a web page or web app (link), a program on the computer (path), a mobile app (APK)
  or a file. The target decides the tools (step 3).
- **Scope:** which feature, exactly. An app with several features and a vague request gets one
  question before anything else ("only the CDB yield calculator, or the whole simulator?"). Ask
  at most 3 questions, and only what cannot be found by looking.
- **What "done" means:** the clone gives the same results as the original for the same inputs,
  covers the cases the original covers, and fixes what its users complain about when that is
  cheap.

## 2. Observe the original (the Navegador)

- Open the target and use only the requested feature, as a person would.
- Record each screen (screenshot), each field (name, type, limits, default, mask, validation
  message) and each output (format, rounding, units).
- Record the network (HAR): the calls the feature makes, their inputs and outputs. When the
  logic runs on the server (the usual case for calculations), this and step 4 are the only way
  in, with or without decompiling.
- Never sign in, pay or submit anything on the owner's behalf without asking.

## 3. Read what reaches the device (when there is something to read)

| Target                   | Where the logic is                                   | How                                                                           |
| ------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| Web page or app          | JavaScript sent to the browser (and its source maps) | read the bundles from the HAR                                                 |
| Electron program         | packed JavaScript (`.asar`)                          | extract and read                                                              |
| .NET, APK, native binary | compiled code                                        | the Engenharia reversa neuron (REA), installed only when needed, after asking |

Every conclusion points to its evidence (file and line, request, screenshot). What could not be
proven is a **gap**, said as such, never guessed.

## 4. Build the answer key

The answer key turns "looks similar" into "gives the same numbers", and is what lets the Builder
correct itself without the owner.

- Run the feature with many inputs: typical values, zero, minimum and maximum, empty, very long
  terms, the edges between brackets (tax ranges, tiers, dates such as month and year ends,
  weekends and holidays when days matter).
- Keep each case as `{ input, output, source }`; source is "observed", or the link of a manual
  or forum example.
- Aim for at least 10 cases for a calculation and 5 for a flow. More where the rules branch.

## 5. Research everything written about the tool

Read, in this order, until the rules stop changing (depth limits how many sources):

1. **Official manual, help center and FAQ:** the rules and the edge cases observation misses.
2. **Domain rules:** the official formula and its regulations (e.g. compound interest, income
   tax brackets, IOF, business-day counts), from the regulator or a primary source.
3. **Release notes:** how the feature changed and why.
4. **Forums and communities** (official forum, Reddit, Stack Overflow, app store reviews):
   known bugs, complaints and what people use most.
5. **Tutorials and videos** (through the transcript): real use, and examples with numbers, which
   become extra cases for the answer key.

A forum is a hint, not proof: a rule from it counts only when the manual or the answer key
confirms it. Every rule is kept with its link.

## 5b. Do not reinvent the wheel

Look for the free libraries that do the hard part (reading and writing PDFs, ZIPs, spreadsheets,
charts, dates, maps, Markdown, image handling...) and record each with `add_library` (its npm
package). The Cerebro accepts only what is free to use (a permissive license), widely used (many
downloads a week) and runs in a browser; if one is refused, the answer says why: look for another.
The neuron carries the accepted ones inside its folder, so they cost nothing and need no network.
Never plan to write by hand what a known library already does well.

## 6. The plan

Besides the usual parts of a plan, a clone plan shows:

- what was observed (screens, fields, calls), with the main screenshot;
- how many cases the answer key has, and the formula or rule found for each output;
- the rules found, each with its source;
- improvements suggested by the complaints, marked as optional;
- the free libraries it will carry, with their license and use;
- the gaps;
- the cost: internet and tokens of the research already spent, and the estimate of the build.

## 7. Build and check

- The Builder receives the plan, the answer key and the rules, never the original's code.
- The clone is checked against every case of the answer key. A case that fails goes back to the
  Builder with the difference; one that still fails after two rounds becomes a gap told to the
  owner, with the case.
- The answer key stays with the neuron, so a later adjustment is checked against it again.

## Lessons

After each clone, the Dominus writes what it learned to `playbooks/clone-feature.lessons.md` in
the data folder: one item per lesson, in the form below, never the owner's data (no names,
values or links of their own). The Sonho consolidates them: repeated lessons become one, wrong
ones go away. What proves useful in many installs goes into this base through the project.

```md
- **When:** <the kind of target or feature>
  **Do:** <the rule>
  **Because:** <what happened without it, in one line>
```
