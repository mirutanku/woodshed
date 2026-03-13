import { useState, useEffect } from 'react'
import './App.css'
import { setOnUnauthorized } from './api'
import { ToastProvider } from './components/Toast'
import LoginForm from './components/LoginForm'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import Settings from './components/Settings'
import Nav from './components/Nav'
import TuneList from './components/TuneList'
import TuneDetail from './components/TuneDetail'
import PracticeLog from './components/PracticeLog'
import SetlistManager from './components/SetlistManager'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'))
  const [currentView, setCurrentView] = useState('tunes')
  const [selectedTuneId, setSelectedTuneId] = useState(null)
  const [authView, setAuthView] = useState('login') // 'login', 'forgot-password', 'reset-password'
  const [resetToken, setResetToken] = useState(null)

  function handleLogin() {
    setIsLoggedIn(true)
  }

  function handleLogout() {
    localStorage.removeItem('token')
    setIsLoggedIn(false)
    setCurrentView('tunes')
    setSelectedTuneId(null)
  }

  // Register the 401 handler so expired tokens redirect to login
  useEffect(() => {
    setOnUnauthorized(handleLogout)
  }, [])

  // Check URL for password reset token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const path = window.location.pathname
    if (path === '/reset-password' && token) {
      // Log out any existing session so the reset form shows
      localStorage.removeItem('token')
      setIsLoggedIn(false)
      setResetToken(token)
      setAuthView('reset-password')
      // Clean up the URL
      window.history.replaceState({}, '', '/')
    }
  }, [])

  function handleSelectTune(tuneId) {
    setSelectedTuneId(tuneId)
    setCurrentView('tune-detail')
  }

  function handleBackToTunes() {
    setSelectedTuneId(null)
    setCurrentView('tunes')
  }

  if (!isLoggedIn) {
    return (
      <ToastProvider>
        {authView === 'forgot-password' && (
          <ForgotPassword onBack={() => setAuthView('login')} />
        )}
        {authView === 'reset-password' && resetToken && (
          <ResetPassword
            token={resetToken}
            onBackToLogin={() => {
              setResetToken(null)
              setAuthView('login')
            }}
          />
        )}
        {authView === 'login' && (
          <LoginForm
            onLogin={handleLogin}
            onForgotPassword={() => setAuthView('forgot-password')}
          />
        )}
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
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
          {currentView === 'settings' && (
            <Settings />
          )}
          {currentView === 'setlists' && (
            <SetlistManager onSelectTune={handleSelectTune} />
          )}
        </main>
      </div>
    </ToastProvider>
  )
}

export default App