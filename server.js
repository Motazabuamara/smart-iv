require("dotenv").config();
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const path = require("path");
const app = express();   // 👈 أول شي نعرّف app

app.use(cors());         // 👈 بعدها نستخدمه
app.use(express.json());
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
const USERS_FILE = "users.json";
const LOGS_FILE = "logs.json";
const PATIENTS_FILE = "patients.json";

const SECRET_KEY = process.env.SECRET_KEY;

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

function addLog(action, performedBy, target, ip) {
  const logs = JSON.parse(fs.readFileSync(LOGS_FILE));

  logs.push({
    action,
    performedBy,
    target,
    ip,
    time: new Date().toISOString()
  });

  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}


app.get("/admin-data", authenticateToken, requireAdmin, (req, res) => {
  res.json({ message: "Welcome Admin 🔥" });
});

app.get("/admin/users", authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE));
    
    // نخفي الباسورد للأمان
    const safeUsers = users.map(user => ({
      username: user.username,
      name: user.name,
      role: user.role
    }));

    res.json(safeUsers);
  } catch (err) {
    res.status(500).json({ message: "Error reading users" });
  }
});
app.post("/admin/users", authenticateToken, requireAdmin, (req, res) => {
  try {
    const { username, password, name, role } = req.body;

    if (!username || !password || !name || !role) {
      return res.status(400).json({ message: "All fields required" });
    }

    let users = JSON.parse(fs.readFileSync(USERS_FILE));

    // تأكد إنه ما في نفس اليوزر
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ message: "Username already exists" });
    }

   
    const hashedPassword = bcrypt.hashSync(password, 10);

    const newUser = {
      username,
      password: hashedPassword,
      name,
      role
    };

    users.push(newUser);

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    addLog(
      "CREATE_USER",
      req.user.username,
      username,
      req.ip
    );

    res.json({ message: "User created successfully 🔥" });

  } catch (err) {
    res.status(500).json({ message: "Error creating user" });
  }
});

app.get("/admin/logs", authenticateToken, requireAdmin, (req, res) => {
  try {
    const logs = JSON.parse(fs.readFileSync(LOGS_FILE));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: "Error reading logs" });
  }
});

app.delete("/admin/users/:username", authenticateToken, requireAdmin, (req, res) => {
  try {
    const usernameToDelete = req.params.username;

    let users = JSON.parse(fs.readFileSync(USERS_FILE));

    // نمنع حذف الأدمن نفسه
    if (usernameToDelete === req.user.username) {
      return res.status(400).json({ message: "You cannot delete yourself" });
    }

    const filteredUsers = users.filter(user => user.username !== usernameToDelete);

    if (filteredUsers.length === users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    fs.writeFileSync(USERS_FILE, JSON.stringify(filteredUsers, null, 2));

    addLog(
      "DELETE_USER",
      req.user.username,
      usernameToDelete,
      req.ip
    );

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


app.use(express.static("public"));


// ================= LOGIN =================
app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;

  const users = JSON.parse(fs.readFileSync(USERS_FILE));

  const user = users.find(u => u.username === username);

  if (!user) {
    console.log("❌ LOGIN FAILED (no user):", username);
    return res.status(401).json({ success: false });
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    console.log("❌ LOGIN FAILED (wrong password):", username);
    return res.status(401).json({ success: false });
  }

  console.log("✅ LOGIN SUCCESS:", username);

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
    name: user.name
  });

});


// ================= ADD PATIENT =================
app.post("/api/patients", authenticateToken, (req, res) => {
  console.log("ADD PATIENT:", req.body);

  let patients = JSON.parse(fs.readFileSync(PATIENTS_FILE));

  const newPatient = {
  id: Date.now(),
  name: req.body.name,
  bed: req.body.bed,
  fluid: req.body.fluid,
  totalML: Number(req.body.totalML),
  remainingML: Number(req.body.totalML),
  percentage: 100,
  status: "Running",
  nurse: req.user.username   // 🔥 مهم
};

  patients.push(newPatient);

  fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));
 addLog(
  "CREATE_PATIENT",
  req.user.username,
  newPatient.name,
  req.ip
);

  res.json({ success: true });
});



