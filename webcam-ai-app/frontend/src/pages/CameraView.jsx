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
  const [streamingDetections, setStreamingDetections] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)

  // Refs for direct DOM manipulation (bypass React for frame rendering)
  const containerRef = useRef(null)
  const canvasRef = useRef(null)  // hidden canvas for decoding base64
  const imgRef = useRef(null)     // <img> element for display
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const mountedRef = useRef(true)
  const streamStateRef = useRef({
    detections: [],
    lastDetectionUpdate: 0,
  })

  // ── Direct DOM frame rendering (bypass React state) ──
  const renderFrame = useCallback((base64Data) => {
    if (!mountedRef.current) return
    const img = imgRef.current
    if (!img) return

    // Use Object URL for memory-efficient rendering
    if (img._objectUrl) {
      URL.revokeObjectURL(img._objectUrl)
    }

    // Decode base64 to binary, then create blob URL
    const binaryStr = atob(base64Data)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: 'image/jpeg' })
    img._objectUrl = URL.createObjectURL(blob)
    img.src = img._objectUrl
  }, [])

  // ── WebSocket ──
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    if (!mountedRef.current) return

    const wsUrl = cameraApi.getWebSocketUrl(id)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      setWsConnected(true)
      setError(null)
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'frame' && data.frame) {
          // Direct DOM update — NO React state for frame
          renderFrame(data.frame)

          // Throttle detection updates to 4 Hz max to avoid React re-render storm
          if (data.detections && data.detections.length > 0) {
            const now = Date.now()
            if (now - streamStateRef.current.lastDetectionUpdate > 250) {
              streamStateRef.current.lastDetectionUpdate = now
              setStreamingDetections(data.detections)
            }
          }
        } else if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
        }
      } catch (err) {
        console.error('[CameraView] Frame parse error:', err)
      }
    }

    ws.onclose = (event) => {
      wsRef.current = null
      setWsConnected(false)
      if (!mountedRef.current) return
      reconnectTimerRef.current = setTimeout(() => connectWebSocket(), 2000)
    }

    ws.onerror = () => {}
  }, [id, renderFrame])

  const disconnectWebSocket = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
    setStreamingDetections([])
    setWsConnected(false)
  }, [])

  // ── Lifecycle ──
  useEffect(() => {
    mountedRef.current = true
    loadCamera()
    loadAlgorithms()
    connectWebSocket()

    return () => {
      mountedRef.current = false
      disconnectWebSocket()
      // Clean up any remaining object URL
      const img = imgRef.current
      if (img && img._objectUrl) {
        URL.revokeObjectURL(img._objectUrl)
      }
    }
  }, [id])

  useEffect(() => {
    if (selectedAlgoConfig) {
      loadClasses(selectedAlgoConfig.algorithm_type)
    }
  }, [selectedAlgoConfig])

  // ── Data loading ──
  const loadCamera = async () => {
    try {
      const data = await cameraApi.get(id)
      if (!mountedRef.current) return
      setCamera(data)
      if (data.algorithms && data.algorithms.length > 0) {
        setSelectedAlgoConfig(data.algorithms[0])
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const loadAlgorithms = async () => {
    try {
      const data = await aiApi.listAlgorithms()
      if (mountedRef.current) setAlgorithms(data)
    } catch (err) { /* ignore */ }
  }

  const loadClasses = async (algorithmType) => {
    try {
      const data = await aiApi.getClasses(algorithmType)
      if (mountedRef.current) setClasses(data.classes)
    } catch (err) { /* ignore */ }
  }

  // ── Algorithm config ──
  const handleAlgoChange = (algoId) => {
    if (camera?.algorithms) {
      const algo = camera.algorithms.find(a => a.id === algoId)
      if (algo) {
        setSelectedAlgoConfig(algo)
        if (algo.roi) {
          setRoiStart({ x: algo.roi.x1, y: algo.roi.y1 })
          setRoiEnd({ x: algo.roi.x2, y: algo.roi.y2 })
        } else {
          setRoiStart(null)
          setRoiEnd(null)
        }
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

  // ── ROI drawing ──
  const handleClick = (e) => {
    if (!roiMode || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const scaleX = imageSize.width / rect.width
    const scaleY = imageSize.height / rect.height
    const clickPos = { x: Math.round((e.clientX - rect.left) * scaleX), y: Math.round((e.clientY - rect.top) * scaleY) }

    if (!roiStart) {
      setRoiStart(clickPos)
      setRoiEnd(null)
    } else {
      const x1 = Math.min(roiStart.x, clickPos.x)
      const y1 = Math.min(roiStart.y, clickPos.y)
      const x2 = Math.max(roiStart.x, clickPos.x)
      const y2 = Math.max(roiStart.y, clickPos.y)
      if (x2 - x1 > 10 && y2 - y1 > 10 && selectedAlgoConfig) {
        updateAlgoConfig({ ...selectedAlgoConfig, roi: { x1, y1, x2, y2 } })
      }
      setRoiStart(null)
      setRoiEnd(null)
      setRoiMode(false)
    }
  }

  const handleDoubleClick = (e) => {
    if (roiMode && roiStart) {
      e.preventDefault()
      e.stopPropagation()
      setRoiStart(null)
      setRoiEnd(null)
    }
  }

  const handleMouseMove = (e) => {
    if (!roiMode || !roiStart || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const scaleX = imageSize.width / rect.width
    const scaleY = imageSize.height / rect.height
    setRoiEnd({ x: Math.round((e.clientX - rect.left) * scaleX), y: Math.round((e.clientY - rect.top) * scaleY) })
  }

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

  const captureAndProcess = async () => {
    if (!selectedAlgoConfig) return
    const img = imgRef.current
    if (!img || !img.src) return

    setProcessing(true)
    try {
      const response = await fetch(img.src)
      const blob = await response.blob()
      const result = await aiApi.processImage(
        blob, id,
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
  }

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen)

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
            {/* Direct DOM img — NOT controlled by React state */}
            <img
              ref={imgRef}
              alt="Live Stream"
              className="video-stream"
              onLoad={handleImageLoad}
              style={{ cursor: roiMode ? 'crosshair' : 'default', display: wsConnected ? 'block' : 'none' }}
            />
            {!wsConnected && (
              <div className="video-stream-placeholder">
                Connecting to stream...
              </div>
            )}

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
              <div className="roi-preview" style={{
                left: `${Math.min(roiStart.x, roiEnd.x) * 100 / imageSize.width}%`,
                top: `${Math.min(roiStart.y, roiEnd.y) * 100 / imageSize.height}%`,
                width: `${Math.abs(roiEnd.x - roiStart.x) * 100 / imageSize.width}%`,
                height: `${Math.abs(roiEnd.y - roiStart.y) * 100 / imageSize.height}%`
              }} />
            )}
            {roiStart && !roiEnd && (
              <div className="roi-point roi-start-point" style={{
                left: `${roiStart.x * 100 / imageSize.width}%`,
                top: `${roiStart.y * 100 / imageSize.height}%`
              }} />
            )}
            {selectedAlgoConfig?.roi && !roiMode && (
              <div className="roi-box" style={{
                left: `${selectedAlgoConfig.roi.x1 * 100 / imageSize.width}%`,
                top: `${selectedAlgoConfig.roi.y1 * 100 / imageSize.height}%`,
                width: `${(selectedAlgoConfig.roi.x2 - selectedAlgoConfig.roi.x1) * 100 / imageSize.width}%`,
                height: `${(selectedAlgoConfig.roi.y2 - selectedAlgoConfig.roi.y1) * 100 / imageSize.height}%`
              }} />
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
                <select value={selectedAlgoConfig?.id || ''} onChange={(e) => handleAlgoChange(e.target.value)} className="settings-select">
                  {camera.algorithms.map(algo => (
                    <option key={algo.id} value={algo.id}>{algo.name} ({algo.algorithm_type})</option>
                  ))}
                </select>
              </div>
            )}

            {selectedAlgoConfig && (
              <div className="ai-settings">
                <div className="settings-row">
                  <input type="text" value={selectedAlgoConfig.name}
                    onChange={(e) => updateAlgoConfig({ ...selectedAlgoConfig, name: e.target.value })}
                    className="settings-input" placeholder="Algorithm name" />
                </div>
                <div className="settings-row">
                  <label className="setting-label">
                    <input type="checkbox" checked={selectedAlgoConfig.enabled}
                      onChange={(e) => updateAlgoConfig({ ...selectedAlgoConfig, enabled: e.target.checked })} />
                    Enabled
                  </label>
                </div>
                <div className="settings-row">
                  <label className="setting-label">Confidence: {selectedAlgoConfig.confidence.toFixed(2)}</label>
                  <input type="range" min="0" max="1" step="0.05" value={selectedAlgoConfig.confidence}
                    onChange={(e) => handleConfidenceChange(e.target.value)} className="settings-slider" />
                </div>
                <div className="settings-row roi-section">
                  <button className={`btn btn-small ${roiMode ? 'btn-primary active' : 'btn-secondary'}`}
                    onClick={() => { setRoiMode(!roiMode); if (roiMode) { setRoiStart(null); setRoiEnd(null) } }}>
                    {roiMode ? 'Cancel ROI' : 'Draw ROI'}
                  </button>
                  {selectedAlgoConfig.roi && (
                    <button className="btn btn-small btn-danger" onClick={clearRoi}>Clear ROI</button>
                  )}
                </div>
                {selectedAlgoConfig.roi && (
                  <div className="roi-info">
                    <span className="roi-label">ROI: </span>
                    <span className="roi-coords">({selectedAlgoConfig.roi.x1}, {selectedAlgoConfig.roi.y1}) - ({selectedAlgoConfig.roi.x2}, {selectedAlgoConfig.roi.y2})</span>
                  </div>
                )}
                {selectedAlgoConfig.algorithm_type === 'object_detection' && classes.length > 0 && (
                  <div className="classes-filter">
                    <label className="setting-label">Detection Classes:</label>
                    <div className="classes-grid">
                      {classes.slice(0, 4).map((cls) => (
                        <label key={cls} className={`class-checkbox ${(selectedAlgoConfig.classes || []).includes(cls) ? 'selected' : ''}`}>
                          <input type="checkbox" checked={(selectedAlgoConfig.classes || []).includes(cls)} onChange={() => handleClassToggle(cls)} />
                          <span>{cls}</span>
                        </label>
                      ))}
                    </div>
                    <div className="classes-actions">
                      <button className="btn btn-small" onClick={() => updateAlgoConfig({ ...selectedAlgoConfig, classes: [...classes.slice(0, 4)] })}>Select All</button>
                      <button className="btn btn-small" onClick={() => updateAlgoConfig({ ...selectedAlgoConfig, classes: [] })}>Clear All</button>
                    </div>
                  </div>
                )}
                <div className="action-row">
                  <button className="btn btn-primary" onClick={captureAndProcess} disabled={processing || !selectedAlgoConfig.enabled}>
                    {processing ? 'Processing...' : 'Capture & Analyze'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {results && (
            <div className="results-panel">
              <h3>Analysis Results</h3>
              <p className="processing-time">Processing time: {results.processing_time_ms.toFixed(2)}ms</p>
              {results.detections && results.detections.length > 0 && (
                <div className="detections-section">
                  <h4>Detected Objects ({results.detections.length})</h4>
                  <div className="detections-list">
                    {results.detections.map((det, idx) => (
                      <div key={idx} className="detection-item">
                        <div className="detection-info">
                          <span className="detection-label">{det.label}</span>
                          <span className="detection-confidence">{(det.confidence * 100).toFixed(1)}%</span>
                        </div>
                        <div className="detection-bbox">[{det.bbox[0].toFixed(0)}, {det.bbox[1].toFixed(0)}, {det.bbox[2].toFixed(0)}, {det.bbox[3].toFixed(0)}]</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {results.annotated_frame && (
                <div className="annotated-image">
                  <h4>Annotated Image</h4>
                  <img src={`data:image/jpeg;base64,${results.annotated_frame}`} alt="Annotated" className="annotated-img" />
                </div>
              )}
            </div>
          )}

          <div className="detection-messages-panel">
            <div className="panel-header">
              <h3>Detection Messages</h3>
              <div className="stream-status">
                <span className={`status-indicator ${wsConnected ? 'active' : 'inactive'}`}></span>
                {wsConnected ? 'Live' : 'Disconnected'}
              </div>
            </div>
            {streamingDetections.length > 0 ? (
              <div className="current-detections">
                <h4>Current Detection</h4>
                <div className="detections-list">
                  {streamingDetections.map((det, idx) => (
                    <div key={`current-${idx}`} className="detection-item current">
                      <div className="detection-info">
                        <span className="detection-label">{det.label}</span>
                        <span className="detection-confidence">{(det.confidence * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-messages">
                {wsConnected ? 'Waiting for detections...' : 'Detection stream is stopped'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CameraView