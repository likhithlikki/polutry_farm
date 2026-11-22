# 04_GITHUB_UPLOAD: the website (GitHub Pages)

**Needs:** a GitHub account. No build step: plain HTML/CSS/JS.
**Upload exactly these 4 files:** `index.html`, `app.js`, `style.css`, `config.js`. (Not this guide, if you want a clean repo.)

## Steps
1. Finish `../05_GOOGLE_APPS_SCRIPT` first so you have the web app URL ending in `/exec`.
2. Edit `config.js`: set `APPS_SCRIPT_URL: "https://script.google.com/macros/s/XXXX/exec"`. Leave `MOCK: false`. **Do not put any key in this file.**
3. On GitHub: **New repository** (public, for free Pages), then **Add file > Upload files**, drag the 4 files into the repo root, commit.
4. **Settings > Pages**: Source = *Deploy from a branch*, branch `main`, folder `/ (root)`. Wait about a minute for the site URL.
5. Open the site, click the key icon and enter your viewer/operator/admin key. It is stored only in that browser.

## Try it without the backend
Open `index.html` with `?mock=1` at the end of the address to see demo data.

## Notes
- Viewer key = view only. Operator = can send commands. Admin = can change settings.
- The website tests (`web/test/*`) are in `../07_PC_TESTS_full_tree`, not here.
