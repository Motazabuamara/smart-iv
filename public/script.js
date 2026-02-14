let nurse = null;
let patientsData = [];
let selectedId = null;

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
    localStorage.setItem("token", data.token);   // 🔥 جديد
    window.location.href = "dashboard.html";
  } else {
    document.getElementById("error").innerText = "Invalid login";

  }
}




async function loadPatients() {
  const token = localStorage.getItem("token");

  const select = document.getElementById("patients");
  if (!select) return;

  const previousSelected = select.value;

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

  // فضّي القائمة
  select.innerHTML = "";

  patients.forEach(p => {
    const option = document.createElement("option");
    option.value = p.patientId;

   option.textContent = `${p.name} | Bed: ${p.room || "-"} | ID: ${p.patientId}`;
;

    select.appendChild(option);
  });

  // رجّع الاختيار السابق إذا موجود
  if (previousSelected && patients.find(p => p.patientId == previousSelected)) {
    select.value = previousSelected;
  }

  // إذا ما في اختيار اختار أول واحد
  if (!select.value && patients.length > 0) {
    select.value = patients[0].patientId;

  }

  // 🔥 المهم جدًا
  selectedId = select.value;   // بدون Number


  selectPatient();
}







function selectPatient() {
  const sel = document.getElementById("patients");
  if (!sel || !sel.value) return;

  selectedId = sel.value;

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

  const alertBox = document.getElementById("alertBox");
  const percentage = Number(p.percentage ?? 100);

  if (percentage <= 0) {
    alertBox.style.display = "block";
    alertBox.className = "alertBox alert-danger";
    alertBox.innerText = "⚠ IV Finished!";
  } 
  else if (percentage <= 20) {
    alertBox.style.display = "block";
    alertBox.className = "alertBox alert-warning";
    alertBox.innerText = "⚠ IV Almost Empty!";
  } 
  else {
    alertBox.style.display = "block";
    alertBox.className = "alertBox alert-normal";
    alertBox.innerText = "IV Running Normally";
  }
}



async function addPatient() {
  const token = localStorage.getItem("token");

  await fetch("/api/patients", {
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

  await loadPatients();
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

  if (!autoRefreshStarted) {
    setInterval(loadPatients, 30000);
    autoRefreshStarted = true;
  }

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

    await fetch(`/api/patients/${selectedId}/new-bag`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({
        totalML: Number(newTotal)
      })
    });

    loadPatients();
  });
}