// ================= GET PATIENTS =================
app.get("/api/patients", authenticateToken, (req, res) => {
  const patients = JSON.parse(fs.readFileSync(PATIENTS_FILE));

  const nurseUsername = req.user.username;

  const nursePatients = patients.filter(
    p => p.nurse === nurseUsername
  );

  res.json(nursePatients);
});


// ================= ADD =================


// ================= UPDATE =================
app.put("/api/patients/:id", authenticateToken, (req, res) => {
  console.log("UPDATE PATIENT:", req.params.id);

  const id = Number(req.params.id);
  let patients = JSON.parse(fs.readFileSync(PATIENTS_FILE));
patients = patients.map(p => {

  if (p.id === id && p.nurse === req.user.username) {

    const oldRemaining = p.remainingML;

    if (req.body.totalML) {
      p.totalML = Number(req.body.totalML);
    }

    p.name = req.body.name || p.name;
    p.bed = req.body.bed || p.bed;
    p.fluid = req.body.fluid || p.fluid;

    // نحافظ على remaining القديم
    p.remainingML = oldRemaining;

    // إعادة الحساب
    p.percentage = Math.round(
      (p.remainingML / p.totalML) * 100
    );

    p.status = p.percentage <= 0 ? "Finished" : "Running";

    addLog(
      "UPDATE_PATIENT",
      req.user.username,
      id,
      req.ip
    );
  }

  return p;
});


  fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));
  addLog(
  "UPDATE_PATIENT",
  req.user.username,
  id,
  req.ip
);

  res.json({ success: true });
});



// ================= DELETE =================
app.delete("/api/patients/:id", authenticateToken, (req, res) => {
  console.log("DELETE PATIENT:", req.params.id);
  const id = Number(req.params.id);
  let patients = JSON.parse(fs.readFileSync(PATIENTS_FILE));

  patients = patients.filter(p => p.id !== id);

  fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));
  addLog(
  "DELETE_PATIENT",
  req.user.username,
  id,
  req.ip
);

  res.json({ success: true });
});

app.listen(process.env.PORT || 3000,
 () =>
  console.log("🚀 Smart IV Server running → http://localhost:3000/login.html")
);


// ================= NEW IV BAG =================

app.post("/api/patients/:id/new-bag", authenticateToken, (req, res) => {

  const id = Number(req.params.id);
  const { totalML, fluid } = req.body;

  let patients = JSON.parse(fs.readFileSync(PATIENTS_FILE));

  patients = patients.map(p => {

    if (p.id === id && p.nurse === req.user.username) {

      p.totalML = Number(totalML);
      p.remainingML = Number(totalML);
      p.percentage = 100;
      p.status = "Running";

      if (fluid) {
        p.fluid = fluid;
      }

      addLog(
        "NEW_IV_BAG",
        req.user.username,
        id,
        req.ip
      );
    }

    return p;
  });

  fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));

  res.json({ success: true });
});

// ================= SENSOR UPDATE =================
app.post("/api/sensor", authenticateToken, (req, res) => {
  console.log("SENSOR DATA:", req.body);

  const { patientId, weight } = req.body;

  let patients = JSON.parse(fs.readFileSync(PATIENTS_FILE));

  patients = patients.map(p => {

    if (p.id == patientId && p.nurse === req.user.username) {

      p.remainingML = Number(weight);
      p.percentage = Math.round(
        (Number(weight) / Number(p.totalML)) * 100
      );

      if (p.percentage <= 0) {
        p.status = "Finished";
      } else {
        p.status = "Running";
      }

      // 🔥 اللوج الصح
      addLog(
        "SENSOR_UPDATE",
        req.user.username,
        patientId,
        req.ip
      );
    }

    return p;
  });

  fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));

  res.json({ success: true });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
