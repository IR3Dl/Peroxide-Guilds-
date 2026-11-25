/* Peroxide Guilds - integração Supabase */
const SUPABASE_URL = "https://maujnpnpebizpfhmygea.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WPptMrzrVRGhX5y_8dcmLw_fDUz2U6X";
const SUPREME_EMAIL = "guilhermetrrs14@gmail.com";
const ADMIN_EMAIL = "";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
    storage: window.localStorage
  }
});

let guilds = [];
let currentPage = 1;
let selectedImage = null;
let editingId = null;
let session = null;
let authMode = "login";
let profile = null;
let mineOnly = false;
let displayedCount = 10;
let likedGuildIds = new Set();
let sessionRefreshVersion = 0;

async function loadGuilds() {
  let query = sb
    .from("guilds")
    .select("*, profiles(id, username, avatar_url, bio, role, blocked, user_visual_roles(role_id, visual_roles(slug,name,emoji,gradient)))")
    .order("view_count", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (mineOnly && session) query = query.eq("user_id", session.user.id);

  const { data, error } = await query;
  if (error) {
    console.error(error);
    guilds = [];
  } else {
    guilds = data || [];
  }

  likedGuildIds = new Set();
  if (session && guilds.length) {
    const { data: likes } = await sb
      .from("guild_likes")
      .select("guild_id")
      .eq("user_id", session.user.id);
    (likes || []).forEach(like => likedGuildIds.add(like.guild_id));
  }

  renderGuilds();
}

async function toggleMine() {
  if (!session) return openLogin();
  mineOnly = !mineOnly;
  displayedCount = 10;
  const button = document.querySelector(".mine-toggle-btn");
  if (button) {
    button.textContent = mineOnly ? "Todas as publicações" : "Minhas publicações";
  }
  await loadGuilds();
}

async function registerGuildView(guild) {
  const key = `viewed:${guild.id}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  await sb.rpc("increment_guild_view", { guild_uuid: guild.id });
  guild.view_count = (guild.view_count || 0) + 1;
  renderGuilds();
}

async function toggleGuildLike(guild) {
  if (!session) return openLogin();

  const liked = likedGuildIds.has(guild.id);
  let error = null;

  if (liked) {
    const response = await sb.from("guild_likes")
      .delete()
      .eq("guild_id", guild.id)
      .eq("user_id", session.user.id);
    error = response.error;
    if (!error) {
      likedGuildIds.delete(guild.id);
      guild.like_count = Math.max(0, (guild.like_count || 0) - 1);
    }
  } else {
    const response = await sb.from("guild_likes")
      .insert({ guild_id: guild.id, user_id: session.user.id });
    error = response.error;
    if (!error) {
      likedGuildIds.add(guild.id);
      guild.like_count = (guild.like_count || 0) + 1;
    }
  }

  if (error) return alert(error.message);
  renderGuilds();
}

function showMoreGuilds() {
  displayedCount += 10;
  renderGuilds();
}

function openDescription(title, text) {
  document.getElementById("descriptionModalTitle").textContent = title;
  document.getElementById("descriptionModalText").textContent = text;
  document.getElementById("descriptionModal").style.display = "flex";
}

function renderGuilds() {
  guildList.innerHTML = "";
  const visibleGuilds = guilds.slice(0, displayedCount);

  if (!guilds.length) {
    guildList.innerHTML = `<div class="empty">Nenhuma guilda publicada ainda.<br><br>Seja o primeiro a apresentar sua comunidade!</div>`;
  }

  visibleGuilds.forEach(guild => {
    const card = document.createElement("article");
    card.className = "guild-card";

    const avatar = document.createElement("img");
    avatar.className = "guild-avatar";
    avatar.src = guild.image_url;
    avatar.alt = "Imagem da guilda";

    const title = document.createElement("h3");
    title.textContent = guild.name;

    const author = document.createElement("button");
    author.type = "button";
    author.className = "author-profile";

    const authorAvatar = document.createElement("img");
    authorAvatar.src = guild.profiles?.avatar_url || "profile-default.png";
    authorAvatar.alt = "Foto de perfil";

    const authorName = document.createElement("span");
    authorName.innerHTML = "Publicado por " + formatVisualName(guild.profiles?.username || "Usuário", guild.profiles?.user_visual_roles || []);

    author.append(authorAvatar, authorName);
    author.onclick = () => openMiniProfile(guild.profiles);

    const descriptionText = guild.description || "";
    const description = document.createElement("p");
    description.className = "guild-description";
    description.textContent = descriptionText.length > 180
      ? descriptionText.slice(0, 180).trim() + "..."
      : descriptionText;

    const link = document.createElement("a");
    link.className = "discord-btn";
    link.href = guild.discord;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Discord";
    link.onclick = () => registerGuildView(guild);

    const stats = document.createElement("p");
    stats.className = "guild-stats";

    const views = document.createElement("span");
    const viewCount = guild.view_count || 0;
    views.textContent = `👁 ${viewCount}${viewCount >= 100 ? " 🔥" : ""}`;

    const likeButton = document.createElement("button");
    likeButton.type = "button";
    likeButton.className = "guild-like";
    likeButton.textContent = (likedGuildIds.has(guild.id) ? "♥ " : "♡ ") + (guild.like_count || 0);
    likeButton.onclick = () => toggleGuildLike(guild);

    stats.append(views, likeButton);
    card.append(avatar, title, author, description);

    if (descriptionText.length > 180) {
      const moreButton = document.createElement("button");
      moreButton.type = "button";
      moreButton.className = "description-more-btn";
      moreButton.textContent = "Ver mais";
      moreButton.onclick = () => openDescription(guild.name, descriptionText);
      card.append(moreButton);
    }

    card.append(link, stats);

    if (canManage(guild)) {
      const actions = document.createElement("div");
      actions.className = "account-actions";

      const edit = document.createElement("button");
      edit.textContent = "Editar";
      edit.onclick = () => openEdit(guild);

      const remove = document.createElement("button");
      remove.className = "delete-action";
      remove.textContent = "Excluir";
      remove.onclick = () => deleteGuild(guild);

      actions.append(edit, remove);
      card.append(actions);
    }

    guildList.appendChild(card);
  });

  const pagination = document.getElementById("pagination");
  if (guilds.length > displayedCount) {
    pagination.style.display = "flex";
  } else {
    pagination.style.display = "none";
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "none";
}

function openLogin() {
  document.getElementById("loginModal").style.display = "flex";
}

function openProfileEdit() {
  document.getElementById("profileModal").style.display = "flex";
  if (!profile) return;
  document.getElementById("publicUsername").value = profile.username || "";
  document.getElementById("publicBio").value = profile.bio || "";
  document.getElementById("profileImagePreview").src = profile.avatar_url || "profile-default.png";
  selectedProfileImage = null;
}

function openProfile() {
  if (!session || !profile) return openLogin();
  openMiniProfile(profile);
}

function toggleAuthMode() {
  authMode = authMode === "login" ? "create" : "login";
  document.getElementById("authModalTitle").textContent = authMode === "login" ? "Entrar na conta" : "Criar conta";
  document.getElementById("confirmPasswordGroup").style.display = authMode === "create" ? "block" : "none";
  document.getElementById("toggleCreateAccount").textContent = authMode === "login" ? "Criar conta" : "Já tenho conta";
  document.getElementById("authSubmit").textContent = authMode === "login" ? "Entrar" : "Criar conta";
}

function localAccountEmail(username) {
  const normalized = username
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^[0-9]/, "u")
    .slice(0, 24);

  if (normalized === "red") return "red@peroxide.local";

  const hash = Array.from(username).reduce((total, char) =>
    (total * 31 + char.charCodeAt(0)) % 1000000,
    7
  );

  return `${normalized || "usuario"}.${hash}@peroxide.local`;
}

async function submitAuth() {
  const username = document.getElementById("authName").value.trim();
  const password = document.getElementById("authPassword").value;

  if (username.length < 3) return alert("Use pelo menos 3 caracteres no nome.");
  if (password.length < 6) return alert("Use uma senha com pelo menos 6 caracteres.");

  if (authMode === "create") {
    const confirmPassword = document.getElementById("authPasswordConfirm").value;
    if (password !== confirmPassword) return alert("As senhas não coincidem.");
    const { data: existing } = await sb
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .limit(1);

    if (existing?.length) return alert("Esse nome já está em uso.");

    const { error } = await sb.auth.signUp({
      email: localAccountEmail(username),
      password,
      options: { data: { public_username: username } }
    });

    if (error) return alert(error.message);

    const { data: signed } = await sb.auth.getSession();
    if (!signed.session) {
      closeModal("loginModal");
      alert("Conta criada. Entre agora com nome e senha.");
      authMode = "login";
      toggleAuthMode();
      return;
    }

    closeModal("loginModal");
    await refreshSession();
  } else {
    const { error } = await sb.auth.signInWithPassword({
      email: localAccountEmail(username),
      password
    });

    if (error) return alert("Nome ou senha incorretos.");
    closeModal("loginModal");
    await refreshSession();
  }
}

async function loginWithEmail() {
  await submitAuth();
}

async function signUpWithEmail() {
  authMode = "create";
  toggleAuthMode();
}

async function logout() {
  await sb.auth.signOut();
  mineOnly = false;
  await refreshSession();
}

async function refreshSession() {
  const refreshVersion = ++sessionRefreshVersion;
  const { data } = await sb.auth.getSession();
  if (refreshVersion !== sessionRefreshVersion) return;
  session = data.session;
  profile = null;

  document.querySelectorAll(".dynamic-account-btn").forEach(el => el.remove());
  const loginButton = document.querySelector(".login-btn");
  const titleActions = document.querySelector(".section-title");

  if (session) {
    const { data: account, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (refreshVersion !== sessionRefreshVersion) return;
    if (error) alert(error.message);
    profile = account || {};

    document.querySelectorAll(".dynamic-account-btn").forEach(el => el.remove());

    loginButton.innerHTML = `<img src="${escapeHtml(profile.avatar_url || 'profile-default.png')}" alt="Minha conta">`;
    loginButton.className = "login-btn account-avatar-btn";
    loginButton.title = "Abrir menu da conta";
    loginButton.onclick = () => openAccountMenu();

    const mineButton = document.createElement("button");
    mineButton.className = "mine-button dynamic-account-btn mine-toggle-btn";
    mineButton.textContent = mineOnly ? "Todas as publicações" : "Minhas publicações";
    mineButton.onclick = toggleMine;
    titleActions.insertBefore(mineButton, titleActions.querySelector(".add-btn"));

    if (isAdmin()) {
      const adminButton = document.createElement("button");
      adminButton.className = "mine-button dynamic-account-btn";
      adminButton.textContent = "Painel Administrativo";
      adminButton.onclick = openAccounts;
      titleActions.insertBefore(adminButton, titleActions.querySelector(".add-btn"));

      const notificationButton = document.createElement("button");
      notificationButton.className = "mine-button dynamic-account-btn notification-button";
      notificationButton.textContent = "🔔 Pedidos";
      notificationButton.onclick = openRepresentativeRequests;
      titleActions.insertBefore(notificationButton, titleActions.querySelector(".add-btn"));

      sb.from("representative_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .then(({ count }) => {
          if (count) notificationButton.textContent = `🔔 ${count}`;
        });
    }

    await loadGuilds();
  } else {
    mineOnly = false;
    loginButton.textContent = "♙ Entrar na conta";
    loginButton.className = "login-btn";
    loginButton.onclick = openLogin;
  }

  await loadGuilds();
}

function authorizedAdminEmails() {
  const email = session?.user?.email?.toLowerCase();
  return email === SUPREME_EMAIL || email === "red@peroxide.local";
}

function isAdmin() { return authorizedAdminEmails(); }
function isSupreme() { return authorizedAdminEmails(); }
function isVisualRolesAdminSession() { return authorizedAdminEmails(); }

function canManage(guild) {
  return isAdmin() || guild?.user_id === session?.user?.id;
}

async function openCreate() {
  if (!session) return openLogin();

  if (!profile?.username) {
    openProfileEdit();
    return;
  }

  if (profile.blocked) return alert("Sua conta está bloqueada.");

  const representative = (profile.user_visual_roles || []).some(link =>
    link?.visual_roles?.slug === "representante_guilda"
  );

  if (!representative) {
    document.getElementById("representativeRequestModal").style.display = "flex";
    return;
  }

  editingId = null;
  document.getElementById("guildForm").reset();
  selectedImage = null;
  resetImagePreview();
  document.getElementById("createModal").style.display = "flex";
}

function openEdit(guild) {
  if (!canManage(guild)) return;
  editingId = guild.id;
  document.getElementById("guildName").value = guild.name;
  document.getElementById("guildDescription").value = guild.description;
  document.getElementById("guildDiscord").value = guild.discord;
  document.getElementById("imagePreview").src = guild.image_url;
  selectedImage = null;
  document.getElementById("createModal").style.display = "flex";
}

function resetImagePreview() {
  document.getElementById("imagePreview").src =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23222222'/%3E%3Ctext x='60' y='65' fill='white' text-anchor='middle' font-size='12'%3EFOTO%3C/text%3E%3C/svg%3E";
}

document.getElementById("profileForm")?.addEventListener("submit", async event => {
  event.preventEvent?.();
  event.preventDefault();
  if (!session) return openLogin();

  const username = document.getElementById("publicUsername").value.trim();
  const bio = document.getElementById("publicBio").value.trim();
  if (username.length < 3) return alert("Use pelo menos 3 caracteres.");

  try {
    const update = { username, bio };

    if (selectedProfileImage) {
      update.avatar_url = await uploadProfileImage(selectedProfileImage);
    }

    const { error } = await sb
      .from("profiles")
      .update(update)
      .eq("id", session.user.id);

    if (error) throw error;

    profilePromptShown = true;
    closeModal("profileModal");
    selectedProfileImage = null;
    await refreshSession();
  } catch (error) {
    alert(error.message || "Não foi possível salvar o perfil.");
  }
});

document.getElementById("guildImage")?.addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Escolha um arquivo de imagem válido.");
    event.target.value = "";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    alert("Escolha uma imagem de até 2 MB.");
    event.target.value = "";
    return;
  }
  selectedImage = file;
  const reader = new FileReader();
  reader.onload = () => document.getElementById("imagePreview").src = reader.result;
  reader.readAsDataURL(file);
});

document.getElementById("profileImage")?.addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Escolha um arquivo de imagem válido.");
    event.target.value = "";
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    alert("Escolha uma imagem de até 2 MB.");
    event.target.value = "";
    return;
  }

  selectedProfileImage = file;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById("profileImagePreview").src = reader.result;
  };
  reader.readAsDataURL(file);
});

async function uploadProfileImage(file) {
  const extension = (file.name.split(".").pop() || "jpg")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  const path = `${session.user.id}/avatar.${extension}`;

  const { error } = await sb.storage
    .from("profile-images")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type
    });

  if (error) throw error;
  return sb.storage.from("profile-images").getPublicUrl(path).data.publicUrl;
}

async function uploadGuildImage(file) {
  const extension = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const path = `${session.user.id}/${Date.now()}.${extension}`;
  const { error } = await sb.storage.from("guild-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type
  });
  if (error) throw error;
  return sb.storage.from("guild-images").getPublicUrl(path).data.publicUrl;
}

document.getElementById("guildForm")?.addEventListener("submit", async function(event) {
  event.preventDefault();
  if (!session) return openLogin();
  if (!profile?.username) return openProfileEdit();

  const discord = document.getElementById("guildDiscord").value.trim();
  if (!/^https:\/\/(discord\.gg\/|discord\.com\/invite\/)[a-zA-Z0-9-]+\/?$/.test(discord)) {
    return alert("Insira um convite válido do Discord.");
  }

  try {
    let imageUrl = null;
    if (selectedImage) imageUrl = await uploadGuildImage(selectedImage);

    const payload = {
      name: document.getElementById("guildName").value.trim(),
      description: document.getElementById("guildDescription").value.trim(),
      discord
    };
    if (imageUrl) payload.image_url = imageUrl;

    if (editingId) {
      const guild = guilds.find(item => item.id === editingId);
      if (!canManage(guild)) throw new Error("Você não pode editar esta publicação.");
      const { error } = await sb.from("guilds").update(payload).eq("id", editingId);
      if (error) throw error;
    } else {
      if (!selectedImage) throw new Error("Escolha uma foto para a guilda.");
      payload.user_id = session.user.id;
      const { error } = await sb.from("guilds").insert(payload);
      if (error) throw error;
    }

    editingId = null;
    this.reset();
    selectedImage = null;
    resetImagePreview();
    closeModal("createModal");
    await loadGuilds();
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("representativeRequestForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!session) return openLogin();

  const payload = {
    user_id: session.user.id,
    guild_name: document.getElementById("requestGuildName").value.trim(),
    discord: document.getElementById("requestGuildDiscord").value.trim(),
    info: document.getElementById("requestGuildInfo").value.trim(),
    status: "pending"
  };

  const { error } = await sb.from("representative_requests").insert(payload);
  if (error) return alert(error.message);

  event.target.reset();
  closeModal("representativeRequestModal");
  alert("Pedido enviado. Aguarde a aprovação do administrador.");
  await refreshSession();
});

async function openAccounts() {
  if (!isVisualRolesAdminSession()) return;

  const box = document.getElementById("accountsList");
  box.innerHTML = `
    <div class="custom-role-builder">
      <h3>Criar cargo personalizado</h3>
      <input id="customRoleName" type="text" maxlength="30" placeholder="Nome do cargo">
      <input id="customRoleEmoji" type="text" maxlength="8" placeholder="Emoji opcional">
      <div class="role-color-pair">
        <input id="customRoleColor1" type="color" value="#ff1535" aria-label="Primeira cor">
        <input id="customRoleColor2" type="color" value="#141414" aria-label="Segunda cor">
      </div>
      <button id="createCustomRoleButton" type="button" class="save-btn">Criar cargo</button>
    </div>
    <input id="adminUserSearch" type="search" placeholder="Pesquisar usuário pelo nome">
    <div id="adminUserRows"></div>
  `;

  const { data: roles, error: rolesError } = await sb
    .from("visual_roles")
    .select("id,slug,name,emoji,gradient")
    .order("name");
  if (rolesError) return alert(rolesError.message);

  const { data: users, error: usersError } = await sb
    .from("profiles")
    .select("id,username,avatar_url,bio,blocked,user_visual_roles(role_id,visual_roles(slug,name,emoji,gradient))")
    .order("username");
  if (usersError) return alert(usersError.message);

  const createRoleButton = document.getElementById("createCustomRoleButton");
  createRoleButton.onclick = async () => {
    const name = document.getElementById("customRoleName").value.trim();
    const emoji = document.getElementById("customRoleEmoji").value.trim();
    const colorOne = document.getElementById("customRoleColor1").value;
    const colorTwo = document.getElementById("customRoleColor2").value;
    if (name.length < 2) return alert("O nome do cargo precisa ter ao menos 2 caracteres.");

    const { error } = await sb.rpc("create_visual_role", {
      role_name: name,
      role_emoji: emoji,
      color_one: colorOne,
      color_two: colorTwo
    });
    if (error) return alert(error.message);
    await openAccounts();
  };

  const rows = document.getElementById("adminUserRows");
  const search = document.getElementById("adminUserSearch");

  function renderUsers() {
    const term = search.value.trim().toLocaleLowerCase();
    rows.replaceChildren();

    (users || []).filter(user => (user.username || "").toLocaleLowerCase().includes(term))
      .forEach(user => {
        const row = document.createElement("div");
        row.className = "account-row";

        const avatar = document.createElement("img");
        avatar.src = user.avatar_url || "profile-default.png";
        avatar.alt = "Foto de perfil";

        const details = document.createElement("div");
        details.className = "account-row-details";

        const username = document.createElement("strong");
        username.innerHTML = formatVisualName(user.username || "Usuário", user.user_visual_roles || []);
        const bio = document.createElement("p");
        bio.textContent = user.bio || "Sem bio";
        details.append(username, bio);

        const roleActions = document.createElement("div");
        roleActions.className = "account-actions";
        (roles || []).forEach(role => {
          const assigned = (user.user_visual_roles || []).some(item => item.visual_roles?.slug === role.slug);
          const action = document.createElement("button");
          action.textContent = assigned ? `Remover ${role.name}` : `Dar ${role.name}`;
          action.onclick = async () => {
            const fn = assigned ? "remove_visual_role" : "assign_visual_role";
            const { error } = await sb.rpc(fn, { target_profile: user.id, target_role: role.slug });
            if (error) return alert(error.message);
            await openAccounts();
            await loadGuilds();
          };
          roleActions.appendChild(action);
        });

        row.append(avatar, details, roleActions);
        rows.appendChild(row);
      });
  }

  search.addEventListener("input", renderUsers);
  renderUsers();
  document.getElementById("accountsModal").style.display = "flex";
}

async function openRepresentativeRequests() {
  if (!isAdmin()) return;

  const { data, error } = await sb
    .from("representative_requests")
    .select("*, profiles(id, username, avatar_url, bio, email)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return alert(error.message);

  const box = document.getElementById("accountsList");
  box.innerHTML = "";

  if (!data?.length) {
    box.innerHTML = '<div class="small-note">Nenhum pedido pendente.</div>';
  }

  (data || []).forEach(request => {
    const row = document.createElement("div");
    row.className = "account-row";

    const avatar = document.createElement("img");
    avatar.src = request.profiles?.avatar_url || "profile-default.png";
    avatar.style.cssText = "width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid #d51b35";

    const info = document.createElement("div");
    info.style.cssText = "flex:1;text-align:left";

    const name = document.createElement("strong");
    name.textContent = request.profiles?.username || "Usuário";
    const guild = document.createElement("div");
    guild.textContent = "Guilda: " + request.guild_name;
    guild.style.cssText = "color:#ddd;margin-top:5px";
    const discord = document.createElement("a");
    discord.href = request.discord;
    discord.target = "_blank";
    discord.rel = "noopener noreferrer";
    discord.textContent = request.discord;
    discord.style.cssText = "display:block;color:#8291ff;margin-top:4px";
    const extra = document.createElement("p");
    extra.textContent = request.info;
    extra.style.cssText = "color:#aaa;font-size:13px;margin-top:8px";

    info.append(name, guild, discord, extra);

    const actions = document.createElement("div");
    actions.className = "account-actions";

    const approve = document.createElement("button");
    approve.textContent = "Aprovar representante";
    approve.onclick = async () => {
      const { error: roleError } = await sb.rpc("approve_representative_request", { request_uuid: request.id });
      if (roleError) return alert(roleError.message);
      await openRepresentativeRequests();
      await refreshSession();
    };

    const reject = document.createElement("button");
    reject.textContent = "Recusar";
    reject.onclick = async () => {
      const { error: rejectError } = await sb
        .from("representative_requests")
        .update({ status: "rejected" })
        .eq("id", request.id);
      if (rejectError) return alert(rejectError.message);
      await openRepresentativeRequests();
      await refreshSession();
    };

    actions.append(approve, reject);
    row.append(avatar, info, actions);
    box.appendChild(row);
  });

  document.getElementById("accountsModal").style.display = "flex";
}

sb.auth.onAuthStateChange(async (event, session) => {
  await refreshSession();
});

loadGuilds();

async function openMiniProfile(publicProfile) {
  const box = document.getElementById("miniProfileContent");
  const avatar = publicProfile?.avatar_url || "profile-default.png";
  const name = publicProfile?.username || "Usuário";
  const bio = publicProfile?.bio || "Nenhuma descrição definida.";

  const ownsProfile = session?.user?.id && publicProfile?.id === session.user.id;

  box.innerHTML = `
    <img src="${escapeHtml(avatar)}" alt="Foto de perfil" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid #d51b35;margin-bottom:14px">
    <h3 style="margin-bottom:10px">${formatVisualName(name, publicProfile?.user_visual_roles || [])}</h3>
    <p style="color:#bbb;line-height:1.5;white-space:pre-wrap">${escapeHtml(bio)}</p>
  `;

  if (ownsProfile) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "mine-button";
    editButton.textContent = "Editar perfil";
    editButton.style.marginTop = "18px";
    editButton.onclick = () => {
      closeModal("miniProfileModal");
      openProfileEdit();
    };
    box.appendChild(editButton);
  }

  if (authorizedAdminEmails() && publicProfile?.id && session?.user?.id !== publicProfile.id) {
    const roleActions = document.createElement("div");
    roleActions.className = "mini-role-actions";
    roleActions.style.marginTop = "16px";

    const { data: roles, error: rolesError } = await sb
      .from("visual_roles")
      .select("slug,name,emoji")
      .order("name");
    if (rolesError) return alert(rolesError.message);

    (roles || []).forEach(role => {
      const assigned = (publicProfile.user_visual_roles || []).some(link =>
        link?.visual_roles?.slug === role.slug
      );

      const button = document.createElement("button");
      button.type = "button";
      button.className = "mine-button";
      button.style.cssText = "margin:5px;padding:8px 10px";
      const label = `${role.name}${role.emoji ? ` ${role.emoji}` : ""}`;
      button.textContent = assigned ? `Remover ${label}` : `Dar ${label}`;

      button.onclick = async () => {
        const fn = assigned ? "remove_visual_role" : "assign_visual_role";
        const { error } = await sb.rpc(fn, {
          target_profile: publicProfile.id,
          target_role: role.slug
        });

        if (error) return alert(error.message);
        await loadGuilds();
        const { data: updatedProfile, error: profileError } = await sb
          .from("profiles")
          .select("id,username,avatar_url,bio,user_visual_roles(role_id,visual_roles(slug,name,emoji,gradient))")
          .eq("id", publicProfile.id)
          .single();
        if (profileError) return alert(profileError.message);
        await openMiniProfile(updatedProfile);
      };

      roleActions.appendChild(button);
    });

    box.appendChild(roleActions);
  }

  document.getElementById("miniProfileModal").style.display = "flex";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatVisualName(username, roleLinks) {
  const originalName = escapeHtml(username || "Usuário");
  const roles = (roleLinks || [])
    .map(link => link?.visual_roles)
    .filter(Boolean);

  if (!roles.length) {
    return `<span style="color:#fff">${originalName}</span>`;
  }

  return `<span class="visual-username">${originalName}${roles.map(role => {
    const safeName = escapeHtml(role.name);
    const safeEmoji = escapeHtml(role.emoji || "").trim();
    const emojiText = safeEmoji ? ` ${safeEmoji}` : "";
    const slug = escapeHtml(role.slug || "custom");
    const gradient = escapeHtml(role.gradient || "linear-gradient(135deg,#ff1535,#141414)");
    return `<span class="visual-role visual-role-${slug}" style="--role-gradient:${gradient}"> (${safeName}${emojiText})</span>`;
  }).join("")}</span>`;
}

const profileInteractionStyle = document.createElement("style");
profileInteractionStyle.textContent = `
.author-profile{display:inline-flex;align-items:center;gap:8px;margin:0 auto 10px;border:none;background:transparent;color:#aaa;cursor:pointer;font:inherit}
.author-profile img{width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid #d51b35}
.guild-like{transition:.18s transform,.18s color}
.guild-like:hover{transform:scale(1.18)}
.guild-like:active{transform:scale(.82)}
`;
document.head.appendChild(profileInteractionStyle);

const visualRoleStyle = document.createElement("style");
visualRoleStyle.textContent = `
@keyframes visual-role-gradient-flow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
.visual-username{display:inline-block;font-weight:bold;background:linear-gradient(135deg,#fff 0%,#ddd 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.visual-role{display:inline-flex;flex-direction:column;vertical-align:baseline;background:var(--role-gradient);background-size:220% 220%;background-position:0% 50%;animation:visual-role-gradient-flow 4s ease-in-out infinite;-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900}
.visual-role:after{content:"";display:block;width:100%;height:2px;margin-top:1px;border-radius:2px;background:var(--role-gradient);background-size:220% 220%;animation:visual-role-gradient-flow 4s ease-in-out infinite}
.visual-role-dev{-webkit-text-stroke:.15px rgba(255,255,255,.18)}
.account-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid #333}
.account-row .account-actions{margin:0;justify-content:flex-end;flex-wrap:wrap}
#adminUserSearch{background:#090909;border:1px solid #393939;border-radius:8px;padding:12px;color:white;font:inherit}
@media(max-width:500px){.account-row{align-items:flex-start;flex-direction:column}.account-row .account-actions{justify-content:flex-start}}
@media(prefers-reduced-motion:reduce){.visual-role,.visual-role:after{animation:none}}
`;
document.head.appendChild(visualRoleStyle);

const customRoleStyle = document.createElement("style");
customRoleStyle.textContent = `
.custom-role-builder{background:#151515;border:1px solid #3a3a3a;border-radius:10px;padding:14px;margin-bottom:14px}
.custom-role-builder input[type="text"]{width:100%;margin:5px 0;background:#090909;border:1px solid #393939;border-radius:8px;padding:11px;color:white;font:inherit}
.custom-role-builder input[type="color"]{width:54px;height:54px;border:1px solid #555;border-radius:8px;background:#090909;padding:4px}
`;
document.head.appendChild(customRoleStyle);

const actionButtonStyle = document.createElement("style");
actionButtonStyle.textContent = `
.section-title{flex-wrap:wrap}
.mine-button{min-height:42px;padding:10px 14px;border:1px solid #d51b35;border-radius:8px;background:linear-gradient(135deg,#1a1012,#0b0b0b);color:#fff!important;box-shadow:0 4px 14px rgba(197,23,49,.12);font-weight:bold;letter-spacing:.2px}
.mine-button:hover{background:linear-gradient(135deg,#d51b35,#171717);border-color:#f02745}
.role-presets{display:flex;gap:8px;margin:8px 0 12px;flex-wrap:wrap}
.role-preset{border:none;border-radius:8px;padding:10px 12px;color:white;font-weight:bold;cursor:pointer}
.role-preset-dev{background:linear-gradient(135deg,#ff1535 0 50%,#7a1421 75%,#141414)}
.role-preset-content{background:linear-gradient(135deg,#ff1688 0%,#ff78c5 55%,#fff);color:#34101f}
`;
document.head.appendChild(actionButtonStyle);

const accountAvatarStyle = document.createElement("style");
accountAvatarStyle.textContent = `
.account-avatar-btn{display:inline-flex!important;align-items:center;gap:8px;padding:7px 10px!important;border:1px solid #d51b35!important;border-radius:25px!important;background:linear-gradient(135deg,#171313,#090909)!important}
.account-avatar-btn img{width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid #d51b35}
.account-avatar-btn span{font-size:12px;white-space:nowrap}
.notification-button{border-color:#7cffb2!important;color:#baffd5!important;box-shadow:0 4px 14px rgba(63,190,120,.12)!important}
.account-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid #333}
.account-row .account-actions{margin:0;justify-content:flex-end;flex-wrap:wrap}
@media(max-width:500px){.account-row{align-items:flex-start;flex-direction:column}.account-row .account-actions{justify-content:flex-start}}
`;
document.head.appendChild(accountAvatarStyle);

const accountMenuStyle = document.createElement("style");
accountMenuStyle.textContent = `
.account-avatar-btn{width:48px;height:48px;border-radius:50%!important;padding:3px!important;border:2px solid #d51b35!important;background:#111!important;display:flex!important;align-items:center;justify-content:center}
.account-avatar-btn img{width:40px;height:40px;border-radius:50%;object-fit:cover}
.account-menu{z-index:20;width:170px;background:#111;border:1px solid #d51b35;border-radius:10px;padding:6px;box-shadow:0 12px 30px rgba(0,0,0,.55)}
.account-menu button{display:block;width:100%;border:none;background:transparent;color:white;text-align:left;padding:12px;border-radius:7px;cursor:pointer;font-weight:bold}
.account-menu button:hover{background:#24171a;color:#ff6b7d}
`;
document.head.appendChild(accountMenuStyle);

const guildFeaturesStyle = document.createElement("style");
guildFeaturesStyle.textContent = `
.guild-description{min-height:42px;max-height:84px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
.description-more-btn{display:block;margin:8px auto 0;border:none;background:transparent;color:#d51b35;cursor:pointer;font-weight:bold;text-decoration:underline}
.guild-stats{display:flex;justify-content:center;align-items:center;gap:14px;margin-top:12px!important;color:#aaa!important}
.guild-like{border:none;background:transparent;color:#e21d3b;font-size:18px;font-weight:bold;cursor:pointer;padding:4px;transition:.18s transform,.18s color}
.guild-like:hover{transform:scale(1.18)}
.guild-like:active{transform:scale(.82)}
#showMore{background:#d51b35;color:white;border:none;padding:13px 22px;border-radius:8px;font-weight:bold;cursor:pointer}
`;
document.head.appendChild(guildFeaturesStyle);

function openDescription(title, text) {
  document.getElementById("descriptionModalTitle").textContent = title;
  document.getElementById("descriptionModalText").textContent = text;
  document.getElementById("descriptionModal").style.display = "flex";
}

document.getElementById("descriptionModal").addEventListener("click", event => {
  if (event.target.id === "descriptionModal") {
    closeModal("descriptionModal");
  }
});

async function handleOAuthReturn() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return;

  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    alert("Erro ao concluir login: " + error.message);
  } else {
    history.replaceState({}, document.title, location.origin + location.pathname);
    await refreshSession();
  }
}

handleOAuthReturn();

function openAccountMenu() {
  const menu = document.getElementById("accountMenu") || (() => {
    const element = document.createElement("div");
    element.id = "accountMenu";
    element.className = "account-menu";
    document.body.appendChild(element);
    return element;
  })();

  menu.innerHTML = `
    <button type="button" id="accountMenuProfile">Meu perfil</button>
    <button type="button" id="accountMenuLogout">Sair da conta</button>
  `;

  const loginButton = document.querySelector(".login-btn");
  const rect = loginButton.getBoundingRect?.() || loginButton.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${rect.bottom + 8}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.style.display = "block";

  document.getElementById("accountMenuProfile").onclick = () => {
    menu.style.display = "none";
    openProfile();
  };
  document.getElementById("accountMenuLogout").onclick = () => {
    menu.style.display = "none";
    logout();
  };
}
