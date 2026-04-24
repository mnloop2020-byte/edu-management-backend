const prisma = require("../lib/prisma");
const { createAuditLog } = require("../services/audit.service");

const TEMPLATE_VAR_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const validAudience = new Set(["ALL", "STUDENT", "TEACHER", "PARENT"]);
const validChannels = new Set(["IN_APP", "EMAIL", "SMS"]);
const validStatuses = new Set(["DRAFT", "SENT", "SCHEDULED"]);
const validTemplateStatuses = new Set(["ACTIVE", "ARCHIVED"]);
const defaultTemplateLibrary = [
  {
    name: "Attendance Warning",
    description: "Notify parent when a student is approaching or exceeding absence threshold.",
    audienceType: "PARENT",
    channel: "IN_APP",
    status: "ACTIVE",
    subjectTemplate: "Attendance Alert for {{student_name}}",
    bodyTemplate:
      "Dear {{parent_name}}, student {{student_name}} has attendance risk status. Please review and follow up. Date: {{today_date}}.",
  },
  {
    name: "Payment Overdue Reminder",
    description: "Reminder for overdue payment balance.",
    audienceType: "PARENT",
    channel: "IN_APP",
    status: "ACTIVE",
    subjectTemplate: "Payment Reminder for {{student_name}}",
    bodyTemplate:
      "Dear {{parent_name}}, outstanding balance for {{student_name}} is {{amount}} and due on {{due_date}}. Please settle at your earliest convenience.",
  },
  {
    name: "Upcoming Exam Notice",
    description: "Notify students about upcoming exams.",
    audienceType: "STUDENT",
    channel: "IN_APP",
    status: "ACTIVE",
    subjectTemplate: "Upcoming Exam: {{subject_name}}",
    bodyTemplate:
      "Hello {{student_name}}, your {{subject_name}} exam is scheduled for {{exam_date}}. Please be prepared and arrive on time.",
  },
  {
    name: "Academic Excellence",
    description: "Congratulate top-performing students.",
    audienceType: "STUDENT",
    channel: "IN_APP",
    status: "ACTIVE",
    subjectTemplate: "Excellent Performance, {{student_name}}",
    bodyTemplate:
      "Congratulations {{student_name}}. Your recent performance is outstanding. Keep the momentum going.",
  },
];

const extractTemplateKeys = (content = "") => {
  const keys = new Set();
  content.replace(TEMPLATE_VAR_REGEX, (_full, key) => {
    keys.add(String(key));
    return _full;
  });
  return [...keys];
};

const renderTemplateContent = (content, variables) => {
  const missingKeys = new Set();
  const rendered = String(content || "").replace(TEMPLATE_VAR_REGEX, (_full, key) => {
    const value = variables[key];
    if (value === undefined || value === null || value === "") {
      missingKeys.add(String(key));
      return "";
    }
    return String(value);
  });
  return { rendered, missingKeys: [...missingKeys] };
};

const buildAutoVariables = async (payload = {}) => {
  const variables = {
    today_date: new Date().toISOString().slice(0, 10),
    ...((payload.variables && typeof payload.variables === "object") ? payload.variables : {}),
  };

  const studentId = payload.recipientStudentId ? Number(payload.recipientStudentId) : null;
  const teacherId = payload.recipientTeacherId ? Number(payload.recipientTeacherId) : null;
  const parentId = payload.recipientParentId ? Number(payload.recipientParentId) : null;

  const [student, teacher, parent] = await Promise.all([
    studentId
      ? prisma.student.findUnique({
          where: { id: studentId },
          select: { id: true, name: true, course: true, status: true },
        })
      : null,
    teacherId
      ? prisma.teacher.findUnique({
          where: { id: teacherId },
          select: { id: true, name: true, subject: true },
        })
      : null,
    parentId
      ? prisma.parentProfile.findUnique({
          where: { id: parentId },
          include: {
            studentLinks: {
              include: {
                student: {
                  select: { name: true },
                },
              },
            },
          },
        })
      : null,
  ]);

  if (student) {
    variables.student_name = student.name;
    variables.student_course = student.course;
    variables.student_status = student.status;
  }

  if (teacher) {
    variables.teacher_name = teacher.name;
    variables.teacher_subject = teacher.subject;
  }

  if (parent) {
    variables.parent_name = parent.name;
    variables.parent_email = parent.email || "";
    variables.parent_phone = parent.phone || "";
    variables.children_names = (parent.studentLinks || []).map((link) => link.student?.name).filter(Boolean).join(", ");
  }

  return variables;
};

