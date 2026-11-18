# Review prompt: Working Hours Globe, tour and first visit (v1.115+)

Paste everything below the line into Claude in Chrome (or Cowork with its own browser).

---

You are reviewing a live web app: the Working Hours Globe.
URL: https://granterogers.github.io/working_hours_globe/
Version: small type at the bottom centre of the map. It must read 1.115 or later. If it reads lower, stop and say so; the review is not valid until the new version loads.

Do not change any code. Only look, click, measure and report.

## 0. Set up the test properly
- Use a fresh profile or private window, so the app starts as a first visit. If that is impossible, clear this site's saved data and say so in the report.
- Allow location for this site when asked. The view glides toward your location on a first visit, so that step can only be checked with location allowed. If location is denied, say so.
- Keep the window in the foreground and the page visible for the whole run. If the page stops drawing (blank map, frozen cursor, or screenshots failing), stop that measurement, note the time, and re-run that step once. Do not estimate timings you could not observe.
- Run the desktop checks at 1280 × 800, and the phone checks at 390 × 844.
- Record the window size and the browser version at the top of the report.

## 1. First visit: the layers
Before clicking anything, watch the top-left Layers panel, and time from the moment the loading message ("Loading the map…") disappears. Call that moment READY, and use its time as zero.
- At the start, the four layers Working hours, Favourites, Day and night, Place names must be unticked. The other four must also be unticked.
- At about READY + 0.5 s, Working hours should tick on. Then Favourites at about +3 s, Day and night at about +5.5 s, Place names at about +8 s. Measure each tick and report the actual times.
- Each change should fade in on the map before the next starts. Describe what you see during each fade, in a sentence.
- The view should glide slowly toward your location during this. Say where it started, where it ended, and roughly how long it took.
- Reload the page. It is no longer a first visit, so the four layers should come up on at once. Confirm this.

## 2. The guided tour: all 29 steps
Click "Get started" (bottom right). Use Next to move through all 29 steps. Esc is not tested. End the tour with the × only in step 29, or before it if something breaks.

For EACH step, record:
- Step number, title, and the time from clicking Next until the card can be read (in seconds).
- Ring: is it around the element the text describes? Name the element. If there is no ring, or it is on the wrong thing, say so.
- Text against screen: does everything the text describes appear on screen? Quote any phrase you cannot see.
- Card: does it stay inside the window, and does it avoid covering its target?
- Anything wrong: a panel left open, a layer stuck on or off, an empty panel, a broken icon, cut-off text, a long wait.
- Screenshot file name, so the step can be checked later.

Check these in particular:
- Step 3 (Working hours): the settings panel should not hide the search bar. If it does, note it.
- Step 4 (Your shift and season): the shift should be back at 12:00–20:00 by the end of this step. Read the start and end times in the panel and report them.
- Step 10 (The place card): the ring should be around the local time and working-hours block. Read the local time and time zone on the card and report them.
- Step 11 (Open in Google Maps): the cursor should move onto the link and stay there. It must not click the link. Report whether it stays.
- Step 12 (Save a favourite): after saving, the place should appear as a heart on the map and in the favourites list. Say what it looks like on the map.
- Steps 15 and 16 (Weather, then Flights): after the forecast opens and closes, the photo strip in the card should still show its thumbnails. Report whether it does.
- Steps 17 to 20 (Co-living and coworking, with their filters): wait until the map has finished loading before judging. Report whether the house and desk icons appear, and how long they take.
- Step 21 (Webcams): report whether camera icons appear on the map.
- Step 22 (Current weather): report whether temperature readings appear on the map and in the card. If the weather service does not respond, say so; that is not a tour fault.
- Step 23 (Day and night): report whether the night side is shaded on the globe.
- Step 24 (Base maps): report the basemap each time it changes, and whether it renders.
- Step 25 (3D view): wait up to 150 seconds. Report whether the 3D view renders, how long it takes, and anything that freezes. Also list any missing-icon warnings you can see in the console.
- Step 26 (Back to the globe): report whether the view returns to 2D and the street map.
- Step 27 (Point north): report whether the north button is ringed, and whether "Go to my location" is ringed. It should not need to be.
- Step 28 (Around the world): the tour should visit Berlin, Madrid, Tokyo and Sydney in turn. For each one, read the time zone on the card and compare it with the expected value below.
- Step 29 (That is the tour): the layers, basemap and working hours should be the same as before the tour. Report the Layers panel ticks, the basemap in the menu, and the working-hours times.

Expected time zones on the place card (compare exactly):
- Berlin: CET, one hour ahead of the UK.
- Madrid: CET, one hour ahead of the UK.
- Tokyo: JST, nine hours ahead of the UK.
- Sydney: AEST or AEDT (depending on the date), ten or eleven hours ahead of the UK.
- Lisbon: UK time, the same as the UK.

## 3. Co-living filter
Tick Colivings in the Layers panel, then open its funnel button. At the top of the filter panel, read the line "Listings last checked …". Report:
- the exact text,
- whether the number of days is correct for today,
- whether it says "yesterday" or "today" only when that is true.

## 4. Phone width (390 × 844)
Resize to 390 × 844 and reload. Report:
- whether the Layers panel overlaps the search bar,
- whether the search bar overlaps the 3D or north buttons,
- whether any label is cut off ("Working ho…", "Coworking s…" and so on),
- whether the tour card covers the colour key in step 5, or the Get started button,
- whether the page scrolls sideways.

## 5. Re-start check
After the tour ends, click "Get started" again. It should start again from step 1 with nothing left over from the last run. Report whether it does.

## 6. Report

### Setup
Browser, window size, first visit method, location allowed or not, and whether the page drew throughout.

### Summary
Three to five sentences: what works well, and the most important problems.

### Table of steps
One row per step: number, title, ring (yes / no / wrong), text matches (yes / no), card inside window (yes / no), time to readable (seconds), screenshot file, and notes. Keep the notes short.

### Problems
Most serious first. For each: step or area, what you saw, what you expected, and a suggested fix. Mark it "blocker", "bug", or "polish". Put a problem in the table notes, not here, if it is a single small thing.

### Could not verify
Anything you could not check, and the reason: the page stopped drawing, the weather service did not respond, location was denied, and so on. Re-run these where you can. Do not count them as passes or fails.

### Tour order
The current order has 29 steps. Suggest a shorter, logical order for someone seeing the app for the first time, with the reason for each merge or move. Start from this order, which the last review suggested, and say where you agree or disagree:

1. Welcome
2. Moving around the globe
3. Working hours, with shift and season
4. What the colours mean
5. The Layers panel
6. Day and night
7. Place names
8. Search any place
9. The place card, with Open in Google Maps
10. Weather for a place
11. Photos nearby
12. Flights from here
13. Save a favourite
14. Your favourites (layer and list)
15. Co-living spaces and filter
16. Coworking spaces and filter
17. Webcams
18. Current weather
19. Base maps
20. 3D view, in and out
21. Point north and your location
22. Around the world, and that is the tour

Keep the working-hours explanation before the colour key. Keep the place card steps together.

Be specific. Name the step and the element, quote what you saw, and say what you did not check. Do not guess.
