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
const dns = require("dns");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

dns.setServers([
  "8.8.8.8",
  "8.8.4.4"
]);








// ================= AI / MACHINE LEARNING =================
const {
  RandomForestRegressor
} = require("random-forest");

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
  nurse: String,

  // Stand assigned to this patient
  standId: {
    type: String,
    unique: true,
    sparse: true
  }
}, { timestamps: true });


patientSchema.index({ room: 1 }, { unique: true });
const Patient = mongoose.model("Patient", patientSchema);



// ================= CHAT MESSAGE MODEL =================

const ChatMessageSchema = new mongoose.Schema({
    patientId: {
        type: String,
        required: true,
        index: true
    },

    sender: {
        type: String,
        enum: ["patient", "nurse"],
        required: true
    },

    message: {
        type: String,
        required: true
    },

    timestamp: {
        type: Date,
        default: Date.now
    }
});

const ChatMessage = mongoose.model(
    "ChatMessage",
    ChatMessageSchema
);











// ================= AI SENSOR HISTORY =================

const sensorReadingSchema = new mongoose.Schema({
  patientId: {
    type: String,
    required: true
  },

  weight: {
    type: Number,
    required: true
  },

  timestamp: {
    type: Date,
    default: Date.now
  }
});

const SensorReading = mongoose.model(
  "SensorReading",
  sensorReadingSchema
);

// ================= AI TRAINING DATA =================

const aiTrainingSchema = new mongoose.Schema({

  totalML: Number,

  remainingML: Number,

  percentage: Number,

  consumptionRate: Number,

  rateChange: Number,

  timeInterval: Number,

  remainingTimeMinutes: Number

});

const AITrainingData = mongoose.model(
  "AITrainingData",
  aiTrainingSchema
);

// ================= AI RANDOM FOREST MODEL =================

let aiModel = null;

// Train Random Forest Model

async function trainAIModel() {

  try {

    console.log("🤖 Starting AI model training...");

    const data = await AITrainingData.find({}).lean();

    if (data.length < 100) {

      console.log(
        "⚠️ Not enough training data for AI model"
      );

      return;
    }

    const trainingSet = data.map(item => [

  Number(item.totalML || 0),

  Number(item.remainingML || 0),

  Number(item.percentage || 0),

  Number(item.consumptionRate || 0),

  Number(item.rateChange || 0),

  Number(item.timeInterval || 0)

]);

    const predictions = data.map(item =>

      Number(item.remainingTimeMinutes || 0)

    );

    console.log(
      "🧪 Training data size:",
      trainingSet.length
    );

    console.log(
      "🧪 First training sample:",
      trainingSet[0]
    );

    console.log(
      "🧪 First prediction:",
      predictions[0]
    );

    // Create Random Forest Regression model
    aiModel = new RandomForestRegressor({

      nEstimators: 20,

      maxDepth: 10,

      maxFeatures: "auto",

      minSamplesLeaf: 5,

      minInfoGain: 0

    });

    // Train model
    aiModel.train(
      trainingSet,
      predictions
    );

    console.log(
      `✅ AI model trained successfully using ${data.length} samples`
    );

  } catch (error) {

    console.error(
      "❌ AI model training error:",
      error
    );

  }

}


// ================= AI PREDICTION API =================
// ============================================================
// 🧠 SMART ETA ENGINE - Stable IV Consumption Prediction
// ============================================================

