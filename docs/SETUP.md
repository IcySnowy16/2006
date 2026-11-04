# Setting it up: the manual steps (Docker, keys, accounts, hosting)

**Written so that someone who has never seen this project can do every step.**
- If you were handed this page: read "Read this first", pick a step, follow it, and send back what the step says to send back.

## README: from nothing to a running app

**Read this if you have never seen the project.**
- It takes you from an empty folder to the app open in your browser, and says what you should see at each point.
- If what you see differs, stop and go to step 11 (when something goes wrong).

**Which window do I type in? Git Bash, every time.** Windows has two command windows and this page uses **Git Bash**.

| | Git Bash | PowerShell |
| - | -------- | ---------- |
| How you can tell | the line before the cursor shows a path and the branch in brackets, like `/d/campus-hop-staging (Staging)` | the line starts with `PS` and a path, like `PS D:\>` |
| How to open it | in File Explorer open the folder, right-click an empty space, choose **Open Git Bash here** | Start menu or the blue icon |
| Use it for this page? | **Yes** | **No** |

If your line starts with `PS`, close that window and open Git Bash in the folder.

**Why it must be Git Bash.**

- This page uses tools that exist only there: `wc` (counts lines), `grep` (finds words in text), `head` (shows the first lines), and loops written with `while read`.
  - In PowerShell they say "is not recognized".
- Paths are written the Git Bash way (`/d/dev/campus-hop`, with forward slashes).
- **The big copy line in step 0 would damage your files in PowerShell.**
  - It writes files with `>`.
  - Windows PowerShell re-encodes what `>` writes (it adds a hidden byte-order mark or switches to UTF-16, depending on the version), which can break source files, and it corrupts binary files such as the icons.
  - Git Bash copies them byte for byte.
- Everything could be rewritten for PowerShell, but then every command would have a second spelling. One window, one set of commands, is simpler.
- Git Bash is installed together with Git for Windows. If you cannot find it, reinstall Git from git-scm.com and keep the default options.

Plain `git`, `cd`, `npm` and `docker` commands work in both windows, but do not mix windows in one job.

**How to paste into Git Bash.** Copy the command first (the **Copy** button on the page, or select the text and press Ctrl+C). Then click inside the Git Bash window and do **one** of these:

- press **Shift+Insert** (works in every version), or
- **right-click** inside the window and choose **Paste**, or
- press **Ctrl+Shift+V** (newer versions only).

- Do **not** press plain **Ctrl+V**.
- In Git Bash it does not paste; it can insert a hidden stray character, and the line then fails with "command not found" and strange symbols in front of the command.
- Nothing runs until you press **Enter**, so look at the pasted line first: it must read exactly like the command on the page.
- If anything odd is in front of it, press **Ctrl+C** to throw the line away and paste again.
- To copy something out of Git Bash, select it with the mouse; selecting copies it.

**What you need on your computer (install once)**

| Program | How to check it is there | You should see |
| ------- | ------------------------ | -------------- |
| Git for Windows (it includes **Git Bash**, the black command window) | type `git --version` in Git Bash | `git version 2.` and more |
| Node.js 22 (the LTS installer from nodejs.org) | `node --version` | `v22.` and more |
| Docker Desktop (step 1) | `docker --version`, and Docker Desktop shows "Engine running" | `Docker version 2` and more |
| VS Code (optional, to read the code) | `code --version` | a version number |
| A GitHub account that can see the repository | open https://github.com/softwarelab3/2006-SCSA-R3 while signed in | the repository page, not "404" |

**1. Clone it into a new folder.** Cloning means downloading a full copy with its history. Keep the folder **outside OneDrive**.

- Open File Explorer at the folder where you want the project (outside OneDrive), right-click an empty space and choose **Open Git Bash here**. On the owner's laptop this is `D:\`, so the clone ends up at `D:\campus-hop-staging`.
- The prompt shows that folder, and you are **outside** the project for now.
- Type this one line and press Enter:

```
git clone -b Staging https://github.com/softwarelab3/2006-SCSA-R3.git campus-hop-staging
```

**What you should see:**
- `Cloning into 'campus-hop-staging'...`, then progress lines, ending with `Receiving objects: 100% ... done.` and `Resolving deltas: 100% ... done.` It downloads about 140 MB, which takes one to two minutes.
- Wait until you are back at the prompt before you type anything else.

Then, **on a new line**, move into the folder that was just created. This is the step people forget: until you do it, Git commands say `fatal: not a git repository`.

```
cd /d/campus-hop-staging
```

**What you should see:**
- nothing is printed, but the prompt now ends with `campus-hop-staging` (in Git Bash it also shows `(Staging)`).
- Check with `git branch --show-current`: on a fresh clone it prints `Staging`. If you already made your own branch, it prints that name instead (for example `fix/make-staging-run`), which is fine.

**About that path (read this if you are not the person who wrote this page).**
- `/d/campus-hop-staging` is the Git Bash way of writing `D:\campus-hop-staging`. Git Bash needs `/d/...` with forward slashes; `D:\...` with backslashes does not work there.
- It works as typed only if you cloned into `D:\` (the owner's laptop). This full path also works from any folder, so you can paste it at any time to get back to the project.
- If you cloned somewhere else, use your own folder. To find it: open Git Bash in the folder you cloned into, type `pwd` and press Enter. It prints something like `/c/Users/you/projects`. Your command is that line plus `/campus-hop-staging`, for example `cd /c/Users/you/projects/campus-hop-staging`.
- Every later `cd` on this page has a full-path version for the same reason: you always know which folder you are in.

**2. Open it.**
- Type `code .` (or in VS Code choose File, Open Folder, and pick `campus-hop-staging`).
- You should see folders `dev`, `lab1`, `lab2`, `lab3` and a `README.md`.
- The code is in `dev`.
- Once step 0 is merged, `dev` contains `client` (the web app), `server` (the API), `shared` (the contract both use), `scripts`, `docker-compose.yml` and `package.json`.

**3. Install the packages.** First move into the `dev` folder (the app lives inside it). Type this and press Enter:

```
cd /d/campus-hop-staging/dev
```

(Short form, if the prompt already ends with `campus-hop-staging`: `cd dev`. If you cloned somewhere else, use your own folder plus `/dev`.)

**What you should see:** nothing is printed. The prompt now ends with `dev`.

Then, **on a new line**, install the packages (the slow step):

```
npm ci
```

**What you should see:**
- a progress line, and after two to four minutes something like `added 5xx packages` and you are back at the prompt.
- Warnings about "deprecated" packages or "vulnerabilities" are normal.
- Red `ERR!` lines are not: go to step 11.

**4. Start Docker.** Open Docker Desktop and wait for **Engine running**. Then type `docker ps`. An empty table is fine for now.

**5. Start the app.** In `dev`:

```
npm run dev
```

It prints its progress as numbered steps, similar to this (the exact wording can differ):

```
[dev] 1/6 checking Docker
[dev] 3/6 starting Postgres and Mailpit
 Container ...-db-1 Healthy
 Container ...-mailpit-1 Healthy
[dev] 4/6 applying database migrations
[dev] 6/6 starting the API and the web app   (Ctrl+C stops both)
  web app   http://localhost:5173
  API       http://localhost:3000/api/health
  e-mails   http://localhost:8025   (every e-mail the app sends lands here)
[api] ... "msg":"server listening"
[web]   VITE ... ready in ... ms
```

- The first start takes about a minute.
- A block of lines saying the real campus catalog has not been prepared (`npm run geocode`, check on a map, `npm run db:seed`) is normal and harmless: it only means the real NTU places are not loaded yet.

**6. What you should see in the browser.**

1. Open `http://localhost:5173` (type `localhost`, not `127.0.0.1`). You should see the **Campus Hop sign-in page**.
2. Choose **Register**, use an address ending in `@e.ntu.edu.sg` and a password of 8 or more characters, and send the form. A box asks for a **6-digit code**.
3. Open `http://localhost:8025` in a second tab. This is Mailpit, the fake inbox. The e-mail with the code is the newest message. Type the code into the app.
4. You are signed in. A user with both roles sees **Choose role**; pick one and you land on the home screen with a bottom bar (Home, Request or Presets, Wallet, Trips).
5. `http://localhost:3000/api/health` shows `{"status":"ok", ...}`.

To try it with ready-made people instead of registering, see step 10 (the demo). Each demo person has the password `demo-password-1`.

**7. Stop it.** Click in the terminal window and press **Ctrl+C**. To also stop the database and the inbox containers, type `docker compose down`.

**8. Run the tests.** Stop the app first (Ctrl+C), and stay in `dev`. First the tests that need no Docker:

```
npm run test:unit
```

**What you should see:**
- a list of test files, and at the end `Test Files ... passed` and `Tests  331 passed` (after step 0 is done).
- Then, **on a new line**, the tests that use the real database.
- Docker must say Engine running:

```
npm run test:db
```

**What you should see:** the same kind of list and a final count, with nothing failed.

- `test:unit` needs no Docker; after step 0 you should see about **331 passed** and nothing failed.
- `test:db` needs Docker running and uses a separate test database; its count on Staging has not been measured yet.
- On Windows two e-mail tests can time out until `SMTP_HOST` is `127.0.0.1` (see step 2).

**9. Where things are.**
- `dev/client/src/pages` has the screens; `dev/server/src/services` has the rules (wallet, booking, matching); `dev/server/src/controllers` and `routes` are the thin entry points; `dev/server/src/entities` are the plain classes (User, Journey, Booking, Wallet); `dev/server/prisma` is the database; `dev/shared/src` is the contract (`api.ts` lists every endpoint) that the client and the server both read.

