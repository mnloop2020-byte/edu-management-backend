const prisma = require("../lib/prisma");

const getSettings = async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const result = {};
    settings.forEach(s => { result[s.key] = s.value; });
    res.json({ settings: result });
  } catch (err) {
    console.error("getSettings error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const updateSetting = async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "غير مصرح — للمدير فقط" });
    }

    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ message: "key و value مطلوبان" });
    }

    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });

    res.json({ message: "تم تحديث الإعداد", setting });
  } catch (err) {
    console.error("updateSetting error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

module.exports = { getSettings, updateSetting };