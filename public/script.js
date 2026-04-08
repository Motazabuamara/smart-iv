let nurse = null;
let patientsData = [];
let selectedId = null;
let refreshTimeout;
function toggleLoginPassword() {
  const input = document.getElementById("password");
  const icon = document.getElementById("loginEye");

  if (input.type === "password") {
    input.type = "text";
    icon.textContent = "👁";
  } else {
    input.type = "password";
    icon.textContent = "👁";
  }
}


// ================= LOGIN =================
async function login() {

    document.getElementById("loginBtn").disabled = true;

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    document.getElementById("errorMsg").innerText = "Invalid login";
      document.getElementById("loginBtn").disabled = false;

    return;
  }

  // 🔥 خزّن المستخدم مؤقت
  window.currentUser = username;

  // 🔥 اطلب OTP
  await fetch("/api/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });

  // 🔥 افتح popup
  document.getElementById("otpModal").style.display = "flex";
}


// ================= VERIFY OTP =================
document.addEventListener("DOMContentLoaded", () => {

  const verifyBtn = document.getElementById("verifyOtpBtn");

  if (verifyBtn) {
    verifyBtn.addEventListener("click", async () => {

      const otp = document.getElementById("otpInput").value;

      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: window.currentUser,
          otp
        })
      });

      const data = await res.json();

      // 🟢 LOGIN FLOW
      if (data.token && !window.isResetFlow) {

        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.role);
        localStorage.setItem("nurse", window.currentUser);

        window.location.href = "dashboard.html";
        return;
      }

      // 🟡 RESET FLOW
      if (window.isResetFlow) {

        document.getElementById("otpModal").style.display = "none";

        const newPassword = prompt("Enter new password:");

        if (!newPassword) return;

        await fetch("/api/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: window.currentUser,
            otp,
            newPassword
          })
        });

        alert("Password reset successful");

        window.isResetFlow = false;
        return;
      }

      // ❌ ERROR
      alert("Invalid OTP");

    });
  }

});


async function loadPatients(keepSelection = false) {
  const token = localStorage.getItem("token");
  const select = document.getElementById("patients");
  if (!select) return;

  const res = await fetch("/api/patients", {
    headers: {
      "Authorization": "Bearer " + token
    }
  });

  if (!res.ok) {
    console.error("Failed to fetch patients");
    return;
  }

  const patients = await res.json();
  patientsData = patients;

  select.innerHTML = "";

  // ✅ خيار افتراضي
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "-- Add New Patient --";
  select.appendChild(defaultOption);

  patients.forEach(p => {
    const option = document.createElement("option");
    option.value = p.patientId;
    option.textContent =
      `${p.name} | Bed: ${p.room || "-"}`;
    select.appendChild(option);
  });

 if (
  keepSelection &&
  selectedId &&
  patients.some(p => p.patientId === selectedId)
) {
  select.value = selectedId;
  selectPatient();
} else {
  select.value = "";
  selectedId = null;

  document.getElementById("name").value = "";
  document.getElementById("bed").value = "";
  document.getElementById("fluid").value = "";
  document.getElementById("totalML").value = "";

  document.getElementById("displayFluid").innerText = "-";
  document.getElementById("displayRemaining").innerText = "-";
  document.getElementById("displayPercentage").innerText = "-";
  document.getElementById("displayStatus").innerText = "-";

  
}


}




function selectPatient() {
  const sel = document.getElementById("patients");

  const addBtn = document.getElementById("addBtn");
  const updateBtn = document.getElementById("updateBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  if (!sel || !sel.value) {
    selectedId = null;

    // 🔥 وضع الإضافة
    addBtn.style.display = "inline-block";
    updateBtn.style.display = "none";
    deleteBtn.style.display = "none";

    document.getElementById("name").value = "";
    document.getElementById("bed").value = "";
    document.getElementById("fluid").value = "";
    document.getElementById("totalML").value = "";

    document.getElementById("displayFluid").innerText = "-";
    document.getElementById("displayRemaining").innerText = "-";
    document.getElementById("displayPercentage").innerText = "-";
    document.getElementById("displayStatus").innerText = "-";

    

    return;
  }

  // 🔥 وضع التعديل
  selectedId = sel.value;

  addBtn.style.display = "none";
  updateBtn.style.display = "inline-block";
  deleteBtn.style.display = "inline-block";

  const p = patientsData.find(x => x.patientId === selectedId);
  if (!p) return;

  document.getElementById("name").value = p.name ?? "";
  document.getElementById("bed").value = p.room ?? "";
  document.getElementById("fluid").value = p.fluid ?? "";
  document.getElementById("totalML").value = p.totalML ?? "";

  document.getElementById("displayFluid").innerText = p.fluid ?? "-";
  document.getElementById("displayRemaining").innerText =
    p.remainingML ?? p.totalML ?? "-";

  document.getElementById("displayPercentage").innerText =
    p.percentage ?? 100;

  document.getElementById("displayStatus").innerText =
    p.status ?? "Running";

  
  const percentage = Number(p.percentage ?? 100);

 
}




