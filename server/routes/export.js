import express from 'express';
import LiveSession from '../models/LiveSession.js';
import Pertemuan from '../models/Pertemuan.js';
import SessionRecord from '../models/SessionRecord.js';
import Kelas from '../models/Kelas.js';
import MataKuliah from '../models/MataKuliah.js';
import { auth } from '../middleware/auth.js';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

const router = express.Router();

// Export live session to Excel
router.get('/excel/session/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await LiveSession.findOne({ sessionId })
      .populate('mata_kuliah_id', 'nama kode')
      .populate('dosen_id', 'nama_lengkap');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Prepare data for Excel
    const excelData = session.detectionData.map((data, index) => ({
      'Time': data.timestamp.toLocaleString(),
      'Total Detections': data.totalDetections,
      'Focused Count': data.focusedCount,
      'Not Focused Count': data.notFocusedCount,
      'Sleeping Count': data.sleepingCount,
      'Phone Using Count': data.phoneUsingCount,
      'Chatting Count': data.chattingCount,
      'Focus Percentage': data.focusPercentage + '%'
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Add session info sheet
    const sessionInfo = [
      ['Session ID', session.sessionId],
      ['Class', session.kelas],
      ['Subject', session.mata_kuliah],
      ['Instructor', session.dosen_id.nama_lengkap],
      ['Start Time', session.startTime.toLocaleString()],
      ['End Time', session.endTime ? session.endTime.toLocaleString() : 'Ongoing'],
      ['Average Focus', session.summary.averageFocus.toFixed(2) + '%'],
      ['Peak Focus', session.summary.peakFocus.toFixed(2) + '%'],
      ['Lowest Focus', session.summary.lowestFocus.toFixed(2) + '%']
    ];
    
    const wsInfo = XLSX.utils.aoa_to_sheet(sessionInfo);
    
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Session Info');
    XLSX.utils.book_append_sheet(wb, ws, 'Detection Data');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="focus-session-${sessionId}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Export meeting report to PDF
router.get('/pdf/meeting/:meetingId', auth, async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    let query = {};
    
    // Filter by user role
    if (req.user.role === 'dosen') {
      query.dosen_id = req.user._id;
    }

    const totalKelas = await Kelas.countDocuments();
    const totalMataKuliah = await MataKuliah.countDocuments(
      req.user.role === 'dosen' ? { dosen_id: req.user._id } : {}
    );
    const totalPertemuan = await Pertemuan.countDocuments(query);
    const totalDosen = await User.countDocuments({ role: 'dosen' });

    // Get recent meetings
    const recentMeetings = await Pertemuan.find(query)
      .populate('dosen_id', 'nama_lengkap')
      .populate('mata_kuliah_id', 'nama')
      .sort({ tanggal: -1 })
      .limit(10);

    // Get focus statistics
    const allMeetings = await Pertemuan.find(query);
    const totalFocusData = allMeetings.reduce((acc, meeting) => {
      acc.totalFocus += meeting.hasil_akhir_kelas.fokus || 0;
      acc.count++;
      return acc;
    }, { totalFocus: 0, count: 0 });

    const averageFocus = totalFocusData.count > 0 
      ? (totalFocusData.totalFocus / totalFocusData.count)
      : 0;

    // Get class performance
    const classPerformance = await Pertemuan.aggregate([
      ...(req.user.role === 'dosen' ? [{ $match: { dosen_id: req.user._id } }] : []),
      {
        $group: {
          _id: '$kelas',
          averageFocus: { $avg: '$hasil_akhir_kelas.fokus' },
          totalMeetings: { $sum: 1 }
        }
      },
      { $sort: { averageFocus: -1 } },
      { $limit: 10 }
    ]);

    // Get dosen performance (admin only)
    let dosenPerformance = [];
    if (req.user.role === 'admin') {
      dosenPerformance = await Pertemuan.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'dosen_id',
            foreignField: '_id',
            as: 'dosen'
          }
        },
        { $unwind: '$dosen' },
        {
          $group: {
            _id: '$dosen_id',
            nama_lengkap: { $first: '$dosen.nama_lengkap' },
            averageFocus: { $avg: '$hasil_akhir_kelas.fokus' },
            totalMeetings: { $sum: 1 },
            totalClasses: { $addToSet: '$kelas' }
          }
        },
        {
          $addFields: {
            totalClasses: { $size: '$totalClasses' }
          }
        },
        { $sort: { averageFocus: -1 } },
        { $limit: 10 }
      ]);
    }

    // Get focus trends
    const focusTrends = await Pertemuan.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            month: { $month: '$tanggal' },
            year: { $year: '$tanggal' }
          },
          averageFocus: { $avg: '$hasil_akhir_kelas.fokus' },
          totalMeetings: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const formattedTrends = focusTrends.map(trend => ({
      month: monthNames[trend._id.month - 1],
      focus: Math.round(trend.averageFocus),
      meetings: trend.totalMeetings
    }));
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="meeting-report-${meetingId}.pdf"`);
    
    const doc = new PDFDocument();
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Focus Monitoring Report', { align: 'center' });
    doc.moveDown();

    // Meeting Info
    doc.fontSize(14).text('Meeting Information', { underline: true });
    doc.fontSize(12)
       .text(`Subject: ${meeting.mata_kuliah}`)
       .text(`Class: ${meeting.kelas}`)
       .text(`Meeting: ${meeting.pertemuan_ke}`)
       .text(`Date: ${meeting.tanggal.toLocaleDateString()}`)
       .text(`Instructor: ${meeting.dosen_id.nama_lengkap}`)
       .text(`Duration: ${meeting.durasi_pertemuan} minutes`);
    
    doc.moveDown();

    // Summary
    doc.fontSize(14).text('Focus Summary', { underline: true });
    doc.fontSize(12)
       .text(`Overall Focus Rate: ${meeting.hasil_akhir_kelas.fokus.toFixed(2)}%`)
       .text(`Students Present: ${meeting.hasil_akhir_kelas.jumlah_hadir}`)
       .text(`Average Focus Duration: ${Math.round(meeting.data_fokus.reduce((sum, s) => sum + s.durasi_fokus, 0) / meeting.data_fokus.length)} minutes`);

    doc.moveDown();

    // Student Details
    doc.fontSize(14).text('Student Focus Details', { underline: true });
    doc.fontSize(10);
    
    meeting.data_fokus.forEach((student, index) => {
      if (index % 20 === 0 && index > 0) {
        doc.addPage();
      }
      doc.text(`${student.id_siswa}: ${student.persen_fokus}% (${student.status})`);
    });

    doc.end();

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Export class performance to PDF
router.get('/pdf/class/:classId', auth, async (req, res) => {
  try {
    const { classId } = req.params;
    
    const meetings = await Pertemuan.find({ kelas: classId })
      .populate('mata_kuliah_id', 'nama kode')
      .populate('dosen_id', 'nama_lengkap')
      .sort({ tanggal: -1 });

    if (meetings.length === 0) {
      return res.status(404).json({ message: 'No meetings found for this class' });
    }

    // Create PDF
    const doc = new PDFDocument();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="class-report-${classId}.pdf"`);
    
    doc.pipe(res);

    // Header
    doc.fontSize(20).text(`Class Performance Report - ${classId}`, { align: 'center' });
    doc.moveDown();

    // Summary
    const averageFocus = meetings.reduce((sum, m) => sum + m.hasil_akhir_kelas.fokus, 0) / meetings.length;
    const totalStudents = Math.max(...meetings.map(m => m.hasil_akhir_kelas.jumlah_hadir));

    doc.fontSize(14).text('Class Summary', { underline: true });
    doc.fontSize(12)
       .text(`Total Meetings: ${meetings.length}`)
       .text(`Average Focus Rate: ${averageFocus.toFixed(2)}%`)
       .text(`Total Students: ${totalStudents}`)
       .text(`Report Generated: ${new Date().toLocaleDateString()}`);

    doc.moveDown();

    // Meeting Details
    doc.fontSize(14).text('Meeting History', { underline: true });
    doc.fontSize(10);
    
    meetings.forEach((meeting, index) => {
      if (index % 20 === 0 && index > 0) {
        doc.addPage();
      }
      doc.text(`Meeting ${meeting.pertemuan_ke} - ${meeting.mata_kuliah} (${meeting.tanggal.toLocaleDateString()}): ${meeting.hasil_akhir_kelas.fokus.toFixed(1)}% focus`);
    });

    doc.end();

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Export subject performance to PDF
router.get('/pdf/subject/:subjectId', auth, async (req, res) => {
  try {
    const { subjectId } = req.params;
    
    const subject = await MataKuliah.findById(subjectId)
      .populate('dosen_id', 'nama_lengkap departemen');
    
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const meetings = await Pertemuan.find({ mata_kuliah_id: subjectId })
      .populate('dosen_id', 'nama_lengkap')
      .sort({ tanggal: -1 });

    // Create PDF
    const doc = new PDFDocument();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="subject-${subject.nama}-report.pdf"`);
    
    doc.pipe(res);

    // Header
    doc.fontSize(20).text(`Subject Performance Report`, { align: 'center' });
    doc.fontSize(16).text(`${subject.nama} (${subject.kode})`, { align: 'center' });
    doc.moveDown();

    // Subject Info
    doc.fontSize(14).text('Subject Information', { underline: true });
    doc.fontSize(12)
       .text(`Subject: ${subject.nama}`)
       .text(`Code: ${subject.kode}`)
       .text(`Credits: ${subject.sks} SKS`)
       .text(`Instructor: ${subject.dosen_id.nama_lengkap}`)
       .text(`Department: ${subject.dosen_id.departemen}`)
       .text(`Classes: ${subject.kelas.join(', ')}`);

    doc.moveDown();

    // Summary
    if (meetings.length > 0) {
      const averageFocus = meetings.reduce((sum, m) => sum + m.hasil_akhir_kelas.fokus, 0) / meetings.length;
      const totalStudents = Math.max(...meetings.map(m => m.hasil_akhir_kelas.jumlah_hadir));

      doc.fontSize(14).text('Performance Summary', { underline: true });
      doc.fontSize(12)
         .text(`Total Meetings: ${meetings.length}`)
         .text(`Average Focus Rate: ${averageFocus.toFixed(2)}%`)
         .text(`Max Students: ${totalStudents}`)
         .text(`Report Generated: ${new Date().toLocaleDateString()}`);

      doc.moveDown();

      // Meeting Details by Class
      doc.fontSize(12)
         .text(`Total Classes: ${totalKelas}`)
         .text(`Total Subjects: ${totalMataKuliah}`)
         .text(`Total Meetings: ${totalPertemuan}`)
         .text(`Total Instructors: ${totalDosen}`)
         .text(`Average Focus Rate: ${averageFocus.toFixed(2)}%`);
          
      meetings.forEach((meeting, index) => {
        if (doc.y > 700) {
          doc.addPage();
        }
        if (formattedTrends.length > 0) {
          doc.text(`Meeting ${meeting.pertemuan_ke} (${meeting.tanggal.toLocaleDateString()}): ${meeting.hasil_akhir_kelas.fokus.toFixed(1)}% focus, ${meeting.hasil_akhir_kelas.jumlah_hadir} students`);
        }
      });
          
      formattedTrends.forEach((trend) => {
        const subjectName = meeting.mata_kuliah_id ? meeting.mata_kuliah_id.nama : meeting.mata_kuliah;
        doc.text(`${subjectName} - ${meeting.kelas} (Meeting ${meeting.pertemuan_ke}): ${meeting.hasil_akhir_kelas.fokus.toFixed(1)}% focus on ${new Date(meeting.tanggal).toLocaleDateString()}`);
      });
    } else {
      doc.fontSize(12).text('No meetings found for this subject.');
    }

    doc.end();

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Export subject data to Excel
router.get('/excel/subject/:subjectId', auth, async (req, res) => {
  try {
    const { subjectId } = req.params;
    
    const subject = await MataKuliah.findById(subjectId)
      .populate('dosen_id', 'nama_lengkap departemen');
    
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const meetings = await Pertemuan.find({ mata_kuliah_id: subjectId })
      .populate('dosen_id', 'nama_lengkap')
      .sort({ tanggal: -1 });

    // Prepare data for Excel
    const meetingData = meetings.map(meeting => ({
      'Meeting': meeting.pertemuan_ke,
      'Class': meeting.kelas,
      'Date': meeting.tanggal.toLocaleDateString(),
      'Topic': meeting.topik || 'No topic',
      'Duration (min)': meeting.durasi_pertemuan,
      'Focus Rate (%)': meeting.hasil_akhir_kelas.fokus.toFixed(2),
      'Not Focused (%)': meeting.hasil_akhir_kelas.tidak_fokus.toFixed(2),
      'Attendance': meeting.hasil_akhir_kelas.jumlah_hadir,
      'Instructor': meeting.dosen_id.nama_lengkap
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Subject info sheet
    const subjectInfo = [
      ['Subject Information'],
      ['Name', subject.nama],
      ['Code', subject.kode],
      ['Credits', subject.sks + ' SKS'],
      ['Instructor', subject.dosen_id.nama_lengkap],
      ['Department', subject.dosen_id.departemen],
      ['Classes', subject.kelas.join(', ')],
      ['Total Meetings', meetings.length],
      ['Report Generated', new Date().toLocaleDateString()]
    ];
    
    const wsInfo = XLSX.utils.aoa_to_sheet(subjectInfo);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Subject Info');
    
    // Meeting data sheet
    if (meetingData.length > 0) {
      const wsMeetings = XLSX.utils.json_to_sheet(meetingData);
      XLSX.utils.book_append_sheet(wb, wsMeetings, 'Meeting Data');
    }

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="subject-${subject.nama}-data.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;