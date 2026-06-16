// Module-level WebSocket stream manager — survives React component unmounts.
// Uses a single WebSocket per camera with multiple subscriber callbacks.

import { cameraApi } from './api';

const state = {
  // cameraId -> { ws, subscribers: Set<{ onFrame, onDetection, onClose, onOpen }> }
  cameras: {},
};

function getOrCreate(cameraId) {
  if (!state.cameras[cameraId]) {
    state.cameras[cameraId] = {
      ws: null,
      subscribers: new Set(),
      reconnectTimer: null,
      destroyed: false,
    };
  }
  return state.cameras[cameraId];
}

function connect(cameraId) {
  const cam = getOrCreate(cameraId);
  if (cam.destroyed) return;
  if (cam.ws && (cam.ws.readyState === WebSocket.OPEN || cam.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const ws = new WebSocket(cameraApi.getWebSocketUrl(cameraId));
  cam.ws = ws;

  ws.onopen = () => {
    cam.subscribers.forEach(sub => {
      try { sub.onOpen?.(); } catch (e) { /* ignore */ }
    });
  };

  ws.onmessage = (event) => {
    if (cam.destroyed) return;
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'frame' && data.frame) {
        cam.subscribers.forEach(sub => {
          try { sub.onFrame?.(data.frame, data); } catch (e) { /* ignore */ }
        });
      } else if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (err) {
      // ignore parse errors
    }
  };

  ws.onerror = () => {};

  ws.onclose = () => {
    cam.ws = null;
    cam.subscribers.forEach(sub => {
      try { sub.onClose?.(); } catch (e) { /* ignore */ }
    });
    if (!cam.destroyed && cam.subscribers.size > 0) {
      cam.reconnectTimer = setTimeout(() => connect(cameraId), 3000);
    }
  };
}

function disconnect(cameraId) {
  const cam = state.cameras[cameraId];
  if (!cam) return;
  if (cam.reconnectTimer) {
    clearTimeout(cam.reconnectTimer);
    cam.reconnectTimer = null;
  }
  if (cam.ws) {
    cam.ws.onclose = null; // prevent reconnect
    cam.ws.close();
    cam.ws = null;
  }
}

function destroy(cameraId) {
  const cam = state.cameras[cameraId];
  if (!cam) return;
  cam.destroyed = true;
  disconnect(cameraId);
  delete state.cameras[cameraId];
}

function destroyAll() {
  Object.keys(state.cameras).forEach(id => destroy(id));
}

/**
 * Subscribe to a camera stream.
 * @param {string} cameraId
 * @param {object} callbacks - { onFrame(base64), onDetection(detections), onOpen(), onClose() }
 * @returns {function} unsubscribe function
 */
export function subscribe(cameraId, callbacks) {
  const cam = getOrCreate(cameraId);
  cam.subscribers.add(callbacks);

  // Auto-connect if not already connected
  if (!cam.ws || cam.ws.readyState !== WebSocket.OPEN) {
    connect(cameraId);
  }

  return () => {
    cam.subscribers.delete(callbacks);
    // If no more subscribers, clean up after a delay
    if (cam.subscribers.size === 0) {
      // Keep alive for a short time in case user navigates back quickly
      setTimeout(() => {
        if (cam.subscribers.size === 0) {
          disconnect(cameraId);
        }
      }, 5000);
    }
  };
}

/**
 * Check if a camera stream is connected.
 */
export function isConnected(cameraId) {
  const cam = state.cameras[cameraId];
  return cam?.ws?.readyState === WebSocket.OPEN;
}

// Clean up all connections when the page is actually closed
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => destroyAll());
}

export { destroyAll };