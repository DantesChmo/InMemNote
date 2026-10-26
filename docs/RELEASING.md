# Releasing Inmemnote

Releases are built by [`.github/workflows/release.yml`](../.github/workflows/release.yml)
on GitHub Actions whenever a `v*` tag is pushed. The workflow first runs the
whole CI suite ([`ci.yml`](../.github/workflows/ci.yml): typecheck, lint, unit
and e2e tests) and only then builds the DMG and attaches it to a GitHub
Release. After a successful release,
[`.github/workflows/homebrew.yml`](../.github/workflows/homebrew.yml) updates
the Homebrew cask.

Installing from the DMG is the primary channel. Homebrew and the
`curl … scripts/install.sh | bash` one-liner both install that same DMG.

## What a release contains

Every release carries two byte-identical copies of the DMG:

| Asset | Who uses it |
|---|---|
| `Inmemnote-X.Y.Z-arm64.dmg` | People downloading from the Releases page, and the Homebrew cask. |
| `Inmemnote-macos-arm64.dmg` | `scripts/install.sh` and the in-app updater, through the version-independent URL `releases/latest/download/Inmemnote-macos-arm64.dmg`. |

**Never drop or rename the stable `Inmemnote-macos-arm64.dmg`.** The updater
of every version already installed looks for exactly that name
(`src/infrastructure/update/config.ts`). Without it, those copies can never
update again.

## Signing modes

| Mode | When | Result |
|---|---|---|
| **Ad-hoc** | any of the seven secrets below is missing | Ad-hoc signed DMG (no Apple account needed), not notarized; the run shows an "Ad-hoc signed build" warning. macOS blocks the app on first launch, and users allow it once with **Open Anyway** (see the README). **This is the project's current mode.** |
| **Signed** | all seven secrets are set | App signed with Developer ID and hardened runtime; DMG signed, notarized by Apple and stapled. Opens without Gatekeeper warnings. |

