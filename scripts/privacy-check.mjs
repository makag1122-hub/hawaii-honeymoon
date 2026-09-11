import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const root = process.cwd()
const deniedExtensions = /\.(?:pdf|xlsx?|xlsm|zip|7z|rar|csv|eml|msg|docx?|heic)$/i
const deniedDirectories = /(?:^|\/)(?:private|personal|backups|test-results|playwright-report|output)(?:\/|$)/i
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', '.cache'])
const failures = []

function walk(directory, skipIgnored = false) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (skipIgnored && ignoredDirectories.has(entry.name)) return []
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? walk(path, skipIgnored) : [relative(root, path).replaceAll('\\', '/')]
  })
}

let sourceFiles
try {
  sourceFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean)
} catch {
  sourceFiles = walk(root, true)
}

if (!existsSync(resolve(root, 'dist/index.html'))) {
  failures.push('dist/index.html: 먼저 npm run build를 실행해 주세요.')
}
const files = [...new Set([...sourceFiles, ...(existsSync(resolve(root, 'dist')) ? walk(resolve(root, 'dist')) : [])])]
for (const file of files) {
  if (deniedExtensions.test(file) || deniedDirectories.test(file) || /(?:^|\/)\.env(?!\.example$)/i.test(file)) {
    failures.push(`${file}: 개인 자료 또는 비공개 산출물 형식입니다.`)
  }
}

// An optional JSON array of private strings may live OUTSIDE this repository.
// Never print matched strings: the console can itself be a public build log.
const markerIndex = process.argv.indexOf('--markers-file')
if (markerIndex >= 0) {
  const markerPath = process.argv[markerIndex + 1]
  if (!markerPath) throw new Error('--markers-file 뒤에 외부 JSON 경로가 필요합니다.')
  const absolutePath = resolve(markerPath)
  const location = relative(root, absolutePath)
  if (!location.startsWith('..') && !/^[A-Z]:/i.test(location)) throw new Error('개인정보 검사 문자열 파일은 공개 저장소 밖에 두어야 합니다.')
  const markers = JSON.parse(readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, ''))
  if (!Array.isArray(markers) || !markers.every((marker) => typeof marker === 'string' && marker.length >= 4)) throw new Error('검사 문자열은 4자 이상의 문자열 배열이어야 합니다.')
  for (const file of files) {
    if (!existsSync(resolve(root, file))) continue
    const bytes = readFileSync(resolve(root, file))
    markers.forEach((marker, index) => {
      if (bytes.includes(Buffer.from(marker))) failures.push(`${file}: 비공개 검사 문자열 #${index + 1} 발견`)
    })
  }
}

if (failures.length) {
  console.error(`공개 파일 검사 실패 (${failures.length}건)\n${failures.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`공개 파일 ${files.length}개 검사 통과: 원본 서류·백업·비공개 산출물 파일 없음${markerIndex >= 0 ? ', 외부 개인정보 문자열 검사 통과' : ''}.`)
}
