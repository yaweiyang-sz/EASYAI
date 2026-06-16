import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CabinCrewDashboard from './pages/CabinCrewDashboard'
import CameraView from './pages/CameraView'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<CabinCrewDashboard />} />
          <Route path="/camera/:id" element={<CameraView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App