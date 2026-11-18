# Cowork prompt: review the guided tour and the first-visit layers

Paste everything below the line into Claude Cowork. It needs its own browser (Chrome or Edge).

---

You are reviewing a live web app: the Working Hours Globe.
URL: https://granterogers.github.io/working_hours_globe/
The version number is shown in small type at the bottom centre of the map. It should be 1.112 or later.

Work in a private/incognito window so the app starts as a first visit. Do not change any code. Only look, click, and report.

## 1. First visit: the layers
Before you touch anything, check the layers panel (top left):
- Working hours, Favourites, Day and night, and Place names should start UNTICKED. Everything else starts unticked too.
- Half a second after the page is ready, the four should start to tick on, one every 2.5 seconds: Working hours at about 0.5 s, Favourites at about 3 s, Day and night at about 5.5 s, Place names at about 8 s. Each change should fade in on the map before the next one. The view should also glide slowly toward your location while this happens.
- Record the timing of each tick, and anything that looks abrupt, flickers, or is missing.
- Reload the page. It is no longer a first visit, so the layers should come up on, as before.

## 2. The guided tour
Click the "Get started" button at the bottom right. Go through all 29 steps with the Next button (Esc stops the tour). For EACH step record:
- Step number and title.
- Whether the spotlight ring is around the right thing. If the ring is missing, empty, or around the wrong thing, say so.
- Whether the card text matches what is visible on screen. Point out any word that describes something you cannot see.
- Whether the card stays inside the window and does not cover the thing it describes.
- Whether anything happens that looks wrong: a panel that stays open, a layer that stays on or off, an empty panel, a broken icon, text that is cut off, or a step that waits a long time.
- How long the step took before the card could be used (estimate in seconds).

Also check these specifically:
- Step "The place card": does the card show the local time and working-hours band clearly, and does the ring land on it?
- Step "Open in Google Maps": the cursor should move onto the link and rest there. Note whether it does, and whether the link is visible enough. Do NOT click it (that opens a new tab).
- Step "Save a favourite": after saving, does the place show as a heart on the map and in the favourites list?
- Steps about co-living and coworking: are the house and desk icons visible on the map, and does the filter panel open and show its options?
- Step "3D view": note whether the 3D view renders, and how long it takes. Note anything that freezes.
- Step "That is the tour": the tour should put back your starting layers, basemap and working hours. Check the layers panel and the basemap menu afterwards.

## 3. The co-living filter
Turn on Colivings in the layers panel and open its funnel (filter) button. At the top of the filter panel there should be a line "Listings last checked <date>". Note the date, whether it looks recent (within about three days), and whether it reads clearly.

## 4. Smaller checks
- Resize the window to phone width (about 390 px). Note any overlap, cut-off text, or sideways scrolling.
- Click the "Get started" button a second time after the tour ends. It should start again cleanly.

## 5. Report
Give a report in this format:

### Summary
Three to five sentences: what works well, and the most important problems.

### Problems, most serious first
For each: step or area, what you saw, what you expected, and suggested fix. Mark each one as "blocker", "bug", or "polish".

### Tour order
The current order has 29 steps. Suggest a better running order that is logical for someone seeing the app for the first time. Say which steps to merge, drop, or move, and why. Keep the working hours explanation before the colour key, and keep the place card steps together.

### What I did not manage to check
Anything you could not test, and why.

Be specific: name the step, the element, and what you saw. Do not guess where you did not look.
