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

    if (isAdmin()) {
      const adminButton = document.createElement("button");
      adminButton.className = "mine-button dynamic-account-btn";
      adminButton.textContent = "Gerenciar contas";
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
  return profile?.role === "supreme" || session?.user?.email?.toLowerCase() === SUPREME_EMAIL;
}

function isAdmin() {
  const email = session?.user?.email?.toLowerCase();
  return isSupreme() || profile?.role === "admin" || email === ADMIN_EMAIL;
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
  event.preventDefault();
  const username = document.getElementById("publicUsername").value.trim();
  if (username.length < 3) return alert("Use pelo menos 3 caracteres.");

  const { error } = await sb.from("profiles").update({ username }).eq("id", session.user.id);
  if (error) return alert(error.message);
  closeModal("profileModal");
  await refreshSession();
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
    .select("*, profiles(username, role, blocked)")
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

  await sb.from("guilds").update({ like_count: guild.like_count }).eq("id", guild.id);
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

    const author = document.createElement("p");
    author.className = "author-label";
    author.textContent = "Publicado por " + (guild.profiles?.username || "Usuário");

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
    stats.innerHTML = `👁 ${guild.view_count || 0} &nbsp;&nbsp; `;

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
  if (!isAdmin()) return;

  const { data, error } = await sb
    .from("profiles")
    .select("id, username, role, blocked, created_at")
    .order("created_at", { ascending: false });

  const box = document.getElementById("accountsList");
  if (error) return box.textContent = error.message;
  box.innerHTML = "";

  (data || []).forEach(account => {
    const row = document.createElement("div");
    row.style.cssText = "border-bottom:1px solid #333;padding:12px 0";

    const name = document.createElement("strong");
    name.textContent = account.username || "Sem nome";
    const status = document.createElement("div");
    status.textContent = account.role === "supreme" ? "Administrador Supremo" :
      account.role === "admin" ? "Administrador" :
      account.blocked ? "Usuário · Bloqueado" : "Usuário · Ativo";

    row.append(name, status);

    if (isSupreme() && account.role !== "supreme") {
      const promote = document.createElement("button");
      promote.className = "cancel-btn";
      promote.style.cssText = "margin-top:10px;padding:8px;border-radius:7px";
      promote.textContent = account.role === "admin" ? "Remover administração" : "Tornar administrador";
      promote.onclick = async () => {
        const role = account.role === "admin" ? "user" : "admin";
        const { error } = await sb.from("profiles").update({ role }).eq("id", account.id);
        if (error) alert(error.message);
        else openAccounts();
      };

      const block = document.createElement("button");
      block.className = "cancel-btn";
      block.style.cssText = "margin:10px 0 0 8px;padding:8px;border-radius:7px";
      block.textContent = account.blocked ? "Desbloquear" : "Bloquear";
      block.onclick = async () => {
        const { error } = await sb.from("profiles").update({ blocked: !account.blocked }).eq("id", account.id);
        if (error) alert(error.message);
        else openAccounts();
      };

      row.append(promote, block);
    }

    box.appendChild(row);
  });

  document.getElementById("accountsModal").style.display = "flex";
}

const accountStyle = document.createElement("style");
accountStyle.textContent = `
.account-actions{display:flex;justify-content:center;gap:8px;margin-top:16px;flex-wrap:wrap}
.account-actions button{border:1px solid #555;background:#252525;color:white;border-radius:7px;padding:8px 10px;cursor:pointer}
.account-actions .delete-action{border-color:#d51b35;color:#ff6b7d}
.author-label{color:#777;font-size:12px;margin:-5px 0 10px}
.mine-button{background:transparent;border:1px solid #d51b35;color:white;border-radius:9px;padding:10px 14px;cursor:pointer;margin-right:8px}
`;
document.head.appendChild(accountStyle);

const guildMetricsStyle = document.createElement("style");
guildMetricsStyle.textContent = `
.guild-stats{margin-top:12px!important;color:#aaa!important}
.guild-like{border:none;background:transparent;color:#e21d3b;font-size:17px;font-weight:bold;cursor:pointer;padding:4px}
#showMore{background:#d51b35;color:white;border:none;padding:13px 22px;border-radius:8px;font-weight:bold;cursor:pointer}
`;
document.head.appendChild(guildMetricsStyle);

sb.auth.onAuthStateChange(() => refreshSession());
refreshSession();
