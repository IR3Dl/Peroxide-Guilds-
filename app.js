/* Peroxide Guilds - integração Supabase */
const SUPABASE_URL = "https://maujnpnpebizpfhmygea.supabase.com";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WPptMrzrVRGhX5y_8dcmLw_fDUz2U6X";
const SUPREME_EMAIL = "guilhermetrrs14@gmail.com";
const ADMIN_EMAIL = "mutanoegamer@gmail.com";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let guilds = [];
let currentPage = 1;
let selectedImage = null;
let editingId = null;
let session = null;
let profile = null;
let mineOnly = false;
let displayedCount = 10;
let likedGuildIds = new Set();
let selectedProfileImage = null;

const guildList = document.getElementById("guildList");

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "none";
}

function openLogin() {
  document.getElementById("loginModal").style.display = "flex";
}

function openProfile() {
  document.getElementById("profileModal").style.display = "flex";
  if (!profile) return;
  document.getElementById("publicUsername").value = profile.username || "";
  document.getElementById("publicBio").value = profile.bio || "";
  document.getElementById("profileImagePreview").src = profile.avatar_url || "profile-default.png";
  selectedProfileImage = null;
}

async function loginWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + location.pathname }
  });
  if (error) alert(error.message);
}

async function logout() {
  await sb.auth.signOut();
  mineOnly = false;
  await refreshSession();
}

async function refreshSession() {
  const { data } = await sb.auth.getSession();
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

    if (error) alert(error.message);
    profile = account;

    loginButton.textContent = "♙ Sair";
    loginButton.onclick = logout;

    const mineButton = document.createElement("button");
    mineButton.className = "mine-button dynamic-account-btn";
    mineButton.textContent = mineOnly ? "Todas as guildas" : "Minhas publicações";
    mineButton.onclick = toggleMine;
    titleActions.insertBefore(mineButton, titleActions.querySelector(".add-btn"));

    const profileButton = document.createElement("button");
    profileButton.className = "mine-button dynamic-account-btn";
    profileButton.textContent = "Meu perfil";
    profileButton.onclick = openProfile;
    titleActions.insertBefore(profileButton, titleActions.querySelector(".add-btn"));

    if (isAdmin()) {
      const adminButton = document.createElement("button");
      adminButton.className = "mine-button dynamic-account-btn";
      adminButton.textContent = "Painel Administrativo";
      adminButton.onclick = openAccounts;
      titleActions.insertBefore(adminButton, titleActions.querySelector(".add-btn"));
    }

    if (!profile?.username) openProfile();
  } else {
    loginButton.textContent = "♙ Entrar na conta";
    loginButton.onclick = openLogin;
  }

  await loadGuilds();
}

function isSupreme() {
  return session?.user?.email?.toLowerCase() === SUPREME_EMAIL;
}

function isAdmin() {
  const email = session?.user?.email?.toLowerCase();
  return email === SUPREME_EMAIL || email === ADMIN_EMAIL;
}

function isVisualRolesAdminSession() {
  return isAdmin();
}

function canManage(guild) {
  return isAdmin() || guild?.user_id === session?.user?.id;
}

