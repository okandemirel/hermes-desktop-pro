import { spawn } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const dist = path.join(root, "dist")
const appName = "Hermes Desktop Pro.app"

const directCandidates = [
  path.join(dist, "mac-arm64", appName),
  path.join(dist, "mac", appName)
]

function findBuiltApp() {
  for (const candidate of directCandidates) {
    if (existsSync(candidate)) return candidate
  }

  if (!existsSync(dist)) return null

  const stack = [dist]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory() && entry.name === appName) return entryPath
      if (entry.isDirectory() && !entry.name.endsWith(".app")) stack.push(entryPath)
    }
  }

  return null
}

const appPath = findBuiltApp()

if (!appPath) {
  console.error("No built Hermes Desktop Pro.app was found in dist/.")
  console.error("Run `npm run build:mac:app` first, or use `npm run start:mac` to build and open it.")
  process.exit(1)
}

console.log(`Opening ${appPath}`)

const child = spawn("open", [appPath], { stdio: "inherit" })

child.on("exit", (code) => {
  process.exit(code ?? 0)
})
