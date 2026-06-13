import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { cameraApi, aiApi } from '../services/api'

function CameraView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [camera, setCamera] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [algorithms, setAlgorithms] = useState([])
  const [classes, setClasses] = useState([])
  const [selectedAlgoConfig, setSelectedAlgoConfig] = useState(null)
  const [results, setResults] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [roiMode, setRoiMode] = useState(false)
  const [roiStart, setRoiStart] = useState(null)
  const [roiEnd, setRoiEnd] = useState(null)
  const [imageSize, setImageSize] = useState({ width: 640, height: 480 })
  const videoRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    loadCamera()
    loadAlgorithms()
  }, [id])

  useEffect(() => {
    if (selectedAlgoConfig) {
      loadClasses(selectedAlgoConfig.algorithm_type)
    }
  }, [selectedAlgoConfig])

  const loadCamera = async () => {
    try {
      const data = await cameraApi.get(id)
      setCamera(data)
      if (data.algorithms && data.algorithms.length > 0) {
        setSelectedAlgoConfig(data.algorithms[0])
      }
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

  const loadClasses = async (algorithmType) => {
    try {
      const data = await aiApi.getClasses(algorithmType)
      setClasses(data.classes)
    } catch (err) {
      console.error('Failed to load classes:', err)
    }
  }

  const handleAlgoChange = (algoId) => {
    if (camera && camera.algorithms) {
      const algo = camera.algorithms.find(a => a.id === algoId)
      if (algo) {
        setSelectedAlgoConfig(algo)
        setRoi(algo.roi)
      }
    }
  }

  const handleClassToggle = (cls) => {
    if (!selectedAlgoConfig) return
    const currentClasses = selectedAlgoConfig.classes || []
    const newClasses = currentClasses.includes(cls)
      ? currentClasses.filter(c => c !== cls)
      : [...currentClasses, cls]
    updateAlgoConfig({ ...selectedAlgoConfig, classes: newClasses })
  }

  const updateAlgoConfig = async (newConfig) => {
    setSelectedAlgoConfig(newConfig)
    if (camera) {
      const updatedAlgos = camera.algorithms.map(a => 
        a.id === newConfig.id ? newConfig : a
      )
      try {
        await cameraApi.update(id, { algorithms: updatedAlgos })
        setCamera(prev => ({ ...prev, algorithms: updatedAlgos }))
      } catch (err) {
        console.error('Failed to update camera:', err)
      }
    }
  }

  const handleConfidenceChange = (value) => {
    if (selectedAlgoConfig) {
      updateAlgoConfig({ ...selectedAlgoConfig, confidence: parseFloat(value) })
    }
  }

  const handleClick = (e) => {
    if (!roiMode || !videoRef.current) return
    
    const rect = videoRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const scaleX = imageSize.width / rect.width
    const scaleY = imageSize.height / rect.height
    
    const clickPos = { x: Math.round(x * scaleX), y: Math.round(y * scaleY) }
    
    if (!roiStart) {
      // First click: set start point
      setRoiStart(clickPos)
      setRoiEnd(null)
    } else {
      // Second click: set end point and save
      const x1 = Math.min(roiStart.x, clickPos.x)
      const y1 = Math.min(roiStart.y, clickPos.y)
      const x2 = Math.max(roiStart.x, clickPos.x)
      const y2 = Math.max(roiStart.y, clickPos.y)
      
      if (x2 - x1 > 10 && y2 - y1 > 10) {
        const newRoi = { x1, y1, x2, y2 }
        if (selectedAlgoConfig) {
          updateAlgoConfig({ ...selectedAlgoConfig, roi: newRoi })
        }
      }
      
      // Reset after saving
      setRoiStart(null)
      setRoiEnd(null)
      setRoiMode(false)
    }
  }

  const handleDoubleClick = (e) => {
    // Cancel current selection on double click
    if (roiMode && roiStart) {
      e.preventDefault()
      e.stopPropagation()
      setRoiStart(null)
      setRoiEnd(null)
    }
  }

  const handleMouseMove = (e) => {
    if (!roiMode || !roiStart || !videoRef.current) return
    
    const rect = videoRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const scaleX = imageSize.width / rect.width
    const scaleY = imageSize.height / rect.height
    
    // Update preview during mouse move
    setRoiEnd({ x: Math.round(x * scaleX), y: Math.round(y * scaleY) })
  }

  // Handle image load to get actual dimensions
  const handleImageLoad = useCallback((e) => {
    const img = e.target
    if (img.naturalWidth && img.naturalHeight) {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }, [])

  const clearRoi = () => {
    if (selectedAlgoConfig) {
      updateAlgoConfig({ ...selectedAlgoConfig, roi: null })
    }
    setRoiMode(false)
    setRoiStart(null)
    setRoiEnd(null)
  }

  const setRoi = (roi) => {
    // Update local state for display
    if (roi) {
      setRoiStart({ x: roi.x1, y: roi.y1 })
      setRoiEnd({ x: roi.x2, y: roi.y2 })
    } else {
      setRoiStart(null)
      setRoiEnd(null)
    }
  }

  const captureAndProcess = async () => {
    if (!videoRef.current || !selectedAlgoConfig) return

    setProcessing(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.naturalWidth || videoRef.current.width
      canvas.height = videoRef.current.naturalHeight || videoRef.current.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(videoRef.current, 0, 0)

      canvas.toBlob(async (blob) => {
        try {
          const result = await aiApi.processImage(
            blob,
            id,
            selectedAlgoConfig.algorithm_type,
            selectedAlgoConfig.confidence,
            selectedAlgoConfig.roi,
            selectedAlgoConfig.classes
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

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  const addAlgorithm = async () => {
    if (!camera) return
    
    const newAlgo = {
      id: `algo_${Date.now()}`,
      name: 'New Algorithm',
      algorithm_type: 'object_detection',
      enabled: false,
      confidence: 0.5,
      roi: null,
      classes: []
    }
    
    const updatedAlgos = [...camera.algorithms, newAlgo]
    try {
      await cameraApi.update(id, { algorithms: updatedAlgos })
      setCamera(prev => ({ ...prev, algorithms: updatedAlgos }))
      setSelectedAlgoConfig(newAlgo)
    } catch (err) {
      console.error('Failed to add algorithm:', err)
    }
  }

  const deleteAlgorithm = async () => {
    if (!camera || !selectedAlgoConfig || camera.algorithms.length <= 1) return
    
    const updatedAlgos = camera.algorithms.filter(a => a.id !== selectedAlgoConfig.id)
    try {
      await cameraApi.update(id, { algorithms: updatedAlgos })
      setCamera(prev => ({ ...prev, algorithms: updatedAlgos }))
      setSelectedAlgoConfig(updatedAlgos[0])
    } catch (err) {
      console.error('Failed to delete algorithm:', err)
    }
  }

  if (loading) return <div className="empty-state">Loading...</div>
  if (error) return <div className="empty-state">Error: {error}</div>
  if (!camera) return <div className="empty-state">Camera not found</div>

  const streamUrl = cameraApi.getStreamUrl(id, false, null)

  return (
    <div className={`camera-view-container ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="camera-view-header">
        <h2 className="page-title">{camera.name}</h2>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={toggleFullscreen}>
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>

      <div className="camera-view-body">
        <div className="video-panel">
          <div 
            ref={containerRef}
            className={`video-container ${isFullscreen ? 'fullscreen-video' : ''}`}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onMouseMove={handleMouseMove}
          >
            <img
              ref={videoRef}
              src={streamUrl}
              alt="Live Stream"
              className="video-stream"
              onLoad={handleImageLoad}
              style={{ cursor: roiMode ? 'crosshair' : 'default' }}
            />
            
            {roiMode && !roiStart && (
              <div className="roi-overlay">
                <div className="roi-hint">
                  <span className="roi-step">Step 1:</span> Click to set start point
                </div>
              </div>
            )}
            
            {roiMode && roiStart && !roiEnd && (
              <div className="roi-overlay">
                <div className="roi-hint roi-active">
                  <span className="roi-step">Step 2:</span> Click to set end point (Double-click to cancel)
                </div>
              </div>
            )}
            
            {roiStart && roiEnd && (
              <div 
                className="roi-preview"
                style={{
                  left: `${Math.min(roiStart.x, roiEnd.x) * 100 / imageSize.width}%`,
                  top: `${Math.min(roiStart.y, roiEnd.y) * 100 / imageSize.height}%`,
                  width: `${Math.abs(roiEnd.x - roiStart.x) * 100 / imageSize.width}%`,
                  height: `${Math.abs(roiEnd.y - roiStart.y) * 100 / imageSize.height}%`
                }}
              />
            )}
            
            {roiStart && !roiEnd && (
              <>
                <div 
                  className="roi-point roi-start-point"
                  style={{
                    left: `${roiStart.x * 100 / imageSize.width}%`,
                    top: `${roiStart.y * 100 / imageSize.height}%`
                  }}
                />
              </>
            )}
            
            {selectedAlgoConfig?.roi && !roiMode && (
              <div 
                className="roi-box"
                style={{
                  left: `${selectedAlgoConfig.roi.x1 * 100 / imageSize.width}%`,
                  top: `${selectedAlgoConfig.roi.y1 * 100 / imageSize.height}%`,
                  width: `${(selectedAlgoConfig.roi.x2 - selectedAlgoConfig.roi.x1) * 100 / imageSize.width}%`,
                  height: `${(selectedAlgoConfig.roi.y2 - selectedAlgoConfig.roi.y1) * 100 / imageSize.height}%`
                }}
              />
            )}
          </div>
        </div>

        <div className="control-panel">
          <div className="algorithm-panel">
            <div className="panel-header">
              <h3>AI Processing</h3>
              <div className="algo-actions">
                <button className="btn btn-small" onClick={addAlgorithm}>+ Add</button>
                {camera.algorithms && camera.algorithms.length > 1 && (
                  <button className="btn btn-small btn-danger" onClick={deleteAlgorithm}>Delete</button>
                )}
              </div>
            </div>

            {camera.algorithms && camera.algorithms.length > 0 && (
              <div className="algo-selector">
                <select 
                  value={selectedAlgoConfig?.id || ''}
                  onChange={(e) => handleAlgoChange(e.target.value)}
                  className="settings-select"
                >
                  {camera.algorithms.map(algo => (
                    <option key={algo.id} value={algo.id}>
                      {algo.name} ({algo.algorithm_type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedAlgoConfig && (
              <div className="ai-settings">
                <div className="settings-row">
                  <input
                    type="text"
                    value={selectedAlgoConfig.name}
                    onChange={(e) => updateAlgoConfig({ ...selectedAlgoConfig, name: e.target.value })}
                    className="settings-input"
                    placeholder="Algorithm name"
                  />
                </div>

                <div className="settings-row">
                  <label className="setting-label">
                    <input
                      type="checkbox"
                      checked={selectedAlgoConfig.enabled}
                      onChange={(e) => updateAlgoConfig({ ...selectedAlgoConfig, enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>

                <div className="settings-row">
                  <label className="setting-label">
                    Confidence: {selectedAlgoConfig.confidence.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={selectedAlgoConfig.confidence}
                    onChange={(e) => handleConfidenceChange(e.target.value)}
                    className="settings-slider"
                  />
                </div>

                <div className="settings-row roi-section">
                  <button 
                    className={`btn btn-small ${roiMode ? 'btn-primary active' : 'btn-secondary'}`}
                    onClick={() => {
                      setRoiMode(!roiMode)
                      if (!roiMode) {
                        setRoiStart(null)
                        setRoiEnd(null)
                      }
                    }}
                  >
                    {roiMode ? 'Cancel ROI' : 'Draw ROI'}
                  </button>
                  {selectedAlgoConfig.roi && (
                    <button className="btn btn-small btn-danger" onClick={clearRoi}>
                      Clear ROI
                    </button>
                  )}
                </div>
                
                {selectedAlgoConfig.roi && (
                  <div className="roi-info">
                    <span className="roi-label">ROI: </span>
                    <span className="roi-coords">
                      ({selectedAlgoConfig.roi.x1}, {selectedAlgoConfig.roi.y1}) - 
                      ({selectedAlgoConfig.roi.x2}, {selectedAlgoConfig.roi.y2})
                    </span>
                  </div>
                )}

                {selectedAlgoConfig.algorithm_type === 'object_detection' && classes.length > 0 && (
                  <div className="classes-filter">
                    <label className="setting-label">Detection Classes:</label>
                    <div className="classes-grid">
                      {classes.slice(0, 4).map((cls) => (
                        <label 
                          key={cls} 
                          className={`class-checkbox ${(selectedAlgoConfig.classes || []).includes(cls) ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={(selectedAlgoConfig.classes || []).includes(cls)}
                            onChange={() => handleClassToggle(cls)}
                          />
                          <span>{cls}</span>
                        </label>
                      ))}
                    </div>
                    <div className="classes-actions">
                      <button 
                        className="btn btn-small" 
                        onClick={() => updateAlgoConfig({ ...selectedAlgoConfig, classes: [...classes.slice(0, 4)] })}
                      >
                        Select All
                      </button>
                      <button 
                        className="btn btn-small" 
                        onClick={() => updateAlgoConfig({ ...selectedAlgoConfig, classes: [] })}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                )}

                <div className="action-row">
                  <button
                    className="btn btn-primary"
                    onClick={captureAndProcess}
                    disabled={processing || !selectedAlgoConfig.enabled}
                  >
                    {processing ? 'Processing...' : 'Capture & Analyze'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {results && (
            <div className="results-panel">
              <h3>Analysis Results</h3>
              <p className="processing-time">
                Processing time: {results.processing_time_ms.toFixed(2)}ms
              </p>

              {results.detections && results.detections.length > 0 && (
                <div className="detections-section">
                  <h4>Detected Objects ({results.detections.length})</h4>
                  <div className="detections-list">
                    {results.detections.map((det, idx) => (
                      <div key={idx} className="detection-item">
                        <div className="detection-info">
                          <span className="detection-label">{det.label}</span>
                          <span className="detection-confidence">
                            {(det.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="detection-bbox">
                          [{det.bbox[0].toFixed(0)}, {det.bbox[1].toFixed(0)}, 
                           {det.bbox[2].toFixed(0)}, {det.bbox[3].toFixed(0)}]
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.annotated_frame && (
                <div className="annotated-image">
                  <h4>Annotated Image</h4>
                  <img 
                    src={`data:image/jpeg;base64,${results.annotated_frame}`} 
                    alt="Annotated"
                    className="annotated-img"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CameraView