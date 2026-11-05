# Bug finder f3: screens and flows (live map from 1ec4320, double taps, deep links, presets, history)

12 new findings, all reproduced on the shared app with my own accounts (f3-{a,c,d,e}-*@e.ntu.edu.sg). Details: find-f3.json. Scripts and screenshots: find-f3/.

## The new live map and "Driver is N m away" line (commit 1ec4320)
- **N-f3-01 (medium)**: a fix with poor accuracy (500 m) at the stop gives "Driver is 0 m away, about 1 min." while the chip stays "Approaching". The client works out the distance from every fix; the server ignores fixes worse than 50 m. "about 1 min" also shows at 0 m.
- **N-f3-02 (medium)**: after "Arrived", the driver drives about 7 km away and the rider still reads "Your driver has arrived." (pick-up status only moves forward). The chip also stays "Approaching" at 332 m.
- **N-f3-03 (low)**: once the position is stale, the distance line keeps the old number under "Last position 21 s ago".
- **N-f3-04 (low)**: if the rider reloads or presses Back during the trip, the car and the distance are gone until the next fix.
- **N-f3-05 (medium)**: the driver's journey map keeps saying "Live position" after location is blocked, because `receivedAt={Date.now()}` is passed on every render (DriverTripPages.tsx:219).
- **N-f3-06 (low)**: the rider's map draws only the driver's original route. The rider's stop has no marker, and the car sits off the line when it is at that stop.
- **N-f3-12 (low)**: distances are always in metres ("7021 m away").
- After pick-up the line does disappear: it was gone at 0.5 s and at 5 s. No wrong number was seen after pick-up.

## Buttons and double taps
- **N-f3-07 (medium)**: Decline has no busy state. A double tap, or Accept followed by Decline, shows the red "Only a request waiting for an answer can be declined." after the action worked.
- **N-f3-08 (low)**: double-tapping "Ask the driver" or "Yes, cancel" sends two POSTs. The second gets a 409, and nothing shows on screen.
- A double tap on "Find a ride" or "Save preset" sends only one request (OK).

## Deep links, empty and error states, presets
- **N-f3-09 (medium)**: /driver/complete/<any id> shows "Trip complete. You earned $0.00", even for a journey that is still live or an id that does not exist.
- **N-f3-10 (low)**: /driver/presets/<bad id> shows an empty Edit form. The 404 appears only after Save.
- **N-f3-11 (low)**: the vehicle form on Profile is empty although the vehicle is saved. There is no GET route for it.
- /driver/journey/bad and /driver/trip/bad show "not found" correctly. Editing a preset that is in use while live saved without trouble.

## History after cancels and no-shows (no new bug)
- No-show then complete: the rider's Trips shows "Completed | No Show | $0.00 | No Charge", the hold is released, and the driver's row shows "No Riders $0.00". The rider who cancelled shows as "Cancelled". The ride page for a no-show is already covered by B-NB-018.

## Not counted (checked, already known or my setup)
- Notification links land on Home (C-039). Pick-up times in the past (known). The fare note on finished or cancelled bookings (C-026 and B-NB-024). The "Request is open after the ride" I first saw came from my API setup leaving out hopRequestId; the UI sends it.
- At 360 and 390 px, light and dark, no screen scrolled sideways.
