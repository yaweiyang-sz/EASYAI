import { useState, useEffect } from 'react'
import { aiApi } from '../services/api'

function AIProcessing() {
  const [algorithms, setAlgorithms] = useState([])
  const [classes, setClasses] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedAlgorithm, setSelectedAlgorithm] = useState(null)

  useEffect(() => {
    loadAlgorithms()
  }, [])

  const loadAlgorithms = async () => {
    try {
      setLoading(true)
      const data = await aiApi.listAlgorithms()
      setAlgorithms(data)
      if (data.length > 0) {
        setSelectedAlgorithm(data[0].id)
      }
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadClasses = async (algorithmId) => {
    try {
      const data = await aiApi.getClasses(algorithmId)
      setClasses(prev => ({ ...prev, [algorithmId]: data.classes }))
    } catch (err) {
      console.error('Failed to load classes:', err)
    }
  }

  const handleAlgorithmSelect = (algo) => {
    setSelectedAlgorithm(algo.id)
    if (!classes[algo.id]) {
      loadClasses(algo.id)
    }
  }

  if (loading) return <div className="empty-state">Loading...</div>

  return (
    <div>
      <h2 className="page-title">AI Processing Configuration</h2>

      {error && (
        <div style={{ padding: '1rem', background: '#fee', color: '#c33', borderRadius: '8px', marginBottom: '1rem' }}>
          {error}
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Make sure the AI service is running on port 8001.
          </p>
        </div>
      )}

      <div className="algorithm-selector">
        <h3 style={{ marginBottom: '1rem' }}>Available Algorithms</h3>
        <div className="algorithm-options">
          {algorithms.map((algo) => (
            <div
              key={algo.id}
              className={`algorithm-option ${selectedAlgorithm === algo.id ? 'selected' : ''}`}
              onClick={() => handleAlgorithmSelect(algo)}
            >
              <h3>{algo.name}</h3>
              <p>{algo.description}</p>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#888' }}>
                Type: {algo.type}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedAlgorithm && classes[selectedAlgorithm] && (
        <div className="results-panel">
          <h3>Supported Classes</h3>
          <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.875rem' }}>
            Classes that can be detected/classifed by this algorithm:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {classes[selectedAlgorithm].map((cls, idx) => (
              <span
                key={idx}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: '#e8e8e8',
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  color: '#666'
                }}
              >
                {cls}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="results-panel" style={{ marginTop: '1.5rem' }}>
        <h3>How to Use</h3>
        <ol style={{ color: '#666', lineHeight: 1.8, paddingLeft: '1.5rem' }}>
          <li>Add cameras in the Camera Management page</li>
          <li>Go to the camera view by clicking on a camera in the Dashboard</li>
          <li>Enable AI Processing and select an algorithm</li>
          <li>Click "Capture & Analyze" to process the current frame</li>
          <li>View the detection or classification results below</li>
        </ol>

        <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>Services Required</h4>
        <ul style={{ color: '#666', lineHeight: 1.8, paddingLeft: '1.5rem' }}>
          <li><strong>Backend Service</strong> (port 8000) - Camera management and streaming</li>
          <li><strong>AI Service</strong> (port 8001) - YOLO-based object detection and classification</li>
        </ul>
      </div>
    </div>
  )
}

export default AIProcessing
