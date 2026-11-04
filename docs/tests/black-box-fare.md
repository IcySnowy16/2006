# Black-box test of the fare calculation (task Q1, Lab 4 manual 3.2.1, 3.2.3, 3.2.4)

**Unit under test:** `FareTier.calculateFare(riders)` through `FareService.fareForRiders` (control class: FareService + the fare table; the routes only call it).
**Expected outputs come from the SRS, not from reading the code:** FR 5.1.1 one rider pays $3.00 (300 cents); FR 5.1.2 two or three riders pay $2.00 each (200 cents); a trip carries 1 to 3 riders (FR 3.1.2).

## Equivalence classes

| Class | Inputs             | Valid? | Expected           |
| ----- | ------------------ | ------ | ------------------ |
| EC1   | riders below 1     | no     | `VALIDATION_ERROR` |
| EC2   | exactly 1          | yes    | 300 cents          |
| EC3   | 2 or 3             | yes    | 200 cents each     |
| EC4   | riders above 3     | no     | `VALIDATION_ERROR` |
| EC5   | not a whole number | no     | `VALIDATION_ERROR` |

Boundary values: **0, 1, 2, 3, 4**. Minimised set: one case per class plus every boundary, no duplicates (TC6 and TC7 are the only inputs that are not boundaries: one representative of EC1 away from its boundary, and the only member of EC5).

## Test cases

Actual Output was copied from a real run on 19 Oct 2026 (`npx vitest run server/src/services/FareService.test.ts`, 10 tests passed, and the same values printed by calling `FareTier.calculateFare` directly).

| ID  | Class         | Test Input (riders) | Expected Output  | Actual Output    | Result |
| --- | ------------- | ------------------- | ---------------- | ---------------- | ------ |
| TC1 | EC1, boundary | 0                   | VALIDATION_ERROR | VALIDATION_ERROR | PASS   |
| TC2 | EC2, boundary | 1                   | 300              | 300              | PASS   |
| TC3 | EC3, boundary | 2                   | 200              | 200              | PASS   |
| TC4 | EC3, boundary | 3                   | 200              | 200              | PASS   |
| TC5 | EC4, boundary | 4                   | VALIDATION_ERROR | VALIDATION_ERROR | PASS   |
| TC6 | EC1           | -1                  | VALIDATION_ERROR | VALIDATION_ERROR | PASS   |
| TC7 | EC5           | 1.5                 | VALIDATION_ERROR | VALIDATION_ERROR | PASS   |

## The retier effect (FR 5.2, 5.11, 8.4)

| ID  | Test Input                                                                               | Expected Output                                                                         | Actual Output                                                 | Result |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------ |
| TC8 | Rider 1 is confirmed at 300 cents; rider 2 is confirmed (both at 300 before the recount) | Both fares 200 cents; both holds adjusted to 200; two `FareChanged` events (300 to 200) | Fares 200 and 200; holds `[b1, 200]`, `[b2, 200]`; two events | PASS   |
| TC9 | The recount is run again with no change in riders                                        | No change, no events                                                                    | No events                                                     | PASS   |

The same rule against a real PostgreSQL database (wallet rows and ledger) is in `server/test/money.int.test.ts` ("C1: FareService").

## Break it on purpose (the manual asks for this)

Changed `FARE_SHARED_CENTS` from 200 to 250 in `shared/src/defaults.ts` and ran the test file again: **4 tests failed** (TC3, TC4, the money-format test and TC8), then the value was put back and all 10 pass. So the cases are able to fail.

## How to rerun

```
npx vitest run --project server server/src/services/FareService.test.ts
```
