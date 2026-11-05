# find-f2: accounts, sessions and the API

Accounts used: f2-p1, f2-p2 (passenger), f2-d1 (driver), f2-b1, f2-b2 (both roles), f2-zw (odd name), all @e.ntu.edu.sg. Scripts and screenshots are in find-f2/.
Note: the server code changed while I tested (integration merge f2091e0 at 01:12). N-f2-05 was re-checked on the new code. The other findings touch files that did not change.

## New findings (6)
| id | sev | one line |
|---|---|---|
| N-f2-01 | medium | A name of only zero-width and RTL-override characters is accepted. The driver's bell shows '.pirt ruoy nioj ot deksa' and the request card has a blank name |
| N-f2-02 | medium | Two drivers can save the same vehicle plate. Plates are stored as typed (sf2001a, 'SF 2001 A') |
| N-f2-04 | medium | Two tabs of one account: after tab B switches to driver, tab A still says Passenger and gets 'Switch to your passenger role to do that.' |
| N-f2-03 | low | Riders on a shared trip receive each other's pickup:status / noshow:open socket events (booking id, distance, ETA) |
| N-f2-05 | low | Going live and switching to passenger at the same moment both succeed: a passenger session with a LIVE journey. On the old code the account was stuck; on the current code switching back works |
| N-f2-06 | low | Parallel sign-ups with the same e-mail: the losers get CONFLICT 'This conflicts with existing data.' plus the column name, not EMAIL_TAKEN |

## Checked and fine (no finding)
- All 42 non-public endpoints answer 401 AUTH_REQUIRED when signed out, and 401 INVALID_TOKEN with a garbage cookie.
- Ownership: a second passenger and a second driver both got 403 on all of these: someone else's booking (get, cancel, contact, rate, accept, decline, pickup-status), hop request (matches, cancel), journey (requests, bookings, position, start, complete, cancel), preset (update, delete, go live with it) and notification (read).
- Role gates: a passenger is refused on driver routes and on withdraw, and a driver is refused on hop-requests, each with a clear sentence. An unheld role is refused with 403. Adding a role you already hold gives 409.
- Bodies: extra fields are stripped (isDriver, dailyPaidTrips). `__proto__`, arrays, floats, form or text content types give 400. A body over 100 kB gives 413. Query arrays give 400. A 5000-character comment gives 400. 500s were seen only for bad %-encodings and NUL bytes (already known as NA-005).
- Socket: a non-participant cannot join or send location (FORBIDDEN). Joining before the start gives TRIP_NOT_ACTIVE. A rider sending location:update gives FORBIDDEN.
- CORS reflects only http://localhost:5173. The cookie is httpOnly with SameSite=Lax. Rating before completion is refused with 409.