const normalizeCommunicationPayload = (payload = {}) => {
  const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
  const fallbackStatus = scheduledAt ? "SCHEDULED" : "SENT";
  const normalized = {
    subject: payload.subject ? String(payload.subject).trim() : "",
    body: payload.body ? String(payload.body).trim() : "",
    audienceType: String(payload.audienceType || "").trim().toUpperCase(),
    channel: String(payload.channel || "IN_APP").trim().toUpperCase(),
    status: String(payload.status || fallbackStatus).trim().toUpperCase(),
    recipientStudentId: payload.recipientStudentId ? Number(payload.recipientStudentId) : null,
    recipientTeacherId: payload.recipientTeacherId ? Number(payload.recipientTeacherId) : null,
    recipientParentId: payload.recipientParentId ? Number(payload.recipientParentId) : null,
    scheduledAt,
    templateId: payload.templateId ? Number(payload.templateId) : null,
    variables: payload.variables && typeof payload.variables === "object" ? payload.variables : {},
  };

  if (!validAudience.has(normalized.audienceType)) {
    throw Object.assign(new Error("Unsupported audienceType"), { status: 400 });
  }
  if (!validChannels.has(normalized.channel)) {
    throw Object.assign(new Error("Unsupported channel"), { status: 400 });
  }
  if (!validStatuses.has(normalized.status)) {
    throw Object.assign(new Error("Unsupported status"), { status: 400 });
  }
  if (normalized.scheduledAt && Number.isNaN(normalized.scheduledAt.getTime())) {
    throw Object.assign(new Error("Invalid scheduledAt"), { status: 400 });
  }
  if (normalized.status === "SCHEDULED" && !normalized.scheduledAt) {
    throw Object.assign(new Error("scheduledAt is required when status is SCHEDULED"), { status: 400 });
  }

  return normalized;
};

const validateRecipientForAudience = (payload) => {
  if (payload.audienceType === "STUDENT" && !payload.recipientStudentId) {
    throw Object.assign(new Error("recipientStudentId is required for STUDENT audience"), { status: 400 });
  }
  if (payload.audienceType === "TEACHER" && !payload.recipientTeacherId) {
    throw Object.assign(new Error("recipientTeacherId is required for TEACHER audience"), { status: 400 });
  }
  if (payload.audienceType === "PARENT" && !payload.recipientParentId) {
    throw Object.assign(new Error("recipientParentId is required for PARENT audience"), { status: 400 });
  }
};

const getStudentProfileId = async (userId) => {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });
  return student?.id || null;
};

const getTeacherProfileId = async (userId) => {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  });
  return teacher?.id || null;
};

const getParentProfileId = async (userId) => {
  const parent = await prisma.parentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return parent?.id || null;
};

const listCommunications = async (req, res) => {
  try {
    const where = {};

    if (req.user.role === "STUDENT") {
      const studentId = await getStudentProfileId(req.user.id);
      if (!studentId) {
        return res.json({ messages: [] });
      }

      where.status = { in: ["SENT", "SCHEDULED"] };
      where.OR = [
        { audienceType: "ALL" },
        {
          audienceType: "STUDENT",
          OR: [{ recipientStudentId: null }, { recipientStudentId: studentId }],
        },
      ];
    } else if (req.user.role === "TEACHER") {
      const teacherId = await getTeacherProfileId(req.user.id);
      where.OR = [
        { createdById: req.user.id },
        { audienceType: "ALL", status: { in: ["SENT", "SCHEDULED"] } },
      ];

      if (teacherId) {
        where.OR.push({
          audienceType: "TEACHER",
          status: { in: ["SENT", "SCHEDULED"] },
          OR: [{ recipientTeacherId: null }, { recipientTeacherId: teacherId }],
        });
      }
    } else if (req.user.role === "PARENT") {
      const parentId = await getParentProfileId(req.user.id);
      if (!parentId) {
        return res.json({ messages: [] });
      }

      where.status = { in: ["SENT", "SCHEDULED"] };
      where.OR = [
        { audienceType: "ALL" },
        {
          audienceType: "PARENT",
          OR: [{ recipientParentId: null }, { recipientParentId: parentId }],
        },
      ];
    }

    const messages = await prisma.communicationMessage.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        template: { select: { id: true, name: true } },
        recipientStudent: { select: { id: true, name: true } },
        recipientTeacher: { select: { id: true, name: true } },
        recipientParent: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    res.json({ messages });
  } catch (error) {
    console.error("listCommunications error:", error);
    res.status(500).json({ message: "Failed to load communications" });
  }
};

const listTemplates = async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).trim().toUpperCase() : null;
    const where = {};
    if (status) where.status = status;

    const templates = await prisma.communicationTemplate.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    res.json({
      templates: templates.map((template) => ({
        ...template,
        variables: [...new Set([
          ...extractTemplateKeys(template.subjectTemplate),
          ...extractTemplateKeys(template.bodyTemplate),
        ])],
      })),
    });
  } catch (error) {
    console.error("listTemplates error:", error);
    res.status(500).json({ message: "Failed to load communication templates" });
  }
};

