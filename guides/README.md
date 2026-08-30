# Trophy coaching guides

This directory contains researched coaching data used by the dashboard.

## Language

**All coaching content must be written in English.**

This includes:

- `strategy`
- roadmap `reason` fields
- trophy `tip` fields
- `patternTips`
- generated/fallback coaching UI copy

The main dashboard can remain in French, but the trophy advice itself is English.

## File naming

Each guide is named after the game's PSN communication ID:

```text
guides/<npCommunicationId>.json
```

Example:

```text
guides/NPWR42963_00.json
```

## Purpose

A guide enriches the live PSN data from `data/games/<id>.json` with:

- researched tips for specific trophies;
- reusable tips for groups of similar trophies;
- a recommended trophy roadmap;
- source links used to research the advice.

The dashboard compares the guide roadmap with the user's **actual earned trophies** and automatically selects the first roadmap step that is still missing as the recommended next trophy.

## Sources

Tips should be researched from multiple current sources when useful, such as trophy guides, achievement guides, community walkthroughs and authoritative game documentation.

Do not copy long passages from sources. Store concise original summaries and keep source URLs in the `sources` array.

## Fallback behavior

If a detailed PSN game file exists but no researched guide exists yet, `coach.js` still provides an English quick tip generated from the trophy requirement.

A researched guide should be added when the user actively starts or resumes hunting trophies for that game.
