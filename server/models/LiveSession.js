import mongoose from 'mongoose';

const detectionDataSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  totalDetections: {
    type: Number,
    default: 0
  },
  focusedCount: {
    type: Number,
    default: 0
  },
  notFocusedCount: {
    type: Number,
    default: 0
  },
  sleepingCount: {
    type: Number,
    default: 0
  },
  phoneUsingCount: {
    type: Number,
    default: 0
  },
  chattingCount: {
    type: Number,
    default: 0
  },
  focusPercentage: {
    type: Number,
    default: 0
  }
});

const liveSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  kelas: {
    type: String,
    required: true
  },
  mata_kuliah: {
    type: String,
    required: true
  },
  mata_kuliah_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MataKuliah',
    required: true
  },
  dosen_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  detectionData: [detectionDataSchema],
  summary: {
    totalDuration: {
      type: Number,
      default: 0
    },
    averageFocus: {
      type: Number,
      default: 0
    },
    peakFocus: {
      type: Number,
      default: 0
    },
    lowestFocus: {
      type: Number,
      default: 100
    }
  }
}, {
  timestamps: true
});

liveSessionSchema.pre('save', function(next) {
  if (this.detectionData.length > 0) {
    const focusPercentages = this.detectionData.map(d => d.focusPercentage);
    this.summary.averageFocus = focusPercentages.reduce((a, b) => a + b, 0) / focusPercentages.length;
    this.summary.peakFocus = Math.max(...focusPercentages);
    this.summary.lowestFocus = Math.min(...focusPercentages);
  }
  next();
});

export default mongoose.model('LiveSession', liveSessionSchema);