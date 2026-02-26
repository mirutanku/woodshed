function Nav({ currentView, onNavigate, onLogout }) {
  return (
    <nav className="nav">
      <div className="nav-brand">Woodshed</div>
      <div className="nav-links">
        <button
          className={`nav-link ${currentView === 'tunes' || currentView === 'tune-detail' ? 'active' : ''}`}
          onClick={() => onNavigate('tunes')}
        >
          Tunes
        </button>
        <button
          className={`nav-link ${currentView === 'practice' ? 'active' : ''}`}
          onClick={() => onNavigate('practice')}
        >
          Practice
        </button>
        <div className="nav-divider" />
        <button className="nav-link" onClick={onLogout}>
          Log Out
        </button>
      </div>
    </nav>
  )
}

export default Nav