import { useState } from 'react'
import './App.css'
import LoginForm from './components/LoginForm'
import Nav from './components/Nav'
import TuneList from './components/TuneList'
import TuneDetail from './components/TuneDetail'
import PracticeLog from './components/PracticeLog'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'))
  const [currentView, setCurrentView] = useState('tunes')
  const [selectedTuneId, setSelectedTuneId] = useState(null)

  function handleLogin() {
    setIsLoggedIn(true)
  }

  function handleLogout() {
    localStorage.removeItem('token')
    setIsLoggedIn(false)
    setCurrentView('tunes')
    setSelectedTuneId(null)
  }

  function handleSelectTune(tuneId) {
    setSelectedTuneId(tuneId)
    setCurrentView('tune-detail')
  }

  function handleBackToTunes() {
    setSelectedTuneId(null)
    setCurrentView('tunes')
  }

  if (!isLoggedIn) {
    return <LoginForm onLogin={handleLogin} />
  }

  return (
    <div className="app">
      <Nav
        currentView={currentView}
        onNavigate={setCurrentView}
        onLogout={handleLogout}
      />
      <main className="main-content">
        {currentView === 'tunes' && (
          <TuneList onSelectTune={handleSelectTune} />
        )}
        {currentView === 'tune-detail' && selectedTuneId && (
          <TuneDetail
            tuneId={selectedTuneId}
            onBack={handleBackToTunes}
          />
        )}
        {currentView === 'practice' && (
          <PracticeLog />
        )}
      </main>
    </div>
  )
}

export default App