const prisma = require("../lib/prisma");

const getAllTeachers = async (req, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      orderBy: { id: "asc" },
    });
    res.json({ teachers });
  } catch (err) {
    console.error("getAllTeachers error:", err);
    res.status(500).json({ message: "Failed to load teachers" });
  }
};

const getTeacherById = async (req, res) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    res.json({ teacher });
  } catch (err) {
    console.error("getTeacherById error:", err);
    res.status(500).json({ message: "Failed to load teacher" });
  }
};

const createTeacher = async (req, res) => {
  try {
    const { name, subject, phone, classes } = req.body;

    if (!name || !subject) {
      return res.status(400).json({ message: "name and subject are required" });
    }

    const teacher = await prisma.teacher.create({
      data: {
        name,
        subject,
        phone: phone || null,
        classes: Number.isFinite(Number(classes)) ? Number(classes) : 0,
      },
    });

    res.status(201).json({ message: "Teacher created successfully", teacher });
  } catch (err) {
    console.error("createTeacher error:", err);
    res.status(500).json({ message: "Failed to create teacher" });
  }
};

const updateTeacher = async (req, res) => {
  try {
    const teacherId = Number(req.params.id);
    const { name, subject, phone, classes } = req.body;

    const existing = await prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!existing) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (subject !== undefined) data.subject = subject;
    if (phone !== undefined) data.phone = phone;
    if (classes !== undefined) data.classes = Number(classes);

    const teacher = await prisma.teacher.update({
      where: { id: teacherId },
      data,
    });

    res.json({ message: "Teacher updated successfully", teacher });
  } catch (err) {
    console.error("updateTeacher error:", err);
    res.status(500).json({ message: "Failed to update teacher" });
  }
};

const deleteTeacher = async (req, res) => {
  try {
    const teacherId = Number(req.params.id);
    await prisma.teacher.delete({ where: { id: teacherId } });
    res.json({ message: "Teacher deleted successfully" });
  } catch (err) {
    console.error("deleteTeacher error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Teacher not found" });
    }
    res.status(500).json({ message: "Failed to delete teacher" });
  }
};

module.exports = { getAllTeachers, getTeacherById, createTeacher, updateTeacher, deleteTeacher };
