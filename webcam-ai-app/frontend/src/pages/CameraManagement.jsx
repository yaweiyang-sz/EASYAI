import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cameraApi } from '../services/api'

function CameraManagement() {
  const navigate = useNavigate()
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingCamera, setEditingCamera] = useState(null)  // 新增：正在编辑的相机
  const [formData, setFormData] = useState({
    name: '',
    source: '',
    type: 'rtsp',
    enabled: true
  })
  const [submitting, setSubmitting] = useState(false)
  const [devices, setDevices] = useState([])
  const [loadingDevices, setLoadingDevices] = useState(false)

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

  const loadDevices = async () => {
    try {
      setLoadingDevices(true)
      const result = await cameraApi.listDevices()
      setDevices(result.devices || [])
    } catch (err) {
      console.error('Failed to load devices:', err)
    } finally {
      setLoadingDevices(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editingCamera) {
        // 更新现有相机
        await cameraApi.update(editingCamera.id, formData)
      } else {
        // 添加新相机
        await cameraApi.create(formData)
      }
      setShowModal(false)
      setEditingCamera(null)
      setFormData({ name: '', source: '', type: 'rtsp', enabled: true })
      loadCameras()
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openModal = () => {
    setShowModal(true)
    setEditingCamera(null)  // 确保不是编辑模式
    setFormData({ name: '', source: '', type: 'rtsp', enabled: true })
    loadDevices()
  }

  const handleEdit = (camera) => {
    setEditingCamera(camera)
    setShowModal(true)
    setFormData({
      name: camera.name,
      source: camera.source,
      type: camera.type,
      enabled: camera.enabled
    })
    loadDevices()
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this camera?')) return
    try {
      await cameraApi.delete(id)
      loadCameras()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="empty-state">Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/')} className="btn btn-secondary" style={{ padding: '0.5rem' }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="page-title" style={{ marginBottom: 0 }}>Camera Management</h2>
        </div>
        <button className="btn btn-primary" onClick={openModal}>
          Add Camera
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fee', color: '#c33', borderRadius: '8px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {cameras.length === 0 ? (
        <div className="empty-state">
          <h3>No cameras yet</h3>
          <p>Click "Add Camera" to configure your first camera.</p>
        </div>
      ) : (
        <div className="camera-grid">
          {cameras.map((camera) => (
            <div key={camera.id} className="camera-card">
              <div className="camera-info" style={{ padding: '1.5rem' }}>
                <div className="camera-name">
                  <span className={`status-indicator ${camera.enabled ? 'status-online' : 'status-offline'}`} />
                  {camera.name}
                </div>
                <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                  Source: {camera.source}
                </p>
                <span className="camera-type" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                  {camera.type}
                </span>
                <div className="camera-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => handleEdit(camera)}
                    style={{ marginRight: '0.5rem' }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(camera.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingCamera ? 'Edit Camera' : 'Add Camera'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Camera Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="My Camera"
                />
              </div>

              <div className="form-group">
                <label>Camera Type</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  required
                >
                  <option value="rtsp">RTSP Stream</option>
                  <option value="usb">USB Camera</option>
                  <option value="integrated">Integrated Camera</option>
                </select>
              </div>

              {formData.type === 'rtsp' ? (
                <div className="form-group">
                  <label>RTSP URL</label>
                  <input
                    type="text"
                    name="source"
                    value={formData.source}
                    onChange={handleInputChange}
                    required
                    placeholder="rtsp://192.168.1.100:554/stream"
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label>Select Camera Device</label>
                  {loadingDevices ? (
                    <div>Loading devices...</div>
                  ) : devices.length > 0 ? (
                    <div>
                      <select
                        name="source"
                        value={formData.source}
                        onChange={(e) => {
                          const device = devices.find(d => d.id === e.target.value)
                          setFormData(prev => ({
                            ...prev,
                            source: e.target.value,
                            type: device ? device.type : prev.type,
                            name: prev.name || (device ? device.name : '')
                          }))
                        }}
                        required
                      >
                        <option value="">-- Select a device --</option>
                        {devices.map(device => (
                          <option key={device.id} value={device.id}>
                            {device.name} - {device.resolution} @ {device.fps} fps
                          </option>
                        ))}
                      </select>
                      <small style={{ color: '#666', fontSize: '0.75rem', display: 'block', marginTop: '0.5rem' }}>
                        {devices.length} device(s) found
                      </small>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        name="source"
                        value={formData.source}
                        onChange={handleInputChange}
                        required
                        placeholder="0"
                      />
                      <small style={{ color: '#666', fontSize: '0.75rem', display: 'block', marginTop: '0.5rem' }}>
                        No devices auto-detected. Enter device index manually (0, 1, 2...)
                      </small>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ marginTop: '0.5rem', fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        onClick={loadDevices}
                      >
                        Refresh Devices
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="enabled"
                    checked={formData.enabled}
                    onChange={handleInputChange}
                  />
                  Enable camera on startup
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowModal(false)
                    setEditingCamera(null)
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? (editingCamera ? 'Updating...' : 'Adding...') : (editingCamera ? 'Update Camera' : 'Add Camera')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CameraManagement
