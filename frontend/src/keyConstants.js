// Circle of fifths order, starting from C
export const TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']
export const QUALITIES = ['Major', 'Minor']

// Parse a stored key string like "E Major" into { tonic: 'E', quality: 'Major' }
// Returns { tonic: '', quality: '' } if the string doesn't match
export function parseKey(keyString) {
  if (!keyString) return { tonic: '', quality: '' }
  const parts = keyString.split(' ')
  if (parts.length === 2 && TONICS.includes(parts[0]) && QUALITIES.includes(parts[1])) {
    return { tonic: parts[0], quality: parts[1] }
  }
  return { tonic: '', quality: '' }
}

// Combine tonic and quality into a single string, or return null if incomplete
export function buildKey(tonic, quality) {
  if (tonic && quality) return `${tonic} ${quality}`
  return null
}
