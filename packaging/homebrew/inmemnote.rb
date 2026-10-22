# Template for Casks/inmemnote.rb in DantesChmo/homebrew-tap.
# .github/workflows/homebrew.yml rewrites the `version` and `sha256` lines
# for every published release; edit everything else here, not in the tap.
cask "inmemnote" do
  version "0.0.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/DantesChmo/InMemNote/releases/download/v#{version}/Inmemnote-#{version}-arm64.dmg"
  name "Inmemnote"
  desc "Spotlight-style quick Markdown notes"
  homepage "https://github.com/DantesChmo/InMemNote"

  livecheck do
    url :url
    strategy :github_latest
  end

  # The app updates itself from GitHub Releases, so `brew upgrade` leaves it
  # alone unless run with --greedy; otherwise both would fight over the bundle.
  auto_updates true
  depends_on arch: :arm64
  depends_on macos: ">= :ventura"

  app "Inmemnote.app"

  zap trash: [
    "~/Library/Application Support/Inmemnote",
    "~/Library/Preferences/com.inmemnote.app.plist",
    "~/Library/Saved Application State/com.inmemnote.app.savedState",
  ]
end
