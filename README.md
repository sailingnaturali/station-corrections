# @sailingnaturali/station-corrections

Friendly names, search aliases and corrected positions for tide and current stations.

Provider station IDs (`noaa/9447659`, `chs-active-pass`, `PUG1717`) come with names
that are often shouted, abbreviated, or otherwise unfit for display or search. This
package overlays clean names, human context, search aliases, and position
corrections on top of raw provider data — no network access at runtime.

## Install

```bash
npm install @sailingnaturali/station-corrections
```

## Usage

```js
import { cleanName } from "@sailingnaturali/station-corrections/src/clean.js";

cleanName("CHERRY POINT"); // "Cherry Point"
cleanName("NAS Whidbey Island"); // "Naval Air Station Whidbey Island"
cleanName("Spee-Bi-Dah"); // "Spee-Bi-Dah" — human-cased names pass through untouched
```

## Status

Early scaffold. `cleanName` (provider name cleanup) is the first of several layers;
see the repo's task history for what's next.