async function openCreate() {
  if (!session) return openLogin();
  if (!profile?.username) return openProfile();
  if (profile.blocked) return alert("Sua conta está bloqueada.");

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
    if (selectedProfileImage) update.avatar_url = await uploadProfileImage(selectedProfileImage);

    const { error } = await sb.from("profiles").update(update).eq("id", session.user.id);
    if (error) throw error;

    closeModal("profileModal");
    selectedProfileImage = null;
    await refreshSession();
  } catch (error) {
    alert(error.message);
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
  if (!profile?.username) return openProfile();

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

async function loadGuilds() {
  let query = sb.from("guilds")
    .select("*, profiles(id, username, avatar_url, bio, role, blocked, user_visual_roles(role_id, visual_roles(slug, name, emoji, gradient)))")
    .order("view_count", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (mineOnly && session) query = query.eq("user_id", session.user.id);

  const { data, error } = await query;
  guilds = error ? [] : (data || []);

  likedGuildIds = new Set();
  if (session && guilds.length) {
    const { data: likes } = await sb
      .from("guild_likes")
      .select("guild_id")
      .eq("user_id", session.user.id);
    (likes || []).forEach(like => likedGuildIds.add(like.guild_id));
  }

  if (error) console.error(error);
  renderGuilds();
}

async function toggleMine() {
  if (!session) return openLogin();
  mineOnly = !mineOnly;
  displayedCount = 10;
  await loadGuilds();
}

async function deleteGuild(guild) {
  if (!canManage(guild)) return;
  if (!confirm("Excluir esta publicação?")) return;
  const { error } = await sb.from("guilds").delete().eq("id", guild.id);
  if (error) alert(error.message);
  else await loadGuilds();
}

async function registerGuildView(guild) {
  const viewedKey = `viewed:${guild.id}`;
  if (sessionStorage.getItem(viewedKey)) return;
  sessionStorage.setItem(viewedKey, "1");

  await sb.rpc("increment_guild_view", { guild_uuid: guild.id });
  guild.view_count = (guild.view_count || 0) + 1;
  renderGuilds();
}

async function toggleGuildLike(guild) {
  if (!session) return openLogin();

  const alreadyLiked = likedGuildIds.has(guild.id);
  if (alreadyLiked) {
    const { error } = await sb.from("guild_likes")
      .delete()
      .eq("guild_id", guild.id)
      .eq("user_id", session.user.id);
    if (!error) {
      likedGuildIds.delete(guild.id);
      guild.like_count = Math.max(0, (guild.like_count || 0) - 1);
    }
  } else {
    const { error } = await sb.from("guild_likes")
      .insert({ guild_id: guild.id, user_id: session.user.id });
    if (!error) {
      likedGuildIds.add(guild.id);
      guild.like_count = (guild.like_count || 0) + 1;
    } else {
      return alert(error.message);
    }
  }

  renderGuilds();
}

function showMoreGuilds() {
  displayedCount += 10;
  renderGuilds();
}

function renderGuilds() {
  guildList.innerHTML = "";
  const visibleGuilds = guilds.slice(0, displayedCount);

  if (guilds.length === 0) {
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

    const description = document.createElement("p");
    description.textContent = guild.description;

    const link = document.createElement("a");
    link.className = "discord-btn";
    link.href = guild.discord;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Discord";
    link.onclick = () => registerGuildView(guild);

    const stats = document.createElement("p");
    stats.className = "guild-stats";
    const viewCount = guild.view_count || 0;
    const fire = viewCount >= 1000 ? "🔥" : viewCount >= 100 ? "🔥" : viewCount >= 10 ? "♨" : "";
    stats.innerHTML = `👁 ${viewCount} ${fire} &nbsp;&nbsp; `;

    const likeButton = document.createElement("button");
    likeButton.type = "button";
    likeButton.className = "guild-like";
    likeButton.textContent = (likedGuildIds.has(guild.id) ? "♥ " : "♡ ") + (guild.like_count || 0);
    likeButton.onclick = () => toggleGuildLike(guild);

    stats.appendChild(likeButton);
    card.append(avatar, title, author, description, link, stats);

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

function changePage(direction) {
  const totalPages = Math.ceil(guilds.length / 10);
  currentPage = Math.max(1, Math.min(currentPage + direction, totalPages || 1));
  renderGuilds();
  window.scrollTo({ top: 400, behavior: "smooth" });
}

async function openAccounts() {
  if (!isVisualRolesAdminSession()) return;

  const box = document.getElementById("accountsList");
  box.innerHTML = `<input id="adminUserSearch" type="search" placeholder="Pesquisar nome ou e-mail..." style="width:100%;margin-bottom:14px"><div id="adminUserRows"></div>`;

  const { data, error } = await sb
    .from("profiles")
    .select("id, email, username, avatar_url, bio, role, blocked, created_at, user_visual_roles(role_id, visual_roles(id,slug,name,emoji,gradient))")
    .order("created_at", { ascending: false });

  if (error) {
    box.innerHTML = "Erro ao carregar usuários.";
    console.error(error);
    return;
  }

  const visualRoles = await sb.from("visual_roles").select("id,slug,name,emoji,gradient").order("name");
  const roles = visualRoles.data || [];
  const rows = document.getElementById("adminUserRows");

  function renderAdminUsers() {
    const term = document.getElementById("adminUserSearch")?.value.trim().toLowerCase() || "";
    rows.innerHTML = "";

    (data || []).filter(item =>
      (item.username || "").toLowerCase().includes(term) ||
      (item.email || "").toLowerCase().includes(term)
    ).forEach(item => {
      const row = document.createElement("div");
      row.className = "account-row";

      const avatar = document.createElement("img");
      avatar.src = item.avatar_url || "profile-default.png";
      avatar.alt = "Foto do usuário";
      avatar.style.cssText = "width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #d51b35";

      const info = document.createElement("div");
      info.style.cssText = "text-align:left;flex:1";

      const name = document.createElement("strong");
      name.innerHTML = formatVisualName(item.username || "Sem nome", item.user_visual_roles || []);

      const email = document.createElement("div");
      email.textContent = item.email || "E-mail não disponível";
      email.style.cssText = "color:#888;font-size:12px;margin-top:4px";

      const actions = document.createElement("div");
      actions.className = "account-actions";

      roles.forEach(role => {
        const assigned = (item.user_visual_roles || []).some(v => v.visual_roles?.slug === role.slug);
        const button = document.createElement("button");
        button.textContent = assigned ? `Remover ${role.emoji}` : `Adicionar ${role.emoji}`;
        button.onclick = async () => {
          const fn = assigned ? "remove_visual_role" : "assign_visual_role";
          const { error } = await sb.rpc(fn, { target_profile: item.id, target_role: role.slug });
          if (error) alert(error.message);
          else openAccounts();
        };
        actions.appendChild(button);
      });

      const blockButton = document.createElement("button");
      blockButton.textContent = item.blocked ? "Desbloquear" : "Bloquear";
      blockButton.onclick = async () => {
        if (!confirm(item.blocked ? "Desbloquear usuário?" : "Bloquear usuário?")) return;
        const { error } = await sb.from("profiles").update({ blocked: !item.blocked }).eq("id", item.id);
        if (error) alert(error.message);
        else openAccounts();
      };
      actions.appendChild(blockButton);

      info.append(name, email);
      row.append(avatar, info, actions);
      rows.appendChild(row);
    });
  }

  document.getElementById("adminUserSearch").addEventListener("input", renderAdminUsers);
  renderAdminUsers();
  document.getElementById("accountsModal").style.display = "flex";
}

document.getElementById("closeAccounts").onclick = () => closeModal("accountsModal");

document.getElementById("closeLogin").onclick = () => closeModal("loginModal");

document.getElementById("closeProfile").onclick = () => closeModal("profileModal");

document.getElementById("closeCreate").onclick = () => closeModal("createModal");

document.getElementById("closeGuilds").onclick = () => closeModal("guildsModal");

document.getElementById("closeMiniProfile").onclick = () => closeModal("miniProfileModal");

document.getElementById("openLogin").onclick = openLogin;

document.getElementById("openProfile").onclick = openProfile;

document.getElementById("openCreate").onclick = openCreate;

document.getElementById("toggleMine").onclick = toggleMine;

document.getElementById("logoutButton").onclick = logout;

sb.auth.onAuthStateChange(async (event, session) => {
  await refreshSession();
});

loadGuilds();

function openMiniProfile(publicProfile) {
  const box = document.getElementById("miniProfileContent");
  const avatar = publicProfile?.avatar_url || "profile-default.png";
  const name = publicProfile?.username || "Usuário";
  const bio = publicProfile?.bio || "Nenhuma descrição definida.";

  box.innerHTML = `
    <img src="${escapeHtml(avatar)}" alt="Foto de perfil" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid #d51b35;margin-bottom:14px">
    <h3 style="margin-bottom:10px">${formatVisualName(name, publicProfile?.user_visual_roles || [])}</h3>
    <p style="color:#bbb;line-height:1.5;white-space:pre-wrap">${escapeHtml(bio)}</p>
  `;

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
    const safeEmoji = escapeHtml(role.emoji);
    const slug = escapeHtml(role.slug || "custom");
    const gradient = escapeHtml(role.gradient || "linear-gradient(135deg,#ff1535,#141414)");
    return `<span class="visual-role visual-role-${slug}" style="--role-gradient:${gradient}"> (${safeName} ${safeEmoji})</span>`;
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
.visual-username{display:inline-block;font-weight:bold;background:linear-gradient(135deg,#fff 0%,#ddd 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.visual-username:after{content:"";display:block;height:2px;margin-top:3px;border-radius:2px;background:linear-gradient(135deg,#ff1535,#ff78c5,#fff);opacity:.9}
.visual-role{display:inline;background:var(--role-gradient);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}
.visual-role-dev{-webkit-text-stroke:.15px rgba(255,255,255,.18)}
.account-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid #333}
.account-row .account-actions{margin:0;justify-content:flex-end;flex-wrap:wrap}
#adminUserSearch{background:#090909;border:1px solid #393939;border-radius:8px;padding:12px;color:white;font:inherit}
@media(max-width:500px){.account-row{align-items:flex-start;flex-direction:column}.account-row .account-actions{justify-content:flex-start}}
`;
document.head.appendChild(visualRoleStyle);
