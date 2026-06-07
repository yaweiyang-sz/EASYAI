import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { cameraApi } from '../services/api'

function Dashboard() {
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCamera, setSelectedCamera] = useState(null)

  useEffect(() => {
    loadCameras()
  }, [])

  const loadCameras = async () => {
    try {
      setLoading(true)
      const data = await cameraApi.list()
      setCameras(data)
      setError(null)
      if (data.length > 0 && !selectedCamera) {
        setSelectedCamera(data[0])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="empty-state">Loading...</div>
  if (error) return <div className="empty-state">Error: {error}</div>

  return (
    <div className="dashboard-container">
      <div className="preview-panel">
        <h3 className="preview-title">Live Camera Preview</h3>
        {selectedCamera ? (
          <div className="preview-content">
            <div className="preview-header">
              <span className={`status-indicator ${selectedCamera.enabled ? 'status-online' : 'status-offline'}`} />
              <span className="preview-camera-name">{selectedCamera.name}</span>
            </div>
            <div className="video-preview">
              <img
                src={cameraApi.getStreamUrl(selectedCamera.id)}
                alt={selectedCamera.name}
                className="live-stream"
              />
            </div>
            <div className="preview-info">
              <span className="camera-type">{selectedCamera.type}</span>
              <span className="camera-source">Source: {selectedCamera.source}</span>
            </div>
            <div className="preview-actions">
              <Link to={`/camera/${selectedCamera.id}`}>
                <button className="btn btn-primary">Full View</button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="empty-preview">
            <div className="empty-icon">📷</div>
            <p>Select a camera to view live feed</p>
            <Link to="/cameras">
              <button className="btn btn-primary" style={{ marginTop: '1rem' }}>
                Add Camera
              </button>
            </Link>
          </div>
        )}
      </div>

      <div className="camera-list-panel">
        <div className="panel-header">
          <h2 className="page-title">Camera Dashboard</h2>
          <Link to="/cameras">
            <button className="btn btn-primary">Add Camera</button>
          </Link>
        </div>

        {cameras.length === 0 ? (
          <div className="empty-state">
            <h3>No cameras configured</h3>
            <p>Go to the Cameras page to add your first camera.</p>
          </div>
        ) : (
          <div className="camera-grid">
            {cameras.map((camera) => (
              <div
                key={camera.id}
                className={`camera-card ${selectedCamera?.id === camera.id ? 'selected' : ''}`}
                onClick={() => setSelectedCamera(camera)}
              >
                <img
                  src={cameraApi.getSnapshotUrl(camera.id)}
                  alt={camera.name}
                  className="camera-preview"
                />
