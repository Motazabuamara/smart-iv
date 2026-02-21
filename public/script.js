let nurse = null;
let patientsData = [];
let selectedId = null;
let refreshTimeout;

// ================= LOGIN =================
async function login() {

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

 const data = await res.json();

if (data.success) {
  localStorage.setItem("nurse", data.name);
  localStorage.setItem("token", data.token);
  localStorage.setItem("role", data.role);
  
  if (data.role === "admin") {
    window.open("admin.html", "_blank");  // يفتح نافذة ثانية
  }

  window.location.href = "dashboard.html"; // النافذة الأساسية تروح داشبورد

  

} else {
  document.getElementById("error").innerText = "Invalid login";
}
}




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
  localStorage.removeItem("nurse");
  localStorage.removeItem("token");
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
