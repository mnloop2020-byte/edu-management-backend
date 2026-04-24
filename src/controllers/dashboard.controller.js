const prisma = require("../lib/prisma");

const getPaymentState = (payment) => {
  const remaining = Math.max(0, payment.totalAmount - payment.paidAmount);
  if (remaining <= 0) return "paid";

  if (!payment.dueDate) return payment.paidAmount > 0 ? "partial" : "pending";

  const dueDate = new Date(payment.dueDate);
  dueDate.setHours(23, 59, 59, 999);
  if (dueDate < new Date()) return "overdue";
  return payment.paidAmount > 0 ? "partial" : "pending";
};

const buildAttendanceIndicator = (records) => {
  const totalClasses = records.length;
  const presentCount = records.filter((item) => item.status === "present").length;
  const absentCount = records.filter((item) => item.status === "absent").length;
  const attendanceRate = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

  let indicator = "SAFE";
  if (absentCount >= 3 && absentCount <= 4) indicator = "WARNING";
  else if (absentCount > 4) indicator = "RISK";

  return { totalClasses, absentCount, attendanceRate, indicator };
};

const getStudentProfileByUserId = async (userId, fromDate) => {
  return prisma.student.findUnique({
    where: { userId },
    include: {
      classes: { select: { classId: true } },
      attendance: {
        where: { date: { gte: fromDate } },
        select: { id: true, status: true, date: true },
      },
      payments: {
        include: {
          transactions: {
            orderBy: [{ date: "desc" }, { id: "desc" }],
            take: 5,
          },
        },
        orderBy: { date: "desc" },
      },
      submissions: {
        include: {
          assignment: {
            select: {
              id: true,
              title: true,
              dueAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        take: 10,
      },
    },
  });
};

const getParentStudentProfilesByUserId = async (userId, fromDate) => {
  const parent = await prisma.parentProfile.findUnique({
    where: { userId },
    select: {
      studentLinks: {
        select: { studentId: true },
      },
    },
  });

  if (!parent) return [];

  const studentIds = [...new Set((parent.studentLinks || []).map((item) => item.studentId))];
  if (studentIds.length === 0) return [];

  return prisma.student.findMany({
    where: { id: { in: studentIds } },
    include: {
      classes: { select: { classId: true } },
      attendance: {
        where: { date: { gte: fromDate } },
        select: { id: true, status: true, date: true },
      },
      payments: {
        include: {
          transactions: {
            orderBy: [{ date: "desc" }, { id: "desc" }],
            take: 5,
          },
        },
        orderBy: { date: "desc" },
      },
      submissions: {
        include: {
          assignment: {
            select: {
              id: true,
              title: true,
              dueAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        take: 10,
      },
    },
    orderBy: [{ joinedAt: "desc" }, { id: "asc" }],
  });
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

    if (req.user.role === "STUDENT") {
      const student = await getStudentProfileByUserId(req.user.id, trendRange[0].start);
      if (!student) {
        return res.json({
          stats: { students: 1, teachers: 0, attendanceRate: 0, pendingPayments: 0 },
          recentStudents: [],
          weekly: weeklyRange.map((range) => ({ day: range.label, students: 0 })),
          trend: trendRange.map((range) => ({ month: range.month, value: 0 })),
          riskStudents: [],
          paymentStatus: { paid: 0, partial: 0, pending: 0, overdue: 0 },
          gradeDistribution: [],
          insights: ["No student profile linked to this account yet"],
          notifications: [],
          activityFeed: [],
        });
      }

      const paymentStatus = student.payments.reduce((acc, payment) => {
        const state = getPaymentState(payment);
        if (state === "paid") acc.paid += 1;
        if (state === "partial") acc.partial += 1;
        if (state === "pending") acc.pending += 1;
        if (state === "overdue") acc.overdue += 1;
        return acc;
      }, { paid: 0, partial: 0, pending: 0, overdue: 0 });

      const pendingPayments = paymentStatus.pending + paymentStatus.partial + paymentStatus.overdue;
      const attendanceStats = buildAttendanceIndicator(student.attendance || []);

      const weekly = weeklyRange.map((range) => {
        const count = (student.attendance || []).filter((item) => {
          const date = new Date(item.date);
          return item.status === "present" && date >= range.day && date <= range.end;
        }).length;
        return { day: range.label, students: count };
      });

      const trend = trendRange.map((range) => {
        const value = (student.submissions || []).filter((item) => {
          const dueAt = new Date(item.assignment?.dueAt || item.assignment?.createdAt || 0);
          return dueAt >= range.start && dueAt < range.end;
        }).length;
        return { month: range.month, value };
      });

      const riskStudents = attendanceStats.indicator === "SAFE"
        ? []
        : [{
          id: student.id,
          name: student.name,
          course: student.course,
          absentCount: attendanceStats.absentCount,
          attendanceRate: attendanceStats.attendanceRate,
          indicator: attendanceStats.indicator,
        }];

      const classIds = student.classes.map((item) => item.classId);
      const upcomingWindow = new Date();
      upcomingWindow.setDate(upcomingWindow.getDate() + 14);

      const upcomingEvents = await prisma.calendarEvent.findMany({
        where: {
          startAt: { gte: today, lte: upcomingWindow },
          OR: [
            { relatedStudentId: student.id },
            ...(classIds.length > 0 ? [{ relatedClassId: { in: classIds } }] : []),
          ],
          type: { in: ["EXAM", "ASSIGNMENT_DEADLINE", "PAYMENT_DEADLINE"] },
        },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: 5,
      });

      const insights = [];
      if (attendanceStats.indicator === "RISK") insights.push("Your absences exceeded the semester limit");
      else if (attendanceStats.indicator === "WARNING") insights.push("You are close to the absence limit");
      if (paymentStatus.overdue > 0) insights.push("You have overdue payments that need follow-up");
      if (upcomingEvents.length > 0) insights.push(`${upcomingEvents.length} upcoming deadlines in the next 14 days`);
      if (insights.length === 0) insights.push("Everything looks on track this week");

      const notifications = [
        ...(attendanceStats.indicator === "SAFE" ? [] : [{
          type: attendanceStats.indicator === "RISK" ? "danger" : "warning",
          icon: attendanceStats.indicator === "RISK" ? "risk" : "warning",
          title: attendanceStats.indicator === "RISK" ? "Absence limit exceeded" : "Near absence limit",
          description: `${attendanceStats.absentCount} absences recorded this semester`,
          path: "/students/me",
          createdAt: new Date().toISOString(),
        }]),
        ...(paymentStatus.overdue > 0 ? [{
          type: "danger",
          icon: "payment",
          title: `${paymentStatus.overdue} overdue payments`,
          description: "Open your payment page to review pending balances",
          path: "/payments?status=overdue",
          createdAt: new Date().toISOString(),
        }] : []),
        ...upcomingEvents.map((event) => ({
          type: "info",
          icon: event.type === "EXAM" ? "performance" : event.type === "PAYMENT_DEADLINE" ? "payment" : "warning",
          title: event.title,
          description: `Scheduled on ${new Date(event.startAt).toLocaleDateString()}`,
          path: "/calendar",
          createdAt: event.startAt.toISOString(),
        })),
      ].slice(0, 8);

      const activityFeed = [
        ...(student.attendance || []).slice(0, 5).map((record) => ({
          type: "attendance",
          title: "Attendance recorded",
          description: `${student.name} marked ${record.status}`,
          path: "/students/me",
          createdAt: record.date,
        })),
        ...(student.payments || []).flatMap((payment) =>
          (payment.transactions || []).slice(0, 1).map((transaction) => ({
            type: "payment",
            title: "Payment recorded",
            description: `${transaction.amount} SAR added to your account`,
            path: "/payments",
            createdAt: transaction.date,
          }))
        ),
        ...(student.submissions || []).map((submission) => ({
          type: "assignment",
          title: "Assignment update",
          description: submission.assignment?.title || "Assignment submission",
          path: "/assignments",
          createdAt: submission.submittedAt || submission.assignment?.createdAt || new Date(),
        })),
      ]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10);

      return res.json({
        stats: {
          students: 1,
          teachers: 0,
          attendanceRate: attendanceStats.attendanceRate,
          pendingPayments,
        },
        recentStudents: [{
          id: student.id,
          name: student.name,
          course: student.course,
          grade: student.grade,
          status: student.status,
          joinedAt: student.joinedAt,
        }],
        weekly,
        trend,
        riskStudents,
        paymentStatus,
        gradeDistribution: [],
        insights,
        notifications,
        activityFeed,
      });
    }

    if (req.user.role === "PARENT") {
      const students = await getParentStudentProfilesByUserId(req.user.id, trendRange[0].start);
      if (students.length === 0) {
        return res.json({
          stats: { students: 0, teachers: 0, attendanceRate: 0, pendingPayments: 0 },
          recentStudents: [],
          weekly: weeklyRange.map((range) => ({ day: range.label, students: 0 })),
          trend: trendRange.map((range) => ({ month: range.month, value: 0 })),
          riskStudents: [],
          paymentStatus: { paid: 0, partial: 0, pending: 0, overdue: 0 },
          gradeDistribution: [],
          insights: ["No linked students found for this parent account"],
          notifications: [],
          activityFeed: [],
        });
      }

      const allAttendance = students.flatMap((student) => student.attendance || []);
      const totalAttendance = allAttendance.length;
      const presentCount = allAttendance.filter((item) => item.status === "present").length;
      const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

      const paymentStatus = students
        .flatMap((student) => student.payments || [])
        .reduce((acc, payment) => {
          const state = getPaymentState(payment);
          if (state === "paid") acc.paid += 1;
          if (state === "partial") acc.partial += 1;
          if (state === "pending") acc.pending += 1;
          if (state === "overdue") acc.overdue += 1;
          return acc;
        }, { paid: 0, partial: 0, pending: 0, overdue: 0 });

      const pendingPayments = paymentStatus.pending + paymentStatus.partial + paymentStatus.overdue;

      const weekly = weeklyRange.map((range) => {
        const count = allAttendance.filter((item) => {
          const date = new Date(item.date);
          return item.status === "present" && date >= range.day && date <= range.end;
        }).length;
        return { day: range.label, students: count };
      });

      const allSubmissions = students.flatMap((student) => student.submissions || []);
      const trend = trendRange.map((range) => {
        const value = allSubmissions.filter((item) => {
          const dueAt = new Date(item.assignment?.dueAt || item.assignment?.createdAt || 0);
          return dueAt >= range.start && dueAt < range.end;
        }).length;
        return { month: range.month, value };
      });

      const riskStudents = students
        .map((student) => {
          const attendanceStats = buildAttendanceIndicator(student.attendance || []);
          return {
            id: student.id,
            name: student.name,
            course: student.course,
            absentCount: attendanceStats.absentCount,
            attendanceRate: attendanceStats.attendanceRate,
            indicator: attendanceStats.indicator,
          };
        })
        .filter((student) => student.indicator !== "SAFE")
        .sort((a, b) => b.absentCount - a.absentCount)
        .slice(0, 5);

      const classIds = [...new Set(students.flatMap((student) => student.classes.map((item) => item.classId)))];
      const studentIds = students.map((student) => student.id);
      const upcomingWindow = new Date();
      upcomingWindow.setDate(upcomingWindow.getDate() + 14);

      const upcomingEvents = await prisma.calendarEvent.findMany({
        where: {
          startAt: { gte: today, lte: upcomingWindow },
          type: { in: ["EXAM", "ASSIGNMENT_DEADLINE", "PAYMENT_DEADLINE"] },
          OR: [
            { relatedStudentId: { in: studentIds } },
            ...(classIds.length > 0 ? [{ relatedClassId: { in: classIds } }] : []),
          ],
        },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: 5,
      });

      const insights = [];
      if (riskStudents.length > 0) insights.push(`${riskStudents.length} linked students are near the absence limit`);
      if (paymentStatus.overdue > 0) insights.push(`${paymentStatus.overdue} overdue payments need follow-up`);
      if (upcomingEvents.length > 0) insights.push(`${upcomingEvents.length} upcoming deadlines in the next 14 days`);
      if (insights.length === 0) insights.push("Your linked students look on track this week");

      const notifications = [
        ...riskStudents.map((student) => ({
          type: student.indicator === "RISK" ? "danger" : "warning",
          icon: student.indicator === "RISK" ? "risk" : "warning",
          title: `${student.name} is ${student.indicator === "RISK" ? "over the absence limit" : "near the absence limit"}`,
          description: `${student.absentCount} absences recorded this semester`,
          path: "/calendar",
          createdAt: new Date().toISOString(),
        })),
        ...(paymentStatus.overdue > 0 ? [{
          type: "danger",
          icon: "payment",
          title: `${paymentStatus.overdue} overdue payments`,
          description: "Open payments to review pending balances",
          path: "/payments?status=overdue",
          createdAt: new Date().toISOString(),
        }] : []),
        ...upcomingEvents.map((event) => ({
          type: "info",
          icon: event.type === "EXAM" ? "performance" : event.type === "PAYMENT_DEADLINE" ? "payment" : "warning",
          title: event.title,
          description: `Scheduled on ${new Date(event.startAt).toLocaleDateString()}`,
          path: "/calendar",
          createdAt: event.startAt.toISOString(),
        })),
      ].slice(0, 8);

      const activityFeed = [
        ...students.flatMap((student) =>
          (student.attendance || []).slice(0, 3).map((record) => ({
            type: "attendance",
            title: "Attendance recorded",
            description: `${student.name} marked ${record.status}`,
            path: "/calendar",
            createdAt: record.date,
          }))
        ),
        ...students.flatMap((student) =>
          (student.payments || []).flatMap((payment) =>
            (payment.transactions || []).slice(0, 1).map((transaction) => ({
              type: "payment",
              title: "Payment recorded",
              description: `${student.name} paid ${transaction.amount} SAR`,
              path: "/payments",
              createdAt: transaction.date,
            }))
          )
        ),
        ...students.flatMap((student) =>
          (student.submissions || []).map((submission) => ({
            type: "assignment",
            title: "Assignment update",
            description: `${student.name} - ${submission.assignment?.title || "Assignment submission"}`,
            path: "/assignments",
            createdAt: submission.submittedAt || submission.assignment?.createdAt || new Date(),
          }))
        ),
      ]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10);

      return res.json({
        stats: {
          students: students.length,
          teachers: 0,
          attendanceRate,
          pendingPayments,
        },
        recentStudents: students.slice(0, 4).map((student) => ({
          id: student.id,
          name: student.name,
          course: student.course,
          grade: student.grade,
          status: student.status,
          joinedAt: student.joinedAt,
        })),
        weekly,
        trend,
        riskStudents,
        paymentStatus,
        gradeDistribution: [],
        insights,
        notifications,
        activityFeed,
      });
    }

    const [
      studentsCount,
      teachersCount,
      totalStudents,
      presentToday,
      recentStudents,
      payments,
      weeklyCounts,
      trendCounts,
      studentsWithAttendance,
      recentAttendance,
      recentTransactions,
      recentAssignments,
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
      prisma.student.findMany({
        select: {
          id: true,
          name: true,
          course: true,
          grade: true,
          attendance: {
            where: { date: { gte: trendRange[0].start } },
            select: { status: true },
          },
        },
      }),
      prisma.attendance.findMany({
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: 5,
        include: { student: { select: { id: true, name: true } } },
      }),
      prisma.paymentTransaction.findMany({
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: 5,
        include: { payment: { select: { id: true, student: { select: { id: true, name: true } } } } },
      }),
      prisma.assignment.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
        select: { id: true, title: true, createdAt: true },
      }),
    ]);

    const paymentStatus = payments.reduce((acc, payment) => {
      const state = getPaymentState(payment);
      if (state === "paid") acc.paid += 1;
      if (state === "partial") acc.partial += 1;
      if (state === "pending") acc.pending += 1;
      if (state === "overdue") acc.overdue += 1;
      return acc;
    }, { paid: 0, partial: 0, pending: 0, overdue: 0 });

    const pendingPayments = paymentStatus.pending + paymentStatus.partial + paymentStatus.overdue;
    const weekly = weeklyRange.map((range, index) => ({
      day: range.label,
      students: weeklyCounts[index],
    }));
    const trend = trendRange.map((range, index) => ({
      month: range.month,
      value: trendCounts[index],
    }));

    const gradeBuckets = studentsWithAttendance.reduce((acc, student) => {
      const grade = (student.grade || "Unknown").trim();
      acc[grade] = (acc[grade] || 0) + 1;
      return acc;
    }, {});

    const gradeDistribution = Object.entries(gradeBuckets).map(([grade, count]) => ({ grade, count }));

    const riskStudents = studentsWithAttendance
      .map((student) => {
        const stats = buildAttendanceIndicator(student.attendance);
        return {
          id: student.id,
          name: student.name,
          course: student.course,
          absentCount: stats.absentCount,
          attendanceRate: stats.attendanceRate,
          indicator: stats.indicator,
        };
      })
      .filter((student) => student.indicator !== "SAFE")
      .sort((a, b) => b.absentCount - a.absentCount)
      .slice(0, 5);

    const insights = [];
    if (riskStudents.length > 0) insights.push(`${riskStudents.length} students are close to the absence limit`);
    if (statsFromWeekly(weekly) < 0) insights.push("Attendance dropped compared with the previous days");
    if (paymentStatus.overdue > 0) insights.push(`${paymentStatus.overdue} overdue payments need follow-up`);
    if (insights.length === 0) insights.push("Daily operations look healthy today");

    const notifications = [
      ...riskStudents.map((student) => ({
        type: student.indicator === "RISK" ? "danger" : "warning",
        icon: student.indicator === "RISK" ? "risk" : "warning",
        title: `${student.name} is ${student.indicator === "RISK" ? "over the absence limit" : "near the absence limit"}`,
        description: `${student.absentCount} absences recorded this semester`,
        path: `/students?status=at-risk&studentId=${student.id}`,
        createdAt: new Date().toISOString(),
      })),
      ...(paymentStatus.overdue > 0 ? [{
        type: "danger",
        icon: "payment",
        title: `${paymentStatus.overdue} overdue payments need follow-up`,
        description: "Open payments to review overdue balances",
        path: "/payments?status=overdue",
        createdAt: new Date().toISOString(),
      }] : []),
      ...(statsFromWeekly(weekly) < 0 ? [{
        type: "warning",
        icon: "attendance",
        title: "Attendance dropped this week",
        description: "Review daily attendance trends and at-risk students",
        path: "/students?status=at-risk",
        createdAt: new Date().toISOString(),
      }] : []),
      ...(trend.length > 1 && trend[trend.length - 1].value < trend[trend.length - 2].value ? [{
        type: "info",
        icon: "performance",
        title: "Enrollment slowed this month",
        description: "Student registrations are down compared with last month",
        path: "/reports",
        createdAt: new Date().toISOString(),
      }] : []),
    ].slice(0, 8);

    const activityFeed = [
      ...recentStudents.map((student) => ({
        type: "student",
        title: "Student added",
        description: `${student.name} joined ${student.course}`,
        path: `/students/${student.id}`,
        createdAt: student.joinedAt,
      })),
      ...recentAttendance.map((record) => ({
        type: "attendance",
        title: "Attendance recorded",
        description: `${record.student.name} marked ${record.status}`,
        path: "/attendance",
        createdAt: record.date,
      })),
      ...recentTransactions.map((transaction) => ({
        type: "payment",
        title: "Payment received",
        description: `${transaction.payment.student.name} paid ${transaction.amount} SAR`,
        path: "/payments",
        createdAt: transaction.date,
      })),
      ...recentAssignments.map((assignment) => ({
        type: "assignment",
        title: "Assignment created",
        description: assignment.title,
        path: "/assignments",
        createdAt: assignment.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

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
      riskStudents,
      paymentStatus,
      gradeDistribution,
      insights,
      notifications,
      activityFeed,
    });
  } catch (err) {
    console.error("getDashboardOverview error:", err);
    res.status(500).json({ message: "Failed to load dashboard data" });
  }
};

function statsFromWeekly(weekly) {
  if (weekly.length < 2) return 0;
  const firstHalf = weekly.slice(0, Math.floor(weekly.length / 2)).reduce((sum, item) => sum + item.students, 0);
  const secondHalf = weekly.slice(Math.floor(weekly.length / 2)).reduce((sum, item) => sum + item.students, 0);
  return secondHalf - firstHalf;
}

module.exports = { getDashboardOverview };
