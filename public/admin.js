console.log("ADMIN JS LOADED 🔥");

const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "index.html";
}

// تحقق إنه admin
fetch("/admin-data", {
  headers: { "Authorization": "Bearer " + token }
})
.then(res => {
  if (!res.ok) {
    alert("Access denied");
    window.location.href = "dashboard.html";
  }
});

// تحميل المستخدمين
function loadUsers() {
  fetch("/admin/users", {
    headers: { "Authorization": "Bearer " + token }
  })
  .then(res => res.json())
  .then(users => {
    const container = document.getElementById("users");
    container.innerHTML = "";

    users.forEach(user => {
      const div = document.createElement("div");
      div.className = "card";

      const name = document.createElement("span");
      name.innerText = `${user.username} (${user.role})`;

      const btn = document.createElement("button");
      btn.innerText = "Delete";
      btn.addEventListener("click", () => deleteUser(user.username));

      div.appendChild(name);
      div.appendChild(btn);

      container.appendChild(div);
    });
  });
}

// حذف مستخدم
function deleteUser(username) {
  fetch("/admin/users/" + username, {
    method: "DELETE",
    headers: { "Authorization": "Bearer " + token }
  })
  .then(res => res.json())
  .then(data => {
    alert(data.message);
    loadUsers();
    loadLogs();
  });
}

// تحميل اللوجات
function loadLogs() {
  fetch("/admin/logs", {
    headers: { "Authorization": "Bearer " + token }
  })
  .then(res => res.json())
  .then(logs => {
    const container = document.getElementById("logs");
    container.innerHTML = "";

    logs.slice().reverse().forEach(log => {
      const div = document.createElement("div");
      div.className = "card";
      div.innerText = `${log.time} - ${log.performedBy} did ${log.action} on ${log.target}`;
      container.appendChild(div);
    });
  });
}

// Logout
document.getElementById("logoutBtn")
  .addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  });

loadUsers();
loadLogs();

document.getElementById("createUserBtn")
  .addEventListener("click", () => {

    const username = document.getElementById("newUsername").value;
    const name = document.getElementById("newName").value;
    const password = document.getElementById("newPassword").value;
    const role = document.getElementById("newRole").value;

    fetch("/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ username, password, name, role })
    })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      loadUsers();
      loadLogs();
    });
});
