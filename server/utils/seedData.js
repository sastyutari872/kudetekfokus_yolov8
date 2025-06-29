import User from '../models/User.js';
import Kelas from '../models/Kelas.js';
import MataKuliah from '../models/MataKuliah.js';
import Pertemuan from '../models/Pertemuan.js';
import mongoose from 'mongoose';

const Schedule = mongoose.model('Schedule');

export async function createDummyData() {
  try {
    // Clear existing data first
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Kelas.deleteMany({});
    await MataKuliah.deleteMany({});
    await Pertemuan.deleteMany({});
    await Schedule.deleteMany({});

    console.log('Creating fresh dummy data...');

    // Create varied dosen users with NIP as password
    const dosenData = [
      { nama: 'Dr. Ahmad Fauzi, M.Kom', departemen: 'Teknik Informatika', nip: '198501012010011001' },
      { nama: 'Prof. Dr. Siti Nurhaliza, M.T', departemen: 'Teknik Informatika', nip: '197803152005012002' },
      { nama: 'Dr. Budi Santoso, M.Sc', departemen: 'Sistem Informasi', nip: '198209201998031003' },
      { nama: 'Dr. Rina Kartika, M.Kom', departemen: 'Teknik Informatika', nip: '198712102012012004' },
      { nama: 'Prof. Dr. Hendro Wijaya, Ph.D', departemen: 'Sistem Informasi', nip: '197505251995121005' },
      { nama: 'Dr. Maya Sari, M.T', departemen: 'Teknik Informatika', nip: '198903182015032006' },
      { nama: 'Dr. Agus Prasetyo, M.Kom', departemen: 'Sistem Informasi', nip: '198406141999031007' },
      { nama: 'Dr. Dewi Lestari, M.Sc', departemen: 'Teknik Informatika', nip: '199001052018012008' },
      { nama: 'Prof. Dr. Bambang Sutrisno, Ph.D', departemen: 'Teknik Informatika', nip: '196812151992031009' },
      { nama: 'Dr. Indira Sari, M.T', departemen: 'Sistem Informasi', nip: '198205102008012010' }
    ];

    const dosenUsers = [];
    for (let i = 0; i < dosenData.length; i++) {
      const dosen = dosenData[i];
      const user = new User({
        username: `dosen${i + 1}`,
        email: `${dosen.nama.toLowerCase().replace(/[^a-z]/g, '')}@university.ac.id`,
        password: dosen.nip, // Use NIP as password
        role: 'dosen',
        nama_lengkap: dosen.nama,
        nip: dosen.nip,
        departemen: dosen.departemen
      });
      await user.save();
      dosenUsers.push(user);
    }

    // Create 1 admin user
    const adminUser = new User({
      username: 'admin',
      email: 'admin@university.ac.id',
      password: 'admin123',
      role: 'admin',
      nama_lengkap: 'Admin System',
      departemen: 'IT Support'
    });
    await adminUser.save();

    // Create 10 classes with varied names
    const kelasNames = ['TI-1A', 'TI-1B', 'TI-2A', 'TI-2B', 'TI-3A', 'SI-1A', 'SI-1B', 'SI-2A', 'SI-2B', 'SI-3A'];
    const kelasData = [];
    
    for (let i = 0; i < 10; i++) {
      const mahasiswa = [];
      const studentCount = Math.floor(Math.random() * 10) + 25; // 25-35 students per class
      
      for (let j = 1; j <= studentCount; j++) {
        mahasiswa.push({
          id_mahasiswa: `${kelasNames[i].replace('-', '')}${j.toString().padStart(3, '0')}`,
          nama: `Mahasiswa ${kelasNames[i]} ${j}`
        });
      }

      const kelas = new Kelas({
        nama_kelas: kelasNames[i],
        mahasiswa: mahasiswa,
        tahun_ajaran: '2024/2025',
        semester: i % 2 === 0 ? 'Ganjil' : 'Genap'
      });
      await kelas.save();
      kelasData.push(kelas);
    }

    // Create subjects with proper dosen assignment
    const subjects = [
      { nama: 'Pemrograman Web', kode: 'TI301', sks: 3, kelas: ['TI-1A', 'TI-1B'], semester: 3 },
      { nama: 'Database Management', kode: 'TI302', sks: 3, kelas: ['TI-2A', 'TI-2B'], semester: 4 },
      { nama: 'Algoritma dan Struktur Data', kode: 'TI201', sks: 4, kelas: ['TI-1A', 'TI-3A'], semester: 2 },
      { nama: 'Jaringan Komputer', kode: 'TI401', sks: 3, kelas: ['TI-2A', 'TI-3A'], semester: 5 },
      { nama: 'Sistem Informasi Manajemen', kode: 'SI301', sks: 3, kelas: ['SI-1A', 'SI-1B'], semester: 3 },
      { nama: 'Rekayasa Perangkat Lunak', kode: 'TI501', sks: 3, kelas: ['TI-2B', 'TI-3A'], semester: 6 },
      { nama: 'Analisis dan Perancangan Sistem', kode: 'SI401', sks: 4, kelas: ['SI-2A', 'SI-2B'], semester: 4 },
      { nama: 'Mobile Programming', kode: 'TI601', sks: 3, kelas: ['TI-1B', 'SI-3A'], semester: 7 },
      { nama: 'Machine Learning', kode: 'TI701', sks: 4, kelas: ['TI-3A'], semester: 8 },
      { nama: 'Cyber Security', kode: 'SI501', sks: 3, kelas: ['SI-2A', 'SI-3A'], semester: 5 },
      { nama: 'Data Mining', kode: 'SI601', sks: 3, kelas: ['SI-2B', 'SI-3A'], semester: 6 },
      { nama: 'Internet of Things', kode: 'TI801', sks: 3, kelas: ['TI-2A', 'TI-2B'], semester: 8 }
    ];

    const mataKuliahData = [];
    for (let i = 0; i < subjects.length; i++) {
      const subject = subjects[i];
      const dosenIndex = i % dosenUsers.length; // Distribute subjects among dosen
      
      const mataKuliah = new MataKuliah({
        nama: subject.nama,
        kode: subject.kode,
        sks: subject.sks,
        dosen_id: dosenUsers[dosenIndex]._id,
        kelas: subject.kelas,
        semester: subject.semester,
        deskripsi: `Mata kuliah ${subject.nama} untuk mahasiswa semester ${subject.semester}. Materi mencakup teori dan praktik yang komprehensif.`
      });
      await mataKuliah.save();
      mataKuliahData.push(mataKuliah);
    }

    // Create meetings for each subject with varied focus data
    const focusVariations = [45, 52, 58, 63, 67, 71, 74, 78, 82, 85, 87, 89, 91, 93, 95];
    
    for (let subjectIndex = 0; subjectIndex < mataKuliahData.length; subjectIndex++) {
      const mataKuliah = mataKuliahData[subjectIndex];
      const dosenIndex = subjectIndex % dosenUsers.length;
      const dosen = dosenUsers[dosenIndex];
      
      // Create meetings for each class in the subject
      for (const kelasName of mataKuliah.kelas) {
        const meetingCount = Math.floor(Math.random() * 4) + 6; // 6-10 meetings per class
        
        for (let pertemuanKe = 1; pertemuanKe <= meetingCount; pertemuanKe++) {
          const dataFokus = [];
          
          // Get students from the class
          const kelas = kelasData.find(k => k.nama_kelas === kelasName);
          if (!kelas) continue;
          
          // Generate focus data for each student with varied percentages
          const attendanceCount = Math.floor(Math.random() * 5) + (kelas.mahasiswa.length - 5); // Random attendance
          
          for (let mahasiswaIndex = 0; mahasiswaIndex < attendanceCount; mahasiswaIndex++) {
            const mahasiswa = kelas.mahasiswa[mahasiswaIndex];
            
            // Generate random focus pattern (12 sessions of 5 minutes each)
            const baseFocusRate = focusVariations[Math.floor(Math.random() * focusVariations.length)] / 100;
            const variation = (Math.random() - 0.5) * 0.3; // ±15% variation
            const studentFocusRate = Math.max(0.2, Math.min(0.95, baseFocusRate + variation));
            
            const fokusPattern = [];
            for (let session = 0; session < 12; session++) {
              fokusPattern.push(Math.random() < studentFocusRate ? 1 : 0);
            }
            
            const jumlahSesiFokus = fokusPattern.filter(f => f === 1).length;
            const persenFokus = Math.round((jumlahSesiFokus / 12) * 100);
            const persenTidakFokus = 100 - persenFokus;
            
            let status = 'Kurang';
            if (persenFokus >= 80) status = 'Baik';
            else if (persenFokus >= 60) status = 'Cukup';

            dataFokus.push({
              id_siswa: mahasiswa.id_mahasiswa,
              fokus: fokusPattern,
              jumlah_sesi_fokus: jumlahSesiFokus,
              durasi_fokus: jumlahSesiFokus * 5,
              waktu_hadir: 60,
              persen_fokus: persenFokus,
              persen_tidak_fokus: persenTidakFokus,
              status: status
            });
          }

          // Vary meeting dates over the past 3 months
          const baseDate = new Date(2024, 8, 1); // September 1, 2024
          const dayOffset = (subjectIndex * 7) + (pertemuanKe * 7) + Math.floor(Math.random() * 3);
          const meetingDate = new Date(baseDate.getTime() + (dayOffset * 24 * 60 * 60 * 1000));
          
          const topics = [
            'Pengenalan Konsep Dasar',
            'Implementasi dan Praktik',
            'Studi Kasus dan Analisis',
            'Evaluasi dan Review',
            'Pengembangan Lanjutan',
            'Integrasi Sistem',
            'Optimasi dan Performance',
            'Testing dan Debugging',
            'Deployment dan Maintenance',
            'Best Practices dan Standards'
          ];
          
          const pertemuan = new Pertemuan({
            tanggal: meetingDate,
            pertemuan_ke: pertemuanKe,
            kelas: kelasName,
            mata_kuliah: mataKuliah.nama,
            mata_kuliah_id: mataKuliah._id,
            dosen_id: dosen._id,
            durasi_pertemuan: Math.floor(Math.random() * 40) + 80, // 80-120 minutes
            topik: `${topics[pertemuanKe % topics.length]} - ${mataKuliah.nama}`,
            data_fokus: dataFokus,
            catatan: `Pertemuan ${pertemuanKe} berjalan dengan ${dataFokus.length > 0 && dataFokus.reduce((sum, d) => sum + d.persen_fokus, 0) / dataFokus.length > 70 ? 'sangat baik' : 'baik'}. Materi disampaikan secara interaktif dengan diskusi dan praktik.`
          });
          
          await pertemuan.save();
        }
      }
    }

    // Create schedule data with more variety
    const scheduleData = [];
    const timeSlots = [
      { start: '07:00', end: '08:40' },
      { start: '08:50', end: '10:30' },
      { start: '10:40', end: '12:20' },
      { start: '13:00', end: '14:40' },
      { start: '14:50', end: '16:30' },
      { start: '16:40', end: '18:20' }
    ];
    
    const rooms = ['R101', 'R102', 'R103', 'R201', 'R202', 'R203', 'Lab1', 'Lab2', 'Lab3'];
    
    for (let subjectIndex = 0; subjectIndex < mataKuliahData.length; subjectIndex++) {
      const mataKuliah = mataKuliahData[subjectIndex];
      const dosenIndex = subjectIndex % dosenUsers.length;
      const dosen = dosenUsers[dosenIndex];
      
      for (const kelasName of mataKuliah.kelas) {
        const scheduleCount = Math.floor(Math.random() * 3) + 4; // 4-6 upcoming schedules
        
        for (let week = 1; week <= scheduleCount; week++) {
          const scheduleDate = new Date();
          scheduleDate.setDate(scheduleDate.getDate() + (week * 7) + (subjectIndex % 7)); // Spread over coming weeks
          
          const timeSlot = timeSlots[subjectIndex % timeSlots.length];
          const room = rooms[Math.floor(Math.random() * rooms.length)];
          
          const schedule = new Schedule({
            kelas: kelasName,
            mata_kuliah: mataKuliah.nama,
            mata_kuliah_id: mataKuliah._id,
            dosen_id: dosen._id,
            dosen_name: dosen.nama_lengkap,
            tanggal: scheduleDate,
            jam_mulai: timeSlot.start,
            jam_selesai: timeSlot.end,
            durasi: 100,
            pertemuan_ke: week + 10, // Continue from existing meetings
            topik: `Materi Minggu ${week} - ${mataKuliah.nama}`,
            ruangan: room,
            status: week <= 2 ? 'completed' : Math.random() > 0.8 ? 'cancelled' : 'scheduled'
          });
          
          await schedule.save();
          scheduleData.push(schedule);
        }
      }
    }

    console.log('✅ Enhanced dummy data created successfully!');
    console.log(`📊 Created: ${dosenUsers.length} dosen, ${kelasData.length} classes, ${mataKuliahData.length} subjects`);
    console.log('🔑 Login credentials:');
    console.log('Admin: admin / admin123');
    console.log('Dosen credentials (username / password = NIP):');
    dosenUsers.forEach((dosen, index) => {
      console.log(`dosen${index + 1} / ${dosen.nip} (${dosen.nama_lengkap})`);
    });

  } catch (error) {
    console.error('❌ Error creating dummy data:', error);
  }
}