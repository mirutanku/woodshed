import { useState, useRef } from 'react'
import api from '../api'
import { useToast } from './Toast'
import KeyPicker from './KeyPicker'
import { buildKey } from '../keyConstants'

function RecordingUpload({ tuneId, onUploaded } : {
  tuneId: number
  onUploaded: () => void
}) {
  const toast = useToast()
  const [file, setFile] = useState(null)
  const [artist, setArtist] = useState('')
  const [description, setDescription] = useState('')
  const [keyTonic, setKeyTonic] = useState('')
  const [keyQuality, setKeyQuality] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragover, setDragover] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  // For URL import mode
  const [mode, setMode] = useState<'file' | 'url'>('file')
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [preview, setPreview] = useState<{ title: string; artist: string; duration: number } | null>(null)
  const [importTitle, setImportTitle] = useState('')
  const [importArtist, setImportArtist] = useState('')
  const [importDescription, setImportDescription] = useState('')
  const [importKeyTonic, setImportKeyTonic] = useState('')
  const [importKeyQuality, setImportKeyQuality] = useState('')

  function handleFileSelect(selectedFile: File | null) {
    setError('')
    if (!selectedFile) return

    // Basic type check on the client side
    const validTypes = ['audio/', 'video/mp4', 'video/x-m4a']
    const validExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.mp4', '.wma', '.aiff', '.opus']
    const hasValidType = !selectedFile.type || validTypes.some(t => selectedFile.type.startsWith(t))
    const hasValidExtension = validExtensions.some(ext => selectedFile.name.toLowerCase().endsWith(ext))
    if (!hasValidType && !hasValidExtension) {
      setError('Please select an audio file')
      return
    }

    // Size check (50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File too large (max 50MB)')
      return
    }

    setFile(selectedFile)
  }

  function handleDrop(e: any) {
    e.preventDefault()
    setDragover(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }

  function handleDragOver(e: any) {
    e.preventDefault()
    setDragover(true)
  }

  function handleDragLeave() {
    setDragover(false)
  }

  async function handleUpload() {
    if (!file) return

    // All-or-nothing key validation
    if ((keyTonic && !keyQuality) || (!keyTonic && keyQuality)) {
      setError('Please select both a tonic and quality for the key, or leave both blank')
      return
    }

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (artist.trim()) formData.append('artist', artist.trim())
      if (description.trim()) formData.append('description', description.trim())
      const key = buildKey(keyTonic, keyQuality)
      if (key) formData.append('key', key)

      await api.post(`/tunes/${tuneId}/recordings`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      // Reset form
      setFile(null)
      setArtist('')
      setDescription('')
      setKeyTonic('')
      setKeyQuality('')
      if (fileInputRef.current) fileInputRef.current.value = ''

      toast('Recording uploaded')
      onUploaded()
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function handleClearFile() {
    setFile(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFetchPreview() {
    if (!url.trim()) return
    setImporting(true)
    setImportError('')
    setPreview(null)
    try {
      const res = await api.get(`/import-preview?url=${encodeURIComponent(url.trim())}`)
      setPreview(res.data)
      setImportTitle(res.data.title)
      setImportArtist(res.data.artist)
    } catch (err: any) {
      setImportError(err.response?.data?.detail || 'Could not load URL')
    } finally {
      setImporting(false)
    }
  }

  async function handleConfirmImport() {
    if (!url.trim()) return

    if ((importKeyTonic && !importKeyQuality) || (!importKeyTonic && importKeyQuality)) {
      setImportError('Please select both a tonic and quality for the key, or leave both blank')
      return
    }

    setImporting(true)
    setImportError('')
    try {
      const params = new URLSearchParams({ url: url.trim() })
      if (importTitle.trim()) params.set('title', importTitle.trim())
      if (importArtist.trim()) params.set('artist', importArtist.trim())
      if (importDescription.trim()) params.set('description', importDescription.trim())
      const key = buildKey(importKeyTonic, importKeyQuality)
      if (key) params.set('key', key)
      await api.post(`/tunes/${tuneId}/import-url?${params.toString()}`)
      setUrl('')
      setPreview(null)
      setImportTitle('')
      setImportArtist('')
      setImportDescription('')
      setImportKeyTonic('')
      setImportKeyQuality('')
      setMode('file')
      toast('Recording imported')
      if (onUploaded) onUploaded()
    } catch (err: any) {
      setImportError(err.response?.data?.detail || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function cancelImport() {
    setUrl('')
    setPreview(null)
    setImportTitle('')
    setImportArtist('')
    setImportDescription('')
    setImportKeyTonic('')
    setImportKeyQuality('')
    setImportError('')
    setMode('file')
  }

  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      {(error || importError) && <div className="login-error mb-md">{error || importError}</div>}

      {/* Mode toggle */}
      {!file && !preview && (
        <div className="import-mode-toggle">
          <button
            className={`toggle-btn ${mode === 'file' ? 'active' : ''}`}
            onClick={() => { setMode('file'); setImportError('') }}
          >
            Upload file
          </button>
          <button
            className={`toggle-btn ${mode === 'url' ? 'active' : ''}`}
            onClick={() => { setMode('url'); setError('') }}
          >
            Import from URL
          </button>
        </div>
      )}

      {/* File upload mode */}
      {mode === 'file' && !file && (
        <div
          className={`upload-area ${dragover ? 'dragover' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-icon">♪</div>
          <p>Drop an audio file here, or click to browse</p>
          <p className="text-sm">MP3, WAV, FLAC, OGG, AAC — up to 50MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.flac,.ogg,.aac,.m4a,.mp4,.wma,.aiff,.opus"
            style={{ display: 'none' }}
            onChange={e => handleFileSelect(e.target.files?.[0] || null)}
          />
        </div>
      )}

      {/* File selected — metadata form */}
      {mode === 'file' && file && (
        <div className="panel">
          <div className="upload-file-name">
            <span>♪ {file.name}</span>
            <button className="btn-ghost btn-sm" onClick={handleClearFile}>×</button>
          </div>

          <div className="upload-fields">
            <div className="form-row">
              <div className="form-group">
                <label>Artist</label>
                <input
                  type="text"
                  value={artist}
                  onChange={e => setArtist(e.target.value)}
                  placeholder="e.g. Sonny Rollins"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Village Vanguard, 1957"
                />
              </div>
            </div>

            <KeyPicker
              tonic={keyTonic}
              quality={keyQuality}
              onTonicChange={setKeyTonic}
              onQualityChange={setKeyQuality}
              label="Key (if different)"
            />

            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload Recording'}
              </button>
              <button className="btn-ghost" onClick={handleClearFile}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* URL import mode — enter URL */}
      {mode === 'url' && !preview && (
        <div className="panel">
          <div className="form-group">
            <label>Paste a URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
            <button
              className="btn-primary"
              onClick={handleFetchPreview}
              disabled={importing || !url.trim()}
            >
              {importing ? 'Loading...' : 'Fetch'}
            </button>
            <button className="btn-ghost" onClick={cancelImport}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* URL import mode — preview and confirm */}
      {mode === 'url' && preview && (
        <div className="panel">
          <div className="upload-fields">
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={importTitle}
                onChange={e => setImportTitle(e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Artist</label>
                <input
                  type="text"
                  value={importArtist}
                  onChange={e => setImportArtist(e.target.value)}
                  placeholder="e.g. Sonny Rollins"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={importDescription}
                  onChange={e => setImportDescription(e.target.value)}
                  placeholder="e.g. Village Vanguard, 1957"
                />
              </div>
            </div>

            <KeyPicker
              tonic={importKeyTonic}
              quality={importKeyQuality}
              onTonicChange={setImportKeyTonic}
              onQualityChange={setImportKeyQuality}
              label="Key (if different)"
            />

            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                className="btn-primary"
                onClick={handleConfirmImport}
                disabled={importing}
              >
                {importing ? 'Importing...' : 'Import Recording'}
              </button>
              <button className="btn-ghost" onClick={cancelImport} disabled={importing}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RecordingUpload