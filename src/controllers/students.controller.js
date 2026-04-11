const prisma = require("../lib/prisma");

const getAllStudents = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      orderBy: { id: "asc" },
    });
    res.json({ students });
  } catch (err) {
    console.error("getAllStudents error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const getStudentById = async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: Number(req.params.id) },
      include: { attendance: true, payments: true },
    });
    if (!student) return res.status(404).json({ message: "الطالب غير موجود" });
    res.json({ student });
  } catch (err) {
    console.error("getStudentById error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const createStudent = async (req, res) => {
  try {
    const { name, course, grade, status } = req.body;
    if (!name || !course) {
      return res.status(400).json({ message: "الاسم والكورس مطلوبان" });
    }
    const student = await prisma.student.create({
      data: { name, course, grade, status: status || "Active" },
    });
    res.status(201).json({ message: "تم إضافة الطالب", student });
  } catch (err) {
    console.error("createStudent error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const updateStudent = async (req, res) => {
  try {
    const { name, course, grade, status } = req.body;
    const student = await prisma.student.update({
      where: { id: Number(req.params.id) },
      data: { name, course, grade, status },
    });
    res.json({ message: "تم تحديث الطالب", student });
  } catch (err) {
    console.error("updateStudent error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const deleteStudent = async (req, res) => {
  try {
    await prisma.student.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "تم حذف الطالب" });
  } catch (err) {
    console.error("deleteStudent error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

module.exports = { getAllStudents, getStudentById, createStudent, updateStudent, deleteStudent };