**10. Everyday git.**
- Before you start work: `git pull`.
- Make your own branch: `git switch -c feature/<short-name>`.
- See what changed: `git status`.
- Stage only what you mean to push: `git add <the files>` (never `git add -A` without reading `git status` first, and never add `node_modules`, `.env` or `dist`).
- Save: `git commit -m "[task id] what you did"`.
- Send: `git push -u origin feature/<short-name>`, then open a pull request into `Staging` on GitHub, check **Files changed**, and ask someone else to approve.
- Never push to `Staging` or `main` directly.

**11. If something is wrong.**
- Step 11 of this page lists the usual problems.
- The three most common: "port is already allocated" (another copy is running: Ctrl+C in its window or `docker compose down` in its folder), "Cannot connect to the Docker daemon" (start Docker Desktop and wait for Engine running), and a blank page at `127.0.0.1:5173` (use `localhost:5173`).

---

## Read this first

**What Campus Hop is.**
- A web app (works on phones) for NTU students: a driver already leaving through a campus gate offers seats, a passenger on campus asks for a ride along the same route, fares are $3.00 for one rider and $2.00 each for two or three, paid from a simulated wallet.
- It is a university project (SC2006), built by four people.
- The code is in one GitHub repository: https://github.com/softwarelab3/2006-SCSA-R3.

**What this page is.**
- The code can do almost everything by itself.
- A few things need a **person**: install a program, create an account, copy a key, look at a map, press a button on a website.
- They are listed here, in the order you would do them.
- Each one says why it exists, what you need, the exact steps, how to know it worked, and what to do if it did not.

**Rules for everyone**

- **Never put a password, a key or a secret in the repository, a chat or a screenshot.**
  - Keys go in a file called `.env` on your own computer (git ignores it) or in the hosting website's secret settings.
- **Never push straight to `main`.** Work on a branch and open a pull request.
- Keep the project folder **outside OneDrive** (for example `D:\dev\campus-hop`). OneDrive slows `npm install` and can corrupt the `.git` folder.
- If a step does not work, do not guess: write down the exact message and which step number, and send it to whoever gave you this page.

**What has and has not been proven.**
- Steps 1 to 3 and 10 were run on a Windows laptop while this was written (real browser, real Postgres, real Mailpit).
- Step 0 was checked in a scratch copy of Staging on 27 Oct 2026 (typecheck and tests were run there) but **has not been applied to GitHub yet**.
- Steps 4 to 9 need an outside account or a person, so they are written from the code and the providers' documentation and were **not** run.
- They are marked **Not run**.
- Treat their exact button names as a guide: websites change their menus.

**The order of work.**
- Step 0 comes first: until a fresh clone of Staging starts, nothing else on GitHub can be tested.
- Adding the remaining features and the document updates comes after it.

**The steps at a glance**

| Step | What | Needs an account? | Who can do it | Roughly | Blocks |
| ---- | ---- | ----------------- | ------------- | ------- | ------ |
| 0 | **Make the current Staging branch work (top priority)** | no | one person who can push | 1 to 2 hours | everything on GitHub |
| 1 | Docker | no | anyone | 20 min | everything that runs locally |
| 2 | Run the app | no | anyone | 20 min | everything |
| 3 | Database commands | no | anyone | reference | nothing |
| 4 | Campus places and boundary | Google (step 5) | **someone who knows the NTU campus** | 2 to 4 hours | real matching, the geofence |
| 5 | Google Maps key | Google Cloud + a card | anyone with a card | 30 min | real routes |
| 6 | Real e-mail | an e-mail provider | anyone | 45 min | sign-up on the real site |
| 7 | Test on a phone | no (a free tunnel tool) | anyone with a phone | 45 min | phone proof |
| 8 | Hosting | a hosting account | anyone | 1 to 2 hours | the live demo |
| 9 | GitHub | repository **admin** for part of it | admin + anyone | 30 min | safe teamwork |
| 10 | The demo | no | anyone | 1 hour | the presentation |
| 11 | When something goes wrong | | | | |
| 12 | Tasks that are documents or design, not code | | the whole team | days | marks |

---

## 0. Make the current Staging branch work (top priority) Not applied yet

**Newer way to do items 4, 5, 12 and 13.** The Git push guide (`Campus_Hop_Git_Push_Guide.html`, the "Wave 1: foundation" screens) does the same copy as small pull requests (grouped by what each one is for) instead of one big `fix/make-staging-run`, and turns items 6, 7 and 10 into small fix pull requests (item 8, `jsdom`, only if the tests ask for it). It also copies the draft's `package-lock.json`, which the 181-file line in item 4 leaves out although Staging has none and the Dockerfile needs it. Read this step for the reasons and the checks; follow the guide for the commands.

**Why it exists.**
- Staging holds the teammates' feature code in a folder called `dev/`, but not the foundation that code stands on (the server core, the shared contract, the web app frame).
- So `npm run dev` cannot start from a clone of Staging today.
- Adding features, the wallet and the demo all wait for this.

**What was found (27 Oct 2026, Staging at `77fce178`).** It was checked in a scratch copy, so nothing on GitHub changed.

- Staging's root has only `.gitignore`, `README.md`, the SRS pdf, `dev/` and the lab folders.
  - `dev/` has 99 files: a `package.json`, `docker-compose.yml` and scripts, but **no** `server.ts`, `app.ts`, `context.ts`, database schema, `main.tsx`, `App.tsx` or `shared/src/api.ts`.
- 25 server files that the code imports exist nowhere on Staging (for example `context`, `routes/mount`, `errors/AppError`, `core/clock`, `core/geo`).
- Even with that foundation added, 14 files stay missing, including the wallet (`WalletService`, `trust`, `AccountLockService`). The teammates' booking, fare, journey and trip code needs them.
- Every one of those files exists in the draft branch.
  - Copying the draft files that `dev/` lacks into `dev/` (about 180 files) leaves only two kinds of type errors, both caused by two recent draft changes: 13 from `trustDecision` now taking a 4th argument, and 4 from `decodePolyline` having moved to `shared`.
- Before the two fixes the unit tests give 288 passed and 33 failed.
  - The broken map import crashed the driver screens, so most of the 33 were that.
  - **After the two fixes (steps 6 and 7 below): typecheck shows 0 errors and the unit tests give 331 passed and 14 failed.**
  - All 14 are the stress tests in `server/test/stress`.
  - They need the database, but their file names (`*.stress.test.ts`) put them in the no-database test project.
  - Step 10 fixes that.

**The decision to make first.** Two ways to build the foundation:

| Option | What it is | Verdict |
| ------ | ---------- | ------- |
| A: `dev/` is the app | add the missing files **into `dev/`** and run everything from `dev/` | **Recommended.** No teammate file is overwritten. The setup files are already there. One place to run. |
| B: the repo root is the app | add the foundation at the root and leave `dev/` alone | Two copies of the same features, and 42 files exist in both places with different contents. Slower and riskier. |

Agree on A with the team before starting. The steps below are for A.

**You need:** Git, Node.js 22, Docker (step 1), a GitHub account that can push a branch, and the draft code on this computer (`D:\dev\campus-hop`, branch `draft/all-tasks`).

**Steps.** Use **Git Bash** for every step (the line before the cursor must not start with `PS`; see the README above for why).

