// Module-level WebSocket stream manager — survives React component unmounts.
// Uses a single WebSocket per camera with multiple subscriber callbacks.

import { cameraApi } from './api';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 10000;
const IDLE_DISCONNECT_DELAY_MS = 5000;

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
      idleTimer: null,
      reconnectAttempts: 0,
      destroyed: false,
    };
  }
  return state.cameras[cameraId];
}

function notifySubscribers(cam, callbackName, ...args) {
  cam.subscribers.forEach(subscriber => {
    try { subscriber[callbackName]?.(...args); } catch (e) { /* isolate subscribers */ }
  });
}

function scheduleReconnect(cameraId, cam) {
  if (cam.destroyed || cam.subscribers.size === 0 || cam.reconnectTimer) return;

  cam.reconnectAttempts += 1;
  const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (cam.reconnectAttempts - 1), RECONNECT_MAX_DELAY_MS);
  cam.reconnectTimer = setTimeout(() => {
    cam.reconnectTimer = null;
    connect(cameraId);
  }, delay);
}

function connect(cameraId) {
  const cam = getOrCreate(cameraId);
  if (cam.destroyed) return;
  if (cam.ws && (cam.ws.readyState === WebSocket.OPEN || cam.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (cam.idleTimer) {
    clearTimeout(cam.idleTimer);
    cam.idleTimer = null;
  }

  const ws = new WebSocket(cameraApi.getWebSocketUrl(cameraId));
  cam.ws = ws;

  ws.onopen = () => {
    cam.reconnectAttempts = 0;
    notifySubscribers(cam, 'onOpen');
  };

  ws.onmessage = (event) => {
    if (cam.destroyed) return;
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'frame' && data.frame) {
        notifySubscribers(cam, 'onFrame', data.frame, data);
      } else if (data.type === 'ping' && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (err) {
      // ignore malformed stream messages
    }
  };

  ws.onerror = () => {};

  ws.onclose = () => {
    if (cam.ws === ws) cam.ws = null;
    notifySubscribers(cam, 'onClose');
    scheduleReconnect(cameraId, cam);
  };
}

function disconnect(cameraId) {
  const cam = state.cameras[cameraId];
  if (!cam) return;
  if (cam.reconnectTimer) {
    clearTimeout(cam.reconnectTimer);
    cam.reconnectTimer = null;
  }
  if (cam.idleTimer) {
    clearTimeout(cam.idleTimer);
    cam.idleTimer = null;
  }
  cam.reconnectAttempts = 0;
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
  cam.destroyed = false;
  cam.subscribers.add(callbacks);

  if (cam.idleTimer) {
    clearTimeout(cam.idleTimer);
    cam.idleTimer = null;
  }

  // Auto-connect if not already connected
  if (!cam.ws || cam.ws.readyState === WebSocket.CLOSED || cam.ws.readyState === WebSocket.CLOSING) {
    connect(cameraId);
  }

  return () => {
    cam.subscribers.delete(callbacks);
    // If no more subscribers, clean up after a delay.
    // Keep alive briefly in case the user navigates between dashboard/detail views.
    if (cam.subscribers.size === 0 && !cam.idleTimer) {
      cam.idleTimer = setTimeout(() => {
        if (cam.subscribers.size === 0) {
          disconnect(cameraId);
        }
      }, IDLE_DISCONNECT_DELAY_MS);
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