app.get("/api/ai/predict/:patientId", async (req, res) => {
  try {
    const patientId = String(req.params.patientId);

    const patient = await Patient.findOne({ patientId });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });
    }

    // ------------------------------------------------------------
    // 1️⃣ Get recent sensor history
    // ------------------------------------------------------------

    const readings = await SensorReading.find({
      patientId
    })
      .sort({ timestamp: -1 })
      .limit(120);

    if (readings.length < 10) {
      return res.json({
        success: true,
        predictionAvailable: false,
        message: "Collecting more sensor data..."
      });
    }

    // Oldest → newest
    const ordered = [...readings].reverse();

    // ------------------------------------------------------------
    // 2️⃣ Remove impossible / invalid readings
    // ------------------------------------------------------------

    const clean = [];

    for (const reading of ordered) {
      const weight = Number(reading.weight);
      const timestamp = new Date(reading.timestamp).getTime();

      if (!Number.isFinite(weight)) continue;
      if (!Number.isFinite(timestamp)) continue;
      if (weight < 0) continue;

      if (clean.length === 0) {
        clean.push({
          weight,
          timestamp
        });
        continue;
      }

      const previous = clean[clean.length - 1];

      /*
       * IV fluid should normally decrease.
       *
       * If weight suddenly increases, it is probably:
       * - load-cell noise
       * - vibration
       * - bag movement
       * - someone touching the stand
       *
       * Ignore that reading.
       */
      if (weight > previous.weight) {
        continue;
      }

      // Ignore unrealistically large drops
      const drop = previous.weight - weight;
      const minutes =
        (timestamp - previous.timestamp) / 60000;

      if (minutes <= 0) continue;

      const rate = drop / minutes;

      // Ignore impossible consumption rates
      if (rate > 30) {
        continue;
      }

      clean.push({
        weight,
        timestamp
      });
    }

    if (clean.length < 5) {
      return res.json({
        success: true,
        predictionAvailable: false,
        message: "Not enough stable sensor data"
      });
    }

    // ------------------------------------------------------------
    // 3️⃣ Build consumption-rate samples
    // ------------------------------------------------------------

    const rates = [];

    for (let i = 1; i < clean.length; i++) {
      const previous = clean[i - 1];
      const current = clean[i];

      const minutes =
        (current.timestamp - previous.timestamp) / 60000;

      if (minutes <= 0) continue;

      const consumed =
        previous.weight - current.weight;

      if (consumed <= 0) continue;

      const rate = consumed / minutes;

      if (
        Number.isFinite(rate) &&
        rate > 0 &&
        rate <= 30
      ) {
        rates.push({
          rate,
          timestamp: current.timestamp
        });
      }
    }

    if (rates.length < 5) {
      return res.json({
        success: true,
        predictionAvailable: false,
        message: "Consumption rate is not stable yet"
      });
    }

    // ------------------------------------------------------------
    // 4️⃣ Remove extreme rate spikes
    // ------------------------------------------------------------

    const sortedRates = rates
      .map(x => x.rate)
      .sort((a, b) => a - b);

    const median =
      sortedRates[Math.floor(sortedRates.length / 2)];

    /*
     * Keep rates reasonably close to the median.
     *
     * This prevents one bad sensor reading from turning
     * a 3-hour ETA into 15 hours or 20 minutes.
     */

    const stableRates = rates.filter(item => {
      return (
        item.rate >= median * 0.35 &&
        item.rate <= median * 2.5
      );
    });

    if (stableRates.length < 5) {
      return res.json({
        success: true,
        predictionAvailable: false,
        message: "Waiting for a stable consumption trend"
      });
    }

    // ------------------------------------------------------------
    // 5️⃣ Weighted Moving Average
    // ------------------------------------------------------------

    /*
     * Recent measurements have more importance.
     *
     * Older:
     *     lower weight
     *
     * Newer:
     *     higher weight
     */

    let weightedSum = 0;
    let totalWeight = 0;

    const recentRates =
      stableRates.slice(-60);

    recentRates.forEach((item, index) => {

      const weight = index + 1;

      weightedSum += item.rate * weight;
      totalWeight += weight;

    });

    let consumptionRate =
      weightedSum / totalWeight;

    // ------------------------------------------------------------
    // 6️⃣ Extra smoothing
    // ------------------------------------------------------------

    /*
     * Prevent the rate itself from moving too aggressively.
     */

    const recentSimpleAverage =
      recentRates.reduce(
        (sum, item) => sum + item.rate,
        0
      ) / recentRates.length;

    consumptionRate =
      (consumptionRate * 0.7) +
      (recentSimpleAverage * 0.3);

    // Safety limits
    consumptionRate =
      Math.max(0.01, consumptionRate);

    // ------------------------------------------------------------
    // 7️⃣ Calculate remaining fluid
    // ------------------------------------------------------------

    const remainingML =
      Math.max(
        0,
        Number(patient.remainingML || 0)
      );

    // ------------------------------------------------------------
    // 8️⃣ Calculate ETA
    // ------------------------------------------------------------

    let predictedRemainingTime = 0;

    if (
      remainingML > 0 &&
      consumptionRate > 0
    ) {
      predictedRemainingTime =
        remainingML / consumptionRate;
    }

    // ------------------------------------------------------------
    // 9️⃣ Safety limits
    // ------------------------------------------------------------

    predictedRemainingTime =
      Math.max(
        0,
        Math.min(
          predictedRemainingTime,
          1440
        )
      );

    // ------------------------------------------------------------
    // 🔟 Debug information
    // ------------------------------------------------------------

    console.log("");
    console.log("====================================");
    console.log("🧠 SMART IV ETA ENGINE");
    console.log("====================================");

    console.log(
      "📊 Raw readings:",
      readings.length
    );

    console.log(
      "🧹 Clean readings:",
      clean.length
    );

    console.log(
      "📉 Rate samples:",
      rates.length
    );

    console.log(
      "📊 Stable rates:",
      stableRates.length
    );

    console.log(
      "💧 Remaining:",
      remainingML.toFixed(2),
      "ml"
    );

    console.log(
      "⚡ Consumption:",
      consumptionRate.toFixed(4),
      "ml/min"
    );

    console.log(
      "⏱️ ETA:",
      predictedRemainingTime.toFixed(2),
      "minutes"
    );

    console.log("====================================");
    console.log("");

    // ------------------------------------------------------------
    // 1️⃣1️⃣ Return result
    // ------------------------------------------------------------

    return res.json({
      success: true,
      predictionAvailable: true,

      patientId,

      remainingML:

        Number(
          remainingML.toFixed(2)
        ),

      consumptionRate:

        Number(
          consumptionRate.toFixed(4)
        ),

      predictedRemainingTime:

        Number(
          predictedRemainingTime.toFixed(2)
        ),

      cleanReadings:
        clean.length,

      stableRates:
        stableRates.length,

      unit: "minutes"
    });

  } catch (error) {

    console.error(
      "❌ Smart ETA Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Smart ETA calculation error"
    });
  }
});





