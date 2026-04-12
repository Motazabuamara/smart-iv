require("dotenv").config();
const express = require("express");
const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const path = require("path");
const app = express(); 

function validatePassword(password) {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return regex.test(password);
}  // 👈 أول شي نعرّف app

app.set("trust proxy", 1);   // 🔥 حل مشكلة Render + rate-limit

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  name: String,
  role: { type: String, default: "nurse" },
  phone: { type: String, unique: true },
   otp: String,          // 🔥 أضف هذا
  otpExpires: Date      // 🔥 وأضف هذا

}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const logSchema = new mongoose.Schema({
  action: String,
  performedBy: String,
  target: String,
  ip: String
}, { timestamps: true });


const Log = mongoose.model("Log", logSchema);

const patientSchema = new mongoose.Schema({
  name: String,
  patientId: String,
  room: String,
  fluid: String,
  totalML: Number,
  remainingML: Number,
  percentage: Number,
  status: String,
  nurse: String
}, { timestamps: true });

patientSchema.index({ room: 1 }, { unique: true });
const Patient = mongoose.model("Patient", patientSchema);



app.use(cors());         // 👈 بعدها نستخدمه
app.use(express.json());
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});


const SECRET_KEY = process.env.SECRET_KEY;
const DEVICE_SECRET = process.env.DEVICE_SECRET;

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));


async function addLog(action, details = {}) {

  console.log("🔥 ADDLOG CALLED:", action);

  try {

    const created = await Log.create({
      action,
      ...details
    });

    console.log("✅ LOG SAVED:", created._id);

  } catch (err) {
    console.error("❌ Log error:", err);
  }
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
  console.log("REQ.USER:", req.user);   // 👈 أضف هذا السطر

  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admins only" });
  }

  next();
}



app.get("/admin-data", authenticateToken, requireAdmin, (req, res) => {
  res.json({ message: "Welcome Admin 🔥" });
});

app.get("/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  try {

    const users = await User.find({}, "-password"); 
    // -password يعني استثناء حقل الباسورد

    res.json(users);

  } catch (err) {
    res.status(500).json({ message: "Error reading users" });
  }
});





app.post("/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
   const { username, password, name, role, phone } = req.body;

    if (!username || !password || !name || !role || !phone) {
      return res.status(400).json({ message: "All fields required" });
    }
  // 🔥🔥🔥 هون الإضافة المهمة
    if (!validatePassword(password)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol"
      });
    }

    // تحقق إذا المستخدم موجود
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      username,
      password: hashedPassword,
      name,
      role,
      phone
    });

    await addLog("CREATE_USER", {
      performedBy: req.user.username,
      target: username,
      ip: req.ip
    });

    res.json({ message: "User created successfully 🔥" });

  } catch (err) {
    res.status(500).json({ message: "Error creating user" });
  }
});






app.get("/admin/logs", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await Log.find().sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: "Error reading logs" });
  }
});

app.delete("/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.username === req.user.username) {
      return res.status(400).json({ message: "You cannot delete yourself" });
    }

    await user.deleteOne();

    await addLog("DELETE_USER", {
      performedBy: req.user.username,
      target: user.username,
      ip: req.ip
    });

    res.json({ message: "User deleted successfully 🔥" });

  } catch (err) {
    res.status(500).json({ message: "Error deleting user" });
  }
});


const helmet = require("helmet");
app.use(helmet());
const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100 // 100 طلب لكل IP
});

app.use(limiter);





// ================= LOGIN =================
app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;

  const user = await User.findOne({ username });


  if (!user) {
    console.log("❌ LOGIN FAILED (no user):", username);
    return res.status(401).json({ success: false });
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
  return res.status(401).json({ success: false });
}

console.log("✅ LOGIN SUCCESS:", username);

await addLog("LOGIN", {
  performedBy: user.username,
  ip: req.ip
});