const seedDefaultTemplates = async (req, res) => {
  try {
    let created = 0;
    let skipped = 0;

    for (const template of defaultTemplateLibrary) {
      const existing = await prisma.communicationTemplate.findFirst({
        where: {
          name: template.name,
          audienceType: template.audienceType,
          channel: template.channel,
        },
      });

      if (existing) {
        skipped += 1;
        continue;
      }

      await prisma.communicationTemplate.create({
        data: {
          ...template,
          createdById: req.user?.id || null,
        },
      });
      created += 1;
    }

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "COMMUNICATION_TEMPLATE_SEED",
      entityType: "CommunicationTemplate",
      summary: "Seeded default communication templates",
      metadata: { created, skipped },
    });

    res.json({
      message: "Default templates seeded successfully",
      result: { created, skipped, total: defaultTemplateLibrary.length },
    });
  } catch (error) {
    console.error("seedDefaultTemplates error:", error);
    res.status(500).json({ message: "Failed to seed default templates" });
  }
};

const createTemplate = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const description = req.body.description ? String(req.body.description).trim() : null;
    const audienceType = String(req.body.audienceType || "").trim().toUpperCase();
    const channel = String(req.body.channel || "IN_APP").trim().toUpperCase();
    const subjectTemplate = String(req.body.subjectTemplate || "").trim();
    const bodyTemplate = String(req.body.bodyTemplate || "").trim();
    const status = String(req.body.status || "ACTIVE").trim().toUpperCase();

    if (!name || !subjectTemplate || !bodyTemplate || !validAudience.has(audienceType) || !validChannels.has(channel) || !validTemplateStatuses.has(status)) {
      return res.status(400).json({ message: "name, audienceType, channel, subjectTemplate, and bodyTemplate are required" });
    }

    const template = await prisma.communicationTemplate.create({
      data: {
        name,
        description,
        audienceType,
        channel,
        status,
        subjectTemplate,
        bodyTemplate,
        createdById: req.user?.id || null,
      },
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "COMMUNICATION_TEMPLATE_CREATE",
      entityType: "CommunicationTemplate",
      entityId: template.id,
      summary: `Created communication template "${template.name}"`,
      metadata: { audienceType, channel, status },
    });

    res.status(201).json({
      message: "Template created successfully",
      template: {
        ...template,
        variables: [...new Set([
          ...extractTemplateKeys(template.subjectTemplate),
          ...extractTemplateKeys(template.bodyTemplate),
        ])],
      },
    });
  } catch (error) {
    console.error("createTemplate error:", error);
    res.status(500).json({ message: "Failed to create communication template" });
  }
};

const updateTemplate = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = {};

    if (req.body.name !== undefined) data.name = String(req.body.name).trim();
    if (req.body.description !== undefined) data.description = req.body.description ? String(req.body.description).trim() : null;
    if (req.body.audienceType !== undefined) {
      const audienceType = String(req.body.audienceType).trim().toUpperCase();
      if (!validAudience.has(audienceType)) return res.status(400).json({ message: "Unsupported audienceType" });
      data.audienceType = audienceType;
    }
    if (req.body.channel !== undefined) {
      const channel = String(req.body.channel).trim().toUpperCase();
      if (!validChannels.has(channel)) return res.status(400).json({ message: "Unsupported channel" });
      data.channel = channel;
    }
    if (req.body.status !== undefined) {
      const status = String(req.body.status).trim().toUpperCase();
      if (!validTemplateStatuses.has(status)) return res.status(400).json({ message: "Unsupported template status" });
      data.status = status;
    }
    if (req.body.subjectTemplate !== undefined) data.subjectTemplate = String(req.body.subjectTemplate).trim();
    if (req.body.bodyTemplate !== undefined) data.bodyTemplate = String(req.body.bodyTemplate).trim();

    const template = await prisma.communicationTemplate.update({
      where: { id },
      data,
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "COMMUNICATION_TEMPLATE_UPDATE",
      entityType: "CommunicationTemplate",
      entityId: template.id,
      summary: `Updated communication template "${template.name}"`,
      metadata: data,
    });

    res.json({
      message: "Template updated successfully",
      template: {
        ...template,
        variables: [...new Set([
          ...extractTemplateKeys(template.subjectTemplate),
          ...extractTemplateKeys(template.bodyTemplate),
        ])],
      },
    });
  } catch (error) {
    console.error("updateTemplate error:", error);
    if (error.code === "P2025") return res.status(404).json({ message: "Template not found" });
    res.status(500).json({ message: "Failed to update communication template" });
  }
};