app.use(cors());         // 👈 بعدها نستخدمه
app.use(express.json());
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});


const SECRET_KEY = process.env.SECRET_KEY;
const DEVICE_SECRET = process.env.DEVICE_SECRET;

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {

    console.log("✅ MongoDB Connected");

    // Train AI model after MongoDB connection
    await trainAIModel();

  })
  .catch(err => {
    console.error("❌ MongoDB Error:", err);
  });


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

app.use("/api/login", limiter);
app.use("/api/send-otp", limiter);
app.use("/api/verify-otp", limiter);
app.use("/api/forgot-password", limiter);
app.use("/api/reset-password", limiter);





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



    const standId = req.body.standId?.trim();

if (standId) {
  const existingStand = await Patient.findOne({
    standId: standId
  });

  if (existingStand) {
    return res.status(400).json({ message: "Stand already assigned to another patient" });
  }
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
  nurse: req.user.username,
  standId: standId || undefined
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

// ================= GET PATIENT BY STAND =================

app.get("/api/stand/:standId", async (req, res) => {
  try {
    const standId = req.params.standId.trim();

    const patient = await Patient.findOne({
      standId: standId
    });

    if (!patient) {
      return res.status(404).json({
        message: "No patient assigned to this stand"
      });
    }

    res.json({
      patientId: patient.patientId,
      name: patient.name,
      room: patient.room,
      bed: patient.room,
      fluid: patient.fluid,
      totalML: patient.totalML,
      remainingML: patient.remainingML,
      percentage: patient.percentage,
      status: patient.status,
      standId: patient.standId,
      nurse: patient.nurse
      
    });

  } catch (err) {
    console.error("Get stand patient error:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});


// ================= ADVANCED AI IV CONSUMPTION & PREDICTOR ENGINE =================

app.get("/api/ai/consumption/:patientId", async (req, res) => {
  try {
    const patientId = req.params.patientId;

    // 1. Fetch the latest 35 readings to get a wide and stable time window for analysis
    const readings = await SensorReading.find({ patientId: patientId })
      .sort({ timestamp: -1 })
      .limit(35);

    if (readings.length < 8) {
      return res.json({
        success: true,
        consumptionRate: 0,
        remainingMinutes: null,
        message: "Gathering enough sensor data for stabilization..."
      });
    }

    // Sort readings in ascending order (from oldest to newest)
    readings.reverse();

    // 2. Data Cleaning Step (Outlier Removal & Anti-Jitter Filtering)
    // Filters out abrupt jumps, sensor noise, or false weight increases due to bed vibrations.
    let cleanPoints = [];
    let baseTime = new Date(readings[0].timestamp).getTime();

    // Use the first point as our time reference offset (in minutes)
    cleanPoints.push({
      x: 0, 
      y: Number(readings[0].weight)
    });

    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1];
      const curr = readings[i];

      const timeDiffMin = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 60000;
      const weightDiff = prev.weight - curr.weight; // Consumption amount (should be positive)

      // Strict acceptance conditions to eliminate fluctuation:
      // - Logical time frame (between 0 and 10 minutes apart)
      // - Weight either remains steady or decreases normally (less than 15ml drop to avoid sensor glitches)
      if (timeDiffMin > 0 && timeDiffMin < 10) {
        if (weightDiff >= 0 && weightDiff < 15) {
          let timeOffset = (new Date(curr.timestamp).getTime() - baseTime) / 60000;
          cleanPoints.push({
            x: timeOffset,
            y: Number(curr.weight)
          });
        } else if (weightDiff < 0) {
          // If the weight falsely increases (due to vibration/touch), clamp it to the previous weight
          // to prevent negative rates and keep the graph stable.
          let timeOffset = (new Date(curr.timestamp).getTime() - baseTime) / 60000;
          cleanPoints.push({
            x: timeOffset,
            y: Number(prev.weight) 
          });
        }
      }
    }

    if (cleanPoints.length < 5) {
      return res.json({
        success: true,
        consumptionRate: 0,
        remainingMinutes: null,
        message: "Sensor readings are currently unstable"
      });
    }

    // 3. Linear Regression Algorithm (Least Squares Method)
    // Fits an optimal statistical line through all clean points, smoothing out any random noise and calculating precise slope.
    let n = cleanPoints.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    for (let p of cleanPoints) {
      sumX += p.x;
      sumY += p.y;
      sumXY += (p.x * p.y);
      sumXX += (p.x * p.x);
    }

    let denominator = (n * sumXX - sumX * sumX);
    if (denominator === 0) {
      return res.json({
        success: true,
        consumptionRate: 0,
        remainingMinutes: null,
        message: "Error calculating infusion rate"
      });
    }

    // The slope represents weight loss per minute (ml/min). 
    // We convert it to a positive consumption rate value.
    let slope = (n * sumXY - sumX * sumY) / denominator;
    let consumptionRate = -slope; 

    // If the rate is negative or extremely close to zero (paused or stopped)
    if (consumptionRate < 0.01) {
      consumptionRate = 0;
    }

    // 4. Current remaining volume/weight of the solution (from the latest clean point)
    const currentVolume = Math.max(0, cleanPoints[cleanPoints.length - 1].y);

    // 5. Calculate remaining time accurately and stably
    let remainingTimeMinutes = null;
    if (consumptionRate > 0) {
      remainingTimeMinutes = currentVolume / consumptionRate;
    }

    // Return the response cleanly and stably to the frontend interface
    res.json({
      success: true,
      patientId: patientId,
      consumptionRate: Number(consumptionRate.toFixed(2)), // ml / minute
      unit: "ml/min",
      remainingVolume: Number(currentVolume.toFixed(2)),   // Remaining ml
      remainingTimeMinutes: remainingTimeMinutes ? Math.round(remainingTimeMinutes) : null, // Remaining minutes
      readingsUsed: cleanPoints.length,
      status: consumptionRate > 0 ? "IV Flow Normal" : "IV Flow Paused or Stopped",
      message: "Calculated successfully with high stability"
    });

  } catch (err) {
    console.error("AI advanced consumption rate error:", err);
    res.status(500).json({
      success: false,
      message: "Internal AI calculation error"
    });
  }
});

// ================= GENERATE AI TRAINING DATA =================

app.post("/api/ai/generate-training-data", async (req, res) => {

  try {

    // Remove old training data
    await AITrainingData.deleteMany({});

    const trainingData = [];

    const bagSizes = [250, 500, 750, 800, 1000];

    // Generate 30 different IV consumption scenarios
    for (let scenario = 0; scenario < 100; scenario++) {

  const totalML =
    bagSizes[Math.floor(Math.random() * bagSizes.length)];

      // Different consumption speeds
      const consumptionRate =
        1.5 + Math.random() * 3.5;

      let remainingML = totalML;

      let previousRate = consumptionRate;

      let elapsedMinutes = 0;

      while (remainingML > 0) {

        // Simulate sensor interval
        const timeInterval =
          0.5 + Math.random() * 1.5;

        // Small sensor noise
        const noise =
          (Math.random() - 0.5) * 2;

        const actualRate =
          Math.max(
            0.5,
            consumptionRate + noise
          );

        const consumed =
          actualRate * timeInterval;

        remainingML =
          Math.max(
            0,
            remainingML - consumed
          );

        elapsedMinutes += timeInterval;

        const percentage =
          (remainingML / totalML) * 100;

        // Rate variation
        const rateChange =
          actualRate - previousRate;

        // Time remaining until empty
        const remainingTimeMinutes =
          remainingML / actualRate;

        trainingData.push({

  totalML:
    Number(totalML),

  remainingML:
    Number(remainingML.toFixed(2)),

          percentage:
            Number(percentage.toFixed(2)),

          consumptionRate:
            Number(actualRate.toFixed(2)),

          rateChange:
            Number(rateChange.toFixed(2)),

          timeInterval:
            Number(timeInterval.toFixed(2)),

          remainingTimeMinutes:
            Number(
              remainingTimeMinutes.toFixed(2)
            )

        });

        previousRate = actualRate;

      }

    }

    await AITrainingData.insertMany(trainingData);

    res.json({

      success: true,

      message:
        "AI training dataset generated successfully",

      samples:
        trainingData.length

    });

  } catch (err) {

    console.error(
      "AI training data error:",
      err
    );

    res.status(500).json({

      success: false,

      message:
        "Failed to generate AI training data"

    });

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
    const newStand = req.body.standId?.trim();

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


    // 🔒 Check Stand if changed
if (newStand !== patient.standId) {

  if (newStand) {
    const existingStand = await Patient.findOne({
      standId: newStand,
      patientId: { $ne: id }
    });

    if (existingStand) {
      return res.status(400).json({
        message: "Stand already assigned to another patient"
      });
    }
  }

  patient.standId = newStand || undefined;
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





// ================= OPENAI AI CHAT =================

app.post("/api/ai/chat", async (req, res) => {

  try {

    const {
    question,
    mode,
    nurse,
    patient,
    estimatedTime
} = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        message: "Question is required"
      });
    }

    let systemPrompt;

if (mode === "nurse") {

    systemPrompt = `
أنت Smart IV Nurse Assistant داخل المستشفى.

أنت تتحدث حاليًا مع الممرض المسجل في النظام.

بيانات الممرض الحالي:
اسم المستخدم: ${nurse?.username || "غير متوفر"}

المريض المحدد حاليًا:
اسم المريض: ${patient?.name || "غير متوفر"}
رقم المريض: ${patient?.patientId || "غير متوفر"}
رقم السرير: ${patient?.bed || patient?.room || "غير متوفر"}
الممرض المسؤول: ${patient?.nurse || "غير متوفر"}
نوع المحلول: ${patient?.fluid || "غير متوفر"}
إجمالي المحلول: ${patient?.totalML || 0} ml
المتبقي من المحلول: ${patient?.remainingML || 0} ml
نسبة المحلول: ${patient?.percentage || 0}%
حالة المحلول: ${patient?.status || "غير متوفرة"}

الوقت المتوقع لانتهاء المحلول:
${estimatedTime || "غير متوفر"}

قواعد مهمة:

- "أنا" و"مين أنا" و"اسمي" تعني الممرض الحالي.
- إذا سأل عن اسمه، استخدم اسم الممرض الحالي.
- إذا سأل عن اسم المريض، استخدم اسم المريض المحدد.
- لا تعتبر المريض المحدد هو المستخدم الحالي.
- استخدم بيانات المريض فقط عند السؤال عن المريض أو المحلول.
- لا تخترع معلومات.
- لا تكشف معلومات عن مرضى آخرين.
- أجب بالعربية وبأسلوب طبيعي ومختصر.
- يمكنك الإجابة عن الأسئلة العامة مثل التاريخ والجغرافيا والتكنولوجيا.
`;
    
} else {

    systemPrompt = `
أنت Smart IV Patient Assistant داخل المستشفى.

أنت تتحدث حاليًا مع المريض الموجود أمام شاشة الـ Smart IV.

بيانات المريض الحالي:

اسم المريض: ${patient?.name || "غير متوفر"}
رقم المريض: ${patient?.patientId || "غير متوفر"}
رقم السرير: ${patient?.bed || patient?.room || "غير متوفر"}
الممرض المسؤول: ${patient?.nurse || "غير متوفر"}
نوع المحلول: ${patient?.fluid || "غير متوفر"}
إجمالي المحلول: ${patient?.totalML || 0} ml
المتبقي من المحلول: ${patient?.remainingML || 0} ml
نسبة المحلول: ${patient?.percentage || 0}%
حالة المحلول: ${patient?.status || "غير متوفرة"}

الوقت المتوقع لانتهاء المحلول:
${estimatedTime || "غير متوفر"}

قواعد مهمة جدًا:

- "أنا" و"مين أنا" و"اسمي" تعني المريض الحالي.
- إذا سأل المريض "مين أنا؟"، استخدم اسم المريض الحالي.
- لا تعتبر المريض هو الممرض.
- إذا سأل عن الممرض، استخدم اسم الممرض المسؤول.
- إذا سأل عن المحلول، استخدم بيانات المحلول الحالية.
- لا تخترع أي معلومات.
- لا تكشف أو تخمن معلومات عن مرضى آخرين.
- يمكنك الإجابة عن الأسئلة العامة مثل عاصمة الأردن والعلوم والتكنولوجيا.
- أجب باللغة العربية وبأسلوب بسيط وطبيعي ومختصر.
- لا تقدم تشخيصًا طبيًا شخصيًا.
`;
}

    const response = await openai.responses.create({

      model: "gpt-5-mini",

      instructions: systemPrompt,

      input: question,

      reasoning: {
        effort: "low"
      },

      max_output_tokens: 500

    });

    const answer =
      response.output_text ||
      "عذرًا، لم أتمكن من الإجابة حاليًا.";

    console.log("🤖 AI ANSWER:", answer);

    // مهم جدًا: نرسل Response مرة واحدة فقط
    return res.json({
      success: true,
      answer: answer.trim()
    });

  } catch (error) {

    console.error("❌ OpenAI AI Error:", error);

    // لا تحاول إرسال Response ثاني
    // إذا كان السيرفر أرسل Response بالفعل
    if (res.headersSent) {
      return;
    }

    return res.status(500).json({
      success: false,
      message: "OpenAI AI unavailable"
    });

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
console.log("🧪 SENSOR RAW DATA:", {
  patientId,
  weight,
  weightType: typeof weight
});
    const patient = await Patient.findOne({
  room: patientId
});
console.log("🧪 PATIENT BEFORE UPDATE:", {
  patientId: patient?.patientId,
  room: patient?.room,
  totalML: patient?.totalML,
  remainingML: patient?.remainingML,
  percentage: patient?.percentage
});


    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    patient.remainingML = Number(weight);

// Save reading for AI analysis
await SensorReading.create({
  patientId: patient.patientId,
  weight: Number(weight),
  timestamp: new Date()
});
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





// ================= PATIENT NURSE CHAT =================

io.on("connection", (socket) => {

    console.log("🔌 Client connected:", socket.id);


    // ================= PATIENT JOINS CHAT =================

    socket.on("joinPatientChat", async (data) => {

        try {

            if (!data || !data.patientId) {
                return;
            }

            const patientId = String(data.patientId);

            const room = `patient_${patientId}`;

            socket.join(room);

            console.log(
                `💬 Patient joined chat: ${patientId}`
            );

            // Send previous messages to patient
            const messages = await ChatMessage
                .find({ patientId })
                .sort({ timestamp: 1 })
                .limit(100);

            socket.emit("chatHistory", messages);

        } catch (error) {

            console.error(
                "❌ Patient chat join error:",
                error
            );

        }

    });


    // ================= NURSE JOINS CHAT =================

    socket.on("joinNurseChat", async (data) => {

        try {

            if (!data || !data.patientId) {
                return;
            }

            const patientId = String(data.patientId);

            const room = `patient_${patientId}`;

            socket.join(room);

            console.log(
                `👨‍⚕️ Nurse joined chat: ${patientId}`
            );

            // Send previous messages to nurse
            const messages = await ChatMessage
                .find({ patientId })
                .sort({ timestamp: 1 })
                .limit(100);

            socket.emit("chatHistory", messages);

        } catch (error) {

            console.error(
                "❌ Nurse chat join error:",
                error
            );

        }

    });


    // ================= PATIENT SENDS MESSAGE =================

    socket.on("patientMessage", async (data) => {

        try {

            if (
                !data ||
                !data.patientId ||
                !data.message
            ) {
                return;
            }

            const patientId = String(data.patientId);

            const messageText =
                String(data.message).trim();

            if (!messageText) {
                return;
            }

            // Save message
            const chatMessage =
                await ChatMessage.create({

                    patientId: patientId,

                    sender: "patient",

                    message: messageText

                });

            const room =
                `patient_${patientId}`;

            // Send to patient + nurse
            io.to(room).emit(
                "newPatientMessage",
                chatMessage
            );

            console.log(
                `💬 Patient message [${patientId}]:`,
                messageText
            );

        } catch (error) {

            console.error(
                "❌ Patient message error:",
                error
            );

        }

    });


    // ================= NURSE SENDS MESSAGE =================

    socket.on("nurseMessage", async (data) => {

        try {

            if (
                !data ||
                !data.patientId ||
                !data.message
            ) {
                return;
            }

            const patientId =
                String(data.patientId);

            const messageText =
                String(data.message).trim();

            if (!messageText) {
                return;
            }

            // Save message
            const chatMessage =
                await ChatMessage.create({

                    patientId: patientId,

                    sender: "nurse",

                    message: messageText

                });

            const room =
                `patient_${patientId}`;

            // Send to patient + nurse
            io.to(room).emit(
                "newNurseMessage",
                chatMessage
            );

            console.log(
                `👨‍⚕️ Nurse message [${patientId}]:`,
                messageText
            );

        } catch (error) {

            console.error(
                "❌ Nurse message error:",
                error
            );

        }

    });


    // ================= PATIENT CALL NURSE =================

    socket.on("nurseCallRequest", (data) => {

        if (!data || !data.patientId) {
            return;
        }

        console.log(
            `🚨 Patient requested nurse [${data.patientId}]`
        );

        io.emit("patientCallRequest", {

            patientId: data.patientId,

            patientName:
                data.patientName || "Patient",

            room:
                data.room || "",

            standId:
                data.standId || "",

            message:
                data.message ||
                "Patient is requesting the nurse",

            timestamp:
                new Date()

        });

    });


    // ================= NURSE ANSWERED =================

    socket.on("nurseCallAnswered", (data) => {

        if (!data || !data.patientId) {
            return;
        }

        console.log(
            `👨‍⚕️ Nurse answered call [${data.patientId}]`
        );

        io.emit("patientCallAnswered", {

            patientId: data.patientId,

            nurse:
                data.nurse || "Nurse",

            timestamp:
                new Date()

        });

    });


    // ================= NURSE DISMISSED =================

    socket.on("nurseCallDismissed", (data) => {

        if (!data || !data.patientId) {
            return;
        }

        console.log(
            `❌ Nurse dismissed call [${data.patientId}]`
        );

        io.emit("patientCallDismissed", {

            patientId: data.patientId,

            nurse:
                data.nurse || "Nurse",

            timestamp:
                new Date()

        });

    });


    // ================= DISCONNECT =================

    socket.on("disconnect", () => {

        console.log(
            "🔌 Client disconnected:",
            socket.id
        );

    });

});





server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

console.log("🔥 SERVER VERSION 3.0 ACTIVE 🔥");