const prisma = require("../lib/prisma");
const { createAuditLog } = require("../services/audit.service");
const { canonicalizeAcademicLabel } = require("../utils/academicNormalization");

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
    const { name, subject, phone, avatarUrl, classes } = req.body;
    const normalizedName = String(name || "").trim();
    const normalizedSubject = canonicalizeAcademicLabel(subject);

    if (!normalizedName || !normalizedSubject) {
      return res.status(400).json({ message: "name and subject are required" });
    }

    const teacher = await prisma.teacher.create({
      data: {
        name: normalizedName,
        subject: normalizedSubject,
        phone: phone || null,
        avatarUrl: avatarUrl || null,
        classes: Number.isFinite(Number(classes)) ? Number(classes) : 0,
      },
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "TEACHER_CREATE",
      entityType: "Teacher",
      entityId: teacher.id,
      summary: `Created teacher ${teacher.name}`,
      metadata: { subject: teacher.subject },
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
    const { name, subject, phone, avatarUrl, classes } = req.body;
    const normalizedName = name !== undefined ? String(name || "").trim() : undefined;
    const normalizedSubject = subject !== undefined ? canonicalizeAcademicLabel(subject) : undefined;

    const existing = await prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!existing) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const data = {};
    if (name !== undefined && !normalizedName) {
      return res.status(400).json({ message: "name cannot be empty" });
    }
    if (subject !== undefined && !normalizedSubject) {
      return res.status(400).json({ message: "subject cannot be empty" });
    }

    if (normalizedName !== undefined) data.name = normalizedName;
    if (normalizedSubject !== undefined) data.subject = normalizedSubject;
    if (phone !== undefined) data.phone = phone;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl || null;
    if (classes !== undefined) data.classes = Number(classes);

    const teacher = await prisma.teacher.update({
      where: { id: teacherId },
      data,
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "TEACHER_UPDATE",
      entityType: "Teacher",
      entityId: teacher.id,
      summary: `Updated teacher ${teacher.name}`,
      metadata: data,
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
    const deleted = await prisma.teacher.delete({ where: { id: teacherId } });
    await createAuditLog({
      actorUserId: req.user?.id,
      action: "TEACHER_DELETE",
      entityType: "Teacher",
      entityId: teacherId,
      summary: `Deleted teacher ${deleted.name}`,
    });
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