The signed mode follows the same steps as
[SuperLaunchpad](https://github.com/DantesChmo/SuperLaunchpad), but it **has
never been run for Inmemnote**. Expect to debug the first signed release
(see [Troubleshooting](#troubleshooting)).

## Cut a release

1. Make sure `main` is green and up to date locally.
2. Bump the version. This commits `package.json` / `package-lock.json` and
   creates the matching tag:

   ```bash
   npm version minor -m "chore(release): v%s"
   ```

   (`npm run release:minor` is the same command. Use `patch` or `major`
   instead of `minor` as needed.)

3. Push the commit and the tag:

   ```bash
   git push --follow-tags
   ```

4. Watch **Actions → Release**. The CI part takes about as long as a normal
   run; notarization (signed mode only) adds 1–10 minutes.
5. When it finishes, the GitHub Release `vX.Y.Z` has both DMGs attached, with
   auto-generated release notes. A few minutes later **Actions → Homebrew**
   pushes the new cask to the tap.

**The version comes from the tag** (`v1.2.3` → `1.2.3`). The workflow writes
it into `package.json` before building, because the app reports
`package.json`'s version to the updater. If the committed `package.json`
disagrees, the run still builds the tag's version but shows a "Version
mismatch" warning. `npm version` keeps the two in step.

Tags must keep increasing: the updater installs a release only if its version
is strictly newer than the running one.

### Prereleases

A tag with a suffix, such as `v1.3.0-rc1`, is published as a **prerelease**.
`releases/latest` skips prereleases, so neither the in-app updater, nor
`install.sh`, nor Homebrew picks it up. Download it from the Releases page to
test it.

### Manual run

**Actions → Release → Run workflow**, enter a version. This runs the tests and
builds the DMGs as a workflow artifact, but does **not** publish a GitHub
Release.

## Homebrew tap

The cask lives in
[DantesChmo/homebrew-tap](https://github.com/DantesChmo/homebrew-tap) as
`Casks/inmemnote.rb`, shared with SuperLaunchpad. Its template is
[`packaging/homebrew/inmemnote.rb`](../packaging/homebrew/inmemnote.rb):
`homebrew.yml` copies the template, fills in `version` and `sha256` from the
released DMG, and commits it to the tap. Change anything else (description,
`zap` paths, macOS floor) in the template, not in the tap.

The workflow needs one secret, `HOMEBREW_TAP_TOKEN`, with write access to the
tap. Without it the job is skipped with a "Homebrew tap not updated" warning
and the release itself is unaffected.

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories** → `DantesChmo/homebrew-tap`.
3. Permissions: **Contents → Read and write**.
4. Add it to this repository: **Settings → Secrets and variables → Actions →
   New repository secret**, name `HOMEBREW_TAP_TOKEN`. (If SuperLaunchpad's
   token already covers the tap, the same value works here.)

To publish a version that is already released (for example after adding the
token), run **Actions → Homebrew → Run workflow** with that version.
Prereleases and drafts are never published to the tap.

## Setting up Developer ID signing

Signed mode needs a paid [Apple Developer Program](https://developer.apple.com/programs/)
membership (99 USD/year). Only the Account Holder can create Developer ID
certificates.

### 1. Create the Developer ID Application certificate

You need a Mac with Keychain Access (Xcode is not required).

1. Open **Keychain Access** → menu **Keychain Access → Certificate Assistant →
   Request a Certificate From a Certificate Authority…**
2. Enter your email and name, leave *CA Email* empty, choose **Saved to disk**,
   and save `CertificateSigningRequest.certSigningRequest`.
3. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates/list)
   → **+** → **Developer ID Application** → Continue. If asked for a profile
   type, pick **G2 Sub-CA**.
4. Upload the `.certSigningRequest`, then download `developerID_application.cer`.
5. Double-click the `.cer` to install it. In Keychain Access → **login** →
   **My Certificates** you should now see
   `Developer ID Application: <Your Name> (<TEAMID>)` with a private key under it.

> Keep this certificate safe: Apple allows only a few Developer ID
> certificates per account, and everything signed with it is tied to your
> name. One certificate can sign both Inmemnote and SuperLaunchpad.

### 2. Export the certificate as .p12 and base64 it

1. In Keychain Access → **My Certificates**, right-click
   `Developer ID Application: …` → **Export…**
2. Format **Personal Information Exchange (.p12)**, save as `developer-id.p12`.
3. Set a strong export password. This becomes `MACOS_CERTIFICATE_PASSWORD`.
4. Encode the file and copy it to the clipboard (nothing is printed):

   ```bash
   base64 -i developer-id.p12 | pbcopy
   ```

   Paste it as `MACOS_CERTIFICATE_P12_BASE64` (step 5), then delete the `.p12`
   from disk or keep it in a password manager.

### 3. Find your Team ID

[developer.apple.com/account](https://developer.apple.com/account) →
**Membership details** → **Team ID** (10 characters, e.g. `AB12CD34EF`).
It is also the part in parentheses in the certificate name.
This becomes `APPLE_TEAM_ID`.

### 4. Create an App Store Connect API key (for notarization)

1. Go to [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api)
   (on first visit, click **Request Access** and accept the terms).
2. Under **Team Keys**, click **+** (Generate API Key).
3. Name it e.g. `Inmemnote CI`, Access: **Developer**. Generate.
4. Note the **Key ID** of the new row → `APPSTORE_API_KEY_ID`.
5. Note the **Issuer ID** shown above the table → `APPSTORE_API_ISSUER_ID`.
6. Click **Download API Key** and save `AuthKey_<KEYID>.p8`.
   **It can be downloaded only once.**
7. Encode it and copy it to the clipboard:

   ```bash
   base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
   ```

   This becomes `APPSTORE_API_KEY_P8_BASE64`. Keep the `.p8` in a password
   manager; if it leaks, revoke the key in App Store Connect.

### 5. Add the secrets to GitHub

Open the repository on GitHub → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**, and add each one (names must match
exactly):

| Secret | Value |
|---|---|
| `MACOS_CERTIFICATE_P12_BASE64` | base64 of `developer-id.p12` (step 2) |
| `MACOS_CERTIFICATE_PASSWORD` | the `.p12` export password (step 2) |
| `MACOS_KEYCHAIN_PASSWORD` | any random string; it protects the temporary keychain on the CI runner. Generate one with `openssl rand -base64 24 \| pbcopy` |
| `APPLE_TEAM_ID` | your Team ID (step 3) |
| `APPSTORE_API_KEY_P8_BASE64` | base64 of `AuthKey_<KEYID>.p8` (step 4) |
| `APPSTORE_API_KEY_ID` | Key ID (step 4) |
| `APPSTORE_API_ISSUER_ID` | Issuer ID (step 4) |

GitHub masks secret values in logs, and the workflow never prints them. The
certificate and API key files are written to `$RUNNER_TEMP` only for the step
that needs them and deleted afterwards; the temporary keychain is deleted at
the end of the job even if it fails.

## What the pipeline does

1. Runs `ci.yml` (as a reusable workflow) and stops if anything is red.
   The build job itself runs on `macos-26`: only there can `actool`
   compile the light/dark app icon (`packaging/macos/Inmemnote.icon`), and
   a "Verify app icon" step fails the run if `Assets.car` did not make it
   into the bundle.
2. Resolves the version from the tag and writes it into `package.json`.
3. *Signed only:* imports the `.p12` into a temporary keychain.
4. Runs `npm run make`. `forge.config.ts` reads `MACOS_SIGN_IDENTITY`:
   - **unset (ad-hoc):** the `postPackage` hook reseals the whole bundle with
     `codesign --sign -` (see the comment there for why that is load-bearing);
   - **set (signed):** the packager signs every binary with Developer ID,
     hardened runtime, a secure timestamp and
     [`packaging/macos/entitlements.plist`](../packaging/macos/entitlements.plist),
     after the Fuses plugin has rewritten the Electron binary.
5. Verifies the app with `codesign --verify --deep --strict`. In ad-hoc mode
   it also checks the signature really is ad-hoc.
6. *Signed only:* signs the DMG, submits it with
   `xcrun notarytool submit --wait` (Apple checks the DMG and the app inside
   it in one submission; on failure the log is printed and the job fails),
   staples the ticket and checks it with `stapler validate` and
   `spctl -a -vv -t install`.
7. Copies the final DMG to both asset names, uploads them as a workflow
   artifact and, for tag pushes, to the GitHub Release.

## Verifying a downloaded DMG locally

Signed mode:

```bash
spctl -a -vv -t install Inmemnote-1.2.3-arm64.dmg
```

Expected: `accepted` and `source=Notarized Developer ID`.

Ad-hoc mode: mount the DMG and check the app's seal (a broken seal is what
makes macOS call an app "damaged", which Open Anyway cannot get past):

```bash
codesign --verify --deep --strict --verbose=2 "/Volumes/Inmemnote/Inmemnote.app"
```

## Troubleshooting

- **"No 'Developer ID Application' identity"**: the `.p12` was exported
  without its private key, or it holds a different certificate type
  (e.g. *Apple Development*). Re-export from **My Certificates**.
- **Notarization status `Invalid`**: open the printed log. Typical causes are
  a binary without hardened runtime or secure timestamp, for example a native
  `.node` addon that the packager did not sign.
- **App crashes on launch only in signed mode**: hardened runtime is refusing
  something the ad-hoc build allowed. Add the missing entitlement to
  `packaging/macos/entitlements.plist` (for example
  `com.apple.security.cs.disable-library-validation` if a native addon fails
  to load).
- **401 from notarytool**: wrong Key ID / Issuer ID, the key was revoked, or the
  `.p8` was base64-encoded with line breaks lost. Re-encode with `base64 -i`.
- **Certificate expired** (Developer ID certificates last 5 years): create a new
  one (steps 1–2) and update the two `MACOS_CERTIFICATE_*` secrets.
- **Homebrew job says the release is a draft or prerelease**: it only
  publishes final releases. Run it manually once the release is final.

## Auto-updates

The app updates itself without Squirrel or Sparkle (see
[ADR 0002](adr/0002-signing-free-self-updater.md)). It reads
`/releases/latest` from the GitHub API, downloads the stable
`Inmemnote-macos-arm64.dmg`, and swaps the bundle in `/Applications` from a
detached helper script. Nothing extra is needed at release time: publishing
the release is what makes the update available.
