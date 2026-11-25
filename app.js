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
let selectedProfileImage = null;
let selectedProfileBanner = null;
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
    .select("*, profiles(id, username, avatar_url, bio, banner_url, social_url, is_private, role, blocked, user_visual_roles(role_id, visual_roles(slug,name,emoji,gradient,animated)))")
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

    const contentLinks = Array.isArray(guild.content_links) ? guild.content_links : [];
    const contentLinksBox = document.createElement("div");
    contentLinksBox.className = "guild-content-links";
    contentLinks.forEach(item => {
      const platform = getContentPlatform(item?.url);
      if (!platform) return;
      const contentLink = document.createElement("a");
      contentLink.className = "content-platform-btn";
      contentLink.href = item.url;
      contentLink.target = "_blank";
      contentLink.rel = "noopener noreferrer";
      contentLink.innerHTML = `${platform.icon} <span>${platform.name}</span>`;
      contentLink.onclick = () => registerGuildView(guild);
      contentLinksBox.appendChild(contentLink);
    });

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

    card.append(link);
    if (contentLinksBox.childElementCount) card.appendChild(contentLinksBox);
    card.append(stats);

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

async function deleteGuild(guild) {
  if (!canManage(guild)) return;
  if (!confirm(`Excluir a publicação “${guild.name}”? Essa ação não pode ser desfeita.`)) return;
  const { error } = await sb.from("guilds").delete().eq("id", guild.id);
  if (error) return alert(error.message);
  await loadGuilds();
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
  document.getElementById("publicSocial").value = profile.social_url || "";
  document.getElementById("profileImagePreview").src = profile.avatar_url || "profile-default.png";
  document.getElementById("profileBannerPreview").src = profile.banner_url || "";
  document.getElementById("profileBannerPreview").hidden = !profile.banner_url;
  document.getElementById("publicProfilePrivate").checked = !!profile.is_private;
  selectedProfileImage = null;
  selectedProfileBanner = null;
  renderProfileLivePreview();
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
      .select("*, user_visual_roles(role_id, visual_roles(slug,name,emoji,gradient,animated))")
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

  editingId = null;
  document.getElementById("guildForm").reset();
  [1, 2, 3].forEach(number => {
    const field = document.getElementById(`guildContent${number}`);
    if (field) field.value = "";
  });
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
  const links = Array.isArray(guild.content_links) ? guild.content_links : [];
  [1, 2, 3].forEach((number, index) => {
    const field = document.getElementById(`guildContent${number}`);
    if (field) field.value = links[index]?.url || "";
  });
  document.getElementById("imagePreview").src = guild.image_url;
  selectedImage = null;
  document.getElementById("createModal").style.display = "flex";
}

function resetImagePreview() {
  document.getElementById("imagePreview").src =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23222222'/%3E%3Ctext x='60' y='65' fill='white' text-anchor='middle' font-size='12'%3EFOTO%3C/text%3E%3C/svg%3E";
}

document.getElementById("profileForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!session) return openLogin();

  const username = document.getElementById("publicUsername").value.trim();
  const bio = document.getElementById("publicBio").value.trim();
  const socialRaw = document.getElementById("publicSocial").value.trim();
  if (username.length < 3) return alert("Use pelo menos 3 caracteres.");
  if (!/^[\p{L}\p{N} _.-]{3,30}$/u.test(username)) return alert("Use de 3 a 30 caracteres: letras, números, espaços, ponto, hífen ou underline.");

  const { data: nameTaken, error: nameCheckError } = await sb.from("profiles")
    .select("id").ilike("username", username).neq("id", session.user.id).limit(1);
  if (nameCheckError) return alert("Não foi possível verificar o nome: " + nameCheckError.message);
  if (nameTaken?.length) return alert("Esse nome de perfil já está em uso.");

  let socialUrl = null;
  if (socialRaw) {
    socialUrl = normalizeProfileUrl(socialRaw);
    if (!getSocialPlatform(socialUrl)) {
      return alert("Use um link válido de Instagram, X, YouTube, Twitch, TikTok, Discord ou GitHub.");
    }
  }

  try {
    const update = {
      username,
      bio,
      social_url: socialUrl,
      is_private: document.getElementById("publicProfilePrivate").checked
    };

    if (selectedProfileImage) {
      update.avatar_url = await uploadProfileImage(selectedProfileImage);
    }
    if (selectedProfileBanner) {
      update.banner_url = await uploadProfileBanner(selectedProfileBanner);
    }

    const { error } = await sb
      .from("profiles")
      .update(update)
      .eq("id", session.user.id);

    if (error) throw error;

    profilePromptShown = true;
    closeModal("profileModal");
    selectedProfileImage = null;
    selectedProfileBanner = null;
    await refreshSession();
    if (profile) await openMiniProfile(profile);
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
    renderProfileLivePreview();
  };
  reader.readAsDataURL(file);
});

