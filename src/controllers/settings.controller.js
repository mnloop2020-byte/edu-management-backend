const prisma = require("../lib/prisma");

const getSettings = async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const result = {};

    settings.forEach((setting) => {
      result[setting.key] = setting.value;
    });

    res.json({ settings: result });
  } catch (err) {
    console.error("getSettings error:", err);
    res.status(500).json({ message: "Failed to load settings" });
  }
};

const updateSetting = async (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ message: "key and value are required" });
    }

    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });

    res.json({ message: "Setting updated successfully", setting });
  } catch (err) {
    console.error("updateSetting error:", err);
    res.status(500).json({ message: "Failed to update setting" });
  }
};

module.exports = { getSettings, updateSetting };
