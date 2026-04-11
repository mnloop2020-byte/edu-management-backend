const prisma = require("../lib/prisma");

const getAllTeachers = async (req, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      orderBy: { id: "asc" },
    });
    res.json({ teachers });
  } catch (err) {
    console.error("getAllTeachers error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const getTeacherById = async (req, res) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!teacher) return res.status(404).json({ message: "المدرس غير موجود" });
    res.json({ teacher });
  } catch (err) {
    console.error("getTeacherById error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const createTeacher = async (req, res) => {
  try {
    const { name, subject, phone, classes } = req.body;
    if (!name || !subject) {
      return res.status(400).json({ message: "الاسم والمادة مطلوبان" });
    }
    const teacher = await prisma.teacher.create({
      data: { name, subject, phone, classes: classes || 0 },
    });
    res.status(201).json({ message: "تم إضافة المدرس", teacher });
  } catch (err) {
    console.error("createTeacher error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const updateTeacher = async (req, res) => {
  try {
    const { name, subject, phone, classes } = req.body;
    const teacher = await prisma.teacher.update({
      where: { id: Number(req.params.id) },
      data: { name, subject, phone, classes },
    });
    res.json({ message: "تم تحديث المدرس", teacher });
  } catch (err) {
    console.error("updateTeacher error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const deleteTeacher = async (req, res) => {
  try {
    await prisma.teacher.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "تم حذف المدرس" });
  } catch (err) {
    console.error("deleteTeacher error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

module.exports = { getAllTeachers, getTeacherById, createTeacher, updateTeacher, deleteTeacher };
