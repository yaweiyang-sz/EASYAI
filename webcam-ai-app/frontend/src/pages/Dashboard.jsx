import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { cameraApi } from '../services/api'

function Dashboard() {
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadCameras()
  }, [])

  const loadCameras = async () => {
    try {
      setLoading(true)
      const data = await cameraApi.list()
      setCameras(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="empty-state">Loading...</div>
  if (error) return <div className="empty-state">Error: {error}</div>

  return (
    <div>
      <h2 className="page-title">Camera Dashboard</h2>
      {cameras.length === 0 ? (
        <div className="empty-state">
          <h3>No cameras configured</h3>
          <p>Go to the Cameras page to add your first camera.</p>
          <Link to="/cameras">
            <button className="btn btn-primary" style={{ marginTop: '1rem' }}>
              Add Camera
            </button>
          </Link>
        </div>
      ) : (
        <div className="camera-grid">
          {cameras.map((camera) => (
            <div key={camera.id} className="camera-card">
              <Link to={`/camera/${camera.id}`}>
                <img
                  src={cameraApi.getSnapshotUrl(camera.id)}
                  alt={camera.name}
                  className="camera-preview"
                />
              </Link>
              <div className="camera-info">
                <div className="camera-name">
                  <span className={`status-indicator ${camera.enabled ? 'status-online' : 'status-offline'}`} />
                  {camera.name}
                </div>
                <span className="camera-type">{camera.type}</span>
                <div className="camera-actions">
                  <Link to={`/camera/${camera.id}`}>
                    <button className="btn btn-primary">View</button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Dashboard
