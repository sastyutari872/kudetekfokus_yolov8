import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Square, 
  Camera, 
  Eye, 
  EyeOff, 
  Download,
  Settings,
  BarChart3,
  Clock,
  Target,
  Grid3X3,
  Trash2,
  Save,
  Users,
  BookOpen,
  Brain,
  Upload,
  Calendar,
  User,
  CheckCircle,
  AlertCircle,
  XCircle
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

interface SeatPosition {
  seat_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  is_occupied: boolean;
  student_id: string | null;
  face_detected: boolean;
  gesture_type: string;
  confidence: number;
  focus_start_time: number | null;
  total_focus_duration: number;
}

interface DetectionData {
  timestamp: string;
  totalDetections: number;
  focusedCount: number;
  notFocusedCount: number;
  sleepingCount: number;
  phoneUsingCount: number;
  chattingCount: number;
  yawningCount: number;
  writingCount: number;
  focusPercentage: number;
  seatData: SeatPosition[];
}

interface LiveSession {
  _id: string;
  sessionId: string;
  kelas: string;
  mata_kuliah: string;
  startTime: string;
  isActive: boolean;
  detectionData: DetectionData[];
  seatPositions: SeatPosition[];
  summary: {
    averageFocus: number;
    peakFocus: number;
    lowestFocus: number;
  };
}

interface CameraDevice {
  deviceId: string;
  label: string;
}

interface Schedule {
  _id: string;
  kelas: string;
  mata_kuliah: string;
  mata_kuliah_id: string;
  dosen_id: string;
  dosen_name: string;
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  durasi: number;
  pertemuan_ke: number;
  topik: string;
  ruangan: string;
  status: string;
  seat_positions?: SeatPosition[];
}

interface ModelFile {
  name: string;
  path: string;
  size: number;
  uploadedAt: string;
}

