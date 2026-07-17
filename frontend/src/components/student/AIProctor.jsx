import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, Eye, EyeOff, Minus, Maximize2 } from 'lucide-react'
import api from '../../utils/api'

// Load MediaPipe Tasks Vision dynamically from CDN
const loadMediaPipe = async () => {
  return await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/tasks-vision.js')
}

export default function AIProctor({ resultId, onViolation, onPermissionChange, retryTrigger }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [minimized, setMinimized] = useState(false)

  // Floating draggable position in pixels
  const [position, setPosition] = useState({ x: window.innerWidth - 240, y: 70 })
  const [isDragging, setIsDragging] = useState(false)

  const videoRef = useRef(null)
  const landmarkerRef = useRef(null)
  const streamRef = useRef(null)
  const dragStart = useRef({ x: 0, y: 0 })
  
  // Ref tracking for timing metrics
  const lastViolationTimeRef = useRef(0)
  const lastProcessTimeRef = useRef(0)
  const noFaceStartTimeRef = useRef(null)
  const headTurnStartTimeRef = useRef(null)
  const multipleFacesStartTimeRef = useRef(null)
  const reconnectInProgressRef = useRef(false)
  const initIdRef = useRef(0)

  // Dragging event handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('button')) return
    setIsDragging(true)
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return
      const newX = e.clientX - dragStart.current.x
      const newY = e.clientY - dragStart.current.y

      const width = minimized ? 160 : 210
      const height = minimized ? 44 : 200

      const boundedX = Math.max(10, Math.min(newX, window.innerWidth - width - 10))
      const boundedY = Math.max(10, Math.min(newY, window.innerHeight - height - 10))

      setPosition({ x: boundedX, y: boundedY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, minimized])

  useEffect(() => {
    const handleResize = () => {
      setPosition((pos) => {
        const width = minimized ? 160 : 210
        const height = minimized ? 44 : 200
        const boundedX = Math.max(10, Math.min(pos.x, window.innerWidth - width - 10))
        const boundedY = Math.max(10, Math.min(pos.y, window.innerHeight - height - 10))
        return { x: boundedX, y: boundedY }
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [minimized])

  // Background offline queue sync
  const syncQueue = useCallback(async () => {
    const QUEUE_KEY = `offline-violations-${resultId}`;
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (queue.length === 0) return;

    const remaining = [];
    for (const event of queue) {
      try {
        await api.post('/student/exams/violation', {
          resultId: event.resultId,
          violationType: event.violationType,
          timestamp: event.timestamp
        });
      } catch (err) {
        const isNetworkError = !err.response || err.response.status >= 500;
        if (isNetworkError) {
          remaining.push(event);
        }
      }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  }, [resultId]);

  useEffect(() => {
    syncQueue();
    window.addEventListener('online', syncQueue);
    return () => {
      window.removeEventListener('online', syncQueue);
    }
  }, [syncQueue]);

  // Reconnection logic for camera
  const reconnectWebcam = useCallback(async () => {
    if (reconnectInProgressRef.current) return;
    reconnectInProgressRef.current = true;

    const logDev = (msg, data = null) => {
      if (import.meta.env.DEV) {
        if (data) {
          console.log(`[AIProctor DEV LOG] ${msg}`, data);
        } else {
          console.log(`[AIProctor DEV LOG] ${msg}`);
        }
      }
    };

    logDev("reconnectWebcam: starting reconnection procedure.");

    if (streamRef.current) {
      logDev("reconnectWebcam: stopping previous stream.");
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    let attempts = 0;
    const tryConnect = async () => {
      try {
        logDev("getUserMedia() called (reconnect attempt " + (attempts + 1) + ")");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, frameRate: { ideal: 10, max: 15 } }
        });
        
        logDev("getUserMedia() success (reconnect)");

        if (!stream || stream.getVideoTracks().length === 0) {
          logDev("reconnect: stream is empty or has no tracks.");
          throw new Error("Stream is empty or has no tracks.");
        }

        const activeTrack = stream.getVideoTracks()[0];
        logDev("Selected camera device: " + activeTrack.label);
        logDev("MediaStream active: " + stream.active);

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
            logDev("Webcam video playing (reconnect).");
          } catch (e) {
            logDev("reconnect play failed:", e);
          }
        }
        reconnectInProgressRef.current = false;
      } catch (err) {
        logDev("getUserMedia() error (reconnect)", err);
        logDev("Error name: " + err.name);
        logDev("Error message: " + err.message);

        attempts++;
        if (attempts < 5) {
          setTimeout(tryConnect, 3000);
        } else {
          reconnectInProgressRef.current = false;
          setError("Webcam connection lost. Check hardware connection.");
        }
      }
    };
    tryConnect();
  }, []);

  // Initialize MediaPipe and Camera
  useEffect(() => {
    const currentInitId = ++initIdRef.current;
    let active = true;

    const logDev = (msg, data = null) => {
      if (import.meta.env.DEV) {
        if (data) {
          console.log(`[AIProctor DEV LOG] ${msg}`, data);
        } else {
          console.log(`[AIProctor DEV LOG] ${msg}`);
        }
      }
    };

    const init = async () => {
      try {
        setLoading(true);
        setError(null);
        onPermissionChange(null);

        // 1. Check Permissions API first
        let permissionState = 'prompt';
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
          try {
            const permissionStatus = await navigator.permissions.query({ name: 'camera' });
            permissionState = permissionStatus.state;
            logDev("Permission status: " + permissionState);
          } catch (e) {
            logDev("Permissions query failed, falling back to prompt:", e);
          }
        }

        // If permission is already denied, skip getUserMedia and fail immediately
        if (permissionState === 'denied') {
          logDev("Camera permission is denied by browser. Showing dialog.");
          if (currentInitId === initIdRef.current) {
            setError("Camera permission denied. Please allow camera access in your browser settings.");
            setLoading(false);
            onPermissionChange(false);
          }
          return;
        }

        // 2. Cleanup any previous stream before requesting a new one
        if (streamRef.current) {
          logDev("Stopping previous stream before requesting getUserMedia.");
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }

        // 3. Request camera stream (resolves 'prompt' -> 'granted' or throws error)
        logDev("getUserMedia() called");
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, frameRate: { ideal: 10, max: 15 } }
          });
          logDev("getUserMedia() success");
        } catch (err) {
          logDev("getUserMedia() error", err);
          logDev("Error name: " + (err.name || "Unknown"));
          logDev("Error message: " + (err.message || "No message"));
          throw err;
        }

        if (currentInitId !== initIdRef.current) {
          logDev("A newer initialization is in progress. Aborting current initialization.");
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
          }
          return;
        }

        if (!stream || stream.getVideoTracks().length === 0) {
          logDev("getUserMedia succeeded but stream is null or empty.");
          throw new Error("Stream is null or has no video tracks.");
        }

        const activeTrack = stream.getVideoTracks()[0];
        logDev("Selected camera device: " + activeTrack.label);
        logDev("MediaStream active: " + stream.active);

        streamRef.current = stream;

        // Bind stream immediately to video ref since it's rendered unconditionally now
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
            logDev("Webcam video playing.");
          } catch (playErr) {
            logDev("Video element play was interrupted or failed:", playErr);
          }
        }

        // Call onPermissionChange(true) IMMEDIATELY after stream is active, before model loading
        logDev("Camera is ready. Letting student continue into the exam.");
        onPermissionChange(true);

        // 4. Initialize MediaPipe Face Landmarker if not already initialized
        if (!landmarkerRef.current) {
          logDev("Loading MediaPipe tasks-vision and models...");
          const mp = await loadMediaPipe();
          const vision = await mp.FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
          );

          let landmarker;
          try {
            // Attempt GPU WebGL accelerated mode first
            landmarker = await mp.FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                delegate: "GPU"
              },
              runningMode: "VIDEO",
              numFaces: 2
            });
            logDev("FaceLandmarker initialized on GPU.");
          } catch (gpuErr) {
            logDev("FaceLandmarker GPU init failed. Falling back to CPU.", gpuErr);
            landmarker = await mp.FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                delegate: "CPU"
              },
              runningMode: "VIDEO",
              numFaces: 2
            });
            logDev("FaceLandmarker initialized on CPU.");
          }

          if (currentInitId !== initIdRef.current) {
            logDev("A newer initialization is in progress. Cleaning up stream and aborting.");
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          landmarkerRef.current = landmarker;
        }

        logDev("AI Proctor initialized");
        setLoading(false);
      } catch (err) {
        logDev("AI Proctor initialization caught error:", err);
        logDev("Error name: " + (err.name || "Unknown"));
        logDev("Error message: " + (err.message || "No message"));
        if (currentInitId === initIdRef.current) {
          setError(err.message || "Camera permission denied or model loading failed.");
          setLoading(false);
          onPermissionChange(false, {
            name: err.name || 'UnknownError',
            message: err.message || 'An unknown error occurred during camera initialization.'
          });
        }
      }
    };

    init();

    return () => {
      active = false;
      logDev("Cleaning up active stream tracks on effect cleanup.");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [onPermissionChange, retryTrigger])

  // Core frame-processing animation loop
  useEffect(() => {
    if (loading || error || !landmarkerRef.current) return

    let animId

    const detect = () => {
      const video = videoRef.current
      if (video && video.readyState >= 2) {
        // Automatically attempt reconnection if stream ends
        const track = streamRef.current?.getVideoTracks()[0];
        if (track && track.readyState === 'ended' && !reconnectInProgressRef.current) {
          reconnectWebcam();
          return;
        }

        const now = performance.now()

        // 1. Frame Rate Throttling / CPU Optimization
        // Standard monitoring: 10 FPS (100ms interval)
        // Suspicious state confirmation: 15 FPS (66ms interval)
        const hasSuspiciousState = 
          noFaceStartTimeRef.current !== null || 
          headTurnStartTimeRef.current !== null || 
          multipleFacesStartTimeRef.current !== null;

        const interval = hasSuspiciousState ? 66 : 100;

        if (now - lastProcessTimeRef.current >= interval) {
          lastProcessTimeRef.current = now

          const results = landmarkerRef.current.detectForVideo(video, now)

          if (results && results.faceLandmarks) {
            const faces = results.faceLandmarks

            // Rule A: No Face (Absent continuously for > 5s)
            if (faces.length === 0) {
              headTurnStartTimeRef.current = null
              multipleFacesStartTimeRef.current = null

              if (noFaceStartTimeRef.current === null) {
                noFaceStartTimeRef.current = Date.now()
              } else {
                const elapsed = Date.now() - noFaceStartTimeRef.current
                if (elapsed > 5000) {
                  onViolation("No Face")
                  noFaceStartTimeRef.current = Date.now() // Reset timer
                }
              }
            } 
            // Rule B: Multiple Faces (Present continuously for > 2s)
            else if (faces.length > 1) {
              noFaceStartTimeRef.current = null
              headTurnStartTimeRef.current = null

              if (multipleFacesStartTimeRef.current === null) {
                multipleFacesStartTimeRef.current = Date.now()
              } else {
                const elapsed = Date.now() - multipleFacesStartTimeRef.current
                if (elapsed > 2000) {
                  onViolation("Multiple Faces")
                  multipleFacesStartTimeRef.current = Date.now() // Reset timer
                }
              }
            } 
            // Rule C: Head Turn (Continuously looking away for 2.5s)
            else {
              noFaceStartTimeRef.current = null
              multipleFacesStartTimeRef.current = null

              const landmarks = faces[0]
              const nose = landmarks[4]
              const leftEye = landmarks[33]
              const rightEye = landmarks[263]
              const forehead = landmarks[10]
              const chin = landmarks[152]

              let lookingAway = false
              if (nose && leftEye && rightEye && forehead && chin) {
                const minX = Math.min(leftEye.x, rightEye.x)
                const maxX = Math.max(leftEye.x, rightEye.x)
                const horizontalRatio = (nose.x - minX) / (maxX - minX)

                const minY = Math.min(forehead.y, chin.y)
                const maxY = Math.max(forehead.y, chin.y)
                const verticalRatio = (nose.y - minY) / (maxY - minY)

                if (horizontalRatio < 0.35 || horizontalRatio > 0.65 || verticalRatio < 0.48 || verticalRatio > 0.72) {
                  lookingAway = true
                }
              }

              if (lookingAway) {
                if (headTurnStartTimeRef.current === null) {
                  headTurnStartTimeRef.current = Date.now()
                } else {
                  const elapsed = Date.now() - headTurnStartTimeRef.current
                  if (elapsed > 2500) {
                    onViolation("Head Turn")
                    headTurnStartTimeRef.current = Date.now()
                  }
                }
              } else {
                headTurnStartTimeRef.current = null
              }
            }
          }
        }
      }
      animId = requestAnimationFrame(detect)
    }

    detect()

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [loading, error, onViolation, reconnectWebcam])

  if (error) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999
      }}
      className="glass-card !p-0 overflow-hidden shadow-2xl transition-shadow select-none"
    >
      {minimized ? (
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-700/60 rounded-xl cursor-move text-xs font-semibold text-slate-300 w-40 justify-between animate-fade-in"
        >
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI Proctor</span>
          </div>
          <button
            onClick={() => setMinimized(false)}
            className="text-slate-400 hover:text-white cursor-pointer"
            title="Restore Feed"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      ) : (
        <div className="w-52 border border-slate-700/60 rounded-xl bg-slate-950 flex flex-col animate-fade-in">
          <div
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 cursor-move"
          >
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
              <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider">AI Live Monitor</span>
            </div>
            <button
              onClick={() => setMinimized(true)}
              className="text-slate-400 hover:text-white cursor-pointer"
              title="Minimize"
            >
              <Minus size={14} />
            </button>
          </div>

          <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden">
            {loading && (
              <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-center p-4 z-10">
                <div className="spinner !w-6 !h-6 mb-2 mx-auto" />
                <p className="text-[9px] text-slate-400">Loading AI Proctor...</p>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          </div>
        </div>
      )}
    </div>
  )
}
