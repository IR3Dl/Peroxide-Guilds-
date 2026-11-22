# Configuração do Peroxide Guilds

## 1. Executar o banco

No Supabase, abra **SQL Editor**, cole o conteúdo de `supabase.sql` e execute.

O SQL cria:
- perfis vinculados à conta Supabase;
- publicações;
- papéis `supreme`, `admin` e `user`;
- bloqueio de usuários;
- bucket público `guild-images`;
- políticas RLS.

**Contas administrativas previstas:**
- `guilhermetrrs14@gmail.com`: Administrador Supremo;
- `mutanoegamer@gmail.com`: Administrador;

Apenas o Supremo pode promover usuários pela interface.

## 2. Ativar Google

No Google Cloud Console:
1. Crie um projeto OAuth.
2. Configure a tela de consentimento.
3. Crie uma credencial OAuth tipo Web.
4. Copie o Client ID e o Client Secret.

No Supabase:
1. Abra **Authentication → Providers → Google**.
2. Ative o provedor.
3. Cole o Client ID e o Client Secret.
4. Copie a Callback URL fornecida pelo Supabase.

No Google Cloud:
- Adicione essa Callback URL em **Authorized redirect URIs**.

Depois configure no Supabase **Authentication → URL Configuration**:
- `Site URL`: endereço onde o site será aberto;
- `Redirect URLs`: adicione `http://localhost:8000` e, depois, o endereço publicado.

## 3. Executar

```bash
cd /data/user/0/com.vscodroid/files/projects
python3 -m http.server 8000
```

Abra `http://localhost:8000`.

## Segurança

A chave Publishable já está no frontend por ser pública. Nunca coloque no projeto a Secret/Service Role key nem secrets OAuth.

## Cargos visuais personalizados

Execute no Supabase SQL Editor o arquivo `supabase-visual-roles.sql`.

Ele cria:
- Dev 🛠️ e Content Creator 🎬;
- tabela de cargos personalizados;
- relação entre usuários e cargos;
- funções protegidas para criar, atribuir e remover cargos;
- autorização exclusiva para `guilhermetrrs14@gmail.com` e `mutanoegamer@gmail.com`.

Cargos visuais são independentes de `profiles.role`; não concedem permissões administrativas nem podem ser alterados por usuários comuns.
