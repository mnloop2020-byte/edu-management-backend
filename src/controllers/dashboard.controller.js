const prisma = require("../lib/prisma");

const isPendingPayment = (payment) => {
  const remaining = Math.max(0, payment.totalAmount - payment.paidAmount);
  if (remaining <= 0) return false;

  if (!payment.dueDate) return true;

  const dueDate = new Date(payment.dueDate);
  dueDate.setHours(23, 59, 59, 999);
  return dueDate >= new Date();
};

const getDashboardOverview = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyRange = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      day.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);

      return { day, end, label: weekdays[day.getDay()] };
    });

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const trendRange = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
      const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return {
        month: months[date.getMonth()],
        start: date,
        end: next,
      };
    });

    const [
      studentsCount,
      teachersCount,
      totalStudents,
      presentToday,
      recentStudents,
      payments,
      weeklyCounts,
      trendCounts,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.student.count(),
      prisma.attendance.count({
        where: { status: "present", date: { gte: today, lte: endOfDay } },
      }),
      prisma.student.findMany({
        orderBy: { joinedAt: "desc" },
        take: 4,
        select: { id: true, name: true, course: true, grade: true, status: true, joinedAt: true },
      }),
      prisma.payment.findMany({
        select: { totalAmount: true, paidAmount: true, dueDate: true },
      }),
      Promise.all(
        weeklyRange.map((range) =>
          prisma.attendance.count({
            where: {
              status: "present",
              date: { gte: range.day, lte: range.end },
            },
          })
        )
      ),
      Promise.all(
        trendRange.map((range) =>
          prisma.student.count({
            where: { joinedAt: { gte: range.start, lt: range.end } },
          })
        )
      ),
    ]);

    const pendingPayments = payments.filter(isPendingPayment).length;
    const weekly = weeklyRange.map((range, index) => ({
      day: range.label,
      students: weeklyCounts[index],
    }));
    const trend = trendRange.map((range, index) => ({
      month: range.month,
      value: trendCounts[index],
    }));

    res.json({
      stats: {
        students: studentsCount,
        teachers: teachersCount,
        attendanceRate: totalStudents ? Math.round((presentToday / totalStudents) * 100) : 0,
        pendingPayments,
      },
      recentStudents,
      weekly,
      trend,
    });
  } catch (err) {
    console.error("getDashboardOverview error:", err);
    res.status(500).json({ message: "Failed to load dashboard data" });
  }
};

module.exports = { getDashboardOverview };