const token = jwt.sign(
  { 
    username: user.username,
    name: user.name,
    role: user.role || "nurse"
    
  },
  SECRET_KEY,
  { expiresIn: "2h" }
);


  res.json({
    success: true,
    token,
    name: user.name,
      role: user.role || "nurse"
  });

});


app.post("/api/send-otp", async (req, res) => {
  const { username } = req.body;

  const user = await User.findOne({ username });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));

  user.otp = otp;
  user.otpExpires = new Date(Date.now() + 5 * 60 * 1000);

  await user.save();

  try {
    await client.messages.create({
      from: "whatsapp:+14155238886", // sandbox Twilio
      to: `whatsapp:${user.phone}`,  // 🔥 رقم المستخدم من الداتا
      body: `Your Smart IV OTP code is: ${otp}`
    });

    console.log("✅ OTP SENT:", otp);

    res.json({ message: "OTP sent via WhatsApp" });

  } catch (err) {
    console.error("❌ Twilio Error:", err);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

// ================= VERIFY OTP =================
app.post("/api/verify-otp", async (req, res) => {
  const { username, otp } = req.body;

  const user = await User.findOne({ username });

  if (!user) {
    console.log("❌ No user");
    return res.status(400).json({ message: "Invalid OTP" });
  }

  console.log("🔍 DB OTP:", user.otp);
  console.log("🔍 Entered OTP:", otp);

  // 🔥 عطّل expiry مؤقتًا
  if (String(user.otp) !== String(otp)) {
    console.log("❌ OTP mismatch");
    return res.status(400).json({ message: "Invalid OTP" });
  }

  // نجاح
  //user.otp = null;
  //user.otpExpires = null;
  await user.save();

  const token = jwt.sign(
  {
    username: user.username,
    name: user.name,
    role: user.role || "nurse"
  },
  SECRET_KEY,
  { expiresIn: "2h" }
);
  console.log("✅ OTP SUCCESS");

  res.json({
  token,
  role: user.role
});
});


// ================= FORGOT PASSWORD =================
app.post("/api/forgot-password", async (req, res) => {
  const { username, phone } = req.body;

  const user = await User.findOne({ username });

  if (!user || user.phone !== phone) {
    return res.status(400).json({
      message: "User not found or phone mismatch"
    });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));

  user.otp = otp;
  user.otpExpires = new Date(Date.now() + 5 * 60 * 1000);
  await user.save();

  await client.messages.create({
    from: "whatsapp:+14155238886",
    to: `whatsapp:${user.phone}`,
    body: `Reset code: ${otp}`
  });

  res.json({ message: "OTP sent" });
});





app.post("/api/reset-password", async (req, res) => {
  const { username, otp, newPassword } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ message: "User not found" });

  if (!user.otp || user.otp !== otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  if (user.otpExpires < Date.now()) {
    return res.status(400).json({ message: "OTP expired" });
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  user.password = hashed;
  user.otp = null;
  user.otpExpires = null;

  await user.save();

  res.json({ message: "Password reset successful" });
});




