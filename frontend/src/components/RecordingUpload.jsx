import { useState, useRef } from 'react'
import api from '../api'
import KeyPicker from './KeyPicker'
import { buildKey } from '../keyConstants'

function RecordingUpload({ tuneId, onUploaded }) {
  const [file, setFile] = useState(null)
  const [artist, setArtist] = useState('')
  const [description, setDescription] = useState('')
  const [keyTonic, setKeyTonic] = useState('')
  const [keyQuality, setKeyQuality] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragover, setDragover] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  function handleFileSelect(selectedFile) {
    setError('')
    if (!selectedFile) return

    // Basic type check on the client side
    if (!selectedFile.type.startsWith('audio/')) {
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

  function handleDrop(e) {
    e.preventDefault()
    setDragover(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }

  function handleDragOver(e) {
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

  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      {error && <div className="login-error mb-md">{error}</div>}

      {!file ? (
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
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={e => handleFileSelect(e.target.files[0])}
          />
        </div>
      ) : (
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
    </div>
  )
}

export default RecordingUpload
