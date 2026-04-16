const prisma = require("../lib/prisma");

const getAllStudents = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      orderBy: { id: "asc" },
    });
    res.json({ students });
  } catch (err) {
    console.error("getAllStudents error:", err);
    res.status(500).json({ message: "Failed to load students" });
  }
};

const getStudentById = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        attendance: { orderBy: { date: "desc" } },
        payments: {
          include: { transactions: { orderBy: { date: "desc" } } },
          orderBy: { date: "desc" },
        },
      },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({ student });
  } catch (err) {
    console.error("getStudentById error:", err);
    res.status(500).json({ message: "Failed to load student" });
  }
};

const createStudent = async (req, res) => {
  try {
    const { name, course, grade, status } = req.body;

    if (!name || !course) {
      return res.status(400).json({ message: "name and course are required" });
    }

    const student = await prisma.student.create({
      data: { name, course, grade: grade || null, status: status || "Active" },
    });

    res.status(201).json({ message: "Student created successfully", student });
  } catch (err) {
    console.error("createStudent error:", err);
    res.status(500).json({ message: "Failed to create student" });
  }
};

const updateStudent = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const { name, course, grade, status } = req.body;

    const existing = await prisma.student.findUnique({ where: { id: studentId } });
    if (!existing) {
      return res.status(404).json({ message: "Student not found" });
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (course !== undefined) data.course = course;
    if (grade !== undefined) data.grade = grade;
    if (status !== undefined) data.status = status;

    const student = await prisma.student.update({
      where: { id: studentId },
      data,
    });

    res.json({ message: "Student updated successfully", student });
  } catch (err) {
    console.error("updateStudent error:", err);
    res.status(500).json({ message: "Failed to update student" });
  }
};

const deleteStudent = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const existing = await prisma.student.findUnique({ where: { id: studentId } });

    if (!existing) {
      return res.status(404).json({ message: "Student not found" });
    }

    await prisma.$transaction(async (tx) => {
      const payments = await tx.payment.findMany({
        where: { studentId },
        select: { id: true },
      });

      if (payments.length > 0) {
        await tx.paymentTransaction.deleteMany({
          where: { paymentId: { in: payments.map((payment) => payment.id) } },
        });
      }

      await tx.attendance.deleteMany({ where: { studentId } });
      await tx.payment.deleteMany({ where: { studentId } });
      await tx.student.delete({ where: { id: studentId } });
    });

    res.json({ message: "Student deleted successfully" });
  } catch (err) {
    console.error("deleteStudent error:", err);
    res.status(500).json({ message: "Failed to delete student" });
  }
};

module.exports = { getAllStudents, getStudentById, createStudent, updateStudent, deleteStudent };
