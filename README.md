# Badri (بدري) — sepsis early-warning simulation

Live demo: https://badri-sepsis.vercel.app

A 3D walk-through of how Badri catches sepsis early: triage vitals give a quick score, a near-threshold patient gets the Badri patch and reader, the score is re-checked on a schedule, and an alert escalates nurse → ER doctor → responsible physician / ICU while the first-hour clock runs.

Built for the 3rd MedBio Hackathon, Khalifa University, November 2026.

**This is a concept demo, not a medical device.** The thresholds are demo thresholds and the patient cases are made up.

## Files
- `index.html`: the built site (what Vercel serves)
- `assets/`: avatars, textures and animation clips
- `src/`: the source. `engine.js` holds the scoring and case logic, `world.js` the 3D hospital, `avatars.js` the people, `patch.js` the 3D model of the patch and reader ("The patch" tab), `ui.js` the controls, and `app.html` the page shell

## Rebuild after editing `src/`
```
python3 src/build.py
```

## Credits
People are from the Microsoft Rocketbox Avatar Library (MIT licence, see `ROCKETBOX-LICENSE.md`). 3D engine: three.js.
