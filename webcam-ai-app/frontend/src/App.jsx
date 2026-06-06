import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CabinCrewDashboard from './pages/CabinCrewDashboard'
import CameraView from './pages/CameraView'
import CameraManagement from './pages/CameraManagement'
import AIProcessing from './pages/AIProcessing'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <h1>Camera AI Dashboard</h1>
          <div className="nav-links">
            <a href="/">Cabin Dashboard</a>
            <a href="/cameras">Cameras</a>
            <a href="/ai">AI Processing</a>
          </div>
        </nav>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<CabinCrewDashboard />} />
            <Route path="/camera/:id" element={<CameraView />} />
            <Route path="/cameras" element={<CameraManagement />} />
            <Route path="/ai" element={<AIProcessing />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
