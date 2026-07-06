import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { cameraApi, aiApi } from '../services/api'
import { subscribe, isConnected } from '../services/streamManager'
import { base64JpegToObjectUrl, revokeImageObjectUrl, replaceImageObjectUrl, base64JpegToDataUrl } from '../services/frameUtils'

// Module-level cache: persists across SPA navigations (not across F5)
const frameCache = { data: null, cameraId: null }

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
  const [wsConnected, setWsConnected] = useState(false)

  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const placeholderRef = useRef(null)
  const unsubscribeRef = useRef(null)
  const updateDebounceRef = useRef(null)
  const latestAlgorithmsRef = useRef([])
  const mountedRef = useRef(true)
  const streamStateRef = useRef({ detections: [], lastDetectionUpdate: 0 })
  const frameCacheUsedRef = useRef(false)

  const hidePlaceholder = useCallback(() => {
    const el = placeholderRef.current
    if (el) { el.style.display = 'none'; el.style.visibility = 'hidden' }
  }, [])

  const renderFrame = useCallback((base64Data, isCache) => {
    if (!mountedRef.current) return
    const img = imgRef.current
    if (!img) {
      frameCache.data = base64Data
      frameCache.cameraId = id
      return
    }
    hidePlaceholder()
    replaceImageObjectUrl(img, base64JpegToObjectUrl(base64Data), 250)
    if (!isCache) {
      frameCache.data = base64Data
      frameCache.cameraId = id
    }
  }, [id, hidePlaceholder])

  // Stable ref so streamManager's onFrame callback never captures a stale closure
  const renderFrameRef = useRef(renderFrame)
  useEffect(() => { renderFrameRef.current = renderFrame }, [renderFrame])

  const imgRefCallback = useCallback((el) => {
    imgRef.current = el
    if (!el) return
    if (!frameCacheUsedRef.current && frameCache.cameraId === id && frameCache.data) {
      frameCacheUsedRef.current = true
      replaceImageObjectUrl(el, base64JpegToObjectUrl(frameCache.data))
      requestAnimationFrame(() => hidePlaceholder())
    }
  }, [id, hidePlaceholder])

  // ── WebSocket via shared streamManager ──
  const connectWebSocket = useCallback(() => {
    if (unsubscribeRef.current) return

    const unsub = subscribe(id, {
      onOpen: () => { if (mountedRef.current) setWsConnected(true) },
      onFrame: (base64Data, msgData) => {
        if (!mountedRef.current) return
        // Always call the latest renderFrame via ref — never a stale closure
        renderFrameRef.current(base64Data)
        if (msgData.detections?.length > 0 && Date.now() - streamStateRef.current.lastDetectionUpdate > 250) {
          streamStateRef.current.lastDetectionUpdate = Date.now()
          setStreamingDetections(msgData.detections)
        }
      },
      onClose: () => { if (mountedRef.current) setWsConnected(false) },
    })

    unsubscribeRef.current = unsub
    setWsConnected(isConnected(id))
  }, [id])  // no longer depends on renderFrame

  const disconnectWebSocket = useCallback(() => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    setStreamingDetections([])
    setWsConnected(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    frameCacheUsedRef.current = false
    loadCamera()
    loadAlgorithms()
    connectWebSocket()
    return () => {
      mountedRef.current = false
      disconnectWebSocket()
      // Do not clear a pending debounced save here: it is safe to finish in
      // the background and prevents losing a last-second settings edit on navigation.
      revokeImageObjectUrl(imgRef.current)
    }
  }, [id])

  useEffect(() => {
    if (camera?.algorithms) latestAlgorithmsRef.current = camera.algorithms
  }, [camera])

  useEffect(() => {
    if (selectedAlgoConfig) loadClasses(selectedAlgoConfig.algorithm_type)
  }, [selectedAlgoConfig])

  const loadCamera = async () => {
    try {
      const data = await cameraApi.get(id)
      if (!mountedRef.current) return
      latestAlgorithmsRef.current = data.algorithms || []
      setCamera(data)
      if (data.algorithms?.length) setSelectedAlgoConfig(data.algorithms[0])
    } catch (err) {
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const loadAlgorithms = async () => {
    try { const data = await aiApi.listAlgorithms(); if (mountedRef.current) setAlgorithms(data) } catch (e) {}
  }

  const loadClasses = async (t) => {
    try { const d = await aiApi.getClasses(t); if (mountedRef.current) setClasses(d.classes) } catch (e) {}
  }

  const updateAlgoConfig = useCallback((newConfig, { persistImmediately = false } = {}) => {
    const updatedAlgorithms = latestAlgorithmsRef.current.map(a => a.id === newConfig.id ? newConfig : a)
    latestAlgorithmsRef.current = updatedAlgorithms
    setSelectedAlgoConfig(newConfig)
    setCamera(prev => prev ? { ...prev, algorithms: updatedAlgorithms } : prev)

    if (updateDebounceRef.current) clearTimeout(updateDebounceRef.current)

    const persist = async () => {
      updateDebounceRef.current = null
      try {
        await cameraApi.update(id, { algorithms: updatedAlgorithms })
      } catch (err) { console.error('Failed to update camera:', err) }
    }

    if (persistImmediately) persist()
    else updateDebounceRef.current = setTimeout(persist, 400)
  }, [id])

  const captureAndProcess = async () => {
    if (!selectedAlgoConfig) return
    const img = imgRef.current
    if (!img?.src) return
    setProcessing(true)
    try {
      const response = await fetch(img.src)
      const blob = await response.blob()
      setResults(await aiApi.processImage(blob, id, selectedAlgoConfig.algorithm_type, selectedAlgoConfig.confidence, selectedAlgoConfig.roi, selectedAlgoConfig.classes))
    } catch (err) { console.error('AI processing error:', err) }
    finally { setProcessing(false) }
  }

  if (loading) return <div className="empty-state">Loading...</div>
  if (error) return <div className="empty-state">Error: {error}</div>
  if (!camera) return <div className="empty-state">Camera not found</div>

  return (
    <div className={`camera-view-container ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="camera-view-header">
        <h2 className="page-title">{camera.name}</h2>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setIsFullscreen(!isFullscreen)}>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to Dashboard</button>
        </div>
      </div>

      <div className="camera-view-body">
        <div className="video-panel">
          <div ref={containerRef} className={`video-container ${isFullscreen ? 'fullscreen-video' : ''}`}
            onClick={(e) => {
              if (!roiMode || !containerRef.current) return
              const r = containerRef.current.getBoundingClientRect()
              const sx = imageSize.width / r.width, sy = imageSize.height / r.height
              const cp = { x: Math.round((e.clientX - r.left) * sx), y: Math.round((e.clientY - r.top) * sy) }
              if (!roiStart) { setRoiStart(cp); setRoiEnd(null) }
              else {
                const x1 = Math.min(roiStart.x, cp.x), y1 = Math.min(roiStart.y, cp.y), x2 = Math.max(roiStart.x, cp.x), y2 = Math.max(roiStart.y, cp.y)
                if (x2 - x1 > 10 && y2 - y1 > 10 && selectedAlgoConfig) updateAlgoConfig({ ...selectedAlgoConfig, roi: { x1, y1, x2, y2 } }, { persistImmediately: true })
                setRoiStart(null); setRoiEnd(null); setRoiMode(false)
              }
            }}
            onDoubleClick={(e) => { if (roiMode && roiStart) { e.preventDefault(); e.stopPropagation(); setRoiStart(null); setRoiEnd(null) } }}
            onMouseMove={(e) => {
              if (!roiMode || !roiStart || !containerRef.current) return
              const r = containerRef.current.getBoundingClientRect()
              setRoiEnd({ x: Math.round((e.clientX - r.left) * imageSize.width / r.width), y: Math.round((e.clientY - r.top) * imageSize.height / r.height) })
            }}
          >
            <img ref={imgRefCallback} alt="" className="video-stream"
              onLoad={(e) => { if (e.target.naturalWidth) setImageSize({ width: e.target.naturalWidth, height: e.target.naturalHeight }) }}
              style={{ cursor: roiMode ? 'crosshair' : 'default', width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
            <div ref={placeholderRef} id={`placeholder-${id}`}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', zIndex: 2, color: '#94a3b8', fontSize: '0.875rem' }}>
              Connecting to stream...
            </div>

            {roiMode && !roiStart && (<div className="roi-overlay"><div className="roi-hint"><span className="roi-step">Step 1:</span> Click to set start point</div></div>)}
            {roiMode && roiStart && !roiEnd && (<div className="roi-overlay"><div className="roi-hint roi-active"><span className="roi-step">Step 2:</span> Click to set end point (Double-click to cancel)</div></div>)}
            {roiStart && roiEnd && (<div className="roi-preview" style={{ left: `${Math.min(roiStart.x, roiEnd.x) * 100 / imageSize.width}%`, top: `${Math.min(roiStart.y, roiEnd.y) * 100 / imageSize.height}%`, width: `${Math.abs(roiEnd.x - roiStart.x) * 100 / imageSize.width}%`, height: `${Math.abs(roiEnd.y - roiStart.y) * 100 / imageSize.height}%` }} />)}
            {roiStart && !roiEnd && (<div className="roi-point roi-start-point" style={{ left: `${roiStart.x * 100 / imageSize.width}%`, top: `${roiStart.y * 100 / imageSize.height}%` }} />)}
            {selectedAlgoConfig?.roi && !roiMode && (<div className="roi-box" style={{ left: `${selectedAlgoConfig.roi.x1 * 100 / imageSize.width}%`, top: `${selectedAlgoConfig.roi.y1 * 100 / imageSize.height}%`, width: `${(selectedAlgoConfig.roi.x2 - selectedAlgoConfig.roi.x1) * 100 / imageSize.width}%`, height: `${(selectedAlgoConfig.roi.y2 - selectedAlgoConfig.roi.y1) * 100 / imageSize.height}%` }} />)}
          </div>
        </div>

        <div className="control-panel">
          <div className="algorithm-panel">
            <div className="panel-header">
              <h3>AI Processing</h3>
              <div className="algo-actions">
                <button className="btn btn-small" onClick={async () => {
                  if (!camera) return
                  const na = { id: `algo_${Date.now()}`, name: 'New Algorithm', algorithm_type: 'object_detection', enabled: false, confidence: 0.5, roi: null, classes: [] }
                  try { await cameraApi.update(id, { algorithms: [...camera.algorithms, na] }); setCamera(p => ({ ...p, algorithms: [...p.algorithms, na] })); setSelectedAlgoConfig(na) } catch (err) {}
                }}>+ Add</button>
                {camera.algorithms?.length > 1 && (
                  <button className="btn btn-small btn-danger" onClick={async () => {
                    if (!camera || !selectedAlgoConfig || camera.algorithms.length <= 1) return
                    const updatedAlgos = camera.algorithms.filter(a => a.id !== selectedAlgoConfig.id)
                    try { await cameraApi.update(id, { algorithms: updatedAlgos }); setCamera(p => ({ ...p, algorithms: updatedAlgos })); setSelectedAlgoConfig(updatedAlgos[0]) } catch (err) {}
                  }}>Delete</button>
                )}
              </div>
            </div>

            {camera.algorithms?.length > 0 && (
              <div className="algo-selector">
                <select value={selectedAlgoConfig?.id || ''} onChange={(e) => {
                  if (camera?.algorithms) {
                    const a = camera.algorithms.find(x => x.id === e.target.value)
                    if (a) { setSelectedAlgoConfig(a); if (a.roi) { setRoiStart({ x: a.roi.x1, y: a.roi.y1 }); setRoiEnd({ x: a.roi.x2, y: a.roi.y2 }) } else { setRoiStart(null); setRoiEnd(null) } }
                  }
                }} className="settings-select">
                  {camera.algorithms.map(a => (<option key={a.id} value={a.id}>{a.name} ({a.algorithm_type})</option>))}
                </select>
              </div>
            )}

            {selectedAlgoConfig && (
              <div className="ai-settings">
                <div className="settings-row"><input type="text" value={selectedAlgoConfig.name} onChange={(e) => updateAlgoConfig({ ...selectedAlgoConfig, name: e.target.value })} className="settings-input" placeholder="Algorithm name" /></div>
                <div className="settings-row"><label className="setting-label"><input type="checkbox" checked={selectedAlgoConfig.enabled} onChange={(e) => updateAlgoConfig({ ...selectedAlgoConfig, enabled: e.target.checked })} /> Enabled</label></div>
                <div className="settings-row"><label className="setting-label">Confidence: {selectedAlgoConfig.confidence.toFixed(2)}</label><input type="range" min="0" max="1" step="0.05" value={selectedAlgoConfig.confidence} onChange={(e) => updateAlgoConfig({ ...selectedAlgoConfig, confidence: parseFloat(e.target.value) })} className="settings-slider" /></div>
                <div className="settings-row roi-section">
                  <button className={`btn btn-small ${roiMode ? 'btn-primary active' : 'btn-secondary'}`} onClick={() => { setRoiMode(!roiMode); if (roiMode) { setRoiStart(null); setRoiEnd(null) } }}>{roiMode ? 'Cancel ROI' : 'Draw ROI'}</button>
                  {selectedAlgoConfig.roi && <button className="btn btn-small btn-danger" onClick={() => { updateAlgoConfig({ ...selectedAlgoConfig, roi: null }, { persistImmediately: true }); setRoiMode(false); setRoiStart(null); setRoiEnd(null) }}>Clear ROI</button>}
                </div>
                {selectedAlgoConfig.roi && (<div className="roi-info"><span className="roi-label">ROI: </span><span className="roi-coords">({selectedAlgoConfig.roi.x1}, {selectedAlgoConfig.roi.y1}) - ({selectedAlgoConfig.roi.x2}, {selectedAlgoConfig.roi.y2})</span></div>)}
                {selectedAlgoConfig.algorithm_type === 'object_detection' && classes.length > 0 && (
                  <div className="classes-filter">
                    <label className="setting-label">Detection Classes:</label>
                    <div className="classes-grid">
                      {classes.slice(0, 4).map(cls => (
                        <label key={cls} className={`class-checkbox ${(selectedAlgoConfig.classes || []).includes(cls) ? 'selected' : ''}`}>
                          <input type="checkbox" checked={(selectedAlgoConfig.classes || []).includes(cls)}
                            onChange={() => {
                              const cc = selectedAlgoConfig.classes || []
                              updateAlgoConfig({ ...selectedAlgoConfig, classes: cc.includes(cls) ? cc.filter(c => c !== cls) : [...cc, cls] })
                            }} /><span>{cls}</span>
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
                  <button className="btn btn-primary" onClick={captureAndProcess} disabled={processing || !selectedAlgoConfig.enabled}>{processing ? 'Processing...' : 'Capture & Analyze'}</button>
                </div>
              </div>
            )}
          </div>

          {results && (
            <div className="results-panel">
              <h3>Analysis Results</h3>
              <p className="processing-time">Processing time: {results.processing_time_ms.toFixed(2)}ms</p>
              {results.detections?.length > 0 && (
                <div className="detections-section">
                  <h4>Detected Objects ({results.detections.length})</h4>
                  <div className="detections-list">
                    {results.detections.map((d, i) => (
                      <div key={i} className="detection-item">
                        <div className="detection-info"><span className="detection-label">{d.label}</span><span className="detection-confidence">{(d.confidence * 100).toFixed(1)}%</span></div>
                        <div className="detection-bbox">[{d.bbox[0].toFixed(0)}, {d.bbox[1].toFixed(0)}, {d.bbox[2].toFixed(0)}, {d.bbox[3].toFixed(0)}]</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {results.annotated_frame && (<div className="annotated-image"><h4>Annotated Image</h4><img src={base64JpegToDataUrl(results.annotated_frame)} alt="Annotated" className="annotated-img" loading="lazy" /></div>)}
            </div>
          )}

          <div className="detection-messages-panel">
            <div className="panel-header">
              <h3>Detection Messages</h3>
              <div className="stream-status"><span className={`status-indicator ${wsConnected ? 'active' : 'inactive'}`}></span>{wsConnected ? 'Live' : 'Disconnected'}</div>
            </div>
            {streamingDetections.length > 0 ? (
              <div className="current-detections">
                <h4>Current Detection</h4>
                <div className="detections-list">
                  {streamingDetections.map((d, i) => (
                    <div key={`c-${i}`} className="detection-item current"><div className="detection-info"><span className="detection-label">{d.label}</span><span className="detection-confidence">{(d.confidence * 100).toFixed(1)}%</span></div></div>
                  ))}
                </div>
              </div>
            ) : (<div className="empty-messages">{wsConnected ? 'Waiting for detections...' : 'Detection stream is stopped'}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CameraView