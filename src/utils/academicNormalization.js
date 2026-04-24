const normalizeSpaces = (value) => String(value || "").replace(/\s+/g, " ").trim();

const canonicalizeAcademicLabel = (value) => {
  const normalized = normalizeSpaces(value);
  if (!normalized) return "";

  const compact = normalized.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (/^sof?t?war(e)?( requirements?)?$/.test(compact) || /^software requirements?$/.test(compact)) {
    return "Software Requirements";
  }
  if (/^front ?end$/.test(compact) || /^frontend$/.test(compact)) {
    return "Front End";
  }
  if (/^database$/.test(compact)) {
    return "Database";
  }
  if (/^math$/.test(compact) || /^mathematics$/.test(compact)) {
    return "Math";
  }

  return normalized;
};

const canonicalizeSubjectCode = (value, subjectName, fallback = "SUBJECT") => {
  const canonicalName = canonicalizeAcademicLabel(subjectName);
  const normalizedFromValue = normalizeSpaces(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (canonicalName === "Software Requirements") {
    if (!normalizedFromValue || /^(COURSE-)?SOF?TWAR(E)?$/.test(normalizedFromValue) || /^(COURSE-)?SOFTWARE$/.test(normalizedFromValue)) {
      return "COURSE-SOFTWARE-REQUIREMENTS";
    }
  }

  if (normalizedFromValue) {
    return normalizedFromValue.slice(0, 40);
  }

  const autoCode = `COURSE-${canonicalName || fallback}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return autoCode.slice(0, 40) || `COURSE-${fallback}`;
};

module.exports = {
  canonicalizeAcademicLabel,
  canonicalizeSubjectCode,
  normalizeSpaces,
};