document.getElementById("profileBanner")?.addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Escolha um arquivo de imagem válido.");
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("Escolha um banner de até 5 MB.");
    event.target.value = "";
    return;
  }
  selectedProfileBanner = file;
  const reader = new FileReader();
  reader.onload = () => {
    const preview = document.getElementById("profileBannerPreview");
    preview.src = reader.result;
    preview.hidden = false;
    renderProfileLivePreview();
  };
  reader.readAsDataURL(file);
});

["publicUsername", "publicBio", "publicSocial", "publicProfilePrivate"].forEach(id => {
  const field = document.getElementById(id);
  if (!field) return;
  field.addEventListener("input", renderProfileLivePreview);
  field.addEventListener("change", renderProfileLivePreview);
});

async function uploadProfileBanner(file) {
  const extension = (file.name.split(".").pop() || "jpg")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  const path = `${session.user.id}/banner.${extension}`;
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

    const contentLinks = [];
    for (const number of [1, 2, 3]) {
      const rawUrl = document.getElementById(`guildContent${number}`)?.value.trim() || "";
      if (!rawUrl) continue;
      const platform = getContentPlatform(rawUrl);
      if (!platform || !isCreatorProfileUrl(rawUrl, platform.key)) {
        throw new Error(`O link ${number} precisa ser um perfil válido de YouTube, Twitch ou TikTok. Links de vídeos, lives e publicações não são aceitos.`);
      }
      contentLinks.push({ platform: platform.key, url: normalizeProfileUrl(rawUrl) });
    }

    const guildName = document.getElementById("guildName").value.trim();
    if (guildName.length < 3) throw new Error("O nome da guilda precisa ter pelo menos 3 caracteres.");
    let nameQuery = sb.from("guilds").select("id").ilike("name", guildName).limit(1);
    if (editingId) nameQuery = nameQuery.neq("id", editingId);
    const { data: duplicateGuilds, error: duplicateGuildError } = await nameQuery;
    if (duplicateGuildError) throw duplicateGuildError;
    if (duplicateGuilds?.length) throw new Error("Já existe uma guilda com esse nome.");

    const payload = {
      name: guildName,
      description: document.getElementById("guildDescription").value.trim(),
      discord,
      content_links: contentLinks
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

async function openAccounts() {
  if (!isVisualRolesAdminSession()) return;

  const box = document.getElementById("accountsList");
  box.innerHTML = `
    <div class="admin-tabs">
      <button type="button" class="admin-tab active" data-tab="roles">Cargos</button>
      <button type="button" class="admin-tab" data-tab="users">Usuários</button>
    </div>
    <section id="adminRolesPanel">
      <div class="custom-role-builder">
        <h3 id="roleEditorTitle">Criar cargo visual</h3>
        <label for="customRoleName">Nome</label>
        <input id="customRoleName" type="text" maxlength="30" placeholder="Ex.: Desenvolvedor">
        <label for="customRoleEmoji">Emoji (opcional)</label>
        <input id="customRoleEmoji" type="text" maxlength="8" placeholder="Ex.: ⚔️">
        <div class="role-color-pair">
          <label>Cor inicial <input id="customRoleColor1" type="color" value="#ff1535"></label>
          <label>Cor final <input id="customRoleColor2" type="color" value="#141414"></label>
        </div>
        <label class="role-animation-option"><input id="customRoleAnimated" type="checkbox"> Gradiente animado</label>
        <div id="rolePreview" class="role-preview">Prévia do cargo</div>
        <div class="role-editor-actions">
          <button id="saveCustomRoleButton" type="button" class="save-btn">Criar cargo</button>
          <button id="cancelRoleEditButton" type="button" class="cancel-btn" hidden>Cancelar edição</button>
        </div>
      </div>
      <h3 class="admin-subtitle">Cargos existentes</h3>
      <div id="adminRoleRows"></div>
    </section>
    <section id="adminUsersPanel" hidden>
      <input id="adminUserSearch" type="search" placeholder="Pesquisar usuário pelo nome">
      <div id="adminUserRows"></div>
    </section>
  `;

  const [rolesResponse, usersResponse] = await Promise.all([
    sb.from("visual_roles").select("id,slug,name,emoji,gradient,animated").order("name"),
    sb.from("profiles").select("id,username,avatar_url,bio,banner_url,social_url,blocked,user_visual_roles(role_id,visual_roles(slug,name,emoji,gradient,animated))").order("username")
  ]);
  if (rolesResponse.error) return alert(rolesResponse.error.message);
  if (usersResponse.error) return alert(usersResponse.error.message);

  const roles = rolesResponse.data || [];
  const users = usersResponse.data || [];
  let editingRoleId = null;

  const tabs = [...box.querySelectorAll(".admin-tab")];
  tabs.forEach(tab => tab.addEventListener("click", () => {
    tabs.forEach(item => item.classList.toggle("active", item === tab));
    document.getElementById("adminRolesPanel").hidden = tab.dataset.tab !== "roles";
    document.getElementById("adminUsersPanel").hidden = tab.dataset.tab !== "users";
  }));

  const nameInput = document.getElementById("customRoleName");
  const emojiInput = document.getElementById("customRoleEmoji");
  const colorOneInput = document.getElementById("customRoleColor1");
  const colorTwoInput = document.getElementById("customRoleColor2");
  const animatedInput = document.getElementById("customRoleAnimated");
  const preview = document.getElementById("rolePreview");
  const saveButton = document.getElementById("saveCustomRoleButton");
  const cancelButton = document.getElementById("cancelRoleEditButton");

  function currentGradient() {
    return `linear-gradient(110deg,${colorOneInput.value},${colorTwoInput.value})`;
  }
  function updateRolePreview() {
    preview.textContent = `${emojiInput.value.trim()} ${nameInput.value.trim() || "Prévia do cargo"}`.trim();
    preview.style.backgroundImage = currentGradient();
    preview.classList.toggle("is-animated", animatedInput.checked);
  }
  [nameInput, emojiInput, colorOneInput, colorTwoInput, animatedInput].forEach(input => {
    input.addEventListener("input", updateRolePreview);
    input.addEventListener("change", updateRolePreview);
  });
  updateRolePreview();

  function resetRoleEditor() {
    editingRoleId = null;
    nameInput.value = "";
    emojiInput.value = "";
    colorOneInput.value = "#ff1535";
    colorTwoInput.value = "#141414";
    animatedInput.checked = false;
    document.getElementById("roleEditorTitle").textContent = "Criar cargo visual";
    saveButton.textContent = "Criar cargo";
    cancelButton.hidden = true;
    updateRolePreview();
  }
  cancelButton.onclick = resetRoleEditor;

  async function renderRoleRows() {
    const roleRows = document.getElementById("adminRoleRows");
    roleRows.replaceChildren();
    if (!roles.length) {
      roleRows.innerHTML = '<p class="small-note">Nenhum cargo visual criado ainda.</p>';
      return;
    }
    roles.forEach(role => {
      const count = users.filter(user => (user.user_visual_roles || []).some(link => link.role_id === role.id)).length;
      const row = document.createElement("article");
      row.className = "admin-role-row";
      const info = document.createElement("div");
      info.className = "admin-role-info";
      const name = document.createElement("strong");
      name.className = `admin-role-name${role.animated ? " is-animated" : ""}`;
      name.textContent = `${role.emoji || ""} ${role.name}`.trim();
      name.style.backgroundImage = role.gradient || "linear-gradient(110deg,#ff1535,#141414)";
      const members = document.createElement("small");
      members.textContent = `${count} ${count === 1 ? "membro" : "membros"}`;
      info.append(name, members);
      const actions = document.createElement("div");
      actions.className = "admin-role-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Editar";
      edit.onclick = () => {
        editingRoleId = role.id;
        nameInput.value = role.name || "";
        emojiInput.value = role.emoji || "";
        const colors = [...String(role.gradient || "").matchAll(/#[0-9a-fA-F]{6}/g)].map(match => match[0]);
        colorOneInput.value = colors[0] || "#ff1535";
        colorTwoInput.value = colors[1] || "#141414";
        animatedInput.checked = !!role.animated;
        document.getElementById("roleEditorTitle").textContent = "Editar cargo visual";
        saveButton.textContent = "Salvar alterações";
        cancelButton.hidden = false;
        updateRolePreview();
        document.getElementById("adminRolesPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      };
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-action";
      remove.textContent = "Excluir";
      remove.onclick = async () => {
        if (!confirm(`Excluir o cargo “${role.name}”? Ele também será removido dos usuários que o possuem.`)) return;
        const { error } = await sb.rpc("delete_visual_role", { target_role_id: role.id });
        if (error) return alert(error.message);
        await openAccounts();
      };
      actions.append(edit, remove);
      row.append(info, actions);
      roleRows.appendChild(row);
    });
  }

  saveButton.onclick = async () => {
    const name = nameInput.value.trim();
    const emoji = emojiInput.value.trim();
    if (name.length < 2) return alert("O nome do cargo precisa ter ao menos 2 caracteres.");
    const gradient = currentGradient();
    if (editingRoleId) {
      const { error } = await sb.rpc("update_visual_role", {
        target_role_id: editingRoleId,
        role_name: name,
        role_emoji: emoji,
        role_gradient: gradient,
        role_animated: animatedInput.checked
      });
      if (error) return alert(error.message);
    } else {
      const { error } = await sb.rpc("create_visual_role", {
        role_name: name,
        role_emoji: emoji,
        color_one: colorOneInput.value,
        color_two: colorTwoInput.value
      });
      if (error) return alert(error.message);
      const { data: created, error: lookupError } = await sb.from("visual_roles").select("id").eq("name", name).maybeSingle();
      if (lookupError) return alert(lookupError.message);
      if (created?.id) {
        const { error: animationError } = await sb.rpc("update_visual_role", {
          target_role_id: created.id,
          role_name: name,
          role_emoji: emoji,
          role_gradient: gradient,
          role_animated: animatedInput.checked
        });
        if (animationError) return alert(animationError.message);
      }
    }
    await openAccounts();
  };

  const rows = document.getElementById("adminUserRows");
  const search = document.getElementById("adminUserSearch");
  function renderUsers() {
    const term = search.value.trim().toLocaleLowerCase();
    rows.replaceChildren();
    users.filter(user => (user.username || "").toLocaleLowerCase().includes(term)).forEach(user => {
      const row = document.createElement("div");
      row.className = "account-row";
      const avatar = document.createElement("img");
      avatar.src = user.avatar_url || "profile-default.png";
      avatar.alt = "Foto de perfil";
      avatar.className = "admin-user-avatar";
      const details = document.createElement("div");
      details.className = "account-row-details";
      const username = document.createElement("strong");
      username.innerHTML = formatVisualName(user.username || "Usuário", user.user_visual_roles || []);
      const assignedNames = (user.user_visual_roles || []).map(item => item.visual_roles?.name).filter(Boolean);
      const currentRoles = document.createElement("p");
      currentRoles.className = "admin-user-roles";
      currentRoles.textContent = assignedNames.length ? `Cargos: ${assignedNames.join(", ")}` : "Sem cargos atribuídos";
      details.append(username, currentRoles);
      const roleActions = document.createElement("div");
      roleActions.className = "account-actions";
      roles.forEach(role => {
        const assigned = (user.user_visual_roles || []).some(item => item.role_id === role.id);
        const action = document.createElement("button");
        action.type = "button";
        action.textContent = assigned ? `Remover ${role.name}` : `Atribuir ${role.name}`;
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
  await renderRoleRows();
  document.getElementById("accountsModal").style.display = "flex";
}

sb.auth.onAuthStateChange(async (event, session) => {
  await refreshSession();
});

loadGuilds();

function profileCardMarkup(publicProfile, options = {}) {
  const avatar = publicProfile?.avatar_url || "profile-default.png";
  const banner = publicProfile?.banner_url || "";
  const name = publicProfile?.username || "Usuário";
  const bio = publicProfile?.bio || "Nenhuma descrição definida.";
  const socialUrl = publicProfile?.social_url || "";
  const social = socialUrl ? getSocialPlatform(socialUrl) : null;
  const roleLinks = publicProfile?.user_visual_roles || [];
  const roles = roleLinks.map(link => link?.visual_roles).filter(Boolean);
  const socialIcons = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.8 5.7 22H2.5l7.3-8.4L1.8 2h6.5l4.4 6.6L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23 7a3 3 0 0 0-2.1-2.1C19 4.4 12 4.4 12 4.4s-7 0-8.9.5A3 3 0 0 0 1 7a31 31 0 0 0-.5 5 31 31 0 0 0 .5 5 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5A3 3 0 0 0 23 17a31 31 0 0 0 .5-5 31 31 0 0 0-.5-5ZM10 15.5v-7l6 3.5-6 3.5Z"/></svg>',
    twitch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 2h18v13l-5 5h-4l-3 3H7v-3H2V5l2-3Zm1 3v12h4v3l3-3h5l3-3V5H5Zm5 2h2v6h-2V7Zm5 0h2v6h-2V7Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.6 2c.3 2.5 1.7 4 4.4 4.2v3.2a9 9 0 0 1-4.4-1.3v7.2a6.7 6.7 0 1 1-6.7-6.7c.4 0 .8 0 1.2.1v3.5a3.3 3.3 0 1 0 2.2 3.1V2h3.3Z"/></svg>',
    discord: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.7 5.1A18.2 18.2 0 0 0 15.2 3.7l-.6 1.2a16.7 16.7 0 0 0-5.2 0l-.6-1.2a18.2 18.2 0 0 0-4.5 1.4C1.4 9.3.6 13.4 1 17.5a18.3 18.3 0 0 0 5.5 2.8l1.2-2a11.8 11.8 0 0 1-1.9-.9l.5-.4a13 13 0 0 0 11.4 0l.5.4a11.8 11.8 0 0 1-1.9.9l1.2 2a18.3 18.3 0 0 0 5.5-2.8c.5-4.8-.8-8.9-3.3-12.4Z"/></svg>',
    github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .8a11.2 11.2 0 0 0-3.5 21.8c.6.1.8-.3.8-.6v-2.1c-3.1.7-3.8-1.3-3.8-1.3-.5-1.3-1.2-1.6-1.2-1.6-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 .1.7 2.1 3.8 1.5.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.2-5.1-5.5 0-1.2.4-2.1 1.1-2.9-.1-.3-.5-1.4.1-2.9 0 0 .9-.3 3 1.1a10.4 10.4 0 0 1 5.5 0c2.1-1.4 3-1.1 3-1.1.6 1.5.2 2.6.1 2.9.7.8 1.1 1.7 1.1 2.9 0 4.3-2.6 5.2-5.1 5.5.4.3.8 1 .8 2v3c0 .3.2.7.8.6A11.2 11.2 0 0 0 12 .8Z"/></svg>'
  };
  const bannerStyle = banner ? ` style="background-image:url('${escapeHtml(banner)}')"` : "";
  return `<article class="discord-profile-card">
    <div class="discord-profile-banner${banner ? " has-banner" : ""}"${bannerStyle}></div>
    <div class="discord-profile-main">
      <div class="discord-profile-topline">
        <img class="discord-profile-avatar" src="${escapeHtml(avatar)}" alt="Foto de perfil">
        <div class="discord-profile-identity"><h3>${escapeHtml(name)}</h3>${roles.length ? `<div class="discord-profile-roles">${roles.map(role => `<span class="discord-profile-role${role.animated ? " is-animated" : ""}" style="--role-gradient:${escapeHtml(role.gradient || "linear-gradient(135deg,#ff1535,#141414)")}">${escapeHtml(role.emoji || "")} ${escapeHtml(role.name)}</span>`).join("")}</div>` : ""}</div>
      </div>
      <div class="discord-profile-divider"></div>
      <p class="discord-profile-bio">${escapeHtml(bio)}</p>
      ${social && socialUrl ? `<a class="discord-profile-social" href="${escapeHtml(socialUrl)}" target="_blank" rel="noopener noreferrer"><span class="social-logo social-${social.key}">${socialIcons[social.key] || ""}</span><span><small>REDE SOCIAL</small><strong>${social.name}</strong></span><span class="social-external">↗</span></a>` : ""}
    </div>
  </article>`;
}

function renderProfileLivePreview() {
  const target = document.getElementById("profileLivePreview");
  if (!target) return;
  const avatar = document.getElementById("profileImagePreview")?.src || profile?.avatar_url || "profile-default.png";
  const bannerPreview = document.getElementById("profileBannerPreview");
  const banner = selectedProfileBanner ? (bannerPreview?.src || profile?.banner_url || "") : (profile?.banner_url || "");
  const socialRaw = document.getElementById("publicSocial")?.value.trim() || "";
  const normalizedSocial = socialRaw ? normalizeProfileUrl(socialRaw) : "";
  const draft = {
    username: document.getElementById("publicUsername")?.value.trim() || "Seu nome",
    avatar_url: avatar,
    banner_url: banner,
    bio: document.getElementById("publicBio")?.value || "Sua biografia aparecerá aqui.",
    social_url: normalizedSocial,
    user_visual_roles: profile?.user_visual_roles || []
  };
  target.innerHTML = profileCardMarkup(draft, { preview: true });
}

async function exportProfileCard(format, cardElement) {
  if (!cardElement) return alert("Cartão de perfil não encontrado.");
  if (typeof window.html2canvas !== "function") return alert("A ferramenta de exportação ainda não carregou. Atualize a página e tente novamente.");
  const canvas = await window.html2canvas(cardElement, { backgroundColor: "#20232b", scale: 2, useCORS: true, allowTaint: false });
  if (format === "png") {
    const link = document.createElement("a");
    link.download = `perfil-${(profile?.username || "usuario").replace(/[^a-z0-9_-]/gi, "-")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    return;
  }
  if (typeof window.GIF !== "function") return alert("A ferramenta de GIF ainda não carregou. Atualize a página e tente novamente.");
  const gif = new window.GIF({ workers: 2, quality: 10, width: canvas.width, height: canvas.height, workerScript: "https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.worker.js" });
  const frames = 16;
  for (let index = 0; index < frames; index++) {
    const frame = await window.html2canvas(cardElement, { backgroundColor: "#20232b", scale: 2, useCORS: true, allowTaint: false });
    gif.addFrame(frame, { delay: 120, copy: true });
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  gif.on("finished", blob => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `perfil-${(profile?.username || "usuario").replace(/[^a-z0-9_-]/gi, "-")}.gif`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  gif.render();
}

async function openMiniProfile(publicProfile) {
  const box = document.getElementById("miniProfileContent");
  const ownsProfile = session?.user?.id && publicProfile?.id === session.user.id;
  if (publicProfile?.is_private && !ownsProfile) {
    box.innerHTML = `<div class="discord-profile-private"><div class="discord-profile-private-icon">🔒</div><h3>Perfil privado</h3><p>Este usuário escolheu manter o perfil fechado.</p></div>`;
    document.getElementById("miniProfileModal").style.display = "flex";
    return;
  }
  const roleLinks = publicProfile?.user_visual_roles || [];
  box.innerHTML = profileCardMarkup(publicProfile);

  const exportActions = document.createElement("div");
  exportActions.className = "discord-profile-export-actions";
  const pngButton = document.createElement("button");
  pngButton.type = "button";
  pngButton.textContent = "Exportar PNG";
  pngButton.onclick = () => exportProfileCard("png", box.querySelector(".discord-profile-card"));
  const gifButton = document.createElement("button");
  gifButton.type = "button";
  gifButton.textContent = "Exportar GIF";
  gifButton.onclick = () => exportProfileCard("gif", box.querySelector(".discord-profile-card"));
  exportActions.append(pngButton, gifButton);
  box.appendChild(exportActions);

  if (ownsProfile) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "mine-button discord-profile-edit";
    editButton.textContent = "Editar perfil";
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
    const { data: roles, error: rolesError } = await sb.from("visual_roles").select("slug,name,emoji,gradient,animated").order("name");
    if (rolesError) return alert(rolesError.message);
    roles.forEach(role => {
      const assigned = roleLinks.some(link => link?.visual_roles?.slug === role.slug);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mine-button";
      button.style.cssText = "margin:5px;padding:8px 10px";
      const label = `${role.name}${role.emoji ? ` ${role.emoji}` : ""}`;
      button.textContent = assigned ? `Remover ${label}` : `Dar ${label}`;
      button.onclick = async () => {
        const fn = assigned ? "remove_visual_role" : "assign_visual_role";
        const { error } = await sb.rpc(fn, { target_profile: publicProfile.id, target_role: role.slug });
        if (error) return alert(error.message);
        await loadGuilds();
        const { data: updatedProfile, error: profileError } = await sb.from("profiles")
          .select("id,username,avatar_url,bio,banner_url,social_url,is_private,user_visual_roles(role_id,visual_roles(slug,name,emoji,gradient,animated))")
          .eq("id", publicProfile.id).single();
        if (profileError) return alert(profileError.message);
        await openMiniProfile(updatedProfile);
      };
      roleActions.appendChild(button);
    });
    box.appendChild(roleActions);
  }
  document.getElementById("miniProfileModal").style.display = "flex";
}

function getSocialPlatform(value) {
  try {
    const url = new URL(normalizeProfileUrl(value));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (["instagram.com"].includes(host)) return { key: "instagram", name: "Instagram", short: "IG" };
    if (["x.com", "twitter.com"].includes(host)) return { key: "x", name: "X", short: "𝕏" };
    if (["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) return { key: "youtube", name: "YouTube", short: "▶" };
    if (["twitch.tv"].includes(host)) return { key: "twitch", name: "Twitch", short: "TW" };
    if (["tiktok.com"].includes(host)) return { key: "tiktok", name: "TikTok", short: "♪" };
    if (["discord.com", "discord.gg"].includes(host)) return { key: "discord", name: "Discord", short: "DC" };
    if (["github.com"].includes(host)) return { key: "github", name: "GitHub", short: "GH" };
  } catch (_) {}
  return null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeProfileUrl(value) {
  let url = String(value || "").trim();
  if (!/^https:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function getContentPlatform(value) {
  try {
    const url = new URL(normalizeProfileUrl(value));
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (["youtube.com", "youtube-nocookie.com"].includes(host)) {
      return { key: "youtube", name: "YouTube", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ff334b" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.8V8.2l6.5 3.8-6.5 3.8Z"/></svg>' };
    }
    if (host === "twitch.tv") {
      return { key: "twitch", name: "Twitch", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#a970ff" d="M4 2 1.5 6v14h5v3h3l3-3h4l6-6V2H4Zm16 11-3.5 3.5H12l-3 3v-3H4V4h16v9Z"/><path fill="#a970ff" d="M15 6h2v6h-2zM10 6h2v6h-2z"/></svg>' };
    }
    if (host === "tiktok.com") {
      return { key: "tiktok", name: "TikTok", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M16.6 2c.3 2.5 1.7 4 4.4 4.2v3.2a9 9 0 0 1-4.4-1.3v7.2a6.7 6.7 0 1 1-6.7-6.7c.4 0 .8 0 1.2.1v3.5a3.3 3.3 0 1 0 2.2 3.1V2h3.3Z"/><path fill="#25f4ee" d="M15.2 2v10.1a6.7 6.7 0 0 1-1.9-1.2v6.2a3.3 3.3 0 0 1-5.8 2.1 3.3 3.3 0 0 0 5.9-2V2h1.8Z" opacity=".8"/><path fill="#fe2c55" d="M16.6 2c.3 2.5 1.7 4 4.4 4.2v1.8c-2.7-.2-4.1-1.7-4.4-4.2h-1.4V2h1.4Z" opacity=".9"/></svg>' };
    }
  } catch (_) {}
  return null;
}

function isCreatorProfileUrl(value, platformKey) {
  try {
    const url = new URL(normalizeProfileUrl(value));
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const parts = url.pathname.split("/").filter(Boolean);
    if (platformKey === "youtube") {
      return host === "youtube.com" && ((parts.length === 1 && /^@[A-Za-z0-9._-]{3,30}$/.test(parts[0])) || (parts.length === 2 && /^(channel|c|user)$/.test(parts[0]) && /^[A-Za-z0-9._-]{2,100}$/.test(parts[1])));
    }
    if (platformKey === "twitch") {
      const reservedTwitchPaths = new Set(["directory", "downloads", "jobs", "p", "settings", "subscriptions", "wallet", "inventory", "turbo", "search", "videos", "clips"]);
      return host === "twitch.tv" && parts.length === 1 && /^[A-Za-z0-9_]{3,25}$/.test(parts[0]) && !reservedTwitchPaths.has(parts[0].toLowerCase());
    }
    if (platformKey === "tiktok") return host === "tiktok.com" && parts.length === 1 && /^@[A-Za-z0-9._]{2,24}$/.test(parts[0]);
  } catch (_) {}
  return false;
}

function formatVisualName(username, roleLinks) {
  const originalName = escapeHtml(username || "Usuário");
  const roles = (roleLinks || [])
    .map(link => link?.visual_roles)
    .filter(Boolean);

  if (!roles.length) {
    return `<span style="color:#fff">${originalName}</span>`;
  }

  const primaryRole = roles[0];
  const primaryGradient = escapeHtml(primaryRole.gradient || "linear-gradient(135deg,#ff1535,#141414)");
  const animatedClass = primaryRole.animated ? " is-animated" : "";
  const coloredName = `<span class="visual-username${animatedClass}" style="--role-gradient:${primaryGradient}">${originalName}</span>`;
  return `<span>${coloredName}${roles.map(role => {
    const safeName = escapeHtml(role.name);
    const safeEmoji = escapeHtml(role.emoji || "").trim();
    const emojiText = safeEmoji ? ` ${safeEmoji}` : "";
    const gradient = escapeHtml(role.gradient || "linear-gradient(135deg,#ff1535,#141414)");
    return `<span class="visual-role${role.animated ? " is-animated" : ""}" style="--role-gradient:${gradient}"> (${safeName}${emojiText})</span>`;
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
.visual-username{display:inline-block;font-weight:900;background-image:var(--role-gradient);background-size:220% 220%;-webkit-background-clip:text;background-clip:text;color:transparent}
.visual-username.is-animated,.visual-role.is-animated{animation:visual-role-gradient-flow 4s ease-in-out infinite}
.visual-role{display:inline-flex;vertical-align:baseline;background-image:var(--role-gradient);background-size:220% 220%;-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800}
.account-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid #333}
.account-row .account-actions{margin:0;justify-content:flex-end;flex-wrap:wrap}
#adminUserSearch{background:#090909;border:1px solid #393939;border-radius:8px;padding:12px;color:white;font:inherit;margin:8px 0 14px}
@media(max-width:500px){.account-row{align-items:flex-start;flex-direction:column}.account-row .account-actions{justify-content:flex-start}}
@media(prefers-reduced-motion:reduce){.is-animated{animation:none!important}}
`;
document.head.appendChild(visualRoleStyle);

const customRoleStyle = document.createElement("style");
customRoleStyle.textContent = `
.custom-role-builder{background:linear-gradient(145deg,#191315,#101010);border:1px solid #493039;border-radius:12px;padding:16px;margin:4px 0 20px}
.custom-role-builder h3,.admin-subtitle{color:#f06a7e;margin-bottom:10px}
.custom-role-builder input[type="text"]{width:100%;margin:5px 0;background:#090909;border:1px solid #393939;border-radius:8px;padding:11px;color:white;font:inherit}
.role-color-pair{display:flex;gap:18px;flex-wrap:wrap}
.role-color-pair label{flex:1;min-width:120px}
.role-color-pair input[type="color"]{display:block;width:100%;height:42px;border:1px solid #555;border-radius:8px;background:#090909;padding:3px}
.role-animation-option{display:flex!important;align-items:center;gap:9px}
.role-animation-option input{width:auto!important;accent-color:#d51b35}
.role-preview{padding:13px;border:1px solid #444;border-radius:8px;text-align:center;font-weight:900;background-size:220% 220%;-webkit-background-clip:text;background-clip:text;color:transparent}
.role-preview.is-animated{animation:visual-role-gradient-flow 4s ease-in-out infinite}
.role-editor-actions,.admin-role-actions{display:flex;gap:8px;margin-top:12px}
.role-editor-actions button,.admin-role-actions button{padding:9px 12px;border-radius:7px;cursor:pointer}
.admin-tabs{display:flex;gap:8px;margin-bottom:18px;border-bottom:1px solid #333;padding-bottom:10px}
.admin-tab{flex:1;padding:11px;border:1px solid #444;border-radius:8px;background:#171717;color:#bbb;font-weight:bold}
.admin-tab.active{background:linear-gradient(135deg,#a9142b,#281014);border-color:#d51b35;color:white}
.admin-role-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #303030}
.admin-role-info{display:flex;flex-direction:column;gap:5px;min-width:0}
.admin-role-name{width:max-content;max-width:100%;background-size:220% 220%;-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900}
.admin-role-name.is-animated{animation:visual-role-gradient-flow 4s ease-in-out infinite}
.admin-role-info small,.admin-user-roles{color:#999;font-size:12px}
.admin-user-avatar{width:42px;height:42px;flex:0 0 42px;border-radius:50%;object-fit:cover;border:2px solid #d51b35}
.account-row-details{min-width:0;flex:1}
@media(max-width:500px){.admin-role-row{align-items:flex-start;flex-direction:column}.admin-role-actions{margin-top:0}}
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

const discordProfileStyle = document.createElement("style");
discordProfileStyle.textContent = `
#miniProfileModal .modal-box{max-width:470px;padding:0;overflow:hidden;background:#17191f;border:1px solid #353842}
#miniProfileModal .modal-heading{padding:18px 20px 0;margin-bottom:14px}
#miniProfileModal .modal-heading h2{color:#fff;font-size:18px}
.discord-profile-card{overflow:hidden;text-align:left;background:#20232b;border-radius:12px;margin:0 14px 14px;border:1px solid #353842}
.discord-profile-banner{height:126px;background:linear-gradient(125deg,#50101d,#17191f 60%,#3b111b);background-position:center;background-size:cover;background-color:#25202a}
.discord-profile-banner.has-banner{background-repeat:no-repeat}
.discord-profile-main{position:relative;padding:0 18px 20px}
.discord-profile-topline{display:flex;align-items:flex-end;gap:13px;margin-top:-62px;position:relative;z-index:2;min-height:100px}
.discord-profile-avatar{width:92px;height:92px;flex:0 0 92px;object-fit:cover;border-radius:50%;border:7px solid #20232b;background:#17191f;position:relative}
.discord-profile-identity{padding-bottom:5px;overflow-wrap:anywhere;min-width:0}
.discord-profile-identity h3{font-size:22px;color:#fff;margin:0 0 8px}
.discord-profile-roles{display:flex;flex-wrap:wrap;gap:7px;margin-top:0}
.discord-profile-role{display:inline-flex;align-items:center;padding:6px 10px;border-radius:7px;background-image:var(--role-gradient);background-size:220% 220%;color:#fff;font-size:12px;font-weight:800;box-shadow:inset 0 0 0 1px #ffffff22}
.discord-profile-role.is-animated{animation:visual-role-gradient-flow 4s ease-in-out infinite}
.discord-profile-divider{height:1px;background:#383b45;margin:16px 0}
.discord-profile-bio{color:#e0e2e8;font-size:14px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;min-height:22px}
.discord-profile-social{display:flex;align-items:center;gap:11px;margin-top:16px;padding:10px 12px;border:1px solid #3c404c;border-radius:9px;background:#191c23;color:#fff;text-decoration:none}
.social-logo{width:36px;height:36px;display:grid;place-items:center;border-radius:9px;background:#343844;color:#fff;flex:0 0 36px}.social-logo svg{width:21px;height:21px}
.social-instagram{background:linear-gradient(135deg,#7b35c8,#e1306c,#ff9a44)}.social-x{background:#050505}.social-youtube{background:#e62117}.social-twitch{background:#6841c8}.social-tiktok{background:#101014;box-shadow:inset 2px 0 #25f4ee,inset -2px 0 #fe2c55}.social-discord{background:#5865f2}.social-github{background:#34383f}
.discord-profile-social span:nth-child(2){display:flex;flex-direction:column;gap:2px;min-width:0}.discord-profile-social small{font-size:9px;letter-spacing:1px;color:#969cab}.discord-profile-social strong{font-size:13px}.social-external{margin-left:auto;color:#aeb3bf;font-size:18px}
.discord-profile-edit{display:block;margin:0 14px 16px;width:calc(100% - 28px)}
#profileLivePreview{margin:12px 0 18px;padding:12px;background:#101010;border:1px solid #393939;border-radius:10px}
#profileLivePreview .discord-profile-card{margin:0}
.discord-profile-export-actions{display:flex;gap:8px;margin:0 14px 12px}
.discord-profile-export-actions button{flex:1;border:1px solid #555;background:#292d37;color:#fff;border-radius:8px;padding:10px;cursor:pointer;font-weight:700}
.discord-profile-private,.discord-profile-private-note{text-align:center;padding:22px;color:#d8dbe4}.discord-profile-private-icon{font-size:32px}.discord-profile-private p{color:#aeb3bf;margin-top:8px}
@media(max-width:500px){#miniProfileModal .modal-box{max-width:100%;padding:0}.discord-profile-banner{height:112px}.discord-profile-topline{gap:9px}.discord-profile-avatar{width:82px;height:82px;flex-basis:82px}.discord-profile-identity h3{font-size:19px}}
`;
document.head.appendChild(discordProfileStyle);

const guildFeaturesStyle = document.createElement("style");
guildFeaturesStyle.textContent = `
.guild-description{min-height:42px;max-height:84px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
.description-more-btn{display:block;margin:8px auto 0;border:none;background:transparent;color:#d51b35;cursor:pointer;font-weight:bold;text-decoration:underline}
.guild-stats{display:flex;justify-content:center;align-items:center;gap:14px;margin-top:12px!important;color:#aaa!important}
.guild-like{border:none;background:transparent;color:#e21d3b;font-size:18px;font-weight:bold;cursor:pointer;padding:4px;transition:.18s transform,.18s color}
.guild-like:hover{transform:scale(1.18)}
.guild-like:active{transform:scale(.82)}
#showMore{background:#d51b35;color:white;border:none;padding:13px 22px;border-radius:8px;font-weight:bold;cursor:pointer}
.guild-content-links{display:flex;justify-content:center;flex-wrap:wrap;gap:7px;margin-top:8px}
.content-platform-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid #393939;border-radius:7px;background:#151515;color:#eee;text-decoration:none;font-size:12px;font-weight:bold}
.content-platform-btn svg{width:16px;height:16px;display:block;flex:0 0 16px}
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