async function addPatient() {
  const token = localStorage.getItem("token");

  const res = await fetch("/api/patients", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify({
      name: document.getElementById("name").value,
      bed: document.getElementById("bed").value,
      fluid: document.getElementById("fluid").value,
      totalML: document.getElementById("totalML").value
    })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.message || "Error adding patient");
    return;
  }

  alert("Patient added successfully ✅");

  await loadPatients();
}





async function updatePatient() {
  const token = localStorage.getItem("token");

  if (!selectedId) {
    alert("Select patient first");
    return;
  }

  await fetch("/api/patients/" + selectedId, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify({
      name: document.getElementById("name").value,
      bed: document.getElementById("bed").value,
      fluid: document.getElementById("fluid").value,
      totalML: document.getElementById("totalML").value
    })
  });

 await loadPatients(true);

}



async function deletePatient() {
  const token = localStorage.getItem("token");

  if (!selectedId) {
    alert("Select patient first");
    return;
  }

  if (!confirm("Are you sure you want to delete this patient?")) {
    return;
  }

  await fetch("/api/patients/" + selectedId, {
    method: "DELETE",
    headers: {
      "Authorization": "Bearer " + token
    }
  });

  selectedId = null;
  loadPatients();
}


function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("nurse");
  localStorage.removeItem("role");

  window.location.href = "login.html";
}

let autoRefreshStarted = false;

document.addEventListener("DOMContentLoaded", async () => {

  // 🔵 شغل هذا فقط إذا الصفحة dashboard
  if (!window.location.pathname.includes("dashboard")) {
    return;
  }

  nurse = localStorage.getItem("nurse");
  if (!nurse) {
    location.href = "login.html";
    return;
  }

const nurseElement = document.getElementById("nurseName");
if (nurseElement) {
  nurseElement.innerText = nurse;
}

  await loadPatients();
/*
  if (!autoRefreshStarted) {
    setInterval(() => {
  loadPatients(true);
}, 30000);
    autoRefreshStarted = true;
  }    */

});

document.addEventListener("DOMContentLoaded", () => {

  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", login);
  }

  const addBtn = document.getElementById("addBtn");
  if (addBtn) {
    addBtn.addEventListener("click", addPatient);
  }

  const updateBtn = document.getElementById("updateBtn");
  if (updateBtn) {
    updateBtn.addEventListener("click", updatePatient);
  }

  const deleteBtn = document.getElementById("deleteBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", deletePatient);
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
const select = document.getElementById("patients");
if (select) {
  select.addEventListener("change", selectPatient);
  document.querySelectorAll("input").forEach(input => {
  input.addEventListener("input", () => {

    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }

    refreshTimeout = setTimeout(() => {
      loadPatients(true);
    }, 30000); // يحدث بعد 30 ثانية من آخر كتابة

  });
});

}
});

const newBagBtn = document.getElementById("newBagBtn");

if (newBagBtn) {
  newBagBtn.addEventListener("click", async () => {

    if (!selectedId) {
      alert("Select patient first");
      return;
    }

    const newTotal = prompt("Enter new IV total (ml):");
    if (!newTotal) return;

    const res = await fetch(`/api/patients/${selectedId}/new-bag`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({
        totalML: Number(newTotal)
      })
    });

    if (!res.ok) {
      alert("Failed to update IV bag");
      return;
    }

    await loadPatients(true);

  });
}



// ================= FORGOT PASSWORD =================

function openForgot() {
  document.getElementById("forgotModal").style.display = "flex";
   // 🔥 نظف الحقول
  document.getElementById("forgotUsername").value = "";
  document.getElementById("forgotPhone").value = "";
  document.getElementById("forgotMsg").innerText = "";
}

async function sendResetOTP() {
  const username = document.getElementById("forgotUsername").value;
  const phone = document.getElementById("forgotPhone").value;

  window.isResetFlow = true; // 🔥🔥🔥

  const res = await fetch("/api/forgot-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, phone })
  });

  const data = await res.json();

  document.getElementById("forgotMsg").innerText = data.message;

  if (res.ok) {
    document.getElementById("forgotModal").style.display = "none";
    document.getElementById("otpModal").style.display = "flex";
    window.currentUser = username;
  }
}

// ================= CLOSE MODALS =================
function closeModals() {
  document.getElementById("otpModal").style.display = "none";
  document.getElementById("forgotModal").style.display = "none";

  window.isResetFlow = false;
}