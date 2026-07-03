import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CabinCrewDashboard from './pages/CabinCrewDashboard'
import CameraView from './pages/CameraView'
import CameraManagement from './pages/CameraManagement'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<CabinCrewDashboard />} />
          <Route path="/camera/:id" element={<CameraView />} />
          <Route path="/cameras" element={<CameraManagement />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App