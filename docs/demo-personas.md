# Demo personas and scenes (task Q5)

Run `npm run demo:reset` before every rehearsal and before the real demo. It empties everything people made, keeps the campus catalog, and recreates the people below. Everybody's password is `demo-password-1`. If the catalog is empty it loads the labelled **[DEMO]** places (not the real map). They are laid out from `DEMO_GRID_ORIGIN` in `.env` (`latitude,longitude`, for example `1.3478,103.6803`; default: near the middle of NTU), and running the reset again moves them, so Hall A can be exactly where you are standing. On a deployed server run it with `DEMO_RESET_CONFIRM=yes`.

| Person      | E-mail                   | State after reset                                                                                   | Shown in scene |
| ----------- | ------------------------ | --------------------------------------------------------------------------------------------------- | -------------- |
| Dana Driver | demo.driver@e.ntu.edu.sg | holds **both** roles; vehicle SDEMO1D; presets "Shared ride to the gate" and "Solo run to the gate" | 1, 2, 3, 5, 6  |
| Priya Rider | demo.rider1@e.ntu.edu.sg | $20.00, 4 completed rides                                                                           | 2, 3, 5        |
| Wei Rider   | demo.rider2@e.ntu.edu.sg | $1.00, 0 rides (under $2: cannot ask for a ride)                                                    | 4 (too low)    |
| Sam Low     | demo.rider3@e.ntu.edu.sg | $2.50, 3 rides (under $3: warning; a $2 shared ride is fine, a $3 solo ride is not enough)          | 4 (warning)    |
| Lee Locked  | demo.locked@e.ntu.edu.sg | LOCKED, owes $0.70 from yesterday's trip                                                            | 6              |

## Scenes (click paths)

1. **Roles.** Sign in as Dana: _Choose role_ appears. Pick _driver_. Tap the role pill at the top: switch to passenger and back (refused if a journey is live).
2. **Go live and match.** Dana: _Go live_ > _Share my location and go live_. In a second browser, Priya: _Request a hop_, from Hall B to Main Gate > _Find a ride_ > _Choose this ride_ > wallet check says _enough_ > _Ask the driver_. Dana's _Requests_ card shows Priya: _Accept_. The seat and the hold are in place.
3. **The trip.** Dana: _Start trip_. In a terminal run `npm run replay-gps -- --url <the address>`: it plays Dana's route; Priya's _Your ride_ screen shows the dot moving and "driver is N m away". Dana: _Picked up_, _Dropped off_, _Complete trip_. Both rate. Priya's wallet drops by $3.00 and Dana's earnings are $3.00 (simulated).
4. **The wallet check, three ways.** As Priya the check is _enough_ and there is no banner. As Sam a yellow _getting low_ banner shows on the wallet and request screens; a $2.00 shared ride can be booked but a $3.00 solo ride says _not enough_. As Wei a red banner says to top up to at least $2.00 and _Find a ride_ is refused; the account is not locked, and one $5.00 top-up fixes it. (Booking on trust is switched off: the whole fare must be in the wallet.)
5. **Sharing.** Two riders (Priya and Sam) on one journey: both fares fall from $3.00 to $2.00 when the second is accepted; cancel one and the other goes back to $3.00.
6. **Locked account.** Sign in as Lee: the banner on every screen, _What you owe_ $0.70, top up $1.00, the account unlocks by itself.

`node scripts/ui-smoke.mjs` walks scenes 1 to 3 and 6 by itself in headless Chrome and saves a screenshot of every screen.
