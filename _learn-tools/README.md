# Re-encrypt the learning hub

GitHub Pages publishes this repo from the `master` branch with its built-in Jekyll build. Pages are public. Everything under `learn/` is ciphertext plus the lesson CSS and JavaScript. This `_learn-tools/` directory is not published: Jekyll skips folders whose names start with `_`.

The password is not stored in the repo. StatiCrypt reads `STATICRYPT_PASSWORD`. This script accepts that variable or `LEARN_PASSWORD`.

## Refresh the lessons

1. Put the plaintext courses in `learn-src/` at the repo root (gitignored):

   ```
   learn-src/policy-gradients/
   learn-src/rl-environments/
   ```

   Each course needs `lessons/`, `reference/`, `assets/`, and optionally `MISSION.md` and `RESOURCES.md`. `NOTES.md` and `learning-records/` are left out of the site.

2. From the repo root:

   ```
   cd _learn-tools
   npm install
   LEARN_PASSWORD='your-password' npm run encrypt
   ```

The script rebuilds the hub and course indexes, renders Mission and Resources, rewrites sister-course links that still point at `teach-policy-gradients`, and encrypts every HTML file under `learn/` with the same salt. Remember me is on and has no expiry, so one entry per browser survives a rebuild.

StatiCrypt stops to ask about passwords shorter than 14 characters. The script passes `--short` so it can run unattended. A short password on a public Pages site can be guessed offline from the ciphertext; it only keeps casual visitors out.

Commit the regenerated `learn/` directory. Do not commit `learn-src/`, `.env`, or the password.
