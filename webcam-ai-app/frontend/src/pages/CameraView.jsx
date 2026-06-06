import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { cameraApi, aiApi } from '../services/api'

function CameraView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [camera, setCamera] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [useAi, setUseAi] = useState(false)
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('object_detection')
  const [algorithms, setAlgorithms] = useState([])
  const [results, setResults] = useState(null)
  const [processing, setProcessing] = useState(false)
  const videoRef = useRef(null)

  useEffect(() => {
    loadCamera()
    loadAlgorithms()
  }, [id])

  const loadCamera = async () => {
    try {
      const data = await cameraApi.get(id)
      setCamera(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadAlgorithms = async () => {
    try {
      const data = await aiApi.listAlgorithms()
      setAlgorithms(data)
    } catch (err) {
      console.error('Failed to load algorithms:', err)
    }
  }

  const captureAndProcess = async () => {
    if (!videoRef.current) return

    setProcessing(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(videoRef.current, 0, 0)

      canvas.toBlob(async (blob) => {
        try {
          const result = await aiApi.processImage(
            blob,
            id,
            selectedAlgorithm,
            0.5
          )
          setResults(result)
        } catch (err) {
          console.error('AI processing error:', err)
        } finally {
          setProcessing(false)
        }
      }, 'image/jpeg')
    } catch (err) {
      console.error('Capture error:', err)
      setProcessing(false)
    }
  }

  if (loading) return <div className="empty-state">Loading...</div>
  if (error) return <div className="empty-state">Error: {error}</div>
  if (!camera) return <div className="empty-state">Camera not found</div>

  const streamUrl = cameraApi.getStreamUrl(id, false, null)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 className="page-title" style={{ marginBottom: 0 }}>{camera.name}</h2>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
      </div>

      <div className="video-container">
        <img
          ref={videoRef}
          src={streamUrl}
          alt="Live Stream"
          className="video-stream"
          style={{ width: '100%', maxHeight: '500px', objectFit: 'contain' }}
        />
      </div>

      <div className="algorithm-selector">
        <h3 style={{ marginBottom: '1rem' }}>AI Processing</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
            />
            Enable AI Processing
          </label>
          {processing && <span style={{ color: '#667eea' }}>Processing...</span>}
        </div>

        {useAi && (
          <>
            <div className="algorithm-options">
              {algorithms.map((algo) => (
                <div
                  key={algo.id}
                  className={`algorithm-option ${selectedAlgorithm === algo.id ? 'selected' : ''}`}
                  onClick={() => setSelectedAlgorithm(algo.id)}
                >
                  <h3>{algo.name}</h3>
                  <p>{algo.description}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button
                className="btn btn-primary"
                onClick={captureAndProcess}
                disabled={processing}
              >
                {processing ? 'Processing...' : 'Capture & Analyze'}
              </button>
            </div>
          </>
        )}
      </div>

      {results && (
        <div className="results-panel">
          <h3>Analysis Results</h3>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            Processing time: {results.processing_time_ms.toFixed(2)}ms
          </p>

          {results.detections && results.detections.length > 0 && (
            <div>
              <h4 style={{ marginBottom: '0.5rem' }}>Detected Objects</h4>
              {results.detections.map((det, idx) => (
                <div key={idx} className="result-item">
                  <span>{det.label}</span>
                  <span className="confidence-badge">
                    {(det.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {results.classifications && results.classifications.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>Classifications</h4>
              {results.classifications.map((cls, idx) => (
                <div key={idx} className="result-item">
                  <span>{cls.label}</span>
                  <span className="confidence-badge">
                    {(cls.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {((results.detections && results.detections.length === 0) ||
            (results.classifications && results.classifications.length === 0)) && (
            <p style={{ color: '#666' }}>No objects detected in this frame.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default CameraView
