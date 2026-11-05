# find-f1: money and booking edge cases (4 new findings, all reproduced)

| id | sev | finding |
|---|---|---|
| N-f1-01 | high | One rider sends two bookings at the same moment to two drivers: both 201, both accepted, $6.00 held, both trips completed and charged ($3.00 x 2). Root: book() locks only the journey row (BookingService.ts:77/:101); accept() never re-checks the passenger. |
| N-f1-02 | medium | Rider asks at $2.00; the other rider cancels before Accept; the rider is confirmed and held at $3.00 with no FARE_CHANGED bell (accept writes the new fare before retier, BookingService.ts:165/:181). A rider with $2.00-$2.99 gets auto-declined instead. |
| N-f1-03 | high | A co-rider's NO-SHOW raises the already-picked-up rider from $2.00 to $3.00 (TripService.ts:151 retier). With $2.00 they end LOCKED owing $1.00; the driver gets $2.00. Same root as C-027, but a different trigger the rider cannot avoid. |
| N-f1-04 | low | The Withdraw box uses Number(): '0x2' pays out $2.00, '0x64' reads as $100, 'Infinity' enables the button and gives a generic error (AccountPages.tsx:106). |

Checked and found correct (no finding): last-seat race (two riders, two accepts at once: one CONFIRMED, other 409 SEAT_UNAVAILABLE, journey FULL 0, holds right); 3 riders at $2.00 with 1 no-show (the other two stay $2.00, driver $4.00); a top-up sent at the same moment as Accept (both apply, bal 800 held 300); the $100 cap with money on hold; cancel/decline/journey-cancel releases. In every run, the wallet history added up to the balance (TOP_UP + CREDIT - DEDUCT - PAYOUT), and HOLD - RELEASE - DEDUCT came to the held amount. The booking page, Trips and Trip complete numbers matched the history.

Own accounts: f1-*@e.ntu.edu.sg. All own journeys are completed or cancelled; no holds are left open. Scripts, logs and screenshots are in find-f1/.