1. **Clone Staging** into a new folder.
   - Open Git Bash in the folder where you want it (outside OneDrive; on the owner's laptop that is `D:\`). Right-click in the folder, Open Git Bash here.
   - Type `git clone -b Staging https://github.com/softwarelab3/2006-SCSA-R3.git campus-hop-staging` and press Enter.
   - Wait until you see `Receiving objects: 100% ... done.` and `Resolving deltas: 100% ... done.` and you are back at the prompt.
   - **On a new line**, type `cd /d/campus-hop-staging` and press Enter. Nothing is printed; the prompt now ends with `campus-hop-staging`.
   - That is `D:\campus-hop-staging` written the Git Bash way. If you cloned into another folder, type `pwd` where you cloned, then add `/campus-hop-staging` to what it prints.
   - This full path works from any folder. Paste it whenever a step says "the top of the clone".
   - Check: `git branch --show-current` prints `Staging` on a fresh clone. If you already made your own branch it prints that name (for example `fix/make-staging-run`), which is fine.
   - If a later command says `not a git repository`, you forgot this `cd`.
2. **Make your branch.**
   - Type `git switch -c fix/make-staging-run` and press Enter.
   - You should see `Switched to a new branch 'fix/make-staging-run'`.
3. **Bring the draft into this clone** (nothing goes to GitHub).
   - Type `git fetch /d/dev/campus-hop draft/all-tasks:draft-src` and press Enter.
   - You should see lines ending with `* [new branch]      draft/all-tasks -> draft-src`.
4. **Copy the foundation files from the draft into `dev/`.**
   - These are the files Staging does not have yet: the server core, the shared contract, the web app frame, the database schema and the wallet.
   - Files that `dev/` already has are never touched.
   - Needs **Git Bash**; PowerShell cannot run it.
   - Paste the one long line shown below this list with Shift+Insert and press Enter.
   - Nothing is printed and it takes a few seconds; you are back at the prompt when it is done.
5. **Check the copy**, with two commands, one at a time.
   - **First command:** `git status --short -uall | wc -l`. It counts the copied files and must print **181**.
   - Plain `git status --short` folds new folders into one line and prints 139, which is also fine.
   - **Second command, on a new line:** `git status --short -uall | grep -c node_modules`. It counts files inside a `node_modules` folder, which would be junk, and must print **0**.
   - If the **first** command prints **0**, the copy in step 4 did not run: go back to step 4, paste the line again and press Enter.
6. **Fix the trust call.** Stay at the top of the clone (not inside `dev`).
   - **Look first:** `grep -n "trustDecision(" dev/server/src/services/BookingService.ts` lists the three calls with their line numbers.
   - **Option 1, one command:** `sed -i -E 's/trustDecision\(([^()]*)\)/trustDecision(\1, this.ctx.flags.bookOnTrust)/' dev/server/src/services/BookingService.ts`
   - It adds `, this.ctx.flags.bookOnTrust` inside each `trustDecision(...)` bracket. Nothing is printed.
   - **Run it only once**: a second run adds the text again. Undo with `git checkout -- dev/server/src/services/BookingService.ts`.
   - **Option 2, by hand with nano:** see "Do step 6 by hand" below the long line; it lists the exact keys.
   - **See what changed, on a new line:** `git diff dev/server/src/services/BookingService.ts` (red `-` = before, green `+` = after; press `q` to leave).
   - **Check, on a new line:** `grep -c "this.ctx.flags.bookOnTrust)" dev/server/src/services/BookingService.ts` must print **3**.
   - **Then, on a new line,** copy the draft's test file: `git show draft-src:server/src/services/matching.test.ts > dev/server/src/services/matching.test.ts`
   - That file only differs in the trust tests, so no teammate test is lost. Nothing is printed.
7. **Fix the map import.** Still at the top of the clone.
   - **Option 1, one command:** `printf "\nexport { decodePolyline } from '@campus-hop/shared';\n" >> dev/client/src/lib/geo.ts`
   - Nothing is printed. It adds one line to the end of the file (`>>` adds; a single `>` would erase the file).
   - **Option 2, by hand with nano:** see "Do step 7 by hand" below the long line.
   - To see the whole file first: `cat dev/client/src/lib/geo.ts`
   - **Check, on a new line:** `tail -2 dev/client/src/lib/geo.ts` must show the line `export { decodePolyline } from '@campus-hop/shared';`.
8. **Add the test library `jsdom`** (the client tests need it).
   - Type `cd /d/campus-hop-staging/dev` and press Enter (short form from the top of the clone: `cd dev`). Nothing is printed; the prompt ends with `dev`.
   - **On a new line**, type `npm install --save-dev --save-exact jsdom@29.1.1` and press Enter.
   - You should see `added ... package`, and `package-lock.json` appears in `dev`.
   - To see what it wrote in `package.json`: `git diff package.json` (press `q` to leave).
9. **Check that everything compiles and the tests pass.** Still inside `dev`, one command at a time.
   - `npm run db:generate`: you should see `Generated Prisma Client`.
   - `npm run typecheck`: it must print no errors (a clean run prints only the lines of the command itself).
   - `npm run lint`: no errors.
   - `npm run test:unit`: you should see `Tests ... passed`. The 14 stress tests fail until step 10.
10. **Move the stress tests to the database test project.**
    - Go back to the top of the clone: `cd /d/campus-hop-staging` (the prompt no longer ends with `dev`).
    - **First command:** `sed -i "s#'\*\*/node_modules/\*\*'\]#'**/*.stress.test.ts', '**/node_modules/**']#" dev/server/vitest.config.mts`
    - **Second command, on a new line:** `sed -i "s#'test/\*\*/\*.int.test.ts'\]#'test/**/*.int.test.ts', 'test/**/*.stress.test.ts']#" dev/server/vitest.db.config.mts`
    - Nothing is printed. **Run each only once.**
    - **Check, on a new line:** `grep -n stress dev/server/vitest.config.mts dev/server/vitest.db.config.mts` must print exactly two lines, one per file, each containing `*.stress.test.ts`.
    - **By hand instead:** open each file as shown in "Look inside a file and change it". Add `'**/*.stress.test.ts'` to the `exclude` list of the first file, and `'test/**/*.stress.test.ts'` to the `include` list of the second.
    - Then `cd /d/campus-hop-staging/dev`, and `npm run test:unit` must show 0 failed (about 331 passed).
    - The stress tests are heavy (they create 1,000 journeys): run `npm run test:db` once with Docker on and read the result before you merge. They were not run in the check.
11. **Run the app.**
    - Start Docker Desktop and wait for **Engine running** (step 1).
    - Still inside `dev`, type `npm run dev` and press Enter.
    - You should see the numbered `[dev] 1/6 ... 6/6` lines, then `[api] ... server listening` and `[web] ... ready`.
    - Open http://localhost:5173 in your browser: the sign-in page appears.
    - Press Ctrl+C in the terminal to stop it.
12. **Commit and push your branch.**
    - Go back to the top of the clone: `cd /d/campus-hop-staging` (the prompt no longer ends with `dev`).
    - **On a new line**, type `git add dev` (nothing is printed).
    - `git status --short | head -20`: every line must start with `A` and none may contain `node_modules`.
    - `git commit -m "fix: make Staging run (foundation files, trust call, map import)"`: you should see `... files changed`.
    - **Last,** `git push -u origin fix/make-staging-run`: you should see `* [new branch]      fix/make-staging-run -> fix/make-staging-run`.
    - This is the one command that sends anything to GitHub.
13. **Open the pull request** into `Staging` from the link GitHub prints.
    - **Files changed** should show about 180 added files and **no** `node_modules`, `.env` or `dist`.
    - Get one approval and merge.

The long line for step 4:

```
git ls-tree -r --name-only draft-src | grep -vE '^(lab1|lab2|lab3|dev|\.vet|ui-shots|\.github)/|^(README\.md|package-lock\.json)$|SRS\.pdf$' | while read f; do if [ ! -e "dev/$f" ]; then mkdir -p "dev/$(dirname "$f")"; git show "draft-src:$f" > "dev/$f"; fi; done
```

### Look inside a file and change it (Git Bash)

Yes, Git Bash can do this, like a Linux terminal. Stay at the top of the clone unless a line says otherwise. Paths start with `dev/`.

| You want to | Type | What you see |
| ----------- | ---- | ------------ |
| Show the whole file | `cat dev/client/src/lib/geo.ts` | The file printed on screen. |
| Show a long file one page at a time | `less dev/server/src/services/BookingService.ts` | Space = next page, `q` = leave. |
| Show only some lines (here 60 to 75) | `sed -n '60,75p' dev/server/src/services/BookingService.ts` | Just those lines. |
| Show the last 5 lines | `tail -5 dev/client/src/lib/geo.ts` | The end of the file. |
| Find a word, with line numbers | `grep -n trustDecision dev/server/src/services/BookingService.ts` | One line per match, starting with its line number. |
| Find where a file is (you know the name) | `find dev -name BookingService.ts` | The path, for example `dev/server/src/services/BookingService.ts`. |
| Find which files contain a word | `grep -rl trustDecision dev --include=*.ts` | One file path per line. |
| See what you changed in a file Git already knew | `git diff dev/server/src/services/BookingService.ts` | Red `-` = removed, green `+` = added. `q` leaves. A file that is new in your clone (like `geo.ts`, which step 4 copied in) shows nothing here: use `tail -3` on it instead. |
| Edit it right in the terminal | `nano dev/client/src/lib/geo.ts` | A text editor opens inside the window (see below). |
| Edit it in VS Code | `code dev/client/src/lib/geo.ts` | VS Code opens that file. |

**Edit with nano** (installed with Git Bash):

1. Type `nano dev/client/src/lib/geo.ts` and press Enter. The file appears; the bottom two lines list the keys (`^O` means hold Ctrl and press O).
2. Move with the arrow keys and type as in any editor. Mouse clicks do not move the cursor. Paste with Shift+Insert.
3. Save: press **Ctrl+O**, then **Enter** to accept the file name. You see `Wrote ... lines`.
4. Leave: press **Ctrl+X**. You are back at the prompt.
5. To find a word inside nano press **Ctrl+W**, type the word, press Enter.
6. To leave without saving press **Ctrl+X**, then **N**.

**Do step 6 by hand, with nano**
- (instead of the `sed` line).
- Staging's `BookingService.ts` has three calls that look like `trustDecision(a, b, c)`.
- Each needs `, this.ctx.flags.bookOnTrust` added just before its closing bracket.

1. Find the lines: `grep -n "trustDecision(" dev/server/src/services/BookingService.ts`.
   - It prints three lines, for example `69:    return { fareCents, check: trustDecision(availableCents, user.completedRides, fareCents), availableCents };`.
   - The number before the colon is the line number.
2. Open the file: `nano dev/server/src/services/BookingService.ts`.
3. Jump to the first call: press **Ctrl+W**, type `trustDecision(`, press Enter. The cursor lands on the word. (Type the bracket too, so the `import` line is skipped.)
4. Move the cursor to just before the `)` that closes this call, using the **right arrow**.
   - In line 69 that is right after `fareCents`.
   - Type `, this.ctx.flags.bookOnTrust`.
   - The line now reads `...trustDecision(availableCents, user.completedRides, fareCents, this.ctx.flags.bookOnTrust), availableCents };`.
5. For the next call press **Ctrl+W**, then **Enter** (it repeats the last search).
   - Do the same: the closing bracket of the call in line 113 is right after `fare`, in line 166 also right after `fare`.
6. Save with **Ctrl+O**, **Enter**; leave with **Ctrl+X**.
7. Check: `grep -c "this.ctx.flags.bookOnTrust)" dev/server/src/services/BookingService.ts` prints **3**, and `git diff dev/server/src/services/BookingService.ts` shows three red lines and three green lines.

**Do step 7 by hand**
- (instead of `printf`): `nano dev/client/src/lib/geo.ts`, press **Ctrl+End** (or **Alt+/** if that does nothing) to jump to the last line, press Enter for a new line, type `export { decodePolyline } from '@campus-hop/shared';`, then Ctrl+O, Enter, Ctrl+X.
- Check: `tail -2 dev/client/src/lib/geo.ts` shows that line.

**The same in VS Code:**
- `code dev/server/src/services/BookingService.ts` opens the file; press **Ctrl+F**, type `trustDecision(`, and press Enter to jump between the three calls; type the extra text before each closing bracket, then **Ctrl+S**.

**Edit one line without opening anything**
- (what steps 6 and 10 do): `sed -i 's/OLD/NEW/' file` swaps the first `OLD` on each line for `NEW`.
- Run it only once, then look at the result with `git diff file`.
- Undo a file you have not committed with `git checkout -- file`.

**Add a line to the end of a file** (what step 7 does): `printf "\nthe line\n" >> file`. Two `>>` add; one `>` erases the file, so never type a single `>` here.

**A mistake in the middle of a long command?** Nothing is lost: press Ctrl+C to drop the line, or Up arrow to bring the last command back and fix it with the arrow keys.

**Done when:**
- you delete the folder and clone Staging again (the `git clone` line, then on a new line `cd /d/campus-hop-staging`), then on a new line `cd /d/campus-hop-staging/dev`, then on a new line `npm ci`, then on a new line `npm run dev`.
- The sign-in page opens at http://localhost:5173, you can register, and the 6-digit code arrives at http://localhost:8025.

**What each fix is for (why it is in the list)**

| Fix | Plain meaning |
| --- | ------------- |
| Step 4, the copy | Staging has the feature code but not the foundation under it (server core, shared contract, web app frame, database schema). This copies the foundation, and the wallet the features depend on, from the draft. Files that Staging already has are never overwritten. |
| Step 6, the 4th argument of `trustDecision` | The wallet rule "book on trust" (75% of the fare, 3 rides) is now switched off by a flag. The function that decides it takes the flag as a 4th input. The teammates' booking code still calls it with 3 inputs, so it does not compile until it passes the flag. |
| Step 7, the `decodePolyline` line | The code that reads a route from Google moved into `shared` so the server and the web app share one copy. The teammates' map screen still looks for it in the old place, and the whole driver screen crashed because of that. This line points the old place at the new one. |
| Step 8, `jsdom` | The web app's tests run in a pretend browser called jsdom. It must be listed in `package.json`, or a clean install cannot start those tests. |
| Step 10, the stress tests | Two heavy test files need the real database, but their names put them in the group that runs without one, so they fail. This moves them to the database group. |

**Things to know**

- Never run `git add -A` on a branch made from Staging without looking at `git status`.
  - A branch cut from Staging has no root `.gitignore` for your folder's `node_modules` and `.env`, which is how thousands of files were committed on 26 Oct.
  - Use `git add dev`.
- The wallet branch (`feature/wallet`) adds the same wallet files that step 4 copies. The contents are identical, so merging it later causes no conflict.
- Bad map data now throws an error in `TrackingMap` (the draft guarded it). The server always sends a valid route, so this is a small risk; guard it later.

**After Staging runs.**
- In this order: the wallet branch, the document updates (the Lab 3 amendments page), the SRS changes, the demo (step 10), and the outside steps 4 to 9 below.
- The older plan of one cycle per pull request at the repo root is replaced by this step; keep it only as a fallback.

---

## 0b. Next: merge the waiting pull requests and apply the wallet rules Not applied yet

**Window:** type every command here in **Git Bash** (the line before the cursor must not start with `PS`). The README at the top of this page says how to open it and how to paste.

**Why it exists.**
- After step 0, Staging runs, but three things from the 25 Oct decisions are still not on it: the wallet branch, a waiting fix from yoda22, and the rules you decided on (a $2 minimum to ask for a ride, the low-balance warning, booking on trust off).
- Do this only after step 0 is merged and a fresh clone of Staging runs.

**Steps**

1. **Open the wallet pull request:** https://github.com/softwarelab3/2006-SCSA-R3/compare/Staging...feature/wallet?expand=1
   - If step 0 already copied the wallet files, GitHub says there is nothing to compare (or Files changed shows 0): close it, the wallet is in.
   - If it shows 14 files, merge it after one approval.
2. Merge yoda22's `fix/expire-hop-requests` first (1 commit, 6 files: `PassengerPages`, `HopRequestService`, `MatchingService`, one test, `shared/.../hop.ts`).
   - It touches the same two files you change in step 4 below, so it must go in before them.
3. **Update your clone**, one command at a time.
   - `git switch Staging`: you should see `Switched to branch 'Staging'`.
   - **On a new line,** `git pull`: you should see `Already up to date.` or the new files.
   - **On a new line,** `git switch -c feature/wallet-rules`: you should see `Switched to a new branch 'feature/wallet-rules'`.
4. **Apply the $2 minimum** in `dev/server/src/services/HopRequestService.ts`.
   - Add `import { Money } from '../core/money';` at the top.
   - Directly after the line `if (user.accountStatus === 'LOCKED') throw new AppError('ACCOUNT_LOCKED');` add the lines in the code block below.
   - To open the file: `nano dev/server/src/services/HopRequestService.ts`, or `code dev/server/src/services/HopRequestService.ts` (see "Look inside a file and change it" in step 0).
   - To find the line: in nano press Ctrl+W, type `ACCOUNT_LOCKED`, press Enter.
5. **Show the warning on the request screen** in `dev/client/src/pages/PassengerPages.tsx`.
   - Add `import { LowBalanceNotice } from '../components/LowBalanceNotice';` with the other imports.
   - Put `<LowBalanceNotice />` on its own line directly under the `<PageTitle ...>Request a hop</PageTitle>` line.
   - `LowBalanceNotice.tsx` is already in `dev` from step 4 of step 0.
6. **Fix the database tests.** A passenger now needs at least $2 to ask for a ride, so every test that asks for a ride must give its passenger money.
   - Files: `dev/server/test/matching.int.test.ts`, `review-fixes.int.test.ts` and `error-codes.int.test.ts`.
   - Change `makePassenger()` to `makePassenger({ balanceCents: 500 })` wherever that passenger posts a hop request.
   - To list every place: `grep -n "makePassenger()" dev/server/test/matching.int.test.ts dev/server/test/review-fixes.int.test.ts dev/server/test/error-codes.int.test.ts`
7. Check, with Docker running, one command at a time: `npm run typecheck` (no errors), then `npm run test:unit` (nothing failed), then `npm run test:db` (nothing failed).
   - Read any failure before you go on.
8. **Commit and push only what you changed.**
   - `git status --short`, then `git add` those files by name.
   - `git commit -m "[C2][B5a] Wallet rules: $2 minimum, low-balance warning"`
   - Push `feature/wallet-rules` and open the pull request into Staging.
   - Get one approval, then merge.
9. **Add a check that runs on every pull request.** Staging has no automatic check today.
   - Copy `.github/workflows/ci.yml` from the draft into the **repository root** `.github/workflows/`.
   - In that file make four changes:
     - under `jobs.checks` add `defaults: run: working-directory: dev`
     - change both branch lists to `[Staging, main]`
     - delete the `docs:check` step
     - add a `mailpit` service (`image: axllent/mailpit`, ports `1025` and `8025`) next to `postgres`
   - Open it as its own pull request and wait for the green check named `checks`.

The code for step 4:

```
    // Not a lock: the account stays ACTIVE (it can still cancel, top up and look around), it just cannot ask for a ride it could not pay for.
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: passengerId } });
    if (wallet.balanceCents - wallet.heldCents < DEFAULTS.MIN_BALANCE_TO_RIDE_CENTS)
      throw new AppError('INSUFFICIENT_BALANCE', { message: `Top up to at least ${Money.cents(DEFAULTS.MIN_BALANCE_TO_RIDE_CENTS).format()} to ask for a ride.` });
```

**Done when:**
- on a fresh clone, signing in as `demo.rider2@e.ntu.edu.sg` (Wei, $1.00) shows a red banner on Wallet and on Request, and asking for a ride is refused until a $5.00 top-up is made.
- `npm run test:db` passes.

**What was and was not checked.**
- The code in step 4 is the code that is in the draft and passes there.
- It was not applied to the teammates' versions of the files, so expect to resolve small differences by hand.
- The CI steps in step 9 were not run on GitHub.

---

## 0c. Then: update the Lab 3 documents and upload them Not applied yet

**Why it exists.**
- The code is ahead of the documents.
- The Lab 3 manual asks for a design class diagram (with control classes, patterns, attributes and operations), a dialog map, a system architecture figure, the application skeleton and a short PDF report, all uploaded to GitHub under `lab3` before Lab 4.
- The full row-by-row list of what to change is on the separate page `Campus_Hop_Lab3_Amendments.html` (same folder as this page), with a tick box for each change.

**Steps**

1. Open `Campus_Hop_Lab3_Amendments.html` and work through section 2 (design class diagram): money fields to whole cents, the missing attributes, the renamed operations, plus the three things the manual asks for that are missing: control classes (the services), the design patterns (Strategy, Observer, Adapter, State) and a note on persistent data and access control.
2. Section 3 (dialog map): remove the booked-on-trust edges, add the under-$2 and under-$3 wallet rules, and add the Verify and Profile screens.
3. Section 5 (architecture figure): name the real controllers and services, add the four missing entities, draw the arrow from services (not entities) to the database, and add the job runner and the live-location gateway.
4. Section 4 (SRS and use case descriptions): change the wallet requirements (limit $100, no booking on trust, warning under $3, no ride under $2, fixed top-ups) and add the settings table.
5. Section 1 (use case diagram): show the UC numbers on the labels and export with a white background.
6. Write the Lab 3 report (manual section 3.3.5): the technology-stack prompt and answers, and the TODO-only skeleton exercise with your comments.
7. Put the final files in one folder, move the old copies into `_superseded`, and upload the folder as `lab3/` on GitHub through a pull request that a teammate approves.
   - Today `lab3/` on GitHub holds only `test.md`.

**Done when:** every row on the amendments page is ticked and `lab3/` on GitHub has the new files.

---

## 1. Docker (tasks K14, K4)

**Window:** type every command here in **Git Bash** (the line before the cursor must not start with `PS`). The README at the top of this page says how to open it and how to paste.

**Why it exists.** The app needs a PostgreSQL database and a fake inbox. Docker runs both in two small boxes on your laptop, so nobody installs Postgres by hand.

**You need:** Windows 10 or 11 (or Mac or Linux), about 4 GB of free memory, admin rights to install.

1. Close big programs first. Docker Desktop with the WSL 2 engine wants a few GB of free memory. If the machine is slow, limit it in Docker Desktop under `Settings > Resources`.
2. Windows only: if you do not have WSL 2, open **PowerShell as administrator**, run `wsl --install`, then restart the computer.
3. Install **Docker Desktop** from docker.com and start it. Wait until it says _Engine running_ (a green icon at the bottom left).
4. In a terminal, run `docker run --rm hello-world`.

**How to check it worked:** step 4 prints "Hello from Docker!".

**If it fails:**
- "Cannot connect to the Docker daemon" means Docker Desktop is not running yet: start it and wait for _Engine running_.
- A frozen laptop means Docker is using too much memory: lower the limit in its settings.

**The Docker commands you will actually use.** Run the `compose` ones inside the folder that holds `docker-compose.yml` (on Staging after step 0 that is `dev`).

| Command | What it does |
| ------- | ------------ |
| `docker ps` | lists what is running; you should see a database (`...-db-1`) and a mail box (`...-mailpit-1`), both "healthy" |
| `docker compose up -d` | starts the database and the fake inbox in the background (`npm run dev` does this for you) |
| `docker compose down` | stops them; the data stays |
| `docker compose logs db` | shows the database's messages when something is wrong |
| `docker compose down -v` | stops them **and deletes the database data**; use it only to start from nothing |

**The ports it uses.**
- The database is on **5433**, the SMTP port of the fake inbox on **1025**, its web page on **8025**, the server on **3000**, the web app on **5173**.
- Only one copy of the project can run at a time, because every copy wants the same ports.
- If something says "port is already allocated", another copy is running: stop it with `docker compose down` in its folder, or press Ctrl+C in its window.

**Docker Desktop says "Engine running" but the commands fail?** Open a new terminal window after Docker starts; an old window may not see it yet.

## 2. Get the code running (tasks K14, F5, F6)

**Window:** type every command here in **Git Bash** (the line before the cursor must not start with `PS`). The README at the top of this page says how to open it and how to paste.

**Why it exists.** One command starts the database, the fake inbox, the server and the web app, in the right order.

**You need:** Docker running (step 1), **Node.js 22** (nodejs.org, the LTS installer), **Git**.

**Run these four commands** in a terminal, **one at a time** (the folder must **not** be inside OneDrive):

Type each of these on its own line, and wait for each to finish before the next.

```
git clone https://github.com/softwarelab3/2006-SCSA-R3.git /d/dev/campus-hop
```

**What you should see:** `Cloning into '/d/dev/campus-hop'...` and `Receiving objects: 100% ... done.`

```
cd /d/dev/campus-hop
```

**What you should see:** nothing printed; the prompt ends with `campus-hop`. (`/d/dev/campus-hop` is Git Bash's way of writing `D:\dev\campus-hop`; use your own folder if you chose another.)

```
npm ci
```

**What you should see:** `added ... packages` after two to four minutes.

```
npm run dev
```

**What you should see:** the numbered `[dev] 1/6 ... 6/6` lines, then `server listening` and `ready` (see the README above).

If the code is on a branch other than the default, add `--branch <name>` to the clone command.

**Running Staging (after step 0 is merged).**
- The app lives in the `dev` folder, so run everything from there: open Git Bash in the folder where you keep it (`D:\` on the owner's laptop), type `git clone -b Staging https://github.com/softwarelab3/2006-SCSA-R3.git campus-hop-staging` and wait for `Receiving objects: 100% ... done.`; then, on a new line, `cd /d/campus-hop-staging/dev` (Git Bash needs `/d/...` with forward slashes, not `D:\...`); then, on a new line, `npm ci` (wait for `added ... packages`); then, on a new line, `npm run dev`.

**Which address to open.**
- Type `http://localhost:5173` for the web app.
- On Windows, `http://127.0.0.1:5173` can give no answer, because the web app listens on `localhost` only.
- The server (`http://localhost:3000/api/health`) answers on both.

**What `npm run dev` does.**
- Everything, in order, and it says plainly which step failed: it checks Docker, copies `.env.example` to `.env`, starts Postgres (**port 5433**, not 5432, so it cannot clash with another Postgres on your machine) and Mailpit, applies the migrations, seeds the fare table, and starts the server (http://localhost:3000) and the web app (http://localhost:5173).

**Windows only, one setting to change.**
- Open the new `.env` file and change `SMTP_HOST=localhost` to `SMTP_HOST=127.0.0.1`, then stop the server (Ctrl+C) and run `npm run dev` again.
- On one Windows machine, sending the verification e-mail to `localhost` hung until the request timed out, while `127.0.0.1` worked in about 150 ms.

By hand, the same thing: `docker compose up -d`, `npm run db:generate`, `npm run db:deploy`, `npm run db:seed`, then `npm run dev -w @campus-hop/server` and `npm run dev -w @campus-hop/client`.

**How to check it worked**

- http://localhost:3000/api/health shows `{"status":"ok", ...}`.
- http://localhost:5173 shows the sign-in page.
- Register with any address ending in `@e.ntu.edu.sg`. The 6-digit code does not go to a real inbox: open http://localhost:8025 (the fake inbox, Mailpit) and read it there.

**Try it before the real campus data exists:**
- put `SEED_SYNTHETIC_CATALOG=1` and `SEED_DEMO_USERS=1` in `.env` and run `npm run demo:reset`.
- This loads five clearly labelled **[DEMO]** places and the demo people (step 10).
- The places are laid out on an invented grid that starts near the middle of NTU. They are **not** the real halls or gates.
- To put the grid where you are standing, see "Place the demo where you are" in step 10.

**If it fails:** see step 11.

## 3. The database (tasks F5, K14)

**Window:** type every command here in **Git Bash** (the line before the cursor must not start with `PS`). The README at the top of this page says how to open it and how to paste.

You do not need this unless something is wrong or you change the database. It lists what the commands do.

| Command             | What it does                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:deploy` | applies the migrations to the database in `.env` (run it after pulling new code if you do not start with `npm run dev`; otherwise sign-in fails with "column ... does not exist") |
| `npm run db:reset`  | **empties** the database and applies the migrations again, then seed with `npm run seed`                                                                                          |
| `npm run db:seed`   | fare table (always); the campus catalog **only** from a reviewed file (step 4)                                                                                                    |
| `npm run test:db`   | the database tests, against a separate database `campushop_test`                                                                                                                  |

Port clash? Another program is on 5433, 1025 or 8025: stop it, or set `DB_PORT` for Docker and change the port in `DATABASE_URL`.

## 4. Campus coordinates and the campus boundary (tasks F6, B4) Not run

**Why it exists.**
- To match a passenger with a driver the app must know where each hall, bus stop and carpark really is, and (optionally) where the campus edge is, so that a driver who drives off campus before starting is cancelled automatically.
- **Nothing here is invented**: wrong coordinates would send a rider to the wrong place.
- The names of the 33 places and their 71 pickup points are in `server/prisma/data/campus-catalog.template.json` (from the team's `Labs/lab1/campus_location_catalog.md`).
- It has **no coordinates**.
- The seed writes a place only if a person marked it reviewed.

**You need:** a Google Maps key with the **Geocoding API** enabled (step 5), and **someone who knows the NTU campus** (they must recognise the buildings).

**Part A0: see OneMap and Google side by side first (optional, recommended).**
- Open `Labs/code_review/Campus_Hop_Real_Catalog_Check.html` in a browser.
- It already lists every place and pickup point with **OneMap** candidates (public search, no key) and a Google Maps link for each.
- To add the **Google** candidates, run this in Git Bash (your `.env` must hold the key; nothing is printed or saved about the key):
  - `cd /d/dev/campus-hop`
  - `node "/d/OneDrive - Nanyang Technological University/Uni/NTU Life/Mods/Y2S1/SC2006/Labs/code_review/geocode_google_for_check_page.mjs"`
  - It writes `google_candidates.json` in that folder.
- On the page click **Import Google results** and choose that file.
- Each row then says whether Google and OneMap **agree** (within 50 m), differ a little, or are far apart.
- Tick "I looked at this on a map and it is right" only after you have looked.
- Use Part A below to write the reviewed file once you have decided.

**Part A: the places**

1. Complete step 5 first (you need the key in `.env`).
2. In the project folder run `npm run geocode -w @campus-hop/server`.
   - It writes `server/prisma/data/campus-catalog.geocoded.json` with a candidate position for each name (answers outside Singapore are dropped and listed on screen).
3. **Check every place on a map.** Open that file in a text editor.
   - For **each place**, copy its `lat` and `lng` into this address and open it in a browser: `https://www.google.com/maps?q=<lat>,<lng>`
   - The pin must be on that hall, bus stop or carpark.
   - If it is off, find the right spot on the map and right-click it.
   - Click the numbers shown at the top of the menu to copy them, and paste them into the file.
4. The entries whose `note` says `TODO` (the Main Gate and Jalan Bahar Gate stops, and halls 5 and 7, which the catalog document gives no carpark for) need the person who knows the campus.
5. After you have checked a place, change `"reviewed": false` to `"reviewed": true` for it.
   - When you are done, save the file as **`server/prisma/data/campus-catalog.reviewed.json`** (a new name, so the original stays).
6. Run `npm run db:seed`.
   - It prints what it seeded and what it skipped and why.
   - Walking distances default to straight line x 1.3 (what the catalog document says to use until real ones are fetched); put real metres in `walkDistanceM` to override.
7. Commit `campus-catalog.reviewed.json` to git. It holds only public places, no secrets.

**Part B: the campus boundary (the geofence)**

**B1.** Open https://geojson.io in a browser.

**B2.**
- Choose the **polygon** tool (the pentagon icon at the top right of the map).
- Click around the edge of the campus, one click per corner, and double-click the last one to finish.
- Use at least 4 corners; more corners follow the real edge better.

**B3.** In the panel on the right, copy the whole JSON text and save it as `campus.geojson` in the project folder.

**B4. Convert the order.** GeoJSON writes each point as `[longitude, latitude]`, but the app wants `{ "lat": ..., "lng": ... }`. Run this once (it also drops the repeated last point):

```
node -e "const g=require('./campus.geojson');const f=g.type==='FeatureCollection'?g.features[0]:g;const ring=f.geometry.coordinates[0];console.log(JSON.stringify(ring.slice(0,-1).map(([lng,lat])=>({lat,lng})),null,2))" > server/prisma/data/campus-boundary.json
```

**B5.** Open `server/prisma/data/campus-boundary.json`. It must look like the example below, with **at least 3 points** (the numbers here are a shape only):

```json
[
  { "lat": 0, "lng": 0 },
  { "lat": 0, "lng": 0 },
  { "lat": 0, "lng": 0 }
]
```

**B6.**
- In `.env` set `CAMPUS_BOUNDARY=D:/dev/campus-hop/server/prisma/data/campus-boundary.json` (use the full path on your computer; on the hosted server it is `/app/server/prisma/data/campus-boundary.json`) and restart the server.
- A bad file stops the server at start-up with a message naming the point that is wrong.

**Without a boundary file the geofence is off**: a driver who leaves campus is not auto-cancelled. The margin (200 m) and the two-readings-in-a-row rule are SRS Q12 defaults.

**How to check it worked:** the preset editor lists the three exit gates; `GET /api/locations` (signed in) lists every reviewed place.

**Send back:** the file `campus-catalog.reviewed.json`, the file `campus-boundary.json`, and the list of places you could not confirm.

## 5. Google Maps key (tasks B2, F6) Not run

**Why it exists.**
- Used for two things: the driver's route, worked out once at go-live (Directions API), and the one-off lookup of the campus places (Geocoding API).
- With no key the app uses a straight-line fake route, so everything still works.
- **Maps is a paid service** with a free monthly allowance, so a card is needed and a budget alert is not optional.

**You need:** a Google account and a payment card.

1. Open https://console.cloud.google.com and sign in.
2. Create a project (top bar, project picker, _New project_), for example "campus-hop".
3. Add billing: `Billing`, then link a billing account to the project (Maps Platform needs one even for the free credit).
4. `APIs & Services > Library`: search for and **Enable** two APIs: **Directions API** and **Geocoding API**.
5. `APIs & Services > Credentials > Create credentials > API key`.
6. Click the new key to restrict it.
   - Under **API restrictions** choose _Restrict key_ and tick only those two APIs.
   - (The server calls Google, not the browser, so do **not** restrict by website.
   - Once hosted you can also restrict by the server's IP address.)
7. `Billing > Budgets & alerts`: create a budget (for example SGD 10) with e-mail alerts at 50% and 90%. In `APIs & Services > Directions API > Quotas` you can also set a daily limit.
8. Copy the key into `.env` on your computer: `GOOGLE_MAPS_API_KEY=...`. For the hosted server, put it in the host's secret settings (step 8).

- **Never** paste the key into the repository, a chat or a screenshot.
- It is never sent to the browser and never written to the logs.
- If it ever leaks, delete it in the console and make a new one: removing it from git history is **not** enough, because bots scan GitHub for keys within minutes.

**How to check it worked:**
- go live as the demo driver; the response's `route.distanceM` comes from Google (the fake gives a straight line).
- If Maps fails the driver sees "the route could not be worked out" and no journey is created.

## 6. Real e-mail (tasks A1, K5) Not run

**Why it exists.**
- Locally, every e-mail goes to **Mailpit** (open http://localhost:8025 to read the code).
- On the real site, students must receive the 6-digit code in a real inbox, which needs an SMTP provider.

**You need:** an account with a provider that offers SMTP, and a sender address you control.

1. Choose a provider with a free tier and SMTP (for example Brevo or Mailjet, or a Gmail account). Create the account and verify your sender address when it asks.
2. Find the provider's **SMTP settings** page: you need the host, the port, a user name and a password (sometimes called an "SMTP key").
   - **Gmail:** host `smtp.gmail.com`, port 587. Turn on 2-Step Verification, then create an **App password** (search "app passwords" in your Google account security page) and use that as the password, not your normal one. Gmail limits how many messages it sends per day.
3. Put in `.env` (and in the host's secret settings): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM="Campus Hop <you@your-domain>"`.
   - Port 465 uses TLS at once; other ports upgrade with STARTTLS where the server offers it.
4. **In week 1, send a first test to a real `@e.ntu.edu.sg` address.**
   - Register with one, then look in the inbox **and the junk folder**.
   - University mail filters are strict. If it lands in junk or is rejected, set up SPF and DKIM for your sender domain by following the provider's guide, or change provider.
   - Do not leave this to the last week.

**How to check it worked:** register in the app with a real NTU address; the six-digit code arrives within a minute.

**Send back:** which provider you used, and whether the NTU inbox received it in the inbox or in junk.

## 7. Testing on a phone, and installing it (tasks B7, D5, Q4) Not run on a phone

**Why it exists.**
- A phone's location, the screen wake lock and "install" only work over **HTTPS**, so `http://<your-laptop-ip>:5173` will not do.
- The app is meant to be used mostly on phones, so one real run on a real phone matters.

**You need:** the app running (step 2), a phone, and a free tunnel tool: `cloudflared` (Cloudflare) or `ngrok`.

1. Build the web app: `npm run build`.
2. In `.env` set `CLIENT_DIST=../client/dist` (relative to the `server` folder).
3. Start the server: `npm run dev -w @campus-hop/server`.
4. In another terminal start the tunnel: `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`). It prints an `https://...` address.
5. In `.env` set `CLIENT_ORIGIN` to **exactly** that address and `COOKIE_SECURE=true`, then restart the server.
6. Open that address on the phone.
7. Android Chrome: menu, then _Add to home screen_ / _Install app_.
   - Allow location when asked.
   - The screen wake lock keeps the screen on during a trip (Chrome on Android supports it; on iPhone, check that your iOS version does).
8. Switch the phone to airplane mode and reopen the app: you should see the offline notice, not a browser error page.

**How to check it worked:** go live on the phone, allow location, and the driver's map shows a moving dot.

**Before a real phone: the phone check on the laptop.**
- Every screen is also checked as six phones (iPhone SE, iPhone 14, Pixel 7, a small 360 px Android, a phone on its side, and an iPhone with the keyboard up).
- Each run walks the whole trip with touch and a mobile browser, and checks every screen for sideways scrolling, controls smaller than 44 x 44 px, text boxes under 16 px (iPhones zoom in on those), tiny text and controls hidden under a bar:

```
npm run build
CLIENT_DIST=D:/dev/campus-hop/client/dist npm run dev -w @campus-hop/server     # in one terminal
npm run demo:reset && node scripts/ui-smoke.mjs --device iphone-se --out ui-shots/mobile/iphone-se
```

- Repeat with `--device iphone-14`, `pixel-7`, `android-small`, `landscape`, `keyboard` (run `npm run demo:reset` before each: the walk books a trip).
- Screenshots and `mobile-report.json` land in the `--out` folder.
- This uses Chrome pretending to be a phone: it does not replace one run on a real iPhone (Safari draws pages with a different engine) and a real Android phone.

**Send back:** a screenshot of the driver's map moving, and the phone model.

## 8. Hosting (tasks F14, Q6) Not run

**Why it exists.**
- For the demo the app must be on a public https address that everyone can open.
- The project's decision (Grill Q3) is "one free host that runs Node and Postgres, chosen later; everything is configured with environment variables".
- `deploy/README.md` in the repository has the same list with more detail.

**What to look for in a host**
- (check the current terms, they change): runs a **Docker image** or Node; offers a **PostgreSQL 16** database; passes **WebSocket** connections (the live map needs it); a region near **Singapore**; and what happens when the app is idle (free tiers sleep, and some delete the database after a period).
- Examples people use: Render, Railway, Fly.io.

**You need:** a hosting account, the repository on GitHub, the values from steps 5 and 6 if you want real maps and e-mail.

**H1.** Create a managed **Postgres** database on the host. Copy its connection URL.

**H2.** Create a **web service** from the repository, built from the `Dockerfile` in the repository root.

**H3.** In the service's **environment variables** (secret settings), add these:

| Name                                                             | Value                                                                                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                       | `production`                                                                                                                                                               |
| `DATABASE_URL`                                                   | the URL from H1 (add `?sslmode=require` if the host needs it)                                                                                                              |
| `JWT_SECRET`                                                     | 32 or more random characters, **never** the sample from `.env.example`. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`             |
| `COOKIE_SECURE`                                                  | `true`                                                                                                                                                                     |
| `CLIENT_ORIGIN`                                                  | the public https address the host gives you                                                                                                                                |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | from step 6                                                                                                                                                                |
| `GOOGLE_MAPS_API_KEY`                                            | from step 5 (optional)                                                                                                                                                     |
| `CAMPUS_BOUNDARY`                                                | `/app/server/prisma/data/campus-boundary.json` (optional, step 4)                                                                                                          |

**H4.** Deploy. The container applies the database migrations by itself when it starts.

**H5.** **Once**, in a one-off shell or job on the host with the same variables, run `node server/dist/seed/cli.js` to load the fare table and the reviewed campus places.

**H6.** Open `https://<your-address>/api/health`: it must show `{"status":"ok", ...}`.

**H7.**
- On a phone: open the address, register, check the e-mail arrives, sign in (this proves the cookie works), then run `npm run replay-gps -- --url https://<your-address>` during a trip to prove the WebSocket survives the host's proxy.

**Write down next to the demo date:** when the free database expires, and that the first visit after idle takes 30 to 60 seconds (open the app a few minutes before the demo).

**Send back:** the public address, and the host's name and plan.

## 9. GitHub (tasks F1, K10) Not run

**Why it exists.** Four people change the same code. These settings stop one person's mistake from reaching everyone, and let GitHub run the checks automatically.

**The repository today.**
- https://github.com/softwarelab3/2006-SCSA-R3 has the branches `main`, `Staging` and `init` (as of 25 Oct 2026).
- The earlier branches `dev`, `feat/K2-config-logger` and `docs/task-exports-and-decisions` no longer exist on GitHub.
- The team's code on `main` and `Staging` sits in a folder called `dev/`; the full project in this document set sits at the repository root.
- **The team must choose one layout** (the root is recommended, because the Dockerfile, `docker-compose.yml`, `npm run dev` and the GitHub checks all assume it).

**Publishing a branch, step by step** (replace the names). From a terminal in the project folder:

1. `git fetch origin`
2. `git switch -c <your-branch> origin/Staging` (a new branch that starts from `Staging`).
3. Make your changes, then `git status`. **Check that neither `.env` nor `node_modules` nor any key is listed**, then `git add -A` and `git commit -m "[<task id>] what you did"`.
4. `git push -u origin <your-branch>`.
5. Open https://github.com/softwarelab3/2006-SCSA-R3/compare/Staging...<your-branch>?expand=1 and click _Create pull request_.
   - Wait for the green check, get one teammate to approve, then press _Merge pull request_ (the team uses squash).

**Settings an administrator must do** (only a repository admin sees `Settings`):

1. `Settings > Collaborators`: add the other team members with **Write** access.
2. **Add branch protection** (`Settings > Branches > Add branch protection rule`), for `main` and for `Staging`.
   - Tick _Require a pull request before merging_.
   - Tick _Require approvals_ and set it to 1.
   - Tick _Require status checks to pass_ and pick the check named **`checks`** (it only appears after CI has run once).
   - Tick _Do not allow bypassing_.
   - Leave force-push and deletion switched off.
   - Allow **squash merging** only (`Settings > General > Pull Requests`).
3. CI needs **no secrets**. It runs typecheck, lint, formatting, the dependency rule, the docs check, all tests (with a Postgres service) and `npm audit --omit=dev --audit-level=high`.

**Known problems a rehearsal found (25 Oct 2026). Fix these or the first check will be red:**

| Problem | Why | Fix |
| ------- | --- | --- |
| The web-app tests cannot start on a clean install ("Cannot find package 'jsdom'") | `jsdom` is only installed inside `client/`, but the test runner looks for it at the top | run `npm install --save-dev --save-exact jsdom@29.1.1` in the project root and commit `package.json` and `package-lock.json` |
| The e-mail test (`SmtpEmailAdapter.int.test.ts`) fails | it needs the fake inbox (Mailpit), and `ci.yml` starts only Postgres; on Windows `localhost` also hangs | add a Mailpit service to `.github/workflows/ci.yml`, or make the test skip when Mailpit is not reachable; use `127.0.0.1` instead of `localhost` in the test |
| `npm run docs:check` fails | it requires every use case to have a test, and the features that come in later cycles have none yet | skip the docs step in `ci.yml` until the last cycle (leave a comment saying when to switch it back on) |
| `npm run format:check` fails on the `dev/` folder | the team's copy under `dev/` is not formatted like the rest | add `dev/` to `.prettierignore`, or remove the folder once the code is at the root |

- **Scantist** (the SCA and SAST report the lab asks for) needs **your own Scantist account** and a scan of the repository; save the report under `docs/`. Nothing in the code connects to it.
- **Release:** `Staging` to `main` by pull request, then tag `v1.0.0`. `release.yml` rebuilds the image and calls the optional secret `DEPLOY_HOOK_URL`.

## 10. The demo (tasks Q5, K7)

**Window:** type every command here in **Git Bash** (the line before the cursor must not start with `PS`). The README at the top of this page says how to open it and how to paste.

**Why it exists.** A live demo cannot depend on luck. One command puts the database in the same known state every time.

- **First, once:** `npm run build:shared` (the demo script needs the compiled shared code; without it you get `Cannot find module ... @campus-hop/shared/dist/index.js`). Check: `ls shared/dist | head -3` shows files like `api.d.ts`.
- Then `npm run demo:reset` prints the logins (password for everybody: `demo-password-1`).
- **Click-by-click test sheet with tick boxes:** open `Labs/code_review/Campus_Hop_Demo_Test_Sheet.html` in a browser. It has the demo people, places and presets, each step and what you should see.
- **Place the demo where you are** (so a driver's real location gives a short route):
  - Open Google Maps, right-click the spot where you are standing, and click the two numbers at the top of the menu to copy them (for example `1.3478, 103.6803`).
  - Open `.env` and add one line: `DEMO_GRID_ORIGIN=1.3478,103.6803` (use your own numbers). The line must be latitude, comma, longitude.
  - Run `npm run demo:reset` again. It prints `[DEMO] Hall A at <your numbers>`.
  - Refresh the web page. [DEMO] Hall A is now where you are, Main Gate is about 670 m north, and Pioneer Gate about 890 m east.
  - Without that line the grid starts near the middle of NTU (`1.348, 103.683`, approximate).
- It needs the campus catalog (or loads the labelled `[DEMO]` places if it is empty).
- On a deployed server it needs `DEMO_RESET_CONFIRM=yes` because it deletes every user.

| Who         | E-mail                   | What they show                                                            |
| ----------- | ------------------------ | ------------------------------------------------------------------------- |
| Dana Driver | demo.driver@e.ntu.edu.sg | holds **both** roles (Choose Role, the switch), a vehicle and two presets |
| Priya Rider | demo.rider1@e.ntu.edu.sg | $20.00: wallet check **ENOUGH**                                           |
| Wei Rider   | demo.rider2@e.ntu.edu.sg | $1.00: **NOT_ENOUGH**                                                     |
| Sam Trust   | demo.rider3@e.ntu.edu.sg | $2.30 and 3 rides: exactly on the line, **ON_TRUST**                      |
| Lee Locked  | demo.locked@e.ntu.edu.sg | **LOCKED**, owes $0.70; topping up $1.00 unlocks                          |

**Walk the screens without walking outside:**
- sign in as Dana (driving), go live; in a second browser sign in as Priya, request Hall B to the Main Gate, book, and let Dana accept; Dana starts the trip; then run `npm run replay-gps -- --url http://localhost:3000` (it signs in as Dana and plays her route over the live-location channel); Priya's tracking screen follows.
- `node scripts/ui-smoke.mjs` does the whole walk by itself in headless Chrome and saves a screenshot of every screen (it needs Chrome, a built app and a running server; see the top of the script).

**Rehearsal checklist:**
- run `demo:reset` twice and walk the scenes both times; open the deployed address on a phone a few minutes early (idle sleep); check the e-mail arrives; have a second phone for the rider; check the projector shows the map.

## 11. When something goes wrong

**Window:** type every command here in **Git Bash** (the line before the cursor must not start with `PS`). The README at the top of this page says how to open it and how to paste.

| Symptom                                                  | Likely cause and fix                                                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` says Docker is not running                 | Start Docker Desktop and wait for _Engine running_                                                                                                   |
| Docker is slow or the machine freezes                    | Close other programs; limit Docker's memory in its settings                                                                                          |
| `port is already allocated`                              | Another program uses 5433, 1025 or 8025                                                                                                              |
| `npm run demo:reset` says `Cannot find module ... @campus-hop/shared/dist/index.js` | the shared code has not been compiled in this folder (`dist/` is not in git, and `npm ci` does not create it) | run `npm run build:shared` once at the top of the project, then run it again |
| Registering hangs, or the e-mail test times out (Windows) | `SMTP_HOST=localhost` resolves to the IPv6 address first; set `SMTP_HOST=127.0.0.1`                                                                  |
| Prisma: `Environment variable not found: DATABASE_URL`   | Run the command through `npm run db:...` (it reads the root `.env`), not `npx prisma`                                                                |
| Prisma on Windows: `EPERM` renaming `query_engine...dll` | Stop the running server (it holds the file), then `npm run db:generate`                                                                              |
| `npm install` very slow or `EBUSY`                       | The project is inside OneDrive: move it to `D:\dev`                                                                                                  |
| Lines show as changed in every file                      | Line endings: the repository stores LF (`.gitattributes`); `git add --renormalize .`                                                                 |
| Sign-in works but the next request is "not signed in"    | Cookie flags: over plain http use `COOKIE_SECURE=false`; over https it must be `true` and `CLIENT_ORIGIN` must be exactly the address in the browser |
| The map never moves on the passenger's phone             | The driver's trip is not started yet (live location starts at IN_PROGRESS), or the host's proxy blocks WebSocket                                     |
| `docs:check` fails in CI                                 | Run `npm run docs` and commit the changed files (and see step 9: in the early cycles it fails by design)                                              |
| The seed says "skipped: not reviewed"                    | Step 4: a person sets `"reviewed": true` after checking the pin on a map                                                                             |
| The web-app tests say "Cannot find package 'jsdom'"      | Step 9, known problems: declare `jsdom` in the root `package.json`                                                                                   |

## 12. The tasks that are documents or design, not code

**Why this section exists.**
- These tasks produce files, not code, so no program can do them.
- Each is described in full in `docs/tasks.md` (search for its id).
- They count toward the marks listed in the last column.
- Do them **alongside** the coding cycles, not all at the end.

| Task | What to produce | Done when | Marks / source |
| ---- | --------------- | --------- | -------------- |
| F12a | Mockups (L1): Choose Role, Home hub with role switch, Locked Account | Phone-width mockups for the three screens (Choose Role with 'Continue as Driver / Passenger'; Home with the role chip and Switch control; Locked Account), using the contents listed in the Plan tab screen table, committed as PNG or SVG. | Design Model; UC-2; UC-20; Lab2 §3.3.1 |
| F12b | Mockups (L2): Presets, Preset Editor, Location Permission, Live/Waiting, Cancelled Notice | Five phone-width mockups matching the Plan tab screen contents; the Preset Editor shows every field in FR 3.1.1-3.1.4 and 3.1.6. | Design Model; UC-3; UC-4; UC-5; Lab2 §3.3.1 |
| F12c | Mockups (L3): Booking Detail, Wallet, Top-Up, My Trips, Rate User | Five mockups; Top-Up carries an unmissable 'simulated' banner (FR 10.11); Booking Detail shows the balance banner states (FR 10.2-10.4). | Design Model; UC-7; UC-19; UC-20; Lab2 §3.3.1 |
| F12d | Mockups (L4): passenger Active Trip, Trip Complete, quick-message sheet, Notifications | Three mockups including the stale-location (15 s) and low-accuracy (50 m) banners and the three predefined messages from FR 8.6.1. | Design Model; UC-15; UC-16; UC-14; Lab2 §3.3.1 |
| X1 | Add passwordHash / EmailVerification to the data dictionary; resync diagrams | The User entry lists the credential attribute and the dictionary notes the verification-code table; the class model and BCE files are updated to match. Done on 13 Oct: `passwordHash`, `lastActiveRole` and PENDING_VERIFICATION are in the SRS dictionary; still... | SRS Documentation; Class Diagrams; FR 1.4; NFR-2.2; Lab3 §3.2.3 |
| X2 | Redraw use case diagram, import dialog map, SRS Appendix B.6 | The use case diagram in the SRS matches the corrected PlantUML (no ExtensionPoint placeholder, goals not outputs); the dialog map is imported into group_project.vpp and appears as Appendix B.6. Done on 13 Oct: the SRS pictures (B.1, B.2, B.3, B.4) and... | Use Case Model; State Machine Diagrams; SRS Documentation; Lab2 §3.1.1; Lab2 §3.3.1; Lab5 §3.2.2 |
| X3 | Error-catalog table in SRS Appendix D | Every code with its HTTP status and the UC-n.EX.m it traces to, generated from `ERROR_CATALOG`. | SRS Documentation; Design Model; Lab5 §3.2.2; UC-1.EX.1 |
| X4 | Test cases and results (SRS Appendix E) | Black-box and white-box case tables with Test Input, Expected Output and Actual Output, plus the integration results. | Test Cases; SRS Documentation; Lab4 §3.2.4; Lab5 §3.2.2 |
| X5a | Lab 3 §3.3.3: ask an AI for a TODO-only skeleton and critique it | The prompt, the AI's output as a separate zip (empty files with TODO comments only), and a critique: what was missed, what was added that was not asked for. | Lab3 §3.3.3; Lab3 §3.3.4; Lab3 §3.3.5 |
| X5b | Lab 3 §3.3.1-3.3.2: re-prompt the tech stack and compare | The same prompt and model as Lab 2, with the updated class diagram, in a fresh chat; a short answer to whether the recommendation changed and why. | Lab3 §3.3.1; Lab3 §3.3.2; Lab3 §3.3.5 |
| X5c | Lab 4 §3.3.4: the two coding-agent reflections | Two reflections: delete-and-regenerate the control class (prompt, materials, iterations, outcome) and one further experiment of your choice. | Lab4 §3.3.2; Lab4 §3.3.3; Lab4 §3.3.4 |
| X6 | Final traceability matrix into the SRS | The maintained docs/traceability.csv is rendered into the SRS as a requirement -> design -> code -> test table. | SRS Documentation; Lab5 §3.1.6; Lab4 §3.5.1 |
| X7 | Demo script and 5-7 minute backup video | A timed script (use case overview, feature walkthrough, SE practices, one traced use case) and a recorded video made after the freeze. | Lab4 §3.4.1; Lab4 §3.4.4; Lab5 §3.3.1 |
| X8 | Write the role model into the SRS (FR 1.7, 1.8, UC-1/2/3, dialog map) | Done on 13 Oct: SRS v2.1 has FR 1.7 and 1.8, UC-2.AC.1 and UC-2.EX.2, UC-3 for a passenger becoming a driver, `lastActiveRole` in the data dictionary and a Choose Role state in the dialog map. Still to do by the team: review the wording against the lab... | SRS Documentation; Use Case Model; FR 1.5; UC-2; Lab5 §3.2.2 |
| X9a | Finish design class diagram: lane 1 classes | User, Driver, Passenger, DriverPreset have final attributes, operations and visibility in group_project.vpp, matching the code. | Class Diagrams; Design Model; Lab3 §3.2.3; Lab5 §3.2.2 |
| X9b | Finish design class diagram: lane 2 classes | Journey, Route, HopRequest, Booking, FareTier, MatchResultSet finished and matching the code. | Class Diagrams; Design Model; Lab3 §3.2.3; Lab5 §3.2.2 |
| X9c | Finish design class diagram: lane 3 classes | Wallet, WalletTransaction, Debt, Rating finished and matching the code. | Class Diagrams; Design Model; Lab3 §3.2.3; Lab5 §3.2.2 |
| X9d | Finish design class diagram: lane 4 classes | Notification, LocationUpdate, QuickMessage, CampusLocation, PickupPoint finished and matching the code. | Class Diagrams; Design Model; Lab3 §3.2.3; Lab5 §3.2.2 |
| X10 | Renumber the use cases gap-free (UC-1..UC-19) across the documents, board and tests | UC-9, UC-17 and UC-18 are no longer gaps: the SRS, the use case document, the diagram, `docs/traceability.csv`, test names and the board all use the same new numbers; a script lists every old number it replaced. | SRS Documentation; Use Case Model; Lab5 §3.2.2 |

**How to do these in general.**
- Save diagrams and mockups as image or PDF files under `docs/` or the team's `lab` folders (the repository has a storage limit, so use PDF and JPEG, as the repository README says); write SRS appendices in the team's SRS document; when a task has a lab section number in the last column, read that section of the lab manual first, because it is what the marker will use.

## 13. Is the requirement description enough? (the TA's remark on the FR and NFR)

**Why this section exists.**
- The TA said the FR and NFR do not have enough description for the features.
- "Enough" is a judgement, so this step gives you a test to apply, not a number of words.
- No program can do it: you read each requirement and answer questions about it.
- The full audit, the improved texts and a self-check form are in `Labs/code_review/Campus_Hop_Documentation_And_Manual_Guide.html` (open it in a browser).

**The cold reader test (the one question behind all the others).**
- Give the requirement to a teammate who has never seen the app.
- Could they write the code from this text alone?
- Could a tester write the test from this text alone?
- If either answer is no, the requirement is not enough yet.

**The five-question quick test (30 seconds per requirement).**
- **Who and when:** does it say who does it and what starts it?
- **What exactly:** does it say what the system does, with every rule and every number (money, minutes, counts)?
- **What goes wrong:** does it say what happens on each failure and edge case?
- **What the person sees:** does it say what appears on the screen or what is stored?
- **How to check:** can a tester tell pass from fail without asking you?
- A requirement that answers all five is **enough**.
- One that misses one or two is **thin**: it needs a few more lines.
- One that misses three or more, or is one vague sentence, is **missing**: write it again.

**For a non-functional requirement (NFR) ask these instead.**
- Which quality is it (speed, security, privacy, ease of use, reliability, works on which devices)?
- Is there a **number with a unit** (for example "the screen opens within 3 seconds on a normal phone connection")?
- Under which conditions, and how would you measure it?
- Which functional requirements does it limit?
- "Fast", "secure" and "user-friendly" with no number are the commonest reason the TA says "not enough".

**How to improve a thin requirement in four steps.**
- **Step 1.** Find the rules in the code: open the file the audit names (for example `shared/src/defaults.ts`) and copy the real number.
- **Step 2.** Write the missing lines in the SRS style: actor, trigger, steps, numbers, failures, what the person sees.
- **Step 3.** Add two or three acceptance criteria: "Given ... when ... then ..." sentences a tester can run.
- **Step 4.** Mark any number you are unsure of `ASSUMED, owner to confirm`, and ask the owner before the SRS is submitted.

**How to record the key factors (so a teammate knows what to change when the code changes).**
- A key factor is a value or rule that decides how the app behaves (a fare, a time window, a limit, a state, an error code).
- For each one write four things: its name, its value, the file where it is set, and every other place that repeats it (screen text, tests, the SRS).
- The guide file lists these with a checklist per factor: "if you change it, also change ...".
- Rule: when you change a number in code, search for the old number in `client/`, `docs/`, the tests and the SRS in the same sitting.

**What to send to teammates.**
- The guide file (one HTML file, works offline) and the improved texts from its Requirement audit section.
- Each teammate takes the requirements for the features they own, pastes the improved text into the SRS, and ticks it in the guide.
