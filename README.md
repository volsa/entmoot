# Entmoot

Entmoot is a read-only, skill-driven review harness. It allows you to turn any skill in your project
into an individual agent to conduct a thorough review of the changes in your branch. Results are then
presented in your terminal or in your pull request.

For example, the following patch turns the `.agents/skills/bug-hunter/SKILL.md` into an agent
```diff
---
name: Bug Hunter
description: Finds concrete runtime defects, code that crashes, computes wrong results, or corrupts state
+entmoot:
+    mode: deep
---

[...]
```

Supported platforms are GitHub and Gitea, though any GitHub Actions compatible platform should work.


## Quickstart

```bash
# Initialize Entmoot in your project
npx github:volsa/entmoot init

# Review your changes in this branch
npx github:volsa/entmoot review
```


## GitHub Actions

On a pull request, Entmoot posts its findings as one new comment per run. Add exactly one of
`ENTMOOT_OPENROUTER_API_KEY`, `ENTMOOT_OPENAI_API_KEY`, or `ENTMOOT_ANTHROPIC_API_KEY` as a repository secret,
which selects the provider, and commit a workflow like
[the one reviewing Entmoot itself](.github/workflows/entmoot.yml), running a pinned revision of the tool instead
of building it:

```yaml
- run: npx github:volsa/entmoot#<commit sha> review
  env:
      ENTMOOT_OPENAI_API_KEY: ${{ secrets.ENTMOOT_OPENAI_API_KEY }}
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```


## Safety

Being a read-only harness, Entmoot eliminates most attack vectors. Secret leakage, however, is still
possible. An external contributor could add an Entmoot review skill that instructs the agent to read and
include e.g. the `OPENAI_API_KEY` environment variable in its review. Another attack vector is resource
exhaustion, where an external contributor opens hundreds of pull requests to burn through your tokens.

Entmoot is defenseless against these sorts of attacks. It is therefore recommended to require explicit
approval of workflow runs for external contributors. In GitHub, go to "Settings > Actions > General", and
under "Fork pull request workflows from outside collaborators" select "Require approval for all external
contributors".


## Architecture

<!-- TODO: Description of architecture once somewhat implemented -->

```mermaid
flowchart LR
    Discover[Skill discovery] --> S1[Skill #1] & S2[Skill #2] & SN[Skill #n]

    S1 & S2 & SN --> Filter[Filter]
    Filter -.-> Dropped[Dropped]

    subgraph orch [Agent orchestration]
        direction TB
        D1[Diff] --> A1[Agent #1]
        DN[Diff] --> AN[Agent #N]
    end

    Filter --> orch
    A1 & AN --> Merge[Merge]
    Merge --> Report[Report]
```
