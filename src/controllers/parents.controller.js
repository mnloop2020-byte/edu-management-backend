const prisma = require("../lib/prisma");
const { getStudentAcademicProfile } = require("../services/academic.service");
const { createAuditLog } = require("../services/audit.service");

const listParents = async (_req, res) => {
  try {
    const parents = await prisma.parentProfile.findMany({
      include: {
        studentLinks: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                status: true,
                course: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ parents });
  } catch (error) {
    console.error("listParents error:", error);
    res.status(500).json({ message: "Failed to load parents" });
  }
};

const createParent = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Parent name is required" });
    }

    const parent = await prisma.parentProfile.create({
      data: {
        name: String(name).trim(),
        email: email ? String(email).trim() : null,
        phone: phone ? String(phone).trim() : null,
      },
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "PARENT_CREATE",
      entityType: "ParentProfile",
      entityId: parent.id,
      summary: `Created parent profile for ${parent.name}`,
    });

    res.status(201).json({ message: "Parent created successfully", parent });
  } catch (error) {
    console.error("createParent error:", error);
    res.status(500).json({ message: "Failed to create parent" });
  }
};

const linkParentToStudent = async (req, res) => {
  try {
    const parentId = Number(req.params.id);
    const studentId = Number(req.body.studentId);
    const relationType = String(req.body.relationType || "Guardian").trim();

    if (!parentId || !studentId) {
      return res.status(400).json({ message: "parentId and studentId are required" });
    }

    const link = await prisma.parentStudentLink.create({
      data: {
        parentId,
        studentId,
        relationType,
      },
      include: {
        parent: true,
        student: true,
      },
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "PARENT_LINK_STUDENT",
      entityType: "ParentStudentLink",
      entityId: link.id,
      summary: `Linked ${link.parent.name} to student ${link.student.name}`,
      metadata: { relationType },
    });

    res.status(201).json({ message: "Parent linked to student successfully", link });
  } catch (error) {
    console.error("linkParentToStudent error:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ message: "Parent is already linked to this student" });
    }
    res.status(500).json({ message: "Failed to link parent to student" });
  }
};

const getParentOverview = async (req, res) => {
  try {
    const parentId = Number(req.params.id);
    const parent = await prisma.parentProfile.findUnique({
      where: { id: parentId },
      include: {
        studentLinks: {
          include: {
            student: {
              include: {
                attendance: {
                  orderBy: { date: "desc" },
                  take: 12,
                },
                payments: {
                  orderBy: { date: "desc" },
                },
              },
            },
          },
        },
        communications: {
          orderBy: { createdAt: "desc" },
          take: 12,
        },
      },
    });

    if (!parent) {
      return res.status(404).json({ message: "Parent not found" });
    }

    const students = await Promise.all(
      parent.studentLinks.map(async (link) => {
        const academic = await getStudentAcademicProfile(link.student.id, { ensureLegacySync: true });
        const attendance = link.student.attendance || [];
        const presentCount = attendance.filter((item) => item.status === "present").length;
        const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 10000) / 100 : 0;
        const outstanding = (link.student.payments || []).reduce((sum, payment) => sum + Math.max(0, payment.totalAmount - payment.paidAmount), 0);

        return {
          relationType: link.relationType,
          student: {
            id: link.student.id,
            name: link.student.name,
            status: link.student.status,
            course: link.student.course,
          },
          academicSummary: academic.summary,
          subjects: academic.subjects,
          attendanceRate,
          outstanding,
        };
      })
    );

    res.json({
      parent: {
        id: parent.id,
        name: parent.name,
        email: parent.email,
        phone: parent.phone,
      },
      students,
      communications: parent.communications,
    });
  } catch (error) {
    console.error("getParentOverview error:", error);
    res.status(500).json({ message: "Failed to load parent overview" });
  }
};

module.exports = {
  createParent,
  getParentOverview,
  linkParentToStudent,
  listParents,
};
