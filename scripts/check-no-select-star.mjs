// Fails if recruitment / deliberation code selects every column.
// Run: npm run check:egress
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const pathsToCheck = [
  'src/lib/applications.js',
  'src/pages/Apply.jsx',
  'src/portals/recruitment',
  'src/portals/brother/pages/Alumni.jsx',
  'src/portals/eboard/pages/Alumni.jsx',
  'lambdas/src/syncAlumniFromSheet.js',
  'lambdas/src/graduateBrothers.js',
  'lambdas/src/syncRushApplicationsToSheets.js',
]
const selectEverythingPattern = /\.select\(\s*(['"`])\*\1\s*\)|\.select\(\s*\)/

function listSourceFiles(path) {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((name) => listSourceFiles(join(path, name)))
}

const violations = []
for (const sourceFile of pathsToCheck.flatMap(listSourceFiles)) {
  readFileSync(sourceFile, 'utf8').split('\n').forEach((line, index) => {
    if (selectEverythingPattern.test(line)) violations.push(`${sourceFile}:${index + 1}: ${line.trim()}`)
  })
}

if (violations.length > 0) {
  console.error('Select explicit columns instead of * (see docs/egress-rules.md):\n' + violations.join('\n'))
  process.exit(1)
}
console.log('check:egress ok — no select(*) in recruitment code.')
