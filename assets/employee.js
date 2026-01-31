<li>Reset password</li>
          <li>Updating personal information</li>
          <li>First day instructions</li>
        </ul>
      </div>
    </div>
  `;
}

function renderRoute(user) {
  renderStagebar(user);

  const r = routeName();
  switch (r) {
    case "progress": return renderProgress(user);
    case "roles": return renderRoles(user);
    case "documents": return renderDocuments(user);
    case "i9": return renderI9(user);
    case "shift": return renderShift(user);
    case "footwear": return renderFootwear(user);
    case "firstday": return renderFirstDay(user);
    case "team": return renderTeam(user);
    case "notifications": return renderNotifications(user);
    case "help": return renderHelp(user);
    default:
      location.hash = "#progress";
      return;
  }
}

export async function initEmployeeApp() {
  const statusChip = document.getElementById("statusChip");

  let uid = null;
  let userObj = demoUser();

  async function reload() {
    if (uid) userObj = await loadUserDoc(uid);
    renderRoute(userObj);
  }

  async function save(patch) {
    if (!uid) {
      uiToast("Preview mode: sign in later to save.");
      return;
    }
    await saveUserDoc(uid, patch);
  }

  window.__EMP_reload = reload;
  window.__EMP_save = save;

  // Wait auth once, load doc if signed in
  await new Promise((resolve) => {
    onAuth(async (user) => {
      if (user && isFirebaseConfigured()) {
        uid = user.uid;
        statusChip?.classList?.add("ok");
        statusChip.textContent = "online";
      } else {
        uid = null;
        statusChip?.classList?.remove("ok");
        statusChip.textContent = "offline";
      }
      await reload();
      resolve();
    });
  });

  // Handle navigation
  window.addEventListener("hashchange", async () => {
    await reload();
  });
}
