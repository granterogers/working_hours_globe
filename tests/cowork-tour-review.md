# Cowork review: Working Hours Globe (tour, filters, first visit, glitches)

Paste everything below the line into Claude Cowork (or Claude in Chrome).

---

You are testing a live web app: the Working Hours Globe.
URL: https://granterogers.github.io/working_hours_globe/
Version: small type at the bottom centre of the map. It must read 1.122 or later. If it reads lower, stop and say so; the review is not valid until the new version loads.

Your job is to find real problems: things that are broken, slow, missing, glitching, or highlighted where there is nothing to see. Do not change any code. Only look, click, measure and report. Be specific: name the step, the element, the time, and quote what you saw. If you did not check something, say so. Do not guess.

## 0. Set up
- Use a fresh profile or private window. To test a first visit without clearing anything, add `?welcome` to the URL, for example https://granterogers.github.io/working_hours_globe/?welcome. Say which method you used.
- Allow location when asked. The first-visit glide toward your location only happens with location allowed. If you deny it, say so.
- Keep the window in the foreground and the page visible throughout. If the page stops drawing (blank map, frozen cursor, screenshots failing), stop that measurement, note the time, and re-run that step once.
- Test at 1280 × 800 (desktop) and 390 × 844 (phone). Record both window sizes and your browser at the top of the report.

## 1. First visit: layers and the glide
Watch the Layers panel (top left) from the moment the loading message ("Loading the map…") disappears. Call that moment READY.
- At the start, all eight layers must be unticked.
- At about READY + 0.5 s, Working hours should tick on. Then Favourites at about +3 s, Day and night at about +5.5 s, Place names at about +8 s.
- Each change should fade in on the map before the next one starts. Describe what you see during each fade.
- With location allowed, the view should glide slowly toward your location. Say where it starts, where it ends, and how long it takes.
- Reload the page. It is no longer a first visit, so the four layers should come up on at once.
Report the actual times and anything that flickers, pops on, or is missing.

## 2. The Get started button
- The Get started button must sit at the bottom middle of the screen, and stay there.
- Click a few places on the map, and open a place card. The button must still be visible while the card is open. On a phone, the card may cover it; note that and nothing more.
- Click the small × at the top right of the button. The button should disappear. Reload. It should stay hidden. Report whether that happens.

## 3. The guided tour: all 29 steps
Click Get started. Use Next to move through all 29 steps. Esc is not tested. Stop the tour with × only at step 29, or earlier if it breaks.

For EACH step, record:
- Step number, title, and the time from clicking Next until the card can be read (in seconds).
- Ring: is the ring around the element the text describes? Name the element.
- Empty highlight: is the ringed area actually showing something? A ring around empty map, a blank panel, or a missing icon is a problem. Say so.
- Text against screen: does everything the text describes appear on screen? Quote any phrase you cannot see.
- Card: does it stay inside the window, and avoid covering its target?
- Anything else wrong: a panel left open, a layer stuck on or off, cut-off text, a broken icon, a flicker, a long wait.
- Screenshot file name.

Check these in particular:
- Step 3 (Working hours): the settings panel should not hide the search bar.
- Step 4 (Shift and season): the shift should be back at 12:00–20:00 at the end. Read the times.
- Step 10 (The place card): read the local time and time zone on the card. The ring should be on the time block.
- Step 11 (Open in Google Maps): the cursor should move onto the link and stay there, without clicking it.
- Step 12 (Save a favourite): after saving, the place should show as a heart on the map and in the favourites list.
- Steps 15 and 16 (Weather, then Flights): after the forecast opens and closes, the photo strip should still show its thumbnails.
- Step 18 (Filter co-living spaces): the co-living filter panel should open and stay open while the step is shown, with its options visible: search, type, price, rooms, minimum stay, rating, region, pop-ups by month, and interests and vibe. Report every option you can read, and any option that is missing or cut off. Report whether the ring is around the whole panel.
- Step 20 (Filter coworking spaces): the coworking filter panel should open and stay open, with its options visible: kind, brand, opening hours, contact details, and facilities. Report the same things as for step 18.
- Steps 17 to 20 are heavy. Measure how long each takes, and whether the map is busy (blank, frozen cursor) while it waits.
- Step 21 (Webcams): report whether camera icons appear on the map.
- Step 22 (Current weather): report whether temperature readings appear on the map and in the card. If the weather service does not respond, say so; that is not a tour fault.
- Step 23 (Day and night): report whether the night side is shaded on the globe, and whether the view is on the whole globe.
- Step 24 (Base maps): report each base map as it changes, and whether it renders.
- Step 25 (3D view): wait up to 240 s. Report whether the 3D view renders, how long it takes, and whether anything freezes. Also list any missing-icon warnings in the console.
- Step 26 (Back to the globe): the view should return to the whole globe in 2D, with the street map. Report the zoom you see.
- Step 27 (Point north): report whether the north button is ringed, and whether "Go to my location" is ringed. It should not need to be.
- Step 28 (Around the world): the tour should fly to Berlin, Madrid, Tokyo and Sydney in turn. For each, read the time zone on the card and compare with the expected value below.
- Step 29 (That is the tour): the layers, basemap and working hours should be the same as before the tour. Report the Layers ticks, the basemap in the menu, and the working-hours times. The view should be the whole globe.

Expected time zones on the place card:
- Berlin: CET, one hour ahead of the UK.
- Madrid: CET, one hour ahead of the UK.
- Tokyo: JST, nine hours ahead of the UK.
- Sydney: AEST or AEDT (depending on the date), ten or eleven hours ahead of the UK.
- Lisbon: UK time, the same as the UK.

## 4. Filters outside the tour
Tick Colivings in the Layers panel, then open its funnel. Read the line "Listings last checked …". Report the exact text, whether the day count is right for today, and whether "yesterday" or "today" is used only when it is true. Then do the same for Coworking spaces.

## 5. Phone width (390 × 844)
Reload at this size. Report whether the Layers panel overlaps the search bar, whether the search bar overlaps the 3D or north buttons, whether any label is cut off, whether the tour card covers the colour key in step 5 or the Get started button, and whether the page scrolls sideways.

## 6. Glitches and slowness (across the whole run)
- Missing graphics: map tiles, icons, labels or panels that should be there and are not.
- Empty highlights: any ring, glow or arrow pointing at nothing. List each one.
- Flicker, black frames, or layers that pop rather than fade.
- Slowness: any action that takes more than 5 seconds to show a result. Give the step and the time.
- Console errors and warnings (open the browser's developer console). Quote the first few different messages.

## 7. Restart
After the tour ends (or on step 29), click Get started again. It should start from step 1 with nothing left over from the last run.

## 8. Report

### Setup
Browser, window sizes, first-visit method, location allowed or not, and whether the page drew throughout.

### Summary
Three to five sentences: what works, and the most important problems.

### Table of tour steps
One row per step: number, title, ring (yes / no / wrong / empty), text matches (yes / no), card inside window (yes / no), time to readable (seconds), screenshot file, and short notes.

### Problems
Most serious first. For each: area or step, what you saw, what you expected, the most likely cause (file and function if you can tell), and a suggested fix. Mark each as "blocker", "bug", "glitch" or "polish".

### Empty highlights and missing graphics
A separate list: each one, with the step and what should be there.

### Slowness
A separate list: each step or action over 5 seconds, with the time.

### Could not verify
Anything you could not test, and why. Do not count these as passes or fails.

### Tour order
Suggest a shorter, logical order for a first-time visitor, with the reason for each merge or move. Start from this order and say where you agree or disagree:
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
