import { useState, useEffect } from 'react'
import api from '../api'
import { localToday } from '../dateUtils'
import './PracticeLog.css'

function TodayView({ onSelectTune }: { 
  onSelectTune: (tuneId: number) => void 
}) {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    api.get(`/today?client_date=${localToday()}`)
      .then(res => setData(res.data))
      .catch(() => {})
  }, [])

  if (!data || (data.tunes.length === 0 && (!data.fundamentals || data.fundamentals.length === 0))) return null

  return (
    <div className="today-view">
      <span className="today-label">Today</span>
      <div className="today-chips">
        {data.tunes.map((tune: any) => (
          <button
            key={tune.tune_id}
            className="today-chip"
            onClick={() => onSelectTune && onSelectTune(tune.tune_id)}
          >
            <span className="today-chip-title">{tune.title}</span>
            {tune.play_seconds >= 60 && (
              <span className="today-chip-duration">
                {tune.play_seconds >= 3600
                  ? `${Math.round(tune.play_seconds / 360) / 10}h`
                  : `${Math.round(tune.play_seconds / 60)}m`
                }
              </span>
            )}
          </button>
        ))}
        {data.fundamentals && data.fundamentals.map((f: { category: string; duration_seconds: number | null }) => (
          <span key={f.category} className="today-chip fundamental">
            {f.category.charAt(0).toUpperCase() + f.category.slice(1)}
            {f.duration_seconds && f.duration_seconds >= 60 && (
              <span className="today-chip-duration">
                {f.duration_seconds >= 3600
                  ? ` ${Math.round(f.duration_seconds / 360) / 10}h`
                  : ` ${Math.round(f.duration_seconds / 60)}m`
                }
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

export default TodayView