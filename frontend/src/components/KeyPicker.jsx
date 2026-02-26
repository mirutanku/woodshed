import { TONICS, QUALITIES } from '../keyConstants'

function KeyPicker({ tonic, quality, onTonicChange, onQualityChange, label = 'Canonical Key' }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <select
          value={tonic}
          onChange={e => onTonicChange(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="">Tonic...</option>
          {TONICS.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={quality}
          onChange={e => onQualityChange(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="">Quality...</option>
          {QUALITIES.map(q => (
            <option key={q} value={q}>{q}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default KeyPicker
