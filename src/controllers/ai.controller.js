const { GoogleGenerativeAI } = require('@google/generative-ai')
const prisma = require('../lib/prisma')

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const analyzeStudent = async (req, res) => {
  try {
    const studentId = Number(req.params.id)

    // جيب بيانات الطالب كاملة
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        attendance: true,
        payments: true,
      },
    })

    if (!student) {
      return res.status(404).json({ message: 'الطالب غير موجود' })
    }

    // حساب الإحصائيات
    const totalAttendance = student.attendance.length
    const presentCount = student.attendance.filter(a => a.status === 'present').length
    const absentCount = student.attendance.filter(a => a.status === 'absent').length
    const lateCount = student.attendance.filter(a => a.status === 'late').length
    const attendanceRate = totalAttendance ? Math.round((presentCount / totalAttendance) * 100) : 0

    const totalPayments = student.payments.length
    const paidPayments = student.payments.filter(p => p.status === 'paid').length
    const pendingPayments = student.payments.filter(p => p.status === 'pending').length
    const overduePayments = student.payments.filter(p => p.status === 'overdue').length

    // بناء الـ prompt
    const prompt = `
أنت مساعد تعليمي متخصص. حلل أداء الطالب التالي وأعطني تقريراً مفصلاً باللغة العربية:

معلومات الطالب:
- الاسم: ${student.name}
- الكورس: ${student.course}
- الدرجة: ${student.grade || 'غير محددة'}
- الحالة: ${student.status}

إحصائيات الحضور:
- نسبة الحضور: ${attendanceRate}%
- عدد مرات الحضور: ${presentCount}
- عدد مرات الغياب: ${absentCount}
- عدد مرات التأخر: ${lateCount}

إحصائيات المدفوعات:
- إجمالي الدفعات: ${totalPayments}
- مدفوعة: ${paidPayments}
- معلقة: ${pendingPayments}
- متأخرة: ${overduePayments}

أعطني تقريراً يشمل:
1. تقييم عام للأداء
2. نقاط القوة
3. نقاط الضعف
4. توصيات للتحسين

اجعل التقرير واضحاً ومختصراً ومفيداً.
`

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const analysis = result.response.text()

    res.json({
      student: {
        id: student.id,
        name: student.name,
        course: student.course,
        grade: student.grade,
        status: student.status,
      },
      stats: {
        attendanceRate,
        presentCount,
        absentCount,
        lateCount,
        paidPayments,
        pendingPayments,
        overduePayments,
      },
      analysis,
    })
  } catch (err) {
    console.error('analyzeStudent error:', err)
    res.status(500).json({ message: 'خطأ في السيرفر' })
  }
}

module.exports = { analyzeStudent }