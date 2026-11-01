// node scripts/latest-json.mjs <folder with the release's .sig files>
// Prints the release's latest.json: for each system, the file its installed app downloads and the
// signature that file must match (the key is plugins.updater.pubkey in src-tauri/tauri.conf.json).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Each file of the release and the updater's keys for it: `{os}-{arch}-{installer}`, then `{os}-{arch}`. */
function platformFiles(version) {
  return {
    [`Beynt-${version}-win-x64.exe`]: ['windows-x86_64-nsis', 'windows-x86_64'],
    [`Beynt-${version}-mac-universal.app.tar.gz`]: ['darwin-aarch64-app', 'darwin-x86_64-app', 'darwin-aarch64', 'darwin-x86_64'],
    // No bare linux-x86_64: an app installed from the .deb must never get the AppImage.
    [`Beynt-${version}-linux-x86_64.AppImage`]: ['linux-x86_64-appimage'],
    // Only when the build signed the .deb; otherwise those installs update by hand.
    [`Beynt-${version}-linux-amd64.deb`]: ['linux-x86_64-deb']
  }
}

const REQUIRED = ['windows-x86_64', 'darwin-aarch64', 'linux-x86_64-appimage']

/** `signature(file)` is the content of the file's .sig, or null when there is none. */
export function latest({ version, repository, tag, signature, date = new Date() }) {
  const base = `https://github.com/${repository}/releases/download/${tag}/`
  const platforms = {}
  for (const [file, keys] of Object.entries(platformFiles(version))) {
    const signed = signature(file)
    if (signed) for (const key of keys) platforms[key] = { signature: signed, url: base + file }
  }
  const missing = REQUIRED.filter((key) => !platforms[key])
  if (missing.length > 0) throw new Error(`No signed update for ${missing.join(', ')}`)
  return { version, notes: `https://github.com/${repository}/releases/tag/${tag}`, pub_date: date.toISOString(), platforms }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const folder = process.argv[2]
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
  const signature = (file) => {
    const path = join(folder, `${file}.sig`)
    return existsSync(path) ? readFileSync(path, 'utf8').trim() : null
  }
  const { GITHUB_REPOSITORY: repository, GITHUB_REF_NAME: tag } = process.env
  console.log(JSON.stringify(latest({ version, repository, tag, signature }), null, 2))
}