export default function LiveMonitoring() {
  const { user } = useAuth();
  
  // Session Management
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentSession, setCurrentSession] = useState<LiveSession | null>(null);
  const [detectionData, setDetectionData] = useState<DetectionData[]>([]);
  
  // Configuration
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [sessionName, setSessionName] = useState('');
  
  // Camera & Labelling
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [seatPositions, setSeatPositions] = useState<SeatPosition[]>([]);
  const [totalSeats, setTotalSeats] = useState(30);
  
  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentSeat, setCurrentSeat] = useState<Partial<SeatPosition> | null>(null);
  const [isLabellingMode, setIsLabellingMode] = useState(false);
  
  // Data
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [models, setModels] = useState<ModelFile[]>([]);
  
  // Flask Status
  const [flaskStatus, setFlaskStatus] = useState<'disconnected' | 'connected' | 'error'>('disconnected');
  const [modelStatus, setModelStatus] = useState<'inactive' | 'loading' | 'active' | 'error'>('inactive');
  const [flaskError, setFlaskError] = useState<string>('');
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getCameraDevices();
    fetchSchedules();
    fetchModels();
    checkFlaskStatus();
    
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isMonitoring) {
      syncCanvasSize();
      window.addEventListener('resize', syncCanvasSize);
      return () => window.removeEventListener('resize', syncCanvasSize);
    }
  }, [isMonitoring]);

  // Data Fetching Functions
  const getCameraDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`
        }));
      setCameras(videoDevices);
      if (videoDevices.length > 0) {
        setSelectedCamera(videoDevices[0].deviceId);
      }
    } catch (error) {
      toast.error('Failed to get camera devices');
      console.error('Camera enumeration error:', error);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await axios.get('/jadwal');
      setSchedules(response.data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  const fetchModels = async () => {
    try {
      const response = await axios.get('/models/list');
      setModels(response.data);
      if (response.data.length > 0) {
        setSelectedModel(response.data[0].path);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
      toast.error('Failed to fetch available models');
    }
  };

  const checkFlaskStatus = async () => {
    try {
      const response = await axios.get('/flask/status');
      setFlaskStatus('connected');
      setFlaskError('');
    } catch (error) {
      setFlaskStatus('error');
      setFlaskError('Flask server not responding. Please ensure Flask server is running on port 5001.');
      console.error('Flask status check failed:', error);
    }
  };

  // Camera Functions
  const startCamera = async () => {
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
          width: 1920,
          height: 1080
        },
        audio: false
      });

      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        syncCanvasSize();
      }
      toast.success('Camera started successfully');
    } catch (error) {
      toast.error('Failed to start camera');
      console.error('Camera start error:', error);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    toast.success('Camera stopped');
  };

  // Flask Model Functions
  const initializeFlaskModel = async () => {
    if (!selectedModel) {
      toast.error('Please select a model first');
      return false;
    }

    setModelStatus('loading');
    try {
      const response = await axios.post('/flask/initialize-model', {
        model_path: selectedModel,
        model_type: 'pytorch',
        confidence_threshold: 0.5,
        iou_threshold: 0.4
      });

      if (response.data.success) {
        setModelStatus('active');
        toast.success('Model initialized successfully');
        return true;
      } else {
        throw new Error(response.data.message || 'Model initialization failed');
      }
    } catch (error: any) {
      setModelStatus('error');
      const errorMessage = error.response?.data?.message || error.message || 'Failed to initialize model';
      setFlaskError(errorMessage);
      toast.error(`Model initialization failed: ${errorMessage}`);
      console.error('Flask model initialization error:', error);
      return false;
    }
  };

  // Seat Labelling Functions
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isLabellingMode || !cameraStream) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setCurrentSeat({
      seat_id: seatPositions.length + 1,
      x,
      y,
      width: 0,
      height: 0,
      is_occupied: false,
      student_id: `Student-${seatPositions.length + 1}`,
      face_detected: false,
      gesture_type: 'unknown',
      confidence: 0,
      focus_start_time: null,
      total_focus_duration: 0
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentSeat || !isLabellingMode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setCurrentSeat({
      ...currentSeat,
      width: currentX - (currentSeat.x || 0),
      height: currentY - (currentSeat.y || 0)
    });

    drawCanvas();
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawing || !currentSeat || !isLabellingMode) return;

    if (Math.abs(currentSeat.width || 0) > 20 && Math.abs(currentSeat.height || 0) > 20) {
      const newSeat: SeatPosition = {
        seat_id: seatPositions.length + 1,
        x: currentSeat.x || 0,
        y: currentSeat.y || 0,
        width: Math.abs(currentSeat.width || 0),
        height: Math.abs(currentSeat.height || 0),
        is_occupied: false,
        student_id: `Student-${seatPositions.length + 1}`,
        face_detected: false,
        gesture_type: 'unknown',
        confidence: 0,
        focus_start_time: null,
        total_focus_duration: 0
      };

      setSeatPositions([...seatPositions, newSeat]);
      toast.success(`Seat ${newSeat.seat_id} added`);
    }

    setIsDrawing(false);
    setCurrentSeat(null);
  };

  const generateGridSeats = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rows = Math.ceil(Math.sqrt(totalSeats));
    const cols = Math.ceil(totalSeats / rows);
    const seatWidth = 80;
    const seatHeight = 60;
    const padding = 20;
    
    const newSeats: SeatPosition[] = [];
    let seatId = 1;

    for (let row = 0; row < rows && seatId <= totalSeats; row++) {
      for (let col = 0; col < cols && seatId <= totalSeats; col++) {
        newSeats.push({
          seat_id: seatId,
          x: col * (seatWidth + padding) + padding,
          y: row * (seatHeight + padding) + padding,
          width: seatWidth,
          height: seatHeight,
          is_occupied: false,
          student_id: `Student-${seatId}`,
          face_detected: false,
          gesture_type: 'unknown',
          confidence: 0,
          focus_start_time: null,
          total_focus_duration: 0
        });
        seatId++;
      }
    }

    setSeatPositions(newSeats);
    toast.success(`Generated ${newSeats.length} seat positions`);
  };

  const clearAllSeats = () => {
    setSeatPositions([]);
    toast.success('All seats cleared');
  };

  // Canvas Drawing
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing seats
    seatPositions.forEach((seat) => {
      let strokeColor = '#3B82F6'; // Default blue
      let fillColor = 'rgba(59, 130, 246, 0.1)';
      
      if (seat.face_detected && seat.gesture_type === 'focused') {
        strokeColor = '#10B981'; // Green for focused
        fillColor = 'rgba(16, 185, 129, 0.2)';
      } else if (seat.face_detected && seat.gesture_type !== 'focused') {
        strokeColor = '#F59E0B'; // Orange for detected but not focused
        fillColor = 'rgba(245, 158, 11, 0.2)';
      } else if (seat.is_occupied) {
        strokeColor = '#EF4444'; // Red for occupied but no face
        fillColor = 'rgba(239, 68, 68, 0.2)';
      }

      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = 3;
      ctx.fillRect(seat.x, seat.y, seat.width, seat.height);
      ctx.strokeRect(seat.x, seat.y, seat.width, seat.height);
      
      // Draw seat label
      ctx.fillStyle = strokeColor;
      ctx.font = '12px Arial';
      ctx.fillText(`S${seat.seat_id}`, seat.x + 5, seat.y + 15);
      
      // Draw gesture type
      if (seat.gesture_type && seat.gesture_type !== 'unknown') {
        ctx.fillStyle = strokeColor;
        ctx.font = '10px Arial';
        ctx.fillText(seat.gesture_type, seat.x + 5, seat.y + 30);
      }
      
      // Draw focus duration if available
      if (seat.total_focus_duration > 0) {
        const minutes = Math.floor(seat.total_focus_duration / 60000);
        const seconds = Math.floor((seat.total_focus_duration % 60000) / 1000);
        ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, seat.x + 5, seat.y + seat.height - 5);
      }
    });

    // Draw current drawing seat
    if (isDrawing && currentSeat && isLabellingMode) {
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        currentSeat.x || 0,
        currentSeat.y || 0,
        currentSeat.width || 0,
        currentSeat.height || 0
      );
      ctx.setLineDash([]);
    }
  };

  const syncCanvasSize = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas) {
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      drawCanvas();
    }
  };

  useEffect(() => {
    if (cameraStream) {
      const interval = setInterval(drawCanvas, 100);
      return () => clearInterval(interval);
    }
  }, [cameraStream, seatPositions, currentSeat, isDrawing, isLabellingMode]);

  // Monitoring Functions
  const startMonitoring = async () => {
    if (!selectedSchedule) {
      toast.error('Please select a schedule');
      return;
    }

    if (!selectedModel) {
      toast.error('Please select a model');
      return;
    }

    if (seatPositions.length === 0) {
      toast.error('Please add seat positions before starting monitoring');
      return;
    }

    try {
      if (!cameraStream) {
        await startCamera();
      }

      // Initialize Flask model
      const modelInitialized = await initializeFlaskModel();
      if (!modelInitialized) {
        return;
      }

      const schedule = schedules.find(s => s._id === selectedSchedule);
      if (!schedule) {
        toast.error('Selected schedule not found');
        return;
      }

      const response = await axios.post('/live-monitoring/start', {
        kelas: schedule.kelas,
        mata_kuliah_id: schedule.mata_kuliah_id,
        mata_kuliah: schedule.mata_kuliah,
        sessionName: sessionName || `${schedule.mata_kuliah} - ${schedule.kelas}`,
        seatPositions,
        modelPath: selectedModel
      });

      setCurrentSession(response.data);
      setIsMonitoring(true);
      setIsLabellingMode(false);
      toast.success('Live monitoring started');

      // Start face detection with Flask
      startFlaskDetection(response.data.sessionId);
    } catch (error) {
      toast.error('Failed to start monitoring');
      console.error('Start monitoring error:', error);
    }
  };

  const stopMonitoring = async () => {
    if (!currentSession) return;

    try {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }

      await axios.post(`/live-monitoring/stop/${currentSession.sessionId}`);
      
      // Export data automatically
      await exportSessionData();
      
      setIsMonitoring(false);
      setCurrentSession(null);
      setDetectionData([]);
      setModelStatus('inactive');
      
      // Reset seat focus data
      setSeatPositions(prev => prev.map(seat => ({
        ...seat,
        face_detected: false,
        gesture_type: 'unknown',
        confidence: 0,
        focus_start_time: null,
        total_focus_duration: 0
      })));
      
      toast.success('Live monitoring stopped and data exported');
    } catch (error) {
      toast.error('Failed to stop monitoring');
      console.error('Stop monitoring error:', error);
    }
  };

  const startFlaskDetection = (sessionId: string) => {
    detectionIntervalRef.current = setInterval(async () => {
      if (!isMonitoring || !videoRef.current) {
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
        }
        return;
      }

      try {
        // Capture frame from video
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        
        const frameData = canvas.toDataURL('image/jpeg', 0.8);

        // Send frame to Flask for detection
        const response = await axios.post('/flask/detect-frame', {
          frameData,
          seatPositions,
          sessionId
        });

        if (response.data.success) {
          const updatedSeats = response.data.updated_seats;
          const currentTime = Date.now();

          // Update seat positions with detection results
          const newSeats = updatedSeats.map((seat: any) => {
            const existingSeat = seatPositions.find(s => s.seat_id === seat.seat_id);
            let newSeat = { ...seat };

            if (existingSeat) {
              // Handle focus duration tracking
              if (seat.gesture_type === 'focused' && !existingSeat.face_detected) {
                // Just started focusing
                newSeat.focus_start_time = currentTime;
              } else if (seat.gesture_type !== 'focused' && existingSeat.face_detected && existingSeat.focus_start_time) {
                // Stopped focusing
                newSeat.total_focus_duration = existingSeat.total_focus_duration + (currentTime - existingSeat.focus_start_time);
                newSeat.focus_start_time = null;
              } else if (seat.gesture_type === 'focused' && existingSeat.focus_start_time) {
                // Continue focusing
                newSeat.total_focus_duration = existingSeat.total_focus_duration;
                newSeat.focus_start_time = existingSeat.focus_start_time;
              } else {
                // Not focusing
                newSeat.total_focus_duration = existingSeat.total_focus_duration;
                newSeat.focus_start_time = null;
              }
            }

            return newSeat;
          });

          setSeatPositions(newSeats);

          // Calculate detection statistics
          const totalDetections = newSeats.filter((seat: any) => seat.face_detected).length;
          const focusedCount = newSeats.filter((seat: any) => seat.gesture_type === 'focused').length;
          const notFocusedCount = totalDetections - focusedCount;
          const sleepingCount = newSeats.filter((seat: any) => seat.gesture_type === 'sleeping').length;
          const phoneUsingCount = newSeats.filter((seat: any) => seat.gesture_type === 'using_phone').length;
          const chattingCount = newSeats.filter((seat: any) => seat.gesture_type === 'chatting').length;
          const yawningCount = newSeats.filter((seat: any) => seat.gesture_type === 'yawning').length;
          const writingCount = newSeats.filter((seat: any) => seat.gesture_type === 'writing').length;
          const focusPercentage = totalDetections > 0 ? Math.round((focusedCount / totalDetections) * 100) : 0;

          const newDetectionData: DetectionData = {
            timestamp: new Date().toLocaleTimeString(),
            totalDetections,
            focusedCount,
            notFocusedCount,
            sleepingCount,
            phoneUsingCount,
            chattingCount,
            yawningCount,
            writingCount,
            focusPercentage,
            seatData: newSeats
          };

          setDetectionData(prev => [...prev.slice(-19), newDetectionData]);

          // Send to backend
          axios.post(`/live-monitoring/detection/${sessionId}`, newDetectionData)
            .catch(error => console.error('Detection data error:', error));
        }

      } catch (error) {
        console.error('Flask detection error:', error);
      }
    }, 2000);
  };

  const exportSessionData = async () => {
    if (!currentSession) return;

    try {
      const schedule = schedules.find(s => s._id === selectedSchedule);
      if (!schedule) return;

      // Save to database
      await axios.post('/session-records', {
        sessionId: currentSession.sessionId,
        sessionName: sessionName || `${schedule.mata_kuliah} - ${schedule.kelas}`,
        className: schedule.kelas,
        subjectName: schedule.mata_kuliah,
        seatData: seatPositions,
        detectionData,
        summary: {
          totalSeats: seatPositions.length,
          averageFocusTime: seatPositions.reduce((sum, seat) => sum + seat.total_focus_duration, 0) / seatPositions.length,
          sessionDuration: Date.now() - new Date(currentSession.startTime).getTime()
        },
        tanggal: schedule.tanggal,
        jamMulai: schedule.jam_mulai,
        jamSelesai: schedule.jam_selesai,
        durasi: schedule.durasi,
        dosenId: schedule.dosen_id
      });

      toast.success('Session data exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export session data');
    }
  };

  const loadScheduleData = (scheduleId: string) => {
    const schedule = schedules.find(s => s._id === scheduleId);
    if (schedule) {
      setSessionName(`${schedule.mata_kuliah} - ${schedule.kelas} - Meeting ${schedule.pertemuan_ke}`);
      // Load seat positions if available
      if (schedule.seat_positions && schedule.seat_positions.length > 0) {
        setSeatPositions(schedule.seat_positions.map(seat => ({
          ...seat,
          is_occupied: false,
          face_detected: false,
          gesture_type: 'unknown',
          confidence: 0,
          focus_start_time: null,
          total_focus_duration: 0
        })));
      }
    }
  };

  // Statistics
  const latestData = detectionData[detectionData.length - 1];
  const averageFocus = detectionData.length > 0 
    ? Math.round(detectionData.reduce((sum, d) => sum + d.focusPercentage, 0) / detectionData.length)
    : 0;

  const pieData = latestData ? [
    { name: 'Focused', value: latestData.focusedCount, color: '#10B981' },
    { name: 'Not Focused', value: latestData.notFocusedCount, color: '#EF4444' },
    { name: 'Sleeping', value: latestData.sleepingCount, color: '#8B5CF6' },
    { name: 'Using Phone', value: latestData.phoneUsingCount, color: '#F59E0B' },
    { name: 'Chatting', value: latestData.chattingCount, color: '#EC4899' },
    { name: 'Writing', value: latestData.writingCount, color: '#06B6D4' }
  ].filter(item => item.value > 0) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-600 via-purple-600 to-teal-600 rounded-xl p-6 text-white"
      >
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center">
              <Target className="h-8 w-8 mr-3" />
              Live Focus Monitoring & AI Detection
            </h1>
            <p className="mt-2 opacity-90">Real-time student focus detection with YOLO AI models</p>
          </div>
          <div className="flex items-center space-x-4">
            {isMonitoring && (
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="flex items-center bg-red-500 px-3 py-1 rounded-full"
              >
                <div className="w-2 h-2 bg-white rounded-full mr-2"></div>
                <span className="text-sm font-medium">LIVE</span>
              </motion.div>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsLabellingMode(!isLabellingMode)}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                isLabellingMode 
                  ? 'bg-orange-500 hover:bg-orange-600' 
                  : 'bg-white bg-opacity-20 hover:bg-opacity-30'
              }`}
            >
              {isLabellingMode ? 'Exit Labelling' : 'Enter Labelling Mode'}
            </motion.button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Control Panel */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Configuration
          </h3>
          
          <div className="space-y-4">
            {/* Flask Status */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Flask Server</span>
                <div className={`flex items-center ${
                  flaskStatus === 'connected' ? 'text-green-600' : 
                  flaskStatus === 'error' ? 'text-red-600' : 'text-gray-400'
                }`}>
                  {flaskStatus === 'connected' ? <CheckCircle className="h-4 w-4" /> :
                   flaskStatus === 'error' ? <XCircle className="h-4 w-4" /> :
                   <AlertCircle className="h-4 w-4" />}
                  <span className="ml-1 text-xs">{flaskStatus}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Model Status</span>
                <div className={`flex items-center ${
                  modelStatus === 'active' ? 'text-green-600' : 
                  modelStatus === 'loading' ? 'text-yellow-600' :
                  modelStatus === 'error' ? 'text-red-600' : 'text-gray-400'
                }`}>
                  {modelStatus === 'loading' && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-1"></div>}
                  <span className="text-xs">{modelStatus}</span>
                </div>
              </div>
              {flaskError && (
                <p className="text-xs text-red-600 mt-2">{flaskError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Schedule</label>
              <select
                value={selectedSchedule}
                onChange={(e) => {
                  setSelectedSchedule(e.target.value);
                  loadScheduleData(e.target.value);
                }}
                disabled={isMonitoring}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">Select Schedule</option>
                {schedules.map((schedule) => (
                  <option key={schedule._id} value={schedule._id}>
                    {schedule.mata_kuliah} - {schedule.kelas} (Meeting {schedule.pertemuan_ke})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Session Name</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                disabled={isMonitoring}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter session name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">YOLO Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isMonitoring}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">Select Model</option>
                {models.map((model) => (
                  <option key={model.path} value={model.path}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Camera Device</label>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                disabled={isMonitoring}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                {cameras.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Total Seats</label>
              <input
                type="number"
                min="1"
                max="50"
                value={totalSeats}
                onChange={(e) => setTotalSeats(parseInt(e.target.value))}
                disabled={isMonitoring}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-4">
              {!cameraStream ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={startCamera}
                  className="w-full flex items-center justify-center px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Start Camera
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={stopCamera}
                  disabled={isMonitoring}
                  className="w-full flex items-center justify-center px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop Camera
                </motion.button>
              )}

              {isLabellingMode && (
                <>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={generateGridSeats}
                    className="w-full flex items-center justify-center px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg font-medium"
                  >
                    <Grid3X3 className="h-4 w-4 mr-2" />
                    Generate Grid
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={clearAllSeats}
                    className="w-full flex items-center justify-center px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-medium"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Seats
                  </motion.button>
                </>
              )}

              {!isMonitoring ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={startMonitoring}
                  disabled={!selectedSchedule || !selectedModel || seatPositions.length === 0}
                  className="w-full flex items-center justify-center px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Monitoring
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={stopMonitoring}
                  className="w-full flex items-center justify-center px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-medium"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop & Export
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Camera Feed */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Eye className="h-5 w-5 mr-2" />
            Camera Feed & AI Detection
          </h3>
          
          <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              className="w-full h-full object-cover"
              style={{ display: cameraStream ? 'block' : 'none' }}
            />
            
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ 
                display: cameraStream ? 'block' : 'none',
                cursor: isLabellingMode ? 'crosshair' : 'default'
              }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            />
            
            {!cameraStream && (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <Camera className="h-12 w-12 mx-auto mb-2" />
                  <p>Camera not active</p>
                  <p className="text-sm">Start camera to begin</p>
                </div>
              </div>
            )}

            {isMonitoring && (
              <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                AI MONITORING
              </div>
            )}

            {isLabellingMode && (
              <div className="absolute top-4 right-4 bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                LABELLING MODE
              </div>
            )}

            {modelStatus === 'active' && isMonitoring && (
              <div className="absolute bottom-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                YOLO MODEL ACTIVE
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">
              {isLabellingMode ? 'Labelling Instructions:' : 'Monitoring Status:'}
            </h4>
            {isLabellingMode ? (
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Click and drag to create seat bounding boxes</li>
                <li>• Blue: Empty seats, Green: Focused, Orange: Not focused, Red: No face detected</li>
                <li>• Seats defined: {seatPositions.length}/{totalSeats}</li>
              </ul>
            ) : (
              <div className="text-sm text-blue-700 space-y-1">
                <p>• AI detection active within seat boundaries</p>
                <p>• Gesture recognition: focused, sleeping, phone use, chatting, writing</p>
                <p>• Real-time statistics updated every 2 seconds</p>
                <p>• Model: {selectedModel ? models.find(m => m.path === selectedModel)?.name : 'None'}</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Statistics Panel */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          {/* Current Stats */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Live Statistics
            </h3>
            
            {latestData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{latestData.totalDetections}</div>
                    <div className="text-sm text-blue-600">Total Detected</div>
                  </div>
                  <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{latestData.focusPercentage}%</div>
                    <div className="text-sm text-green-600">Focus Rate</div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Focused</span>
                    <span className="text-sm font-medium text-green-600">{latestData.focusedCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Not Focused</span>
                    <span className="text-sm font-medium text-red-600">{latestData.notFocusedCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Sleeping</span>
                    <span className="text-sm font-medium text-purple-600">{latestData.sleepingCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Using Phone</span>
                    <span className="text-sm font-medium text-orange-600">{latestData.phoneUsingCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Average Focus</span>
                    <span className="text-sm font-medium text-blue-600">{averageFocus}%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <Eye className="h-8 w-8 mx-auto mb-2" />
                <p>No detection data yet</p>
              </div>
            )}
          </div>

          {/* Seat Management */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Seats ({seatPositions.length})
            </h3>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {seatPositions.map((seat) => (
                <div key={seat.seat_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full mr-3 ${
                      seat.gesture_type === 'focused' ? 'bg-green-500' : 
                      seat.face_detected ? 'bg-orange-500' : 
                      seat.is_occupied ? 'bg-red-500' : 'bg-blue-500'
                    }`}></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Seat {seat.seat_id}</p>
                      <p className="text-xs text-gray-500">
                        {seat.gesture_type !== 'unknown' ? seat.gesture_type : 'No detection'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Focus: {Math.round(seat.total_focus_duration / 1000)}s
                      </p>
                    </div>
                  </div>
                  {isLabellingMode && (
                    <button
                      onClick={() => setSeatPositions(seatPositions.filter(s => s.seat_id !== seat.seat_id))}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {seatPositions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">No seats defined</p>
                <p className="text-xs">Enter labelling mode to add seats</p>
              </div>
            )}
          </div>
          </motion.div>

          {/* Session Info */}
          {currentSession && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-6"
            >
              <h3 className="text-lg font-semibold text-purple-900 mb-4 flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Session Info
              </h3>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-purple-700">Session:</span>
                  <span className="font-medium text-purple-900">{sessionName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-700">Started:</span>
                  <span className="font-medium text-purple-900">
                    {new Date(currentSession.startTime).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-700">Average Focus:</span>
                  <span className="font-medium text-purple-900">{averageFocus}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-700">Model:</span>
                  <span className="font-medium text-purple-900">
                    {models.find(m => m.path === selectedModel)?.name || 'Unknown'}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
      </div>

      {/* Charts */}
      <AnimatePresence>
        {detectionData.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Focus Trend */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Focus Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={detectionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="focusPercentage" 
                    stroke="#3B82F6" 
                    strokeWidth={3}
                    dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Activity Distribution */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Activity Distribution</h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-gray-500">
                  <div className="text-center">
                    <EyeOff className="h-8 w-8 mx-auto mb-2" />
                    <p>No activity data</p>
                  </div>
                </div>
              )}
              
              {pieData.length > 0 && (
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {pieData.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: entry.color }}
                      ></div>
                      <span className="text-sm text-gray-600">{entry.name}: {entry.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}