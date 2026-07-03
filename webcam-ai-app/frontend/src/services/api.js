const API_BASE = '/api';
const AI_API_BASE = '/ai-api';

async function fetchWithError(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const cameraApi = {
  list: () => fetchWithError(`${API_BASE}/cameras/`),

  get: (id) => fetchWithError(`${API_BASE}/cameras/${id}`),

  listDevices: () => fetchWithError(`${API_BASE}/cameras/devices`),

  create: (data) => fetchWithError(`${API_BASE}/cameras/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  update: (id, data) => fetchWithError(`${API_BASE}/cameras/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  delete: (id) => fetchWithError(`${API_BASE}/cameras/${id}`, {
    method: 'DELETE'
  }),

  getStreamUrl: (id, useAi = false, aiUrl = null) => {
    let url = `${API_BASE}/stream/${id}`;
    const params = [];
    if (useAi) params.push('use_ai=true');
    if (aiUrl) params.push(`ai_url=${encodeURIComponent(aiUrl)}`);
    if (params.length) url += '?' + params.join('&');
    return url;
  },

  getWebSocketUrl: (id) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${API_BASE}/stream/${id}/ws`;
  },

  getSnapshotUrl: (id) => `${API_BASE}/stream/${id}/snapshot`
};

export const aiApi = {
  listAlgorithms: () => fetchWithError(`${AI_API_BASE}/algorithms`),

  getAlgorithm: (id) => fetchWithError(`${AI_API_BASE}/algorithms/${id}`),

  processImage: async (imageFile, cameraId, algorithm, confidence = 0.5, roi = null, classes = []) => {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('camera_id', cameraId);
    formData.append('algorithm', algorithm);
    formData.append('confidence', confidence.toString());
    
    if (roi) {
      formData.append('roi_x1', roi.x1.toString());
      formData.append('roi_y1', roi.y1.toString());
      formData.append('roi_x2', roi.x2.toString());
      formData.append('roi_y2', roi.y2.toString());
    }
    
    if (classes && classes.length > 0) {
      formData.append('classes', classes.join(','));
    }

    return fetchWithError(`${AI_API_BASE}/process`, {
      method: 'POST',
      body: formData
    });
  },

  getClasses: (algorithm) => fetchWithError(`${AI_API_BASE}/classes/${algorithm}`)
};
