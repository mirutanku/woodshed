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
            <span className="today-chip-indicators">
              {tune.played && <span className="today-ind played">▶</span>}
              {tune.logged && <span className="today-ind logged">✎</span>}
            </span>
            <span className="today-chip-title">{tune.title}</span>
          </button>
        ))}
        {data.fundamentals && data.fundamentals.map(f => (
          <span key={f} className="today-chip fundamental">
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default TodayView