// ================= ADD PATIENT =================
app.post("/api/patients", authenticateToken, async (req, res) => {
  try {
        console.log("ADD PATIENT BODY:", req.body);

    const bed = req.body.bed?.trim();

   if (
  !req.body.name?.trim() ||
  !bed ||
  isNaN(Number(req.body.totalML)) ||
  Number(req.body.totalML) <= 0
)
 {

      return res.status(400).json({ message: "All fields required" });
    }

    const existing = await Patient.findOne({
  room: bed
});

    if (existing) {
      return res.status(400).json({ message: "Bed already occupied" });
    }

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

    await addLog("CREATE_PATIENT", {
      performedBy: req.user.username,
      target: newPatient.name,
      ip: req.ip
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Create patient error:", err);
    res.status(500).json({ success: false });
  }
});










// ================= GET PATIENTS =================
app.get("/api/patients", authenticateToken, async (req, res) => {
  try {
    const nurseUsername = req.user.username;

    const nursePatients = await Patient.find({
      nurse: nurseUsername
    }).sort({ createdAt: -1 });

    res.json(nursePatients);

  } catch (err) {
    console.error("Get patients error:", err);
    res.status(500).json({ success: false });
  }
});




// ================= UPDATE =================
app.put("/api/patients/:id", authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;

    const patient = await Patient.findOne({
      patientId: id,
      nurse: req.user.username
    });

    if (!patient) {
      return res.status(404).json({ success: false });
    }

    const newBed = req.body.bed?.trim();

    // 🔒 فحص السرير إذا تغير
    if (newBed && newBed !== patient.room) {

      const existingBed = await Patient.findOne({
  room: newBed
});

      if (existingBed) {
        return res.status(400).json({ message: "Bed already occupied" });
      }

      patient.room = newBed;
    }

    const oldRemaining = patient.remainingML;

    if (req.body.totalML) {
      patient.totalML = Number(req.body.totalML);
    }

    patient.name = req.body.name || patient.name;
    patient.fluid = req.body.fluid || patient.fluid;

    patient.remainingML = oldRemaining;

    patient.percentage = Math.round(
      (patient.remainingML / patient.totalML) * 100
    );

    patient.status =
      patient.percentage <= 0 ? "Finished" : "Running";

    await patient.save();

    await addLog("UPDATE_PATIENT", {
      performedBy: req.user.username,
      target: id,
      ip: req.ip
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false });
  }
});



// ================= DELETE =================
app.delete("/api/patients/:id", authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;

    const deletedPatient = await Patient.findOneAndDelete({
      patientId: id,
      nurse: req.user.username
    });

    if (!deletedPatient) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    await addLog("DELETE_PATIENT", {
      performedBy: req.user.username,
      target: id,
      ip: req.ip
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Delete patient error:", err);
    res.status(500).json({ success: false });
  }
});


// ================= NEW IV BAG =================

app.post("/api/patients/:id/new-bag", authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const { totalML, fluid } = req.body;

    const patient = await Patient.findOne({
      patientId: id,
      nurse: req.user.username
    });

    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    patient.totalML = Number(totalML);
    patient.remainingML = Number(totalML);
    patient.percentage = 100;
    patient.status = "Running";

    if (fluid) {
  patient.fluid = fluid;
}
    await patient.save();

    await addLog("NEW_IV_BAG", {
      performedBy: req.user.username,
      target: id,
      ip: req.ip
    });

    res.json({ success: true });

  } catch (err) {
    console.error("New bag error:", err);
    res.status(500).json({ success: false });
  }
});

// ================= SENSOR UPDATE =================
app.post("/api/sensor", async (req, res) => {

  console.log("📡 Incoming Request from Sensor! Key:", req.headers["x-device-key"]);
  
   if (req.headers["x-device-key"] !== DEVICE_SECRET) {
    return res.status(403).json({ message: "Unauthorized device" });
  }

  try {
    const { patientId, weight } = req.body;

    const patient = await Patient.findOne({
  room: patientId
});



    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    patient.remainingML = Number(weight);

    patient.percentage = Math.round(
      (patient.remainingML / patient.totalML) * 100
    );

    if (patient.percentage <= 0) {
  patient.status = "Finished";
} else if (patient.percentage <= 10) {
  patient.status = "Critical";
} else if (patient.percentage <= 30) {
  patient.status = "Low";
} else {
  patient.status = "Running";
}


    await patient.save();
io.emit("patientUpdated", {
  patientId: patient.patientId,
  remainingML: patient.remainingML,
  percentage: patient.percentage,
  status: patient.status
});

 

    res.json({ success: true });

  } catch (err) {
    console.error("Sensor update error:", err);
    res.status(500).json({ success: false });
  }
});


const PORT = process.env.PORT || 5000;

const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


console.log("🔥 SERVER VERSION 3.0 ACTIVE 🔥");