const renderTemplate = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const template = await prisma.communicationTemplate.findUnique({ where: { id } });
    if (!template) return res.status(404).json({ message: "Template not found" });

    const payload = normalizeCommunicationPayload({
      ...req.body,
      audienceType: req.body.audienceType || template.audienceType,
      channel: req.body.channel || template.channel,
      status: req.body.status || "DRAFT",
    });

    const variables = await buildAutoVariables(payload);
    const subjectRender = renderTemplateContent(template.subjectTemplate, variables);
    const bodyRender = renderTemplateContent(template.bodyTemplate, variables);

    res.json({
      rendered: {
        subject: subjectRender.rendered,
        body: bodyRender.rendered,
      },
      variables,
      missingVariables: [...new Set([...subjectRender.missingKeys, ...bodyRender.missingKeys])],
      template: {
        id: template.id,
        name: template.name,
        audienceType: template.audienceType,
        channel: template.channel,
      },
    });
  } catch (error) {
    console.error("renderTemplate error:", error);
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Failed to render template" });
  }
};

const createCommunication = async (req, res) => {
  try {
    const payload = normalizeCommunicationPayload(req.body);

    let renderedSubject = payload.subject;
    let renderedBody = payload.body;
    let template = null;
    let missingVariables = [];

    if (payload.templateId) {
      template = await prisma.communicationTemplate.findUnique({ where: { id: payload.templateId } });
      if (!template) return res.status(404).json({ message: "Template not found" });

      const hasAudienceOverride = req.body.audienceType !== undefined && req.body.audienceType !== null && String(req.body.audienceType).trim() !== "";
      const hasChannelOverride = req.body.channel !== undefined && req.body.channel !== null && String(req.body.channel).trim() !== "";
      const resolvedAudience = hasAudienceOverride ? payload.audienceType : template.audienceType;
      const resolvedChannel = hasChannelOverride ? payload.channel : template.channel;
      const variables = await buildAutoVariables({ ...payload, audienceType: resolvedAudience });
      const subjectRender = renderTemplateContent(template.subjectTemplate, variables);
      const bodyRender = renderTemplateContent(template.bodyTemplate, variables);

      renderedSubject = subjectRender.rendered;
      renderedBody = bodyRender.rendered;
      missingVariables = [...new Set([...subjectRender.missingKeys, ...bodyRender.missingKeys])];

      if (!renderedSubject || !renderedBody) {
        return res.status(422).json({ message: "Template rendering produced empty content", missingVariables });
      }

      payload.audienceType = resolvedAudience;
      payload.channel = resolvedChannel;
    }

    validateRecipientForAudience(payload);

    if (!renderedSubject || !renderedBody || !payload.audienceType) {
      return res.status(400).json({ message: "subject, body, and audienceType are required" });
    }

    const message = await prisma.communicationMessage.create({
      data: {
        subject: renderedSubject,
        body: renderedBody,
        audienceType: payload.audienceType,
        channel: payload.channel,
        status: payload.status,
        createdById: req.user?.id || null,
        templateId: template?.id || null,
        recipientStudentId: payload.recipientStudentId,
        recipientTeacherId: payload.recipientTeacherId,
        recipientParentId: payload.recipientParentId,
        scheduledAt: payload.scheduledAt,
        sentAt: payload.status === "SENT" ? new Date() : null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        template: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "COMMUNICATION_CREATE",
      entityType: "CommunicationMessage",
      entityId: message.id,
      summary: `Created communication "${message.subject}"`,
      metadata: {
        audienceType: message.audienceType,
        channel: message.channel,
        status: message.status,
        templateId: message.templateId,
        missingVariables,
      },
    });

    res.status(201).json({ message: "Communication created successfully", communication: message, missingVariables });
  } catch (error) {
    console.error("createCommunication error:", error);
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Failed to create communication" });
  }
};

const updateCommunicationStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || "").trim().toUpperCase();

    if (!validStatuses.has(status)) {
      return res.status(400).json({ message: "Unsupported status" });
    }

    const communication = await prisma.communicationMessage.update({
      where: { id },
      data: {
        status,
        sentAt: status === "SENT" ? new Date() : null,
      },
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "COMMUNICATION_STATUS_UPDATE",
      entityType: "CommunicationMessage",
      entityId: communication.id,
      summary: `Updated communication "${communication.subject}" to ${status}`,
      metadata: { status },
    });

    res.json({ message: "Communication status updated successfully", communication });
  } catch (error) {
    console.error("updateCommunicationStatus error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Communication not found" });
    }
    res.status(500).json({ message: "Failed to update communication status" });
  }
};

module.exports = {
  createCommunication,
  createTemplate,
  listCommunications,
  listTemplates,
  renderTemplate,
  seedDefaultTemplates,
  updateCommunicationStatus,
  updateTemplate,
};
