require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");
const twilio = require("twilio");

// ================= 1. الإعدادات الأساسية =================
const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const SECRET_KEY = process.env.SECRET_KEY;
const DEVICE_SECRET = process.env.DEVICE_SECRET;
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ================= 2. Middlewares (الحماية والترتيب) =================
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false, // لضمان عمل الـ Socket.io والـ Frontend بسلاسة
}));
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// تعديل الـ Rate Limit لضمان عدم حجب الأردوينو (Cyber-Physical Reliability)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, 
  skip: (req) => req.path === "/api/sensor" // استثناء الأردوينو من الحظر
});
app.use(limiter);

// ================= 3. قاعدة البيانات والموديلات =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  name: String,
  role: { type: String, default: "nurse" },
  phone: { type: String, unique: true },
  otp: String,
  otpExpires: Date
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const Log = mongoose.model("Log", new mongoose.Schema({
  action: String,
  performedBy: String,
  target: String,
  ip: String
}, { timestamps: true }));

const patientSchema = new mongoose.Schema({
  name: String,
  patientId: String, // ID المريض الفريد (Timestamp)
  room: String,      // رقم السرير (المستخدم للربط مع الأردوينو)
  fluid: String,
  totalML: Number,
  remainingML: Number,
  percentage: Number,
  status: String,
  nurse: String
}, { timestamps: true });

patientSchema.index({ room: 1 }, { unique: true });
const Patient = mongoose.model("Patient", patientSchema);

// ================= 4. الدوال المساعدة =================
function validatePassword(password) {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return regex.test(password);
}

async function addLog(action, details = {}) {
  try { await Log.create({ action, ...details }); } 
  catch (err) { console.error("❌ Log error:", err); }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "Admins only" });
  next();
}

// ================= 5. المسارات (Routes) =================

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));

// --- Auth & OTP ---
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ success: false });

  const token = jwt.sign({ username: user.username, name: user.name, role: user.role || "nurse" }, SECRET_KEY, { expiresIn: "2h" });
  await addLog("LOGIN", { performedBy: user.username, ip: req.ip });
  res.json({ success: true, token, name: user.name, role: user.role });
});

app.post("/api/send-otp", async (req, res) => {
  const { username } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ message: "User not found" });
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + 5 * 60 * 1000);
  await user.save();
  try {
    await client.messages.create({ from: "whatsapp:+14155238886", to: `whatsapp:${user.phone}`, body: `Your Smart IV OTP code is: ${otp}` });
    res.json({ message: "OTP sent" });
  } catch (err) { res.status(500).json({ message: "Failed to send OTP" }); }
});

// --- Patient Management ---
app.post("/api/patients", authenticateToken, async (req, res) => {
  try {
    const bed = req.body.bed?.trim();
    if (!req.body.name?.trim() || !bed || isNaN(Number(req.body.totalML))) return res.status(400).json({ message: "Invalid fields" });
    const existing = await Patient.findOne({ room: bed });
    if (existing) return res.status(400).json({ message: "Bed occupied" });

    const newPatient = await Patient.create({
      name: req.body.name.trim(),
      patientId: Date.now().toString(),
      room: bed,
      fluid: req.body.fluid || "",
      totalML: Number(req.body.totalML),
      remainingML: Number(req.body.totalML),
      percentage: 100,
      status: "Running",
      nurse: req.user.username
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/patients", authenticateToken, async (req, res) => {
  const patients = await Patient.find({ nurse: req.user.username }).sort({ createdAt: -1 });
  res.json(patients);
});

// 🔥 SENSOR UPDATE (الجوهرة)
app.post("/api/sensor", async (req, res) => {
  if (req.headers["x-device-key"] !== DEVICE_SECRET) return res.status(403).json({ message: "Unauthorized device" });
  try {
    const { patientId, weight } = req.body; // هنا الـ patientId هو رقم السرير من الأردوينو
    const patient = await Patient.findOne({ room: patientId }); 

    if (!patient) return res.status(404).json({ success: false, message: "Bed not found" });

    patient.remainingML = Number(weight);
    patient.percentage = Math.round((patient.remainingML / patient.totalML) * 100);
    
    if (patient.percentage <= 0) patient.status = "Finished";
    else if (patient.percentage <= 10) patient.status = "Critical";
    else patient.status = "Running";

    await patient.save();

    // بث التحديث للـ Dashboard فوراً
    io.emit("patientUpdated", {
      patientId: patient.patientId,
      remainingML: patient.remainingML,
      percentage: patient.percentage,
      status: patient.status
    });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// فحص حالة الصمام للأردوينو
app.get("/api/hardware/status/:room", async (req, res) => {
  try {
    const patient = await Patient.findOne({ room: req.params.room });
    if (!patient) return res.send("0");
    res.send(patient.status === "Running" || patient.status === "Low" ? "1" : "0");
  } catch (err) { res.send("0"); }
});

// --- Admin Routes ---
app.get("/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  const users = await User.find({}, "-password");
  res.json(users);
});

// ================= 6. تشغيل السيرفر =================
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);
});

server.listen(PORT, () => {
  console.log(`🚀 Smart IV Server Running on port ${PORT}`);
  console.log("🔥 LOGIC: Bed-to-Arduino Sync Active");
});